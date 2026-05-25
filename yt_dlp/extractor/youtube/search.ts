// Source: yt_dlp/extractor/youtube/_search.py
// Port note: URL parsing is migrated; actual YouTube search pagination is blocked on the tab layer.

import { NotImplementedError } from "../../errors.ts";
import { joinNonempty, parseQs } from "../../utils/index.ts";
import { type ExtractorInfo } from "../common.ts";
import { YoutubeTabBaseInfoExtractor } from "./tab.ts";

export class YoutubeSearchIE extends YoutubeTabBaseInfoExtractor {
  static readonly IE_DESC = "YouTube search";
  static override readonly _VALID_URL = String.raw`ytsearch(?:date|all)?(?<prefix>[0-9]*):(?<id>[\s\S]+)`;
  static readonly _SEARCH_KEY = "ytsearch";
  static readonly _SEARCH_PARAMS = "EgIQAfABAQ==";

  static override get IE_NAME(): string {
    return "youtube:search";
  }

  protected override async realExtract(_url: string): Promise<ExtractorInfo | null> {
    throw new NotImplementedError("YouTube search result pagination");
  }
}

export class YoutubeSearchURLIE extends YoutubeTabBaseInfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?youtube\.com/(?:results|search)\?([^#]+&)?(?:search_query|q)=(?:[^&]+)(?:[&#]|$)`;

  static override get IE_NAME(): string {
    return `${YoutubeSearchIE.IE_NAME}_url`;
  }

  static readonly IE_DESC = "YouTube search URLs with sorting and filter support";

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const qs = parseQs(url);
    const query = (qs.search_query ?? qs.q)?.[0];
    if (!query) {
      throw new Error("Unable to extract YouTube search query");
    }
    throw new NotImplementedError(`YouTube search results for ${JSON.stringify(query)}${qs.sp?.[0] ? " with params" : ""}`);
  }
}

export class YoutubeMusicSearchURLIE extends YoutubeTabBaseInfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://music\.youtube\.com/search\?([^#]+&)?(?:search_query|q)=(?:[^&]+)(?:[&#]|$)`;

  static override get IE_NAME(): string {
    return "youtube:music:search_url";
  }

  static readonly IE_DESC = "YouTube music search URLs with selectable sections, e.g. #songs";

  static readonly SECTIONS: Record<string, string> = {
    albums: "EgWKAQIYAWoKEAoQAxAEEAkQBQ==",
    artists: "EgWKAQIgAWoKEAoQAxAEEAkQBQ==",
    "community playlists": "EgeKAQQoAEABagoQChADEAQQCRAF",
    "featured playlists": "EgeKAQQoADgBagwQAxAJEAQQDhAKEAU==",
    songs: "EgWKAQIIAWoKEAoQAxAEEAkQBQ==",
    videos: "EgWKAQIQAWoKEAoQAxAEEAkQBQ==",
  };

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const qs = parseQs(url);
    const query = (qs.search_query ?? qs.q)?.[0];
    if (!query) {
      throw new Error("Unable to extract YouTube Music search query");
    }
    let params = qs.sp?.[0] ?? null;
    let section: string | null = null;
    if (params) {
      section = Object.entries(YoutubeMusicSearchURLIE.SECTIONS).find(([, value]) => value === params)?.[0] ?? params;
    } else {
      section = decodeURIComponent((url.split("#")[1] ?? "").replaceAll("+", " ")).toLowerCase() || null;
      params = section ? YoutubeMusicSearchURLIE.SECTIONS[section] ?? null : null;
      if (!params) {
        section = null;
      }
    }
    const title = joinNonempty(query, section, { delim: " - " });
    throw new NotImplementedError(`YouTube Music search results for ${JSON.stringify(title)}${params ? " with params" : ""}`);
  }
}
