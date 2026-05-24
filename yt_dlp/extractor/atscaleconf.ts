// Source: yt_dlp/extractor/atscaleconf.py

import { InfoExtractor, type ExtractorInfo } from "./common.ts";

export class AtScaleConfEventIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?atscaleconference\.com/events/(?<id>[^/&$?]+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const playlistId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, playlistId);
    if (webpage === false) {
      throw new Error("Unable to download AtScale event page");
    }
    const matches = [...webpage.matchAll(/data-url\s*=\s*"(https?:\/\/(?:www\.)?atscaleconference\.com\/videos\/[^"]+)"/g)]
      .map((match) => match[1] ?? "");
    return this.playlistFromMatches(matches, {
      ie: "Generic",
      playlistId,
      playlistTitle: this.ogSearchTitle(webpage),
      description: this.ogSearchDescription(webpage),
    });
  }
}
