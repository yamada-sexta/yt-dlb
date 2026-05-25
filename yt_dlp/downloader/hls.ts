// Source: yt_dlp/downloader/hls.py
// Port note: this implements plain/AES-128 media-segment HLS with byte ranges and Bun async live refresh.

import { NotImplementedError } from "../errors.ts";
import { aesCbcDecryptBytes, unpadPkcs7 } from "../aes.ts";
import { HTTPHeaderDict } from "../utils/networking.ts";
import { parseM3u8Attributes, updateUrlQuery } from "../utils/utils.ts";
import {
  CueBlock,
  type CueJson,
  HeaderBlock,
  Magic,
  parseFragment,
} from "../webvtt.ts";
import { FragmentFD, type FragmentInfo } from "./fragment.ts";
import { getExternalFragmentDownloader } from "./external.ts";
import type { DownloadInfo } from "./common.ts";

export class HlsFD extends FragmentFD {
  static hasDrm(manifest: string): boolean {
    return /#EXT-X-(?:SESSION-)?KEY:.*?(?:URI="skd:\/\/|KEYFORMAT="com\.(?:apple\.streamingkeydelivery|microsoft\.playready)")|#EXT-X-FAXS-CM:/i.test(
      manifest,
    );
  }

  static canDownload(
    manifest: string,
    allowUnplayableFormats = false,
  ): boolean {
    if (!allowUnplayableFormats && HlsFD.hasDrm(manifest)) {
      return false;
    }
    return !/#EXT-X-KEY:METHOD=(?!(?:NONE|AES-128)\b)/.test(manifest);
  }

  override async realDownload(
    filename: string,
    info: DownloadInfo,
  ): Promise<boolean> {
    const manifestUrl = info.url;
    const manifest =
      typeof info.hls_media_playlist_data === "string"
        ? info.hls_media_playlist_data
        : await (await this.ydl.urlopen(manifestUrl)).text();

    if (
      !HlsFD.canDownload(
        manifest,
        Boolean(this.params.allow_unplayable_formats),
      )
    ) {
      if (HlsFD.hasDrm(manifest)) {
        throw new NotImplementedError("DRM protected HLS");
      }
      if (/#EXT-X-KEY:METHOD=(?!(?:NONE|AES-128)\b)/.test(manifest)) {
        throw new NotImplementedError("non-AES-128 encrypted HLS segments");
      }
      throw new NotImplementedError("unsupported HLS manifest");
    }

    const isWebvtt = info.ext === "vtt";
    const webvttPacker = isWebvtt
      ? makeWebvttPacker((message) => this.ydl.reportWarning?.(message))
      : {};
    const parsed = await this.parseManifest(manifest, manifestUrl, info);
    if (!parsed.fragments.length) {
      throw new Error("HLS manifest has no media fragments");
    }
    if (!parsed.endList) {
      // Logic change: Python delegates live HLS to ffmpeg; ytdlb can refresh playlists with Bun async iteration.
      this.toScreen("[hlsnative] Total fragments: unknown (live)");
      return await this.downloadFragments(
        filename,
        { ...info, is_live: true },
        this.liveFragments(manifestUrl, info, parsed),
        webvttPacker,
      );
    }
    this.toScreen("[hlsnative] Total fragments: " + parsed.fragments.length);
    const external = isWebvtt
      ? null
      : getExternalFragmentDownloader(
          this.params,
          "m3u8",
          {
            ...info,
            protocol: "m3u8_frag_urls",
            fragments: parsed.fragments,
          },
          manifest,
        );
    if (external) {
      this.toScreen(
        `[hlsnative] Fragment downloads will be delegated to ${external.name.replace(/FD$/, "").toLowerCase()}`,
      );
      return await new external(this.ydl, this.params).download(filename, {
        ...info,
        protocol: "m3u8_frag_urls",
        fragments: parsed.fragments,
      });
    }
    return await this.downloadFragments(
      filename,
      info,
      parsed.fragments,
      webvttPacker,
    );
  }

  private async parseManifest(
    manifest: string,
    manifestUrl: string,
    info: DownloadInfo,
  ): Promise<ParsedHlsManifest> {
    const fragments: FragmentInfo[] = [];
    let adFragment = false;
    let decryptInfo: HlsDecryptInfo = { method: "NONE" };
    let mediaSequence = 0;
    let targetDuration = 5;
    let byteRange: { length: number; offset: number } | null = null;
    let nextByteRangeOffset = 0;
    let discontinuityCount = 0;
    const formatIndex =
      typeof info.format_index === "number" ? info.format_index : null;
    const extraSegmentQuery =
      typeof info.extra_param_to_segment_url === "string"
        ? new URLSearchParams(info.extra_param_to_segment_url)
        : null;
    const extraKeyQuery =
      typeof info.extra_param_to_key_url === "string"
        ? new URLSearchParams(info.extra_param_to_key_url)
        : extraSegmentQuery;
    const externalAes = parseExternalAes(info.hls_aes);
    for (const rawLine of manifest.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      if (line.startsWith("#")) {
        if (line.startsWith("#EXT-X-MAP:")) {
          if (formatIndex !== null && discontinuityCount !== formatIndex) {
            continue;
          }
          if (fragments.length > 0) {
            throw new Error(
              "Initialization fragment found after media fragments, unable to download",
            );
          }
          const mapInfo = parseM3u8Attributes(line.slice("#EXT-X-MAP:".length));
          const uri = mapInfo.URI;
          if (!uri) {
            throw new Error("HLS initialization fragment is missing URI");
          }
          fragments.push({
            frag_index: fragments.length + 1,
            url: buildUrl(uri, manifestUrl, extraSegmentQuery),
            http_headers: mapInfo.BYTERANGE
              ? rangeHeaders(
                  info.http_headers,
                  parseByteRange(mapInfo.BYTERANGE, 0),
                )
              : undefined,
            media_sequence: mediaSequence,
          });
          mediaSequence += 1;
        }
        if (line.startsWith("#EXT-X-TARGETDURATION:")) {
          targetDuration =
            Number(line.slice("#EXT-X-TARGETDURATION:".length)) ||
            targetDuration;
        }
        if (line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
          mediaSequence =
            Number(line.slice("#EXT-X-MEDIA-SEQUENCE:".length)) || 0;
        }
        if (line.startsWith("#EXT-X-BYTERANGE:")) {
          const parsed = parseByteRange(
            line.slice("#EXT-X-BYTERANGE:".length),
            nextByteRangeOffset,
          );
          byteRange = parsed;
          nextByteRangeOffset = parsed.offset + parsed.length;
        }
        if (line.startsWith("#EXT-X-KEY:")) {
          decryptInfo = await this.parseDecryptInfo(
            line.slice("#EXT-X-KEY:".length),
            manifestUrl,
            extraKeyQuery,
            externalAes,
          );
        }
        if (
          (line.startsWith("#ANVATO-SEGMENT-INFO") &&
            line.includes("type=ad")) ||
          (line.startsWith("#UPLYNK-SEGMENT") && line.endsWith(",ad"))
        ) {
          adFragment = true;
        } else if (
          (line.startsWith("#ANVATO-SEGMENT-INFO") &&
            line.includes("type=master")) ||
          (line.startsWith("#UPLYNK-SEGMENT") && line.endsWith(",segment"))
        ) {
          adFragment = false;
        }
        if (line.startsWith("#EXT-X-DISCONTINUITY")) {
          discontinuityCount += 1;
        }
        continue;
      }
      if (
        !adFragment &&
        (formatIndex === null || discontinuityCount === formatIndex)
      ) {
        const sequence = mediaSequence;
        const transformData =
          decryptInfo.method === "AES-128"
            ? aes128Transform(
                decryptInfo.key,
                decryptInfo.iv ?? sequenceIv(sequence),
              )
            : undefined;
        fragments.push({
          frag_index: fragments.length + 1,
          url: buildUrl(line, manifestUrl, extraSegmentQuery),
          http_headers: byteRange
            ? rangeHeaders(info.http_headers, byteRange)
            : undefined,
          media_sequence: sequence,
          transformData,
        });
      }
      mediaSequence += 1;
      byteRange = null;
    }
    return {
      fragments,
      endList: /#EXT-X-ENDLIST/m.test(manifest),
      targetDuration,
    };
  }

  private async *liveFragments(
    manifestUrl: string,
    info: DownloadInfo,
    initial: ParsedHlsManifest,
  ): AsyncIterable<FragmentInfo> {
    const seen = new Set<string>();
    let parsed = initial;
    while (true) {
      let yielded = false;
      for (const fragment of parsed.fragments) {
        const key = `${fragment.media_sequence ?? ""}:${fragment.url ?? ""}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        yielded = true;
        yield fragment;
      }
      if (parsed.endList || this.params.test) {
        return;
      }
      await Bun.sleep(Math.max(1, parsed.targetDuration) * 1000);
      const nextManifest = await (await this.ydl.urlopen(manifestUrl)).text();
      parsed = await this.parseManifest(nextManifest, manifestUrl, info);
      if (!yielded && !parsed.fragments.length) {
        await Bun.sleep(Math.max(1, parsed.targetDuration) * 1000);
      }
    }
  }

  private async parseDecryptInfo(
    rawAttributes: string,
    manifestUrl: string,
    extraKeyQuery: URLSearchParams | null,
    externalAes: ExternalAesInfo,
  ): Promise<HlsDecryptInfo> {
    const attributes = parseM3u8Attributes(rawAttributes);
    const method = attributes.METHOD ?? "NONE";
    if (method === "NONE") {
      return { method: "NONE" };
    }
    if (method !== "AES-128") {
      throw new NotImplementedError(`HLS encryption method ${method}`);
    }
    const uri = attributes.URI;
    const key =
      externalAes.key ??
      (uri
        ? new Uint8Array(
            await (
              await this.ydl.urlopen(buildUrl(uri, manifestUrl, extraKeyQuery))
            ).arrayBuffer(),
          )
        : null);
    if (!key) {
      throw new Error("HLS AES-128 key is missing URI");
    }
    if (![16, 24, 32].includes(key.byteLength)) {
      throw new Error(`Invalid HLS AES key length: ${key.byteLength}`);
    }
    return {
      method,
      key,
      iv:
        externalAes.iv ??
        (attributes.IV
          ? hexToBytes(attributes.IV.replace(/^0x/i, "").padStart(32, "0"))
          : undefined),
    };
  }
}

interface ExternalAesInfo {
  key?: Uint8Array;
  iv?: Uint8Array;
}

interface ParsedHlsManifest {
  fragments: FragmentInfo[];
  endList: boolean;
  targetDuration: number;
}

function rangeHeaders(
  headers: Record<string, string> | undefined,
  byteRange: { length: number; offset: number },
): Record<string, string> {
  const out = new HTTPHeaderDict(headers);
  out.set(
    "Range",
    `bytes=${byteRange.offset}-${byteRange.offset + byteRange.length - 1}`,
  );
  return out.sensitive();
}

function parseByteRange(
  value: string,
  nextOffset: number,
): { length: number; offset: number } {
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

type HlsDecryptInfo =
  | {
      method: "NONE";
    }
  | {
      method: "AES-128";
      key: Uint8Array;
      iv?: Uint8Array;
    };

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

function buildUrl(
  path: string,
  base: string,
  extraQuery: URLSearchParams | null,
): string {
  const url = new URL(path, base).toString();
  return extraQuery ? updateUrlQuery(url, queryToRecord(extraQuery)) : url;
}

function queryToRecord(extraQuery: URLSearchParams): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, value] of extraQuery) {
    let values = out[key];
    if (!values) {
      values = [];
      out[key] = values;
    }
    values.push(value);
  }
  return out;
}

function parseExternalAes(value: unknown): ExternalAesInfo {
  if (!value || typeof value !== "object") {
    return {};
  }
  const record = value as Record<string, unknown>;
  return {
    key:
      typeof record.key === "string"
        ? hexToBytes(record.key.replace(/^0x/i, ""))
        : undefined,
    iv:
      typeof record.iv === "string"
        ? hexToBytes(record.iv.replace(/^0x/i, "").padStart(32, "0"))
        : undefined,
  };
}

function sequenceIv(sequence: number): Uint8Array {
  const out = new Uint8Array(16);
  new DataView(out.buffer).setUint32(12, sequence);
  return out;
}

function aes128Transform(
  key: Uint8Array,
  iv: Uint8Array,
): (data: Uint8Array) => Uint8Array {
  return (data) => unpadPkcs7(aesCbcDecryptBytes(data, key, iv));
}

interface WebvttPackerState {
  mpegtsLast?: number;
  mpegtsAdjust: number;
  mpegts?: number;
  local?: number;
  dedupWindow: CueJson[];
}

function makeWebvttPacker(reportWarning: (message: string) => void): {
  packFunc: (content: Uint8Array, index: number) => Uint8Array;
  finishFunc: () => Uint8Array;
} {
  const state: WebvttPackerState = {
    mpegtsAdjust: 0,
    dedupWindow: [],
  };
  const encoder = new TextEncoder();
  return {
    packFunc(content, index) {
      return encoder.encode(
        packWebvttFragment(content, index, state, reportWarning),
      );
    },
    finishFunc() {
      return encoder.encode(flushWebvttDedupWindow(state));
    },
  };
}

function packWebvttFragment(
  content: Uint8Array,
  fragmentIndex: number,
  state: WebvttPackerState,
  reportWarning: (message: string) => void,
): string {
  const output = new StringBlockWriter();
  let adjust = 0;
  let overflow = false;
  let mpegtsLast: number | undefined;
  for (const block of parseFragment(content)) {
    if (block instanceof CueBlock) {
      state.mpegtsLast = mpegtsLast;
      if (overflow) {
        state.mpegtsAdjust += 1;
        overflow = false;
      }
      const cue = new CueBlock(
        block.id,
        block.start + adjust,
        block.end + adjust,
        block.settings,
        block.text,
      );
      const ready: CueBlock[] = [];
      let isNew = true;
      for (let index = 0; index < state.dedupWindow.length; ) {
        const windowEntry = state.dedupWindow[index];
        if (!windowEntry) {
          index += 1;
          continue;
        }
        const windowCue = CueBlock.fromJson(windowEntry);
        if (windowCue.hinges(cue)) {
          state.dedupWindow[index] = { ...windowEntry, end: cue.end };
          isNew = false;
          index += 1;
          continue;
        }
        if (windowCue.equals(cue)) {
          isNew = false;
          index += 1;
          continue;
        }
        if (windowCue.end > cue.start) {
          index += 1;
          continue;
        }
        ready.push(windowCue);
        state.dedupWindow.splice(index, 1);
      }
      if (isNew) {
        state.dedupWindow.push(cue.asJson);
      }
      for (const readyCue of ready) {
        readyCue.writeInto(output);
      }
      continue;
    }
    if (block instanceof Magic) {
      let mpegts = (block.mpegts ?? 0) + state.mpegtsAdjust * 2 ** 33;
      if (mpegts < (state.mpegtsLast ?? 0)) {
        overflow = true;
        mpegts += 2 ** 33;
      }
      mpegtsLast = mpegts;
      if (fragmentIndex === 1) {
        state.mpegts = mpegts;
        state.local = block.local ?? 0;
      } else if (block.mpegts !== undefined && block.local !== undefined) {
        adjust =
          mpegts - (state.mpegts ?? 0) - (block.local - (state.local ?? 0));
      }
      if (fragmentIndex !== 1) {
        continue;
      }
    } else if (block instanceof HeaderBlock && fragmentIndex !== 1) {
      reportWarning(
        `Discarding a ${block.constructor.name} block found in the middle of the stream; subtitles may display incorrectly`,
      );
      continue;
    }
    block.writeInto(output);
  }
  return output.toString();
}

function flushWebvttDedupWindow(state: WebvttPackerState): string {
  if (!state.dedupWindow.length) {
    return "";
  }
  const output = new StringBlockWriter();
  for (const cue of state.dedupWindow) {
    CueBlock.fromJson(cue).writeInto(output);
  }
  state.dedupWindow = [];
  return output.toString();
}

class StringBlockWriter {
  #parts: string[] = [];

  write(text: string): void {
    this.#parts.push(text);
  }

  toString(): string {
    return this.#parts.join("");
  }
}
