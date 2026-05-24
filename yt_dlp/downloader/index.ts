// Source: yt_dlp/downloader/__init__.py

import { NotImplementedError } from "../errors.ts";
import { BunnyCdnFD } from "./bunnycdn.ts";
import { FileDownloader, type DownloadInfo, type DownloaderHost } from "./common.ts";
import { DashSegmentsFD } from "./dash.ts";
import { FFmpegFD } from "./external.ts";
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
export { FFmpegFD, getExternalDownloader } from "./external.ts";
export { FragmentFD } from "./fragment.ts";
export { HlsFD } from "./hls.ts";
export { HttpFD } from "./http.ts";

export type DownloaderConstructor = new (ydl: DownloaderHost, params?: Record<string, unknown>) => FileDownloader;

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
  _params: Record<string, unknown> = {},
  defaultDownloader: DownloaderConstructor = HttpFD,
  protocol?: string,
): DownloaderConstructor {
  const protocols = (protocol ?? info.protocol ?? determineProtocol(info)).split("+");
  if (protocols.length > 1) {
    // Logic change: merged multi-protocol downloads require FFmpeg/postprocessor layers that are not migrated yet.
    throw new NotImplementedError(`merged downloader for protocols ${protocols.join("+")}`);
  }
  return PROTOCOL_MAP[protocols[0] ?? ""] ?? defaultDownloader;
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
