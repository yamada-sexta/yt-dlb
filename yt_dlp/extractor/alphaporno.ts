// Source: yt_dlp/extractor/alphaporno.py

import { ExtractorError, intOrNone, parseDuration, parseFilesize, parseIso8601 } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

export class AlphaPornoIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?alphaporno\.com/videos/(?<id>[^/]+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const displayId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, displayId);
    if (webpage === false) {
      throw new ExtractorError("Unable to download webpage", { videoId: displayId });
    }

    const videoId = this.searchRegex(/video_id\s*:\s*'([^']+)'/, webpage, "video id", { defaultValue: null });
    const videoUrl = this.searchRegex(/video_url\s*:\s*'([^']+)'/, webpage, "video url");
    if (typeof videoUrl !== "string") {
      throw new ExtractorError("Unable to extract video URL", { videoId: displayId });
    }

    const extMeta = this.htmlSearchMeta("encodingFormat", webpage, "ext") ?? ".mp4";
    const title = this.searchRegex(
      [/<meta content="([^"]+)" itemprop="description">/, /class="title" itemprop="name">([^<]+)</],
      webpage,
      "title",
    );
    const keywords = this.htmlSearchMeta("keywords", webpage, "categories") ?? "";

    return {
      id: typeof videoId === "string" ? videoId : undefined,
      display_id: displayId,
      url: videoUrl,
      ext: extMeta.startsWith(".") ? extMeta.slice(1) : extMeta,
      title: typeof title === "string" ? title : undefined,
      thumbnail: this.htmlSearchMeta("thumbnail", webpage, "thumbnail"),
      timestamp: parseIso8601(this.htmlSearchMeta("uploadDate", webpage, "upload date")),
      duration: parseDuration(this.htmlSearchMeta("duration", webpage, "duration")),
      filesize_approx: parseFilesize(this.htmlSearchMeta("contentSize", webpage, "file size")),
      tbr: intOrNone(this.htmlSearchMeta("bitrate", webpage, "bitrate")),
      categories: keywords ? keywords.split(",") : [],
      age_limit: this.rtaSearch(webpage),
    };
  }
}
