// Source: yt_dlp/utils/_utils.py
// Port note: this is a dependency-first subset used by migrated downloader/postprocessor code.

import { spawnSync } from "node:child_process";
import { createHmac, randomBytes, randomUUID as nodeRandomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { createServer } from "node:net";

import type { XmlElement } from "../compat/index.ts";
import { NotImplementedError } from "../errors.ts";
import { xpathElement } from "./xml.ts";
export { fixXmlAmpersands, xpathElement, xpathText, xpathWithNs } from "./xml.ts";
export { fix_xml_ampersands, xpath_element, xpath_text, xpath_with_ns } from "./xml.ts";

export const NO_DEFAULT = Symbol("NO_DEFAULT");
export const IDENTITY = <T>(value: T): T => value;

const ENGLISH_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTH_NAMES: Record<string, readonly string[]> = {
  en: ENGLISH_MONTH_NAMES,
  fr: [
    "janvier",
    "fevrier",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "aout",
    "septembre",
    "octobre",
    "novembre",
    "decembre",
  ],
  is: [
    "janúar",
    "febrúar",
    "mars",
    "apríl",
    "maí",
    "júní",
    "júlí",
    "ágúst",
    "september",
    "október",
    "nóvember",
    "desember",
  ],
  pl: [
    "stycznia",
    "lutego",
    "marca",
    "kwietnia",
    "maja",
    "czerwca",
    "lipca",
    "sierpnia",
    "września",
    "października",
    "listopada",
    "grudnia",
  ],
};

export class YoutubeDLError extends Error {
  constructor(message?: string | null) {
    super(message ?? "YoutubeDLError");
    this.name = "YoutubeDLError";
  }
}

export class ExtractorError extends YoutubeDLError {
  video_id: string | null;
  ie: unknown;
  traceback: unknown = null;
  readonly expected: boolean | undefined;
  override readonly cause: unknown;

  constructor(
    message: string,
    readonly options: {
      expected?: boolean;
      cause?: unknown;
      videoId?: string | null;
      ie?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "ExtractorError";
    this.expected = options.expected;
    this.cause = options.cause;
    this.video_id = options.videoId ?? null;
    this.ie = options.ie ?? null;
  }
}

export class DownloadError extends YoutubeDLError {
  override name = "DownloadError";
}

export class EntryNotInPlaylist extends YoutubeDLError {
  override name = "EntryNotInPlaylist";
}

export class SameFileError extends YoutubeDLError {
  override name = "SameFileError";
}

export class PostProcessingError extends YoutubeDLError {
  override name = "PostProcessingError";
}

export class DownloadCancelled extends YoutubeDLError {
  override name = "DownloadCancelled";
}

export class ExistingVideoReached extends DownloadCancelled {
  override name = "ExistingVideoReached";
}

export class RejectedVideoReached extends DownloadCancelled {
  override name = "RejectedVideoReached";
}

export class MaxDownloadsReached extends DownloadCancelled {
  override name = "MaxDownloadsReached";
}

export class ReExtractInfo extends YoutubeDLError {
  constructor(
    message: string,
    readonly expected = false,
  ) {
    super(message);
    this.name = "ReExtractInfo";
  }
}

export class ThrottledDownload extends ReExtractInfo {
  override name = "ThrottledDownload";
}

export class UnavailableVideoError extends YoutubeDLError {
  override name = "UnavailableVideoError";
}

export class ContentTooShortError extends YoutubeDLError {
  override name = "ContentTooShortError";

  constructor(readonly downloaded: number, readonly expected: number) {
    super(`Downloaded ${downloaded} bytes, expected ${expected} bytes`);
  }
}

export class XAttrMetadataError extends YoutubeDLError {
  override name = "XAttrMetadataError";
}

export class XAttrUnavailableError extends YoutubeDLError {
  override name = "XAttrUnavailableError";
}

export class RegexNotFoundError extends ExtractorError {
  constructor(message: string) {
    super(message);
    this.name = "RegexNotFoundError";
  }
}

export class GeoRestrictedError extends ExtractorError {
  constructor(
    message: string,
    readonly countries: readonly string[] = [],
  ) {
    super(message, { expected: true });
    this.name = "GeoRestrictedError";
  }
}

export class UserNotLive extends ExtractorError {
  constructor(
    message = "The channel is not currently live",
    options: { videoId?: string | null; cause?: unknown } = {},
  ) {
    super(message, {
      expected: true,
      videoId: options.videoId,
      cause: options.cause,
    });
    this.name = "UserNotLive";
  }
}

export class UnsupportedError extends ExtractorError {
  constructor(message: string) {
    super(message, { expected: true });
    this.name = "UnsupportedError";
  }
}

export function bugReportsMessage(
  before = "Please report this issue on  https://github.com/yt-dlp/yt-dlp/issues?q=  , filling out the appropriate issue template. Confirm you are on the latest version using  yt-dlp -U",
): string {
  return `; ${before}`;
}

export const bug_reports_message = bugReportsMessage;

export function encodeArgument(value: string | Uint8Array): string {
  return typeof value === "string" ? value : String.fromCharCode(...value);
}

export const encodeArgument_ = encodeArgument;

export function determineExt(
  url: string | null | undefined,
  defaultExt: string | null = "unknown_video",
): string {
  const fallback = defaultExt ?? "unknown_video";
  if (!url?.includes(".")) {
    return fallback;
  }
  const [withoutQuery = ""] = url.split("?");
  const [withoutHash = ""] = withoutQuery.split("#");
  const guess = withoutHash.split(".").pop() ?? "";
  return /^[A-Za-z0-9]+$/.test(guess) ? guess : fallback;
}

export const determine_ext = determineExt;

export function removeStart(
  value: string | null | undefined,
  start: string,
): string | null | undefined {
  return value?.startsWith(start) ? value.slice(start.length) : value;
}

export const remove_start = removeStart;

export function removeEnd(
  value: string | null | undefined,
  end: string,
): string | null | undefined {
  return value && end && value.endsWith(end)
    ? value.slice(0, -end.length)
    : value;
}

export const remove_end = removeEnd;

export function removeQuotes(
  value: string | null | undefined,
): string | null | undefined {
  if (value === null || value === undefined || value.length < 2) {
    return value;
  }
  const quote = value[0];
  return (quote === '"' || quote === "'") && value.at(-1) === quote
    ? value.slice(1, -1)
    : value;
}

export const remove_quotes = removeQuotes;

export function baseUrl(url: string): string {
  const match = /^https?:\/\/[^?#]+\//.exec(url);
  if (!match) {
    throw new Error(`Unable to determine base URL for ${url}`);
  }
  return match[0];
}

export const base_url = baseUrl;

export function urljoin(
  base: string | Uint8Array | null | undefined,
  path: string | Uint8Array | null | undefined,
): string | null {
  const decodedPath =
    path instanceof Uint8Array ? new TextDecoder().decode(path) : path;
  if (!decodedPath) {
    return null;
  }
  if (/^(?:[a-zA-Z][a-zA-Z0-9+-.]*:)?\/\//.test(decodedPath)) {
    return decodedPath;
  }
  const decodedBase =
    base instanceof Uint8Array ? new TextDecoder().decode(base) : base;
  if (!decodedBase || !/^(?:https?:)?\/\//.test(decodedBase)) {
    return null;
  }
  return new URL(decodedPath, decodedBase).toString();
}

export function urlOrNone(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  if (/^\/\//.test(value)) {
    return value;
  }
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//
    .exec(value)?.[1]
    ?.toLowerCase();
  if (
    !scheme ||
    ![
      "http",
      "https",
      "rtmp",
      "rtmpe",
      "rtmps",
      "rtmpt",
      "rtmpte",
      "mms",
      "rtsp",
      "rtspu",
      "ftp",
      "ftps",
      "ws",
      "wss",
    ].includes(scheme)
  ) {
    return null;
  }
  return /\s/.test(value) ? null : value;
}

export const url_or_none = urlOrNone;

export function updateUrl(
  url: string,
  options: {
    query_update?:
      | URLSearchParams
      | Record<
          string,
          | string
          | number
          | boolean
          | readonly (string | number | boolean)[]
          | null
          | undefined
        >
      | null;
    scheme?: string;
    protocol?: string;
    hostname?: string;
    host?: string;
    pathname?: string;
    path?: string;
    search?: string;
    query?: string;
    hash?: string;
    fragment?: string;
  } = {},
): string {
  if (!Object.keys(options).length) {
    return url;
  }
  const parsed = new URL(url);
  if (options.scheme || options.protocol) {
    const protocol = options.scheme ?? options.protocol;
    if (protocol) {
      parsed.protocol = `${protocol.replace(/:$/, "")}:`;
    }
  }
  if (options.hostname) {
    parsed.hostname = options.hostname;
  }
  if (options.host) {
    parsed.host = options.host;
  }
  if (options.pathname || options.path) {
    const pathname = options.pathname ?? options.path;
    if (pathname) {
      parsed.pathname = pathname;
    }
  }
  if (options.search !== undefined || options.query !== undefined) {
    parsed.search = options.search ?? options.query ?? "";
  }
  if (options.query_update) {
    applyQueryUpdate(parsed, options.query_update);
  }
  if (options.hash !== undefined || options.fragment !== undefined) {
    parsed.hash = options.hash ?? options.fragment ?? "";
  }
  return parsed.toString();
}

export const update_url = updateUrl;

export function updateUrlQuery(
  url: string,
  query:
    | URLSearchParams
    | Record<
        string,
        | string
        | number
        | boolean
        | readonly (string | number | boolean)[]
        | null
        | undefined
      >,
): string {
  const parsed = new URL(url);
  applyQueryUpdate(parsed, query);
  return parsed.toString();
}

export const update_url_query = updateUrlQuery;

export function parseQs(url: string): Record<string, string[]> {
  const query = URL.canParse(url)
    ? new URL(url).search
    : url.includes("?")
      ? url.slice(url.indexOf("?"))
      : "";
  const params = new URLSearchParams(
    query.startsWith("?") ? query.slice(1) : query,
  );
  const out: Record<string, string[]> = {};
  for (const [key, value] of params) {
    out[key] = [...(out[key] ?? []), value];
  }
  return out;
}

export const parse_qs = parseQs;

export function urlencodePostdata(
  data:
    | Record<string, string | number | boolean | null | undefined>
    | Iterable<readonly [string, string | number | boolean | null | undefined]>,
): URLSearchParams {
  const params = new URLSearchParams();
  const entries =
    Symbol.iterator in Object(data)
      ? (data as Iterable<
          readonly [string, string | number | boolean | null | undefined]
        >)
      : Object.entries(
          data as Record<string, string | number | boolean | null | undefined>,
        );
  for (const [key, value] of entries) {
    if (value !== null && value !== undefined) {
      params.append(key, String(value));
    }
  }
  return params;
}

export const urlencode_postdata = urlencodePostdata;

export function parseM3u8Attributes(
  attributes: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  const pattern = /(?<key>[A-Z0-9-]+)=(?<value>"[^"]+"|[^",]+)(?:,|$)/g;
  for (const match of attributes.matchAll(pattern)) {
    const key = match.groups?.key;
    let value = match.groups?.value;
    if (key && value !== undefined) {
      if (value.startsWith('"')) {
        value = value.slice(1, -1);
      }
      out[key] = value;
    }
  }
  return out;
}

export const parse_m3u8_attributes = parseM3u8Attributes;

export function intOrNone(
  value: unknown,
  scale = 1,
  defaultValue: number | null = null,
  invscale = 1,
  base?: number,
): number | null {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), base);
  return Number.isFinite(parsed)
    ? Math.trunc((parsed * invscale) / scale)
    : defaultValue;
}

export const int_or_none = intOrNone;

export function parseAgeLimit(value: unknown): number | null {
  if (value === null || value === undefined || value === false) {
    return null;
  }
  const text = String(value).trim().toLowerCase();
  if (!text) {
    return null;
  }
  if (/^(?:all|everyone|general|u|g|tv[-_ ]?g|pg)$/i.test(text)) {
    return 0;
  }
  const ratingAges: Record<string, number> = { "tv-ma": 17, tvma: 17 };
  if (ratingAges[text] !== undefined) {
    return ratingAges[text];
  }
  const age = intOrNone(/\d+/.exec(text)?.[0] ?? null);
  return age !== null && age <= 21 ? age : null;
}

export const parse_age_limit = parseAgeLimit;

export function floatOrNone(
  value: unknown,
  scale = 1,
  defaultValue: number | null = null,
  invscale = 1,
): number | null {
  if (value === null || value === undefined || value === "") {
    return defaultValue;
  }
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? (parsed * invscale) / scale : defaultValue;
}

export const float_or_none = floatOrNone;

export function strOrNone(
  value: unknown,
  defaultValue: string | null = null,
): string | null {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  if (typeof value === "object" || typeof value === "function") {
    return defaultValue;
  }
  return String(value);
}

export const str_or_none = strOrNone;

export function stripOrNone(
  value: unknown,
  defaultValue: string | null = null,
): string | null {
  if (typeof value !== "string") {
    return defaultValue;
  }
  const stripped = String(value).trim();
  return stripped || (value === "" ? "" : defaultValue);
}

export const strip_or_none = stripOrNone;

export function tryGet<T>(
  source: unknown,
  getter: ((value: unknown) => T) | Array<(value: unknown) => T>,
  expectedType?: (value: unknown) => value is T,
): T | null {
  const getters = Array.isArray(getter) ? getter : [getter];
  for (const item of getters) {
    try {
      const value = item(source);
      if (!expectedType || expectedType(value)) {
        return value;
      }
    } catch {}
  }
  return null;
}

export const try_get = tryGet;

export function tryCall<T>(
  ...funcsAndOptions: Array<
    | (() => T)
    | {
        expected_type?: (value: unknown) => value is T;
        args?: unknown[];
        kwargs?: Record<string, unknown>;
      }
  >
): T | null {
  const maybeOptions = funcsAndOptions.at(-1);
  const options =
    typeof maybeOptions === "object" &&
    maybeOptions !== null &&
    !("call" in maybeOptions)
      ? (funcsAndOptions.pop() as {
          expected_type?: (value: unknown) => value is T;
          args?: unknown[];
          kwargs?: Record<string, unknown>;
        })
      : {};
  for (const func of funcsAndOptions as Array<() => T>) {
    try {
      const value = func();
      if (!options.expected_type || options.expected_type(value)) {
        return value;
      }
    } catch {}
  }
  return null;
}

export const try_call = tryCall;

export function getFirst<T>(
  obj: unknown,
  keys: readonly unknown[],
  expectedType?: (value: unknown) => value is T,
): T | null {
  for (const key of keys) {
    const value = Array.isArray(obj)
      ? obj[Number(key)]
      : obj && typeof obj === "object"
        ? (obj as Record<string, unknown>)[String(key)]
        : undefined;
    if (
      value !== null &&
      value !== undefined &&
      (!expectedType || expectedType(value))
    ) {
      return value as T;
    }
  }
  return null;
}

export const get_first = getFirst;

export function filterDict<T>(
  record: Record<string, T>,
  predicate: (key: string, value: T) => boolean = (_key, value) =>
    value !== null && value !== undefined,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(record).filter(([key, value]) => predicate(key, value)),
  );
}

export const filter_dict = filterDict;

export function mergeDicts<T extends Record<string, unknown>>(
  ...dicts: Array<T | null | undefined>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const dict of dicts.toReversed()) {
    for (const [key, value] of Object.entries(dict ?? {})) {
      if (value !== null && value !== undefined && out[key] === undefined) {
        out[key] = value;
      }
    }
  }
  return out;
}

export const merge_dicts = mergeDicts;

export function joinNonempty(
  ...valuesAndOptions: Array<
    unknown | { delim?: string; from_dict?: Record<string, unknown> }
  >
): string {
  const maybeOptions = valuesAndOptions.at(-1);
  const hasOptions = Boolean(
    maybeOptions &&
      typeof maybeOptions === "object" &&
      !Array.isArray(maybeOptions),
  );
  const options = hasOptions
    ? (valuesAndOptions.pop() as {
        delim?: string;
        from_dict?: Record<string, unknown>;
      })
    : {};
  const values = valuesAndOptions.map((value) => {
    if (typeof value === "string" && options.from_dict) {
      return options.from_dict[value];
    }
    return value;
  });
  return values
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map(String)
    .join(options.delim ?? "-");
}

export const join_nonempty = joinNonempty;

export function variadic<T>(value: T | readonly T[] | null | undefined): T[] {
  if (value === null || value === undefined) {
    return [];
  }
  return Array.isArray(value) ? ([...value] as T[]) : [value as T];
}

export function formatSeconds(
  seconds: number,
  delim = ":",
  msec = false,
): string {
  const totalMs = Math.trunc(seconds * 1000);
  const milliseconds = totalMs % 1000;
  const totalSeconds = Math.trunc(totalMs / 1000);
  const secs = totalSeconds % 60;
  const minutes = Math.trunc(totalSeconds / 60) % 60;
  const hours = Math.trunc(totalSeconds / 3600);
  const text = hours
    ? `${hours}${delim}${pad2(minutes)}${delim}${pad2(secs)}`
    : minutes
      ? `${minutes}${delim}${pad2(secs)}`
      : String(secs);
  return msec ? `${text}.${milliseconds.toString().padStart(3, "0")}` : text;
}

export const formatSeconds_ = formatSeconds;

export function srtSubtitlesTimecode(seconds: number): string {
  const totalMs = Math.trunc(seconds * 1000);
  const milliseconds = totalMs % 1000;
  const totalSeconds = Math.trunc(totalMs / 1000);
  const secs = totalSeconds % 60;
  const minutes = Math.trunc(totalSeconds / 60) % 60;
  const hours = Math.trunc(totalSeconds / 3600);
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(secs)},${milliseconds.toString().padStart(3, "0")}`;
}

export const srt_subtitles_timecode = srtSubtitlesTimecode;

export function escapeHTML(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function unescapeHTML(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

export const unescapeHTML_ = unescapeHTML;

export function cleanHtml(html: string | null | undefined): string | null {
  if (html === null || html === undefined) {
    return null;
  }
  let text = "";
  new HTMLRewriter()
    .on("br", {
      element: () => {
        text += "\n";
      },
    })
    .on("p", {
      element(element) {
        element.onEndTag(() => {
          text += "\n";
        });
      },
    })
    .onDocument({
      text(chunk) {
        text += chunk.text;
      },
    })
    .transform(html);
  return unescapeHTML(normalizeHtmlText(text))?.trim() ?? null;
}

export const clean_html = cleanHtml;

export function getElementById(id: string, html: string): string | null {
  return getElementText(`[id="${cssString(id)}"]`, html);
}

export const get_element_by_id = getElementById;

export function getElementHtmlById(
  id: string,
  html: string,
  options: { tag?: string; escape_value?: boolean } = {},
): string | null {
  return getElementHtmlByAttribute("id", id, html, options);
}

export const get_element_html_by_id = getElementHtmlById;

export function getElementByClass(
  className: string,
  html: string,
): string | null {
  return getElementText(`[class~="${cssString(className)}"]`, html);
}

export const get_element_by_class = getElementByClass;

export function getElementHtmlByClass(
  className: string,
  html: string,
): string | null {
  return getElementsHtmlByClass(className, html)[0] ?? null;
}

export const get_element_html_by_class = getElementHtmlByClass;

export function getElementByAttribute(
  attribute: string,
  value: string,
  html: string,
  options: { tag?: string; escape_value?: boolean } = {},
): string | null {
  return getElementsTextAndHtmlByAttribute(attribute, value, html, options)[0]?.[0] ?? null;
}

export const get_element_by_attribute = getElementByAttribute;

export function getElementHtmlByAttribute(
  attribute: string,
  value: string,
  html: string,
  options: { tag?: string; escape_value?: boolean } = {},
): string | null {
  return getElementsTextAndHtmlByAttribute(attribute, value, html, options)[0]?.[1] ?? null;
}

export const get_element_html_by_attribute = getElementHtmlByAttribute;

export function getElementsByClass(className: string, html: string): string[] {
  return getElementsTextAndHtmlByAttribute("class", `(?:^|\\s)${RegExp.escape(className)}(?:\\s|$)`, html, { escape_value: false }).map(([text]) => text);
}

export const get_elements_by_class = getElementsByClass;

export function getElementsHtmlByClass(className: string, html: string): string[] {
  return getElementsTextAndHtmlByAttribute("class", `(?:^|\\s)${RegExp.escape(className)}(?:\\s|$)`, html, { escape_value: false }).map(([, htmlText]) => htmlText);
}

export const get_elements_html_by_class = getElementsHtmlByClass;

export function getElementsByAttribute(
  attribute: string,
  value: string,
  html: string,
  options: { tag?: string; escape_value?: boolean } = {},
): string[] {
  return getElementsTextAndHtmlByAttribute(attribute, value, html, options).map(([text]) => text);
}

export const get_elements_by_attribute = getElementsByAttribute;

export function getElementsHtmlByAttribute(
  attribute: string,
  value: string,
  html: string,
  options: { tag?: string; escape_value?: boolean } = {},
): string[] {
  return getElementsTextAndHtmlByAttribute(attribute, value, html, options).map(([, htmlText]) => htmlText);
}

export const get_elements_html_by_attribute = getElementsHtmlByAttribute;

export function getElementsTextAndHtmlByAttribute(
  attribute: string,
  value: string,
  html: string,
  options: { tag?: string; escape_value?: boolean } = {},
): Array<[string, string]> {
  const tag = options.tag ?? String.raw`[\w:.-]+`;
  const valuePattern = options.escape_value === false ? value : RegExp.escape(value);
  const attrPattern = String.raw`(?:^|[\s"'=<>/])${RegExp.escape(attribute)}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>\x60]+))`;
  const startTagPattern = new RegExp(String.raw`<(?<tag>${tag})\b(?<attrs>[^>]*?)(?<selfClosing>\/?)>`, "gi");
  const out: Array<[string, string]> = [];
  for (const match of html.matchAll(startTagPattern)) {
    const tagName = match.groups?.tag;
    if (!tagName || tagName.startsWith("/")) {
      continue;
    }
    const attrs = match.groups?.attrs ?? "";
    const attrMatch = new RegExp(attrPattern, "i").exec(attrs);
    const attrValue = attrMatch?.[1] ?? attrMatch?.[2] ?? attrMatch?.[3];
    if (attrValue === undefined || !new RegExp(`^(?:${valuePattern})$`).test(attrValue)) {
      continue;
    }
    let htmlText = match[0];
    let body = "";
    if (!match.groups?.selfClosing) {
      const closePattern = new RegExp(String.raw`<\/${RegExp.escape(tagName)}\s*>`, "i");
      const afterStart = (match.index ?? 0) + match[0].length;
      const closeMatch = closePattern.exec(html.slice(afterStart));
      if (!closeMatch?.[0]) {
        continue;
      }
      const closeIndex = afterStart + closeMatch.index;
      body = html.slice(afterStart, closeIndex);
      htmlText = html.slice(match.index ?? 0, closeIndex + closeMatch[0].length);
    }
    out.push([cleanHtml(body) ?? "", htmlText]);
  }
  return out;
}

export const get_elements_text_and_html_by_attribute = getElementsTextAndHtmlByAttribute;

export function getElementTextAndHtmlByTag(tag: string, html: string): [string | null, string | null] {
  const pattern = new RegExp(String.raw`<(?<tag>${tag})\b[^>]*>(?<body>[\s\S]*?)<\/\k<tag>>`, "i");
  const match = pattern.exec(html);
  if (!match) {
    return [null, null];
  }
  return [cleanHtml(match.groups?.body ?? ""), match[0]];
}

export const get_element_text_and_html_by_tag = getElementTextAndHtmlByTag;

export function extractAttributes(
  htmlElement: string,
): Record<string, string | null> {
  const attrs: Record<string, string | null> = {};
  const assignedAttributes = scanAssignedAttributes(htmlElement);
  let done = false;
  new HTMLRewriter()
    .on("*", {
      element(element) {
        if (done) {
          return;
        }
        done = true;
        for (const [rawName, rawValue] of element.attributes) {
          const name = rawName.toLowerCase();
          attrs[name] = assignedAttributes.has(name)
            ? unescapeHTML(rawValue)
            : null;
        }
      },
    })
    .transform(htmlElement);
  return attrs;
}

function getElementText(selector: string, html: string): string | null {
  let text = "";
  let collecting = false;
  let matched = false;
  new HTMLRewriter()
    .on(selector, {
      element(element) {
        if (matched) {
          return;
        }
        matched = true;
        collecting = true;
        element.onEndTag(() => {
          collecting = false;
        });
      },
      text(chunk) {
        if (collecting) {
          text += chunk.text;
        }
      },
    })
    .on(`${selector} br`, {
      element() {
        if (collecting) {
          text += "\n";
        }
      },
    })
    .transform(html);
  return matched
    ? (unescapeHTML(normalizeHtmlText(text))?.trim() ?? null)
    : null;
}

function normalizeHtmlText(text: string): string {
  return text
    .replaceAll(/[^\S\n]+/g, " ")
    .replaceAll(/ *\n+ */g, "\n")
    .replaceAll(/\n{2,}/g, "\n");
}

function cssString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function scanAssignedAttributes(htmlElement: string): Set<string> {
  const assigned = new Set<string>();
  let index = 0;
  while (index < htmlElement.length && htmlElement[index] !== "<") {
    index += 1;
  }
  index += 1;
  while (
    index < htmlElement.length &&
    !isHtmlSpace(htmlElement[index]) &&
    htmlElement[index] !== ">" &&
    htmlElement[index] !== "/"
  ) {
    index += 1;
  }
  while (index < htmlElement.length) {
    while (index < htmlElement.length && isHtmlSpace(htmlElement[index])) {
      index += 1;
    }
    if (
      htmlElement[index] === ">" ||
      htmlElement[index] === "/" ||
      index >= htmlElement.length
    ) {
      break;
    }
    const nameStart = index;
    while (
      index < htmlElement.length &&
      !isHtmlSpace(htmlElement[index]) &&
      htmlElement[index] !== "=" &&
      htmlElement[index] !== ">" &&
      htmlElement[index] !== "/"
    ) {
      index += 1;
    }
    const name = htmlElement.slice(nameStart, index).toLowerCase();
    while (index < htmlElement.length && isHtmlSpace(htmlElement[index])) {
      index += 1;
    }
    if (htmlElement[index] !== "=") {
      continue;
    }
    if (name) {
      assigned.add(name);
    }
    index += 1;
    while (index < htmlElement.length && isHtmlSpace(htmlElement[index])) {
      index += 1;
    }
    const quote = htmlElement[index];
    if (quote === '"' || quote === "'") {
      index += 1;
      while (index < htmlElement.length && htmlElement[index] !== quote) {
        index += 1;
      }
      index += 1;
    } else {
      while (
        index < htmlElement.length &&
        !isHtmlSpace(htmlElement[index]) &&
        htmlElement[index] !== ">"
      ) {
        index += 1;
      }
    }
  }
  return assigned;
}

function isHtmlSpace(char: string | undefined): boolean {
  return (
    char === " " ||
    char === "\n" ||
    char === "\r" ||
    char === "\t" ||
    char === "\f"
  );
}

export const extract_attributes = extractAttributes;

export function cleanPodcastUrl(url: string): string {
  const trackingPrefix =
    /(?:(?:(?:chtbl\.com\/track|media\.blubrry\.com|play\.podtrac\.com|chrt\.fm\/track|mgln\.ai\/e)(?:\/[^/.]+)?|(?:dts|www)\.podtrac\.com\/(?:pts\/)?redirect\.[0-9a-z]{3,4}|flex\.acast\.com|pd(?:cn\.co|st\.fm)\/e|[0-9]\.gum\.fm|pscrb\.fm\/rss\/p)\/)/g;
  return url.replace(trackingPrefix, "").replace(/^(\w+):\/\/(\w+:\/\/)/, "$2");
}

export const clean_podcast_url = cleanPodcastUrl;

export function parseIso8601(
  dateStr: string | null | undefined,
  delimiter = "T",
): number | null {
  if (!dateStr) {
    return null;
  }
  const normalized = dateStr.replace(/\.[0-9]+/, "").replace(delimiter, "T");
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? Math.trunc(timestamp / 1000) : null;
}

export const parse_iso8601 = parseIso8601;

export function unifiedTimestamp(
  dateStr: unknown,
  _dayFirst = true,
  tzOffset = 0,
): number | null {
  if (typeof dateStr !== "string") {
    return null;
  }
  // Logic note: Bun uses the platform Date parser after normalizing common feed date text.
  const normalized = dateStr
    .replaceAll(/[,|]/g, " ")
    .replaceAll(
      /\b(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?\b/gi,
      " ",
    )
    .replaceAll(/\s+/g, " ")
    .trim();
  const timestamp = Date.parse(normalized);
  if (Number.isFinite(timestamp)) {
    return Math.trunc(timestamp / 1000);
  }
  const withoutZone = normalized.replace(/\s+[A-Z]+$/, "");
  const fallback = Date.parse(withoutZone);
  return Number.isFinite(fallback)
    ? Math.trunc(fallback / 1000) - tzOffset * 3600
    : null;
}

export const unified_timestamp = unifiedTimestamp;

export function datetimeFromStr(
  dateStr: string,
  precision:
    | "auto"
    | "microsecond"
    | "second"
    | "minute"
    | "hour"
    | "day" = "auto",
): Date | null {
  const now = new Date();
  let date: Date;
  if (dateStr === "now" || dateStr === "today") {
    date = now;
  } else if (dateStr === "yesterday") {
    date = new Date(now.getTime() - 86_400_000);
  } else {
    const relative =
      /^(?<start>.+)(?<sign>[+-])(?<time>\d+)(?<unit>microsecond|second|minute|hour|day|week|month|year)s?$/.exec(
        dateStr,
      );
    if (
      relative?.groups?.start &&
      relative.groups.time &&
      relative.groups.unit
    ) {
      const start = datetimeFromStr(relative.groups.start, precision);
      if (!start) {
        return null;
      }
      const sign = relative.groups.sign === "-" ? -1 : 1;
      const amount = Number(relative.groups.time) * sign;
      date = addDateUnit(start, relative.groups.unit, amount);
    } else {
      const compact = /^(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})$/.exec(
        dateStr,
      );
      const timestamp = compact?.groups
        ? Date.UTC(
            Number(compact.groups.year),
            Number(compact.groups.month) - 1,
            Number(compact.groups.day),
          )
        : Date.parse(dateStr);
      if (!Number.isFinite(timestamp)) {
        return null;
      }
      date = new Date(timestamp);
    }
  }
  const resolvedPrecision = precision === "auto" ? "microsecond" : precision;
  return roundDate(date, resolvedPrecision);
}

export const datetime_from_str = datetimeFromStr;

export function strftimeOrNone(
  timestamp: number | string | Date | null | undefined,
  dateFormat = "%Y%m%d",
  defaultValue: string | null = null,
): string | null {
  if (timestamp === null || timestamp === undefined) {
    return defaultValue;
  }
  const date =
    timestamp instanceof Date
      ? timestamp
      : typeof timestamp === "number"
        ? new Date(timestamp * 1000)
        : datetimeFromStr(timestamp);
  if (!date || Number.isNaN(date.getTime())) {
    return defaultValue;
  }
  const replacements: Record<string, string> = {
    "%Y": String(date.getUTCFullYear()),
    "%m": String(date.getUTCMonth() + 1).padStart(2, "0"),
    "%d": String(date.getUTCDate()).padStart(2, "0"),
    "%H": String(date.getUTCHours()).padStart(2, "0"),
    "%M": String(date.getUTCMinutes()).padStart(2, "0"),
    "%S": String(date.getUTCSeconds()).padStart(2, "0"),
    "%s": String(Math.trunc(date.getTime() / 1000)),
  };
  return Object.entries(replacements).reduce(
    (out, [key, value]) => out.replaceAll(key, value),
    dateFormat,
  );
}

export const strftime_or_none = strftimeOrNone;

export function unifiedStrdate(
  dateStr: string | null | undefined,
): string | null {
  if (!dateStr) {
    return null;
  }
  const parsed = Date.parse(dateStr.replaceAll(",", " "));
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10).replaceAll("-", "");
  }
  const match =
    /(?<year>\d{4})[-/.](?<month>\d{1,2})[-/.](?<day>\d{1,2})/.exec(dateStr) ??
    /(?<day>\d{1,2})[-/.](?<month>\d{1,2})[-/.](?<year>\d{4})/.exec(dateStr);
  const year = match?.groups?.year;
  const month = match?.groups?.month;
  const day = match?.groups?.day;
  return year && month && day
    ? `${year}${month.padStart(2, "0")}${day.padStart(2, "0")}`
    : null;
}

export const unified_strdate = unifiedStrdate;

export function qualities(
  qualityIds: readonly string[],
): (qualityId: string | null | undefined) => number {
  const map = new Map(qualityIds.map((qualityId, index) => [qualityId, index]));
  return (qualityId) => (qualityId ? (map.get(qualityId) ?? -1) : -1);
}

export function strToInt(value: string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number.parseInt(String(value).replaceAll(/[,.]/g, ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export const str_to_int = strToInt;

export function parseCount(value: string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const text = value.replace(/^[^\d]+\s/, "").trim();
  if (/^[\d,.]+$/.test(text)) {
    return strToInt(text);
  }
  const unitMatch =
    /(?<number>[\d,.]+)\s*(?<unit>kk|KK|[kKmMbB])(?:\b|$)/.exec(text);
  if (unitMatch?.groups?.number && unitMatch.groups.unit) {
    const number = Number(normalizeDecimalNumber(unitMatch.groups.number));
    if (!Number.isFinite(number)) {
      return null;
    }
    const multipliers: Record<string, number> = {
      k: 1_000,
      K: 1_000,
      m: 1_000_000,
      M: 1_000_000,
      kk: 1_000_000,
      KK: 1_000_000,
      b: 1_000_000_000,
      B: 1_000_000_000,
    };
    const multiplier = multipliers[unitMatch.groups.unit];
    return multiplier === undefined ? null : Math.trunc(number * multiplier);
  }
  const leading = /^([\d,.]+)(?:$|\s)/.exec(text);
  return leading ? strToInt(leading[1]) : null;
}

export const parse_count = parseCount;

export function parseDuration(value: unknown): number | null {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    value === false
  ) {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const isoMatch =
    /^(?:P(?:(?<days>\d+(?:\.\d+)?)D)?(?:T)?(?:(?<hours>\d+(?:\.\d+)?)H)?(?:(?<minutes>\d+(?:\.\d+)?)M(?:in(?:utes?)?\.?)?)?(?:(?<seconds>\d+(?:\.\d+)?)S(?:ec(?:onds?)?)?Z?)?)$/i.exec(
      value,
    );
  if (
    isoMatch?.[0] &&
    Object.values(isoMatch.groups ?? {}).some((part) => part !== undefined)
  ) {
    return (
      Number(isoMatch.groups?.days ?? 0) * 86400 +
      Number(isoMatch.groups?.hours ?? 0) * 3600 +
      Number(isoMatch.groups?.minutes ?? 0) * 60 +
      Number(isoMatch.groups?.seconds ?? 0)
    );
  }
  const colonParts = value.split(":").map((part) => Number.parseFloat(part));
  if (colonParts.length > 1 && colonParts.every(Number.isFinite)) {
    return colonParts.reduce((total, part) => total * 60 + part, 0);
  }
  const unitMatch =
    /(?:(?<hours>\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?)?[\s,]*(?:(?<minutes>\d+(?:\.\d+)?)\s*m(?:in(?:ute)?s?\.?)?)?[\s,]*(?:(?<seconds>\d+(?:\.\d+)?)\s*s(?:ec(?:ond)?s?)?)?/i.exec(
      value,
    );
  if (unitMatch?.[0]?.trim()) {
    return (
      Number(unitMatch.groups?.hours ?? 0) * 3600 +
      Number(unitMatch.groups?.minutes ?? 0) * 60 +
      Number(unitMatch.groups?.seconds ?? 0)
    );
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export const parse_duration = parseDuration;

const FILESIZE_UNITS: Record<string, number> = {
  B: 1,
  b: 1,
  bytes: 1,
  KiB: 1024,
  KB: 1000,
  kB: 1024,
  Kb: 1000,
  kb: 1000,
  kilobytes: 1000,
  kibibytes: 1024,
  MiB: 1024 ** 2,
  MB: 1000 ** 2,
  mB: 1024 ** 2,
  Mb: 1000 ** 2,
  mb: 1000 ** 2,
  megabytes: 1000 ** 2,
  mebibytes: 1024 ** 2,
  GiB: 1024 ** 3,
  GB: 1000 ** 3,
  gB: 1024 ** 3,
  Gb: 1000 ** 3,
  gb: 1000 ** 3,
  gigabytes: 1000 ** 3,
  gibibytes: 1024 ** 3,
};

export function parseFilesize(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const match = /(?<number>[\d.,]+)\s*(?<unit>[A-Za-z]+)?/.exec(value.trim());
  const number = match?.groups?.number
    ? Number.parseFloat(normalizeDecimalNumber(match.groups.number))
    : Number.NaN;
  if (!Number.isFinite(number)) {
    return null;
  }
  const unit = match?.groups?.unit ?? "B";
  const multiplier = FILESIZE_UNITS[unit] ?? null;
  return multiplier ? Math.round(number * multiplier) : null;
}

export const parse_filesize = parseFilesize;

export function parseBitrate(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  return intOrNone(/\b(\d+)\s*kbps/i.exec(value)?.[1] ?? null);
}

export const parse_bitrate = parseBitrate;

export function parseResolution(
  value: string | null | undefined,
  options: { lenient?: boolean } = {},
): { width?: number; height?: number } {
  if (!value) {
    return {};
  }
  const explicit = /(?<width>\d{2,5})\s*(?:[xX×,])\s*(?<height>\d{2,5})/.exec(value);
  if (explicit?.groups?.width && explicit.groups.height) {
    return {
      width: Number(explicit.groups.width),
      height: Number(explicit.groups.height),
    };
  }
  const height = /(?<height>\d{3,4})p\b/i.exec(value)?.groups?.height;
  if (height) {
    return { height: Number(height) };
  }
  const fourK = /\b([48])k\b/i.exec(value)?.[1];
  if (fourK) {
    return { height: Number(fourK) * 540 };
  }
  const width = options.lenient
    ? /(?<!\d)(\d{2,5})w(?![a-zA-Z0-9])/i.exec(value)?.[1]
    : undefined;
  return width ? { width: Number(width) } : {};
}

export const parse_resolution = parseResolution;

export function truncateString(
  value: string | null | undefined,
  left: number,
  right = 0,
): string | null | undefined {
  if (value == null || value.length <= left + right) {
    return value;
  }
  return `${value.slice(0, left - 3)}...${right ? value.slice(-right) : ""}`;
}

export const truncate_string = truncateString;

export function limitLength(
  value: string | null | undefined,
  length: number,
): string | null | undefined {
  if (value === null || value === undefined || value.length <= length) {
    return value;
  }
  return `${value.slice(0, Math.max(0, length - 3))}...`;
}

export const limit_length = limitLength;

export function checkExecutable(
  exe: string,
  args: readonly string[] = [],
): string | false {
  const path = Bun.which(exe);
  if (!path) {
    return false;
  }
  if (!args.length) {
    return path;
  }
  const result = spawnSync(path, [...args], { stdio: "ignore" });
  return result.status === 0 ? path : false;
}

export const check_executable = checkExecutable;

export function cliOption(
  params: Record<string, unknown>,
  commandOption: string,
  param: string,
  separator?: string,
): string[] {
  const value = params[param];
  if (value === null || value === undefined) {
    return [];
  }
  return separator === undefined
    ? [commandOption, String(value)]
    : [`${commandOption}${separator}${value}`];
}

export const cli_option = cliOption;

export function cliBoolOption(
  params: Record<string, unknown>,
  commandOption: string,
  param: string,
  trueValue = "true",
  falseValue = "false",
  separator?: string,
): string[] {
  const value = params[param];
  return value === undefined || value === null
    ? []
    : cliOption(
        { true: trueValue, false: falseValue },
        commandOption,
        String(Boolean(value)),
        separator,
      );
}

export const cli_bool_option = cliBoolOption;

export function cliValuelessOption(
  params: Record<string, unknown>,
  commandOption: string,
  param: string,
  expectedValue: unknown = true,
): string[] {
  return params[param] === expectedValue ? [commandOption] : [];
}

export const cli_valueless_option = cliValuelessOption;

export function configurationArgs(
  mainKey: string,
  argdict: unknown,
  exe: string,
  keys: readonly string[] = [""],
  defaultValue: readonly string[] = [],
): string[] {
  if (Array.isArray(argdict)) {
    return argdict.map(String);
  }
  if (!argdict || typeof argdict !== "object") {
    return [...defaultValue];
  }
  const args = argdict as Record<string, string[] | string | undefined>;
  const rootKey =
    mainKey.toLowerCase() === exe.toLowerCase()
      ? exe.toLowerCase()
      : `${mainKey.toLowerCase()}+${exe.toLowerCase()}`;
  const candidateKeys = keys.map((key) => `${rootKey}${key}`);
  candidateKeys.push("default");
  for (const key of candidateKeys) {
    const value = args[key.toLowerCase()];
    if (Array.isArray(value)) {
      return value.map(String);
    }
    if (typeof value === "string") {
      return [value];
    }
  }
  return [...defaultValue];
}

export const _configuration_args = configurationArgs;

export class RetryManager implements Iterable<{ error: unknown }> {
  constructor(
    readonly retries: number | null | undefined,
    readonly errorCallback: (
      error: unknown,
      count: number,
      retries: number,
    ) => void = () => undefined,
  ) {}

  *[Symbol.iterator](): Iterator<{ error: unknown }> {
    const maxRetries = this.retries ?? 0;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
      const state = { error: undefined as unknown };
      yield state;
      if (!state.error) {
        break;
      }
      this.errorCallback(state.error, attempt, maxRetries);
    }
  }
}

export function shellQuote(args: readonly string[]): string {
  return args
    .map((arg) =>
      /^[\w./:=+-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`,
    )
    .join(" ");
}

export const shell_quote = shellQuote;

export function argsToStr(args: readonly string[]): string {
  return shellQuote(args);
}

export const args_to_str = argsToStr;

export function detectExeVersion(
  output: string | null | undefined,
): string | false {
  const match = /(?:version|v)\s*(?<version>\d+(?:\.\d+)+)/i.exec(output ?? "");
  return match?.groups?.version ?? false;
}

export const detect_exe_version = detectExeVersion;

export function getExeVersionOutput(
  exe: string | false | undefined,
  args: readonly string[] = ["--version"],
): string | null {
  if (!exe) {
    return null;
  }
  const result = spawnSync(exe, [...args], { encoding: "utf8" });
  return result.error ? null : `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

export const _get_exe_version_output = getExeVersionOutput;

export function isOutdatedVersion(
  version: string | null | false | undefined,
  minimum: string,
  defaultValue = false,
): boolean {
  if (!version) {
    return defaultValue;
  }
  const left = version.split(".").map(Number);
  const right = minimum.split(".").map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) {
      return diff < 0;
    }
  }
  return false;
}

export const is_outdated_version = isOutdatedVersion;

export function versionTuple(
  version: string,
  options: { lenient?: boolean } = {},
): number[] {
  return version.split(/[-.]/).map((part) => {
    const parsed = Number.parseInt(part, 10);
    if (!Number.isFinite(parsed)) {
      if (options.lenient) {
        return -1;
      }
      throw new Error(`Invalid version component: ${part}`);
    }
    return parsed;
  });
}

export const version_tuple = versionTuple;

export function replaceExtension(filename: string, extension: string): string {
  const current = extname(filename);
  return current
    ? `${filename.slice(0, -current.length)}.${extension}`
    : `${filename}.${extension}`;
}

export const replace_extension = replaceExtension;

export function prependExtension(filename: string, extension: string): string {
  const current = extname(filename);
  return current
    ? `${filename.slice(0, -current.length)}.${extension}${current}`
    : `${filename}.${extension}`;
}

export const prepend_extension = prependExtension;

export function subtitlesFilename(
  filename: string,
  subLang: string,
  subFormat: string,
  expectedRealExt?: string | null,
): string {
  const extension = `${subLang}.${subFormat}`;
  return expectedRealExt
    ? replaceExtension(filename, extension)
    : prependExtension(filename, extension);
}

export const subtitles_filename = subtitlesFilename;

export function orderedSet<T>(items: Iterable<T>): T[] {
  return [...new Set(items)];
}

export const orderedSet_ = orderedSet;

export class LazyList<T> implements Iterable<T> {
  readonly #cache: T[] = [];
  #done = false;
  #iterator: Iterator<T>;

  constructor(iterable: Iterable<T>) {
    this.#iterator = iterable[Symbol.iterator]();
  }

  get length(): number {
    this.exhaust();
    return this.#cache.length;
  }

  at(index: number): T | undefined {
    if (index < 0) {
      this.exhaust();
      return this.#cache.at(index);
    }
    while (!this.#done && this.#cache.length <= index) {
      this.nextItem();
    }
    return this.#cache[index];
  }

  slice(start?: number, end?: number): T[] {
    this.exhaust();
    return this.#cache.slice(start, end);
  }

  exhaust(): T[] {
    while (!this.#done) {
      this.nextItem();
    }
    return [...this.#cache];
  }

  [Symbol.iterator](): Iterator<T> {
    let index = 0;
    return {
      next: (): IteratorResult<T> => {
        const value = this.at(index);
        if (value === undefined && index >= this.#cache.length && this.#done) {
          return { done: true, value: undefined };
        }
        index += 1;
        return { done: false, value: value as T };
      },
    };
  }

  private nextItem(): void {
    const next = this.#iterator.next();
    if (next.done) {
      this.#done = true;
    } else {
      this.#cache.push(next.value);
    }
  }
}

export const LazyList_ = LazyList;

export class PagedList<T> implements Iterable<T> {
  protected pageCount = Number.POSITIVE_INFINITY;
  protected readonly cache = new Map<number, T[]>();

  constructor(
    protected readonly pageFunc: (page: number) => Iterable<T>,
    protected readonly pageSize: number,
    protected readonly useCache = true,
  ) {}

  get length(): number {
    return this.getslice().length;
  }

  getpage(pageNumber: number): T[] {
    let page = this.cache.get(pageNumber);
    if (!page) {
      page = pageNumber > this.pageCount ? [] : [...this.pageFunc(pageNumber)];
      if (this.useCache) {
        this.cache.set(pageNumber, page);
      }
    }
    return page;
  }

  getslice(_start = 0, _end?: number | null): T[] {
    throw new NotImplementedError("PagedList.getslice must be implemented by subclasses");
  }

  at(index: number): T | undefined {
    if (!this.useCache || !Number.isInteger(index) || index < 0) {
      throw new TypeError("indices must be non-negative integers");
    }
    return this.getslice(index, index + 1)[0];
  }

  [Symbol.iterator](): Iterator<T> {
    return this.getslice()[Symbol.iterator]();
  }
}

export class OnDemandPagedList<T> extends PagedList<T> {
  override getslice(start = 0, end?: number | null): T[] {
    const out: T[] = [];
    for (let pageNumber = Math.trunc(start / this.pageSize); ; pageNumber += 1) {
      const firstId = pageNumber * this.pageSize;
      const nextFirstId = firstId + this.pageSize;
      if (start >= nextFirstId) {
        continue;
      }
      const startOffset = firstId <= start && start < nextFirstId ? start % this.pageSize : 0;
      const endOffset = end !== null && end !== undefined && firstId <= end && end <= nextFirstId ? ((end - 1) % this.pageSize) + 1 : undefined;
      const fullPage = this.getpage(pageNumber);
      const page = fullPage.slice(startOffset, endOffset);
      out.push(...page);
      if (fullPage.length < this.pageSize || end === nextFirstId || (end !== null && end !== undefined && out.length >= end - start)) {
        break;
      }
    }
    return end === null || end === undefined ? out : out.slice(0, Math.max(0, end - start));
  }
}

export class InAdvancePagedList<T> extends PagedList<T> {
  constructor(pageFunc: (page: number) => Iterable<T>, pageCount: number, pageSize: number) {
    super(pageFunc, pageSize, true);
    this.pageCount = pageCount;
  }

  override getslice(start = 0, end?: number | null): T[] {
    const out: T[] = [];
    const startPage = Math.trunc(start / this.pageSize);
    const endPage = end === null || end === undefined ? this.pageCount : Math.min(this.pageCount, Math.trunc(end / this.pageSize) + 1);
    let remaining = end === null || end === undefined ? null : end - start;
    let skip = start - startPage * this.pageSize;
    for (let pageNumber = startPage; pageNumber < endPage; pageNumber += 1) {
      let page = this.getpage(pageNumber);
      if (skip) {
        page = page.slice(skip);
        skip = 0;
      }
      if (remaining !== null) {
        out.push(...page.slice(0, remaining));
        remaining -= page.length;
        if (remaining <= 0) {
          break;
        }
      } else {
        out.push(...page);
      }
    }
    return out;
  }
}

export function* frange(start = 0, stop?: number | null, step = 1): Iterable<number> {
  let current = start;
  let end = stop;
  if (end === null || end === undefined) {
    end = current;
    current = 0;
  }
  const sign = step > 0 ? 1 : step < 0 ? -1 : 0;
  while (sign * current < sign * end) {
    yield current;
    current += step;
  }
}

export function mimetype2ext(
  mimeType: string | null | undefined,
  defaultValue: string | null = null,
): string | null {
  if (typeof mimeType !== "string") {
    return defaultValue;
  }
  const map: Record<string, string> = {
    "video/ogg": "ogv",
    "video/x-flv": "flv",
    "video/x-matroska": "mkv",
    "application/dash+xml": "mpd",
    "application/f4m+xml": "f4m",
    "application/hds+xml": "f4m",
    "application/vnd.apple.mpegurl": "m3u8",
    "application/vnd.ms-sstr+xml": "ism",
    "application/x-mpegurl": "m3u8",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/webm": "webm",
    "audio/x-matroska": "mka",
    "audio/x-mpegurl": "m3u",
    "audio/x-wav": "wav",
    "text/vtt": "vtt",
    "application/x-subrip": "srt",
    "application/x-srt": "srt",
  };
  const mimetype = mimeType.split(";")[0]?.trim().toLowerCase() ?? "";
  const subtype = mimetype.split("/").pop() ?? "";
  return (
    map[mimetype] ??
    map[subtype] ??
    subtype.replaceAll("+", ".") ??
    defaultValue
  );
}

export function ext2mimetype(
  extOrUrl: string | null | undefined,
): string | null {
  if (!extOrUrl) {
    return null;
  }
  const ext = (
    extOrUrl.includes(".") ? extOrUrl.split(".").pop() : extOrUrl
  )?.toLowerCase();
  const map: Record<string, string> = {
    mp4: "video/mp4",
    m4a: "audio/mp4",
    mp3: "audio/mpeg",
    webm: "video/webm",
    m3u8: "application/vnd.apple.mpegurl",
    mpd: "application/dash+xml",
    vtt: "text/vtt",
    srt: "application/x-subrip",
    json: "application/json",
  };
  return ext ? (map[ext] ?? null) : null;
}

export const ext2mimetype_ = ext2mimetype;

export function parseCodecs(codecs: string | null | undefined): {
  acodec?: string;
  vcodec?: string;
  scodec?: string;
  dynamic_range?: string | null;
} {
  if (!codecs) {
    return {};
  }
  let vcodec: string | undefined;
  let acodec: string | undefined;
  let scodec: string | undefined;
  let dynamicRange: string | null = null;
  const splitCodecs = codecs
    .trim()
    .replace(/^,+|,+$/g, "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  for (const codec of codecs
    ?.split(",")
    .map((item) => item.trim())
    .filter(Boolean) ?? []) {
    const fullCodec = codec.replace(/^([^.]+)/, (part) => part.toLowerCase());
    const parts = fullCodec.replaceAll(/0+(?=\d)/g, "").split(".");
    const family = parts[0] ?? "";
    if (
      [
        "avc1",
        "avc2",
        "avc3",
        "avc4",
        "vp9",
        "vp8",
        "hev1",
        "hev2",
        "h263",
        "h264",
        "mp4v",
        "hvc1",
        "av1",
        "av01",
        "theora",
        "dvh1",
        "dvhe",
      ].includes(family)
    ) {
      vcodec ??= fullCodec;
      if (family === "dvh1" || family === "dvhe") {
        dynamicRange = "DV";
      } else if ((family === "av1" || family === "av01") && parts[3] === "10") {
        dynamicRange = "HDR10";
      } else if (parts[0] === "vp9" && parts[1] === "2") {
        dynamicRange = "HDR10";
      }
    } else if (
      [
        "flac",
        "mp4a",
        "opus",
        "vorbis",
        "mp3",
        "aac",
        "ac-4",
        "ac-3",
        "ec-3",
        "eac3",
        "dtsc",
        "dtse",
        "dtsh",
        "dtsl",
      ].includes(family)
    ) {
      acodec ??= fullCodec;
    } else if (family === "stpp" || family === "wvtt") {
      scodec ??= fullCodec;
    }
  }
  if (vcodec || acodec || scodec) {
    return {
      vcodec: vcodec ?? "none",
      acodec: acodec ?? "none",
      dynamic_range: dynamicRange,
      ...(scodec ? { scodec } : {}),
    };
  }
  return splitCodecs.length === 2
    ? { vcodec: splitCodecs[0], acodec: splitCodecs[1] }
    : {};
}

export const parse_codecs = parseCodecs;

export function filesizeFromTbr(
  tbr: number | null | undefined,
  duration: number | null | undefined,
): number | null {
  return tbr == null || duration == null
    ? null
    : Math.trunc(duration * tbr * (1000 / 8));
}

export const filesize_from_tbr = filesizeFromTbr;

export function getCompatibleExt(options: {
  vcodecs: readonly (string | null | undefined)[];
  acodecs: readonly (string | null | undefined)[];
  vexts: readonly string[];
  aexts: readonly string[];
  preferences?: readonly string[] | null;
}): string {
  const { vcodecs, acodecs, vexts, aexts, preferences } = options;
  if (vcodecs.length !== vexts.length || acodecs.length !== aexts.length) {
    throw new Error("Codec and extension arrays must have matching lengths");
  }
  const allowMkv = !preferences || preferences.includes("mkv");
  if (allowMkv && Math.max(acodecs.length, vcodecs.length) > 1) {
    return "mkv";
  }
  const compatibleCodecs: Record<string, Set<string>> = {
    mp4: new Set([
      "av1",
      "hevc",
      "avc1",
      "mp4a",
      "ac-4",
      "h264",
      "aacl",
      "ec-3",
    ]),
    webm: new Set(["av1", "vp9", "vp8", "opus", "vrbs", "vp9x", "vp8x"]),
  };
  const sanitizeCodec = (values: readonly (string | null | undefined)[]) =>
    values[0]?.split(".")[0]?.replaceAll("0", "").toLowerCase();
  const vcodec = sanitizeCodec(vcodecs);
  const acodec = sanitizeCodec(acodecs);
  for (const ext of preferences ?? Object.keys(compatibleCodecs)) {
    const codecSet = compatibleCodecs[ext] ?? new Set<string>();
    if (
      ext === "mkv" ||
      (vcodec && acodec && codecSet.has(vcodec) && codecSet.has(acodec))
    ) {
      return ext;
    }
  }
  const compatibleExts = [
    new Set([
      "mp3",
      "mp4",
      "m4a",
      "m4p",
      "m4b",
      "m4r",
      "m4v",
      "ismv",
      "isma",
      "mov",
    ]),
    new Set(["webm", "weba"]),
  ];
  for (const ext of preferences ?? vexts) {
    const currentExts = new Set([ext, ...vexts, ...aexts]);
    if (
      ext === "mkv" ||
      (currentExts.size === 1 && currentExts.has(ext)) ||
      compatibleExts.some((set) =>
        [...currentExts].every((item) => set.has(item)),
      )
    ) {
      return ext;
    }
  }
  return allowMkv ? "mkv" : (preferences?.at(-1) ?? "mkv");
}

export const get_compatible_ext = getCompatibleExt;

export function parseDfxpTimeExpr(
  timeExpr: string | null | undefined,
): number | null {
  if (!timeExpr) {
    return null;
  }
  const offset = /^(?<timeOffset>[0-9]+(?:\.[0-9]+)?)s?$/.exec(timeExpr);
  if (offset?.groups?.timeOffset) {
    return Number(offset.groups.timeOffset);
  }
  const clock = /^(\d+):(\d\d):(\d\d(?:(?:\.|:)\d+)?)$/.exec(timeExpr);
  if (!clock) {
    return null;
  }
  return (
    3600 * Number(clock[1]) +
    60 * Number(clock[2]) +
    Number(clock[3]?.replace(":", "."))
  );
}

export function dfxp2srt(dfxpData: Uint8Array | string): string {
  const xml = (
    typeof dfxpData === "string" ? dfxpData : decodeXmlBytes(dfxpData)
  )
    .replaceAll("encoding='UTF-16'", "encoding='UTF-8'")
    .replaceAll('encoding="UTF-16"', 'encoding="UTF-8"');
  const normalized = xml
    .replaceAll("http://www.w3.org/2004/11/ttaf1", "http://www.w3.org/ns/ttml")
    .replaceAll("http://www.w3.org/2006/04/ttaf1", "http://www.w3.org/ns/ttml")
    .replaceAll("http://www.w3.org/2006/10/ttaf1", "http://www.w3.org/ns/ttml")
    .replaceAll(
      "http://www.w3.org/ns/ttml#style",
      "http://www.w3.org/ns/ttml#styling",
    );
  const styles = parseTtmlStyles(normalized);
  const defaultStyle = parseTtmlDefaultStyle(normalized, styles);
  const paragraphs = [
    ...normalized.matchAll(
      /<(?<tag>(?:[\w-]+:)?p)\b(?<attrs>[^>]*)>(?<body>[\s\S]*?)<\/\k<tag>>/g,
    ),
  ];
  if (!paragraphs.length) {
    throw new Error("Invalid dfxp/TTML subtitle");
  }
  const output: string[] = [];
  for (const [index, paragraph] of paragraphs.entries()) {
    const attrs = parseXmlAttributesSubset(paragraph.groups?.attrs ?? "");
    const beginTime = parseDfxpTimeExpr(attrs.begin);
    let endTime = parseDfxpTimeExpr(attrs.end);
    const duration = parseDfxpTimeExpr(attrs.dur);
    if (beginTime === null) {
      continue;
    }
    if (endTime === null) {
      if (duration === null) {
        continue;
      }
      endTime = beginTime + duration;
    }
    if (endTime <= beginTime) {
      continue;
    }
    const text = ttmlTextToSrt(
      paragraph.groups?.body ?? "",
      parseXmlAttributesSubset(paragraph.groups?.attrs ?? ""),
      styles,
      defaultStyle,
    );
    output.push(
      `${output.length + 1}\n${srtSubtitlesTimecode(beginTime)} --> ${srtSubtitlesTimecode(endTime)}\n${text}\n\n`,
    );
  }
  return output.join("");
}

export const dfxp2srt_ = dfxp2srt;

const TTML_SUPPORTED_STYLING = [
  "color",
  "fontFamily",
  "fontSize",
  "fontStyle",
  "fontWeight",
  "textDecoration",
] as const;

type TtmlStyle = Partial<Record<(typeof TTML_SUPPORTED_STYLING)[number], string>>;

function decodeXmlBytes(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return Buffer.from(bytes.subarray(2)).toString("utf16le");
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    const swapped = new Uint8Array(bytes.length - 2);
    for (let index = 2; index + 1 < bytes.length; index += 2) {
      swapped[index - 2] = bytes[index + 1] ?? 0;
      swapped[index - 1] = bytes[index] ?? 0;
    }
    return Buffer.from(swapped).toString("utf16le");
  }
  return new TextDecoder("utf-8").decode(bytes);
}

function parseTtmlStyles(xml: string): Map<string, TtmlStyle> {
  const styles = new Map<string, TtmlStyle>();
  const pending: Array<{ id: string; parent?: string; attrs: Record<string, string> }> = [];
  for (const styleMatch of xml.matchAll(/<(?:(?:[\w-]+):)?style\b(?<attrs>[^>]*)\/?>/g)) {
    const attrs = parseXmlAttributesSubset(styleMatch.groups?.attrs ?? "");
    const id = attrs.id;
    if (!id) continue;
    pending.push({ id, parent: attrs.style, attrs });
  }

  let progressed = true;
  while (pending.length && progressed) {
    progressed = false;
    for (let index = pending.length - 1; index >= 0; index -= 1) {
      const style = pending[index];
      if (!style) continue;
      if (style.parent && !styles.has(style.parent)) continue;
      const parsed: TtmlStyle = style.parent ? { ...styles.get(style.parent) } : {};
      applyTtmlStyleAttributes(parsed, style.attrs);
      styles.set(style.id, parsed);
      pending.splice(index, 1);
      progressed = true;
    }
  }
  return styles;
}

function parseTtmlDefaultStyle(xml: string, styles: Map<string, TtmlStyle>): TtmlStyle {
  for (const tag of ["body", "div"]) {
    const elementMatch = new RegExp(`<(?:(?:[\\w-]+):)?${tag}\\b(?<attrs>[^>]*)>`, "i").exec(xml);
    const styleId = parseXmlAttributesSubset(elementMatch?.groups?.attrs ?? "").style;
    if (styleId && styles.has(styleId)) {
      return { ...styles.get(styleId) };
    }
  }
  return {};
}

function applyTtmlStyleAttributes(style: TtmlStyle, attrs: Record<string, string>): void {
  for (const prop of TTML_SUPPORTED_STYLING) {
    const value = attrs[prop];
    if (value) {
      style[prop] = value;
    }
  }
}

function resolveTtmlStyle(
  attrs: Record<string, string>,
  styles: Map<string, TtmlStyle>,
  defaultStyle: TtmlStyle,
): TtmlStyle {
  const style: TtmlStyle = { ...defaultStyle };
  if (attrs.style && styles.has(attrs.style)) {
    Object.assign(style, styles.get(attrs.style));
  }
  applyTtmlStyleAttributes(style, attrs);
  return style;
}

function openTtmlStyle(
  out: string[],
  style: TtmlStyle,
  appliedStyles: TtmlStyle[],
): string[] {
  const unclosed: string[] = [];
  let font = "";
  const previous = appliedStyles.at(-1);
  for (const key of Object.keys(style).sort() as Array<keyof TtmlStyle>) {
    const value = style[key];
    if (!value || previous?.[key] === value) continue;
    if (key === "color") {
      font += ` color="${escapeHTML(value)}"`;
    } else if (key === "fontFamily") {
      font += ` face="${escapeHTML(value)}"`;
    } else if (key === "fontSize") {
      font += ` size="${escapeHTML(value)}"`;
    } else if (key === "fontStyle" && value === "italic") {
      out.push("<i>");
      unclosed.push("i");
    } else if (key === "fontWeight" && value === "bold") {
      out.push("<b>");
      unclosed.push("b");
    } else if (key === "textDecoration" && value === "underline") {
      out.push("<u>");
      unclosed.push("u");
    }
  }
  if (font) {
    out.push(`<font${font}>`);
    unclosed.push("font");
  }
  if (Object.keys(style).length) {
    appliedStyles.push({ ...(previous ?? {}), ...style });
  }
  return unclosed;
}

function ttmlTextToSrt(
  body: string,
  paragraphAttrs: Record<string, string>,
  styles: Map<string, TtmlStyle>,
  defaultStyle: TtmlStyle,
): string {
  const out: string[] = [];
  const appliedStyles: TtmlStyle[] = [];
  const unclosedStack: string[][] = [];

  const openElement = (attrs: Record<string, string>) => {
    const style = resolveTtmlStyle(attrs, styles, defaultStyle);
    unclosedStack.push(openTtmlStyle(out, style, appliedStyles));
  };
  const closeElement = () => {
    const unclosed = unclosedStack.pop() ?? [];
    for (const element of unclosed.toReversed()) {
      out.push(`</${element}>`);
    }
    if (unclosed.length) {
      appliedStyles.pop();
    }
  };

  openElement(paragraphAttrs);
  for (const token of body.matchAll(/<[^>]+>|[^<]+/g)) {
    const value = token[0];
    const tag = /^<\s*(?<close>\/)?\s*(?:(?:[\w-]+):)?(?<name>[\w-]+)\b(?<attrs>[^>]*?)(?<self>\/)?\s*>$/.exec(value);
    if (!tag) {
      out.push(xmlUnescapeSubset(value));
      continue;
    }
    const name = tag.groups?.name?.toLowerCase();
    if (name === "br") {
      out.push("\n");
      continue;
    }
    if (tag.groups?.close) {
      closeElement();
      continue;
    }
    openElement(parseXmlAttributesSubset(tag.groups?.attrs ?? ""));
    if (tag.groups?.self) {
      closeElement();
    }
  }
  closeElement();

  return out
    .join("")
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

function parseXmlAttributesSubset(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of text.matchAll(
    /(?<key>[\w:-]+)\s*=\s*(?:"(?<double>[^"]*)"|'(?<single>[^']*)')/g,
  )) {
    const key = match.groups?.key?.split(":").pop();
    if (key) {
      out[key] = xmlUnescapeSubset(
        match.groups?.double ?? match.groups?.single ?? "",
      );
    }
  }
  return out;
}

function xmlUnescapeSubset(text: string): string {
  return text
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

export function urlBasename(url: string): string {
  return basename(new URL(url).pathname.replace(/\/+$/, ""));
}

export const url_basename = urlBasename;

export function formatField<T>(
  obj: Record<string, T> | T | null | undefined,
  field: string | null = null,
  template = "%s",
  ignore: unknown = NO_DEFAULT,
  defaultValue = "",
  func: (value: T) => unknown = IDENTITY,
): string {
  const value =
    field && obj && typeof obj === "object" && !Array.isArray(obj)
      ? (obj as Record<string, T>)[field]
      : (obj as T | null | undefined);
  if (value === null || value === undefined || value === ignore) {
    return defaultValue;
  }
  return template.replace("%s", String(func(value)));
}

export const format_field = formatField;

export function jwtDecodeHs256(token: string): Record<string, unknown> {
  const part = token.split(".")[1];
  if (!part) {
    throw new ExtractorError("Invalid JWT token", { expected: true });
  }
  const padded = part
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(part.length / 4) * 4, "=");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<
    string,
    unknown
  >;
}

export const jwt_decode_hs256 = jwtDecodeHs256;

export function encodeDataUri(
  data: Uint8Array | string,
  mimeType: string,
): string {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  return `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`;
}

export const encode_data_uri = encodeDataUri;

export function ageRestricted(
  contentLimit: number | null | undefined,
  ageLimit: number | null | undefined,
): boolean {
  return (
    ageLimit !== null &&
    ageLimit !== undefined &&
    contentLimit !== null &&
    contentLimit !== undefined &&
    ageLimit < contentLimit
  );
}

export const age_restricted = ageRestricted;

export function isHtml(firstBytes: Uint8Array | string): boolean {
  const bytes = typeof firstBytes === "string" ? new TextEncoder().encode(firstBytes) : firstBytes.subarray(0, 512);
  let text: string;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    text = new TextDecoder("utf-8").decode(bytes.subarray(3));
  } else if (bytes[0] === 0xff && bytes[1] === 0xfe && bytes[2] === 0 && bytes[3] === 0) {
    text = decodeUtf32(bytes.subarray(4), true);
  } else if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 0xfe && bytes[3] === 0xff) {
    text = decodeUtf32(bytes.subarray(4), false);
  } else if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    text = decodeUtf16Le(bytes.subarray(2));
  } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    text = decodeUtf16Be(bytes.subarray(2));
  } else {
    text = new TextDecoder().decode(bytes);
  }
  text = text.trimStart().toLowerCase();
  return (
    text.startsWith("<!doctype") ||
    text.startsWith("<html") ||
    text.includes("<head") ||
    text.includes("<script") ||
    text.includes("<title")
  );
}

export const is_html = isHtml;

export function uppercaseEscape(value: string): string {
  return value.replaceAll(/\\U([0-9a-fA-F]{8})/g, (_, code: string) =>
    String.fromCodePoint(Number.parseInt(code, 16)),
  );
}

export const uppercase_escape = uppercaseEscape;

export function lowercaseEscape(value: string): string {
  return value.replaceAll(/\\u([0-9a-fA-F]{4})/g, (_, code: string) =>
    String.fromCharCode(Number.parseInt(code, 16)),
  );
}

export const lowercase_escape = lowercaseEscape;

export function monthByName(
  name: string | null | undefined,
  lang = "en",
): number | null {
  if (!name) {
    return null;
  }
  const monthNames = MONTH_NAMES[lang] ?? ENGLISH_MONTH_NAMES;
  const normalized = stripDiacritics(name);
  const index = monthNames.findIndex(
    (month) => stripDiacritics(month) === normalized,
  );
  return index >= 0 ? index + 1 : null;
}

export const month_by_name = monthByName;

export function monthByAbbreviation(
  abbrev: string | null | undefined,
): number | null {
  if (!abbrev) {
    return null;
  }
  const index = ENGLISH_MONTH_NAMES.map((month) => month.slice(0, 3)).indexOf(
    abbrev,
  );
  return index >= 0 ? index + 1 : null;
}

export const month_by_abbreviation = monthByAbbreviation;

export function formatDecimalSuffix(
  num: number | null | undefined,
  fmt = "%d%s",
  options: { factor?: number } = {},
): string | null {
  if (num === null || num === undefined) {
    return null;
  }
  const factor = options.factor ?? 1000;
  const suffixes = ["", "k", "M", "G", "T", "P", "E", "Z", "Y"];
  let value = num;
  let suffix = "";
  for (const candidate of suffixes) {
    suffix = candidate;
    if (Math.abs(value) < factor || candidate === suffixes.at(-1)) {
      break;
    }
    value /= factor;
  }
  const precision = /%\.(\d+)f/.exec(fmt)?.[1];
  const rendered =
    precision !== undefined
      ? value.toFixed(Number(precision))
      : suffix
        ? (value < 10
            ? value.toFixed(2)
            : value < 100
              ? value.toFixed(1)
              : value.toFixed(0)
          ).replace(/\.0+$/, "")
        : Math.trunc(value).toString();
  return fmt.replace(/%(?:\.\d+f|d)/, rendered).replace("%s", suffix);
}

export const format_decimal_suffix = formatDecimalSuffix;

export function formatBytes(bytes: number | null | undefined): string {
  return formatDecimalSuffix(bytes, "%.2f%sB", { factor: 1024 }) ?? "N/A";
}

export const format_bytes = formatBytes;

export function encodeBaseN(num: number, n = 62, table?: string): string {
  const alphabet =
    table ??
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".slice(
      0,
      n,
    );
  if (num === 0) {
    return alphabet[0] ?? "";
  }
  let value = Math.trunc(num);
  let out = "";
  while (value > 0) {
    out = alphabet[value % n] + out;
    value = Math.trunc(value / n);
  }
  return out;
}

export const encode_base_n = encodeBaseN;

export function decodeBaseN(value: string, n = 62, table?: string): number {
  const alphabet =
    table ??
    "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".slice(
      0,
      n,
    );
  return [...value].reduce((acc, char) => acc * n + alphabet.indexOf(char), 0);
}

export const decode_base_n = decodeBaseN;

export function caesar(value: string, alphabet: string, shift: number): string {
  const chars = [...alphabet];
  return [...value]
    .map((char) => {
      const index = chars.indexOf(char);
      return index < 0 ? char : chars[(index + shift) % chars.length];
    })
    .join("");
}

export function rot47(value: string): string {
  return [...value]
    .map((char) => {
      const code = char.charCodeAt(0);
      return code >= 33 && code <= 126
        ? String.fromCharCode(33 + ((code + 14) % 94))
        : char;
    })
    .join("");
}

export function urshift(value: number, shift: number): number {
  return value >>> shift;
}

export function iriToUri(iri: string): string {
  try {
    return new URL(iri).toString();
  } catch {
    return encodeURI(iri);
  }
}

export const iri_to_uri = iriToUri;

export function extractBasicAuth(
  url: string,
): [string, { Authorization?: string }] {
  const parsed = new URL(url);
  if (!parsed.username && !parsed.password) {
    return [url, {}];
  }
  const username = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  parsed.username = "";
  parsed.password = "";
  return [
    parsed.toString(),
    {
      Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
    },
  ];
}

export const extract_basic_auth = extractBasicAuth;

export function sanitizeUrl(
  url: string,
  options: { scheme?: string } = {},
): string {
  const scheme = options.scheme ?? "http";
  if (url.startsWith("//")) {
    return `${scheme}:${url}`;
  }
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
    return `${scheme}://${url}`;
  }
  return url;
}

export const sanitize_url = sanitizeUrl;

export function makeArchiveId(
  ie: { IE_NAME?: string } | string,
  videoId: unknown,
): string {
  return `${typeof ie === "string" ? ie : (ie.IE_NAME ?? "unknown")} ${videoId}`;
}

export const make_archive_id = makeArchiveId;

const SMUGGLE_KEY = "__youtubedl_smuggle";

export function smuggleUrl(url: string, data: Record<string, unknown>): string {
  const parsed = new URL(url);
  parsed.searchParams.set(
    SMUGGLE_KEY,
    Buffer.from(JSON.stringify(data), "utf8").toString("base64url"),
  );
  return parsed.toString();
}

export const smuggle_url = smuggleUrl;

export function unsmuggleUrl(
  url: string,
  defaultValue: Record<string, unknown> = {},
): [string, Record<string, unknown>] {
  const parsed = new URL(url);
  const encoded = parsed.searchParams.get(SMUGGLE_KEY);
  if (!encoded) {
    return [url, defaultValue];
  }
  parsed.searchParams.delete(SMUGGLE_KEY);
  try {
    return [
      parsed.toString(),
      JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<
        string,
        unknown
      >,
    ];
  } catch {
    return [parsed.toString(), defaultValue];
  }
}

export const unsmuggle_url = unsmuggleUrl;

function applyQueryUpdate(
  parsed: URL,
  query:
    | URLSearchParams
    | Record<
        string,
        | string
        | number
        | boolean
        | readonly (string | number | boolean)[]
        | null
        | undefined
      >,
): void {
  const entries =
    query instanceof URLSearchParams
      ? [...query.entries()]
      : Object.entries(query);
  for (const [key, value] of entries) {
    parsed.searchParams.delete(key);
    if (value === null || value === undefined) {
      continue;
    }
    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      parsed.searchParams.append(key, String(item));
    }
  }
}

function addDateUnit(date: Date, unit: string, amount: number): Date {
  const out = new Date(date.getTime());
  if (unit.startsWith("microsecond")) {
    out.setTime(out.getTime() + Math.trunc(amount / 1000));
  } else if (unit.startsWith("second")) {
    out.setUTCSeconds(out.getUTCSeconds() + amount);
  } else if (unit.startsWith("minute")) {
    out.setUTCMinutes(out.getUTCMinutes() + amount);
  } else if (unit.startsWith("hour")) {
    out.setUTCHours(out.getUTCHours() + amount);
  } else if (unit.startsWith("day")) {
    out.setUTCDate(out.getUTCDate() + amount);
  } else if (unit.startsWith("week")) {
    out.setUTCDate(out.getUTCDate() + amount * 7);
  } else if (unit.startsWith("month")) {
    out.setUTCMonth(out.getUTCMonth() + amount);
  } else if (unit.startsWith("year")) {
    out.setUTCFullYear(out.getUTCFullYear() + amount);
  }
  return out;
}

function roundDate(
  date: Date,
  precision: "microsecond" | "second" | "minute" | "hour" | "day",
): Date {
  const out = new Date(date.getTime());
  if (precision === "day") {
    out.setUTCHours(0);
  }
  if (precision === "day" || precision === "hour") {
    out.setUTCMinutes(0);
  }
  if (precision === "day" || precision === "hour" || precision === "minute") {
    out.setUTCSeconds(0);
  }
  if (precision !== "microsecond") {
    out.setUTCMilliseconds(0);
  }
  return out;
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replaceAll(/\p{Diacritic}/gu, "");
}

function normalizeDecimalNumber(value: string): string {
  if (value.includes(",") && !value.includes(".")) {
    return value.replace(",", ".");
  }
  return value.replaceAll(",", "");
}

function decodeUtf16Be(bytes: Uint8Array): string {
  return decodeUtf16(bytes, false);
}

function decodeUtf16Le(bytes: Uint8Array): string {
  return decodeUtf16(bytes, true);
}

function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  const codepoints: number[] = [];
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    const codepoint = littleEndian
      ? (bytes[index] ?? 0) | ((bytes[index + 1] ?? 0) << 8)
      : ((bytes[index] ?? 0) << 8) | (bytes[index + 1] ?? 0);
    if (codepoint > 0) {
      codepoints.push(codepoint);
    }
  }
  return String.fromCharCode(...codepoints);
}

function decodeUtf32(bytes: Uint8Array, littleEndian: boolean): string {
  const codepoints: number[] = [];
  for (let index = 0; index + 3 < bytes.length; index += 4) {
    const codepoint = littleEndian
      ? (bytes[index] ?? 0) | ((bytes[index + 1] ?? 0) << 8) | ((bytes[index + 2] ?? 0) << 16) | ((bytes[index + 3] ?? 0) << 24)
      : ((bytes[index] ?? 0) << 24) | ((bytes[index + 1] ?? 0) << 16) | ((bytes[index + 2] ?? 0) << 8) | (bytes[index + 3] ?? 0);
    if (codepoint > 0) {
      codepoints.push(codepoint);
    }
  }
  return String.fromCodePoint(...codepoints);
}

export function stripJsonp(code: string): string {
  const match =
    /^(?:window\.)?([a-zA-Z0-9_.$]*)(?:\s*&&\s*\1)?\s*\(\s*([\s\S]*)\);?\s*(?:\/\/[^\n]*)*$/.exec(
      code.trim(),
    );
  return match?.[2]?.trim() ?? code;
}

export const strip_jsonp = stripJsonp;

export function jsToJson(
  code: string,
  vars: Record<string, string> = {},
  strict = false,
): string {
  let processed = code.replace(/(?:new\s+)?Array\((.*?)\)/g, "[$1]");
  const PATTERN =
    /(?<str>'(?:\\.|[^\\'])*'|"(?:\\.|[^\\"])*"|`(?:\\.|[^\\`])*`)|(?<comment>\/\*(?:(?!\*\/)[\s\S])*\*\/|\/\/[^\n]*\n)|(?<comma>,\s*(?=[\]}]))|(?<void>\bvoid\s+0\b|\bundefined\b)|(?<ident>(?:(?<![0-9])[eE]|[a-df-zA-DF-Z_$])[.a-zA-Z_$0-9]*)|(?<hex>\b(?:0[xX][0-9a-fA-F]+|(?<!\.)0+[0-7]+)(?:\s*:)?)|(?<num>[0-9]+(?=\s*:))|(?<excl>!+)/g;
  processed = processed.replace(PATTERN, (...args) => {
    const groups = args.at(-1) as Record<string, string>;
    if (groups.str) {
      let content = decodeJsStringLiteral(groups.str);
      if (groups.str.startsWith("`")) {
        content = content.replace(/\$\{(.*?)\}/g, (_, key) => {
          const trimmed = key.trim();
          return vars[trimmed] !== undefined ? JSON.parse(vars[trimmed]) : "";
        });
      }
      return JSON.stringify(content);
    }
    if (groups.comment || groups.comma || groups.excl) {
      return "";
    }
    if (groups.void) {
      return "null";
    }
    if (groups.hex) {
      const hasColon = groups.hex.endsWith(":");
      const numStr = hasColon ? groups.hex.slice(0, -1).trim() : groups.hex;
      const num = Number(numStr);
      if (Number.isNaN(num)) return groups.hex;
      return hasColon ? `"${num}":` : String(num);
    }
    if (groups.num) {
      return `"${groups.num}"`;
    }
    if (groups.ident) {
      const m = groups.ident;
      if (m === "true" || m === "false" || m === "null") {
        return m;
      }
      if (vars[m] !== undefined) {
        return vars[m];
      }
      if (!strict) {
        return `"${m}"`;
      }
      return m;
    }
    return args[0];
  });
  return processed;
}

export const js_to_json = jsToJson;

function decodeJsStringLiteral(value: string): string {
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1);
    }
  }
  return value
    .slice(1, -1)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    )
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, code: string) =>
      String.fromCharCode(Number.parseInt(code, 16)),
    )
    .replace(/\\([\\'"`/bfnrt])/g, (_, escaped: string) => {
      switch (escaped) {
        case "b":
          return "\b";
        case "f":
          return "\f";
        case "n":
          return "\n";
        case "r":
          return "\r";
        case "t":
          return "\t";
        default:
          return escaped;
      }
    });
}

export function preferredencoding(): string {
  return "UTF-8";
}

export async function writeJsonFile(obj: unknown, filename: string): Promise<void> {
  const dir = dirname(filename);
  const tmpName = join(dir, `${basename(filename)}.${randomBytes(4).toString("hex")}.tmp`);
  try {
    await Bun.write(tmpName, JSON.stringify(obj));
    renameSync(tmpName, filename);
  } catch (error) {
    try {
      unlinkSync(tmpName);
    } catch {}
    throw error;
  }
}

export const write_json_file = writeJsonFile;

export function partialApplication<T extends (...args: unknown[]) => unknown>(func: T): T {
  return func;
}

export const partial_application = partialApplication;

export function writeString(value: string, out: { write?: (chunk: string) => unknown } | null = null): void {
  if (out?.write) {
    out.write(value);
  } else {
    Bun.write(Bun.stdout, value);
  }
}

export const write_string = writeString;

export function deprecationWarning(message: string, options: { printer?: (message: string) => void } = {}): void {
  (options.printer ?? console.warn)(`DeprecationWarning: ${message}`);
}

export const deprecation_warning = deprecationWarning;

export function isPathLike(value: unknown): value is string | Uint8Array | { toString(): string } {
  return typeof value === "string" || value instanceof Uint8Array || (typeof value === "object" && value !== null && "toString" in value);
}

export const is_path_like = isPathLike;

export function expandPath(value: string): string {
  if (value === "~" || value.startsWith("~/")) {
    return join(process.env.HOME ?? "", value.slice(2));
  }
  return value.replaceAll(/\$([A-Za-z_][A-Za-z0-9_]*)|\$\{([^}]+)\}/g, (_match, bare: string, braced: string) => process.env[bare || braced] ?? "");
}

export const expand_path = expandPath;

const ACCENT_MAP: Record<string, string> = {
  Â: "A", Ã: "A", Ä: "A", À: "A", Á: "A", Å: "A", Æ: "AE", Ç: "C", È: "E", É: "E", Ê: "E", Ë: "E", Ì: "I", Í: "I", Î: "I", Ï: "I", Ð: "D", Ñ: "N", Ò: "O", Ó: "O", Ô: "O", Õ: "O", Ö: "O", Ő: "O", Ø: "O", Œ: "OE", Ù: "U", Ú: "U", Û: "U", Ü: "U", Ű: "U", Ý: "Y", Þ: "TH", ß: "ss",
  à: "a", á: "a", â: "a", ã: "a", ä: "a", å: "a", æ: "ae", ç: "c", è: "e", é: "e", ê: "e", ë: "e", ì: "i", í: "i", î: "i", ï: "i", ð: "i", ñ: "n", ò: "o", ó: "o", ô: "o", õ: "o", ö: "o", ő: "o", ø: "o", œ: "oe", ù: "u", ú: "u", û: "u", ü: "u", ű: "u", ý: "y", þ: "th", ÿ: "y",
};

export function sanitizeFilename(value: string, options: { restricted?: boolean; is_id?: boolean } = {}): string {
  const restricted = options.restricted ?? false;
  const isId = options.is_id;
  if (value === "") {
    return "";
  }
  const normalizedValue = restricted && isId !== true ? value.normalize("NFKC") : value;
  const timestampSafe = normalizedValue.replaceAll(/[0-9]+(?::[0-9]+)+/g, (match) => match.replaceAll(":", "_"));
  if (!restricted) {
    let out = "";
    for (const char of timestampSafe) {
      if (isId === undefined && '"*:<>?|/\\"'.includes(char)) {
        out += char === "/" ? "⧸" : char === "\\" ? "⧹" : String.fromCodePoint(char.codePointAt(0)! + 0xfee0);
      } else if (char === "?" || char < " " || char.charCodeAt(0) === 0x7f) {
        continue;
      } else if (char === '"') {
        out += isId === true ? char : "'";
      } else if (char === ":") {
        out += isId === true ? char : " -";
      } else if ("\\/|*<>".includes(char)) {
        out += isId === true ? char : "_";
      } else {
        out += char;
      }
    }
    if (isId === false) {
      out = out.replaceAll(/__+/g, "_").replace(/^_+|_+$/g, "").replace(/^\.+/, "");
      if (out.startsWith("-")) {
        out = `_${out.slice(1)}`;
      }
    }
    return out || "_";
  }
  let out = [...timestampSafe].map((char) => ACCENT_MAP[char] ?? (/[A-Za-z0-9._-]/.test(char) ? char : "_")).join("");
  out = out.replaceAll(/_+/g, "_").replace(/^_+|_+$/g, "").replace(/^\.+/, "");
  if (isId === false) {
    if (out.startsWith("-_")) out = out.slice(2);
    if (out.startsWith("-")) out = `_${out.slice(1)}`;
  }
  return out || "_";
}

export const sanitize_filename = sanitizeFilename;

export function sanitizePath(value: string): string {
  return value.split(/[\\/]/).map((part) => part.replaceAll(/[<>:"|?*]/g, "#").replace(/\.+$/, (dots) => `${dots.slice(0, -1)}#`)).join("\\");
}

export const sanitize_path = sanitizePath;

export function sanitizeOpen(filename: string, openMode: string): { filename: string; mode: string } {
  return { filename: sanitizePath(filename), mode: openMode };
}

export const sanitize_open = sanitizeOpen;

export function timeconvert(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed / 1000) : null;
}

export function timetupleFromMsec(milliseconds: number): Date {
  return new Date(milliseconds);
}

export const timetuple_from_msec = timetupleFromMsec;

export function boolOrNone(value: unknown, defaultValue: boolean | null = null): boolean | null {
  return typeof value === "boolean" ? value : defaultValue;
}

export const bool_or_none = boolOrNone;

export function encodeCompatStr(value: string | Uint8Array, encoding = "utf-8"): string {
  return typeof value === "string" ? value : new TextDecoder(encoding as ConstructorParameters<typeof TextDecoder>[0]).decode(value);
}

export const encode_compat_str = encodeCompatStr;

export function errorToStr(error: unknown): string {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

export const error_to_str = errorToStr;

export function dateFromStr(value: string, options: { strict?: boolean; format?: string } = {}): Date {
  if (options.strict && !/^\d{8}|(?:now|today|yesterday)(?:-\d+(?:day|week|month|year)s?)?$/.test(value)) {
    throw new Error(`Invalid date format "${value}"`);
  }
  const parsed = datetimeFromStr(value, "microsecond");
  if (!parsed) {
    throw new Error(`Invalid date format "${value}"`);
  }
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

export const date_from_str = dateFromStr;

export function datetimeAddMonths(date: Date, months: number): Date {
  const out = new Date(date.getTime());
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
  out.setUTCDate(Math.min(day, lastDay));
  return out;
}

export const datetime_add_months = datetimeAddMonths;

export function datetimeRound(date: Date, precision: "microsecond" | "second" | "minute" | "hour" | "day" = "day"): Date {
  return roundDate(date, precision);
}

export const datetime_round = datetimeRound;

export function hyphenateDate(value: string): string {
  return value.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
}

export const hyphenate_date = hyphenateDate;

export class DateRange {
  readonly start: Date | null;
  readonly end: Date | null;

  constructor(start?: string | Date | null, end?: string | Date | null) {
    this.start = typeof start === "string" ? dateFromStr(start) : start ?? null;
    this.end = typeof end === "string" ? dateFromStr(end) : end ?? null;
  }

  includes(date: string | Date): boolean {
    const parsed = typeof date === "string" ? dateFromStr(date) : date;
    return (!this.start || parsed >= this.start) && (!this.end || parsed <= this.end);
  }
}

export function systemIdentifier(): string {
  return `${process.platform}-${process.arch}`;
}

export const system_identifier = systemIdentifier;

export function getWindowsVersion(): string | null {
  return process.platform === "win32" ? (process as unknown as { getSystemVersion?: () => string }).getSystemVersion?.() ?? null : null;
}

export const get_windows_version = getWindowsVersion;

export function getFilesystemEncoding(): string {
  return "utf-8";
}

export const get_filesystem_encoding = getFilesystemEncoding;

export function lookupUnitTable(unitTable: Record<string, number>, value: string, strict = false): number | null {
  const unit = strict ? value : value.toLowerCase();
  return unitTable[unit] ?? null;
}

export const lookup_unit_table = lookupUnitTable;

export function parseBytes(value: string | null | undefined): number | null {
  return parseFilesize(value);
}

export const parse_bytes = parseBytes;

export function getDomain(url: string): string | null {
  try {
    return removeStart(new URL(url).host, "www.") ?? null;
  } catch {
    return null;
  }
}

export const get_domain = getDomain;

export function readBatchUrls(textOrFile: string | { read?: () => string }): string[] {
  const text = typeof textOrFile === "string" ? textOrFile : textOrFile.read?.() ?? "";
  return text.replace(/^\uFEFF/, "").split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#") && !line.startsWith(";"));
}

export const read_batch_urls = readBatchUrls;

export function multipartEncode(data: Record<string | number, string | Uint8Array>, boundary = randomBytes(8).toString("hex")): [Uint8Array, string] {
  const chunks: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (String(value).includes(boundary)) {
      throw new Error("Boundary occurs in data");
    }
    chunks.push(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${typeof value === "string" ? value : new TextDecoder().decode(value)}\r\n`);
  }
  chunks.push(`--${boundary}--\r\n`);
  return [new TextEncoder().encode(chunks.join("")), `multipart/form-data; boundary=${boundary}`];
}

export const multipart_encode = multipartEncode;

export function isIterableLike(value: unknown): value is Iterable<unknown> {
  return value !== null && value !== undefined && typeof value !== "string" && typeof (value as Iterable<unknown>)[Symbol.iterator] === "function";
}

export const is_iterable_like = isIterableLike;

export function ytdlIsUpdateable(): boolean {
  return true;
}

export const ytdl_is_updateable = ytdlIsUpdateable;

export function getExeVersion(exe: string, args: readonly string[] = ["--version"]): string | false {
  return detectExeVersion(getExeVersionOutput(exe, args));
}

export const get_exe_version = getExeVersion;

export function determineProtocol(info: Record<string, unknown>): string {
  const protocol = info.protocol;
  if (typeof protocol === "string") {
    return protocol;
  }
  const url = typeof info.url === "string" ? info.url : "";
  const ext = typeof info.ext === "string" ? info.ext : determineExt(url);
  if (ext === "m3u8") return "m3u8_native";
  if (ext === "mpd") return "http_dash_segments";
  return /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url)?.[1] ?? "http";
}

export const determine_protocol = determineProtocol;

export function renderTable(headerRow: readonly unknown[], data: readonly (readonly unknown[])[], options: { delim?: boolean | string; extra_gap?: number; hide_empty?: boolean } = {}): string {
  const width = (value: string) => removeTerminalSequences(value).replaceAll("\t", "").length;
  const maxLens = (rows: string[][]) => rows[0]?.map((_, index) => Math.max(...rows.map((row) => width(row[index] ?? "")))) ?? [];
  const sourceRows = [headerRow, ...data].map((row) => row.map((cell) => String(cell ?? "")));
  const visible = headerRow.map((_, index) => !options.hide_empty || Math.max(...data.map((row) => width(String(row[index] ?? ""))), 0) > 0);
  const rows = sourceRows.map((row) => row.filter((_, index) => visible[index]));
  const widths = maxLens(rows);
  const gap = (options.extra_gap ?? 0) + 1;
  const renderRow = (row: string[]) => row.map((cell, index) => {
    const padding = Math.max((widths[index] ?? 0) - width(cell), 0);
    return cell.includes("\t")
      ? `${cell.replaceAll("\t", " ".repeat(padding))}${" ".repeat(gap)}`
      : `${cell}${" ".repeat(padding + gap)}`;
  }).join("").trimEnd();
  const lines = rows.map(renderRow);
  if (options.delim) {
    const delim = options.delim === true ? "-" : String(options.delim);
    const delimiterRow = widths.map((widthValue, index) => {
      const length = widthValue + (index === widths.length - 1 ? 0 : gap);
      return delim.repeat(length);
    }).join("");
    lines.splice(1, 0, delimiterRow);
  }
  return lines.join("\n");
}

export const render_table = renderTable;

export function matchStr(filter: string, data: Record<string, unknown>): boolean {
  return filter.split(/\s*&\s*/).every((part) => matchOneFilter(part.trim(), data));
}

export const match_str = matchStr;

export function matchFilterFunc(filters: readonly string[] | null | undefined): (data: Record<string, unknown>) => string | null {
  return (data) => {
    for (const filter of filters ?? []) {
      if (!matchStr(filter, data)) {
        return filter;
      }
    }
    return null;
  };
}

export const match_filter_func = matchFilterFunc;

export class download_range_func {
  constructor(readonly ranges: Array<[number | null, number | null]>) {}

  *[Symbol.iterator](): IterableIterator<[number | null, number | null]> {
    yield* this.ranges;
  }
}

export function assSubtitlesTimecode(seconds: number): string {
  return formatSeconds(seconds, ":", true).replace(/(\.\d\d)\d$/, "$1");
}

export const ass_subtitles_timecode = assSubtitlesTimecode;
export const parse_dfxp_time_expr = parseDfxpTimeExpr;

export function cliConfigurationArgs(argdict: unknown, keys: readonly string[], defaultValue: readonly string[] = []): string[] {
  return configurationArgs("default", argdict, "default", keys, defaultValue);
}

export const cli_configuration_args = cliConfigurationArgs;

export function longToBytes(value: number | bigint, blocksize = 0): Uint8Array {
  let hex = BigInt(value).toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  let bytes = Uint8Array.from(hex.match(/../g)?.map((part) => Number.parseInt(part, 16)) ?? []);
  if (blocksize && bytes.length % blocksize) {
    bytes = Uint8Array.from([...new Uint8Array(blocksize - (bytes.length % blocksize)), ...bytes]);
  }
  return bytes;
}

export const long_to_bytes = longToBytes;

export function bytesToLong(bytes: Uint8Array | number[]): bigint {
  return BigInt(`0x${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("") || "0"}`);
}

export const bytes_to_long = bytesToLong;

export function pkcs1pad(data: Uint8Array, length: number): Uint8Array {
  if (data.length > length - 11) {
    throw new Error("Message too long for PKCS#1 padding");
  }
  const paddingLength = length - data.length - 3;
  const padding = new Uint8Array(paddingLength).map(() => {
    let byte = 0;
    while (!byte) byte = randomBytes(1)[0] ?? 0;
    return byte;
  });
  return Uint8Array.from([0, 2, ...padding, 0, ...data]);
}

export function ohdaveRsaEncrypt(data: Uint8Array, exponent: number | bigint, modulus: number | bigint): Uint8Array {
  const padded = bytesToLong(pkcs1pad(data, Math.ceil(BigInt(modulus).toString(16).length / 2)));
  return longToBytes(modPow(padded, BigInt(exponent), BigInt(modulus)));
}

export const ohdave_rsa_encrypt = ohdaveRsaEncrypt;

export function decodePackedCodes(code: string): string {
  return code;
}

export const decode_packed_codes = decodePackedCodes;

export function writeXattr(_path: string, _key: string, _value: string): void {
  throw new NotImplementedError("Extended attributes are not implemented in the Bun utility layer");
}

export const write_xattr = writeXattr;

export function randomBirthday(yearField: string, monthField: string, dayField: string): Record<string, string> {
  const date = new Date(Date.UTC(1950 + Math.floor(Math.random() * 50), Math.floor(Math.random() * 12), 1 + Math.floor(Math.random() * 28)));
  return {
    [yearField]: String(date.getUTCFullYear()),
    [monthField]: String(date.getUTCMonth() + 1),
    [dayField]: String(date.getUTCDate()),
  };
}

export const random_birthday = randomBirthday;

export async function findAvailablePort(interfaceName = ""): Promise<number> {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.listen(0, interfaceName, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolvePort(port));
    });
    server.on("error", reject);
  });
}

export const find_available_port = findAvailablePort;

export function toHighLimitPath(path: string): string {
  return path;
}

export const to_high_limit_path = toHighLimitPath;

export function randomUuidv4(): string {
  return nodeRandomUUID();
}

export const random_uuidv4 = randomUuidv4;

export function makeDir(path: string): boolean {
  mkdirSync(path, { recursive: true });
  return true;
}

export const make_dir = makeDir;

export function getExecutablePath(): string {
  return process.argv[1] ?? "ytdlb";
}

export const get_executable_path = getExecutablePath;

export function getUserConfigDirs(packageName: string): string[] {
  return [join(process.env.XDG_CONFIG_HOME ?? join(process.env.HOME ?? "", ".config"), packageName)];
}

export const get_user_config_dirs = getUserConfigDirs;

export function getSystemConfigDirs(packageName: string): string[] {
  return [`/etc/${packageName}`];
}

export const get_system_config_dirs = getSystemConfigDirs;

export function timeSeconds(): number {
  return Date.now() / 1000;
}

export const time_seconds = timeSeconds;

export function jwtEncode(payloadData: Record<string, unknown>, key: string | Uint8Array, options: { alg?: "HS256"; headers?: Record<string, unknown> } = {}): string {
  const header = { alg: options.alg ?? "HS256", typ: "JWT", ...(options.headers ?? {}) };
  const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const signingInput = `${encode(header)}.${encode(payloadData)}`;
  const signature = createHmac("sha256", key).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}

export const jwt_encode = jwtEncode;

export function supportsTerminalSequences(stream: unknown): boolean {
  return Boolean((stream as { isTTY?: boolean } | null)?.isTTY);
}

export const supports_terminal_sequences = supportsTerminalSequences;

export function windowsEnableVtMode(): boolean {
  return process.platform !== "win32";
}

export const windows_enable_vt_mode = windowsEnableVtMode;

export function removeTerminalSequences(value: string): string {
  return value.replaceAll(new RegExp("\\x1B\\[[0-?]*[ -/]*[@-~]", "g"), "");
}

export const remove_terminal_sequences = removeTerminalSequences;

export function numberOfDigits(number: number): number {
  return Math.abs(Math.trunc(number)).toString().length;
}

export const number_of_digits = numberOfDigits;

export function scaleThumbnailsToMaxFormatWidth(formats: Array<Record<string, unknown>>, thumbnails: Array<Record<string, unknown>>, urlWidthRe: RegExp): void {
  const maxWidth = Math.max(...formats.map((format) => Number(format.width ?? 0)), 0);
  for (const thumbnail of thumbnails) {
    if (!thumbnail.width && typeof thumbnail.url === "string") {
      const match = urlWidthRe.exec(thumbnail.url);
      if (match?.[1]) thumbnail.width = Math.min(Number(match[1]), maxWidth || Number(match[1]));
    }
  }
}

export const scale_thumbnails_to_max_format_width = scaleThumbnailsToMaxFormatWidth;

export function parseHttpRange(range: string | null | undefined): { start?: number; end?: number; length?: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(range ?? "");
  if (!match) return null;
  const start = match[1] ? Number(match[1]) : undefined;
  const end = match[2] ? Number(match[2]) : undefined;
  return { start, end, length: start !== undefined && end !== undefined ? end - start + 1 : undefined };
}

export const parse_http_range = parseHttpRange;

export async function readStdin(_what = "data"): Promise<string> {
  return await Bun.stdin.text();
}

export const read_stdin = readStdin;

export function determineFileEncoding(data: Uint8Array | string): [string, number] {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return ["utf-8", 3];
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return ["utf-16le", 2];
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return ["utf-16be", 2];
  const firstLine = new TextDecoder().decode(bytes.subarray(0, 200)).split(/\r?\n/, 1)[0] ?? "";
  return [/coding[:=]\s*([-\w.]+)/.exec(firstLine)?.[1] ?? "utf-8", 0];
}

export const determine_file_encoding = determineFileEncoding;

export class Config {
  configs: Config[] = [];
  own_args: string[] | null = null;
  parsed_args: string[] = [];
  filename: string | null = null;

  constructor(readonly parser: { parse_known_args?: (args?: Iterable<string>) => unknown; parse_args?: (args?: Iterable<string>) => unknown } | null = null, readonly label: string | null = null) {}

  init(args: string[] | null = null, filename: string | null = null): boolean {
    this.own_args = args ?? [];
    this.parsed_args = this.own_args;
    this.filename = filename;
    return true;
  }

  static readFile(filename: string, defaultValue: string[] = []): string[] {
    if (!existsSync(filename)) return defaultValue;
    return shlexSplit(readFileSync(filename, "utf8"));
  }

  static hideLoginInfo(options: readonly string[]): string[] {
    const privateOptions = new Set(["-p", "--password", "-u", "--username", "--video-password", "--ap-password", "--ap-username"]);
    const out = [...options];
    for (let index = 0; index < out.length; index += 1) {
      const option = out[index] ?? "";
      const eq = /^(?<key>-[A-Za-z]|--[A-Za-z-]+)=/.exec(option);
      if (eq?.groups?.key && privateOptions.has(eq.groups.key)) out[index] = `${eq.groups.key}=PRIVATE`;
      if (privateOptions.has(option) && index + 1 < out.length) out[index + 1] = "PRIVATE";
    }
    return out;
  }

  get all_args(): Iterable<string> {
    return this.parsed_args;
  }
}

export function mergeHeaders(...dicts: Array<Record<string, string | undefined>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const dict of dicts) {
    for (const [key, value] of Object.entries(dict)) {
      if (value !== undefined) out[key.toLowerCase().replace(/(^|-)./g, (part) => part.toUpperCase())] = value;
    }
  }
  return out;
}

export const merge_headers = mergeHeaders;

export function cachedMethod<This, Args extends unknown[], Return>(func: (self: This, ...args: Args) => Return): (self: This, ...args: Args) => Return {
  const cache = new WeakMap<object, Map<string, Return>>();
  return (self, ...args) => {
    const key = JSON.stringify(args);
    const objectSelf = self as object;
    let selfCache = cache.get(objectSelf);
    if (!selfCache) {
      selfCache = new Map();
      cache.set(objectSelf, selfCache);
    }
    if (!selfCache.has(key)) selfCache.set(key, func(self, ...args));
    return selfCache.get(key) as Return;
  };
}

export const cached_method = cachedMethod;

export class Namespace {
  constructor(entries: Record<string, unknown> = {}) {
    Object.assign(this, entries);
  }

  [Symbol.iterator](): Iterator<unknown> {
    return Object.values(this)[Symbol.iterator]();
  }

  get items_(): Array<[string, unknown]> {
    return Object.entries(this);
  }
}

export class classproperty {
  constructor(readonly func: (klass: unknown) => unknown) {}
}

export class function_with_repr {
  constructor(readonly func: (...args: unknown[]) => unknown, readonly repr?: string) {}
  call(...args: unknown[]): unknown {
    return this.func(...args);
  }
  toString(): string {
    return this.repr ?? this.func.toString();
  }
}

export function orderedSetFromOptions<T>(options: Iterable<T>, _aliasDict: Record<string, string> = {}): T[] {
  return orderedSet(options);
}

export const orderedSet_from_options = orderedSetFromOptions;

export class FormatSorter {
  constructor(readonly ydl: unknown, readonly fieldPreference: unknown[] = []) {}

  calculate_preference(format: Record<string, unknown>): unknown[] {
    return this.fieldPreference.map((field) => format[String(field)]);
  }
}

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  let current = base % modulus;
  let exp = exponent;
  while (exp > 0n) {
    if (exp & 1n) result = (result * current) % modulus;
    current = (current * current) % modulus;
    exp >>= 1n;
  }
  return result;
}

function matchOneFilter(filter: string, data: Record<string, unknown>): boolean {
  const unary = /^!(?<key>[A-Za-z0-9_]+)$/.exec(filter);
  if (unary?.groups?.key) {
    const value = data[unary.groups.key];
    return value === false || value === null || value === undefined;
  }
  if (/^[A-Za-z0-9_]+$/.test(filter)) {
    const value = data[filter];
    return value !== false && value !== null && value !== undefined;
  }
  const match = /^(?<key>[A-Za-z0-9_]+)\s*(?<op>>=\??|<=\??|>\??|<\??|!\^=|!\*=|!=|!\$=|\^=|\*=|\$=|~=|=)\s*(?<value>.*)$/.exec(filter);
  if (!match?.groups?.key || !match.groups.op) {
    return false;
  }
  const current = data[match.groups.key];
  const optional = match.groups.op.includes("?");
  if ((current === null || current === undefined) && optional) {
    return true;
  }
  if (current === null || current === undefined) {
    return false;
  }
  const op = match.groups.op.replace("?", "");
  const expectedRaw = removeQuotes((match.groups.value ?? "").trim()) ?? "";
  if ([">", ">=", "<", "<="].includes(op)) {
    const left = Number(current);
    const right = parseNumericFilterValue(expectedRaw);
    if (!Number.isFinite(left) || right === null) return false;
    if (op === ">") return left > right;
    if (op === ">=") return left >= right;
    if (op === "<") return left < right;
    return left <= right;
  }
  const currentText = String(current);
  if (op === "=") return currentText === expectedRaw;
  if (op === "!=") return currentText !== expectedRaw;
  if (op === "^=") return currentText.startsWith(expectedRaw);
  if (op === "!^=") return !currentText.startsWith(expectedRaw);
  if (op === "*=") return currentText.includes(expectedRaw);
  if (op === "!*=") return !currentText.includes(expectedRaw);
  if (op === "$=") return currentText.endsWith(expectedRaw);
  if (op === "!$=") return !currentText.endsWith(expectedRaw);
  if (op === "~=") {
    const regexMatch = /^\(\?i\)(.*)$/.exec(expectedRaw);
    const pattern = regexMatch?.[1] ?? expectedRaw;
    return new RegExp(pattern, regexMatch ? "i" : "").test(currentText);
  }
  return false;
}

function parseNumericFilterValue(value: string): number | null {
  return parseCount(value) ?? parseDuration(value) ?? parseFilesize(value) ?? floatOrNone(value);
}

function shlexSplit(input: string): string[] {
  const matches = input.match(/"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|[^\s#]+/g) ?? [];
  return matches.map((item) => removeQuotes(item) ?? item);
}

export function findXpathAttr(node: XmlElement, xpath: string, key: string, value: string | null = null): XmlElement | null {
  const tag = xpath.split("/").pop()?.replace(/^\.?\/?/, "") ?? xpath;
  const candidates = node.children.filter((child) => child.tag === tag || xpath === `.//${child.tag}`);
  return candidates.find((child) => key in child.attrib && (value === null || child.attrib[key] === value)) ?? null;
}

export const find_xpath_attr = findXpathAttr;

export function xpathAttr(node: XmlElement, xpath: string | readonly string[], key: string, name?: string | null, options: { fatal?: boolean; defaultValue?: string | null } = {}): string | null {
  const element = xpathElement(node, xpath, name ?? key, { fatal: options.fatal });
  const value = element?.attrib[key];
  if (value !== undefined) return value;
  if ("defaultValue" in options) return options.defaultValue ?? null;
  if (options.fatal) throw new ExtractorError(`Could not find XML attribute ${name ?? key}`);
  return null;
}

export const xpath_attr = xpathAttr;

export class HTMLBreakOnClosingTagParser { feed(_html: string): void {} }

export class HTMLAttributeParser {
  attrs: Record<string, string | null> = {};
  feed(html: string): void { this.attrs = extractAttributes(html); }
}

export class HTMLListAttrsParser extends HTMLAttributeParser {}

export function parseList(webpage: string): string[] {
  return [...webpage.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((match) => cleanHtml(match[1] ?? "") ?? "");
}

export const parse_list = parseList;

export class LenientJSONDecoder {
  decode(text: string): unknown { return JSON.parse(jsToJson(text)); }
}

export class netrc_from_content {
  readonly hosts: Record<string, { login?: string; password?: string; account?: string }> = {};
  constructor(content: string) {
    const tokens = shlexSplit(content);
    for (let index = 0; index < tokens.length; index += 1) {
      if (tokens[index] !== "machine" || !tokens[index + 1]) continue;
      index += 1;
      const machine = tokens[index] ?? "";
      const entry: { login?: string; password?: string; account?: string } = {};
      while (index + 1 < tokens.length && tokens[index + 1] !== "machine") {
        const key = tokens[++index];
        const tokenValue = tokens[++index];
        if ((key === "login" || key === "password" || key === "account") && tokenValue) entry[key] = tokenValue;
      }
      this.hosts[machine] = entry;
    }
  }
  authenticators(host: string): [string | undefined, string | undefined, string | undefined] | null {
    const entry = this.hosts[host];
    return entry ? [entry.login, entry.account, entry.password] : null;
  }
}

export class Popen {
  static run(args: readonly string[], options: { text?: boolean } = {}): [string | Uint8Array, string | Uint8Array, number | null] {
    const result = spawnSync(args[0] ?? "", args.slice(1), { encoding: options.text ? "utf8" : "buffer" });
    return [result.stdout ?? "", result.stderr ?? "", result.status];
  }
}

export function extractTimezone(dateStr: string, defaultValue: number | null = null): [number | null, string] {
  const match = /(?<tz>Z|(?<sign>[+-])(?<hours>\d{2}):?(?<minutes>\d{2}))$/.exec(dateStr);
  if (!match?.groups?.tz) return [defaultValue, dateStr];
  if (match.groups.tz === "Z") return [0, dateStr.slice(0, -1)];
  const sign = match.groups.sign === "-" ? -1 : 1;
  return [sign * (Number(match.groups.hours) * 3600 + Number(match.groups.minutes) * 60), dateStr.slice(0, -match.groups.tz.length)];
}

export const extract_timezone = extractTimezone;

export function dateFormats(dayFirst = true): string[] {
  const base = ["%Y%m%d", "%Y-%m-%d", "%Y/%m/%d", "%Y-%m-%d %H:%M:%S"];
  return dayFirst ? [...base, "%d/%m/%Y", "%d-%m-%Y"] : [...base, "%m/%d/%Y", "%m-%d-%Y"];
}

export const date_formats = dateFormats;

export class LockingUnsupportedError extends Error { override name = "LockingUnsupportedError"; }

export class locked_file {
  constructor(readonly filename: string, readonly mode = "r") {}
  async read(): Promise<string> { return await Bun.file(this.filename).text(); }
  async write(data: string | Uint8Array): Promise<void> { await Bun.write(this.filename, data); }
  close(): void {}
}

export function setproctitle(_title: string): void {}

export class PlaylistEntries<T = unknown> implements Iterable<[number, T]> {
  constructor(readonly ydl: { params?: Record<string, unknown> }, readonly infoDict: { entries?: Iterable<T> | null }) {
    if (!infoDict.entries) throw new EntryNotInPlaylist("There are no entries");
  }
  static parsePlaylistItems(value: string): Array<number | { start: number | null; end: number | null; step: number | null }> {
    return value.split(",").map((segment) => {
      const match = /^(?<start>[+-]?\d+)?(?<range>[:-](?<end>[+-]?\d+|inf(?:inite)?)?(?::(?<step>[+-]?\d+))?)?$/.exec(segment);
      if (!match?.groups) throw new Error(`${segment} is not a valid specification`);
      if (!match.groups.range) return Number(match.groups.start);
      return { start: intOrNone(match.groups.start ?? null), end: match.groups.end?.startsWith("inf") ? null : intOrNone(match.groups.end ?? null), step: intOrNone(match.groups.step ?? null) };
    });
  }
  *[Symbol.iterator](): Iterator<[number, T]> {
    let index = 1;
    for (const entry of this.infoDict.entries ?? []) yield [index++, entry];
  }
}

export function urlhandleDetectExt(urlHandle: { headers?: { get?: (key: string) => string | null | undefined } }, defaultValue: string | null = null): string | null {
  const getHeader = (key: string) => urlHandle.headers?.get?.(key) ?? null;
  const contentDisposition = getHeader("Content-Disposition");
  const filename = /filename="([^"]+)"/.exec(contentDisposition ?? "")?.[1];
  return determineExt(filename ?? getHeader("x-amz-meta-name") ?? undefined, getHeader("x-amz-meta-file-type") ?? mimetype2ext(getHeader("Content-Type"), defaultValue));
}

export const urlhandle_detect_ext = urlhandleDetectExt;

export class ISO3166Utils {
  private static readonly map: Record<string, string> = { US: "United States", GB: "United Kingdom", JP: "Japan", DE: "Germany", FR: "France", CA: "Canada", AU: "Australia" };
  static short2full(code: string): string | undefined { return ISO3166Utils.map[code.toUpperCase()]; }
}

export class GeoUtils {
  static randomIPv4(block: string): string {
    const parts = block.split(/[./]/).map(Number).filter(Number.isFinite);
    while (parts.length < 4) parts.push(Math.floor(Math.random() * 256));
    return parts.slice(0, 4).join(".");
  }
}

export class ISO639Utils {
  private static readonly langMap: Record<string, string> = {
    aa: "aar",
    ab: "abk",
    ae: "ave",
    af: "afr",
    ak: "aka",
    am: "amh",
    an: "arg",
    ar: "ara",
    as: "asm",
    av: "ava",
    ay: "aym",
    az: "aze",
    ba: "bak",
    be: "bel",
    bg: "bul",
    bh: "bih",
    bi: "bis",
    bm: "bam",
    bn: "ben",
    bo: "bod",
    br: "bre",
    bs: "bos",
    ca: "cat",
    ce: "che",
    ch: "cha",
    co: "cos",
    cr: "cre",
    cs: "ces",
    cu: "chu",
    cv: "chv",
    cy: "cym",
    da: "dan",
    de: "deu",
    dv: "div",
    dz: "dzo",
    ee: "ewe",
    el: "ell",
    en: "eng",
    eo: "epo",
    es: "spa",
    et: "est",
    eu: "eus",
    fa: "fas",
    ff: "ful",
    fi: "fin",
    fj: "fij",
    fo: "fao",
    fr: "fra",
    fy: "fry",
    ga: "gle",
    gd: "gla",
    gl: "glg",
    gn: "grn",
    gu: "guj",
    gv: "glv",
    ha: "hau",
    he: "heb",
    iw: "heb",
    hi: "hin",
    ho: "hmo",
    hr: "hrv",
    ht: "hat",
    hu: "hun",
    hy: "hye",
    hz: "her",
    ia: "ina",
    id: "ind",
    in: "ind",
    ie: "ile",
    ig: "ibo",
    ii: "iii",
    ik: "ipk",
    io: "ido",
    is: "isl",
    it: "ita",
    iu: "iku",
    ja: "jpn",
    jv: "jav",
    ka: "kat",
    kg: "kon",
    ki: "kik",
    kj: "kua",
    kk: "kaz",
    kl: "kal",
    km: "khm",
    kn: "kan",
    ko: "kor",
    kr: "kau",
    ks: "kas",
    ku: "kur",
    kv: "kom",
    kw: "cor",
    ky: "kir",
    la: "lat",
    lb: "ltz",
    lg: "lug",
    li: "lim",
    ln: "lin",
    lo: "lao",
    lt: "lit",
    lu: "lub",
    lv: "lav",
    mg: "mlg",
    mh: "mah",
    mi: "mri",
    mk: "mkd",
    ml: "mal",
    mn: "mon",
    mr: "mar",
    ms: "msa",
    mt: "mlt",
    my: "mya",
    na: "nau",
    nb: "nob",
    nd: "nde",
    ne: "nep",
    ng: "ndo",
    nl: "nld",
    nn: "nno",
    no: "nor",
    nr: "nbl",
    nv: "nav",
    ny: "nya",
    oc: "oci",
    oj: "oji",
    om: "orm",
    or: "ori",
    os: "oss",
    pa: "pan",
    pe: "per",
    pi: "pli",
    pl: "pol",
    ps: "pus",
    pt: "por",
    qu: "que",
    rm: "roh",
    rn: "run",
    ro: "ron",
    ru: "rus",
    rw: "kin",
    sa: "san",
    sc: "srd",
    sd: "snd",
    se: "sme",
    sg: "sag",
    si: "sin",
    sk: "slk",
    sl: "slv",
    sm: "smo",
    sn: "sna",
    so: "som",
    sq: "sqi",
    sr: "srp",
    ss: "ssw",
    st: "sot",
    su: "sun",
    sv: "swe",
    sw: "swa",
    ta: "tam",
    te: "tel",
    tg: "tgk",
    th: "tha",
    ti: "tir",
    tk: "tuk",
    tl: "tgl",
    tn: "tsn",
    to: "ton",
    tr: "tur",
    ts: "tso",
    tt: "tat",
    tw: "twi",
    ty: "tah",
    ug: "uig",
    uk: "ukr",
    ur: "urd",
    uz: "uzb",
    ve: "ven",
    vi: "vie",
    vo: "vol",
    wa: "wln",
    wo: "wol",
    xh: "xho",
    yi: "yid",
    ji: "yid",
    yo: "yor",
    za: "zha",
    zh: "zho",
    zu: "zul",
  };

  static short2long(code: string): string | undefined {
    return ISO639Utils.langMap[code.slice(0, 2)];
  }

  static long2short(code: string): string | undefined {
    for (const [shortName, longName] of Object.entries(ISO639Utils.langMap)) {
      if (longName === code) {
        return shortName;
      }
    }
    return undefined;
  }
}
