// Source: yt_dlp/extractor/behindkink.py

import { ExtractorError, urlBasename } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

export class BehindKinkIE extends InfoExtractor {
  static override readonly _WORKING = false;
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?behindkink\.com/(?<year>[0-9]{4})/(?<month>[0-9]{2})/(?<day>[0-9]{2})/(?<id>[^/#?_]+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const displayId = match?.groups?.id;
    if (!displayId || !match.groups) {
      throw new ExtractorError("Unable to extract display id");
    }
    const webpage = await this.downloadWebpage(url, displayId);
    if (webpage === false) {
      throw new ExtractorError("Unable to download webpage", {
        videoId: displayId,
      });
    }

    const videoUrl = this.searchRegex(
      /<source src="([^"]+)"/,
      webpage,
      "video URL",
    );
    if (typeof videoUrl !== "string") {
      throw new ExtractorError("Unable to extract video URL", {
        videoId: displayId,
      });
    }
    const videoId = urlBasename(videoUrl).split("_")[0] ?? displayId;

    return {
      id: videoId,
      display_id: displayId,
      url: videoUrl,
      title: this.ogSearchTitle(webpage) ?? undefined,
      thumbnail: this.ogSearchThumbnail(webpage) ?? undefined,
      description: this.ogSearchDescription(webpage) ?? undefined,
      upload_date: `${match.groups.year}${match.groups.month}${match.groups.day}`,
      age_limit: 18,
    };
  }
}
