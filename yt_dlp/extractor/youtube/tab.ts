// Source: yt_dlp/extractor/youtube/_tab.py
// Port note: tab browsing is a large pending migration; currently this is an explicit boundary for redirect extractors.

import { NotImplementedError } from "../../errors.ts";
import { type ExtractorInfo } from "../common.ts";
import { YoutubeBaseInfoExtractor } from "./base.ts";
import { YoutubeIE } from "./video.ts";

export class YoutubeTabBaseInfoExtractor extends YoutubeBaseInfoExtractor {
  protected override async realExtract(_url: string): Promise<ExtractorInfo | null> {
    throw new NotImplementedError("YouTube tab base extraction");
  }
}

export class YoutubeTabIE extends YoutubeTabBaseInfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?!consent\.)(?:\w+\.)?youtube(?:kids)?\.com/(?:(?<channel_type>channel|c|user|browse)/|(?<not_channel>feed/|hashtag/|(?:playlist|watch)\?.*?\blist=)|(?!(?:${YoutubeBaseInfoExtractor._RESERVED_NAMES})\b))(?<id>[^/?#&]+)`;

  static override suitable(url: string): boolean {
    return YoutubeIE.suitable(url) ? false : super.suitable(url);
  }

  static override get IE_NAME(): string {
    return "youtube:tab";
  }
}

export class YoutubePlaylistIE extends YoutubeTabIE {
  static override readonly _VALID_URL = String.raw`^(?:(?:https?://)?(?:\w+\.)?youtube(?:kids)?\.com/.*?\?.*?\blist=)?(?<id>${YoutubeBaseInfoExtractor._PLAYLIST_ID_RE})`;

  static override suitable(url: string): boolean {
    if (YoutubeTabIE.suitable(url) || hasQueryValue(url, "v")) {
      return false;
    }
    return super.suitable(url);
  }

  static override get IE_NAME(): string {
    return "youtube:playlist";
  }
}

function hasQueryValue(url: string, key: string): boolean {
  try {
    return Boolean(new URL(url).searchParams.get(key));
  } catch {
    return false;
  }
}
