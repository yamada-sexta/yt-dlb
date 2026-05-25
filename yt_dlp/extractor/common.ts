// Source: yt_dlp/extractor/common.py
// Port note: extractor IO is async and uses Bun/Web Request/Response primitives.

import { compatEtreeFromstring, type XmlElement } from "../compat/index.ts";
import type { DownloaderHost } from "../downloader/common.ts";
import { NotImplementedError } from "../errors.ts";
import { Request as YtdlRequest } from "../networking/common.ts";
import {
  cleanHtml,
  determineExt,
  ExtractorError,
  floatOrNone,
  GeoRestrictedError,
  intOrNone,
  mimetype2ext,
  NO_DEFAULT,
  parseDuration,
  parseIso8601,
  parseResolution,
  RegexNotFoundError,
  stripOrNone,
  strOrNone,
  UnsupportedError,
  truncateString,
  urlOrNone,
  urljoin,
  jsToJson,
  js_to_json,
  stripJsonp,
  strip_jsonp,
  traverseObj,
  traverse_obj,
} from "../utils/index.ts";
import { z } from "zod";

const JsonObjectSchema = z.record(z.string(), z.unknown());
const JsonArraySchema = z.array(z.unknown());

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
  query?: Record<string, string | number | boolean | readonly (string | number | boolean)[] | null | undefined>;
  expected_status?: number | readonly number[] | ((status: number) => boolean) | null;
  transform_source?: (source: string) => string;
}

export abstract class InfoExtractor {
  static readonly _VALID_URL: string | RegExp | readonly (string | RegExp)[] | false = false;
  static readonly _WORKING: boolean = true;
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

  protected async downloadJson<T = unknown>(urlOrRequest: string | URL | Request, videoId: string, options: DownloadOptions & { fatal: false }): Promise<T | false | null>;
  protected async downloadJson<T = unknown>(urlOrRequest: string | URL | Request, videoId: string, options?: DownloadOptions): Promise<T | false>;
  protected async downloadJson<T = unknown>(urlOrRequest: string | URL | Request, videoId: string, options: DownloadOptions = {}): Promise<T | false | null> {
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
        return null;
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
    options: { endPattern?: string; containsPattern?: string; fatal?: boolean; defaultValue?: T | typeof NO_DEFAULT; transform_source?: (source: string) => string | null } = {},
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
    const transformed = options.transform_source ? options.transform_source(jsonString) : jsonString;
    if (transformed === null) {
      return options.defaultValue === NO_DEFAULT || options.defaultValue === undefined ? null : options.defaultValue;
    }
    try {
      return JSON.parse(transformed) as T;
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

  protected parseJson<T = unknown>(jsonString: string, videoId: string, options: { fatal?: boolean; transform_source?: (source: string) => string | null } = {}): T | null {
    const transformed = options.transform_source ? options.transform_source(jsonString) : jsonString;
    if (transformed === null) {
      return null;
    }
    try {
      return JSON.parse(transformed) as T;
    } catch (error) {
      if (options.fatal === false) {
        this.reportWarning(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`, videoId);
        return null;
      }
      throw new ExtractorError("Failed to parse JSON", { cause: error, videoId });
    }
  }

  protected htmlSearchMeta(name: string | readonly string[], webpage: string, displayName = "metadata", fatal = false): string | null {
    const names = Array.isArray(name) ? name : [name];
    let bestIndex = Number.POSITIVE_INFINITY;
    let result: string | null = null;
    new HTMLRewriter()
      .on("meta", {
        element(element) {
          const key = element.getAttribute("name") ?? element.getAttribute("property");
          const index = key === null ? -1 : names.indexOf(key);
          if (index >= 0 && index < bestIndex) {
            bestIndex = index;
            result = normalizeMetaContentAttribute(webpage, element.getAttribute("content"));
          }
        },
      })
      .transform(webpage);
    if (result !== null) {
      return htmlUnescape(result);
    }
    if (fatal) {
      throw new RegexNotFoundError(`Unable to extract ${displayName}`);
    }
    this.reportWarning(`unable to extract ${displayName}`);
    return null;
  }

  protected searchJsonLd(
    webpage: string | false,
    videoId: string,
    options: { defaultValue?: Record<string, unknown>; expectedType?: string; expected_type?: string } = {},
  ): Record<string, unknown> {
    if (webpage === false) {
      return options.defaultValue ?? {};
    }
    const expectedType = options.expectedType ?? options.expected_type;
    for (const json of collectScriptText(webpage, 'script[type="application/ld+json" i]')) {
      if (!json) {
        continue;
      }
      const parsed = this.parseJson<unknown>(json, videoId, { fatal: false });
      for (const candidate of collectJsonLdCandidates(parsed)) {
        if (expectedType && !jsonLdIsType(candidate, expectedType)) {
          continue;
        }
        const normalized = normalizeJsonLdInfo(candidate, expectedType);
        if (Object.keys(normalized).length) {
          return normalized;
        }
        return candidate;
      }
    }
    return options.defaultValue ?? {};
  }

  protected *yieldJsonLd(webpage: string, videoId: string): Generator<Record<string, unknown>> {
    for (const json of collectScriptText(webpage, 'script[type="application/ld+json" i]')) {
      if (!json) {
        continue;
      }
      const parsed = this.parseJson<unknown>(json, videoId, { fatal: false });
      for (const candidate of collectJsonLdCandidates(parsed)) {
        yield candidate;
      }
    }
  }

  protected _yield_json_ld(webpage: string, videoId: string): Generator<Record<string, unknown>> {
    return this.yieldJsonLd(webpage, videoId);
  }


  protected searchNextjsData<T = unknown>(webpage: string, videoId: string, options: { defaultValue?: T | null; fatal?: boolean } = {}): T | null {
    const json = collectScriptText(webpage, "script#__NEXT_DATA__").at(0);
    if (json === undefined) {
      if ("defaultValue" in options) {
        return options.defaultValue ?? null;
      }
      if (options.fatal === false) {
        return {} as T;
      }
      throw new RegexNotFoundError("Unable to extract Next.js data");
    }
    if (!json.trim()) {
      return options.defaultValue ?? null;
    }
    return this.parseJson<T>(json, videoId, { fatal: options.fatal ?? true });
  }

  protected searchNextjsV13Data(webpage: string | null | undefined, videoId: string | null, fatal = true): Record<string, unknown> {
    const nextjsData: Record<string, unknown> = {};
    if (!webpage) {
      if (!fatal) {
        return nextjsData;
      }
      throw new RegexNotFoundError("Unable to extract Next.js v13 data");
    }

    let flightText = "";
    for (const scriptText of collectScriptText(webpage, "script")) {
      const source = scriptText.trim();
      if (!source.startsWith("self.__next_f.push(") || !source.endsWith(")")) {
        continue;
      }
      const segment = this.parseJson<unknown>(source.slice("self.__next_f.push(".length, -1), videoId ?? "", { fatal });
      if (!Array.isArray(segment) || segment.length !== 2) {
        this.writeDebug(`${videoId ?? "unknown"}: Unsupported next.js flight data structure detected`);
        continue;
      }
      const [payloadType, chunk] = segment;
      if (payloadType === 1 && typeof chunk === "string") {
        flightText += chunk;
      }
    }

    for (const line of flightText.split(/\r?\n/)) {
      const trimmed = line.trimStart();
      const separator = trimmed.indexOf(":");
      if (separator < 0) {
        continue;
      }
      const prefix = trimmed.slice(0, separator);
      const body = trimmed.slice(separator + 1);
      if (!/^[0-9a-f]+$/.test(prefix)) {
        continue;
      }
      if (body.startsWith("[") && body.endsWith("]")) {
        flattenNextjsFlightData(this.parseJson<unknown>(body, videoId ?? "", { fatal: false }), nextjsData);
      } else if (body.startsWith("{") && body.endsWith("}")) {
        const data = this.parseJson<unknown>(body, videoId ?? "", { fatal: false });
        if (data !== null) {
          nextjsData[prefix] = data;
        }
      }
    }
    return nextjsData;
  }

  protected _search_nextjs_v13_data(webpage: string | null | undefined, videoId: string | null, fatal = true): Record<string, unknown> {
    return this.searchNextjsV13Data(webpage, videoId, fatal);
  }

  protected searchNuxtJson<T = unknown>(
    webpage: string | null | undefined,
    videoId: string | null,
    options: { fatal?: boolean; defaultValue?: T | typeof NO_DEFAULT } = {},
  ): T | Record<string, unknown> {
    const passedDefault = "defaultValue" in options;
    const fallback = passedDefault ? options.defaultValue as T : undefined;
    const fatal = passedDefault ? false : options.fatal ?? true;
    if (!webpage) {
      if (passedDefault) {
        return fallback as T;
      }
      if (!fatal) {
        return {};
      }
      throw new RegexNotFoundError("Unable to extract Nuxt JSON data");
    }
    const json = collectScriptText(webpage, "script#__NUXT_DATA__").at(0);
    if (!json) {
      if (passedDefault) {
        return fallback as T;
      }
      if (!fatal) {
        return {};
      }
      throw new RegexNotFoundError("Unable to extract Nuxt JSON data");
    }
    const parsed = this.parseJson<unknown>(json, videoId ?? "", { fatal });
    const checked = z.array(z.unknown()).safeParse(parsed);
    if (!checked.success) {
      return this.nuxtJsonDefault(fatal, passedDefault, fallback as T, videoId);
    }
    return this.resolveNuxtArray<T>(checked.data, videoId, { fatal, defaultValue: passedDefault ? fallback as T : NO_DEFAULT });
  }

  protected _search_nuxt_json<T = unknown>(
    webpage: string | null | undefined,
    videoId: string | null,
    options: { fatal?: boolean; defaultValue?: T | typeof NO_DEFAULT } = {},
  ): T | Record<string, unknown> {
    return this.searchNuxtJson<T>(webpage, videoId, options);
  }

  protected searchNuxtData<T = Record<string, unknown>>(
    webpage: string,
    videoId: string,
    options: { contextName?: string; fatal?: boolean; traverse?: any } = {},
  ): T {
    const fatal = options.fatal ?? true;
    const contextName = options.contextName ?? "__NUXT__";
    const reCtx = RegExp.escape(contextName);
    const functionRe = `\\\\(function\\\\((?<arg_keys>.*?)\\\\)\\\\{\\\\s*.*?\\\\breturn\\\\s+(?<js>\\\\{.*?\\\\})\\\\s*;?\\\\s*\\\\}\\\\)\\\\s*\\\\(\\\\s*(?<arg_vals>.*?)\\\\s*\\\\)`;
    const pattern1 = new RegExp(`<script>\\s*window\\.${reCtx}\\s*=\\s*${functionRe}\\s*;?\\s*</script>`, "s");
    const pattern2 = new RegExp(`${reCtx}\\(\\s*.*?${functionRe}`, "s");

    const result = this.searchRegex(
      [pattern1, pattern2],
      webpage,
      contextName,
      {
        group: ["js", "arg_keys", "arg_vals"],
        fatal,
        defaultValue: fatal ? NO_DEFAULT : null,
      }
    );

    if (!result || !Array.isArray(result)) {
      return {} as unknown as T;
    }

    const [js, argKeys, argVals] = result;
    if (!js) {
      return {} as unknown as T;
    }

    const keys = argKeys ? argKeys.split(",") : [];
    const valsParsed = this.parseJson<unknown[]>(`[${argVals}]`, videoId, {
      transform_source: jsToJson,
      fatal,
    }) || [];

    const vars: Record<string, string> = {};
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]?.trim();
      if (key) {
        vars[key] = JSON.stringify(valsParsed[i]);
      }
    }

    const parsedJs = this.parseJson<Record<string, unknown>>(js, videoId, {
      transform_source: (code) => jsToJson(code, vars),
      fatal,
    });

    return (options.traverse ? traverseObj(parsedJs, options.traverse) : parsedJs) as unknown as T;
  }

  protected _search_nuxt_data<T = Record<string, unknown>>(
    webpage: string,
    videoId: string,
    contextName = "__NUXT__",
    options: { fatal?: boolean; traverse?: any } = {},
  ): T {
    return this.searchNuxtData<T>(webpage, videoId, { contextName, ...options });
  }


  protected resolveNuxtArray<T = unknown>(
    array: unknown[],
    videoId: string | null,
    options: { fatal?: boolean; defaultValue?: T | typeof NO_DEFAULT } = {},
  ): T | Record<string, unknown> {
    const passedDefault = options.defaultValue !== undefined && options.defaultValue !== NO_DEFAULT;
    const fallback = passedDefault ? options.defaultValue as T : undefined;
    const fatal = passedDefault ? false : options.fatal ?? true;
    if (!array.length || (Array.isArray(array[0]) && array[0].length === 0)) {
      return this.nuxtJsonDefault(fatal, passedDefault, fallback as T, videoId);
    }
    try {
      return resolveNuxtValue(array, 0, fatal) as T | Record<string, unknown> || (passedDefault ? fallback as T : {});
    } catch (error) {
      if (fatal) {
        throw new ExtractorError("Unable to resolve Nuxt JSON data", { cause: error, videoId });
      }
      if (passedDefault) {
        return fallback as T;
      }
      this.reportWarning(`Error resolving Nuxt JSON: ${error instanceof Error ? error.message : String(error)}`, videoId, true);
      return {};
    }
  }

  protected _resolve_nuxt_array<T = unknown>(
    array: unknown[],
    videoId: string | null,
    options: { fatal?: boolean; defaultValue?: T | typeof NO_DEFAULT } = {},
  ): T | Record<string, unknown> {
    return this.resolveNuxtArray<T>(array, videoId, options);
  }

  private nuxtJsonDefault<T>(fatal: boolean, passedDefault: boolean, fallback: T, videoId: string | null): T | Record<string, unknown> {
    if (fatal) {
      throw new ExtractorError("Unable to resolve Nuxt JSON data", { videoId });
    }
    if (passedDefault) {
      return fallback;
    }
    this.reportWarning("Unable to resolve Nuxt JSON data: invalid input", videoId, true);
    return {};
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

  protected yesPlaylist(
    playlistId: string | boolean | null | undefined,
    videoId: string | boolean | null | undefined,
    options: { smuggledData?: Record<string, unknown> | null; playlistLabel?: string; videoLabel?: string } = {},
  ): boolean {
    if (!playlistId || !videoId) {
      return !videoId;
    }
    const noPlaylist = options.smuggledData?.force_noplaylist;
    if (noPlaylist !== undefined && noPlaylist !== null) {
      return !noPlaylist;
    }
    const videoIdStr = videoId === true ? "" : ` ${videoId}`;
    const playlistIdStr = playlistId === true ? "" : ` ${playlistId}`;
    const playlistLabel = options.playlistLabel ?? "playlist";
    const videoLabel = options.videoLabel ?? "video";
    
    if (this.getParam("noplaylist", false)) {
      this.toScreen(`Downloading just the ${videoLabel}${videoIdStr} because of --no-playlist`);
      return false;
    }
    this.toScreen(`Downloading ${playlistLabel}${playlistIdStr} - add --no-playlist to download just the ${videoLabel}${videoIdStr}`);
    return true;
  }

  protected _yes_playlist(
    playlistId: string | boolean | null | undefined,
    videoId: string | boolean | null | undefined,
    options: { smuggledData?: Record<string, unknown> | null; playlistLabel?: string; videoLabel?: string } = {},
  ): boolean {
    return this.yesPlaylist(playlistId, videoId, options);
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

  protected protoRelativeUrl(url: string | null | undefined, scheme = "http:"): string | null {
    if (!url) {
      return null;
    }
    return url.startsWith("//") ? `${scheme}${url}` : url;
  }

  protected ogSearchTitle(webpage: string): string | null {
    return this.ogSearchProperty("title", webpage, false);
  }

  protected ogSearchDescription(webpage: string): string | null {
    return this.ogSearchProperty("description", webpage, false);
  }

  protected ogSearchThumbnail(webpage: string): string | null {
    return this.ogSearchProperty("image", webpage, false);
  }

  protected ogSearchProperty(property: string, webpage: string, fatal = true): string | null {
    const result = this.htmlSearchMeta(`og:${property}`, webpage, `OpenGraph ${property}`, fatal);
    return typeof result === "string" ? result : null;
  }

  protected rtaSearch(html: string): number | null {
    let hasRtaMeta = false;
    new HTMLRewriter()
      .on("meta", {
        element(element) {
          hasRtaMeta ||= element.getAttribute("name") === "rating"
            && element.getAttribute("content") === "RTA-5042-1996-1400-1577-RTA";
        },
      })
      .transform(html);
    if (hasRtaMeta) {
      return 18;
    }

    let ageLimit: number | null = null;
    const markers = [
      /Proudly Labeled <a href="http:\/\/www\.rtalabel\.org\/" title="Restricted to Adults">RTA<\/a>/i,
      />[^<]*you acknowledge you are at least (?<age>\d+) years old/i,
      />\s*(?:18\s+U(?:\.S\.C\.|SC)\s+)?(?:§+\s*)?2257\b/i,
    ];
    for (const marker of markers) {
      const match = marker.exec(html);
      if (match) {
        ageLimit = Math.max(ageLimit ?? 0, Number.parseInt(match.groups?.age ?? "18", 10));
      }
    }
    return ageLimit;
  }

  protected _rta_search(html: string): number | null {
    return this.rtaSearch(html);
  }

  protected htmlExtractTitle(webpage: string): string | null {
    let title = "";
    let found = false;
    new HTMLRewriter()
      .on("title", {
        element() {
          found = true;
        },
        text(chunk) {
          title += chunk.text;
        },
      })
      .transform(webpage);
    return found ? htmlUnescape(title.trim()) : null;
  }

  protected parseHtml5MediaEntries(
    baseUrl: string,
    webpage: string,
    videoId: string | null,
    options: {
      m3u8Id?: string | null;
      m3u8EntryProtocol?: string;
      mpdId?: string | null;
      preference?: number | null;
      quality?: number | null;
      headers?: Record<string, string>;
    } = {},
  ): Array<Record<string, unknown>> {
    const entries: Array<Record<string, unknown>> = [];
    const mediaStack: Html5MediaInfo[] = [];
    const mediaSelectors = [
      "video",
      "audio",
      "amp-video",
      "amp-audio",
      "dl8-video",
      "dl8-audio",
      "dl8-live-video",
      "dl8-live-audio",
    ];
    let rewriter = new HTMLRewriter();
    for (const selector of mediaSelectors) {
      rewriter = rewriter.on(selector, {
        element: (element) => {
          const mediaType = element.tagName.endsWith("audio") ? "audio" : "video";
          const attrs = attrsFromElement(element);
          const media = createHtml5MediaInfo(attrs, baseUrl, mediaType);
          const src = stripOrNone(dictFirst(attrs, ["src", "data-video-src", "data-src", "data-source"]));
          if (src) {
            const [, formats] = this.html5MediaFormats(src, mediaType, baseUrl, videoId, parseHtml5ContentType(attrs.type), options);
            media.formats.push(...formats);
          }
          if (element.selfClosing || !element.canHaveContent) {
            appendHtml5MediaEntry(entries, media, baseUrl, options.headers);
            return;
          }
          mediaStack.push(media);
          element.onEndTag(() => {
            const completed = mediaStack.pop();
            if (completed) {
              appendHtml5MediaEntry(entries, completed, baseUrl, options.headers);
            }
          });
        },
      });
    }
    rewriter
      .on("source", {
        element: (element) => {
          const media = mediaStack.at(-1);
          if (!media) {
            return;
          }
          const attrs = attrsFromElement(element);
          const src = stripOrNone(dictFirst(attrs, ["src", "data-video-src", "data-src", "data-source"]));
          if (!src) {
            return;
          }
          const typeInfo = parseHtml5ContentType(attrs.type);
          const [isPlainUrl, formats] = this.html5MediaFormats(src, media.mediaType, baseUrl, videoId, typeInfo, options);
          if (!isPlainUrl) {
            media.formats.push(...formats);
            return;
          }
          const labels = ["label", "title"].map((key) => stripOrNone(attrs[key])).filter((value): value is string => value !== null);
          let width = intOrNone(attrs.width);
          let height = intOrNone(attrs.height) ?? intOrNone(attrs.res);
          if (!width || !height) {
            for (const label of labels) {
              const resolution = parseResolution(label);
              width ||= resolution.width ?? null;
              height ||= resolution.height ?? null;
            }
          }
          const format = {
            ...typeInfo,
            ...formats[0],
            ...(width ? { width } : {}),
            ...(height ? { height } : {}),
            ...(parseBitrate(labels) ? { tbr: parseBitrate(labels) } : {}),
            ...((attrs.label ?? attrs.title) ? { format_id: attrs.label ?? attrs.title } : {}),
          };
          media.formats.push(format);
        },
      })
      .on("track", {
        element: (element) => {
          const media = mediaStack.at(-1);
          if (!media) {
            return;
          }
          const attrs = attrsFromElement(element);
          const kind = attrs.kind;
          if (kind && kind !== "subtitles" && kind !== "captions") {
            return;
          }
          const src = stripOrNone(attrs.src);
          if (!src) {
            return;
          }
          const lang = attrs.srclang ?? attrs.lang ?? attrs.label ?? "und";
          media.subtitles[lang] ??= [];
          media.subtitles[lang].push({ url: absoluteHtml5Url(baseUrl, src) });
        },
      })
      .transform(webpage);
    return entries;
  }

  protected _parse_html5_media_entries(
    baseUrl: string,
    webpage: string,
    videoId: string | null,
    m3u8Id: string | null = null,
    m3u8EntryProtocol = "m3u8_native",
    mpdId: string | null = null,
    preference: number | null = null,
    quality: number | null = null,
    headers: Record<string, string> | null = null,
  ): Array<Record<string, unknown>> {
    return this.parseHtml5MediaEntries(baseUrl, webpage, videoId, {
      m3u8Id,
      m3u8EntryProtocol,
      mpdId,
      preference,
      quality,
      headers: headers ?? undefined,
    });
  }

  private html5MediaFormats(
    src: string,
    mediaType: string,
    baseUrl: string,
    videoId: string | null,
    typeInfo: Record<string, unknown>,
    options: { m3u8Id?: string | null; m3u8EntryProtocol?: string; mpdId?: string | null },
  ): [boolean, Array<Record<string, unknown>>] {
    const fullUrl = absoluteHtml5Url(baseUrl, src) ?? src;
    const ext = typeof typeInfo.ext === "string" ? typeInfo.ext : determineExt(fullUrl);
    if (ext === "m3u8") {
      return [false, this.extractM3u8Formats(fullUrl, videoId ?? "", "mp4", {
        entryProtocol: options.m3u8EntryProtocol ?? "m3u8_native",
        m3u8Id: options.m3u8Id ?? undefined,
      })];
    }
    if (ext === "mpd") {
      return [false, this.extractMpdFormats(fullUrl, videoId ?? "", { mpdId: options.mpdId ?? undefined, fatal: false })];
    }
    return [true, [{
      url: fullUrl,
      ...(mediaType === "audio" ? { vcodec: "none" } : {}),
      ext,
    }]];
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

  protected extractM3u8FormatsAndSubtitles(
    m3u8Url: string,
    videoId: string,
    ext = "mp4",
    options: { entryProtocol?: string; m3u8Id?: string; live?: boolean } = {},
  ): [Array<Record<string, unknown>>, Record<string, unknown[]>] {
    void m3u8Url;
    void videoId;
    void ext;
    void options;
    throw new NotImplementedError("HLS manifest subtitle extraction");
  }

  protected extractMpdFormatsAndSubtitles(
    mpdUrl: string,
    videoId: string,
    options: { mpdId?: string; fatal?: boolean } = {},
  ): [Array<Record<string, unknown>>, Record<string, unknown[]>] {
    void mpdUrl;
    void videoId;
    void options;
    throw new NotImplementedError("DASH manifest subtitle extraction");
  }

  protected mergeSubtitles(
    source: Record<string, unknown[]> | null | undefined,
    target: Record<string, unknown[]> = {},
  ): Record<string, unknown[]> {
    for (const [lang, entries] of Object.entries(source ?? {})) {
      target[lang] ??= [];
      target[lang].push(...entries);
    }
    return target;
  }

  protected extractF4mFormats(
    f4mUrl: string,
    _videoId: string,
    options: { f4mId?: string; fatal?: boolean } = {},
  ): Array<Record<string, unknown>> {
    return [{
      url: f4mUrl,
      protocol: "f4m",
      format_id: options.f4mId ?? "hds",
      manifest_url: f4mUrl,
    }];
  }

  protected extractSmilFormats(smilUrl: string, _videoId: string, options: { smilId?: string; fatal?: boolean } = {}): Array<Record<string, unknown>> {
    void smilUrl;
    void _videoId;
    void options;
    throw new NotImplementedError("SMIL manifest format extraction");
  }

  protected extractMpdFormats(mpdUrl: string, _videoId: string, options: { mpdId?: string; fatal?: boolean } = {}): Array<Record<string, unknown>> {
    return [{
      url: mpdUrl,
      protocol: "http_dash_segments",
      format_id: options.mpdId ?? "dash",
      manifest_url: mpdUrl,
    }];
  }

  protected findJwplayerData(
    webpage: string,
    videoId: string | null = null,
    transformSource: (source: string) => string | null = jsToJson,
  ): Record<string, unknown> | null {
    const setupPattern = /\bjwplayer\s*\(\s*(["'])(?:(?!\1)[\s\S])+?\1\s*\)(?:(?!<\/script>)[\s\S])*?\.\s*(?:setup|load)\s*\(/g;
    for (const match of webpage.matchAll(setupPattern)) {
      const openIndex = (match.index ?? 0) + match[0].length - 1;
      const closeIndex = findMatchingJsBracket(webpage, openIndex);
      if (closeIndex === -1) {
        continue;
      }
      const source = webpage.slice(openIndex + 1, closeIndex).trim();
      const transformed = transformSource(source);
      if (transformed === null) {
        continue;
      }
      try {
        const parsed = JSON.parse(transformed) as unknown;
        const checked = JsonObjectSchema.safeParse(parsed);
        if (checked.success) {
          return checked.data;
        }
      } catch (error) {
        this.reportWarning(`Unable to extract JWPlayer data - Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}`, videoId ?? "");
      }
    }
    return null;
  }

  protected _find_jwplayer_data(
    webpage: string,
    videoId: string | null = null,
    transformSource: (source: string) => string | null = jsToJson,
  ): Record<string, unknown> | null {
    return this.findJwplayerData(webpage, videoId, transformSource);
  }

  protected extractJwplayerData(
    webpage: string,
    videoId: string | null,
    options: {
      requireTitle?: boolean;
      transformSource?: (source: string) => string | null;
      m3u8Id?: string;
      mpdId?: string;
      rtmpParams?: Record<string, unknown>;
      baseUrl?: string | null;
    } = {},
  ): ExtractorInfo | ExtractorInfo[] {
    const jwplayerData = this.findJwplayerData(webpage, videoId, options.transformSource ?? jsToJson);
    return this.parseJwplayerData(jwplayerData, videoId, options);
  }

  protected _extract_jwplayer_data(...args: Parameters<InfoExtractor["extractJwplayerData"]>): ReturnType<InfoExtractor["extractJwplayerData"]> {
    return this.extractJwplayerData(...args);
  }

  protected parseJwplayerData(
    jwplayerData: Record<string, unknown> | null,
    videoId: string | null = null,
    options: { requireTitle?: boolean; m3u8Id?: string; mpdId?: string; rtmpParams?: Record<string, unknown>; baseUrl?: string | null } = {},
  ): ExtractorInfo | ExtractorInfo[] {
    if (!jwplayerData) {
      return [];
    }
    const requireTitle = options.requireTitle ?? true;
    const playlistItems = JsonArraySchema.safeParse(jwplayerData.playlist);
    const items = playlistItems.success ? playlistItems.data : [jwplayerData.playlist ?? jwplayerData];
    const entries: ExtractorInfo[] = [];
    for (const rawItem of items) {
      const videoData = JsonObjectSchema.safeParse(rawItem);
      if (!videoData.success) {
        continue;
      }
      const sourceList = JsonArraySchema.safeParse(videoData.data.sources).success ? JsonArraySchema.parse(videoData.data.sources) : [videoData.data];
      const thisVideoId = videoId ?? strOrNone(videoData.data.mediaid) ?? undefined;
      const formats = this.parseJwplayerFormats(sourceList, thisVideoId ?? null, {
        m3u8Id: options.m3u8Id,
        mpdId: options.mpdId,
        rtmpParams: options.rtmpParams,
        baseUrl: options.baseUrl,
      });
      const subtitles: Record<string, Array<Record<string, unknown>>> = {};
      for (const rawTrack of jsonLdArray(videoData.data.tracks)) {
        const track = JsonObjectSchema.safeParse(rawTrack);
        const kind = strOrNone(track.success ? track.data.kind : null)?.toLowerCase();
        if (!track.success || (kind !== "captions" && kind !== "subtitles")) {
          continue;
        }
        const trackUrl = urljoin(options.baseUrl, this.protoRelativeUrl(strOrNone(track.data.file)));
        if (!trackUrl) {
          continue;
        }
        const language = strOrNone(track.data.label) ?? "en";
        subtitles[language] ??= [];
        subtitles[language].push({ url: this.protoRelativeUrl(trackUrl) });
      }
      const entry: ExtractorInfo = {
        id: thisVideoId,
        title: jsonLdString(requireTitle ? videoData.data.title : videoData.data.title) ?? undefined,
        description: cleanHtml(strOrNone(videoData.data.description)) ?? undefined,
        thumbnail: urljoin(options.baseUrl, this.protoRelativeUrl(strOrNone(videoData.data.image))) ?? undefined,
        timestamp: intOrNone(videoData.data.pubdate) ?? undefined,
        duration: floatOrNone(jwplayerData.duration ?? videoData.data.duration) ?? undefined,
        subtitles,
        alt_title: cleanHtml(strOrNone(videoData.data.subtitle)) ?? undefined,
        genre: cleanHtml(strOrNone(videoData.data.genre)) ?? undefined,
        channel: cleanHtml(strOrNone(videoData.data.category ?? videoData.data.channel)) ?? undefined,
        season_number: intOrNone(videoData.data.season) ?? undefined,
        episode_number: intOrNone(videoData.data.episode) ?? undefined,
        release_year: intOrNone(videoData.data.releasedate) ?? undefined,
        age_limit: intOrNone(videoData.data.age_restriction) ?? undefined,
      };
      if (formats.length === 1 && typeof formats[0]?.url === "string" && /^(?:http|\/\/).*(?:youtube\.com|youtu\.be)\/.+/.test(formats[0].url)) {
        entry._type = "url_transparent";
        entry.url = formats[0].url;
      } else {
        entry.formats = formats;
      }
      entries.push(filterUndefined(entry));
    }
    return entries.length === 1 ? entries[0]! : this.playlistResult(entries);
  }

  protected _parse_jwplayer_data(...args: Parameters<InfoExtractor["parseJwplayerData"]>): ReturnType<InfoExtractor["parseJwplayerData"]> {
    return this.parseJwplayerData(...args);
  }

  protected parseJwplayerFormats(
    jwplayerSourcesData: unknown[],
    videoId: string | null = null,
    options: { m3u8Id?: string; mpdId?: string; rtmpParams?: Record<string, unknown>; baseUrl?: string | null } = {},
  ): Array<Record<string, unknown>> {
    const urls = new Set<string>();
    const formats: Array<Record<string, unknown>> = [];
    for (const rawSource of jwplayerSourcesData) {
      const source = JsonObjectSchema.safeParse(rawSource);
      if (!source.success) {
        continue;
      }
      const sourceUrl = urljoin(options.baseUrl, this.protoRelativeUrl(strOrNone(source.data.file)));
      if (!sourceUrl || urls.has(sourceUrl)) {
        continue;
      }
      urls.add(sourceUrl);
      const sourceType = strOrNone(source.data.type, "") ?? "";
      const ext = determineExt(sourceUrl, mimetype2ext(sourceType));
      if (sourceType === "hls" || ext === "m3u8" || sourceUrl.includes("format=m3u8-aapl")) {
        formats.push(...this.extractM3u8Formats(sourceUrl, videoId ?? "", "mp4", { entryProtocol: "m3u8_native", m3u8Id: options.m3u8Id }));
      } else if (sourceType === "dash" || ext === "mpd" || sourceUrl.includes("format=mpd-time-csf")) {
        formats.push(...this.extractMpdFormats(sourceUrl, videoId ?? "", { mpdId: options.mpdId, fatal: false }));
      } else if (ext === "smil") {
        formats.push(...this.extractSmilFormats(sourceUrl, videoId ?? "", { fatal: false }));
      } else if (sourceType.startsWith("audio") || ["oga", "aac", "mp3", "mpeg", "vorbis"].includes(ext)) {
        formats.push({ url: sourceUrl, vcodec: "none", ext });
      } else {
        const formatId = strOrNone(source.data.label);
        const height = intOrNone(source.data.height) ?? (formatId ? parseResolution(formatId).height : undefined);
        const format: Record<string, unknown> = {
          url: sourceUrl,
          width: intOrNone(source.data.width) ?? undefined,
          height,
          tbr: intOrNone(source.data.bitrate, 1000) ?? undefined,
          filesize: intOrNone(source.data.filesize) ?? undefined,
          ext,
          format_id: formatId ?? undefined,
        };
        if (sourceUrl.startsWith("rtmp")) {
          format.ext = "flv";
          const rtmpParts = /^(?<url>.*?)(?<prefix>(?:mp4|mp3|flv):)(?<playPath>.*)$/.exec(sourceUrl);
          if (rtmpParts?.groups) {
            format.url = rtmpParts.groups.url;
            format.play_path = `${rtmpParts.groups.prefix}${rtmpParts.groups.playPath}`;
          }
          Object.assign(format, options.rtmpParams ?? {});
        }
        formats.push(filterUndefined(format));
      }
    }
    return formats;
  }

  protected _parse_jwplayer_formats(...args: Parameters<InfoExtractor["parseJwplayerFormats"]>): ReturnType<InfoExtractor["parseJwplayerFormats"]> {
    return this.parseJwplayerFormats(...args);
  }

  protected createRequest(urlOrRequest: string | URL | Request, options: DownloadOptions = {}): Request {
    const request = urlOrRequest instanceof Request ? urlOrRequest : new YtdlRequest(String(urlOrRequest));
    const url = new URL(request.url);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, String(item));
        }
      } else if (value !== null && value !== undefined) {
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

function collectScriptText(webpage: string, selector: string): string[] {
  const scripts: string[] = [];
  let current: string | null = null;
  new HTMLRewriter()
    .on(selector, {
      element(element) {
        current = "";
        element.onEndTag(() => {
          if (current !== null) {
            scripts.push(current.trim());
            current = null;
          }
        });
      },
      text(chunk) {
        if (current !== null) {
          current += chunk.text;
        }
      },
    })
    .transform(webpage);
  return scripts;
}

function collectJsonLdCandidates(value: unknown): Record<string, unknown>[] {
  const array = JsonArraySchema.safeParse(value);
  if (array.success) {
    return array.data.flatMap((item) => collectJsonLdCandidates(item));
  }
  const object = JsonObjectSchema.safeParse(value);
  if (!object.success) {
    return [];
  }
  const graph = JsonArraySchema.safeParse(object.data["@graph"]);
  if (graph.success && (Object.keys(object.data).length === 2 || graph.data.some((item) => JsonObjectSchema.safeParse(item).success))) {
    return graph.data.flatMap((item) => collectJsonLdCandidates(item));
  }
  return [object.data];
}

function normalizeJsonLdInfo(node: Record<string, unknown>, expectedType?: string): Record<string, unknown> {
  const info: Record<string, unknown> = {};
  const types = jsonLdTypes(node);

  if (jsonLdHasType(types, "TVEpisode", "Episode", "PodcastEpisode")) {
    const episodeName = jsonLdString(node.name);
    setDefined(info, "episode", episodeName);
    setDefined(info, "episode_number", intOrNone(node.episodeNumber));
    setDefined(info, "description", jsonLdString(node.description));
    if (!info.title) {
      setDefined(info, "title", episodeName);
    }
    const season = JsonObjectSchema.safeParse(node.partOfSeason);
    if (season.success && jsonLdIsType(season.data, "TVSeason", "Season", "CreativeWorkSeason")) {
      setDefined(info, "season", jsonLdString(season.data.name));
      setDefined(info, "season_number", intOrNone(season.data.seasonNumber));
    }
    const series = JsonObjectSchema.safeParse(node.partOfSeries ?? node.partOfTVSeries);
    if (series.success && jsonLdIsType(series.data, "TVSeries", "Series", "CreativeWorkSeries")) {
      setDefined(info, "series", jsonLdString(series.data.name));
    }
  } else if (jsonLdHasType(types, "Movie")) {
    setDefined(info, "title", jsonLdString(node.name));
    setDefined(info, "description", jsonLdString(node.description));
    setDefined(info, "duration", parseDuration(jsonLdString(node.duration)));
    setDefined(info, "timestamp", parseIso8601(jsonLdString(node.dateCreated)));
  } else if (jsonLdHasType(types, "Article", "NewsArticle")) {
    setDefined(info, "timestamp", parseIso8601(jsonLdString(node.datePublished)));
    setDefined(info, "title", jsonLdString(node.headline ?? node.name));
    setDefined(info, "description", jsonLdString(node.articleBody ?? node.description));
    for (const key of ["video", "subjectOf"] as const) {
      const video = jsonLdArray(node[key])
        .map((item) => JsonObjectSchema.safeParse(item))
        .find((item) => item.success && jsonLdIsType(item.data, "VideoObject"));
      if (video?.success) {
        extractJsonLdVideoObject(video.data, info);
        break;
      }
    }
  } else if (jsonLdHasType(types, "VideoObject", "AudioObject")) {
    extractJsonLdVideoObject(node, info);
  }

  const video = JsonObjectSchema.safeParse(node.video);
  if (video.success && jsonLdIsType(video.data, "VideoObject")) {
    extractJsonLdVideoObject(video.data, info);
  }

  if (expectedType && !jsonLdHasType(types, expectedType) && !Object.keys(info).length) {
    return {};
  }
  return info;
}

function extractJsonLdVideoObject(node: Record<string, unknown>, info: Record<string, unknown>): void {
  setDefined(info, "url", urlOrNone(jsonLdString(node.contentUrl)));
  setDefined(info, "ext", mimetype2ext(jsonLdString(node.encodingFormat), undefined));
  setDefined(info, "title", jsonLdString(node.name ?? node.headline));
  setDefined(info, "description", jsonLdString(node.description));
  const thumbnails = jsonLdThumbnails(node);
  if (thumbnails.length) {
    info.thumbnails = thumbnails;
    setDefined(info, "thumbnail", thumbnails[0]?.url);
  }
  setDefined(info, "duration", parseDuration(jsonLdString(node.duration)));
  setDefined(info, "timestamp", parseIso8601(jsonLdString(node.uploadDate ?? node.datePublished)));
  setDefined(info, "width", intOrNone(node.width));
  setDefined(info, "height", intOrNone(node.height));
  setDefined(info, "view_count", intOrNone(node.interactionCount));
  extractJsonLdInteractionStatistic(node, info);
  extractJsonLdChapters(node, info);
}

function extractJsonLdInteractionStatistic(node: Record<string, unknown>, info: Record<string, unknown>): void {
  for (const statistic of jsonLdArray(node.interactionStatistic).flatMap((item) => {
    const parsed = JsonObjectSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  })) {
    const count = intOrNone(statistic.userInteractionCount);
    if (count === null) {
      continue;
    }
    const interactionType = JsonObjectSchema.safeParse(statistic.interactionType);
    const actionType = interactionType.success ? jsonLdTypes(interactionType.data) : jsonLdTypes(statistic);
    if (!actionType.length || jsonLdHasType(actionType, "WatchAction")) {
      info.view_count ??= count;
    } else if (jsonLdHasType(actionType, "LikeAction")) {
      info.like_count ??= count;
    } else if (jsonLdHasType(actionType, "DislikeAction")) {
      info.dislike_count ??= count;
    } else if (jsonLdHasType(actionType, "CommentAction")) {
      info.comment_count ??= count;
    }
  }
}

function extractJsonLdChapters(node: Record<string, unknown>, info: Record<string, unknown>): void {
  const clips = jsonLdArray(node.hasPart).flatMap((item) => {
    const clip = JsonObjectSchema.safeParse(item);
    if (!clip.success || !jsonLdIsType(clip.data, "Clip")) {
      return [];
    }
    return [{
      title: jsonLdString(clip.data.name),
      start_time: jsonLdNumber(clip.data.startOffset),
      end_time: jsonLdNumber(clip.data.endOffset),
    }];
  });
  if (!clips.length) {
    return;
  }
  const duration = parseDuration(jsonLdString(node.duration));
  const chapters = clips.map((clip, index) => ({
    title: clip.title,
    start_time: clip.start_time ?? (index === 0 ? 0 : clips[index - 1]?.end_time ?? null),
    end_time: clip.end_time ?? clips[index + 1]?.start_time ?? (index === clips.length - 1 ? duration : null),
  }));
  if (chapters.every((chapter) => chapter.title !== null && chapter.start_time !== null && chapter.end_time !== null)) {
    info.chapters = chapters;
  }
}

function jsonLdThumbnails(node: Record<string, unknown>): Array<{ url: string }> {
  const thumbnails: Array<{ url: string }> = [];
  for (const key of ["thumbnailUrl", "thumbnailURL", "thumbnail_url"] as const) {
    for (const value of jsonLdArray(node[key])) {
      const url = jsonLdUrl(value);
      if (url) {
        thumbnails.push({ url });
      }
    }
    if (thumbnails.length) {
      return thumbnails;
    }
  }
  return thumbnails;
}

function jsonLdArray(value: unknown): unknown[] {
  if (value === null || value === undefined) {
    return [];
  }
  const array = JsonArraySchema.safeParse(value);
  return array.success ? array.data : [value];
}

function jsonLdTypes(node: Record<string, unknown>): string[] {
  return jsonLdArray(node["@type"]).flatMap((value) => {
    const parsed = z.string().safeParse(value);
    if (!parsed.success) {
      return [];
    }
    return [parsed.data.replace(/[/#]$/, "").split(/[/#]/).pop() ?? parsed.data];
  });
}

function jsonLdIsType(node: Record<string, unknown>, ...types: string[]): boolean {
  return jsonLdHasType(jsonLdTypes(node), ...types);
}

function jsonLdHasType(actualTypes: readonly string[], ...types: string[]): boolean {
  return actualTypes.some((actualType) => types.includes(actualType));
}

function jsonLdString(value: unknown): string | null {
  const parsed = z.string().safeParse(value);
  return parsed.success ? htmlUnescape(parsed.data) : null;
}

function jsonLdNumber(value: unknown): number | null {
  const parsed = z.union([z.number(), z.string()]).safeParse(value);
  if (!parsed.success) {
    return null;
  }
  const number = typeof parsed.data === "number" ? parsed.data : Number.parseFloat(parsed.data);
  return Number.isFinite(number) ? number : null;
}

function jsonLdUrl(value: unknown): string | null {
  const object = JsonObjectSchema.safeParse(value);
  const url = jsonLdString(object.success ? object.data.url : value);
  if (!url) {
    return null;
  }
  return urlOrNone(url.startsWith("//") ? `https:${url}` : url);
}

function setDefined(record: Record<string, unknown>, key: string, value: unknown): void {
  if (value !== null && value !== undefined) {
    record[key] = value;
  }
}

function filterUndefined<T extends Record<string, unknown>>(record: T): T {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T;
}

function findMatchingJsBracket(source: string, openIndex: number): number {
  const pairs: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const open = source[openIndex];
  const close = open ? pairs[open] : undefined;
  if (!close) {
    return -1;
  }
  let depth = 0;
  let quote: "'" | "\"" | "`" | null = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = openIndex; index < source.length; index++) {
    const char = source[index]!;
    const next = source[index + 1];
    if (lineComment) {
      if (char === "\n" || char === "\r") {
        lineComment = false;
      }
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index++;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index++;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index++;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === open) {
      depth++;
    } else if (char === close) {
      depth--;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function flattenNextjsFlightData(flightData: unknown, nextjsData: Record<string, unknown>): void {
  if (!Array.isArray(flightData)) {
    return;
  }
  if (flightData.length === 4 && flightData[0] === "$") {
    const [, name, , rawData] = flightData;
    const checked = JsonObjectSchema.safeParse(rawData);
    if (!checked.success) {
      return;
    }
    const { children, ...data } = checked.data;
    if (Object.keys(data).length && typeof name === "string" && /^\$L[0-9a-f]+$/.test(name)) {
      nextjsData[name.slice(2)] = data;
    }
    flattenNextjsFlightData(children, nextjsData);
    return;
  }
  for (const item of flightData) {
    flattenNextjsFlightData(item, nextjsData);
  }
}

const NuxtConstants = new Map<number, unknown>([
  [-1, undefined],
  [-2, null],
  [-3, Number.NaN],
  [-4, Number.POSITIVE_INFINITY],
  [-5, Number.NEGATIVE_INFINITY],
  [-6, -0],
]);

function resolveNuxtValue(array: unknown[], source: unknown, fatal: boolean, resolving = new Set<number>()): unknown {
  if (typeof source !== "number" || !Number.isInteger(source)) {
    if (fatal) {
      throw new TypeError(`invalid index: ${String(source)}`);
    }
    return null;
  }
  if (NuxtConstants.has(source)) {
    return NuxtConstants.get(source);
  }
  if (source < 0 || source >= array.length) {
    if (fatal) {
      throw new RangeError(`invalid index: ${source}`);
    }
    return null;
  }
  if (resolving.has(source)) {
    if (fatal) {
      throw new RangeError(`circular reference at index: ${source}`);
    }
    return null;
  }
  resolving.add(source);
  try {
    const value = array[source];
    if (Array.isArray(value)) {
      return resolveNuxtArrayValue(array, value, fatal, resolving);
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, resolveNuxtValue(array, item, fatal, resolving)]),
      );
    }
    return value;
  } finally {
    resolving.delete(source);
  }
}

function resolveNuxtArrayValue(array: unknown[], value: unknown[], fatal: boolean, resolving: Set<number>): unknown {
  const typeName = value[0];
  if (typeof typeName !== "string") {
    return value.map((item) => resolveNuxtValue(array, item, fatal, resolving));
  }
  switch (typeName) {
    case "NuxtError":
    case "Reactive":
    case "Ref":
    case "ShallowReactive":
    case "ShallowRef":
    case "skipHydrate":
      return resolveNuxtValue(array, value[1], fatal, resolving);
    case "EmptyRef":
    case "EmptyShallowRef": {
      const raw = resolveNuxtValue(array, value[1], fatal, resolving);
      try {
        return JSON.parse(String(raw));
      } catch (error) {
        if (fatal) {
          throw error;
        }
        return null;
      }
    }
    case "Set":
    case "Map":
      return [];
    default:
      if (fatal) {
        throw new TypeError(`invalid Nuxt type: ${typeName}`);
      }
      return null;
  }
}

interface Html5MediaInfo {
  mediaType: string;
  formats: Array<Record<string, unknown>>;
  subtitles: Record<string, Array<Record<string, unknown>>>;
  thumbnail?: string | null;
}

function createHtml5MediaInfo(
  attrs: Record<string, string>,
  baseUrl: string,
  mediaType: string,
): Html5MediaInfo {
  return {
    mediaType,
    formats: [],
    subtitles: {},
    thumbnail: absoluteHtml5Url(baseUrl, attrs.poster ?? null),
  };
}

function appendHtml5MediaEntry(
  entries: Array<Record<string, unknown>>,
  media: Html5MediaInfo,
  baseUrl: string,
  headers: Record<string, string> | undefined,
): void {
  for (const format of media.formats) {
    const existingHeaders = format.http_headers && typeof format.http_headers === "object" && !Array.isArray(format.http_headers)
      ? format.http_headers as Record<string, string>
      : {};
    format.http_headers = { ...existingHeaders, Referer: baseUrl, ...(headers ?? {}) };
  }
  if (media.formats.length || Object.keys(media.subtitles).length) {
    entries.push({
      formats: media.formats,
      subtitles: media.subtitles,
      ...(media.thumbnail ? { thumbnail: media.thumbnail } : {}),
    });
  }
}

function attrsFromElement(element: HTMLRewriterTypes.Element): Record<string, string> {
  return Object.fromEntries([...element.attributes].map(([key, value]) => [key.toLowerCase(), value]));
}

function absoluteHtml5Url(baseUrl: string, itemUrl: string | null | undefined): string | null {
  return itemUrl ? urljoin(baseUrl, itemUrl) : null;
}

function dictFirst(record: Record<string, string>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (value) {
      return value;
    }
  }
  return null;
}

function parseHtml5ContentType(contentType: string | null | undefined): Record<string, unknown> {
  if (!contentType) {
    return {};
  }
  const match = /(?<mimetype>[^/]+\/[^;]+)(?:;\s*codecs="?([^"]+))?/i.exec(contentType);
  if (!match?.groups?.mimetype) {
    return {};
  }
  return { ext: mimetype2ext(match.groups.mimetype) };
}

function parseBitrate(labels: readonly string[]): number | null {
  for (const label of labels) {
    const match = /(?<tbr>\d+(?:\.\d+)?)\s*k(?:bit\/s|bps?)?/i.exec(label);
    if (match?.groups?.tbr) {
      return Number.parseFloat(match.groups.tbr);
    }
  }
  return null;
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

function normalizeMetaContentAttribute(webpage: string, value: string | null): string | null {
  if (value === null || !value.endsWith("/")) {
    return value;
  }
  if (webpage.includes(`content="${value}"`) || webpage.includes(`content='${value}'`)) {
    return value;
  }
  return value.slice(0, -1);
}
