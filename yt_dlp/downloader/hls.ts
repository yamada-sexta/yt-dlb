// Source: yt_dlp/downloader/hls.py
// Port note: this implements plain/AES-128 media-segment HLS with byte ranges. Live-refresh HLS throws explicitly.

import { NotImplementedError } from "../errors.ts";
import { aesCbcDecryptBytes, unpadPkcs7 } from "../aes.ts";
import { HTTPHeaderDict } from "../utils/networking.ts";
import { FragmentFD, type FragmentInfo } from "./fragment.ts";
import type { DownloadInfo } from "./common.ts";

export class HlsFD extends FragmentFD {
  static hasDrm(manifest: string): boolean {
    return /#EXT-X-(?:SESSION-)?KEY:.*?(?:URI="skd:\/\/|KEYFORMAT="com\.(?:apple\.streamingkeydelivery|microsoft\.playready)")|#EXT-X-FAXS-CM:/i.test(manifest);
  }

  static canDownload(manifest: string, allowUnplayableFormats = false): boolean {
    if (!allowUnplayableFormats && this.hasDrm(manifest)) {
      return false;
    }
    return !/#EXT-X-KEY:METHOD=(?!(?:NONE|AES-128)\b)/.test(manifest)
      && /#EXT-X-ENDLIST/m.test(manifest);
  }

  override async realDownload(filename: string, info: DownloadInfo): Promise<boolean> {
    const manifestUrl = info.url;
    const manifest = typeof info.hls_media_playlist_data === "string"
      ? info.hls_media_playlist_data
      : await (await this.ydl.urlopen(manifestUrl)).text();

    if (!HlsFD.canDownload(manifest, Boolean(this.params.allow_unplayable_formats))) {
      if (HlsFD.hasDrm(manifest)) {
        throw new NotImplementedError("DRM protected HLS");
      }
      if (/#EXT-X-KEY:METHOD=(?!(?:NONE|AES-128)\b)/.test(manifest)) {
        throw new NotImplementedError("non-AES-128 encrypted HLS segments");
      }
      if (!/#EXT-X-ENDLIST/m.test(manifest)) {
        throw new NotImplementedError("live HLS");
      }
      throw new NotImplementedError("unsupported HLS manifest");
    }

    const fragments: FragmentInfo[] = [];
    let adFragment = false;
    let decryptInfo: HlsDecryptInfo = { method: "NONE" };
    let mediaSequence = 0;
    let byteRange: { length: number; offset: number } | null = null;
    let nextByteRangeOffset = 0;
    for (const rawLine of manifest.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      if (line.startsWith("#")) {
        if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
          mediaSequence = Number(line.slice("#EXT-X-MEDIA-SEQUENCE:".length)) || 0;
        }
        if (line.startsWith("#EXT-X-BYTERANGE:")) {
          const parsed = parseByteRange(line.slice("#EXT-X-BYTERANGE:".length), nextByteRangeOffset);
          byteRange = parsed;
          nextByteRangeOffset = parsed.offset + parsed.length;
        }
        if (line.startsWith("#EXT-X-KEY:")) {
          decryptInfo = await this.parseDecryptInfo(line.slice("#EXT-X-KEY:".length), manifestUrl);
        }
        if ((line.startsWith("#ANVATO-SEGMENT-INFO") && line.includes("type=ad")) || (line.startsWith("#UPLYNK-SEGMENT") && line.endsWith(",ad"))) {
          adFragment = true;
        } else if ((line.startsWith("#ANVATO-SEGMENT-INFO") && line.includes("type=master")) || (line.startsWith("#UPLYNK-SEGMENT") && line.endsWith(",segment"))) {
          adFragment = false;
        }
        continue;
      }
      if (!adFragment) {
        const sequence = mediaSequence;
        const transformData = decryptInfo.method === "AES-128"
          ? aes128Transform(decryptInfo.key, decryptInfo.iv ?? sequenceIv(sequence))
          : undefined;
        fragments.push({
          frag_index: fragments.length + 1,
          url: new URL(line, manifestUrl).toString(),
          http_headers: byteRange ? rangeHeaders(info.http_headers, byteRange) : undefined,
          transformData,
        });
      }
      mediaSequence += 1;
      byteRange = null;
    }
    if (!fragments.length) {
      throw new Error("HLS manifest has no media fragments");
    }
    this.toScreen("[hlsnative] Total fragments: " + fragments.length);
    return await this.downloadFragments(filename, info, fragments);
  }

  private async parseDecryptInfo(rawAttributes: string, manifestUrl: string): Promise<HlsDecryptInfo> {
    const attributes = parseM3u8Attributes(rawAttributes);
    const method = attributes.METHOD ?? "NONE";
    if (method === "NONE") {
      return { method: "NONE" };
    }
    if (method !== "AES-128") {
      throw new NotImplementedError(`HLS encryption method ${method}`);
    }
    const uri = attributes.URI;
    if (!uri) {
      throw new Error("HLS AES-128 key is missing URI");
    }
    const key = new Uint8Array(await (await this.ydl.urlopen(new URL(uri, manifestUrl).toString())).arrayBuffer());
    if (![16, 24, 32].includes(key.byteLength)) {
      throw new Error(`Invalid HLS AES key length: ${key.byteLength}`);
    }
    return {
      method,
      key,
      iv: attributes.IV ? hexToBytes(attributes.IV.replace(/^0x/i, "").padStart(32, "0")) : undefined,
    };
  }
}

function rangeHeaders(headers: Record<string, string> | undefined, byteRange: { length: number; offset: number }): Record<string, string> {
  const out = new HTTPHeaderDict(headers);
  out.set("Range", `bytes=${byteRange.offset}-${byteRange.offset + byteRange.length - 1}`);
  return out.sensitive();
}

function parseByteRange(value: string, nextOffset: number): { length: number; offset: number } {
  const match = /^(?<length>\d+)(?:@(?<offset>\d+))?$/.exec(value.trim());
  if (!match?.groups) {
    throw new Error(`Invalid HLS byte range: ${value}`);
  }
  const length = Number(match.groups.length);
  const offset = match.groups.offset ? Number(match.groups.offset) : nextOffset;
  if (!Number.isSafeInteger(length) || !Number.isSafeInteger(offset)) {
    throw new Error(`Invalid HLS byte range: ${value}`);
  }
  return { length, offset };
}

export const can_download = HlsFD.canDownload;

type HlsDecryptInfo = {
  method: "NONE";
} | {
  method: "AES-128";
  key: Uint8Array;
  iv?: Uint8Array;
};

function parseM3u8Attributes(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const pattern = /(?<key>[A-Z0-9-]+)=(?:"(?<quoted>[^"]*)"|(?<bare>[^,]*))/g;
  for (const match of text.matchAll(pattern)) {
    const key = match.groups?.key;
    if (key) {
      out[key] = match.groups?.quoted ?? match.groups?.bare ?? "";
    }
  }
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2) {
    throw new Error("Invalid hex string");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

function sequenceIv(sequence: number): Uint8Array {
  const out = new Uint8Array(16);
  new DataView(out.buffer).setUint32(12, sequence);
  return out;
}

function aes128Transform(key: Uint8Array, iv: Uint8Array): (data: Uint8Array) => Uint8Array {
  return (data) => unpadPkcs7(aesCbcDecryptBytes(data, key, iv));
}
