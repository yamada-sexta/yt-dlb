// Source: yt_dlp/utils/_utils.py
// Port note: this is a dependency-first subset used by migrated downloader/postprocessor code.

import { spawnSync } from "node:child_process";
import { basename, extname } from "node:path";

import { NotImplementedError } from "../errors.ts";

export const NO_DEFAULT = Symbol("NO_DEFAULT");
export const IDENTITY = <T>(value: T): T => value;

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

  constructor(message: string, readonly options: { expected?: boolean; cause?: unknown; videoId?: string | null; ie?: unknown } = {}) {
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

export class PostProcessingError extends YoutubeDLError {
  override name = "PostProcessingError";
}

export class ReExtractInfo extends YoutubeDLError {
  constructor(message: string, readonly expected = false) {
    super(message);
    this.name = "ReExtractInfo";
  }
}

export class RegexNotFoundError extends ExtractorError {
  constructor(message: string) {
    super(message);
    this.name = "RegexNotFoundError";
  }
}

export class GeoRestrictedError extends ExtractorError {
  constructor(message: string, readonly countries: readonly string[] = []) {
    super(message, { expected: true });
    this.name = "GeoRestrictedError";
  }
}

export class UserNotLive extends ExtractorError {
  constructor(message = "The channel is not currently live", options: { videoId?: string | null; cause?: unknown } = {}) {
    super(message, { expected: true, videoId: options.videoId, cause: options.cause });
    this.name = "UserNotLive";
  }
}

export class UnsupportedError extends ExtractorError {
  constructor(message: string) {
    super(message, { expected: true });
    this.name = "UnsupportedError";
  }
}

export function bugReportsMessage(before = "Please report this issue on  https://github.com/yt-dlp/yt-dlp/issues?q=  , filling out the appropriate issue template. Confirm you are on the latest version using  yt-dlp -U"): string {
  return `; ${before}`;
}

export const bug_reports_message = bugReportsMessage;

export function encodeArgument(value: string | Uint8Array): string {
  return typeof value === "string" ? value : String.fromCharCode(...value);
}

export const encodeArgument_ = encodeArgument;

export function determineExt(url: string | null | undefined, defaultExt = "unknown_video"): string {
  if (!url || !url.includes(".")) {
    return defaultExt;
  }
  const guess = url.split("?")[0]!.split("#")[0]!.split(".").pop() ?? "";
  return /^[A-Za-z0-9]+$/.test(guess) ? guess : defaultExt;
}

export const determine_ext = determineExt;

export function removeStart(value: string | null | undefined, start: string): string | null | undefined {
  return value?.startsWith(start) ? value.slice(start.length) : value;
}

export const remove_start = removeStart;

export function removeEnd(value: string | null | undefined, end: string): string | null | undefined {
  return value && end && value.endsWith(end) ? value.slice(0, -end.length) : value;
}

export const remove_end = removeEnd;

export function urljoin(base: string | Uint8Array | null | undefined, path: string | Uint8Array | null | undefined): string | null {
  const decodedPath = path instanceof Uint8Array ? new TextDecoder().decode(path) : path;
  if (!decodedPath) {
    return null;
  }
  if (/^(?:[a-zA-Z][a-zA-Z0-9+-.]*:)?\/\//.test(decodedPath)) {
    return decodedPath;
  }
  const decodedBase = base instanceof Uint8Array ? new TextDecoder().decode(base) : base;
  if (!decodedBase || !/^(?:https?:)?\/\//.test(decodedBase)) {
    return null;
  }
  return new URL(decodedPath, decodedBase).toString();
}

export function urlOrNone(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  if (value.startsWith("//")) {
    return `http:${value}`;
  }
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}

export const url_or_none = urlOrNone;

export function updateUrl(
  url: string,
  options: {
    query_update?: URLSearchParams | Record<string, string | number | boolean | readonly (string | number | boolean)[] | null | undefined> | null;
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
    parsed.protocol = `${(options.scheme ?? options.protocol)!.replace(/:$/, "")}:`;
  }
  if (options.hostname) {
    parsed.hostname = options.hostname;
  }
  if (options.host) {
    parsed.host = options.host;
  }
  if (options.pathname || options.path) {
    parsed.pathname = options.pathname ?? options.path!;
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

export function updateUrlQuery(url: string, query: URLSearchParams | Record<string, string | number | boolean | readonly (string | number | boolean)[] | null | undefined>): string {
  const parsed = new URL(url);
  applyQueryUpdate(parsed, query);
  return parsed.toString();
}

export const update_url_query = updateUrlQuery;

export function parseQs(url: string): Record<string, string[]> {
  const query = URL.canParse(url) ? new URL(url).search : url.includes("?") ? url.slice(url.indexOf("?")) : url;
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const out: Record<string, string[]> = {};
  for (const [key, value] of params) {
    out[key] = [...(out[key] ?? []), value];
  }
  return out;
}

export const parse_qs = parseQs;

export function urlencodePostdata(data: Record<string, string | number | boolean | null | undefined> | Iterable<readonly [string, string | number | boolean | null | undefined]>): URLSearchParams {
  const params = new URLSearchParams();
  const entries = Symbol.iterator in Object(data)
    ? data as Iterable<readonly [string, string | number | boolean | null | undefined]>
    : Object.entries(data as Record<string, string | number | boolean | null | undefined>);
  for (const [key, value] of entries) {
    if (value !== null && value !== undefined) {
      params.append(key, String(value));
    }
  }
  return params;
}

export const urlencode_postdata = urlencodePostdata;

export function parseM3u8Attributes(attributes: string): Record<string, string> {
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

export function intOrNone(value: unknown, scale = 1, defaultValue: number | null = null, invscale = 1, base?: number): number | null {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value), base);
  return Number.isFinite(parsed) ? Math.trunc(parsed * invscale / scale) : defaultValue;
}

export const int_or_none = intOrNone;

export function parseAgeLimit(value: unknown): number {
  if (value === null || value === undefined) {
    return 0;
  }
  const text = String(value).trim().toLowerCase();
  if (!text || /^(?:all|everyone|general|u|g|pg)$/i.test(text)) {
    return 0;
  }
  return intOrNone(text) ?? 0;
}

export const parse_age_limit = parseAgeLimit;

export function floatOrNone(value: unknown, scale = 1, defaultValue: number | null = null, invscale = 1): number | null {
  if (value === null || value === undefined || value === "") {
    return defaultValue;
  }
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed * invscale / scale : defaultValue;
}

export const float_or_none = floatOrNone;

export function strOrNone(value: unknown, defaultValue: string | null = null): string | null {
  return value === null || value === undefined ? defaultValue : String(value);
}

export const str_or_none = strOrNone;

export function stripOrNone(value: unknown, defaultValue: string | null = null): string | null {
  if (value === null || value === undefined) {
    return defaultValue;
  }
  const stripped = String(value).trim();
  return stripped || defaultValue;
}

export const strip_or_none = stripOrNone;

export function tryGet<T>(source: unknown, getter: ((value: unknown) => T) | Array<(value: unknown) => T>, expectedType?: (value: unknown) => value is T): T | null {
  const getters = Array.isArray(getter) ? getter : [getter];
  for (const item of getters) {
    try {
      const value = item(source);
      if (!expectedType || expectedType(value)) {
        return value;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export const try_get = tryGet;

export function tryCall<T>(...funcsAndOptions: Array<(() => T) | { expected_type?: (value: unknown) => value is T; args?: unknown[]; kwargs?: Record<string, unknown> }>): T | null {
  const maybeOptions = funcsAndOptions.at(-1);
  const options = typeof maybeOptions === "object" && maybeOptions !== null && !("call" in maybeOptions)
    ? funcsAndOptions.pop() as { expected_type?: (value: unknown) => value is T; args?: unknown[]; kwargs?: Record<string, unknown> }
    : {};
  for (const func of funcsAndOptions as Array<() => T>) {
    try {
      const value = func();
      if (!options.expected_type || options.expected_type(value)) {
        return value;
      }
    } catch {
      continue;
    }
  }
  return null;
}

export const try_call = tryCall;

export function getFirst<T>(obj: unknown, keys: readonly unknown[], expectedType?: (value: unknown) => value is T): T | null {
  for (const key of keys) {
    const value = Array.isArray(obj)
      ? obj[Number(key)]
      : obj && typeof obj === "object" ? (obj as Record<string, unknown>)[String(key)] : undefined;
    if (value !== null && value !== undefined && (!expectedType || expectedType(value))) {
      return value as T;
    }
  }
  return null;
}

export const get_first = getFirst;

export function filterDict<T>(record: Record<string, T>, predicate: (key: string, value: T) => boolean = (_key, value) => value !== null && value !== undefined): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([key, value]) => predicate(key, value)));
}

export const filter_dict = filterDict;

export function mergeDicts<T extends Record<string, unknown>>(...dicts: Array<T | null | undefined>): Record<string, unknown> {
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

export function joinNonempty(...valuesAndOptions: Array<unknown | { delim?: string; from_dict?: Record<string, unknown> }>): string {
  const maybeOptions = valuesAndOptions.at(-1);
  const hasOptions = Boolean(maybeOptions && typeof maybeOptions === "object" && !Array.isArray(maybeOptions));
  const options = hasOptions ? valuesAndOptions.pop() as { delim?: string; from_dict?: Record<string, unknown> } : {};
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
  return Array.isArray(value) ? [...value] as T[] : [value as T];
}

export function formatSeconds(seconds: number, delim = ":", msec = false): string {
  const totalMs = Math.trunc(seconds * 1000);
  const milliseconds = totalMs % 1000;
  const totalSeconds = Math.trunc(totalMs / 1000);
  const secs = totalSeconds % 60;
  const minutes = Math.trunc(totalSeconds / 60) % 60;
  const hours = Math.trunc(totalSeconds / 3600);
  const text = hours ? `${hours}${delim}${pad2(minutes)}${delim}${pad2(secs)}` : minutes ? `${minutes}${delim}${pad2(secs)}` : String(secs);
  return msec ? `${text}.${milliseconds.toString().padStart(3, "0")}` : text;
}

export const formatSeconds_ = formatSeconds;

export function srtSubtitlesTimecode(seconds: number): string {
  return formatSeconds(seconds, ":", true).replace(".", ",").padStart(12, "0");
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
    .on("br", { element: () => { text += "\n"; } })
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

export function getElementByClass(className: string, html: string): string | null {
  return getElementText(`[class~="${cssString(className)}"]`, html);
}

export const get_element_by_class = getElementByClass;

export function getElementByAttribute(attribute: string, value: string, html: string): string | null {
  return getElementText(`[${attribute}="${cssString(value)}"]`, html);
}

export const get_element_by_attribute = getElementByAttribute;

export function extractAttributes(htmlElement: string): Record<string, string | null> {
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
          attrs[name] = assignedAttributes.has(name) ? unescapeHTML(rawValue) : null;
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
  return matched ? unescapeHTML(normalizeHtmlText(text))?.trim() ?? null : null;
}

function normalizeHtmlText(text: string): string {
  return text
    .replaceAll(/[^\S\n]+/g, " ")
    .replaceAll(/ *\n+ */g, "\n")
    .replaceAll(/\n{2,}/g, "\n");
}

function cssString(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
}

function scanAssignedAttributes(htmlElement: string): Set<string> {
  const assigned = new Set<string>();
  let index = 0;
  while (index < htmlElement.length && htmlElement[index] !== "<") {
    index += 1;
  }
  index += 1;
  while (index < htmlElement.length && !isHtmlSpace(htmlElement[index]) && htmlElement[index] !== ">" && htmlElement[index] !== "/") {
    index += 1;
  }
  while (index < htmlElement.length) {
    while (index < htmlElement.length && isHtmlSpace(htmlElement[index])) {
      index += 1;
    }
    if (htmlElement[index] === ">" || htmlElement[index] === "/" || index >= htmlElement.length) {
      break;
    }
    const nameStart = index;
    while (index < htmlElement.length && !isHtmlSpace(htmlElement[index]) && htmlElement[index] !== "=" && htmlElement[index] !== ">" && htmlElement[index] !== "/") {
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
    if (quote === "\"" || quote === "'") {
      index += 1;
      while (index < htmlElement.length && htmlElement[index] !== quote) {
        index += 1;
      }
      index += 1;
    } else {
      while (index < htmlElement.length && !isHtmlSpace(htmlElement[index]) && htmlElement[index] !== ">") {
        index += 1;
      }
    }
  }
  return assigned;
}

function isHtmlSpace(char: string | undefined): boolean {
  return char === " " || char === "\n" || char === "\r" || char === "\t" || char === "\f";
}

export const extract_attributes = extractAttributes;

export function cleanPodcastUrl(url: string): string {
  const trackingPrefix = /(?:(?:(?:chtbl\.com\/track|media\.blubrry\.com|play\.podtrac\.com|chrt\.fm\/track|mgln\.ai\/e)(?:\/[^/.]+)?|(?:dts|www)\.podtrac\.com\/(?:pts\/)?redirect\.[0-9a-z]{3,4}|flex\.acast\.com|pd(?:cn\.co|st\.fm)\/e|[0-9]\.gum\.fm|pscrb\.fm\/rss\/p)\/)/g;
  return url.replace(trackingPrefix, "").replace(/^(\w+):\/\/(\w+:\/\/)/, "$2");
}

export const clean_podcast_url = cleanPodcastUrl;

export function parseIso8601(dateStr: string | null | undefined, delimiter = "T"): number | null {
  if (!dateStr) {
    return null;
  }
  const normalized = dateStr.replace(/\.[0-9]+/, "").replace(delimiter, "T");
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? Math.trunc(timestamp / 1000) : null;
}

export const parse_iso8601 = parseIso8601;

export function unifiedTimestamp(dateStr: unknown, _dayFirst = true, tzOffset = 0): number | null {
  if (typeof dateStr !== "string") {
    return null;
  }
  // Logic note: Bun uses the platform Date parser after normalizing common feed date text.
  const normalized = dateStr
    .replaceAll(/[,|]/g, " ")
    .replaceAll(/\b(?:mon|tues?|wed(?:nes)?|thu(?:rs)?|fri|sat(?:ur)?|sun)(?:day)?\b/gi, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
  const timestamp = Date.parse(normalized);
  if (Number.isFinite(timestamp)) {
    return Math.trunc(timestamp / 1000);
  }
  const withoutZone = normalized.replace(/\s+[A-Z]+$/, "");
  const fallback = Date.parse(withoutZone);
  return Number.isFinite(fallback) ? Math.trunc(fallback / 1000) - tzOffset * 3600 : null;
}

export const unified_timestamp = unifiedTimestamp;

export function datetimeFromStr(dateStr: string, precision: "auto" | "microsecond" | "second" | "minute" | "hour" | "day" = "auto"): Date | null {
  const now = new Date();
  let date: Date;
  if (dateStr === "now" || dateStr === "today") {
    date = now;
  } else if (dateStr === "yesterday") {
    date = new Date(now.getTime() - 86_400_000);
  } else {
    const relative = /^(?<start>.+)(?<sign>[+-])(?<time>\d+)(?<unit>microsecond|second|minute|hour|day|week|month|year)s?$/.exec(dateStr);
    if (relative?.groups?.start && relative.groups.time && relative.groups.unit) {
      const start = datetimeFromStr(relative.groups.start, precision);
      if (!start) {
        return null;
      }
      const sign = relative.groups.sign === "-" ? -1 : 1;
      const amount = Number(relative.groups.time) * sign;
      date = addDateUnit(start, relative.groups.unit, amount);
    } else {
      const compact = /^(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})$/.exec(dateStr);
      const timestamp = compact?.groups
        ? Date.UTC(Number(compact.groups.year), Number(compact.groups.month) - 1, Number(compact.groups.day))
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

export function strftimeOrNone(timestamp: number | string | Date | null | undefined, dateFormat = "%Y%m%d", defaultValue: string | null = null): string | null {
  if (timestamp === null || timestamp === undefined) {
    return defaultValue;
  }
  const date = timestamp instanceof Date
    ? timestamp
    : typeof timestamp === "number" ? new Date(timestamp * 1000)
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
  return Object.entries(replacements).reduce((out, [key, value]) => out.replaceAll(key, value), dateFormat);
}

export const strftime_or_none = strftimeOrNone;

export function unifiedStrdate(dateStr: string | null | undefined): string | null {
  if (!dateStr) {
    return null;
  }
  const parsed = Date.parse(dateStr.replaceAll(",", " "));
  if (Number.isFinite(parsed)) {
    return new Date(parsed).toISOString().slice(0, 10).replaceAll("-", "");
  }
  const match = /(?<year>\d{4})[-/.](?<month>\d{1,2})[-/.](?<day>\d{1,2})/.exec(dateStr)
    ?? /(?<day>\d{1,2})[-/.](?<month>\d{1,2})[-/.](?<year>\d{4})/.exec(dateStr);
  const year = match?.groups?.year;
  const month = match?.groups?.month;
  const day = match?.groups?.day;
  return year && month && day ? `${year}${month.padStart(2, "0")}${day.padStart(2, "0")}` : null;
}

export const unified_strdate = unifiedStrdate;

export function qualities(qualityIds: readonly string[]): (qualityId: string | null | undefined) => number {
  const map = new Map(qualityIds.map((qualityId, index) => [qualityId, index]));
  return (qualityId) => qualityId ? map.get(qualityId) ?? -1 : -1;
}

export function strToInt(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value.replaceAll(/[,.]/g, ""), 10);
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
  const unitMatch = /^(?<number>[\d,.]+)\s*(?<unit>kk|KK|[kKmMbB])(?:\b|$)/.exec(text);
  if (unitMatch?.groups?.number && unitMatch.groups.unit) {
    const number = Number(unitMatch.groups.number.replaceAll(",", ""));
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
    return Math.trunc(number * multipliers[unitMatch.groups.unit]!);
  }
  const leading = /^([\d,.]+)(?:$|\s)/.exec(text);
  return leading ? strToInt(leading[1]) : null;
}

export const parse_count = parseCount;

export function parseDuration(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const isoMatch = /^(?:P(?:(?<days>\d+(?:\.\d+)?)D)?(?:T(?:(?<hours>\d+(?:\.\d+)?)H)?(?:(?<minutes>\d+(?:\.\d+)?)M)?(?:(?<seconds>\d+(?:\.\d+)?)S)?)?)$/i.exec(value);
  if (isoMatch?.[0] && Object.values(isoMatch.groups ?? {}).some((part) => part !== undefined)) {
    return (Number(isoMatch.groups?.days ?? 0) * 86400)
      + (Number(isoMatch.groups?.hours ?? 0) * 3600)
      + (Number(isoMatch.groups?.minutes ?? 0) * 60)
      + Number(isoMatch.groups?.seconds ?? 0);
  }
  const colonParts = value.split(":").map((part) => Number.parseFloat(part));
  if (colonParts.length > 1 && colonParts.every(Number.isFinite)) {
    return colonParts.reduce((total, part) => total * 60 + part, 0);
  }
  const unitMatch = /(?:(?<hours>\d+(?:\.\d+)?)\s*h(?:ours?)?)?\s*(?:(?<minutes>\d+(?:\.\d+)?)\s*m(?:in(?:utes?)?)?)?\s*(?:(?<seconds>\d+(?:\.\d+)?)\s*s(?:ec(?:onds?)?)?)?/i.exec(value);
  if (unitMatch?.[0]?.trim()) {
    return (Number(unitMatch.groups?.hours ?? 0) * 3600)
      + (Number(unitMatch.groups?.minutes ?? 0) * 60)
      + Number(unitMatch.groups?.seconds ?? 0);
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
  const number = match?.groups?.number ? Number.parseFloat(match.groups.number.replaceAll(",", "")) : Number.NaN;
  if (!Number.isFinite(number)) {
    return null;
  }
  const unit = match?.groups?.unit ?? "B";
  const multiplier = FILESIZE_UNITS[unit] ?? null;
  return multiplier ? Math.round(number * multiplier) : null;
}

export const parse_filesize = parseFilesize;

export function parseResolution(value: string | null | undefined): { width?: number; height?: number } {
  if (!value) {
    return {};
  }
  const explicit = /(?<width>\d{2,5})\s*[xX]\s*(?<height>\d{2,5})/.exec(value);
  if (explicit?.groups?.width && explicit.groups.height) {
    return { width: Number(explicit.groups.width), height: Number(explicit.groups.height) };
  }
  const height = /(?<height>\d{3,4})p\b/i.exec(value)?.groups?.height;
  return height ? { height: Number(height) } : {};
}

export const parse_resolution = parseResolution;

export function truncateString(value: string | null | undefined, left: number, right = 0): string | null | undefined {
  if (value == null || value.length <= left + right) {
    return value;
  }
  return `${value.slice(0, left - 3)}...${right ? value.slice(-right) : ""}`;
}

export const truncate_string = truncateString;

export function checkExecutable(exe: string, args: readonly string[] = []): string | false {
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

export function cliOption(params: Record<string, unknown>, commandOption: string, param: string, separator?: string): string[] {
  const value = params[param];
  if (value === null || value === undefined) {
    return [];
  }
  return separator === undefined ? [commandOption, String(value)] : [`${commandOption}${separator}${value}`];
}

export const cli_option = cliOption;

export function cliBoolOption(params: Record<string, unknown>, commandOption: string, param: string, trueValue = "true", falseValue = "false", separator?: string): string[] {
  const value = params[param];
  return value === undefined || value === null ? [] : cliOption({ true: trueValue, false: falseValue }, commandOption, String(Boolean(value)), separator);
}

export const cli_bool_option = cliBoolOption;

export function cliValuelessOption(params: Record<string, unknown>, commandOption: string, param: string, expectedValue: unknown = true): string[] {
  return params[param] === expectedValue ? [commandOption] : [];
}

export const cli_valueless_option = cliValuelessOption;

export function configurationArgs(mainKey: string, argdict: unknown, exe: string, keys: readonly string[] = [""], defaultValue: readonly string[] = []): string[] {
  if (Array.isArray(argdict)) {
    return argdict.map(String);
  }
  if (!argdict || typeof argdict !== "object") {
    return [...defaultValue];
  }
  const args = argdict as Record<string, string[] | string | undefined>;
  const rootKey = mainKey.toLowerCase() === exe.toLowerCase() ? exe.toLowerCase() : `${mainKey.toLowerCase()}+${exe.toLowerCase()}`;
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
  constructor(readonly retries: number | null | undefined, readonly errorCallback: (error: unknown, count: number, retries: number) => void = () => undefined) {}

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
  return args.map((arg) => /^[\w./:=+-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`).join(" ");
}

export const shell_quote = shellQuote;

export function detectExeVersion(output: string | null | undefined): string | false {
  const match = /(?:version|v)\s*(?<version>\d+(?:\.\d+)+)/i.exec(output ?? "");
  return match?.groups?.version ?? false;
}

export const detect_exe_version = detectExeVersion;

export function getExeVersionOutput(exe: string | false | undefined, args: readonly string[] = ["--version"]): string | null {
  if (!exe) {
    return null;
  }
  const result = spawnSync(exe, [...args], { encoding: "utf8" });
  return result.error ? null : `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

export const _get_exe_version_output = getExeVersionOutput;

export function isOutdatedVersion(version: string | null | false | undefined, minimum: string, defaultValue = false): boolean {
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

export function replaceExtension(filename: string, extension: string): string {
  const current = extname(filename);
  return current ? `${filename.slice(0, -current.length)}.${extension}` : `${filename}.${extension}`;
}

export const replace_extension = replaceExtension;

export function prependExtension(filename: string, extension: string): string {
  const current = extname(filename);
  return current ? `${filename.slice(0, -current.length)}.${extension}${current}` : `${filename}.${extension}`;
}

export const prepend_extension = prependExtension;

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

export function mimetype2ext(mimeType: string | null | undefined, defaultValue = "unknown_video"): string {
  return mimeType?.split(";")[0]?.split("/").pop() ?? defaultValue;
}

export function parseCodecs(codecs: string | null | undefined): { acodec?: string; vcodec?: string } {
  const out: { acodec?: string; vcodec?: string } = {};
  for (const codec of codecs?.split(",").map((item) => item.trim()).filter(Boolean) ?? []) {
    const normalized = codec.toLowerCase();
    if (/^(?:avc|hvc|hev|vp0?[89]|av01|theora|dvh|dvav|dva1)/.test(normalized)) {
      out.vcodec ??= codec;
    } else if (/^(?:mp4a|ac-?3|ec-?3|opus|vorbis|flac|alac|aac|dts|mp3)/.test(normalized)) {
      out.acodec ??= codec;
    }
  }
  return out;
}

export const parse_codecs = parseCodecs;

export function filesizeFromTbr(tbr: number | null | undefined, duration: number | null | undefined): number | null {
  return tbr == null || duration == null ? null : Math.trunc(duration * tbr * (1000 / 8));
}

export const filesize_from_tbr = filesizeFromTbr;

export function parseDfxpTimeExpr(timeExpr: string | null | undefined): number | null {
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
  return 3600 * Number(clock[1]) + 60 * Number(clock[2]) + Number(clock[3]?.replace(":", "."));
}

export function dfxp2srt(dfxpData: Uint8Array | string): string {
  const decoder = new TextDecoder();
  const xml = (typeof dfxpData === "string" ? dfxpData : decoder.decode(dfxpData))
    .replaceAll("encoding='UTF-16'", "encoding='UTF-8'")
    .replaceAll('encoding="UTF-16"', 'encoding="UTF-8"');
  const normalized = xml
    .replaceAll("http://www.w3.org/2004/11/ttaf1", "http://www.w3.org/ns/ttml")
    .replaceAll("http://www.w3.org/2006/04/ttaf1", "http://www.w3.org/ns/ttml")
    .replaceAll("http://www.w3.org/2006/10/ttaf1", "http://www.w3.org/ns/ttml")
    .replaceAll("http://www.w3.org/ns/ttml#style", "http://www.w3.org/ns/ttml#styling");
  const paragraphs = [...normalized.matchAll(/<(?<tag>(?:[\w-]+:)?p)\b(?<attrs>[^>]*)>(?<body>[\s\S]*?)<\/\k<tag>>/g)];
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
    const text = ttmlTextToSrt(paragraph.groups?.body ?? "");
    output.push(`${index + 1}\n${srtSubtitlesTimecode(beginTime)} --> ${srtSubtitlesTimecode(endTime)}\n${text}\n\n`);
  }
  return output.join("");
}

export const dfxp2srt_ = dfxp2srt;

function ttmlTextToSrt(body: string): string {
  if (/<(?!\/?(?:[\w-]+:)?br\b)[^>]+>/i.test(body)) {
    throw new NotImplementedError("TTML subtitle styling conversion");
  }
  return xmlUnescapeSubset(body
    .replaceAll(/<(?:(?:[\w-]+:)?br)\s*\/?>/g, "\n")
    .replaceAll(/<[^>]+>/g, ""))
    .replaceAll(/\n{3,}/g, "\n\n")
    .trim();
}

function parseXmlAttributesSubset(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const match of text.matchAll(/(?<key>[\w:-]+)\s*=\s*(?:"(?<double>[^"]*)"|'(?<single>[^']*)')/g)) {
    const key = match.groups?.key?.split(":").pop();
    if (key) {
      out[key] = xmlUnescapeSubset(match.groups?.double ?? match.groups?.single ?? "");
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
  return basename(new URL(url).pathname);
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
  const value = field && obj && typeof obj === "object" && !Array.isArray(obj)
    ? (obj as Record<string, T>)[field]
    : obj as T | null | undefined;
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
  const padded = part.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
}

export const jwt_decode_hs256 = jwtDecodeHs256;

export function makeArchiveId(ie: { IE_NAME?: string } | string, videoId: unknown): string {
  return `${typeof ie === "string" ? ie : ie.IE_NAME ?? "unknown"} ${videoId}`;
}

export const make_archive_id = makeArchiveId;

const SMUGGLE_KEY = "__youtubedl_smuggle";

export function smuggleUrl(url: string, data: Record<string, unknown>): string {
  const parsed = new URL(url);
  parsed.searchParams.set(SMUGGLE_KEY, Buffer.from(JSON.stringify(data), "utf8").toString("base64url"));
  return parsed.toString();
}

export const smuggle_url = smuggleUrl;

export function unsmuggleUrl(url: string, defaultValue: Record<string, unknown> = {}): [string, Record<string, unknown>] {
  const parsed = new URL(url);
  const encoded = parsed.searchParams.get(SMUGGLE_KEY);
  if (!encoded) {
    return [url, defaultValue];
  }
  parsed.searchParams.delete(SMUGGLE_KEY);
  try {
    return [parsed.toString(), JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, unknown>];
  } catch {
    return [parsed.toString(), defaultValue];
  }
}

export const unsmuggle_url = unsmuggleUrl;

function applyQueryUpdate(
  parsed: URL,
  query: URLSearchParams | Record<string, string | number | boolean | readonly (string | number | boolean)[] | null | undefined>,
): void {
  const entries = query instanceof URLSearchParams ? [...query.entries()] : Object.entries(query);
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

function roundDate(date: Date, precision: "microsecond" | "second" | "minute" | "hour" | "day"): Date {
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

function objectToParams(query: Record<string, string | readonly string[]>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value as readonly string[]) {
        params.append(key, item);
      }
    } else if (typeof value === "string") {
      params.set(key, value);
    }
  }
  return params;
}

function paramsToRecord(params: URLSearchParams): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, value] of params) {
    out[key] ??= [];
    out[key].push(value);
  }
  return out;
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

export function stripJsonp(code: string): string {
  const match = /^(?:window\.)?([a-zA-Z0-9_.$]*)(?:\s*&&\s*\1)?\s*\(\s*([\s\S]*)\);?\s*(?:\/\/[^\n]*)*$/.exec(code.trim());
  return match ? match[2]!.trim() : code;
}

export const strip_jsonp = stripJsonp;

export function jsToJson(code: string, vars: Record<string, string> = {}, strict = false): string {
  let processed = code.replace(/(?:new\s+)?Array\((.*?)\)/g, "[$1]");
  const PATTERN = /(?<str>'(?:\\.|[^\\'])*'|"(?:\\.|[^\\"])*"|`(?:\\.|[^\\`])*`)|(?<comment>\/\*(?:(?!\*\/)[\s\S])*\*\/|\/\/[^\n]*\n)|(?<comma>,\s*(?=[\]}]))|(?<void>\bvoid\s+0\b|\bundefined\b)|(?<ident>(?:(?<![0-9])[eE]|[a-df-zA-DF-Z_$])[.a-zA-Z_$0-9]*)|(?<hex>\b(?:0[xX][0-9a-fA-F]+|(?<!\.)0+[0-7]+)(?:\s*:)?)|(?<num>[0-9]+(?=\s*:))|(?<excl>!+)/g;
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
  return value.slice(1, -1)
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\\([\\'"`/bfnrt])/g, (_, escaped: string) => {
      switch (escaped) {
        case "b": return "\b";
        case "f": return "\f";
        case "n": return "\n";
        case "r": return "\r";
        case "t": return "\t";
        default: return escaped;
      }
    });
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
