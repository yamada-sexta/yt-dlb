// Source: yt_dlp/extractor/youtube/_search.py
// Port note: search extraction uses the shared tab renderer walkers and Bun/Web request primitives.

import { joinNonempty, parseQs } from "../../utils/index.ts";
import { type ExtractorInfo } from "../common.ts";
import { z } from "zod";
import { YoutubeTabBaseInfoExtractor } from "./tab.ts";

const RecordSchema = z.record(z.string(), z.unknown());
const DEFAULT_SEARCH_PARAMS = "EgIQAfABAQ==";

abstract class YoutubeSearchBaseIE extends YoutubeTabBaseInfoExtractor {
  protected async searchResults(query: string, params: string | null | undefined, defaultClient = "web", maxResults = Number.POSITIVE_INFINITY): Promise<ExtractorInfo[]> {
    const firstQuery: Record<string, unknown> = { query };
    if (params) {
      firstQuery.params = params;
    }

    const entries: ExtractorInfo[] = [];
    const seenContinuations = new Set<string>();
    let nextQuery: Record<string, unknown> | null = firstQuery;
    let pageNum = 1;
    while (nextQuery && entries.length < maxResults) {
      const response = await this.callApi<unknown>("search", nextQuery, `query "${query}" page ${pageNum}`, {
        defaultClient,
        note: "Downloading search API JSON",
        errnote: "Unable to download search API page",
      });
      const parsedResponse = RecordSchema.safeParse(response);
      if (!parsedResponse.success) {
        break;
      }

      const continuationList: Array<Record<string, unknown> | null> = [null];
      const pageEntries = [...this._extract_entries({ contents: searchContentItems(parsedResponse.data) }, continuationList)];
      for (const entry of pageEntries) {
        entries.push(entry);
        if (entries.length >= maxResults) {
          break;
        }
      }

      const continuation = continuationList[0];
      const continuationToken = typeof continuation?.continuation === "string" ? continuation.continuation : null;
      if (!continuation || (continuationToken && seenContinuations.has(continuationToken))) {
        break;
      }
      if (continuationToken) {
        seenContinuations.add(continuationToken);
      }
      nextQuery = continuation;
      pageNum += 1;
    }
    return entries;
  }
}

export class YoutubeSearchIE extends YoutubeSearchBaseIE {
  static readonly IE_DESC = "YouTube search";
  static override readonly _VALID_URL = String.raw`ytsearch(?<prefix>|[1-9][0-9]*|all):(?<id>[\s\S]+)`;
  static readonly _SEARCH_KEY = "ytsearch";
  static readonly _SEARCH_PARAMS = DEFAULT_SEARCH_PARAMS;

  static override get IE_NAME(): string {
    return "youtube:search";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo | null> {
    const match = YoutubeSearchIE.matchValidUrl(url);
    const query = match?.groups?.id;
    if (!query) {
      throw new Error("Unable to extract YouTube search query");
    }
    const prefix = match.groups?.prefix ?? "";
    const maxResults = prefix === "" ? 1 : prefix === "all" ? Number.POSITIVE_INFINITY : Number(prefix);
    return this.playlistResult(await this.searchResults(query, YoutubeSearchIE._SEARCH_PARAMS, "web", maxResults), query, query);
  }
}

export class YoutubeSearchURLIE extends YoutubeSearchBaseIE {
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
    return this.playlistResult(await this.searchResults(query, qs.sp?.[0], "web"), query, query);
  }
}

export class YoutubeMusicSearchURLIE extends YoutubeSearchBaseIE {
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
    return this.playlistResult(await this.searchResults(query, params, "web_music"), title, title);
  }
}

function searchContentItems(response: Record<string, unknown>): unknown[] {
  return [
    nestedUnknown(response, ["contents", "twoColumnSearchResultsRenderer", "primaryContents", "sectionListRenderer", "contents"]),
    nestedUnknown(response, ["onResponseReceivedCommands", 0, "appendContinuationItemsAction", "continuationItems"]),
    nestedUnknown(response, ["onResponseReceivedActions", 0, "appendContinuationItemsAction", "continuationItems"]),
    nestedUnknown(response, ["contents", "tabbedSearchResultsRenderer", "tabs", 0, "tabRenderer", "content", "sectionListRenderer", "contents"]),
    nestedUnknown(response, ["continuationContents"]),
  ].flatMap((value) => Array.isArray(value) ? value : isRecord(value) ? [value] : [])
    .map((item) => isDirectRendererItem(item) ? { itemSectionRenderer: { contents: [item] } } : item);
}

function isDirectRendererItem(item: unknown): item is Record<string, unknown> {
  return isRecord(item) && !Object.keys(item).some((key) => key === "itemSectionRenderer" || key === "musicShelfRenderer" || key === "musicShelfContinuation" || key === "richItemRenderer" || key === "reportHistorySectionRenderer");
}

function nestedUnknown(value: unknown, path: readonly (string | number)[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof key === "number") {
      if (!Array.isArray(current)) {
        return null;
      }
      current = current[key];
      continue;
    }
    if (!isRecord(current)) {
      return null;
    }
    current = current[key];
  }
  return current ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return RecordSchema.safeParse(value).success;
}
