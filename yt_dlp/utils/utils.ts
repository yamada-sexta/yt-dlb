// Source: yt_dlp/utils/_utils.py
// Port note: this is a dependency-first subset used by migrated downloader/postprocessor code.

import { spawnSync } from "node:child_process";
import { createHash, createHmac, randomBytes, randomUUID as nodeRandomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { createServer } from "node:net";

import { compat_HTMLParseError, type XmlElement } from "../compat/index.ts";
import { NotImplementedError } from "../errors.ts";
import { findXmlPathAll } from "./xml.ts";
export {
  escapeRfc3986,
  escape_rfc3986,
  HTTPHeaderDict,
  normalizeUrl,
  normalize_url,
  removeDotSegments,
  remove_dot_segments,
} from "./networking.ts";
export { fixXmlAmpersands, xpathElement, xpathText, xpathWithNs } from "./xml.ts";
export { fix_xml_ampersands, xpath_element, xpath_text, xpath_with_ns } from "./xml.ts";

export const NO_DEFAULT = Symbol("NO_DEFAULT");
export const IDENTITY = <T>(value: T): T => value;

export const ENGLISH_MONTH_NAMES = [
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

export const MONTH_NAMES: Record<string, readonly string[]> = {
  en: ENGLISH_MONTH_NAMES,
  fr: [
    "janvier",
    "février",
    "mars",
    "avril",
    "mai",
    "juin",
    "juillet",
    "août",
    "septembre",
    "octobre",
    "novembre",
    "décembre",
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

export const TIMEZONE_NAMES: Record<string, number> = {
  UT: 0,
  UTC: 0,
  GMT: 0,
  Z: 0,
  AST: -4,
  ADT: -3,
  EST: -5,
  EDT: -4,
  CST: -6,
  CDT: -5,
  MST: -7,
  MDT: -6,
  PST: -8,
  PDT: -7,
};

export const DATE_FORMATS = [
  "%d %B %Y",
  "%d %b %Y",
  "%B %d %Y",
  "%B %dst %Y",
  "%B %dnd %Y",
  "%B %drd %Y",
  "%B %dth %Y",
  "%b %d %Y",
  "%b %dst %Y",
  "%b %dnd %Y",
  "%b %drd %Y",
  "%b %dth %Y",
  "%b %dst %Y %I:%M",
  "%b %dnd %Y %I:%M",
  "%b %drd %Y %I:%M",
  "%b %dth %Y %I:%M",
  "%Y %m %d",
  "%Y-%m-%d",
  "%Y.%m.%d.",
  "%Y/%m/%d",
  "%Y/%m/%d %H:%M",
  "%Y/%m/%d %H:%M:%S",
  "%Y%m%d%H%M",
  "%Y%m%d%H%M%S",
  "%Y%m%d",
  "%Y-%m-%d %H:%M",
  "%Y-%m-%d %H:%M:%S",
  "%Y-%m-%d %H:%M:%S.%f",
  "%Y-%m-%d %H:%M:%S:%f",
  "%d.%m.%Y %H:%M",
  "%d.%m.%Y %H.%M",
  "%Y-%m-%dT%H:%M:%SZ",
  "%Y-%m-%dT%H:%M:%S.%fZ",
  "%Y-%m-%dT%H:%M:%S.%f0Z",
  "%Y-%m-%dT%H:%M:%S",
  "%Y-%m-%dT%H:%M:%S.%f",
  "%Y-%m-%dT%H:%M",
  "%b %d %Y at %H:%M",
  "%b %d %Y at %H:%M:%S",
  "%B %d %Y at %H:%M",
  "%B %d %Y at %H:%M:%S",
  "%H:%M %d-%b-%Y",
] as const;

export const DATE_FORMATS_DAY_FIRST = [
  ...DATE_FORMATS,
  "%d-%m-%Y",
  "%d.%m.%Y",
  "%d.%m.%y",
  "%d/%m/%Y",
  "%d/%m/%y",
  "%d/%m/%Y %H:%M:%S",
  "%d-%m-%Y %H:%M",
  "%H:%M %d/%m/%Y",
] as const;

export const DATE_FORMATS_MONTH_FIRST = [
  ...DATE_FORMATS,
  "%m-%d-%Y",
  "%m.%d.%Y",
  "%m/%d/%Y",
  "%m/%d/%y",
  "%m/%d/%Y %H:%M:%S",
] as const;

export const PACKED_CODES_RE = String.raw`}\('(.+)',(\d+),(\d+),'([^']+)'\.split\('\|'\)`;
export const JSON_LD_RE = String.raw`(?is)<script[^>]+type=(["']?)application/ld\+json\1[^>]*>\s*(?P<json_ld>{.+?}|\[.+?\])\s*</script>`;
export const NUMBER_RE = String.raw`\d+(?:\.\d+)?`;

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

  readonly reason: "NO_SPACE" | "VALUE_TOO_LONG" | "NOT_SUPPORTED";

  constructor(readonly code: number | null = null, readonly msg = "Unknown error") {
    super(msg);
    if (code === 28 || code === 122 || msg.includes("No space left") || msg.includes("Disk quota exceeded")) {
      this.reason = "NO_SPACE";
    } else if (code === 7 || msg.includes("Argument list too long")) {
      this.reason = "VALUE_TOO_LONG";
    } else {
      this.reason = "NOT_SUPPORTED";
    }
  }
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

export function determineExt(url: string | null | undefined): string;
export function determineExt(url: string | null | undefined, defaultExt: string): string;
export function determineExt(url: string | null | undefined, defaultExt: null): string | null;
export function determineExt(url: string | null | undefined, defaultExt: string | null): string;
export function determineExt(
  url: string | null | undefined,
  defaultExt: string | null = "unknown_video",
): string | null {
  const fallback = defaultExt === undefined ? "unknown_video" : defaultExt;
  if (!url?.includes(".")) {
    return fallback;
  }
  const [withoutQuery = ""] = url.split("?");
  const [withoutHash = ""] = withoutQuery.split("#");
  const guess = withoutHash.split(".").pop() ?? "";
  if (/^[A-Za-z0-9]+$/.test(guess)) {
    return guess;
  }
  const stripped = guess.replace(/\/+$/, "");
  return (KNOWN_EXTENSIONS as readonly string[]).includes(stripped)
    ? stripped
    : fallback;
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
  const protocolRelative = decodedBase.startsWith("//");
  const joined = new URL(decodedPath, protocolRelative ? `http:${decodedBase}` : decodedBase).toString();
  return protocolRelative ? joined.replace(/^http:/, "") : joined;
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
    if (options.query !== undefined) {
      throw new Error("query_update and query cannot be specified at the same time");
    }
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
        | Uint8Array
        | readonly (string | number | boolean | Uint8Array)[]
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

type IntOrNoneOptions = {
  scale?: number;
  default?: number | null;
  defaultValue?: number | null;
  get_attr?: string;
  invscale?: number;
  base?: number;
};

type FloatOrNoneOptions = {
  scale?: number;
  invscale?: number;
  default?: number | null;
  defaultValue?: number | null;
};

export function intOrNone(options: IntOrNoneOptions): (value: unknown) => number | null;
export function intOrNone(
  value: unknown,
  scale?: number,
  defaultValue?: number | null,
  invscale?: number,
  base?: number,
): number | null;
export function intOrNone(
  valueOrOptions: unknown,
  scale = 1,
  defaultValue: number | null = null,
  invscale = 1,
  base?: number,
): number | null | ((value: unknown) => number | null) {
  if (isIntOrNoneOptions(valueOrOptions)) {
    const options = valueOrOptions;
    return (value) => intOrNone(
      options.get_attr ? getAttr(value, options.get_attr) : value,
      options.scale ?? 1,
      options.defaultValue ?? options.default ?? null,
      options.invscale ?? 1,
      options.base,
    );
  }
  const value = valueOrOptions;
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

export const US_RATINGS: Record<string, number> = {
  G: 0,
  PG: 10,
  "PG-13": 13,
  R: 16,
  NC: 18,
};

export const TV_PARENTAL_GUIDELINES: Record<string, number> = {
  "TV-Y": 0,
  "TV-Y7": 7,
  "TV-G": 0,
  "TV-PG": 0,
  "TV-14": 14,
  "TV-MA": 17,
};

export function parseAgeLimit(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value >= 0 && value <= 21 ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const numericAge = /^(\d{1,2})\+?$/.exec(value.trim())?.[1];
  if (numericAge) {
    return Number(numericAge);
  }
  const normalized = value.toUpperCase().replace("_", "-");
  if (normalized in US_RATINGS) {
    return US_RATINGS[normalized] ?? null;
  }
  const tvMatch = /^TV-?(Y7|Y|G|PG|14|MA)$/.exec(normalized);
  return tvMatch ? (TV_PARENTAL_GUIDELINES[`TV-${tvMatch[1]}`] ?? null) : null;
}

export const parse_age_limit = parseAgeLimit;

export function floatOrNone(options: FloatOrNoneOptions): (value: unknown) => number | null;
export function floatOrNone(
  value: unknown,
  scale?: number,
  defaultValue?: number | null,
  invscale?: number,
): number | null;
export function floatOrNone(
  valueOrOptions: unknown,
  scale = 1,
  defaultValue: number | null = null,
  invscale = 1,
): number | null | ((value: unknown) => number | null) {
  if (isFloatOrNoneOptions(valueOrOptions)) {
    const options = valueOrOptions;
    return (value) => floatOrNone(
      value,
      options.scale ?? 1,
      options.defaultValue ?? options.default ?? null,
      options.invscale ?? 1,
    );
  }
  const value = valueOrOptions;
  if (value === null || value === undefined || value === "") {
    return defaultValue;
  }
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? (parsed * invscale) / scale : defaultValue;
}

export const float_or_none = floatOrNone;

function isIntOrNoneOptions(value: unknown): value is IntOrNoneOptions {
  return isPlainObject(value)
    && ("scale" in value || "default" in value || "defaultValue" in value || "get_attr" in value || "invscale" in value || "base" in value);
}

function isFloatOrNoneOptions(value: unknown): value is FloatOrNoneOptions {
  return isPlainObject(value)
    && ("scale" in value || "default" in value || "defaultValue" in value || "invscale" in value);
}

function getAttr(value: unknown, attr: string): unknown {
  return value && typeof value === "object" ? (value as Record<string, unknown>)[attr] : undefined;
}

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

export function tryCall(
  ...funcsAndOptions: Array<
    | ((...args: unknown[]) => unknown)
    | null
    | undefined
    | {
        expected_type?: (value: unknown) => boolean;
        args?: unknown[];
        kwargs?: Record<string, unknown>;
      }
  >
): unknown | null {
  const maybeOptions = funcsAndOptions.at(-1);
  const options =
    typeof maybeOptions === "object" &&
    maybeOptions !== null &&
    !("call" in maybeOptions)
      ? (funcsAndOptions.pop() as {
          expected_type?: (value: unknown) => boolean;
          args?: unknown[];
          kwargs?: Record<string, unknown>;
        })
      : {};
  for (const func of funcsAndOptions as Array<((...args: unknown[]) => unknown) | null | undefined>) {
    if (typeof func !== "function") {
      continue;
    }
    try {
      const value = func(...(options.args ?? []));
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
  for (const dict of dicts) {
    for (const [key, value] of Object.entries(dict ?? {})) {
      if (
        value !== null &&
        value !== undefined &&
        (!(key in out) || (typeof value === "string" && out[key] === ""))
      ) {
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

export function variadic<T>(value: T | Iterable<T>): T[] {
  if (
    value !== null &&
    value !== undefined &&
    typeof value !== "string" &&
    !(value instanceof Uint8Array) &&
    !(value instanceof Map) &&
    typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function"
  ) {
    return [...(value as Iterable<T>)];
  }
  return [value as T];
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
  return value.replaceAll(/&([^&;]+;)/g, (_match, entity: string) =>
    htmlEntityTransform(entity),
  );
}

export const unescapeHTML_ = unescapeHTML;

const HTML_ENTITY_CODEPOINTS: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: "\u00a0",
  quot: '"',
};

const HTML5_ENTITY_TEXT: Record<string, string> = {
  ...HTML_ENTITY_CODEPOINTS,
  Eacute: "É",
  eacute: "é",
  lambda: "λ",
  period: ".",
  pound: "£",
};

function htmlEntityTransform(entityWithSemicolon: string): string {
  const entity = entityWithSemicolon.slice(0, -1);
  const named = HTML_ENTITY_CODEPOINTS[entity] ?? HTML5_ENTITY_TEXT[entity];
  if (named !== undefined) {
    return named;
  }
  const numericMatch = /^#(?<number>x[0-9a-fA-F]+|[0-9]+)/.exec(entity);
  const numberText = numericMatch?.groups?.number;
  if (numberText) {
    const codepoint = numberText.startsWith("x")
      ? Number.parseInt(`0${numberText}`, 16)
      : Number.parseInt(numberText, 10);
    if (Number.isFinite(codepoint)) {
      try {
        return String.fromCodePoint(codepoint);
      } catch {}
    }
  }
  return `&${entity};`;
}

export const _htmlentity_transform = htmlEntityTransform;

export function cleanHtml(html: string | null | undefined): string | null {
  if (html === null || html === undefined) {
    return null;
  }
  const normalizedHtml = html.replaceAll(/\s+/g, " ");
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
    .transform(normalizedHtml);
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
  return getElementsTextAndHtmlByAttribute("class", `(?:^|.*\\s)${RegExp.escape(className)}(?:\\s.*|$)`, html, { escape_value: false }).map(([text]) => text);
}

export const get_elements_by_class = getElementsByClass;

export function getElementsHtmlByClass(className: string, html: string): string[] {
  return getElementsTextAndHtmlByAttribute("class", `(?:^|.*\\s)${RegExp.escape(className)}(?:\\s.*|$)`, html, { escape_value: false }).map(([, htmlText]) => htmlText);
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

export function getElementTextAndHtmlByTag(tag: string, html: string): [string, string] {
  const openPattern = new RegExp(String.raw`<(?<tag>${tag})\b[^>]*(?<selfClosing>\/)?>`, "i");
  const openMatch = openPattern.exec(html);
  const tagName = openMatch?.groups?.tag;
  if (!openMatch || !tagName) {
    throw new compat_HTMLParseError(`opening ${tag} tag not found`);
  }
  if (openMatch.groups?.selfClosing) {
    return ["", openMatch[0]];
  }
  const wholeStart = openMatch.index ?? 0;
  const contentStart = wholeStart + openMatch[0].length;
  const tagPattern = new RegExp(String.raw`<\/?${RegExp.escape(tagName)}\b[^>]*(?:\/)?>`, "gi");
  tagPattern.lastIndex = contentStart;
  let depth = 1;
  for (let match = tagPattern.exec(html); match; match = tagPattern.exec(html)) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) {
        const content = html.slice(contentStart, match.index);
        const whole = html.slice(wholeStart, match.index + match[0].length);
        return [cleanHtml(content) ?? "", whole];
      }
    } else if (!match[0].endsWith("/>")) {
      depth += 1;
    }
  }
  throw new compat_HTMLParseError(`closing ${tagName} tag not found`);
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
  delimiterOrOptions: string | { delimiter?: string; timezone?: number | typeof NO_DEFAULT | null } = "T",
  timezoneOption?: number | typeof NO_DEFAULT | null,
): number | null {
  if (!dateStr) {
    return null;
  }
  const delimiter = typeof delimiterOrOptions === "string" ? delimiterOrOptions : delimiterOrOptions.delimiter ?? "T";
  const explicitTimezone = typeof delimiterOrOptions === "object" ? delimiterOrOptions.timezone : timezoneOption;
  let value = dateStr.replace(/\.[0-9]+/, "");
  const [extractedTimezone, withoutTimezone] = extractTimezone(value, explicitTimezone === undefined ? 0 : explicitTimezone === NO_DEFAULT ? null : explicitTimezone);
  if (extractedTimezone === null) {
    return null;
  }
  value = withoutTimezone;
  const escapedDelimiter = RegExp.escape(delimiter);
  const match = new RegExp(`^(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})${escapedDelimiter}(?<hour>\\d{2}):(?<minute>\\d{2}):(?<second>\\d{2})$`).exec(value);
  if (!match?.groups) {
    return null;
  }
  return Math.trunc(utcTimestamp(
    Number(match.groups.year),
    Number(match.groups.month) - 1,
    Number(match.groups.day),
    Number(match.groups.hour),
    Number(match.groups.minute),
    Number(match.groups.second),
  ) / 1000) - extractedTimezone;
}

export const parse_iso8601 = parseIso8601;

const ENGLISH_MONTH_LOOKUP = new Map<string, number>(
  ENGLISH_MONTH_NAMES.flatMap((month, index) => [
    [month.toLowerCase(), index + 1],
    [month.slice(0, 3).toLowerCase(), index + 1],
  ]),
);

interface UnifiedDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  timezone: number | null;
  pm: boolean;
}

function parseUnifiedDateParts(dateStr: string, dayFirst: boolean, defaultTimezone: number | null = null): UnifiedDateParts | null {
  let value = dateStr
    .replaceAll(/[,|]/g, " ")
    .replaceAll(/\b(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?\b/gi, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
  const hadAmPm = /(?:AM|PM)\b/i.test(value);
  const pm = /PM\b/i.test(value);
  value = value.replace(/\s*(?:AM|PM)\b/gi, "").replaceAll(/\s+/g, " ").trim();

  let timezone = defaultTimezone;
  const numericTimezone = /\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?\s*(?<tz>Z|(?<sign>[+-])(?<hours>\d{2}):?(?<minutes>\d{2}))$/.exec(value);
  if (numericTimezone?.groups?.tz) {
    const tz = numericTimezone.groups.tz;
    value = value.slice(0, -tz.length).trim();
    timezone = tz === "Z"
      ? 0
      : (numericTimezone.groups.sign === "-" ? -1 : 1) *
        (Number(numericTimezone.groups.hours) * 3600 + Number(numericTimezone.groups.minutes) * 60);
  } else {
    const namedTimezone = /\s+(?<tz>[A-Z]{1,4})$/.exec(value);
    const zone = namedTimezone?.groups?.tz;
    if (zone && hadAmPm) {
      value = value.slice(0, -zone.length).trim();
    } else if (zone && TIMEZONE_NAMES[zone] !== undefined) {
      value = value.slice(0, -zone.length).trim();
      timezone = TIMEZONE_NAMES[zone] * 3600;
    } else if (/\d{1,2}:\d{1,2}(?:\.\d+)?\s*[A-Z]+$/.test(value)) {
      value = value.replace(/\s+[A-Z]+$/, "").trim();
    }
  }
  value = value.replace(/(\.\d{6})\d+(?=$|[+-])/, "$1").replace(/Q$/, "");

  const timeSuffix = String.raw`(?:(?:T|\s+)(?:at\s+)?(?<hour>\d{1,2})[:.](?<minute>\d{2})(?::(?<second>\d{2})(?:\.\d+)?)?)?`;
  const patterns: RegExp[] = [
    new RegExp(`^(?<year>\\d{4})[-/.](?<month>\\d{1,2})[-/.](?<day>\\d{1,2})${timeSuffix}$`),
    new RegExp(`^(?<year>\\d{4})\\s+(?<month>\\d{1,2})\\s+(?<day>\\d{1,2})${timeSuffix}$`),
    new RegExp(`^(?<day>\\d{1,2})[-.](?<month>\\d{1,2})[-.](?<year>\\d{2,4})${timeSuffix}$`),
    new RegExp(dayFirst
      ? `^(?<day>\\d{1,2})/(?<month>\\d{1,2})/(?<year>\\d{2,4})${timeSuffix}$`
      : `^(?<month>\\d{1,2})/(?<day>\\d{1,2})/(?<year>\\d{2,4})${timeSuffix}$`),
    new RegExp(`^(?<monthName>[A-Za-z]+)\\s+(?<day>\\d{1,2})(?:st|nd|rd|th)?\\s+(?<year>\\d{4})${timeSuffix}$`, "i"),
    new RegExp(`^(?<day>\\d{1,2})\\s+(?<monthName>[A-Za-z]+)\\s+(?<year>\\d{4})${timeSuffix}$`, "i"),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(value);
    if (!match?.groups) {
      continue;
    }
    const month = match.groups.month ? Number(match.groups.month) : ENGLISH_MONTH_LOOKUP.get(match.groups.monthName?.toLowerCase() ?? "");
    let year = Number(match.groups.year);
    if (year < 100) {
      year += year >= 69 ? 1900 : 2000;
    }
    if (!month) {
      continue;
    }
    return {
      year,
      month,
      day: Number(match.groups.day),
      hour: Number(match.groups.hour ?? 0),
      minute: Number(match.groups.minute ?? 0),
      second: Number(match.groups.second ?? 0),
      timezone,
      pm,
    };
  }
  return null;
}

export function unifiedTimestamp(
  dateStr: unknown,
  dayFirst = true,
  tzOffset = 0,
): number | null {
  if (typeof dateStr !== "string") {
    return null;
  }
  const parsed = parseUnifiedDateParts(dateStr, dayFirst, tzOffset ? tzOffset * 3600 : 0);
  if (!parsed) {
    return null;
  }
  const timestamp = utcTimestamp(parsed.year, parsed.month - 1, parsed.day, parsed.hour + (parsed.pm ? 12 : 0), parsed.minute, parsed.second);
  return Math.trunc(timestamp / 1000) - (parsed.timezone ?? 0);
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
  const autoPrecision = precision === "auto";
  const resolvedPrecision = autoPrecision ? "microsecond" : precision;
  const now = roundDate(new Date(), resolvedPrecision);
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
      const start = datetimeFromStr(relative.groups.start, resolvedPrecision);
      if (!start) {
        return null;
      }
      const sign = relative.groups.sign === "-" ? -1 : 1;
      const amount = Number(relative.groups.time) * sign;
      const unit = relative.groups.unit;
      date = addDateUnit(start, unit, amount);
      if (autoPrecision) {
        let roundUnit: "microsecond" | "second" | "minute" | "hour" | "day";
        if (unit === "week" || unit === "month" || unit === "year") {
          roundUnit = "day";
        } else {
          roundUnit = unit as "microsecond" | "second" | "minute" | "hour" | "day";
        }
        return roundDate(date, roundUnit);
      }
    } else {
      const compact = /^(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})$/.exec(
        dateStr,
      );
      if (compact?.groups) {
        date = utcDate(
          Number(compact.groups.year),
          Number(compact.groups.month) - 1,
          Number(compact.groups.day),
        );
      } else {
        const timestamp = Date.parse(dateStr);
        if (!Number.isFinite(timestamp)) {
          return null;
        }
        date = new Date(timestamp);
      }
    }
  }
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
        ? Math.abs(timestamp) > 253_402_300_799
          ? null
          : new Date(timestamp * 1000)
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
  dayFirst = true,
): string | null {
  if (!dateStr) {
    return null;
  }
  const parsed = parseUnifiedDateParts(dateStr, dayFirst);
  return parsed
    ? `${String(parsed.year).padStart(4, "0")}${String(parsed.month).padStart(2, "0")}${String(parsed.day).padStart(2, "0")}`
    : null;
}

export const unified_strdate = unifiedStrdate;

export function qualities(
  qualityIds: readonly string[],
): (qualityId: string | null | undefined) => number {
  const map = new Map(qualityIds.map((qualityId, index) => [qualityId, index]));
  return (qualityId) => (qualityId ? (map.get(qualityId) ?? -1) : -1);
}

export const POSTPROCESS_WHEN = [
  "pre_process",
  "after_filter",
  "video",
  "before_dl",
  "post_process",
  "after_move",
  "after_video",
  "playlist",
] as const;

export const DEFAULT_OUTTMPL = {
  default: "%(title)s [%(id)s].%(ext)s",
  chapter: "%(title)s - %(section_number)03d %(section_title)s [%(id)s].%(ext)s",
} as const;

export const OUTTMPL_TYPES = {
  chapter: null,
  subtitle: null,
  thumbnail: null,
  description: "description",
  annotation: "annotations.xml",
  infojson: "info.json",
  link: null,
  pl_video: null,
  pl_thumbnail: null,
  pl_description: "description",
  pl_infojson: "info.json",
} as const;

export const STR_FORMAT_RE_TMPL = String.raw`(?x)
    (?<!%)(?P<prefix>(?:%%)*)
    %
    (?P<has_key>\((?P<key>{0})\))?
    (?P<format>
        (?P<conversion>[#0\-+ ]+)?
        (?P<min_width>\d+)?
        (?P<precision>\.\d+)?
        (?P<len_mod>[hlL])?
        {1}
    )
`;

export const STR_FORMAT_TYPES = "diouxXeEfFgGcrsa";

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
  if (typeof value !== "string") {
    return null;
  }
  const input = value.trim();
  if (!input) {
    return null;
  }
  const colonMatch = /^(?<body>\d+(?::\d+){0,3})(?<fraction>[.:]\d+)?Z?$/.exec(input);
  if (colonMatch?.groups?.body) {
    const parts = colonMatch.groups.body.split(":");
    let days = 0;
    let hours = 0;
    let minutes = 0;
    let seconds = 0;
    let fraction = colonMatch.groups.fraction ?? "";
    if (parts.length === 1) {
      seconds = Number(parts[0]);
    } else if (parts.length === 2) {
      if (!fraction && (parts[1]?.length ?? 0) > 2) {
        seconds = Number(parts[0]);
        fraction = `.${parts[1]}`;
      } else {
        minutes = Number(parts[0]);
        seconds = Number(parts[1]);
      }
    } else if (parts.length === 3) {
      hours = Number(parts[0]);
      minutes = Number(parts[1]);
      seconds = Number(parts[2]);
    } else if ((parts[3]?.length ?? 0) > 2) {
      hours = Number(parts[0]);
      minutes = Number(parts[1]);
      seconds = Number(parts[2]);
      fraction = `.${parts[3]}`;
    } else {
      days = Number(parts[0]);
      hours = Number(parts[1]);
      minutes = Number(parts[2]);
      seconds = Number(parts[3]);
    }
    return days * 86400 + hours * 3600 + minutes * 60 + seconds + Number((fraction || ".0").replace(":", "."));
  }
  const isoMatch = /^(?:P?(?:\d+\s*y(?:ears?)?,?\s*)?(?:\d+\s*m(?:onths?)?,?\s*)?(?:\d+\s*w(?:eeks?)?,?\s*)?(?:(?<days>\d+)\s*d(?:ays?)?,?\s*)?T?)?(?:(?<hours>\d+)\s*h(?:(?:ou)?rs?)?,?\s*)?(?:(?<minutes>\d+)\s*m(?:in(?:ute)?s?)?,?\s*)?(?:(?<seconds>\d+)(?<fraction>\.\d+)?\s*s(?:ec(?:ond)?s?)?\s*)?Z?$/i.exec(input);
  if (isoMatch?.[0] && Object.values(isoMatch.groups ?? {}).some((part) => part !== undefined)) {
    return (
      Number(isoMatch.groups?.days ?? 0) * 86400 +
      Number(isoMatch.groups?.hours ?? 0) * 3600 +
      Number(isoMatch.groups?.minutes ?? 0) * 60 +
      Number(isoMatch.groups?.seconds ?? 0) +
      Number(isoMatch.groups?.fraction ?? 0)
    );
  }
  const unitMatch =
    /^(?:(?<hours>\d+(?:\.\d+)?)\s*(?:hours?)|(?<minutes>\d+(?:\.\d+)?)\s*(?:mins?\.?|minutes?)\s*)Z?$/i.exec(input);
  if (unitMatch?.[0]) {
    return (
      Number(unitMatch.groups?.hours ?? 0) * 3600 +
      Number(unitMatch.groups?.minutes ?? 0) * 60
    );
  }
  return null;
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
  TiB: 1024 ** 4,
  TB: 1000 ** 4,
  tB: 1024 ** 4,
  Tb: 1000 ** 4,
  tb: 1000 ** 4,
  terabytes: 1000 ** 4,
  tebibytes: 1024 ** 4,
  PiB: 1024 ** 5,
  PB: 1000 ** 5,
  pB: 1024 ** 5,
  Pb: 1000 ** 5,
  pb: 1000 ** 5,
  petabytes: 1000 ** 5,
  pebibytes: 1024 ** 5,
  EiB: 1024 ** 6,
  EB: 1000 ** 6,
  eB: 1024 ** 6,
  Eb: 1000 ** 6,
  eb: 1000 ** 6,
  exabytes: 1000 ** 6,
  exbibytes: 1024 ** 6,
  ZiB: 1024 ** 7,
  ZB: 1000 ** 7,
  zB: 1024 ** 7,
  Zb: 1000 ** 7,
  zb: 1000 ** 7,
  zettabytes: 1000 ** 7,
  zebibytes: 1024 ** 7,
  YiB: 1024 ** 8,
  YB: 1000 ** 8,
  yB: 1024 ** 8,
  Yb: 1000 ** 8,
  yb: 1000 ** 8,
  yottabytes: 1000 ** 8,
  yobibytes: 1024 ** 8,
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
  if (!(left > 3) || right < 0) {
    throw new Error("truncateString requires left > 3 and right >= 0");
  }
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
  keys: readonly (string | readonly string[])[] = [""],
  defaultValue: readonly string[] = [],
  useCompat = true,
): string[] {
  if (Array.isArray(argdict)) {
    return useCompat ? argdict.map(String) : [...defaultValue];
  }
  if (!argdict || typeof argdict !== "object") {
    return [...defaultValue];
  }
  const args = argdict as Record<string, string[] | string | undefined>;
  const rootKey =
    mainKey.toLowerCase() === exe.toLowerCase()
      ? exe.toLowerCase()
      : `${mainKey.toLowerCase()}+${exe.toLowerCase()}`;
  const candidateKeys: Array<string | readonly string[]> = keys.map((key) =>
    typeof key === "string" ? `${rootKey}${key}` : key.map((item) => `${rootKey}${item}`),
  );
  if (candidateKeys.some((key) => key === rootKey)) {
    if (mainKey.toLowerCase() !== exe.toLowerCase()) {
      candidateKeys.push([mainKey.toLowerCase(), exe.toLowerCase()]);
    }
    candidateKeys.push("default");
  } else {
    useCompat = false;
  }
  return cliConfigurationArgs(args, candidateKeys, defaultValue, useCompat);
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

export const _WINDOWS_QUOTE_TRANS: Record<string, string> = { '"': String.raw`\"` };
export const _CMD_QUOTE_TRANS: Record<string, string> = {
  '"': '""',
  "\n": "%=%",
  "\r": "%=%",
  "%": "%%cd:~,%",
};

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
  const match = /version\s+(?<version>[-0-9._a-zA-Z]+)/i.exec(output ?? "");
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

export function _change_extension(
  prepend: boolean,
  filename: string,
  extension: string,
  expectedRealExt?: string | null,
): string {
  const current = extname(filename);
  let name = current ? filename.slice(0, -current.length) : filename;
  if (!expectedRealExt || current.slice(1) === expectedRealExt) {
    if (prepend && current) {
      _UnsafeExtensionError.sanitizeExtension(extension, { prepend: true });
      return `${name}.${extension}${current}`;
    }
  } else {
    name = filename;
  }
  return `${name}.${_UnsafeExtensionError.sanitizeExtension(extension)}`;
}

export function replaceExtension(
  filename: string,
  extension: string,
  expectedRealExt?: string | null,
): string {
  return _change_extension(false, filename, extension, expectedRealExt);
}

export const replace_extension = replaceExtension;

export function prependExtension(
  filename: string,
  extension: string,
  expectedRealExt?: string | null,
): string {
  return _change_extension(true, filename, extension, expectedRealExt);
}

export const prepend_extension = prependExtension;

export function subtitlesFilename(
  filename: string,
  subLang: string,
  subFormat: string,
  expectedRealExt?: string | null,
): string {
  return replaceExtension(filename, `${subLang}.${subFormat}`, expectedRealExt);
}

export const subtitles_filename = subtitlesFilename;

export function orderedSet<T>(items: Iterable<T>, options: { lazy: true }): Iterable<T>;
export function orderedSet<T>(items: Iterable<T>, options?: { lazy?: false }): T[];
export function orderedSet<T>(items: Iterable<T>, options: { lazy?: boolean } = {}): T[] | Iterable<T> {
  function* iter(): Iterable<T> {
    const seen: T[] = [];
    for (const item of items) {
      if (!seen.some((value) => pythonEquals(value, item))) {
        seen.push(item);
        yield item;
      }
    }
  }
  return options.lazy ? iter() : [...iter()];
}

export const orderedSet_ = orderedSet;

function pythonEquals(left: unknown, right: unknown): boolean {
  if (Object.is(left, right) || left === right) {
    return true;
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length
      && left.every((value, index) => pythonEquals(value, right[index]));
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const leftEntries = Object.entries(left);
    const rightEntries = Object.entries(right);
    return leftEntries.length === rightEntries.length
      && leftEntries.every(([key, value]) => key in right && pythonEquals(value, right[key]));
  }
  return false;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype);
}

function sliceArray<T>(array: T[], start: number | undefined, end: number | undefined, step: number): T[] {
  const length = array.length;
  const out: T[] = [];
  if (step > 0) {
    const from = start === undefined ? 0 : Math.min(Math.max(start < 0 ? length + start : start, 0), length);
    const to = end === undefined ? length : Math.min(Math.max(end < 0 ? length + end : end, 0), length);
    for (let index = from; index < to; index += step) {
      out.push(array[index] as T);
    }
    return out;
  }
  const from = start === undefined ? length - 1 : Math.min(start < 0 ? length + start : start, length - 1);
  const to = end === undefined ? -1 : Math.max(end < 0 ? length + end : end, -1);
  for (let index = from; index > to; index += step) {
    if (index >= 0 && index < length) {
      out.push(array[index] as T);
    }
  }
  return out;
}

export class LazyList<T> implements Iterable<T> {
  readonly _cache: T[];
  private done = false;
  private iterator: Iterator<T>;

  constructor(iterable: Iterable<T>, readonly reverse = false, cache?: T[]) {
    this.iterator = iterable[Symbol.iterator]();
    this._cache = cache ?? [];
  }

  get length(): number {
    this.exhaust();
    return this._cache.length;
  }

  at(index: number): T | undefined {
    const effectiveIndex = this.reverse ? LazyList.reverseIndex(index) : index;
    if (effectiveIndex !== index) {
      return this.get(effectiveIndex);
    }
    return this.get(index);
  }

  private get(index: number): T | undefined {
    if (index < 0) {
      this.exhaust();
      return this._cache.at(index);
    }
    while (!this.done && this._cache.length <= index) {
      this.nextItem();
    }
    return this._cache[index];
  }

  slice(start?: number, end?: number, step = 1): T[] {
    if (!Number.isInteger(step) || step === 0) {
      throw new TypeError("slice step must be a non-zero integer");
    }
    let effectiveStart = start;
    let effectiveEnd = end;
    let effectiveStep = step;
    if (this.reverse) {
      effectiveStart = start === undefined ? undefined : LazyList.reverseIndex(start);
      effectiveEnd = end === undefined ? undefined : LazyList.reverseIndex(end);
      effectiveStep = -step;
    }
    if ((effectiveStart ?? 0) < 0 || (effectiveEnd ?? 0) < 0 || (effectiveStart === undefined && effectiveStep < 0) || (effectiveEnd === undefined && effectiveStep > 0)) {
      this.exhaust();
    } else {
      const limit = Math.max(effectiveStart ?? 0, effectiveEnd ?? 0);
      while (!this.done && this._cache.length <= limit) {
        this.nextItem();
      }
    }
    return sliceArray(this._cache, effectiveStart, effectiveEnd, effectiveStep);
  }

  exhaust(): T[] {
    while (!this.done) {
      this.nextItem();
    }
    return this.reverse ? [...this._cache].reverse() : [...this._cache];
  }

  reversed(): LazyList<T> {
    return new LazyList({ [Symbol.iterator]: () => this.iterator }, !this.reverse, this._cache);
  }

  [Symbol.iterator](): Iterator<T> {
    if (this.reverse) {
      return this.exhaust()[Symbol.iterator]();
    }
    let index = 0;
    return {
      next: (): IteratorResult<T> => {
        const value = this.at(index);
        if (value === undefined && index >= this._cache.length && this.done) {
          return { done: true, value: undefined };
        }
        index += 1;
        return { done: false, value: value as T };
      },
    };
  }

  private nextItem(): void {
    const next = this.iterator.next();
    if (next.done) {
      this.done = true;
    } else {
      this._cache.push(next.value);
    }
  }

  private static reverseIndex(index: number): number {
    return ~index;
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
    "3gpp": "3gp",
    "aacp": "aac",
    "avif": "avif",
    "bmp": "bmp",
    "dash+xml": "mpd",
    "f4m+xml": "f4m",
    "filmstrip+json": "fs",
    "flac": "flac",
    "gif": "gif",
    "gzip": "gz",
    "hds+xml": "f4m",
    "jpeg": "jpg",
    "json": "json",
    "midi": "mid",
    "mp2t": "ts",
    "mp4": "mp4",
    "mpeg": "mpeg",
    "mpegurl": "m3u8",
    "ogg": "ogg",
    "png": "png",
    "quicktime": "mov",
    "smptett+xml": "tt",
    "svg+xml": "svg",
    "ttaf+xml": "dfxp",
    "tiff": "tif",
    "ttml+xml": "ttml",
    "vnd.apple.mpegurl": "m3u8",
    "vnd.dlna.mpeg-tts": "mpeg",
    "vnd.ms-sstr+xml": "ism",
    "vnd.wap.wbmp": "wbmp",
    "vp9": "vp9",
    "wav": "wav",
    "wave": "wav",
    "webm": "webm",
    "webp": "webp",
    "x-aac": "aac",
    "x-flac": "flac",
    "x-flv": "flv",
    "x-icon": "ico",
    "x-jng": "jng",
    "x-m4a": "m4a",
    "x-m4v": "m4v",
    "x-matroska": "mkv",
    "x-mng": "mng",
    "x-mp4-fragmented": "mp4",
    "x-mpegurl": "m3u8",
    "x-ms-asf": "asf",
    "x-ms-bmp": "bmp",
    "x-ms-sami": "sami",
    "x-ms-wmv": "wmv",
    "x-msvideo": "avi",
    "x-realaudio": "ra",
    "x-subrip": "srt",
    "x-srt": "srt",
    "x-wav": "wav",
    "xml": "xml",
    "zip": "zip",
    "video/ogg": "ogv",
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

export function _request_dump_filename(
  url: string,
  videoId: string | null | undefined,
  data: Uint8Array | string | null = null,
  trimLength: number | null = null,
): string {
  const dataHash = data === null
    ? null
    : createHash("md5").update(typeof data === "string" ? data : Buffer.from(data)).digest("hex");
  let baseName = joinNonempty(videoId, dataHash, url, { delim: "_" });
  const maxLength = trimLength ?? 240;
  if (baseName.length > maxLength) {
    const hash = `___${createHash("md5").update(baseName).digest("hex")}`;
    baseName = `${baseName.slice(0, maxLength - hash.length)}${hash}`;
  }
  return sanitizeFilename(`${baseName}.dump`, { restricted: true });
}

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
  const appliedStyles: TtmlStyle[] = [];
  for (const paragraph of paragraphs) {
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
      appliedStyles,
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
  appliedStyles: TtmlStyle[] = [],
): string {
  const out: string[] = [];
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
  if (
    ignore === NO_DEFAULT
      ? !value
      : variadic(ignore).includes(value)
  ) {
    return defaultValue;
  }
  return template.replace("%s", String(func(value as T)));
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

export const BOMS: Array<readonly [Uint8Array, string]> = [
  [Uint8Array.from([0xef, 0xbb, 0xbf]), "utf-8"],
  [Uint8Array.from([0x00, 0x00, 0xfe, 0xff]), "utf-32-be"],
  [Uint8Array.from([0xff, 0xfe, 0x00, 0x00]), "utf-32-le"],
  [Uint8Array.from([0xff, 0xfe]), "utf-16-le"],
  [Uint8Array.from([0xfe, 0xff]), "utf-16-be"],
];

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
  if (num === null || num === undefined || num < 0) {
    return null;
  }
  const factor = options.factor ?? 1000;
  const suffixes = ["", "k", "M", "G", "T", "P", "E", "Z", "Y"];
  const exponent = num === 0 ? 0 : Math.min(Math.trunc(Math.log(num) / Math.log(factor)), suffixes.length - 1);
  let suffix = suffixes[exponent] ?? "";
  if (factor === 1024) {
    suffix = suffix === "k" ? "Ki" : suffix === "" ? "" : `${suffix}i`;
  }
  const value = num / factor ** exponent;
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

export function _base_n_table(n = 62, table?: string): string {
  const alphabet = table ?? "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return alphabet.slice(0, n);
}

export function encodeBaseN(num: number, n = 62, table?: string): string {
  const alphabet = _base_n_table(n, table);
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
  const alphabet = _base_n_table(n, table);
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

export const DOT_URL_LINK_TEMPLATE = `[InternetShortcut]
URL=%(url)s
`;

export const DOT_WEBLOC_LINK_TEMPLATE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>URL</key>
\t<string>%(url)s</string>
</dict>
</plist>
`;

export const DOT_DESKTOP_LINK_TEMPLATE = `[Desktop Entry]
Encoding=UTF-8
Name=%(filename)s
Type=Link
URL=%(url)s
Icon=text-html
`;

export const LINK_TEMPLATES = {
  url: DOT_URL_LINK_TEMPLATE,
  desktop: DOT_DESKTOP_LINK_TEMPLATE,
  webloc: DOT_WEBLOC_LINK_TEMPLATE,
} as const;

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
): [string, string | null] {
  const match = /^(?<scheme>[a-zA-Z][a-zA-Z0-9+.-]*:\/\/)(?<authority>[^/?#]*)(?<rest>[/?#][\s\S]*)?$/.exec(url);
  const authority = match?.groups?.authority;
  if (!match?.groups?.scheme || authority === undefined) {
    return [url, null];
  }
  const atIndex = authority.lastIndexOf("@");
  if (atIndex < 0) {
    return [url, null];
  }
  const userinfo = authority.slice(0, atIndex);
  const host = authority.slice(atIndex + 1);
  const [rawUsername, ...rawPasswordParts] = userinfo.split(":");
  const username = decodeURIComponentSafe(rawUsername ?? "");
  const password = decodeURIComponentSafe(rawPasswordParts.join(":"));
  return [
    `${match.groups.scheme}${host}${match.groups.rest ?? ""}`,
    `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
  ];
}

export const extract_basic_auth = extractBasicAuth;

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function sanitizeUrl(
  url: string | null | undefined,
  options: { scheme?: string } = {},
): string | undefined {
  if (url === null || url === undefined) {
    return undefined;
  }
  const scheme = options.scheme ?? "http";
  if (url.startsWith("//")) {
    return `${scheme}:${url}`;
  }
  if (/^httpss:\/\//.test(url)) {
    return url.replace(/^httpss:\/\//, "https://");
  }
  if (/^rmtp([es]?):\/\//.test(url)) {
    return url.replace(/^rmtp([es]?):\/\//, "rtmp$1://");
  }
  return url;
}

export const sanitize_url = sanitizeUrl;

export function makeArchiveId(
  ie: object | string,
  videoId: unknown,
): string {
  const ieObject = typeof ie === "object"
    ? ie as { IE_NAME?: string; ieKey?: () => string; constructor?: { ieKey?: () => string } }
    : null;
  const staticIeKey = ieObject?.constructor?.ieKey;
  const ieKey = typeof ie === "string"
    ? ie
    : ieObject?.ieKey?.() ?? staticIeKey?.() ?? ieObject?.IE_NAME ?? "unknown";
  return `${ieKey.toLowerCase()} ${videoId}`;
}

export const make_archive_id = makeArchiveId;

const SMUGGLE_KEY = "__youtubedl_smuggle";

export function smuggleUrl(url: string, data: Record<string, unknown>): string {
  const [cleanUrl, existingData] = unsmuggleUrl(url, {});
  const parsed = new URL(cleanUrl);
  const mergedData = {
    ...(existingData ?? {}),
    ...data,
  };
  parsed.searchParams.set(
    SMUGGLE_KEY,
    Buffer.from(JSON.stringify(mergedData), "utf8").toString("base64url"),
  );
  return parsed.toString();
}

export const smuggle_url = smuggleUrl;

export function unsmuggleUrl(
  url: string,
  defaultValue?: Record<string, unknown>,
): [string, Record<string, unknown>];
export function unsmuggleUrl(
  url: string,
  defaultValue: null,
): [string, Record<string, unknown> | null];
export function unsmuggleUrl(
  url: string,
  defaultValue: Record<string, unknown> | null = {},
): [string, Record<string, unknown> | null] {
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
        | Uint8Array
        | readonly (string | number | boolean | Uint8Array)[]
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
      parsed.searchParams.append(
        key,
        item instanceof Uint8Array ? new TextDecoder().decode(item) : String(item),
      );
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
    return datetimeAddMonths(out, amount);
  } else if (unit.startsWith("year")) {
    return datetimeAddMonths(out, amount * 12);
  }
  return out;
}

function roundDate(
  date: Date,
  precision: "microsecond" | "second" | "minute" | "hour" | "day",
): Date {
  if (precision === "microsecond") {
    return new Date(date.getTime());
  }
  const unitMs = {
    second: 1000,
    minute: 60_000,
    hour: 3_600_000,
    day: 86_400_000,
  }[precision];
  return new Date(Math.round(date.getTime() / unitMs) * unitMs);
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
  processed = processed.replace(/\bnew\s+Date\(\s*("(?:\\.|[^\\"])*"|'(?:\\.|[^\\'])*')\s*\)/g, "$1");
  processed = processed.replace(/\bnew\s+Map\(\s*(\[[\s\S]*\])\s*\)/g, (match, entriesSource: string) => {
    try {
      const entries = JSON.parse(jsToJson(entriesSource, vars, strict)) as unknown;
      if (!Array.isArray(entries)) {
        return match;
      }
      return JSON.stringify(Object.fromEntries(entries as Array<[PropertyKey, unknown]>));
    } catch {
      return match;
    }
  });
  const PATTERN =
    /(?<str>'(?:\\.|[^\\'])*'|"(?:\\.|[^\\"])*"|`(?:\\.|[^\\`])*`)|(?<comment>\/\*(?:(?!\*\/)[\s\S])*\*\/|\/\/[^\n]*\n)|(?<comma>,\s*(?=[\]}]))|(?<void>\bvoid\s+0\b|\bundefined\b)|(?<ident>(?:(?<![0-9])[eE]|[a-df-zA-DF-Z_$])[.a-zA-Z_$0-9]*)|(?<hex>\b(?:0[xX][0-9a-fA-F]+|(?<!\.)0+[0-7]+)(?:\s*:)?)|(?<num>[0-9]+(?=\s*:))|(?<excl>!+)/g;
  processed = processed.replace(PATTERN, (...args) => {
    const groups = args.at(-1) as Record<string, string>;
    if (groups.str) {
      let content = decodeJsStringLiteral(groups.str);
      if (groups.str.startsWith("`")) {
        content = content.replace(/\$\{(.*?)\}/g, (_, key) => {
          const trimmed = key.trim();
          return vars[trimmed] !== undefined ? JSON.parse(vars[trimmed]) : trimmed;
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
      const num = /^0[0-7]+$/.test(numStr) ? Number.parseInt(numStr, 8) : Number(numStr);
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
  return processed.replaceAll(/,\s*(?=[\]}])/g, "");
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

export function partialApplication<T extends (...args: never[]) => unknown>(func: T): (...args: unknown[]) => unknown {
  const callable = func as unknown as (...args: unknown[]) => unknown;
  const apply = (...args: unknown[]): unknown => {
    if (args.length >= callable.length) {
      return callable(...args);
    }
    return (...moreArgs: unknown[]) => apply(...args, ...moreArgs);
  };
  return apply;
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
  const homeExpanded = value === "~" || value.startsWith("~/")
    ? join(process.env.HOME ?? "", value.slice(2))
    : value;
  return homeExpanded
    .replaceAll(/%([^%]+)%/g, (match, name: string) => process.env[name] ?? match)
    .replaceAll(/\$([A-Za-z_][A-Za-z0-9_]*)|\$\{([^}]+)\}/g, (_match, bare: string, braced: string) => process.env[bare || braced] ?? "");
}

export const expand_path = expandPath;

export const ACCENT_CHARS: Record<string, string> = {
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
        const codePoint = char.codePointAt(0) ?? 0;
        out += char === "/" ? "⧸" : char === "\\" ? "⧹" : String.fromCodePoint(codePoint + 0xfee0);
      } else if (!(char === "?" || char < " " || char.charCodeAt(0) === 0x7f)) {
        if (char === '"') {
          out += isId === true ? char : "'";
        } else if (char === ":") {
          out += isId === true ? char : " -";
        } else if ("\\/|*<>".includes(char)) {
          out += isId === true ? char : "_";
        } else {
          out += char;
        }
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
  let out = [...timestampSafe].map((char) => {
    if (ACCENT_CHARS[char]) return ACCENT_CHARS[char];
    if (/[A-Za-z0-9._-]/.test(char)) return char;
    if (char === ":") return "_-";
    return "_";
  }).join("");
  if (isId !== true) {
    out = out.replaceAll(/_+/g, "_").replace(/^_+|_+$/g, "").replace(/^\.+/, "");
  }
  if (isId !== true) {
    if (out.startsWith("-_")) out = out.slice(2);
    if (out.startsWith("-")) out = `_${out.slice(1)}`;
  }
  return out || "_";
}

export const sanitize_filename = sanitizeFilename;

export function _sanitizePathParts(parts: readonly string[]): string[] {
  const sanitizedParts: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") {
      continue;
    }
    if (part === "..") {
      if (sanitizedParts.length && sanitizedParts.at(-1) !== "..") {
        sanitizedParts.pop();
      } else {
        sanitizedParts.push("..");
      }
      continue;
    }
    sanitizedParts.push(part.replaceAll(/[/<>:"|\\?*]|[\s.]$/g, "#"));
  }
  return sanitizedParts;
}

export const _sanitize_path_parts = _sanitizePathParts;

export function sanitizePath(value: string, _force = false): string {
  const normalized = value.replaceAll("/", "\\");
  let root = "";
  let parts: string[];
  if (normalized.startsWith("\\\\")) {
    const split = normalized.split("\\");
    root = `${split.slice(0, 4).join("\\")}\\`;
    parts = split.slice(4);
  } else if (normalized.slice(1, 2) === ":") {
    const offset = normalized.slice(2, 3) === "\\" ? 3 : 2;
    root = normalized.slice(0, offset);
    parts = normalized.slice(offset).split("\\");
  } else {
    root = normalized.startsWith("\\") ? "\\" : "";
    parts = normalized.split("\\");
  }
  const path = _sanitizePathParts(parts).join("\\");
  return root || path ? `${root}${path}` : ".";
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

export type TimeTuple = {
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
};

export const _timetuple = (
  hours: number,
  minutes: number,
  seconds: number,
  milliseconds: number,
): TimeTuple => ({ hours, minutes, seconds, milliseconds });

export function timetupleFromMsec(milliseconds: number): TimeTuple {
  let remaining = Math.trunc(milliseconds);
  const msec = remaining % 1000;
  remaining = Math.trunc(remaining / 1000);
  const seconds = remaining % 60;
  remaining = Math.trunc(remaining / 60);
  const minutes = remaining % 60;
  const hours = Math.trunc(remaining / 60);
  return _timetuple(hours, minutes, seconds, msec);
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
  return utcDate(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
}

export const date_from_str = dateFromStr;

export function datetimeAddMonths(date: Date, months: number): Date {
  const out = new Date(date.getTime());
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + months);
  const lastDay = utcDate(out.getUTCFullYear(), out.getUTCMonth() + 1, 0).getUTCDate();
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
  readonly start: Date;
  readonly end: Date;

  constructor(start?: string | Date | null, end?: string | Date | null) {
    this.start = typeof start === "string" ? dateFromStr(start, { strict: true }) : start ?? utcDate(1, 0, 1);
    this.end = typeof end === "string" ? dateFromStr(end, { strict: true }) : end ?? utcDate(9999, 11, 31);
    if (this.start > this.end) {
      throw new Error(`Date range: "${this}" , the start date must be before the end date`);
    }
  }

  static day(day: string | Date): DateRange {
    return new DateRange(day, day);
  }

  includes(date: string | Date): boolean {
    const parsed = typeof date === "string" ? dateFromStr(date) : date;
    return this.start <= parsed && parsed <= this.end;
  }

  equals(other: unknown): boolean {
    return other instanceof DateRange
      && this.start.getTime() === other.start.getTime()
      && this.end.getTime() === other.end.getTime();
  }

  toString(): string {
    return `${dateToIsoDate(this.start)} to ${dateToIsoDate(this.end)}`;
  }
}

function utcDate(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month, day);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function utcTimestamp(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, millisecond = 0): number {
  const date = utcDate(year, month, day);
  date.setUTCHours(hour, minute, second, millisecond);
  return date.getTime();
}

function dateToIsoDate(date: Date): string {
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
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
  const numberPattern = strict ? NUMBER_RE : NUMBER_RE.replace(String.raw`\.` , "[,.]");
  const unitsPattern = Object.keys(unitTable).map((unit) => RegExp.escape(unit)).join("|");
  const pattern = new RegExp(`${strict ? "^" : ""}(?<num>${numberPattern})\\s*(?<unit>${unitsPattern})\\b${strict ? "$" : ""}`);
  const match = pattern.exec(value);
  if (!match?.groups) {
    return null;
  }
  const numberText = match.groups.num;
  const unit = match.groups.unit;
  if (numberText === undefined || unit === undefined) {
    return null;
  }
  const number = Number.parseFloat(numberText.replace(",", "."));
  const multiplier = unitTable[unit];
  return multiplier === undefined ? null : Math.round(number * multiplier);
}

export const lookup_unit_table = lookupUnitTable;

export function parseBytes(value: string | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const unitTable = Object.fromEntries(["", "K", "M", "G", "T", "P", "E", "Z", "Y"].map((unit, index) => [unit, 1024 ** index]));
  return lookupUnitTable(unitTable, value.toUpperCase(), true);
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

export const _multipart_encode_impl = multipartEncode;
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
  if (protocol !== null && protocol !== undefined) {
    return String(protocol);
  }
  const url = sanitizeUrl(String(info.url ?? "")) ?? "";
  if (url.startsWith("rtmp")) return "rtmp";
  if (url.startsWith("mms")) return "mms";
  if (url.startsWith("rtsp")) return "rtsp";
  const ext = determineExt(url);
  if (ext === "m3u8") return info.is_live ? "m3u8" : "m3u8_native";
  if (ext === "f4m") return "f4m";
  return /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(url)?.[1] ?? "";
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

export function matchStr(
  filter: string,
  data: Record<string, unknown>,
  incomplete: boolean | Iterable<string> = false,
): boolean {
  return splitFilterParts(filter).every((part) =>
    matchOneFilter(part.replaceAll(String.raw`\&`, "&").trim(), data, incomplete),
  );
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

export function cliConfigurationArgs(
  argdict: unknown,
  keys: readonly (string | readonly string[])[],
  defaultValue: readonly string[] = [],
  useCompat = true,
): string[] {
  if (Array.isArray(argdict)) {
    return useCompat ? argdict.map(String) : [...defaultValue];
  }
  if (argdict === null || argdict === undefined) {
    return [...defaultValue];
  }
  if (typeof argdict !== "object") {
    throw new TypeError("argdict must be a dictionary, list or null");
  }
  const args = argdict as Record<string, readonly unknown[] | unknown | null | undefined>;
  for (const keyList of keys) {
    const values = variadic(keyList)
      .map((key) => args[String(key).toLowerCase()])
      .filter((value) => value !== null && value !== undefined);
    if (values.length) {
      return values.flatMap((value) =>
        Array.isArray(value) ? value.map(String) : [String(value)],
      );
    }
  }
  return [...defaultValue];
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
    throw new Error("Input data too long for PKCS#1 padding");
  }
  const paddingLength = length - data.length - 3;
  const padding = new Uint8Array(paddingLength).map(() => {
    return Math.floor(Math.random() * 255);
  });
  return Uint8Array.from([0, 2, ...padding, 0, ...data]);
}

export function ohdaveRsaEncrypt(data: Uint8Array, exponent: number | bigint, modulus: number | bigint): string {
  const payload = bytesToLong(Uint8Array.from([...data].reverse()));
  return modPow(payload, BigInt(exponent), BigInt(modulus)).toString(16);
}

export const ohdave_rsa_encrypt = ohdaveRsaEncrypt;

export function decodePackedCodes(code: string): string {
  const match = new RegExp(PACKED_CODES_RE).exec(code);
  if (!match) {
    return code;
  }
  const [, obfuscatedCode = "", baseText = "0", countText = "0", symbolsText = ""] = match;
  const base = Number(baseText);
  let count = Number(countText);
  const symbols = symbolsText.split("|");
  const symbolTable = new Map<string, string>();
  while (count) {
    count -= 1;
    const baseNCount = encodeBaseN(count, base);
    symbolTable.set(baseNCount, symbols[count] || baseNCount);
  }
  return obfuscatedCode.replaceAll(/\b(\w+)\b/g, (word) => symbolTable.get(word) ?? word);
}

export const decode_packed_codes = decodePackedCodes;

export function writeXattr(path: string, key: string, value: string | Uint8Array): void {
  if (process.platform === "win32") {
    if (key.includes(":")) {
      throw new XAttrMetadataError(null, "xattr key must not contain ':' on Windows");
    }
    if (!existsSync(path)) {
      throw new XAttrMetadataError(null, `${path} does not exist`);
    }
    try {
      writeFileSync(`${path}:${key}`, value);
    } catch (error) {
      throw new XAttrMetadataError(typeof (error as NodeJS.ErrnoException).errno === "number" ? (error as NodeJS.ErrnoException).errno ?? null : null, (error as Error).message);
    }
    return;
  }

  const setfattr = checkExecutable("setfattr", ["--version"]);
  const xattr = setfattr ? false : checkExecutable("xattr", ["-h"]);
  const exe = setfattr || xattr;
  if (!exe) {
    throw new XAttrUnavailableError(
      "Couldn't find a tool to set the xattrs. Install either the xattr binary or GNU attr package (which contains the setfattr tool)",
    );
  }

  const textValue = typeof value === "string" ? value : Buffer.from(value).toString();
  const result = exe === xattr
    ? spawnSync(exe, ["-w", key, textValue, path], { encoding: "utf8", input: "" })
    : spawnSync(exe, ["-n", key, "-v", textValue, path], { encoding: "utf8", input: "" });
  if (result.error) {
    throw new XAttrMetadataError((result.error as NodeJS.ErrnoException).errno ?? null, result.error.message);
  }
  if (result.status) {
    throw new XAttrMetadataError(result.status, result.stderr || `xattr command failed with status ${result.status}`);
  }
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

export const _HEX_TABLE = "0123456789abcdef";

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
  const headers = options.headers ?? null;
  const header = headers && "alg" in headers && "typ" in headers
    ? headers
    : { alg: options.alg ?? "HS256", typ: "JWT", ...(headers ?? {}) };
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

const ESCAPE_CHARACTER = "\u001B";
export const _terminal_sequences_re = new RegExp(`${ESCAPE_CHARACTER}\\[[^m]+m`, "g");

export function removeTerminalSequences(value: string): string {
  return value.replaceAll(_terminal_sequences_re, "");
}

export const remove_terminal_sequences = removeTerminalSequences;

export function numberOfDigits(number: number): number {
  return Math.trunc(number).toString().length;
}

export const number_of_digits = numberOfDigits;

export function scaleThumbnailsToMaxFormatWidth(
  formats: Array<Record<string, unknown>>,
  thumbnails: Array<Record<string, unknown>>,
  urlWidthRe: RegExp,
): Array<Record<string, unknown>> {
  const keys = ["width", "height"] as const;
  const maxDimensions = formats.reduce<[number, number]>(
    (best, format) => {
      const current: [number, number] = [
        Number(format.width ?? 0),
        Number(format.height ?? 0),
      ];
      return current[0] > best[0] ? current : best;
    },
    [0, 0],
  );
  if (!maxDimensions[0]) {
    return thumbnails;
  }
  return thumbnails.map((thumbnail) =>
    mergeDicts(
      {
        url: typeof thumbnail.url === "string"
          ? thumbnail.url.replace(urlWidthRe, String(maxDimensions[0]))
          : thumbnail.url,
      },
      Object.fromEntries(keys.map((key, index) => [key, maxDimensions[index]])),
      thumbnail,
    ),
  );
}

export const scale_thumbnails_to_max_format_width = scaleThumbnailsToMaxFormatWidth;

export function parseHttpRange(range: string | null | undefined): [number | null, number | null, number | null] {
  if (!range) {
    return [null, null, null];
  }
  const match = /bytes[ =](\d+)-(\d+)?(?:\/(\d+))?/i.exec(range);
  if (!match) {
    return [null, null, null];
  }
  return [
    Number(match[1]),
    intOrNone(match[2] ?? null),
    intOrNone(match[3] ?? null),
  ];
}

export const parse_http_range = parseHttpRange;

export async function readStdin(_what = "data"): Promise<string> {
  return await Bun.stdin.text();
}

export const read_stdin = readStdin;

function bytesStartsWith(bytes: Uint8Array, prefix: Uint8Array): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((byte, index) => bytes[index] === byte);
}

export function determineFileEncoding(data: Uint8Array | string): [string | null, number] {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  if (!bytes.length) return [null, 0];
  for (const [bom, encoding] of BOMS) {
    if (bytesStartsWith(bytes, bom)) {
      return [encoding, bom.length];
    }
  }
  const withoutNuls = bytes.filter((byte) => byte !== 0);
  const header = new TextDecoder("utf-8", { fatal: false }).decode(withoutNuls);
  return [/^#\s*coding\s*:\s*(\S+)\s*$/m.exec(header)?.[1] ?? null, 0];
}

export const determine_file_encoding = determineFileEncoding;

function decodeConfigBytes(bytes: Uint8Array, encoding: string | null): string {
  switch (encoding?.toLowerCase()) {
    case "utf-16-le":
      return decodeUtf16Le(bytes);
    case "utf-16-be":
      return decodeUtf16Be(bytes);
    case "utf-32-le":
      return decodeUtf32(bytes, true);
    case "utf-32-be":
      return decodeUtf32(bytes, false);
    default:
      return new TextDecoder(encoding ?? "utf-8", { fatal: true }).decode(bytes);
  }
}

export class Config {
  configs: Config[] = [];
  own_args: string[] | null = null;
  parsed_args: string[] = [];
  filename: string | null = null;
  private initialized = false;
  private loadedPaths = new Set<string>();

  constructor(
    readonly parser: {
      parse_known_args?: (args?: Iterable<string>, options?: Record<string, unknown>) => unknown;
      parse_args?: (args?: Iterable<string>) => unknown;
      error?: (message: string) => never;
    } | null = null,
    readonly label: string | null = null,
  ) {}

  init(args: string[] | null = null, filename: string | null = null): boolean {
    if (this.initialized) {
      throw new Error("Config is already initialized");
    }
    this.own_args = args ?? [];
    this.filename = filename;
    return this.loadConfigs();
  }

  loadConfigs(): boolean {
    let directory = "";
    if (this.filename) {
      const location = this.filename;
      directory = dirname(location);
      if (this.loadedPaths.has(location)) return false;
      this.loadedPaths.add(location);
    }
    this.initialized = true;
    const parsed = this.parser?.parse_known_args?.(this.own_args ?? []);
    const opts = Array.isArray(parsed) ? parsed[0] : parsed;
    this.parsed_args = this.own_args ?? [];
    const locations = opts && typeof opts === "object" && "config_locations" in opts
      ? (opts as { config_locations?: unknown }).config_locations
      : null;
    if (Array.isArray(locations)) {
      for (const rawLocation of locations) {
        if (typeof rawLocation !== "string") continue;
        if (rawLocation === "-") {
          if (this.loadedPaths.has(rawLocation)) continue;
          this.loadedPaths.add(rawLocation);
          continue;
        }
        const location = rawLocation.startsWith("/") ? rawLocation : join(directory, expandPath(rawLocation));
        if (!existsSync(location)) {
          this.parser?.error?.(`config location ${location} does not exist`);
          throw new Error(`config location ${location} does not exist`);
        }
        this.appendConfig(Config.readFile(location), location);
      }
    }
    return true;
  }

  static readFile(filename: string, defaultValue: string[] = []): string[] {
    if (!existsSync(filename)) return defaultValue;
    const contents = readFileSync(filename);
    const [encoding, skip] = determineFileEncoding(contents.subarray(0, 512));
    try {
      return shlexSplit(decodeConfigBytes(contents.subarray(skip), encoding));
    } catch (error) {
      throw new Error(`Unable to parse "${filename}": ${error instanceof Error ? error.message : String(error)}`);
    }
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
    const self = this;
    return (function* allArgs() {
      for (const config of [...self.configs].reverse()) {
        yield* config.all_args;
      }
      yield* self.parsed_args;
    })();
  }

  appendConfig(args: string[] | null, filename: string | null = null, label: string | null = null): void {
    const config = new Config(this.parser, label);
    config.loadedPaths = this.loadedPaths;
    if (config.init(args, filename)) {
      this.configs.push(config);
    }
  }

  parse_known_args(options: Record<string, unknown> = {}): unknown {
    return this.parser?.parse_known_args?.(this.all_args, options);
  }

  parse_args(): unknown {
    return this.parser?.parse_args?.(this.all_args);
  }

  toString(): string {
    const label = joinNonempty(this.label, "config", this.filename ? `"${this.filename}"` : "", { delim: " " });
    const own = this.own_args ? `${label.charAt(0).toUpperCase()}${label.slice(1)}: ${JSON.stringify(Config.hideLoginInfo(this.own_args))}` : "";
    const nested = this.configs.map((config) => `\n${config}`.replaceAll("\n", "\n| ").slice(1));
    return joinNonempty(own, ...nested, { delim: "\n" });
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

const COMMON_VIDEO_EXTENSIONS = ["avi", "flv", "mkv", "mov", "mp4", "webm"] as const;
const VIDEO_EXTENSIONS = ["3g2", "3gp", "f4v", "mk3d", "divx", "mpg", "ogv", "m4v", "wmv", ...COMMON_VIDEO_EXTENSIONS] as const;
const COMMON_AUDIO_EXTENSIONS = ["aiff", "alac", "flac", "m4a", "mka", "mp3", "ogg", "opus", "wav"] as const;
const AUDIO_EXTENSIONS = ["aac", "ape", "asf", "f4a", "f4b", "m4b", "m4r", "oga", "ogx", "spx", "vorbis", "wma", "weba", ...COMMON_AUDIO_EXTENSIONS] as const;
const THUMBNAIL_EXTENSIONS = ["jpg", "png", "webp"] as const;
const STORYBOARD_EXTENSIONS = ["mhtml"] as const;
const SUBTITLE_EXTENSIONS = ["srt", "vtt", "ass", "lrc"] as const;
const MANIFEST_EXTENSIONS = ["f4f", "f4m", "m3u8", "smil", "mpd"] as const;

export const MEDIA_EXTENSIONS = new Namespace({
  common_video: COMMON_VIDEO_EXTENSIONS,
  video: VIDEO_EXTENSIONS,
  common_audio: COMMON_AUDIO_EXTENSIONS,
  audio: AUDIO_EXTENSIONS,
  thumbnails: THUMBNAIL_EXTENSIONS,
  storyboards: STORYBOARD_EXTENSIONS,
  subtitles: SUBTITLE_EXTENSIONS,
  manifests: MANIFEST_EXTENSIONS,
}) as Namespace & {
  common_video: typeof COMMON_VIDEO_EXTENSIONS;
  video: typeof VIDEO_EXTENSIONS;
  common_audio: typeof COMMON_AUDIO_EXTENSIONS;
  audio: typeof AUDIO_EXTENSIONS;
  thumbnails: typeof THUMBNAIL_EXTENSIONS;
  storyboards: typeof STORYBOARD_EXTENSIONS;
  subtitles: typeof SUBTITLE_EXTENSIONS;
  manifests: typeof MANIFEST_EXTENSIONS;
};

export const KNOWN_EXTENSIONS = [
  ...MEDIA_EXTENSIONS.video,
  ...MEDIA_EXTENSIONS.audio,
  ...MEDIA_EXTENSIONS.manifests,
] as const;

export class _UnsafeExtensionError extends Error {
  static readonly ALLOWED_EXTENSIONS = new Set([
    "description",
    "json",
    "meta",
    "orig",
    "part",
    "temp",
    "uncut",
    "unknown_video",
    "ytdl",
    ...MEDIA_EXTENSIONS.video,
    "asx",
    "ismv",
    "m2t",
    "m2ts",
    "m2v",
    "m4s",
    "mng",
    "mp2v",
    "mp4v",
    "mpe",
    "mpeg",
    "mpeg1",
    "mpeg2",
    "mpeg4",
    "mxf",
    "ogm",
    "qt",
    "rm",
    "swf",
    "ts",
    "vid",
    "vob",
    "vp9",
    ...MEDIA_EXTENSIONS.audio,
    "3ga",
    "ac3",
    "adts",
    "aif",
    "au",
    "dts",
    "isma",
    "it",
    "mid",
    "mod",
    "mpga",
    "mp1",
    "mp2",
    "mp4a",
    "mpa",
    "ra",
    "shn",
    "xm",
    ...MEDIA_EXTENSIONS.thumbnails,
    "avif",
    "bmp",
    "gif",
    "heic",
    "ico",
    "image",
    "jfif",
    "jng",
    "jpe",
    "jpeg",
    "jxl",
    "svg",
    "tif",
    "tiff",
    "wbmp",
    ...MEDIA_EXTENSIONS.subtitles,
    "dfxp",
    "fs",
    "ismt",
    "json3",
    "sami",
    "scc",
    "srv1",
    "srv2",
    "srv3",
    "ssa",
    "tt",
    "ttml",
    "xml",
    ...MEDIA_EXTENSIONS.manifests,
    ...MEDIA_EXTENSIONS.storyboards,
    "desktop",
    "ism",
    "m3u",
    "sbv",
    "url",
    "webloc",
  ]);

  override name = "_UnsafeExtensionError";

  constructor(readonly extension: string) {
    super(`unsafe file extension: ${JSON.stringify(extension)}`);
  }

  static sanitizeExtension(extension: string | null | undefined, options: { prepend?: boolean } = {}): string | null | undefined {
    if (extension === null || extension === undefined) {
      return extension;
    }
    if (extension.includes("/") || extension.includes("\\")) {
      throw new _UnsafeExtensionError(extension);
    }
    if (!options.prepend) {
      const last = extension.split(".").pop() ?? extension;
      const checkedExtension = last === "bin" ? "unknown_video" : extension;
      const checkedLast = last === "bin" ? "unknown_video" : last.toLowerCase();
      if (!_UnsafeExtensionError.ALLOWED_EXTENSIONS.has(checkedLast)) {
        throw new _UnsafeExtensionError(extension);
      }
      return checkedExtension;
    }
    return extension;
  }

  static sanitize_extension(extension: string | null | undefined, options: { prepend?: boolean } = {}): string | null | undefined {
    return _UnsafeExtensionError.sanitizeExtension(extension, options);
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

export function orderedSetFromOptions(
  options: Iterable<string>,
  aliasDict: Record<string, readonly string[] | string> = {},
  config: { use_regex?: boolean; start?: readonly string[] | null } = {},
): string[] {
  if (!("all" in aliasDict)) {
    throw new Error('"all" alias is required');
  }
  const allValues = variadic(aliasDict.all);
  const requested = [...(config.start ?? [])];
  for (let value of options) {
    const discard = value.startsWith("-");
    if (discard) value = value.slice(1);

    if (value in aliasDict) {
      const aliasValues = variadic(aliasDict[value] as readonly string[] | string);
      const expanded = discard
        ? aliasValues.map((item) => item.startsWith("-") ? item.slice(1) : `-${item}`)
        : aliasValues;
      requested.splice(0, requested.length, ...orderedSetFromOptions(expanded, aliasDict, { start: requested }));
      continue;
    }

    const current = config.use_regex
      ? allValues.filter((item) => new RegExp(value, "i").test(item))
      : allValues.includes(value)
        ? [value]
        : null;
    if (current === null) {
      throw new Error(value);
    }
    if (discard) {
      for (const item of current) {
        let index = requested.indexOf(item);
        while (index >= 0) {
          requested.splice(index, 1);
          index = requested.indexOf(item);
        }
      }
    } else {
      requested.push(...current);
    }
  }
  return orderedSet(requested);
}

export const orderedSet_from_options = orderedSetFromOptions;

export class FormatSorter {
  static readonly regex = /^\s*(?:(?<reverse>\+)?(?<field>[a-zA-Z0-9_]+)((?<separator>[~:])(?<limit>.*?))?)?\s*$/;
  static readonly default = [
    "hidden",
    "aud_or_vid",
    "hasvid",
    "ie_pref",
    "lang",
    "quality",
    "res",
    "fps",
    "hdr:12",
    "vcodec",
    "channels",
    "acodec",
    "size",
    "br",
    "asr",
    "proto",
    "ext",
    "hasaud",
    "source",
    "id",
  ] as const;

  private readonly settings: Record<string, Record<string, unknown>> = makeFormatSortSettings();
  private readonly order: string[] = [];
  private readonly sortUser: string[];
  private readonly sortExtractor: string[];
  private readonly useFreeOrder: boolean;

  constructor(
    readonly ydl: { params?: Record<string, unknown>; deprecated_feature?: (message: string) => void; write_debug?: (message: string) => void },
    fieldPreference: readonly string[] = [],
  ) {
    const params = ydl.params ?? {};
    this.useFreeOrder = Boolean(params.prefer_free_formats);
    this.sortUser = Array.isArray(params.format_sort) ? params.format_sort.map(String) : [];
    this.sortExtractor = [...fieldPreference];
    this.evaluateParams(params, this.sortExtractor);
    if (params.verbose && ydl.write_debug) {
      this.printVerboseInfo(ydl.write_debug);
    }
  }

  private getFieldSetting(field: string, key: string): unknown {
    if (!(field in this.settings)) {
      if (key === "forced" || key === "priority") {
        return false;
      }
      this.ydl.deprecated_feature?.(`Using arbitrary fields (${field}) for format sorting is deprecated and may be removed in a future version`);
      this.settings[field] = {};
    }
    const setting = this.settings[field] ?? {};
    if (!(key in setting)) {
      const type = setting.type;
      if (key === "field") {
        setting[key] = type === "extractor" ? "preference" : type === "combined" || type === "multiple" ? [field] : field;
      } else if (key === "convert") {
        setting[key] = type === "ordered" ? "order" : field ? "float_string" : "ignore";
      } else {
        setting[key] = ({ type: "field", visible: true, order: [], not_in_list: [null] } as Record<string, unknown>)[key];
      }
    }
    return setting[key];
  }

  private resolveFieldValue(field: string, value: unknown, convertNone = false): unknown {
    let normalized: string | null;
    if (value === null || value === undefined) {
      if (!convertNone) {
        return null;
      }
      normalized = null;
    } else {
      normalized = String(value).toLowerCase();
    }
    const conversion = this.getFieldSetting(field, "convert");
    if (conversion === "ignore") return null;
    if (conversion === "string") return normalized;
    if (conversion === "float_none") return floatOrNone(normalized);
    if (conversion === "bytes") return parseBytes(normalized);
    if (conversion === "order") {
      const freeOrder = this.useFreeOrder ? this.getFieldSetting(field, "order_free") : null;
      const orderList = toStringArray(freeOrder ?? this.getFieldSetting(field, "order"));
      const useRegex = Boolean(this.getFieldSetting(field, "regex"));
      const emptyPos = orderList.includes("") ? orderList.indexOf("") : orderList.length + 1;
      if (useRegex && normalized !== null) {
        const matched = orderList.findIndex((regex) => regex ? new RegExp(regex).test(normalized) : false);
        return matched >= 0 ? orderList.length - matched : orderList.length - emptyPos;
      }
      const found = normalized === null ? -1 : orderList.indexOf(normalized);
      return orderList.length - (found >= 0 ? found : emptyPos);
    }
    if (normalized !== null && /^-?\d+(?:\.\d+)?$/.test(normalized)) {
      return Number(normalized);
    }
    if (field) {
      this.settings[field] ??= {};
      this.settings[field].convert = "string";
    }
    return normalized;
  }

  private evaluateParams(params: Record<string, unknown>, sortExtractor: readonly string[]): void {
    const addItem = (fieldRaw: string, reverse: boolean, closest: boolean, limitText: string | null) => {
      const field = fieldRaw.toLowerCase();
      if (this.order.includes(field)) return;
      this.order.push(field);
      const limit = this.resolveFieldValue(field, limitText);
      this.settings[field] ??= {};
      Object.assign(this.settings[field], {
        reverse,
        closest: limit === null ? false : closest,
        limit_text: limitText,
        limit,
      });
    };

    const forcedDefault = FormatSorter.default.filter((field) => Boolean(this.getFieldSetting(parseSortField(field), "forced")));
    const priorityDefault = params.format_sort_force ? [] : FormatSorter.default.filter((field) => Boolean(this.getFieldSetting(parseSortField(field), "priority")));
    const sortList = [...forcedDefault, ...priorityDefault, ...this.sortUser, ...sortExtractor, ...FormatSorter.default];
    for (const item of sortList) {
      const match = FormatSorter.regex.exec(item);
      const fieldMatch = match?.groups?.field;
      if (!match || !fieldMatch) {
        if (item.trim()) throw new ExtractorError(`Invalid format sort string "${item}" given by extractor`);
        continue;
      }
      let field = fieldMatch.toLowerCase();
      if (this.getFieldSetting(field, "type") === "alias") {
        const alias = field;
        field = String(this.getFieldSetting(field, "field"));
        if (this.getFieldSetting(alias, "deprecated")) {
          this.ydl.deprecated_feature?.(`Format sorting alias ${alias} is deprecated and may be removed in a future version. Please use ${field} instead`);
        }
      }
      const groups = match.groups;
      const reverse = Boolean(groups?.reverse);
      const closest = groups?.separator === "~";
      const limitText = groups?.limit ?? null;
      const hasLimit = limitText !== null;
      const hasMultipleFields = this.getFieldSetting(field, "type") === "combined";
      const fields = hasMultipleFields ? toStringArray(this.getFieldSetting(field, "field")) : [field];
      const limits = hasLimit && hasMultipleFields && !this.getFieldSetting(field, "same_limit")
        ? limitText.split(":")
        : hasLimit
          ? [limitText]
          : [];
      for (const [index, fieldItem] of fields.entries()) {
        addItem(fieldItem, reverse, closest, limits[index] ?? limits[0] ?? null);
      }
    }
  }

  private printVerboseInfo(writeDebug: (message: string) => void): void {
    if (this.sortUser.length) writeDebug(`Sort order given by user: ${this.sortUser.join(", ")}`);
    if (this.sortExtractor.length) writeDebug(`Sort order given by extractor: ${this.sortExtractor.join(", ")}`);
    writeDebug(`Formats sorted by: ${this.order.filter((field) => this.getFieldSetting(field, "visible")).join(", ")}`);
  }

  private calculateFieldPreferenceFromValue(field: string, type: unknown, rawValue: unknown): unknown[] {
    let value = rawValue;
    const reverse = Boolean(this.getFieldSetting(field, "reverse"));
    const closest = Boolean(this.getFieldSetting(field, "closest"));
    const limit = this.getFieldSetting(field, "limit");
    if (type === "extractor") {
      const maximum = this.getFieldSetting(field, "max");
      if (value === null || value === undefined || (typeof maximum === "number" && Number(value) >= maximum)) value = -1;
    } else if (type === "boolean") {
      const inList = this.getFieldSetting(field, "in_list");
      const notInList = this.getFieldSetting(field, "not_in_list");
      const inAllowed = !Array.isArray(inList) || inList.includes(value);
      const notDisallowed = !Array.isArray(notInList) || !notInList.includes(value);
      value = inAllowed && notDisallowed ? 0 : -1;
    } else if (type === "ordered") {
      value = this.resolveFieldValue(field, value, true);
    }
    const valueNumber = floatOrNone(value, 1, this.getFieldSetting(field, "default") as number | null);
    const isNumber = this.getFieldSetting(field, "convert") !== "string" && valueNumber !== null;
    if (isNumber) value = valueNumber;
    if (value === null || value === undefined) return [-10, 0];
    if (!isNumber) return [1, value, 0];
    const numericValue = Number(value);
    const numericLimit = typeof limit === "number" ? limit : null;
    if (closest && numericLimit !== null) return [0, -Math.abs(numericValue - numericLimit), reverse ? numericValue - numericLimit : numericLimit - numericValue];
    if (!reverse && (numericLimit === null || numericValue <= numericLimit)) return [0, numericValue, 0];
    if (numericLimit === null || (reverse && numericValue === numericLimit) || numericValue > numericLimit) return [0, -numericValue, 0];
    return [-1, numericValue, 0];
  }

  private calculateFieldPreference(format: Record<string, unknown>, field: string): unknown[] {
    let type = this.getFieldSetting(field, "type");
    const getValue = (valueField: string) => format[String(this.getFieldSetting(valueField, "field"))];
    let value: unknown;
    if (type === "multiple") {
      type = "field";
      const fields = toStringArray(this.getFieldSetting(field, "field"));
      const values = fields.map((item) => getValue(item));
      const func = this.getFieldSetting(field, "function");
      value = typeof func === "function" ? (func as (items: unknown[]) => unknown)(values) : values.find(Boolean);
    } else {
      value = getValue(field);
    }
    return this.calculateFieldPreferenceFromValue(field, type, value);
  }

  static fillSortingFields(format: Record<string, unknown>): void {
    if (!format.protocol) format.protocol = determineProtocol(format);
    if (!format.ext && typeof format.url === "string") format.ext = determineExt(format.url).toLowerCase();
    if (format.vcodec === "none") {
      format.audio_ext = format.acodec !== "none" ? format.ext : "none";
      format.video_ext = "none";
    } else {
      format.video_ext = format.ext;
      format.audio_ext = "none";
    }
    if (format.preference === null || format.preference === undefined) {
      if (format.ext === "flv" && /[hx]265|he?vc?/.test(String(format.vcodec ?? ""))) format.preference = -100;
    }
    if (format.vcodec === "none") format.vbr = 0;
    if (format.acodec === "none") format.abr = 0;
    if (!format.vbr && format.vcodec !== "none") format.vbr = tryCall(() => Number(format.tbr) - Number(format.abr));
    if (!format.abr && format.acodec !== "none") format.abr = tryCall(() => Number(format.tbr) - Number(format.vbr));
    if (!format.tbr) format.tbr = tryCall(() => Number(format.vbr) + Number(format.abr));
  }

  calculate_preference(format: Record<string, unknown>): unknown[] {
    FormatSorter.fillSortingFields(format);
    return this.order.map((field) => this.calculateFieldPreference(format, field));
  }
}

function parseSortField(field: string): string {
  return field.split(/[~:]/, 1)[0] ?? field;
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : value === null || value === undefined ? [] : [String(value)];
}

function makeFormatSortSettings(): Record<string, Record<string, unknown>> {
  return {
    vcodec: { type: "ordered", regex: true, order: ["av0?1", String.raw`vp0?9\.0?2`, "vp0?9", "[hx]265|he?vc?", "[hx]264|avc", "vp0?8", "mp4v|h263", "theora", "", null, "none"] },
    acodec: { type: "ordered", regex: true, order: ["[af]lac", "wav|aiff", "opus", "vorbis|ogg", "aac", "mp?4a?", "mp3", "ac-?4", "e-?a?c-?3", "ac-?3", "dts", "", null, "none"] },
    hdr: { type: "ordered", regex: true, field: "dynamic_range", order: ["dv", "(hdr)?12", String.raw`(hdr)?10\+`, "(hdr)?10", "hlg", "", "sdr", null] },
    proto: { type: "ordered", regex: true, field: "protocol", order: ["(ht|f)tps", "(ht|f)tp$", "m3u8.*", ".*dash", "websocket_frag", "rtmpe?", "", "mms|rtsp", "ws|websocket", "f4"] },
    vext: { type: "ordered", field: "video_ext", order: ["mp4", "mov", "webm", "flv", "", "none"], order_free: ["webm", "mp4", "mov", "flv", "", "none"] },
    aext: { type: "ordered", regex: true, field: "audio_ext", order: ["m4a", "aac", "mp3", "ogg", "opus", "web[am]", "", "none"], order_free: ["ogg", "opus", "web[am]", "mp3", "m4a", "aac", "", "none"] },
    hidden: { visible: false, forced: true, type: "extractor", max: -1000 },
    aud_or_vid: { visible: false, forced: true, type: "multiple", field: ["vcodec", "acodec"], function: (items: unknown[]) => Number(items.some((item) => item !== "none")) },
    ie_pref: { priority: true, type: "extractor" },
    hasvid: { priority: true, field: "vcodec", type: "boolean", not_in_list: ["none"] },
    hasaud: { field: "acodec", type: "boolean", not_in_list: ["none"] },
    lang: { convert: "float", field: "language_preference", default: -1 },
    quality: { convert: "float", default: -1 },
    filesize: { convert: "bytes" },
    fs_approx: { convert: "bytes", field: "filesize_approx" },
    id: { convert: "string", field: "format_id" },
    height: { convert: "float_none" },
    width: { convert: "float_none" },
    fps: { convert: "float_none" },
    channels: { convert: "float_none", field: "audio_channels" },
    tbr: { convert: "float_none" },
    vbr: { convert: "float_none" },
    abr: { convert: "float_none" },
    asr: { convert: "float_none" },
    source: { convert: "float", field: "source_preference", default: -1 },
    codec: { type: "combined", field: ["vcodec", "acodec"] },
    br: { type: "multiple", field: ["tbr", "vbr", "abr"], convert: "float_none", function: (items: unknown[]) => items.find((item) => item) ?? null },
    size: { type: "multiple", field: ["filesize", "fs_approx"], convert: "bytes", function: (items: unknown[]) => items.find((item) => item) ?? null },
    ext: { type: "combined", field: ["vext", "aext"] },
    res: {
      type: "multiple",
      field: ["height", "width"],
      function: (items: unknown[]) => {
        const values = items.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
        return values.length ? Math.min(...values) : 0;
      },
    },
    format_id: { type: "alias", field: "id" },
    preference: { type: "alias", field: "ie_pref" },
    language_preference: { type: "alias", field: "lang" },
    source_preference: { type: "alias", field: "source" },
    protocol: { type: "alias", field: "proto" },
    filesize_approx: { type: "alias", field: "fs_approx" },
    audio_channels: { type: "alias", field: "channels" },
    dimension: { type: "alias", field: "res", deprecated: true },
    resolution: { type: "alias", field: "res", deprecated: true },
    extension: { type: "alias", field: "ext", deprecated: true },
    bitrate: { type: "alias", field: "br", deprecated: true },
    total_bitrate: { type: "alias", field: "tbr", deprecated: true },
    video_bitrate: { type: "alias", field: "vbr", deprecated: true },
    audio_bitrate: { type: "alias", field: "abr", deprecated: true },
    framerate: { type: "alias", field: "fps", deprecated: true },
    filesize_estimate: { type: "alias", field: "size", deprecated: true },
    samplerate: { type: "alias", field: "asr", deprecated: true },
    video_ext: { type: "alias", field: "vext", deprecated: true },
    audio_ext: { type: "alias", field: "aext", deprecated: true },
    video_codec: { type: "alias", field: "vcodec", deprecated: true },
    audio_codec: { type: "alias", field: "acodec", deprecated: true },
    video: { type: "alias", field: "hasvid", deprecated: true },
    has_video: { type: "alias", field: "hasvid", deprecated: true },
    audio: { type: "alias", field: "hasaud", deprecated: true },
    has_audio: { type: "alias", field: "hasaud", deprecated: true },
    extractor: { type: "alias", field: "ie_pref", deprecated: true },
    extractor_preference: { type: "alias", field: "ie_pref", deprecated: true },
  };
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

function matchOneFilter(
  filter: string,
  data: Record<string, unknown>,
  incomplete: boolean | Iterable<string> = false,
): boolean {
  const isIncomplete = makeIncompletePredicate(incomplete);
  const unary = /^!(?<key>[A-Za-z0-9_]+)$/.exec(filter);
  if (unary?.groups?.key) {
    const value = data[unary.groups.key];
    if ((value === null || value === undefined) && isIncomplete(unary.groups.key)) {
      return true;
    }
    return value === false || value === null || value === undefined;
  }
  if (/^[A-Za-z0-9_]+$/.test(filter)) {
    const value = data[filter];
    if ((value === null || value === undefined) && isIncomplete(filter)) {
      return true;
    }
    return value !== false && value !== null && value !== undefined;
  }
  const match = /^(?<key>[A-Za-z0-9_]+)\s*(?<op>>=\??|<=\??|>\??|<\??|!\^=|!\*=|!=|!\$=|\^=|\*=|\$=|~=|=)\s*(?<value>.*)$/.exec(filter);
  if (!match?.groups?.key || !match.groups.op) {
    throw new Error(`Invalid filter part ${JSON.stringify(filter)}`);
  }
  const current = data[match.groups.key];
  const optional = match.groups.op.includes("?");
  if ((current === null || current === undefined) && (optional || isIncomplete(match.groups.key))) {
    return true;
  }
  if (current === null || current === undefined) {
    return false;
  }
  const op = match.groups.op.replace("?", "");
  const expectedRaw = unquoteFilterValue((match.groups.value ?? "").trim());
  if ([">", ">=", "<", "<="].includes(op)) {
    const left = Number(current);
    const right = parseNumericFilterValue(expectedRaw);
    if (!Number.isFinite(left) || right === null) return false;
    if (op === ">") return left > right;
    if (op === ">=") return left >= right;
    if (op === "<") return left < right;
    return left <= right;
  }
  if (
    typeof current === "number" &&
    Number.isFinite(current) &&
    ["^=", "!^=", "*=", "!*=", "$=", "!$=", "~="].includes(op)
  ) {
    throw new Error(`Operator ${op.replace("!", "")} only supports string values!`);
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

export function _match_one(
  filterPart: string,
  data: Record<string, unknown>,
  incomplete: boolean | Iterable<string> = false,
): boolean {
  return matchOneFilter(filterPart, data, incomplete);
}

function parseNumericFilterValue(value: string): number | null {
  return parseCount(value) ?? parseDuration(value) ?? parseFilesize(value) ?? floatOrNone(value);
}

function splitFilterParts(filter: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | null = null;
  let escaped = false;
  for (const char of filter) {
    if (escaped) {
      current += `\\${char}`;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) {
        quote = null;
      }
      current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === "&") {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (escaped) {
    current += "\\";
  }
  parts.push(current);
  return parts;
}

function makeIncompletePredicate(incomplete: boolean | Iterable<string>): (key: string) => boolean {
  if (typeof incomplete === "boolean") {
    return () => incomplete;
  }
  const keys = new Set(incomplete);
  return (key) => keys.has(key);
}

function unquoteFilterValue(value: string): string {
  if (value.length < 2) {
    return value;
  }
  const quote = value[0];
  return (quote === '"' || quote === "'") && value.at(-1) === quote
    ? value.slice(1, -1).replaceAll(`\\${quote}`, quote)
    : value;
}

function shlexSplit(input: string): string[] {
  const tokens: string[] = [];
  let token = "";
  let quote: string | null = null;
  let escaped = false;
  let tokenStarted = false;
  const pushToken = () => {
    if (tokenStarted) {
      tokens.push(token);
      token = "";
      tokenStarted = false;
    }
  };
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index] ?? "";
    if (escaped) {
      token += char;
      tokenStarted = true;
      escaped = false;
      continue;
    }
    if (quote) {
      if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      } else {
        token += char;
      }
      tokenStarted = true;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      tokenStarted = true;
    } else if (char === "'" || char === '"') {
      quote = char;
      tokenStarted = true;
    } else if (char === "#") {
      while (index < input.length && input[index] !== "\n") {
        index += 1;
      }
      pushToken();
    } else if (/\s/.test(char)) {
      pushToken();
    } else {
      token += char;
      tokenStarted = true;
    }
  }
  if (escaped) token += "\\";
  pushToken();
  return tokens;
}

export function findXpathAttr(node: XmlElement, xpath: string, key: string, value: string | null = null): XmlElement | null {
  const candidates = findXmlPathAll(node, xpath);
  return candidates.find((child) => key in child.attrib && (value === null || child.attrib[key] === value)) ?? null;
}

export const find_xpath_attr = findXpathAttr;

export function xpathAttr(node: XmlElement, xpath: string | readonly string[], key: string, name?: string | null, options: { fatal?: boolean; defaultValue?: string | null } = {}): string | null {
  const paths = typeof xpath === "string" ? [xpath] : xpath;
  for (const path of paths) {
    const element = findXpathAttr(node, path, key);
    const value = element?.attrib[key];
    if (value !== undefined) return value;
  }
  if ("defaultValue" in options) return options.defaultValue ?? null;
  if (options.fatal) throw new ExtractorError(`Could not find XML attribute ${name ?? `${paths[0]}[@${key}]`}`);
  return null;
}

export const xpath_attr = xpathAttr;

export class HTMLBreakOnClosingTagParser {
  static readonly HTMLBreakOnClosingTagException = class HTMLBreakOnClosingTagException extends Error {};

  readonly tagstack: string[] = [];

  feed(html: string): void {
    const tagPattern = /<(?<closing>\/)?(?<tag>[\w:.-]+)\b[^>]*(?<selfClosing>\/)?>/g;
    for (const match of html.matchAll(tagPattern)) {
      const tag = match.groups?.tag?.toLowerCase();
      if (!tag) {
        continue;
      }
      if (match.groups?.closing) {
        this.handleEndTag(tag);
      } else if (!match.groups?.selfClosing) {
        this.handleStartTag(tag);
      }
    }
  }

  close(): void {}

  private handleStartTag(tag: string): void {
    this.tagstack.push(tag);
  }

  private handleEndTag(tag: string): void {
    if (!this.tagstack.length) {
      throw new Error("no tags in the stack");
    }
    let matched = false;
    while (this.tagstack.length) {
      const innerTag = this.tagstack.pop();
      if (innerTag === tag) {
        matched = true;
        break;
      }
    }
    if (!matched) {
      throw new Error(`matching opening tag for closing ${tag} tag not found`);
    }
    if (!this.tagstack.length) {
      throw new HTMLBreakOnClosingTagParser.HTMLBreakOnClosingTagException();
    }
  }
}

export class HTMLAttributeParser {
  attrs: Record<string, string | null> = {};
  feed(html: string): void { this.attrs = extractAttributes(html); }
}

export class HTMLListAttrsParser {
  readonly items: Array<Record<string, string | null>> = [];
  private level = 0;

  feed(html: string): void {
    const tagPattern = /<(?<closing>\/)?(?<tag>[\w:.-]+)\b(?<attrs>[^>]*?)(?<selfClosing>\/)?>/g;
    for (const match of html.matchAll(tagPattern)) {
      const tag = match.groups?.tag?.toLowerCase();
      if (!tag) {
        continue;
      }
      if (match.groups?.closing) {
        this.level = Math.max(0, this.level - 1);
        continue;
      }
      if (tag === "li" && this.level === 0) {
        this.items.push(extractAttributes(match[0]));
      }
      if (!match.groups?.selfClosing) {
        this.level += 1;
      }
    }
  }

  close(): void {}
}

export function parseList(webpage: string): Array<Record<string, string | null>> {
  const parser = new HTMLListAttrsParser();
  parser.feed(webpage);
  parser.close();
  return parser.items;
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

export function extractTimezone(dateStr: string, defaultValue: number | null = 0): [number | null, string] {
  const numeric = /^.{8,}?(?<tz>Z|(?<sign>[+-])(?<hours>\d{2}):?(?<minutes>\d{2}))$/.exec(dateStr);
  if (numeric?.groups?.tz) {
    const tz = numeric.groups.tz;
    if (tz === "Z") {
      return [0, dateStr.slice(0, -1)];
    }
    const sign = numeric.groups.sign === "-" ? -1 : 1;
    return [
      sign * (Number(numeric.groups.hours) * 3600 + Number(numeric.groups.minutes) * 60),
      dateStr.slice(0, -tz.length).trimEnd(),
    ];
  }
  const named = /\d{1,2}:\d{1,2}(?:\.\d+)?(?<tz>\s*[A-Z]+)$/.exec(dateStr);
  const namedTimezone = named?.groups?.tz;
  const timezone = TIMEZONE_NAMES[namedTimezone?.trim() ?? ""];
  if (timezone !== undefined && namedTimezone) {
    return [timezone * 3600, dateStr.slice(0, -namedTimezone.length)];
  }
  return [defaultValue, dateStr];
}

export const extract_timezone = extractTimezone;

export function dateFormats(dayFirst = true): string[] {
  return [...(dayFirst ? DATE_FORMATS_DAY_FIRST : DATE_FORMATS_MONTH_FIRST)];
}

export const date_formats = dateFormats;

export class LockingUnsupportedError extends Error { override name = "LockingUnsupportedError"; }

class BlockingIOError extends Error { override name = "BlockingIOError"; }

type LockedFileState = { readers: number; writer: boolean };

const LOCKED_FILE_STATES = new Map<string, LockedFileState>();

export class locked_file {
  private readonly lockKey: string;
  private readonly writable: boolean;
  private closed = false;

  constructor(readonly filename: string, readonly mode = "r", readonly block = true, readonly encoding: BufferEncoding | null = "utf8") {
    if (!new Set(["r", "rb", "a", "ab", "w", "wb"]).has(mode)) {
      throw new NotImplementedError(mode);
    }
    this.lockKey = resolve(filename);
    this.writable = /[wa]/.test(mode);
    const state = LOCKED_FILE_STATES.get(this.lockKey) ?? { readers: 0, writer: false };
    if (this.writable && (state.writer || state.readers > 0)) {
      if (!block) {
        throw new BlockingIOError("File is already locked");
      }
      throw new LockingUnsupportedError("Blocking file locks are not implemented in the Bun utility layer");
    }
    if (this.writable) {
      state.writer = true;
    } else {
      state.readers += 1;
    }
    LOCKED_FILE_STATES.set(this.lockKey, state);
    if (mode.startsWith("w")) {
      writeFileSync(filename, "");
    } else if (mode.startsWith("a") && !existsSync(filename)) {
      writeFileSync(filename, "");
    }
  }

  read(): string | Uint8Array {
    if (!this.mode.includes("r")) {
      throw new Error("File is not open for reading");
    }
    return this.mode.includes("b") ? readFileSync(this.filename) : readFileSync(this.filename, { encoding: this.encoding ?? "utf8" });
  }

  write(data: string | Uint8Array): void {
    if (!this.writable) {
      throw new Error("File is not open for writing");
    }
    if (this.mode.startsWith("a")) {
      appendFileSync(this.filename, data);
    } else {
      appendFileSync(this.filename, data);
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    const state = LOCKED_FILE_STATES.get(this.lockKey);
    if (!state) {
      return;
    }
    if (this.writable) {
      state.writer = false;
    } else {
      state.readers = Math.max(0, state.readers - 1);
    }
    if (!state.writer && state.readers === 0) {
      LOCKED_FILE_STATES.delete(this.lockKey);
    }
  }

  [Symbol.dispose](): void {
    this.close();
  }
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
  private static readonly countryIpMap: Record<string, string> = {
    DE: "53.0.0.0/8",
    FR: "90.0.0.0/9",
    GB: "25.0.0.0/8",
    JP: "133.0.0.0/8",
    US: "6.0.0.0/8",
  };

  static randomIPv4(codeOrBlock: string): string | null {
    const block = codeOrBlock.length === 2 ? GeoUtils.countryIpMap[codeOrBlock.toUpperCase()] : codeOrBlock;
    if (!block) {
      return null;
    }
    const match = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(block);
    if (!match) {
      return null;
    }
    const address = match[1] ?? "";
    const prefixLength = Number(match[2]);
    if (prefixLength < 0 || prefixLength > 32) {
      return null;
    }
    const minAddress = ipv4ToInt(address);
    if (minAddress === null) {
      return null;
    }
    const hostMask = prefixLength === 32 ? 0 : 2 ** (32 - prefixLength) - 1;
    const maxAddress = minAddress | hostMask;
    const randomAddress = minAddress + Math.floor(Math.random() * (maxAddress - minAddress + 1));
    return intToIpv4(randomAddress >>> 0);
  }
}

function ipv4ToInt(address: string): number | null {
  const parts = address.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return (((parts[0] ?? 0) << 24) | ((parts[1] ?? 0) << 16) | ((parts[2] ?? 0) << 8) | (parts[3] ?? 0)) >>> 0;
}

function intToIpv4(address: number): string {
  return [
    (address >>> 24) & 0xff,
    (address >>> 16) & 0xff,
    (address >>> 8) & 0xff,
    address & 0xff,
  ].join(".");
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

export class _YDLLogger {
  constructor(
    private readonly ydl: {
      write_debug?: (message: string) => void;
      to_screen?: (message: string) => void;
      report_warning?: (message: string, once?: boolean) => void;
      report_error?: (message: string, options?: { is_error?: boolean }) => void;
      to_stdout?: (message: string) => void;
      to_stderr?: (message: string) => void;
    } | null = null,
  ) {}

  debug(message: string): void {
    this.ydl?.write_debug?.(message);
  }

  info(message: string): void {
    this.ydl?.to_screen?.(message);
  }

  warning(message: string, options: { once?: boolean } = {}): void {
    this.ydl?.report_warning?.(message, options.once);
  }

  error(message: string, options: { is_error?: boolean } = {}): void {
    this.ydl?.report_error?.(message, { is_error: options.is_error ?? true });
  }

  stdout(message: string): void {
    this.ydl?.to_stdout?.(message);
  }

  stderr(message: string): void {
    this.ydl?.to_stderr?.(message);
  }
}

export class _ProgressState {
  static readonly HIDDEN = new _ProgressState(0);
  static readonly INDETERMINATE = new _ProgressState(3);
  static readonly VISIBLE = new _ProgressState(1);
  static readonly WARNING = new _ProgressState(4);
  static readonly ERROR = new _ProgressState(2);

  private constructor(readonly value: number) {}

  static from_dict(state: Record<string, unknown>): _ProgressState {
    if (state.status === "finished") return _ProgressState.INDETERMINATE;
    if (state.status === "error") return _ProgressState.ERROR;
    return state._percent === null || state._percent === undefined
      ? _ProgressState.INDETERMINATE
      : _ProgressState.VISIBLE;
  }

  get_ansi_escape(percent: number | null = null): string {
    return `\x1B]9;4;${this.value};${Math.trunc(percent ?? 0)}\x07`;
  }
}
