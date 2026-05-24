// Source: yt_dlp/utils/_utils.py
// Port note: this is a dependency-first subset used by migrated downloader/postprocessor code.

import { spawnSync } from "node:child_process";
import { basename, extname } from "node:path";

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

export class UnsupportedError extends ExtractorError {
  constructor(message: string) {
    super(message, { expected: true });
    this.name = "UnsupportedError";
  }
}

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

export function updateUrlQuery(url: string, query: URLSearchParams | Record<string, string | readonly string[]>): string {
  const parsed = new URL(url);
  const params = query instanceof URLSearchParams ? query : objectToParams(query);
  for (const [key, value] of params) {
    parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

export const update_url_query = updateUrlQuery;

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

export function filterDict<T>(record: Record<string, T>, predicate: (key: string, value: T) => boolean = (_key, value) => value !== null && value !== undefined): Record<string, T> {
  return Object.fromEntries(Object.entries(record).filter(([key, value]) => predicate(key, value)));
}

export const filter_dict = filterDict;

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

export function mimetype2ext(mimeType: string | null | undefined, defaultValue = "unknown_video"): string {
  return mimeType?.split(";")[0]?.split("/").pop() ?? defaultValue;
}

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
    // Logic note: Python preserves a subset of TTML styling. This utility keeps line breaks/text
    // and strips style tags because the Bun XML shim does not preserve mixed element tails yet.
    const text = ttmlTextToSrt(paragraph.groups?.body ?? "");
    output.push(`${index + 1}\n${srtSubtitlesTimecode(beginTime)} --> ${srtSubtitlesTimecode(endTime)}\n${text}\n\n`);
  }
  return output.join("");
}

export const dfxp2srt_ = dfxp2srt;

function ttmlTextToSrt(body: string): string {
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

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}
