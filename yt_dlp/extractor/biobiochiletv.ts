// Source: yt_dlp/extractor/biobiochiletv.py

import { ExtractorError, removeEnd } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

export class BioBioChileTVIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?:tv|www)\.biobiochile\.cl/(?:notas|noticias)/(?:[^/]+/)+(?<id>[^/]+)\.shtml`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new ExtractorError("Unable to download webpage", { videoId });
    }

    const rudoUrl = this.searchRegex(
      /<iframe[^>]+src=(?<q1>['"])(?<url>(?:https?:)?\/\/rudo\.video\/vod\/[0-9a-zA-Z]+)\k<q1>/,
      webpage,
      "embed URL",
      { group: "url", fatal: false },
    );
    if (typeof rudoUrl !== "string") {
      throw new ExtractorError("No videos found", { expected: true, videoId });
    }

    const uploader = this.htmlSearchRegex(
      /<a[^>]+href=["'](?:https?:\/\/(?:busca|www)\.biobiochile\.cl)?\/(?:lista\/)?(?:author|autor)[^>]+>(.+?)<\/a>/,
      webpage,
      "uploader",
      { fatal: false },
    );

    return {
      _type: "url_transparent",
      url: rudoUrl,
      id: videoId,
      title: removeEnd(this.ogSearchTitle(webpage), " - BioBioChile TV") ?? undefined,
      thumbnail: this.ogSearchThumbnail(webpage) ?? undefined,
      uploader: typeof uploader === "string" ? uploader : undefined,
    };
  }
}
