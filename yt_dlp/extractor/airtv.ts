// Source: yt_dlp/extractor/airtv.py

import {
  determineExt,
  intOrNone,
  mimetype2ext,
  parseIso8601,
} from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import { YoutubeIE } from "./youtube/video.ts";

interface AirTvSource {
  src?: string;
  type?: string;
}

interface AirTvVideo {
  youtube_id?: string;
  sources?: AirTvSource[];
  sources_desktop?: AirTvSource[];
  title?: string;
  description?: string;
  duration?: unknown;
  default_thumbnails?: string[];
  channel?: { channel_slug?: string };
  created?: string;
  published?: string;
  views?: unknown;
}

interface AirTvNextData {
  props?: {
    pageProps?: {
      initialState?: {
        videos?: Record<string, AirTvVideo>;
      };
    };
  };
}

export class AirTVIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://www\.air\.tv/watch\?v=(?<id>\w+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const displayId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, displayId);
    if (webpage === false) {
      throw new Error("Unable to download AirTV page");
    }
    const nextjsJson = this.searchNextjsData<AirTvNextData>(webpage, displayId)
      ?.props?.pageProps?.initialState?.videos?.[displayId];
    if (!nextjsJson) {
      throw new Error("Unable to extract AirTV Next.js video data");
    }
    if (nextjsJson.youtube_id) {
      return this.urlResult(
        `https://www.youtube.com/watch?v=${nextjsJson.youtube_id}`,
        YoutubeIE,
      );
    }

    const [formats, subtitles] = await this.getFormatsAndSubtitles(
      nextjsJson,
      displayId,
    );
    return {
      id: displayId,
      title:
        nextjsJson.title ??
        this.htmlSearchMeta("og:title", webpage) ??
        undefined,
      formats,
      subtitles,
      description: nextjsJson.description || undefined,
      duration: intOrNone(nextjsJson.duration) ?? undefined,
      thumbnails: (nextjsJson.default_thumbnails ?? []).map((thumbnail) => ({
        url: thumbnail,
      })),
      channel_id: nextjsJson.channel?.channel_slug,
      timestamp: parseIso8601(nextjsJson.created) ?? undefined,
      release_timestamp: parseIso8601(nextjsJson.published) ?? undefined,
      view_count: intOrNone(nextjsJson.views) ?? undefined,
    };
  }

  private async getFormatsAndSubtitles(
    jsonData: AirTvVideo,
    videoId: string,
  ): Promise<[Array<Record<string, unknown>>, Record<string, unknown[]>]> {
    const formats: Array<Record<string, unknown>> = [];
    let subtitles: Record<string, unknown[]> = {};
    for (const source of [
      ...(jsonData.sources ?? []),
      ...(jsonData.sources_desktop ?? []),
    ]) {
      if (!source.src) {
        continue;
      }
      const ext = determineExt(source.src, mimetype2ext(source.type));
      if (ext === "m3u8") {
        const [m3u8Formats, m3u8Subtitles] =
          await this.extractM3u8FormatsAndSubtitles(source.src, videoId);
        formats.push(...m3u8Formats);
        subtitles = { ...subtitles, ...m3u8Subtitles };
      } else {
        formats.push({ url: source.src, ext });
      }
    }
    return [formats, subtitles];
  }
}
