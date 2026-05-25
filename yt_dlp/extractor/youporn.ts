// Source: yt_dlp/extractor/youporn.py

import {
  ExtractorError,
  cleanHtml,
  extractAttributes,
  getElementByClass,
  getElementById,
  intOrNone,
  mergeDicts,
  parseCount,
  parseQs,
  unifiedStrdate,
  urlOrNone,
  urljoin,
} from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.flatMap((item) => Object.keys(record(item)).length ? [record(item)] : []) : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export class YouPornIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?youporn\.com/(?:watch|embed)/(?<id>\d+)(?:/(?<display_id>[^/?#&]+))?/?(?:[#?]|$)`;
  static override readonly _EMBED_REGEX = [String.raw`<iframe[^>]+\bsrc=["'](?<url>(?:https?:)?//(?:www\.)?youporn\.com/embed/\d+)`];

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const videoId = match?.groups?.id;
    const displayId = match?.groups?.display_id;
    if (!videoId) {
      throw new ExtractorError("Unable to extract YouPorn video id", { expected: true });
    }
    const webpage = await this.downloadWebpage(`https://www.youporn.com/watch/${videoId}`, videoId);
    if (webpage === false) {
      throw new Error("Unable to download YouPorn webpage");
    }
    const watchable = this.searchRegex(String.raw`(<div\s[^>]*\bid\s*=\s*('|")?watch-container(?(2)\2|(?!-)\b)[^>]*>)`, webpage, "watchability", { defaultValue: null });
    if (!watchable) {
      const message = cleanHtml(getElementById("mainContent", webpage))?.split(/\s{2}/)[0];
      throw new ExtractorError(message ? `${this.IE_NAME} says: ${message}` : "Video unavailable", { expected: true, videoId });
    }

    const playerVars = this.searchJson<JsonRecord>(String.raw`\bplayervars\s*:`, webpage, "player vars", videoId) ?? {};
    const definitions = records(playerVars.mediaDefinitions);
    const formats: Array<Record<string, unknown>> = [];

    const getFormatData = async (streamType: string): Promise<JsonRecord[]> => {
      const infoUrl = definitions
        .map((definition) => definition.format === streamType ? urlOrNone(definition.videoUrl) : null)
        .find((item): item is string => Boolean(item));
      if (!infoUrl) {
        return [];
      }
      const response = await this.downloadJson<unknown[]>(infoUrl, videoId, { note: `Downloading ${streamType} info JSON`, fatal: false }) as unknown[] | false | null;
      return response
        ? records(response).filter((item) => item.format === streamType && urlOrNone(item.videoUrl))
        : [];
    };

    for (const hls of await getFormatData("hls")) {
      const hlsUrl = urlOrNone(hls.videoUrl);
      if (hlsUrl && hls.defaultQuality !== true && hls.defaultQuality !== false) {
        formats.push(...this.extractM3u8Formats(hlsUrl, videoId, "mp4", { m3u8Id: "hls" }));
      }
      for (const child of records(hls.videoUrl)) {
        const childUrl = urlOrNone(child.videoUrl);
        if (childUrl) {
          formats.push(...this.extractM3u8Formats(childUrl, videoId, "mp4", { m3u8Id: "hls" }));
        }
      }
    }

    for (const definition of await getFormatData("mp4")) {
      const videoUrl = urlOrNone(definition.videoUrl);
      if (!videoUrl) {
        continue;
      }
      const format: Record<string, unknown> = {
        url: videoUrl,
        filesize: intOrNone(definition.videoSize),
      };
      let height = intOrNone(definition.quality);
      const bitrateMatch = /(?<height>\d{3,4})[pP]_(?<bitrate>\d+)[kK]_\d+/.exec(videoUrl);
      if (bitrateMatch?.groups) {
        height ??= intOrNone(bitrateMatch.groups.height);
        const bitrate = intOrNone(bitrateMatch.groups.bitrate);
        format.format_id = `${height}p-${bitrate}k`;
        format.tbr = bitrate;
      }
      format.height = height;
      formats.push(format);
    }

    const title = this.htmlSearchRegex(String.raw`(?s)<div[^>]+class=["']watchVideoTitle[^>]+>(.+?)</div>`, webpage, "title", { defaultValue: null })
      ?? this.ogSearchTitle(webpage)
      ?? this.htmlSearchMeta("title", webpage, "title", true);
    const description = this.htmlSearchRegex(String.raw`(?s)<div[^>]+\bid=["']description["'][^>]*>(.+?)</div>`, webpage, "description", { defaultValue: null })
      ?? this.ogSearchDescription(webpage);
    const thumbnail = this.searchRegex(String.raw`(?:imageurl\s*=|poster\s*:)\s*(["'])(?<thumbnail>.+?)\1`, webpage, "thumbnail", { fatal: false, group: "thumbnail" });
    const duration = intOrNone(playerVars.duration) ?? intOrNone(this.htmlSearchMeta("video:duration", webpage, "duration", false));
    const uploader = this.htmlSearchRegex(String.raw`(?s)<div[^>]+class=["']submitByLink["'][^>]*>(.+?)</div>`, webpage, "uploader", { fatal: false });
    const uploadDate = unifiedStrdate(this.htmlSearchRegex([
      String.raw`UPLOADED:\s*<span>([^<]+)`,
      String.raw`Date\s+[Aa]dded:\s*<span>([^<]+)`,
      String.raw`(?s)<div[^>]+class=["']videoInfo(?:Date|Time)\b[^>]*>(.+?)</div>`,
      String.raw`(?s)<label\b[^>]*>Uploaded[^<]*</label>\s*<span\b[^>]*>(.+?)</span>`,
    ], webpage, "upload date", { fatal: false }) as string | null);
    const views = this.searchRegex(String.raw`(<div [^>]*\bdata-value\s*=[^>]+>)\s*<label>Views:</label>`, webpage, "views", { defaultValue: null });
    const viewCount = typeof views === "string" ? parseCount(extractAttributes(views)["data-value"] ?? null) : null;
    const commentCount = parseCount(this.searchRegex(String.raw`>All [Cc]omments? \(([\d,.]+)\)`, webpage, "comment count", { defaultValue: null }) as string | null);

    const data = this.searchJsonLd(webpage, videoId, { defaultValue: {} }) as JsonRecord;
    delete data.url;
    const result = mergeDicts(data, {
      id: videoId,
      display_id: displayId,
      title,
      description,
      thumbnail,
      duration,
      uploader,
      upload_date: uploadDate,
      view_count: viewCount,
      comment_count: commentCount,
      categories: extractTagBox(webpage, String.raw`(?s)Categories:.*?</[^>]+>(.+?)</div>`),
      tags: extractTagBox(webpage, String.raw`(?s)Tags:.*?</div>\s*<div[^>]+class=["']tagBoxContent["'][^>]*>(.+?)</div>`),
      age_limit: this.rtaSearch(webpage),
      formats,
    }) as ExtractorInfo;
    if (typeof result.description === "string" && result.description.startsWith(`Watch ${String(result.title)} online`)) {
      delete result.description;
    }
    return result;
  }
}

abstract class YouPornListBaseIE extends InfoExtractor {
  protected getNextUrl(url: string, html: string): string | null {
    const next = getElementById("next", html) ?? "";
    const href = this.searchRegex(String.raw`<a [^>]*?\bhref\s*=\s*("|')(?<url>(?:(?!\1)[^>])+)\1`, next, "next page", { group: "url", defaultValue: null });
    return typeof href === "string" ? urljoin(url, href) : null;
  }

  protected static getTitleFromSlug(titleSlug: string): string {
    return titleSlug.replaceAll(/[_-]/g, " ");
  }

  protected async entries(url: string, playlistId: string, html: string | null = null, pageNum: number | null = null): Promise<ExtractorInfo[]> {
    const entries: ExtractorInfo[] = [];
    let currentUrl = url;
    let currentHtml = html;
    const start = pageNum ?? 1;
    for (let page = start; page <= start; page += 1) {
      currentHtml ??= await this.downloadWebpage(currentUrl, playlistId, { note: `Downloading page ${page}`, fatal: page === start }) || null;
      if (!currentHtml) {
        return entries;
      }
      for (const element of getElementsHtmlByClass("video-title", currentHtml)) {
        const href = extractAttributes(element).href;
        const videoUrl = typeof href === "string" ? urljoin(currentUrl, href) : null;
        if (videoUrl) {
          entries.push(this.urlResult(videoUrl));
        }
      }
      if (pageNum !== null) {
        return entries;
      }
      const nextUrl = this.getNextUrl(currentUrl, currentHtml);
      if (!nextUrl || nextUrl === currentUrl) {
        return entries;
      }
      currentUrl = nextUrl;
      currentHtml = null;
    }
    return entries;
  }

  protected async extractPlaylist(url: string, html: string | null = null): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const groups = match?.groups ?? {};
    let playlistId = groups.id ?? "YouPorn";
    const pageType = groups.type;
    const sort = groups.sort;
    const qs = Object.fromEntries(Object.entries(parseQs(url)).flatMap(([key, value]) => value.length ? [[key, value.at(-1) ?? ""]] : []));
    let title = (this.constructor as typeof YouPornListBaseIE).getTitleFromSlug(playlistId);
    if (pageType) {
      title = `${capitalize(pageType)} ${title}`;
    }
    const idParts = [playlistId.toLowerCase()];
    if (sort === undefined) {
      title += " videos";
    } else {
      title = `${title} videos by ${sort.replaceAll(/[_-]/g, " ")}`;
      idParts.push(sort);
    }
    const filters = Object.entries(qs).sort().map(([key, value]) => `${key}=${value}`);
    if (filters.length) {
      title += ` (${filters.join(",")})`;
      idParts.push(...filters);
    }
    playlistId = idParts.join("/");
    return this.playlistResult(await this.entries(url, playlistId, html, intOrNone(qs.page)), playlistId, title);
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    return await this.extractPlaylist(url);
  }
}

export class YouPornCategoryIE extends YouPornListBaseIE {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?youporn\.com/(?<type>category)/(?<id>[^/?#&]+)(?:/(?<sort>popular|views|rating|time|duration))?/?(?:[#?]|$)`;
}

export class YouPornChannelIE extends YouPornListBaseIE {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?youporn\.com/(?<type>channel)/(?<id>[^/?#&]+)(?:/(?<sort>rating|views|duration))?/?(?:[#?]|$)`;

  protected static override getTitleFromSlug(titleSlug: string): string {
    return titleSlug.replaceAll("_", " ").replaceAll(/\b\w/g, (char) => char.toUpperCase());
  }
}

export class YouPornCollectionIE extends YouPornListBaseIE {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?youporn\.com/(?<type>collection)s/videos/(?<id>\d+)(?:/(?<sort>rating|views|time|duration))?/?(?:[#?]|$)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const playlistId = this.matchId(url);
    const html = await this.downloadWebpage(url, playlistId);
    if (html === false) {
      throw new Error("Unable to download YouPorn collection page");
    }
    const playlist = await this.extractPlaylist(url, html);
    const infos = (cleanHtml(getElementByClass("collection-infos", html)) ?? "").replaceAll(/\s+/g, " ");
    const titleUploader = /^\s*Collection: (?<title>.+?) \d+ VIDEOS \d+ VIEWS \d+ days LAST UPDATED From: (?<uploader>[\w_-]+)/.exec(infos);
    if (titleUploader?.groups?.title) {
      playlist.title = String(playlist.title ?? "").replace(String(playlist.id ?? "").split("/")[0] ?? playlistId, titleUploader.groups.title);
      playlist.uploader = titleUploader.groups.uploader;
    }
    return playlist;
  }
}

export class YouPornTagIE extends YouPornListBaseIE {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?youporn\.com/porn(?<type>tag)s/(?<id>[^/?#&]+)(?:/(?<sort>views|rating|time|duration))?/?(?:[#?]|$)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    this.reportWarning("YouPorn tag pages are not correctly cached and often return incorrect results", null, true);
    return await super.realExtract(url);
  }
}

export class YouPornStarIE extends YouPornListBaseIE {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?youporn\.com/(?<type>pornstar)/(?<id>[^/?#&]+)(?:/(?<sort>rating|views|duration))?/?(?:[#?]|$)`;

  protected static override getTitleFromSlug(titleSlug: string): string {
    return titleSlug.replaceAll("_", " ").replaceAll(/\b\w/g, (char) => char.toUpperCase());
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const playlistId = this.matchId(url);
    const html = await this.downloadWebpage(url, playlistId);
    if (html === false) {
      throw new Error("Unable to download YouPorn pornstar page");
    }
    const playlist = await this.extractPlaylist(url, html);
    const infoMatch = /<div [^>]*\bclass\s*=\s*('|")(?:[\w$-]+\s+|\s)*?pornstar-info-wrapper(?:\s+[\w$-]+|\s)*\1[^>]*>(?<info>[\s\S]+?)(?:<\/div>\s*){6,}/.exec(html);
    const info = infoMatch?.groups?.info
      ? cleanHtml(infoMatch.groups.info.replaceAll("\n", "nl=nl"))?.replaceAll(/(?:\s*nl=nl)+\s*/g, " ").replaceAll(/(?<=\s)\s+/g, " ").replace("ribe Subsc", "")
      : null;
    return { ...playlist, description: info?.trim() || undefined };
  }
}

export class YouPornVideosIE extends YouPornListBaseIE {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?youporn\.com/(?:(?<id>browse)/)?(?<sort>(?:duration|rating|time|views|most_(?:favou?rit|view)ed|recommended|top_rated)?)?(?:[/#?]|$)`;

  protected static override getTitleFromSlug(titleSlug: string): string {
    return titleSlug === "browse" ? "YouPorn" : titleSlug;
  }
}

function extractTagBox(webpage: string, pattern: string): string[] {
  const match = new RegExp(pattern).exec(webpage);
  if (!match?.[1]) {
    return [];
  }
  return [...match[1].matchAll(/<a[^>]+href=[^>]+>([^<]+)/g)].map((item) => item[1] ?? "").filter(Boolean);
}

function getElementsHtmlByClass(className: string, html: string): string[] {
  const pattern = new RegExp(`<[^>]+class=["'][^"']*\\b${RegExp.escape(className)}\\b[^"']*["'][^>]*>[\\s\\S]*?<\\/[^>]+>`, "g");
  return [...html.matchAll(pattern)].map((match) => match[0]);
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
