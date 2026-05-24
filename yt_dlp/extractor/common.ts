// Source: yt_dlp/extractor/common.py
// Port note: extractor IO is async and uses Bun/Web Request/Response primitives.

import { compatEtreeFromstring, type XmlElement } from "../compat/index.ts";
import type { DownloaderHost } from "../downloader/common.ts";
import { Request as YtdlRequest } from "../networking/common.ts";
import {
  ExtractorError,
  GeoRestrictedError,
  NO_DEFAULT,
  RegexNotFoundError,
  UnsupportedError,
  truncateString,
} from "../utils/index.ts";

export interface ExtractorInfo {
  id?: string;
  title?: string;
  url?: string;
  _type?: string;
  entries?: Iterable<ExtractorInfo> | ExtractorInfo[];
  ie_key?: string;
  subtitles?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface DownloadOptions {
  note?: string | null;
  errnote?: string | null | false;
  fatal?: boolean;
  encoding?: string | null;
  data?: RequestInit["body"] | null;
  headers?: ConstructorParameters<typeof Headers>[0];
  query?: Record<string, string | number | boolean | null | undefined>;
  expected_status?: number | readonly number[] | ((status: number) => boolean) | null;
  transform_source?: (source: string) => string;
}

export abstract class InfoExtractor {
  static readonly _VALID_URL: string | RegExp | readonly (string | RegExp)[] | false = false;
  static readonly _WORKING = true;
  static readonly _NETRC_MACHINE: string | false = false;
  static readonly _GEO_COUNTRIES: readonly string[] = [];
  static readonly _GEO_IP_BLOCKS: readonly string[] = [];
  static readonly _GEO_BYPASS = false;

  protected downloader: DownloaderHost | null = null;
  protected ready = false;
  protected xForwardedForIp: string | null = null;
  protected printedMessages = new Set<string>();

  constructor(downloader: DownloaderHost | null = null) {
    this.setDownloader(downloader);
  }

  static matchValidUrl(url: string): RegExpMatchArray | null {
    const validUrl = this._VALID_URL;
    if (validUrl === false) {
      return null;
    }
    for (const pattern of Array.isArray(validUrl) ? validUrl : [validUrl]) {
      const regex = typeof pattern === "string" ? new RegExp(pattern) : pattern;
      const match = url.match(regex);
      if (match) {
        return match;
      }
    }
    return null;
  }

  static suitable(url: string): boolean {
    return this.matchValidUrl(url) !== null;
  }

  static matchId(url: string): string {
    const match = this.matchValidUrl(url);
    const id = match?.groups?.id ?? match?.[1];
    if (!id) {
      throw new RegexNotFoundError("Unable to extract id");
    }
    return id;
  }

  static getTempId(url: string): string | null {
    try {
      return this.matchId(url);
    } catch {
      return null;
    }
  }

  static working(): boolean {
    return this._WORKING;
  }

  static supportsLogin(): boolean {
    return Boolean(this._NETRC_MACHINE);
  }

  static ieKey(): string {
    return this.name.endsWith("IE") ? this.name.slice(0, -2) : this.name;
  }

  static get IE_NAME(): string {
    return this.ieKey();
  }

  get IE_NAME(): string {
    return (this.constructor as typeof InfoExtractor).IE_NAME;
  }

  protected matchValidUrl(url: string): RegExpMatchArray | null {
    return (this.constructor as typeof InfoExtractor).matchValidUrl(url);
  }

  protected matchId(url: string): string {
    return (this.constructor as typeof InfoExtractor).matchId(url);
  }

  setDownloader(downloader: DownloaderHost | null): void {
    this.downloader = downloader;
  }

  initialize(): void | Promise<void> {
    this.printedMessages.clear();
    if (!this.ready) {
      this.initializePreLogin();
      this.realInitialize();
      this.ready = true;
    }
  }

  async extract(url: string): Promise<ExtractorInfo | null> {
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          await this.initialize();
          this.toScreen(`Extracting URL: ${this.getParam("verbose", false) ? url : truncateString(url, 100, 20)}`);
          const result = await this.realExtract(url);
          if (result && this.xForwardedForIp) {
            result.__x_forwarded_for_ip = this.xForwardedForIp;
          }
          return result;
        } catch (error) {
          if (error instanceof GeoRestrictedError && this.maybeFakeIpAndRetry(error.countries)) {
            continue;
          }
          throw error;
        }
      }
      return null;
    } catch (error) {
      if (error instanceof UnsupportedError) {
        throw error;
      }
      if (error instanceof ExtractorError) {
        error.video_id ||= (this.constructor as typeof InfoExtractor).getTempId(url);
        error.ie ||= this.IE_NAME;
        throw error;
      }
      throw new ExtractorError("An extractor error has occurred.", {
        cause: error,
        videoId: (this.constructor as typeof InfoExtractor).getTempId(url),
      });
    }
  }

  protected initializePreLogin(): void {}

  protected realInitialize(): void {}

  protected async realExtract(_url: string): Promise<ExtractorInfo | null> {
    throw new Error("This method must be implemented by subclasses");
  }

  protected getParam<T>(name: string, defaultValue: T): T {
    const value = this.downloader?.params?.[name];
    return value === undefined ? defaultValue : value as T;
  }

  protected toScreen(message: string): void {
    this.downloader?.toScreen(`[${this.IE_NAME}] ${message}`);
  }

  protected reportWarning(message: string, videoId: string | null = null, onlyOnce = false): void {
    const text = `[${this.IE_NAME}] ${videoId ? `${videoId}: ` : ""}${message}`;
    if (onlyOnce) {
      if (this.printedMessages.has(text)) {
        return;
      }
      this.printedMessages.add(text);
    }
    this.downloader?.reportWarning?.(text);
  }

  protected writeDebug(message: string): void {
    this.downloader?.writeDebug?.(`[${this.IE_NAME}] ${message}`);
  }

  protected async requestWebpage(urlOrRequest: string | URL | Request, videoId: string, options: DownloadOptions = {}): Promise<Response | false> {
    const fatal = options.fatal ?? true;
    const errnote = options.errnote === undefined ? "Unable to download webpage" : options.errnote;
    try {
      if (options.note) {
        this.toScreen(options.note);
      }
      const request = this.createRequest(urlOrRequest, options);
      const response = await this.urlopen(request);
      if (!response.ok && !canAcceptStatusCode(response.status, options.expected_status ?? null)) {
        throw new ExtractorError(`HTTP Error ${response.status}: ${response.statusText}`, { expected: true, videoId });
      }
      return response;
    } catch (error) {
      if (fatal) {
        throw error instanceof ExtractorError
          ? error
          : new ExtractorError(`${videoId}: ${errnote || "Unable to download webpage"}`, { cause: error, videoId });
      }
      if (errnote) {
        this.reportWarning(`${videoId}: ${errnote}: ${error instanceof Error ? error.message : String(error)}`);
      }
      return false;
    }
  }

  protected async downloadWebpageHandle(
    urlOrRequest: string | URL | Request,
    videoId: string,
    options: DownloadOptions = {},
  ): Promise<[string, Response] | false> {
    const response = await this.requestWebpage(urlOrRequest, videoId, options);
    if (response === false) {
      return false;
    }
    return [await decodeResponseText(response, options.encoding ?? null), response];
  }

  protected async downloadWebpage(urlOrRequest: string | URL | Request, videoId: string, options: DownloadOptions = {}): Promise<string | false> {
    const result = await this.downloadWebpageHandle(urlOrRequest, videoId, options);
    return result === false ? false : result[0];
  }

  protected async downloadJson<T = unknown>(urlOrRequest: string | URL | Request, videoId: string, options: DownloadOptions = {}): Promise<T | false> {
    const webpage = await this.downloadWebpage(urlOrRequest, videoId, {
      note: "Downloading JSON metadata",
      errnote: "Unable to download JSON metadata",
      ...options,
    });
    if (webpage === false) {
      return false;
    }
    try {
      return JSON.parse(options.transform_source ? String(options.transform_source(webpage)) : webpage) as T;
    } catch (error) {
      if (options.fatal === false) {
        this.reportWarning(`${videoId}: Failed to parse JSON`);
        return false;
      }
      throw new ExtractorError("Failed to parse JSON", { cause: error, videoId });
    }
  }

  protected async downloadXml(urlOrRequest: string | URL | Request, videoId: string, options: DownloadOptions = {}): Promise<XmlElement | false> {
    const webpage = await this.downloadWebpage(urlOrRequest, videoId, {
      note: "Downloading XML",
      errnote: "Unable to download XML",
      ...options,
    });
    if (webpage === false) {
      return false;
    }
    try {
      return compatEtreeFromstring(webpage);
    } catch (error) {
      if (options.fatal === false) {
        this.reportWarning(`${videoId}: Failed to parse XML`);
        return false;
      }
      throw new ExtractorError("Failed to parse XML", { cause: error, videoId });
    }
  }

  protected searchRegex(
    pattern: string | RegExp | readonly (string | RegExp)[],
    text: string | null | undefined,
    name: string,
    options: { defaultValue?: string | typeof NO_DEFAULT | null; fatal?: boolean; group?: string | number | readonly (string | number)[] } = {},
  ): string | string[] | null {
    const fatal = options.fatal ?? true;
    const defaultValue = options.defaultValue ?? NO_DEFAULT;
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    let match: RegExpExecArray | null = null;
    if (text !== null && text !== undefined) {
      for (const item of patterns) {
        const regex = typeof item === "string" ? new RegExp(item) : item;
        match = regex.exec(text);
        if (match) {
          break;
        }
      }
    }
    if (match) {
      const group = options.group;
      if (Array.isArray(group)) {
        return group.map((item) => groupValue(match!, item));
      }
      if (typeof group === "string" || typeof group === "number") {
        return groupValue(match, group);
      }
      return match.slice(1).find((item) => item !== undefined) ?? match[0];
    }
    if (defaultValue !== NO_DEFAULT) {
      return defaultValue;
    }
    if (fatal) {
      throw new RegexNotFoundError(`Unable to extract ${name}`);
    }
    this.reportWarning(`unable to extract ${name}`);
    return null;
  }

  protected searchJson<T = unknown>(
    startPattern: string,
    text: string,
    name: string,
    videoId: string,
    options: { endPattern?: string; containsPattern?: string; fatal?: boolean; defaultValue?: T | typeof NO_DEFAULT } = {},
  ): T | null {
    const contains = options.containsPattern ?? "{[\\s\\S]+}";
    const jsonString = this.searchRegex(
      `(?:${startPattern})\\s*(?<json>${contains})\\s*(?:${options.endPattern ?? ""})`,
      text,
      name,
      { group: "json", fatal: options.fatal ?? true, defaultValue: options.defaultValue === undefined ? NO_DEFAULT : null },
    );
    if (typeof jsonString !== "string") {
      return options.defaultValue === NO_DEFAULT || options.defaultValue === undefined ? null : options.defaultValue;
    }
    try {
      return JSON.parse(jsonString) as T;
    } catch (error) {
      if (options.fatal === false) {
        this.reportWarning(`Unable to extract ${name} - Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`, videoId);
        return options.defaultValue === NO_DEFAULT || options.defaultValue === undefined ? null : options.defaultValue;
      }
      throw new ExtractorError(`Unable to extract ${name} - Failed to parse JSON`, { cause: error, videoId });
    }
  }

  protected htmlSearchRegex(
    pattern: string | RegExp | readonly (string | RegExp)[],
    text: string | null | undefined,
    name: string,
    options: { defaultValue?: string | typeof NO_DEFAULT | null; fatal?: boolean; group?: string | number | readonly (string | number)[] } = {},
  ): string | string[] | null {
    return this.searchRegex(pattern, text, name, options);
  }

  static urlResult(url: string, ie: string | typeof InfoExtractor | null = null, videoId: string | null = null, videoTitle: string | null = null, options: Record<string, unknown> = {}): ExtractorInfo {
    return {
      ...options,
      ...(ie ? { ie_key: typeof ie === "string" ? ie : ie.ieKey() } : {}),
      ...(videoId ? { id: videoId } : {}),
      ...(videoTitle ? { title: videoTitle } : {}),
      _type: options.url_transparent ? "url_transparent" : "url",
      url,
    };
  }

  protected urlResult(url: string, ie: string | typeof InfoExtractor | null = null, videoId: string | null = null, videoTitle: string | null = null, options: Record<string, unknown> = {}): ExtractorInfo {
    return InfoExtractor.urlResult(url, ie, videoId, videoTitle, options);
  }

  static playlistResult(entries: Iterable<ExtractorInfo> | ExtractorInfo[], playlistId: string | null = null, playlistTitle: string | null = null, playlistDescription: string | null = null, options: Record<string, unknown> = {}): ExtractorInfo {
    return {
      ...options,
      ...(playlistId ? { id: playlistId } : {}),
      ...(playlistTitle ? { title: playlistTitle } : {}),
      ...(playlistDescription !== null ? { description: playlistDescription } : {}),
      _type: options.multi_video ? "multi_video" : "playlist",
      entries,
    };
  }

  protected playlistResult(entries: Iterable<ExtractorInfo> | ExtractorInfo[], playlistId: string | null = null, playlistTitle: string | null = null, playlistDescription: string | null = null, options: Record<string, unknown> = {}): ExtractorInfo {
    return InfoExtractor.playlistResult(entries, playlistId, playlistTitle, playlistDescription, options);
  }

  static playlistFromMatches(
    matches: Iterable<string>,
    options: { playlistId?: string | null; playlistTitle?: string | null; getter?: (value: string) => string; ie?: string | typeof InfoExtractor | null; videoKwargs?: Record<string, unknown>; description?: string | null } = {},
  ): ExtractorInfo {
    const getter = options.getter ?? ((value: string) => value);
    const seen = new Set<string>();
    const entries: ExtractorInfo[] = [];
    for (const match of matches) {
      const url = getter(match);
      if (seen.has(url)) {
        continue;
      }
      seen.add(url);
      entries.push(InfoExtractor.urlResult(url, options.ie ?? null, null, null, options.videoKwargs ?? {}));
    }
    return InfoExtractor.playlistResult(entries, options.playlistId ?? null, options.playlistTitle ?? null, options.description ?? null);
  }

  protected playlistFromMatches(
    matches: Iterable<string>,
    options: { playlistId?: string | null; playlistTitle?: string | null; getter?: (value: string) => string; ie?: string | typeof InfoExtractor | null; videoKwargs?: Record<string, unknown>; description?: string | null } = {},
  ): ExtractorInfo {
    return InfoExtractor.playlistFromMatches(matches, options);
  }

  protected genericId(url: string): string {
    const parsed = URL.canParse(url) ? new URL(url) : null;
    const leaf = parsed?.pathname.split("/").filter(Boolean).at(-1) ?? url;
    return leaf.replace(/\.[a-z0-9]+$/i, "") || parsed?.hostname || url;
  }

  protected genericTitle(url: string): string {
    return this.genericId(url).replaceAll(/[_-]+/g, " ");
  }

  protected ogSearchTitle(webpage: string): string | null {
    return this.ogSearchProperty("title", webpage, false);
  }

  protected ogSearchDescription(webpage: string): string | null {
    return this.ogSearchProperty("description", webpage, false);
  }

  protected ogSearchProperty(property: string, webpage: string, fatal = true): string | null {
    const escaped = RegExp.escape(property);
    const result = this.searchRegex(
      [
        new RegExp(`<meta[^>]+(?:property|name)=["']og:${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']og:${escaped}["']`, "i"),
      ],
      webpage,
      `OpenGraph ${property}`,
      { fatal },
    );
    return typeof result === "string" ? htmlUnescape(result) : null;
  }

  protected htmlExtractTitle(webpage: string): string | null {
    const title = this.searchRegex(/<title\b[^>]*>([^<]+)<\/title>/i, webpage, "title", { fatal: false });
    return typeof title === "string" ? htmlUnescape(title.trim()) : null;
  }

  protected extractM3u8Formats(
    m3u8Url: string,
    _videoId: string,
    ext = "mp4",
    options: { entryProtocol?: string; m3u8Id?: string } = {},
  ): Array<Record<string, unknown>> {
    return [{
      url: m3u8Url,
      ext,
      protocol: options.entryProtocol ?? "m3u8_native",
      format_id: options.m3u8Id ?? "hls",
      manifest_url: m3u8Url,
    }];
  }

  protected createRequest(urlOrRequest: string | URL | Request, options: DownloadOptions = {}): Request {
    const request = urlOrRequest instanceof Request ? urlOrRequest : new YtdlRequest(String(urlOrRequest));
    const url = new URL(request.url);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== null && value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    return new YtdlRequest(url, {
      method: options.data ? "POST" : request.method,
      headers: { ...Object.fromEntries(request.headers), ...headersRecord(options.headers) },
      body: options.data ?? null,
    });
  }

  protected async urlopen(request: Request): Promise<Response> {
    if (this.downloader?.urlopen) {
      return await this.downloader.urlopen(request);
    }
    return await fetch(request);
  }

  private maybeFakeIpAndRetry(_countries: readonly string[]): boolean {
    return false;
  }
}

export const SearchInfoExtractor = InfoExtractor;

async function decodeResponseText(response: Response, encoding: string | null): Promise<string> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  const decoder = new TextDecoder((encoding ?? guessEncoding(response.headers.get("content-type"), bytes)) as ConstructorParameters<typeof TextDecoder>[0], { fatal: false });
  return decoder.decode(bytes);
}

function guessEncoding(contentType: string | null, bytes: Uint8Array): string {
  const charset = /[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\s*;\s*charset=(.+)/.exec(contentType ?? "")?.[1];
  if (charset) {
    return charset;
  }
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 1024));
  return /<meta[^>]+charset=['"]?([^'")\s/>]+)/i.exec(head)?.[1] ?? (bytes[0] === 0xff && bytes[1] === 0xfe ? "utf-16le" : "utf-8");
}

function canAcceptStatusCode(status: number, expected: DownloadOptions["expected_status"]): boolean {
  if (expected === null || expected === undefined) {
    return false;
  }
  if (typeof expected === "function") {
    return expected(status);
  }
  return Array.isArray(expected) ? expected.includes(status) : expected === status;
}

function groupValue(match: RegExpExecArray, group: string | number): string {
  if (typeof group === "number") {
    return match[group] ?? "";
  }
  return match.groups?.[group] ?? "";
}

function headersRecord(headers: ConstructorParameters<typeof Headers>[0] | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }
  return Object.fromEntries(new Headers(headers));
}

function htmlUnescape(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
