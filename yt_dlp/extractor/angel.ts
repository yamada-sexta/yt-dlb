// Source: yt_dlp/extractor/angel.py

import { mergeDicts, urlOrNone } from "../utils/index.ts";
import { ExtractorError } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

export class AngelIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?angel\.com/watch/(?<series>[^/?#]+)/episode/(?<id>[\w-]+)/season-(?<season_number>\d+)/episode-(?<episode_number>\d+)/(?<title>[^/?#]+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new ExtractorError("Unable to download webpage", { videoId });
    }
    const jsonLd = this.searchJsonLd(webpage, videoId);
    const hlsUrl = typeof jsonLd.url === "string" ? jsonLd.url : null;
    if (!hlsUrl) {
      throw new ExtractorError("Unable to extract HLS URL", { videoId });
    }

    const [formats, subtitles] = await this.extractM3u8FormatsAndSubtitles(
      hlsUrl,
      videoId,
      "mp4",
      { m3u8Id: "hls" },
    );

    const info: Record<string, unknown> = {
      id: videoId,
      title: this.ogSearchTitle(webpage),
      description: this.ogSearchDescription(webpage),
      formats,
      subtitles,
    };

    const rawThumbnail =
      urlOrNone(this.ogSearchThumbnail(webpage)) ??
      (typeof jsonLd.thumbnail === "string" ? jsonLd.thumbnail : null) ??
      (Array.isArray(jsonLd.thumbnail) &&
      typeof jsonLd.thumbnail[0] === "string"
        ? jsonLd.thumbnail[0]
        : null) ??
      (typeof jsonLd.thumbnails === "string" ? jsonLd.thumbnails : null);
    if (rawThumbnail) {
      // Angel uses Cloudinary transformations; strip them to match yt-dlp's source-image behavior.
      info.thumbnail = rawThumbnail.replace(
        /(\/upload)\/.+(\/angel-app\/.+)$/u,
        "$1$2",
      );
    }

    return mergeDicts(info, jsonLd) as ExtractorInfo;
  }
}
