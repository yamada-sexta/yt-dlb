// Source: yt_dlp/extractor/bostonglobe.py

import { extractAttributes } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

export class BostonGlobeIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`(?i)https?://(?:www\.)?bostonglobe\.com/.*/(?<id>[^/]+)/\w+(?:\.html)?`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const pageId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, pageId);
    if (webpage === false) {
      throw new Error("Unable to download BostonGlobe webpage");
    }

    const entries: string[] = [];
    for (const match of webpage.matchAll(/<video[^>]+>/gi)) {
      const attrs = extractAttributes(match[0]);
      const videoId = attrs["data-brightcove-video-id"];
      const accountId = attrs["data-account"];
      const playerId = attrs["data-player"];
      const embed = attrs["data-embed"];
      if (videoId && accountId && playerId && embed) {
        entries.push(`http://players.brightcove.net/${accountId}/${playerId}_${embed}/index.html?videoId=${videoId}`);
      }
    }

    if (!entries.length) {
      return this.urlResult(url, "Generic");
    }
    if (entries.length === 1) {
      return this.urlResult(entries[0]!, "BrightcoveNew");
    }
    return this.playlistResult(
      entries.map((entry) => this.urlResult(entry, "BrightcoveNew")),
      pageId,
      this.ogSearchTitle(webpage),
    );
  }
}
