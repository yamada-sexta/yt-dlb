// Source: yt_dlp/extractor/aeonco.py

import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import { ExtractorError, urlOrNone, smuggleUrl } from "../utils/index.ts";

export class AeonCoIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?aeon\.co/videos/(?<id>[^/?]+)`;

  static override get IE_NAME(): string {
    return "aeonco";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new ExtractorError("Unable to download webpage");
    }

    let embedUrl: string | null = null;
    for (const ld of this.yieldJsonLd(webpage, videoId)) {
      if (ld["@type"] === "VideoObject" && typeof ld.embedUrl === "string") {
        embedUrl = urlOrNone(ld.embedUrl);
        if (embedUrl) {
          break;
        }
      }
    }

    if (!embedUrl) {
      throw new ExtractorError("No embed URL found in webpage");
    }

    if (embedUrl.includes("player.vimeo.com")) {
      embedUrl = smuggleUrl(embedUrl, { referer: "https://aeon.co/" });
    }

    return this.urlResult(embedUrl);
  }
}
