// Source: yt_dlp/extractor/zdf.py

import {
  determineExt,
  ExtractorError,
  filterDict,
  floatOrNone,
  intOrNone,
  ISO639Utils,
  joinNonempty,
  makeArchiveId,
  parseCodecs,
  parseIso8601,
  parseQs,
  smuggleUrl,
  unifiedTimestamp,
  unsmuggleUrl,
  urlOrNone,
  urljoin,
  variadic,
} from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface CacheLike {
  load(section: string, key: string, dtype?: string, defaultValue?: unknown): Promise<unknown>;
  store(section: string, key: string, data: unknown, dtype?: string): Promise<void>;
}

interface ZdfToken {
  type?: string;
  token?: string;
  expires?: unknown;
}

abstract class ZDFBaseIE extends InfoExtractor {
  static override readonly _GEO_COUNTRIES = ["DE"];
  private static tokenCache: ZdfToken = {};

  private get cache(): CacheLike | null {
    const candidate = this.downloader as { cache?: CacheLike } | null;
    return candidate?.cache ?? null;
  }

  protected async getApiToken(): Promise<string> {
    if (!Object.keys(ZDFBaseIE.tokenCache).length) {
      ZDFBaseIE.tokenCache = (await this.cache?.load("zdf", "api-token", "json", {}) ?? {}) as ZdfToken;
    }
    if ((intOrNone(ZDFBaseIE.tokenCache.expires) ?? 0) < Math.trunc(Date.now() / 1000)) {
      const token = await this.downloadJson<ZdfToken>(
        "https://zdf-prod-futura.zdf.de/mediathekV2/token",
        "zdf",
        { note: "Downloading API token", errnote: "Failed to download API token" },
      );
      if (token === false || !token.type || !token.token) {
        throw new ExtractorError("Unable to extract ZDF API token");
      }
      ZDFBaseIE.tokenCache = token;
      await this.cache?.store("zdf", "api-token", ZDFBaseIE.tokenCache);
    }
    return `${ZDFBaseIE.tokenCache.type} ${ZDFBaseIE.tokenCache.token}`;
  }

  protected async callApi<T>(url: string, videoId: string, item: string, apiToken: string | null = null): Promise<T> {
    const headers: Record<string, string> = {};
    if (apiToken) {
      headers["Api-Auth"] = apiToken;
    }
    const data = await this.downloadJson<T>(url, videoId, {
      note: `Downloading ${item}`,
      errnote: `Failed to download ${item}`,
      headers,
    });
    if (data === false) {
      throw new ExtractorError(`Unable to download ${item}`, { videoId });
    }
    return data as T;
  }

  protected parseAspectRatio(aspectRatio: unknown): number | null {
    if (typeof aspectRatio !== "string") {
      return null;
    }
    const match = /(?<width>\d+):(?<height>\d+)/.exec(aspectRatio);
    return match?.groups?.width && match.groups.height ? Number(match.groups.width) / Number(match.groups.height) : null;
  }

  protected extractChapters(data: unknown): Array<Record<string, unknown>> | null {
    const items = Array.isArray(data) ? data : [];
    const chapters = items.flatMap((item) => {
      const record = getRecord(item);
      const startTime = floatOrNone(record.anchorOffset);
      return startTime === null ? [] : [{ start_time: startTime, title: stringValue(record.anchorLabel) }];
    });
    return chapters.length ? chapters : null;
  }

  static extractSubtitles(src: unknown): Record<string, Array<Record<string, unknown>>> {
    const seen = new Set<string>();
    const subtitles: Record<string, Array<Record<string, unknown>>> = {};
    for (const caption of Array.isArray(src) ? src : []) {
      const record = getRecord(caption);
      const subtitleUrl = urlOrNone(record.uri);
      if (!subtitleUrl || seen.has(subtitleUrl)) {
        continue;
      }
      seen.add(subtitleUrl);
      const lang = stringValue(record.language) ?? "deu";
      subtitles[lang] ??= [];
      subtitles[lang]!.push({ url: subtitleUrl });
    }
    return subtitles;
  }

  protected expandPtmdTemplate(apiBaseUrl: string, template: string): string {
    return urljoin(apiBaseUrl, template.replace("{playerId}", "android_native_6")) ?? template;
  }

  protected async extractPtmd(ptmdUrls: string | readonly string[], videoId: string, apiToken: string | null = null, aspectRatio: number | null = null): Promise<ExtractorInfo> {
    let contentId: string | null = null;
    let duration: number | null = null;
    const formats: Array<Record<string, unknown>> = [];
    const captions: unknown[] = [];
    const seenUrls = new Set<string>();

    for (const rawPtmdUrl of variadic(ptmdUrls)) {
      const [ptmdUrl, smuggledData] = unsmuggleUrl(rawPtmdUrl, {});
      const isDgs = smuggledData.vod_media_type === "DGS";
      const ptmd = await this.callApi<Record<string, unknown>>(ptmdUrl, videoId, "PTMD data", apiToken);
      const basename = stringValue(ptmd.basename) ?? /\/vod\/ptmd\/[^/?#]+\/(\w+)/.exec(ptmdUrl)?.[1] ?? null;
      if (!contentId && !isDgs) {
        contentId = basename;
      }
      duration ??= floatOrNone(getPath(ptmd, ["attributes", "duration", "value"]), 1000);
      captions.push(...asArray(ptmd.captions).filter((item) => item && typeof item === "object"));

      for (const stream of asArray(ptmd.priorityList).flatMap((item) => asArray(getRecord(item).formitaeten))) {
        const streamRecord = getRecord(stream);
        for (const quality of asArray(streamRecord.qualities)) {
          const qualityRecord = getRecord(quality);
          for (const variant of asArray(getPath(qualityRecord, ["audio", "tracks"]))) {
            const variantRecord = getRecord(variant);
            const formatUrl = urlOrNone(variantRecord.uri);
            if (!formatUrl || seenUrls.has(formatUrl)) {
              continue;
            }
            seenUrls.add(formatUrl);
            const ext = determineExt(formatUrl);
            let fmts: Array<Record<string, unknown>> = [];
            if (ext === "m3u8") {
              fmts = this.extractM3u8Formats(formatUrl, videoId, "mp4", { m3u8Id: "hls" });
            } else if (ext === "mp4" || ext === "webm") {
              const height = intOrNone(qualityRecord.highestVerticalResolution);
              fmts = [{
                url: formatUrl,
                ...parseCodecs(stringValue(qualityRecord.mimeCodec)),
                height: height ?? undefined,
                width: aspectRatio && height ? Math.round(aspectRatio * height) : undefined,
                filesize: intOrNone(variantRecord.filesize) ?? undefined,
                format_id: joinNonempty("http", streamRecord.type),
                tbr: intOrNone(this.searchRegex(/_(\d+)k_/, formatUrl, "tbr", { defaultValue: null }) as string | null) ?? undefined,
              }];
            } else {
              this.reportWarning(`Skipping unsupported extension "${ext}"`, videoId);
            }
            const fClass = stringValue(variantRecord.class);
            for (const format of fmts) {
              const fLang = ISO639Utils.short2long(String(format.language ?? variantRecord.language ?? "").toLowerCase());
              const isAudioOnly = format.vcodec === "none";
              formats.push({
                ...format,
                format_id: joinNonempty(format.format_id, isDgs && "dgs"),
                format_note: joinNonempty(!isAudioOnly && fClass, isDgs && "German Sign Language", format.format_note, { delim: ", " }),
                preference: isDgs ? -2 : -1,
                language: fLang,
                language_preference: ((isAudioOnly && format.format_note === "Audiodeskription") || (!isAudioOnly && fClass === "ad"))
                  ? -10
                  : fLang === "deu" && fClass === "main" ? 10
                    : fLang === "deu" ? 5
                      : fClass === "main" ? 1 : -1,
              });
            }
          }
        }
      }
    }

    return {
      id: contentId ?? videoId,
      duration: duration ?? undefined,
      formats,
      subtitles: ZDFBaseIE.extractSubtitles(captions),
    };
  }

  protected async downloadGraphql<T>(itemId: string, dataDesc: string, options: { query?: Record<string, string>; body?: Record<string, unknown> }): Promise<T> {
    const headers: Record<string, string> = {
      "Api-Auth": await this.getApiToken(),
      "Apollo-Require-Preflight": "true",
    };
    if (options.body) {
      headers["Content-Type"] = "application/json";
    }
    const data = await this.downloadJson<T>(
      "https://api.zdf.de/graphql",
      itemId,
      {
        note: `Downloading ${dataDesc}`,
        errnote: `Failed to download ${dataDesc}`,
        query: options.query,
        data: options.body ? JSON.stringify(options.body) : null,
        headers,
      },
    );
    if (data === false) {
      throw new ExtractorError(`Unable to download ${dataDesc}`, { videoId: itemId });
    }
    return data as T;
  }

  static extractThumbnails(source: unknown): Array<Record<string, unknown>> {
    return Object.entries(getRecord(source)).flatMap(([formatId, url]) => {
      const thumbnailUrl = urlOrNone(url);
      if (!thumbnailUrl) {
        return [];
      }
      const match = /(?<width>\d+|auto)[Xx](?<height>\d+|auto)/.exec(formatId);
      return [{
        id: formatId,
        url: thumbnailUrl,
        preference: formatId === "original" ? 1 : 0,
        width: intOrNone(match?.groups?.width) ?? undefined,
        height: intOrNone(match?.groups?.height) ?? undefined,
      }];
    });
  }
}

export class ZDFIE extends ZDFBaseIE {
  static override readonly _VALID_URL = [
    String.raw`https?://(?:www\.)?zdf\.de/(?:video|play)/(?:[^/?#]+/)*(?<id>[^/?#]+)`,
    String.raw`https?://(?:www\.)?zdf\.de/(?:[^/?#]+/)*(?<id>[^/?#]+)\.html`,
    String.raw`https?://(?:www\.)?(?:zdfheute|logo)\.de/(?:[^/?#]+/)*(?<id>[^/?#]+)\.html`,
  ];
  static override readonly IE_NAME = "zdf";
  private static readonly GRAPHQL_QUERY = `
query VideoByCanonical($canonical: String!) {
  videoByCanonical(canonical: $canonical) {
    canonical title leadParagraph editorialDate
    teaser { description image { list } }
    episodeInfo { episodeNumber seasonNumber }
    smartCollection { canonical title }
    currentMedia {
      nodes {
        ptmdTemplate aspectRatio vodMediaType id duration label
        streamAnchorTags { nodes { anchorOffset anchorLabel } }
      }
    }
  }
}`;

  protected override async extractPtmd(...args: Parameters<ZDFBaseIE["extractPtmd"]>): Promise<ExtractorInfo> {
    const ptmdData = await super.extractPtmd(...args);
    const oldArchiveId = ptmdData.id;
    return {
      ...ptmdData,
      id: undefined,
      _old_archive_ids: oldArchiveId ? [makeArchiveId(this, oldArchiveId)] : undefined,
    };
  }

  private async extractFallback(documentId: string): Promise<ExtractorInfo> {
    const video = await this.downloadJson<Record<string, unknown>>(
      `https://zdf-prod-futura.zdf.de/mediathekV2/document/${documentId}`,
      documentId,
      { note: "Downloading fallback metadata", errnote: "Failed to download fallback metadata" },
    );
    if (video === false) {
      throw new ExtractorError("Unable to download fallback metadata", { videoId: documentId });
    }
    const document = getRecord(video.document);
    const ptmdUrl = urlOrNone(document.streamApiUrlAndroid) ?? urlOrNone(getPath(document, ["streams", 0, "streamApiUrlAndroid"]));
    if (!ptmdUrl) {
      throw new ExtractorError("Unable to extract PTMD URL", { videoId: documentId });
    }
    const thumbnails = Object.entries(getRecord(document.teaserBild)).flatMap(([key, value]) => {
      const thumbnail = getRecord(value);
      const thumbnailUrl = urlOrNone(thumbnail.url);
      return thumbnailUrl ? [{
        url: thumbnailUrl,
        id: key,
        width: intOrNone(thumbnail.width) ?? undefined,
        height: intOrNone(thumbnail.height) ?? undefined,
      }] : [];
    });
    return {
      thumbnails,
      title: stringValue(document.titel),
      description: stringValue(document.beschreibung),
      timestamp: unifiedTimestamp(document.date) ?? unifiedTimestamp(getPath(video, ["meta", "editorialDate"])) ?? undefined,
      subtitles: ZDFBaseIE.extractSubtitles(document.captions),
      ...(await this.extractPtmd(ptmdUrl, documentId, await this.getApiToken())),
      id: documentId,
    };
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const graphql = await this.downloadGraphql<{ data?: { videoByCanonical?: Record<string, unknown> | null } }>(
      videoId,
      "video metadata",
      {
        body: {
          operationName: "VideoByCanonical",
          query: ZDFIE.GRAPHQL_QUERY,
          variables: { canonical: videoId },
        },
      },
    );
    const videoData = graphql.data?.videoByCanonical;
    if (!videoData) {
      return await this.extractFallback(videoId);
    }

    let aspectRatio: number | null = null;
    const ptmdUrls: string[] = [];
    for (const node of asArray(getPath(videoData, ["currentMedia", "nodes"]))) {
      const nodeRecord = getRecord(node);
      const template = stringValue(nodeRecord.ptmdTemplate);
      if (!template) {
        continue;
      }
      let ptmdUrl = this.expandPtmdTemplate("https://api.zdf.de", template);
      if (nodeRecord.vodMediaType) {
        ptmdUrl = smuggleUrl(ptmdUrl, { vod_media_type: nodeRecord.vodMediaType });
      }
      ptmdUrls.push(ptmdUrl);
      aspectRatio ??= this.parseAspectRatio(nodeRecord.aspectRatio);
    }

    return {
      title: stringValue(videoData.title),
      description: stringValue(videoData.leadParagraph) ?? stringValue(getPath(videoData, ["teaser", "description"])),
      timestamp: parseIso8601(stringValue(videoData.editorialDate)) ?? undefined,
      thumbnails: ZDFBaseIE.extractThumbnails(getPath(videoData, ["teaser", "image", "list"])),
      episode_number: intOrNone(getPath(videoData, ["episodeInfo", "episodeNumber"])) ?? undefined,
      season_number: intOrNone(getPath(videoData, ["episodeInfo", "seasonNumber"])) ?? undefined,
      series: stringValue(getPath(videoData, ["smartCollection", "title"])),
      series_id: stringValue(getPath(videoData, ["smartCollection", "canonical"])),
      chapters: this.extractChapters(getPath(videoData, ["currentMedia", "nodes", 0, "streamAnchorTags", "nodes"])) ?? undefined,
      ...(await this.extractPtmd(ptmdUrls, videoId, await this.getApiToken(), aspectRatio)),
      id: videoId,
    };
  }
}

export class ZDFChannelIE extends ZDFBaseIE {
  static override readonly _VALID_URL = String.raw`https?://www\.zdf\.de/(?:[^/?#]+/)*(?<id>[^/?#]+)`;
  static override readonly IE_NAME = "zdf:channel";
  private static readonly PAGE_SIZE = 24;

  static override suitable(url: string): boolean {
    return ZDFIE.suitable(url) ? false : super.suitable(url);
  }

  private async fetchPage(playlistId: string, canonicalId: string, seasonIdx: number, seasonNumber: number, pageNumber: number, cursor: string | null = null): Promise<Record<string, unknown>> {
    const response = await this.downloadGraphql<{ data?: { smartCollectionByCanonical?: Record<string, unknown> } }>(
      playlistId,
      `season ${seasonNumber} page ${pageNumber} JSON`,
      {
        query: {
          operationName: "seasonByCanonical",
          variables: JSON.stringify(filterDict({
            seasonIndex: seasonIdx,
            canonical: canonicalId,
            episodesPageSize: ZDFChannelIE.PAGE_SIZE,
            episodesAfter: cursor,
          })),
          extensions: JSON.stringify({
            persistedQuery: {
              version: 1,
              sha256Hash: "9412a0f4ac55dc37d46975d461ec64bfd14380d815df843a1492348f77b5c99a",
            },
          }),
        },
      },
    );
    return response.data?.smartCollectionByCanonical ?? {};
  }

  private async entries(playlistId: string, canonicalId: string, seasonNumbers: number[], requestedSeasonNumber: number | null): Promise<ExtractorInfo[]> {
    const entries: ExtractorInfo[] = [];
    for (const [seasonIdx, seasonNumber] of seasonNumbers.entries()) {
      if (requestedSeasonNumber !== null && requestedSeasonNumber !== seasonNumber) {
        continue;
      }
      let cursor: string | null = null;
      for (let pageNumber = 1; ; pageNumber += 1) {
        const page = await this.fetchPage(playlistId, canonicalId, seasonIdx, seasonNumber, pageNumber, cursor);
        const nodes = asArray(getPath(page, ["seasons", "nodes"]));
        for (const node of nodes) {
          for (const episode of asArray(getPath(node, ["episodes", "nodes"]))) {
            const episodeRecord = getRecord(episode);
            const sharingUrl = urlOrNone(episodeRecord.sharingUrl);
            if (!sharingUrl) {
              continue;
            }
            entries.push(this.urlResult(sharingUrl, ZDFIE, stringValue(episodeRecord.canonical) ?? undefined, stringValue(getPath(episodeRecord, ["teaser", "title"])) ?? undefined, {
              description: stringValue(episodeRecord.leadParagraph) ?? stringValue(getPath(episodeRecord, ["teaser", "description"])),
              timestamp: parseIso8601(stringValue(episodeRecord.editorialDate)) ?? undefined,
              episode_number: intOrNone(getPath(episodeRecord, ["episodeInfo", "episodeNumber"])) ?? undefined,
              season_number: intOrNone(getPath(episodeRecord, ["episodeInfo", "seasonNumber"])) ?? undefined,
            }));
          }
        }
        const pageInfo = getRecord(getPath(nodes.at(-1), ["episodes", "pageInfo"]));
        if (!pageInfo.hasNextPage || !pageInfo.endCursor) {
          break;
        }
        cursor = stringValue(pageInfo.endCursor) ?? null;
      }
    }
    return entries;
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    let canonicalId = this.matchId(url);
    const response = await this.requestWebpage(url, canonicalId);
    if (response !== false) {
      canonicalId = this.searchRegex(ZDFChannelIE._VALID_URL, response.url, "channel id", { group: "id" }) as string;
    }
    const seasonNumber = intOrNone(parseQs(url).staffel?.at(-1));
    const playlistId = joinNonempty(canonicalId, seasonNumber && `s${seasonNumber}`);
    const collection = await this.downloadGraphql<{ data?: { smartCollectionByCanonical?: Record<string, unknown> } }>(
      playlistId,
      "smart collection data",
      {
        query: {
          operationName: "GetSmartCollectionByCanonical",
          variables: JSON.stringify({ canonical: canonicalId, videoPageSize: 100 }),
          extensions: JSON.stringify({
            persistedQuery: {
              version: 1,
              sha256Hash: "cb49420e133bd668ad895a8cea0e65cba6aa11ac1cacb02341ff5cf32a17cd02",
            },
          }),
        },
      },
    );
    const collectionData = collection.data?.smartCollectionByCanonical ?? {};
    const videoData = getRecord(collectionData.video);
    const seasonNumbers = asArray(getPath(collectionData, ["seasons", "seasons"]))
      .map((season) => intOrNone(getRecord(season).number))
      .filter((item): item is number => item !== null);
    const videoUrl = urlOrNone(videoData.sharingUrl);
    if (!this.yesPlaylist(seasonNumbers.length ? playlistId : null, videoUrl ? stringValue(videoData.canonical) ?? true : null)) {
      return this.urlResult(videoUrl!, ZDFIE, stringValue(videoData.canonical) ?? undefined);
    }
    if (seasonNumber !== null && !seasonNumbers.includes(seasonNumber)) {
      throw new ExtractorError(`Season ${seasonNumber} was not found in the collection data`, { videoId: playlistId });
    }
    return this.playlistResult(
      await this.entries(playlistId, canonicalId, seasonNumbers, seasonNumber),
      playlistId,
      joinNonempty(stringValue(collectionData.title), seasonNumber && `Season ${seasonNumber}`, { delim: " - " }),
      stringValue(collectionData.infoText) ?? null,
    );
  }
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getPath(value: unknown, path: readonly (string | number)[]): unknown {
  let current = value;
  for (const key of path) {
    if (Array.isArray(current) && typeof key === "number") {
      current = current[key];
    } else if (current && typeof current === "object" && !Array.isArray(current) && typeof key === "string") {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}
