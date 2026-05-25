// Source: yt_dlp/extractor/breitbart.py

import { ExtractorError } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

export class BreitBartIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?breitbart\.com/videos/v/(?<id>[^/?#]+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new ExtractorError("Unable to download webpage", { videoId });
    }

    const formats = this.extractM3u8Formats(
      `https://cdn.jwplayer.com/manifests/${videoId}.m3u8`,
      videoId,
      "mp4",
    );
    return {
      id: videoId,
      title:
        this.ogSearchTitle(webpage) ??
        this.htmlExtractTitle(webpage) ??
        videoId,
      description: this.ogSearchDescription(webpage) ?? undefined,
      thumbnail: this.ogSearchThumbnail(webpage) ?? undefined,
      age_limit: this.rtaSearch(webpage),
      formats,
    };
  }
}
