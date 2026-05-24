// Source: yt_dlp/extractor/bfi.py

import { extractAttributes } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

export class BFIPlayerIE extends InfoExtractor {
  static override readonly _WORKING = false;

  static override get IE_NAME(): string {
    return "bfi:player";
  }

  static override readonly _VALID_URL = String.raw`https?://player\.bfi\.org\.uk/[^/]+/film/watch-(?<id>[\w-]+)-online`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new Error("Unable to download BFI player page");
    }
    const entries: ExtractorInfo[] = [];
    for (const match of webpage.matchAll(/<[^>]+class=["'][^"']*\bplayer\b[^"']*["'][^>]*>/g)) {
      const attrs = extractAttributes(match[0]);
      const ooyalaId = attrs["data-video-id"];
      if (!ooyalaId) {
        continue;
      }
      entries.push(this.urlResult(`ooyala:${ooyalaId}`, "Ooyala", ooyalaId, attrs["data-label"] ?? null));
    }
    return this.playlistResult(entries);
  }
}
