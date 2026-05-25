// Source: yt_dlp/extractor/youtube/_tab.py
// Port note: tab browsing is a large pending migration; currently this is an explicit boundary for redirect extractors.

import { NotImplementedError } from "../../errors.ts";
import { type ExtractorInfo } from "../common.ts";
import { YoutubeBaseInfoExtractor } from "./base.ts";

export class YoutubeTabBaseInfoExtractor extends YoutubeBaseInfoExtractor {
  protected override async realExtract(_url: string): Promise<ExtractorInfo | null> {
    throw new NotImplementedError("YouTube tab base extraction");
  }
}

export class YoutubeTabIE extends YoutubeTabBaseInfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?youtube\.com/(?:channel|c|user|@|playlist|feed|source|watch|shorts|live|podcasts|courses|releases|shopping)(?:[/?#].*)?`;

  static override get IE_NAME(): string {
    return "youtube:tab";
  }
}

export class YoutubePlaylistIE extends YoutubeTabIE {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?youtube\.com/(?:playlist\?list=|watch\?(?:[^#]+&)?list=)(?<id>${YoutubeBaseInfoExtractor._PLAYLIST_ID_RE})(?:[&#].*)?`;

  static override get IE_NAME(): string {
    return "youtube:playlist";
  }
}
