// Source: yt_dlp/extractor/yahoo.py

import { createHash } from "node:crypto";

import {
  ExtractorError,
  cleanHtml,
  intOrNone,
  joinNonempty,
  mimetype2ext,
  parseIso8601,
  tryGet,
  urlOrNone,
} from "../utils/index.ts";
import {
  InfoExtractor,
  SearchInfoExtractor,
  type ExtractorInfo,
} from "./common.ts";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.flatMap((item) =>
        Object.keys(record(item)).length ? [record(item)] : [],
      )
    : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function md5(value: string): string {
  return createHash("md5").update(value).digest("hex");
}

function httpsUrl(value: unknown): string | null {
  const url = urlOrNone(value);
  return url?.replace(/^http:/, "https:") ?? null;
}

export class YahooIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`(?<url>https?://(?:(?<country>[a-zA-Z]{2}(?:-[a-zA-Z]{2})?|malaysia)\.)?(?:[\da-zA-Z_-]+\.)?yahoo\.com/(?:[^/]+/)*(?<id>[^?&#]*-[0-9]+(?:-[a-z]+)?)\.html)`;

  static override get IE_NAME(): string {
    return "yahoo";
  }

  private async extractYahooVideo(
    videoId: string,
    country: string,
  ): Promise<ExtractorInfo> {
    const initial = (await this.downloadJson<JsonRecord>(
      `https://video-api.yql.yahoo.com/v1/video/sapi/streams/${videoId}`,
      videoId,
      { note: "Downloading video JSON metadata" },
    )) as JsonRecord | false;
    const initialMediaObj =
      records(
        record(record(record(initial ? initial.query : null).results).mediaObj),
      )[0] ?? {};
    const video = record(initialMediaObj.meta);
    const region = country === "malaysia" ? "my" : country;
    const isLive = Boolean(video.uplynk_live);
    const fmts = isLive ? ["m3u8"] : ["webm", "mp4"];
    const seenCaptionUrls = new Set<string>();
    const formats: Array<Record<string, unknown>> = [];
    const subtitles: Record<string, Array<Record<string, unknown>>> = {};
    let msg: string | null = null;

    for (const fmt of fmts) {
      const mediaResponse = (await this.downloadJson<JsonRecord>(
        `https://video-api.yql.yahoo.com/v1/video/sapi/streams/${videoId}`,
        videoId,
        {
          note: `Downloading ${fmt} JSON metadata`,
          query: { format: fmt, region: region.toUpperCase() },
        },
      )) as JsonRecord | false;
      const mediaObj =
        records(
          record(
            record(record(mediaResponse ? mediaResponse.query : null).results)
              .mediaObj,
          ),
        )[0] ?? {};
      msg = stringValue(record(mediaObj.status).msg);
      for (const stream of records(mediaObj.streams)) {
        const host = stringValue(stream.host);
        const path = stringValue(stream.path);
        if (!host || !path) {
          continue;
        }
        const streamUrl = `${host}${path}`;
        if (stream.format === "m3u8") {
          formats.push(
            ...this.extractM3u8Formats(streamUrl, videoId, "mp4", {
              m3u8Id: "hls",
            }),
          );
          continue;
        }
        const tbr = intOrNone(stream.bitrate);
        formats.push({
          url: streamUrl,
          format_id: joinNonempty(fmt, tbr),
          width: intOrNone(stream.width),
          height: intOrNone(stream.height),
          tbr,
          fps: intOrNone(stream.framerate),
        });
      }
      for (const cc of records(mediaObj.closedcaptions)) {
        const ccUrl = stringValue(cc.url);
        if (!ccUrl || seenCaptionUrls.has(ccUrl)) {
          continue;
        }
        seenCaptionUrls.add(ccUrl);
        const lang = stringValue(cc.lang) ?? "en-US";
        subtitles[lang] ??= [];
        subtitles[lang].push({
          url: ccUrl,
          ext: mimetype2ext(stringValue(cc.content_type)),
        });
      }
    }
    if (!formats.length && msg === "geo restricted") {
      this.raiseGeoRestricted(undefined, { metadataAvailable: true });
    }
    return {
      id: videoId,
      formats,
      subtitles,
      is_live: isLive,
      title: cleanHtml(stringValue(video.title)) ?? undefined,
      description: cleanHtml(stringValue(video.description)) ?? undefined,
      thumbnail: httpsUrl(video.thumbnail) ?? undefined,
      timestamp: parseIso8601(stringValue(video.publish_time)) ?? undefined,
      duration: intOrNone(video.duration) ?? undefined,
      view_count: intOrNone(video.view_count) ?? undefined,
      series: stringValue(video.show_name) ?? undefined,
    };
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const pageUrl = match?.groups?.url;
    let country = match?.groups?.country ?? "us";
    const displayId = match?.groups?.id;
    if (!pageUrl || !displayId) {
      throw new ExtractorError("Unable to extract Yahoo id", {
        expected: true,
      });
    }
    country = country.split("-")[0] ?? "us";
    const article = (await this.downloadJson<{ items?: JsonRecord[] }>(
      `https://${country}.yahoo.com/caas/content/article`,
      displayId,
      {
        note: "Downloading content JSON metadata",
        query: { url: pageUrl },
      },
    )) as { items?: JsonRecord[] } | false;
    const items = records(article ? article.items : [])[0] ?? {};
    const item = record(record(items.data).partnerData);
    if (item.type !== "video") {
      const entries: ExtractorInfo[] = [];
      const cover = record(item.cover);
      if (cover.type === "yvideo" && typeof cover.url === "string") {
        entries.push(
          this.urlResult(cover.url, "Yahoo", stringValue(cover.uuid)),
        );
      }
      for (const entry of records(item.body)) {
        if (entry.type === "videoIframe" && typeof entry.url === "string") {
          entries.push(this.urlResult(entry.url));
        }
      }
      if (item.type === "storywithleadvideo") {
        const iframeUrl = stringValue(
          tryGet(
            item,
            (value) => record(record(record(value).meta).player).url,
          ),
        );
        if (iframeUrl) {
          entries.push(this.urlResult(iframeUrl));
        } else {
          this.reportWarning(
            "Yahoo did not provide an iframe url for this storywithleadvideo",
          );
        }
      }
      return this.playlistResult(
        entries,
        stringValue(item.uuid),
        stringValue(item.title),
        stringValue(item.summary),
      );
    }
    const uuid = stringValue(item.uuid);
    if (!uuid) {
      throw new ExtractorError("Unable to extract Yahoo video uuid", {
        videoId: displayId,
      });
    }
    return {
      ...(await this.extractYahooVideo(uuid, country)),
      display_id: displayId,
    };
  }
}

export class YahooSearchIE extends SearchInfoExtractor {
  static readonly _MAX_RESULTS = 1000;
  static override readonly _VALID_URL =
    String.raw`yvsearch(?<n>\d*)?:(?<id>.+)`;

  static override get IE_NAME(): string {
    return "yahoo:search";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const query = this.matchId(url);
    const entries: ExtractorInfo[] = [];
    for (let pageNum = 0; pageNum < 1; pageNum += 1) {
      const resultUrl = `https://video.search.yahoo.com/search/?p=${encodeURIComponent(query).replaceAll("%20", "+")}&fr=screen&o=js&gs=0&b=${pageNum * 30}`;
      const info = (await this.downloadJson<JsonRecord>(resultUrl, query, {
        note: `Downloading results page ${pageNum + 1}`,
      })) as JsonRecord | false;
      for (const result of records(info ? info.results : [])) {
        if (typeof result.rurl === "string") {
          entries.push(this.urlResult(result.rurl));
        }
      }
    }
    return this.playlistResult(entries, query, query);
  }
}

export class YahooJapanNewsIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://news\.yahoo\.co\.jp/(?:articles|feature)/(?<id>[a-zA-Z0-9]+)`;
  static override readonly _GEO_COUNTRIES = ["JP"];

  static override get IE_NAME(): string {
    return "yahoo:japannews";
  }

  private extractFormats(
    jsonData: JsonRecord,
    contentId: string,
  ): Array<Record<string, unknown>> {
    const formats: Array<Record<string, unknown>> = [];
    for (const video of records(jsonData).length
      ? collectRecords(jsonData, "VideoUrl")
      : []) {
      const delivery = stringValue(video.delivery);
      const url = urlOrNone(video.Url);
      if (!delivery || !url) {
        continue;
      }
      if (delivery === "hls") {
        formats.push(
          ...this.extractM3u8Formats(url, contentId, "mp4", {
            entryProtocol: "m3u8_native",
            m3u8Id: "hls",
          }),
        );
      } else {
        const bitrate = intOrNone(video.bitrate);
        formats.push({
          url,
          format_id: joinNonempty("http", bitrate),
          height: intOrNone(video.height),
          width: intOrNone(video.width),
          tbr: bitrate,
        });
      }
    }
    return formats;
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new Error("Unable to download Yahoo Japan News webpage");
    }
    const state =
      this.searchJson<JsonRecord>(
        String.raw`__PRELOADED_STATE__\s*=`,
        webpage,
        "preloaded state",
        videoId,
      ) ?? {};
    const contentId = findFirstNumber(state, "vid");
    if (contentId === null) {
      throw new ExtractorError("This article does not contain a video", {
        expected: true,
        videoId,
      });
    }
    const host = "news.yahoo.co.jp";
    const spaceId = findFirstString(state, "spaceId");
    const jsonData = (await this.downloadJson<JsonRecord>(
      `https://feapi-yvpub.yahooapis.jp/v1/content/${contentId}`,
      videoId,
      {
        query: {
          appid: "dj0zaiZpPVZMTVFJR0FwZWpiMyZzPWNvbnN1bWVyc2VjcmV0Jng9YjU-",
          output: "json",
          domain: host,
          ak: spaceId ? md5(`${spaceId}_${host}`) : "",
          device_type: "1100",
        },
      },
    )) as JsonRecord | false;
    const data = jsonData || {};
    return {
      id: videoId,
      title:
        findFirstString(state, "headline") ??
        findFirstString(state, "title") ??
        this.htmlSearchMeta(["og:title", "twitter:title"], webpage) ??
        this.htmlExtractTitle(webpage) ??
        videoId,
      description:
        findFirstString(state, "description") ??
        this.htmlSearchMeta(
          ["og:description", "description", "twitter:description"],
          webpage,
        ) ??
        undefined,
      thumbnail:
        findFirstString(state, "ogpImage") ??
        this.ogSearchThumbnail(webpage) ??
        this.htmlSearchMeta("twitter:image", webpage) ??
        undefined,
      formats: this.extractFormats(data, videoId),
    };
  }
}

function collectRecords(value: unknown, key: string): JsonRecord[] {
  const out: JsonRecord[] = [];
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) {
      for (const child of item) {
        visit(child);
      }
      return;
    }
    const itemRecord = record(item);
    for (const [childKey, childValue] of Object.entries(itemRecord)) {
      if (childKey === key) {
        out.push(...records(childValue));
      } else {
        visit(childValue);
      }
    }
  };
  visit(value);
  return out;
}

function findFirstString(value: unknown, key: string): string | null {
  const itemRecord = record(value);
  if (typeof itemRecord[key] === "string") {
    return itemRecord[key] as string;
  }
  for (const child of Object.values(itemRecord)) {
    const found = Array.isArray(child)
      ? child
          .map((item) => findFirstString(item, key))
          .find((item): item is string => typeof item === "string")
      : findFirstString(child, key);
    if (found) {
      return found;
    }
  }
  return null;
}

function findFirstNumber(value: unknown, key: string): number | null {
  const itemRecord = record(value);
  const own = itemRecord[key];
  if (typeof own === "number") {
    return own;
  }
  if (typeof own === "string") {
    const parsed = Number.parseInt(own, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  for (const child of Object.values(itemRecord)) {
    const found = Array.isArray(child)
      ? child
          .map((item) => findFirstNumber(item, key))
          .find((item): item is number => typeof item === "number")
      : findFirstNumber(child, key);
    if (found !== null && found !== undefined) {
      return found;
    }
  }
  return null;
}
