// Source: yt_dlp/downloader/__init__.py

import { NotImplementedError } from "../errors.ts";
import { BunnyCdnFD } from "./bunnycdn.ts";
import {
  FileDownloader,
  type DownloadInfo,
  type DownloaderHost,
} from "./common.ts";
import { DashSegmentsFD } from "./dash.ts";
import { FFmpegFD, getExternalDownloader } from "./external.ts";
import { F4mFD } from "./f4m.ts";
import { FC2LiveFD } from "./fc2.ts";
import { HlsFD } from "./hls.ts";
import { HttpFD } from "./http.ts";
import { IsmFD } from "./ism.ts";
import { MhtmlFD } from "./mhtml.ts";
import { NiconicoLiveFD } from "./niconico.ts";
import { RtmpFD } from "./rtmp.ts";
import { RtspFD } from "./rtsp.ts";
import { SoopVodFD } from "./soop.ts";
import { WebSocketFragmentFD } from "./websocket.ts";
import { YoutubeLiveChatFD } from "./youtube-live-chat.ts";

export { FileDownloader } from "./common.ts";
export { DashSegmentsFD } from "./dash.ts";
export { FFmpegFD, getExternalDownloader, listExternalDownloaders } from "./external.ts";
export { FragmentFD } from "./fragment.ts";
export { HlsFD } from "./hls.ts";
export { HttpFD } from "./http.ts";

export type DownloaderConstructor = new (
  ydl: DownloaderHost,
  params?: Record<string, unknown>,
) => FileDownloader;

export const PROTOCOL_MAP: Record<string, DownloaderConstructor> = {
  http: HttpFD,
  https: HttpFD,
  ftp: HttpFD,
  ftps: HttpFD,
  rtmp: RtmpFD,
  rtmpe: RtmpFD,
  rtmp_ffmpeg: FFmpegFD,
  m3u8_native: HlsFD,
  m3u8: FFmpegFD,
  mms: RtspFD,
  rtsp: RtspFD,
  f4m: F4mFD,
  http_dash_segments: DashSegmentsFD,
  http_dash_segments_generator: DashSegmentsFD,
  ism: IsmFD,
  mhtml: MhtmlFD,
  niconico_live: NiconicoLiveFD,
  fc2_live: FC2LiveFD,
  websocket_frag: WebSocketFragmentFD,
  youtube_live_chat: YoutubeLiveChatFD,
  youtube_live_chat_replay: YoutubeLiveChatFD,
  bunnycdn: BunnyCdnFD,
  soopvod: SoopVodFD,
};

export function getSuitableDownloader(
  info: DownloadInfo,
  params: Record<string, unknown> = {},
  defaultDownloader: DownloaderConstructor | null = HttpFD,
  protocol?: string,
  toStdout = false,
): DownloaderConstructor {
  const normalizedInfo = { ...info, protocol: determineProtocol(info), to_stdout: toStdout };
  const protocols = (protocol ?? normalizedInfo.protocol).split("+");
  const downloaders = protocols.map((item) => getSuitableDownloaderForProtocol(normalizedInfo, item, params, defaultDownloader));

  if (downloaders.every((downloader) => downloader === FFmpegFD) && FFmpegFD.canMergeFormats(normalizedInfo, params)) {
    return FFmpegFD;
  }
  if (
    downloaders.every((downloader) => downloader === DashSegmentsFD)
    && !(toStdout && protocols.length > 1)
    && new Set(protocols).size === 1
    && protocols[0] === "http_dash_segments_generator"
  ) {
    return DashSegmentsFD;
  }
  const unique = new Set(downloaders);
  if (unique.size === 1) {
    const downloader = downloaders[0];
    if (downloader) {
      return downloader;
    }
  }
  throw new NotImplementedError(`merged downloader for protocols ${protocols.join("+")}`);
}

export function shortenProtocolName(proto: string, simplify = false): string {
  const names: Record<string, string> = {
    m3u8_native: "m3u8",
    m3u8: "m3u8F",
    rtmp_ffmpeg: "rtmpF",
    http_dash_segments: "dash",
    http_dash_segments_generator: "dashG",
    websocket_frag: "WSfrag",
  };
  if (simplify) {
    Object.assign(names, {
      https: "http",
      ftps: "ftp",
      m3u8: "m3u8",
      m3u8_native: "m3u8",
      http_dash_segments_generator: "dash",
      rtmp_ffmpeg: "rtmp",
      m3u8_frag_urls: "m3u8",
      dash_frag_urls: "dash",
    });
  }
  return names[proto] ?? proto;
}

export function determineProtocol(info: DownloadInfo): string {
  if (typeof info.protocol === "string") {
    return info.protocol;
  }
  const protocol = new URL(info.url).protocol.replace(/:$/, "");
  return protocol || "http";
}

export const get_suitable_downloader = getSuitableDownloader;
export const shorten_protocol_name = shortenProtocolName;

function getSuitableDownloaderForProtocol(
  info: DownloadInfo,
  protocol: string,
  params: Record<string, unknown>,
  defaultDownloader: DownloaderConstructor | null,
): DownloaderConstructor | null {
  if ((info.section_start || info.section_end) && FFmpegFD.canDownload(info)) {
    return FFmpegFD;
  }

  const protocolInfo: DownloadInfo = { ...info, protocol };
  const externalDownloader = externalDownloaderForProtocol(params.external_downloader, protocol);
  if (externalDownloader === null) {
    if (protocolInfo.to_stdout && FFmpegFD.canMergeFormats(protocolInfo, params)) {
      return FFmpegFD;
    }
  } else if (externalDownloader.toLowerCase() !== "native" && protocolInfo.impersonate == null) {
    const ExternalDownloader = getExternalDownloader(externalDownloader);
    if (ExternalDownloader?.canDownload?.(protocolInfo, externalDownloader)) {
      return ExternalDownloader;
    }
  }

  if (protocol === "http_dash_segments" && protocolInfo.is_live && externalDownloader?.toLowerCase() !== "native") {
    return FFmpegFD;
  }

  if (protocol === "m3u8" || protocol === "m3u8_native") {
    if (protocolInfo.is_live) {
      return FFmpegFD;
    }
    if (externalDownloader?.toLowerCase() === "native") {
      return HlsFD;
    }
    if (protocol === "m3u8_native" && getSuitableDownloaderForProtocol(protocolInfo, "m3u8_frag_urls", params, null)) {
      return HlsFD;
    }
    if (params.hls_prefer_native === true) {
      return HlsFD;
    }
    if (params.hls_prefer_native === false) {
      return FFmpegFD;
    }
  }

  return PROTOCOL_MAP[protocol] ?? defaultDownloader;
}

function externalDownloaderForProtocol(value: unknown, protocol: string): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const protocolKey = shortenProtocolName(protocol, true);
  const selected = record[protocolKey] ?? record.default;
  return typeof selected === "string" ? selected : null;
}
