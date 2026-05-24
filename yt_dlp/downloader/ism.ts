// Source: yt_dlp/downloader/ism.py
// Port note: PIFF header construction is implemented as pure byte builders; fragment IO uses FragmentFD.

import { FragmentFD, type FragmentInfo } from "./fragment.ts";
import type { DownloadInfo } from "./common.ts";

interface IsmDownloadParams {
  track_id?: number;
  fourcc: string;
  duration: number;
  timescale?: number;
  language?: string;
  height?: number;
  width?: number;
  stream_type: "audio" | "video" | "text";
  channels?: number;
  bits_per_sample?: number;
  sampling_rate?: number;
  codec_private_data?: string;
  nal_unit_length_field?: number;
}

export class IsmFD extends FragmentFD {
  override async realDownload(filename: string, info: DownloadInfo): Promise<boolean> {
    if (!Array.isArray(info.fragments)) {
      throw new Error("ISM format has no fragments");
    }
    const params = parseDownloadParams(info._download_params);
    let trackWritten = false;
    const fragments = (this.params.test ? info.fragments.slice(0, 1) : info.fragments).map((fragment, index): FragmentInfo => {
      const item = fragment as { url?: string; fragment_count?: number };
      if (!item.url) {
        throw new Error(`ISM fragment ${index + 1} has no URL`);
      }
      return {
        frag_index: index + 1,
        fragment_count: item.fragment_count,
        url: item.url,
        transformData: (data) => {
          if (trackWritten) {
            return data;
          }
          const tfhd = extractBoxData(data, ["moof", "traf", "tfhd"]);
          params.track_id = readUint32(tfhd, 4);
          trackWritten = true;
          return concatBytes([writePiffHeader(params), data]);
        },
      };
    });
    this.toScreen("[ism] Total fragments: " + fragments.length);
    return await this.downloadFragments(filename, info, fragments);
  }
}

function parseDownloadParams(value: unknown): IsmDownloadParams {
  if (!value || typeof value !== "object") {
    throw new Error("ISM download params are missing");
  }
  const data = value as Record<string, unknown>;
  if (typeof data.fourcc !== "string" || typeof data.duration !== "number" || typeof data.stream_type !== "string") {
    throw new Error("ISM download params are invalid");
  }
  if (!isStreamType(data.stream_type)) {
    throw new Error(`Unsupported ISM stream type: ${data.stream_type}`);
  }
  return {
    track_id: typeof data.track_id === "number" ? data.track_id : undefined,
    fourcc: data.fourcc,
    duration: data.duration,
    timescale: typeof data.timescale === "number" ? data.timescale : undefined,
    language: typeof data.language === "string" ? data.language : undefined,
    height: typeof data.height === "number" ? data.height : undefined,
    width: typeof data.width === "number" ? data.width : undefined,
    stream_type: data.stream_type,
    channels: typeof data.channels === "number" ? data.channels : undefined,
    bits_per_sample: typeof data.bits_per_sample === "number" ? data.bits_per_sample : undefined,
    sampling_rate: typeof data.sampling_rate === "number" ? data.sampling_rate : undefined,
    codec_private_data: typeof data.codec_private_data === "string" ? data.codec_private_data : undefined,
    nal_unit_length_field: typeof data.nal_unit_length_field === "number" ? data.nal_unit_length_field : undefined,
  };
}

function isStreamType(value: string): value is IsmDownloadParams["stream_type"] {
  return value === "audio" || value === "video" || value === "text";
}

function writePiffHeader(params: IsmDownloadParams): Uint8Array {
  const trackId = params.track_id;
  if (!trackId) {
    throw new Error("ISM track id is missing");
  }
  const fourcc = params.fourcc;
  const duration = params.duration;
  const timescale = params.timescale ?? 10_000_000;
  const language = (params.language ?? "und").slice(0, 3).padEnd(3, "d");
  const height = params.height ?? 0;
  const width = params.width ?? 0;
  const streamType = params.stream_type;
  const creationTime = Math.trunc(Date.now() / 1000);

  const ftyp = box("ftyp", concatBytes([
    ascii("isml"),
    u32(1),
    ascii("piff"),
    ascii("iso2"),
  ]));

  const mvhd = fullBox("mvhd", 1, 0, concatBytes([
    u64(creationTime),
    u64(creationTime),
    u32(timescale),
    u64(duration),
    s1616(1),
    s88(1),
    u16(0),
    u32(0),
    u32(0),
    unityMatrix(),
    u32(0),
    u32(0),
    u32(0),
    u32(0),
    u32(0),
    u32(0),
    u32(0xffffffff),
  ]));

  const tkhd = fullBox("tkhd", 1, 0x1 | 0x2 | 0x4, concatBytes([
    u64(creationTime),
    u64(creationTime),
    u32(trackId),
    u32(0),
    u64(duration),
    u32(0),
    u32(0),
    s16(0),
    s16(0),
    s88(streamType === "audio" ? 1 : 0),
    u16(0),
    unityMatrix(),
    u1616(width),
    u1616(height),
  ]));

  const mdhd = fullBox("mdhd", 1, 0, concatBytes([
    u64(creationTime),
    u64(creationTime),
    u32(timescale),
    u64(duration),
    u16(languageCode(language)),
    u16(0),
  ]));

  const hdlr = fullBox("hdlr", 0, 0, concatBytes([
    u32(0),
    ascii(streamType === "audio" ? "soun" : streamType === "video" ? "vide" : "subt"),
    u32(0),
    u32(0),
    u32(0),
    cString(streamType === "audio" ? "SoundHandler" : streamType === "video" ? "VideoHandler" : "SubtitleHandler"),
  ]));

  const mediaHeader = streamType === "audio"
    ? fullBox("smhd", 0, 0, concatBytes([s88(0), u16(0)]))
    : streamType === "video"
      ? fullBox("vmhd", 0, 1, concatBytes([u16(0), u16(0), u16(0), u16(0)]))
      : fullBox("sthd", 0, 0, new Uint8Array());

  const dinf = box("dinf", fullBox("dref", 0, 0, concatBytes([
    u32(1),
    fullBox("url ", 0, 0x1, new Uint8Array()),
  ])));

  const stbl = box("stbl", concatBytes([
    fullBox("stsd", 0, 0, concatBytes([u32(1), sampleEntry(params)])),
    fullBox("stts", 0, 0, u32(0)),
    fullBox("stsc", 0, 0, u32(0)),
    fullBox("stco", 0, 0, u32(0)),
  ]));

  const minf = box("minf", concatBytes([mediaHeader, dinf, stbl]));
  const mdia = box("mdia", concatBytes([mdhd, hdlr, minf]));
  const trak = box("trak", concatBytes([tkhd, mdia]));

  const mvex = box("mvex", concatBytes([
    fullBox("mehd", 1, 0, u64(duration)),
    fullBox("trex", 0, 0, concatBytes([u32(trackId), u32(1), u32(0), u32(0), u32(0)])),
  ]));

  return concatBytes([ftyp, box("moov", concatBytes([mvhd, trak, mvex]))]);
}

function sampleEntry(params: IsmDownloadParams): Uint8Array {
  const base = concatBytes([bytes(6), u16(1)]);
  if (params.stream_type === "audio") {
    const audioPayload = concatBytes([
      base,
      u32(0),
      u32(0),
      u16(params.channels ?? 2),
      u16(params.bits_per_sample ?? 16),
      u16(0),
      u16(0),
      u1616(requiredNumber(params.sampling_rate, "sampling_rate")),
    ]);
    if (params.fourcc === "AACL") {
      return box("mp4a", audioPayload);
    }
    if (params.fourcc === "EC-3") {
      return box("ec-3", audioPayload);
    }
    throw new Error(`Unsupported ISM audio fourcc: ${params.fourcc}`);
  }
  if (params.stream_type === "video") {
    const codecPrivateData = hexToBytes(requiredString(params.codec_private_data, "codec_private_data"));
    if (params.fourcc !== "H264" && params.fourcc !== "AVC1") {
      throw new Error(`Unsupported ISM video fourcc: ${params.fourcc}`);
    }
    const parts = splitByStartCode(codecPrivateData);
    if (parts.length < 2) {
      throw new Error("Invalid AVC codec private data");
    }
    const [sps, pps] = parts;
    const avcc = box("avcC", concatBytes([
      u8(1),
      sps!.slice(1, 4),
      u8(0xfc | ((params.nal_unit_length_field ?? 4) - 1)),
      u8(1),
      u16(sps!.byteLength),
      sps!,
      u8(1),
      u16(pps!.byteLength),
      pps!,
    ]));
    return box("avc1", concatBytes([
      base,
      u16(0),
      u16(0),
      u32(0),
      u32(0),
      u32(0),
      u16(params.width ?? 0),
      u16(params.height ?? 0),
      u1616(0x48),
      u1616(0x48),
      u32(0),
      u16(1),
      bytes(32),
      u16(0x18),
      s16(-1),
      avcc,
    ]));
  }
  if (params.stream_type === "text") {
    if (params.fourcc !== "TTML") {
      throw new Error(`Unsupported ISM text fourcc: ${params.fourcc}`);
    }
    return box("stpp", concatBytes([
      base,
      cString("http://www.w3.org/ns/ttml"),
      u8(0),
      u8(0),
    ]));
  }
  throw new Error(`Unsupported ISM stream type: ${params.stream_type}`);
}

function extractBoxData(data: Uint8Array, boxSequence: readonly string[]): Uint8Array {
  let offset = 0;
  while (offset + 8 <= data.byteLength) {
    const size = readUint32(data, offset);
    const type = new TextDecoder().decode(data.slice(offset + 4, offset + 8));
    if (size < 8 || offset + size > data.byteLength) {
      throw new Error("Invalid ISM fragment box");
    }
    const payload = data.slice(offset + 8, offset + size);
    if (type === boxSequence[0]) {
      return boxSequence.length === 1 ? payload : extractBoxData(payload, boxSequence.slice(1));
    }
    offset += size;
  }
  throw new Error(`Could not find ISM box ${boxSequence.join("/")}`);
}

function box(type: string, payload: Uint8Array): Uint8Array {
  return concatBytes([u32(8 + payload.byteLength), ascii(type), payload]);
}

function fullBox(type: string, version: number, flags: number, payload: Uint8Array): Uint8Array {
  return box(type, concatBytes([u8(version), uint24(flags), payload]));
}

function unityMatrix(): Uint8Array {
  return concatBytes([s32(0x10000), s32(0), s32(0), s32(0), s32(0x10000), s32(0), s32(0), s32(0), s32(0x40000000)]);
}

function languageCode(language: string): number {
  return ((language.charCodeAt(0) - 0x60) << 10) | ((language.charCodeAt(1) - 0x60) << 5) | (language.charCodeAt(2) - 0x60);
}

function splitByStartCode(data: Uint8Array): Uint8Array[] {
  const parts: Uint8Array[] = [];
  let start = -1;
  for (let index = 0; index <= data.byteLength - 4; index += 1) {
    if (readUint32(data, index) !== 1) {
      continue;
    }
    if (start !== -1) {
      parts.push(data.slice(start, index));
    }
    start = index + 4;
  }
  if (start !== -1) {
    parts.push(data.slice(start));
  }
  return parts;
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

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function ascii(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function cString(text: string): Uint8Array {
  return concatBytes([ascii(text), u8(0)]);
}

function bytes(length: number): Uint8Array {
  return new Uint8Array(length);
}

function u8(value: number): Uint8Array {
  return new Uint8Array([value & 0xff]);
}

function u16(value: number): Uint8Array {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setUint16(0, value);
  return out;
}

function uint24(value: number): Uint8Array {
  return u32(value).slice(1);
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value);
  return out;
}

function u64(value: number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value));
  return out;
}

function s16(value: number): Uint8Array {
  const out = new Uint8Array(2);
  new DataView(out.buffer).setInt16(0, value);
  return out;
}

function s32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setInt32(0, value);
  return out;
}

function s88(value: number): Uint8Array {
  return concatBytes([new Uint8Array([value & 0xff]), u8(0)]);
}

function s1616(value: number): Uint8Array {
  return concatBytes([s16(value), u16(0)]);
}

function u1616(value: number): Uint8Array {
  return concatBytes([u16(value), u16(0)]);
}

function readUint32(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset);
}

function requiredNumber(value: number | undefined, name: string): number {
  if (typeof value !== "number") {
    throw new Error(`ISM ${name} is missing`);
  }
  return value;
}

function requiredString(value: string | undefined, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`ISM ${name} is missing`);
  }
  return value;
}
