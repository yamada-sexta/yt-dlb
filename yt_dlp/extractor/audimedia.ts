// Source: yt_dlp/extractor/audimedia.py

import { intOrNone, parseIso8601 } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface AudiVideoVersion {
  download_url?: string;
  stream_url?: string;
  width?: unknown;
  height?: unknown;
  audio_bitrate?: unknown;
  video_bitrate?: unknown;
}

interface AudiVideoData {
  title?: string;
  subtitle?: string;
  thumbnail_image?: { file?: string };
  publication_date?: string;
  duration?: unknown;
  view_count?: unknown;
  stream_url_hls?: string;
  stream_url_hds?: string;
  video_versions?: AudiVideoVersion[];
}

interface AudiVideoResponse {
  results?: AudiVideoData;
}

export class AudiMediaIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?audi-mediacenter\.com/(?:en|de)/audimediatv/(?:video/)?(?<id>[^/?#]+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const displayId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, displayId);
    if (webpage === false) {
      throw new Error("Unable to download Audi MediaCenter page");
    }
    const rawPayload = this.searchRegex([
      /class="amtv-embed"[^>]+id="([0-9a-z-]+)"/,
      /id="([0-9a-z-]+)"[^>]+class="amtv-embed"/,
      /class=\\"amtv-embed\\"[^>]+id=\\"([0-9a-z-]+)\\"/,
      /id=\\"([0-9a-z-]+)\\"[^>]+class=\\"amtv-embed\\"/,
      /id=(?:\\)?"(amtve-[a-z]-\d+-[a-z]{2})/,
    ], webpage, "raw payload");
    if (typeof rawPayload !== "string") {
      throw new Error("Unable to extract Audi MediaCenter embed payload");
    }
    const [, stageMode, videoId] = rawPayload.split("-");
    if (!videoId) {
      throw new Error("Unable to extract Audi MediaCenter video id");
    }
    if (stageMode === "s" || stageMode === "e") {
      throw new Error("Audi MediaCenter live stream stages are not implemented");
    }

    const response = await this.downloadJson<AudiVideoResponse>(
      `https://www.audimedia.tv/api/video/v1/videos/${videoId}`,
      videoId,
      { query: { "embed[]": ["video_versions", "thumbnail_image"] } },
    );
    const videoData = response !== false ? response.results : null;
    if (!videoData) {
      throw new Error("Unable to download Audi MediaCenter video metadata");
    }

    const formats: Array<Record<string, unknown>> = [];
    if (videoData.stream_url_hls) {
      formats.push(...this.extractM3u8Formats(videoData.stream_url_hls, videoId, "mp4", { entryProtocol: "m3u8_native", m3u8Id: "hls" }));
    }
    if (videoData.stream_url_hds) {
      formats.push(...this.extractF4mFormats(`${videoData.stream_url_hds}?hdcore=3.4.0`, videoId, { f4mId: "hds", fatal: false }));
    }
    for (const version of videoData.video_versions ?? []) {
      const versionUrl = version.download_url ?? version.stream_url;
      if (!versionUrl) {
        continue;
      }
      const bitrate = this.searchRegex(/(\d+)k/, versionUrl, "bitrate", { defaultValue: null });
      formats.push({
        url: versionUrl,
        width: intOrNone(version.width) ?? undefined,
        height: intOrNone(version.height) ?? undefined,
        abr: intOrNone(version.audio_bitrate) ?? undefined,
        vbr: intOrNone(version.video_bitrate) ?? undefined,
        format_id: typeof bitrate === "string" ? `http-${bitrate}` : undefined,
      });
    }

    return {
      id: videoId,
      title: videoData.title,
      description: videoData.subtitle,
      thumbnail: videoData.thumbnail_image?.file,
      timestamp: parseIso8601(videoData.publication_date) ?? undefined,
      duration: intOrNone(videoData.duration) ?? undefined,
      view_count: intOrNone(videoData.view_count) ?? undefined,
      formats,
    };
  }
}
