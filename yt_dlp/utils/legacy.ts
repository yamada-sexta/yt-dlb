// Source: yt_dlp/utils/_legacy.py
// Port note: Python urllib/subprocess compatibility adapters are explicit unsupported boundaries in Bun.

import { inflateSync } from "node:zlib";

import { NotImplementedError } from "../errors.ts";
import { Indirect } from "../globals.ts";
import { Request as YtdlbRequest } from "../networking/common.ts";
import { loadPlugins as loadPluginSpec } from "../plugins.ts";
import {
  escapeRfc3986,
  normalizeUrl as escapeUrl,
  randomUserAgent,
  stdHeaders,
} from "./networking.ts";
import { traverseObj } from "./traversal.ts";

export {
  escapeRfc3986,
  escapeUrl,
  escapeUrl as escape_url,
  randomUserAgent,
  stdHeaders,
};

export const hasCertifi = false;
export const has_certifi = hasCertifi;
export const hasWebsockets = typeof WebSocket !== "undefined";
export const has_websockets = hasWebsockets;

export async function loadPlugins(
  name: string,
  suffix: string,
  namespace: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const destination = new Indirect<Record<string, unknown>>({});
  const pluginDestination = new Indirect<Record<string, unknown>>({});
  const plugins = await loadPluginSpec({
    moduleName: name,
    suffix,
    destination,
    pluginDestination,
  });
  Object.assign(namespace, plugins);
  return plugins;
}

export const load_plugins = loadPlugins;

export function traverseDict(
  source: unknown,
  keys: unknown,
  casesense = true,
): unknown {
  return traverseObj(source, keys as Parameters<typeof traverseObj>[1], {
    casesense,
    is_user_input: true,
    traverse_string: true,
  });
}

export const traverse_dict = traverseDict;

export function decodeBase(value: string, digits: string): number {
  let result = 0;
  for (const char of value) {
    const digit = digits.indexOf(char);
    if (digit < 0) {
      throw new Error(
        `Invalid digit ${JSON.stringify(char)} for base ${digits.length}`,
      );
    }
    result = result * digits.length + digit;
  }
  return result;
}

export const decode_base = decodeBase;

export function platformName(): string {
  return `${process.platform}-${process.arch}`;
}

export const platform_name = platformName;

export function getSubprocessEncoding(): BufferEncoding {
  return "utf8";
}

export const get_subprocess_encoding = getSubprocessEncoding;

interface PngChunk {
  type: string;
  data: Uint8Array;
}

export function decodePng(
  pngData: Uint8Array | Buffer,
): [number, number, number[][]] {
  const data = Buffer.from(pngData);
  if (
    data.length < 33 ||
    !data
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    throw new Error("Not a valid PNG file.");
  }

  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    offset += 4;
    const type = data.subarray(offset, offset + 4).toString("ascii");
    offset += 4;
    const chunkData = data.subarray(offset, offset + length);
    offset += length + 4;
    chunks.push({ type, data: chunkData });
    if (type === "IEND") {
      break;
    }
  }

  const ihdr = chunks.find((chunk) => chunk.type === "IHDR")?.data;
  if (!ihdr) {
    throw new Error("Not a valid PNG file.");
  }
  const width = Buffer.from(ihdr).readUInt32BE(0);
  const height = Buffer.from(ihdr).readUInt32BE(4);
  const colorType = ihdr[9];
  if (colorType !== 2) {
    throw new NotImplementedError(`legacy PNG decode color type ${colorType}`);
  }

  const idatParts = chunks
    .filter((chunk) => chunk.type === "IDAT")
    .map((chunk) => Buffer.from(chunk.data));
  if (!idatParts.length) {
    throw new Error("Unable to read PNG data.");
  }
  const decompressed = inflateSync(Buffer.concat(idatParts));
  const stride = width * 3;
  const pixels: number[][] = [];

  const getPixel = (flatIndex: number): number => {
    const row = Math.floor(flatIndex / stride);
    const col = flatIndex % stride;
    return pixels[row]?.[col] ?? 0;
  };

  for (let y = 0; y < height; y += 1) {
    const basePos = y * (1 + stride);
    const filterType = decompressed[basePos];
    const row: number[] = [];
    pixels.push(row);

    for (let x = 0; x < stride; x += 1) {
      let color = decompressed[basePos + 1 + x] ?? 0;
      const flatIndex = y * stride + x;
      const left = x > 2 ? getPixel(flatIndex - 3) : 0;
      const up = y > 0 ? getPixel(flatIndex - stride) : 0;
      if (filterType === 1) {
        color = (color + left) & 0xff;
      } else if (filterType === 2) {
        color = (color + up) & 0xff;
      } else if (filterType === 3) {
        color = (color + ((left + up) >> 1)) & 0xff;
      } else if (filterType === 4) {
        const upperLeft = x > 2 && y > 0 ? getPixel(flatIndex - stride - 3) : 0;
        color = (color + paethPredictor(left, up, upperLeft)) & 0xff;
      } else if (filterType !== 0) {
        throw new Error(`Unsupported PNG filter type: ${filterType}`);
      }
      row.push(color);
    }
  }

  return [width, height, pixels];
}

export const decode_png = decodePng;

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) {
    return a;
  }
  return pb <= pc ? b : c;
}

export function registerSocksProtocols(): void {}
export const register_socks_protocols = registerSocksProtocols;

export function handleYoutubedlHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  if (
    !Object.keys(headers).some(
      (key) => key.toLowerCase() === "youtubedl-no-compression",
    )
  ) {
    return headers;
  }
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (lower !== "accept-encoding" && lower !== "youtubedl-no-compression") {
      filtered[key] = value;
    }
  }
  return filtered;
}

export const handle_youtubedl_headers = handleYoutubedlHeaders;

export function requestToUrl(request: string | URL | globalThis.Request): string {
  return typeof request === "string"
    ? request
    : request instanceof URL
      ? request.toString()
      : request.url;
}

export const request_to_url = requestToUrl;

function sanitizeLegacyUrl(url: string): string {
  let result = url.trim().replace(/^httpss:\/\//, "https://").replace(/^rmtp([es]?):\/\//, "rtmp$1://");
  if (result.startsWith("//")) {
    result = `http:${result}`;
  }
  return result;
}

function extractBasicAuthForRequest(url: string): [string, string | null] {
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

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function sanitizedRequest(
  url: string,
  init: RequestInit = {},
): YtdlbRequest {
  const [cleanUrl, authorization] = extractBasicAuthForRequest(
    escapeUrl(sanitizeLegacyUrl(url)),
  );
  const headers = new Headers(init.headers);
  if (authorization !== null) {
    headers.set("Authorization", authorization);
  }
  return new YtdlbRequest(cleanUrl, { ...init, headers });
}

export const sanitized_Request = sanitizedRequest;

export class YoutubeDLHandler {
  constructor(readonly params: Record<string, unknown>, readonly options: Record<string, unknown> = {}) {}
}

export class YoutubeDLHTTPSHandler extends YoutubeDLHandler {}

export class YoutubeDLCookieProcessor {
  constructor(readonly cookiejar: unknown = null) {}
}

export function makeHTTPSHandler(
  params: Record<string, unknown>,
  options: Record<string, unknown> = {},
): YoutubeDLHTTPSHandler {
  return new YoutubeDLHTTPSHandler(params, {
    ...options,
    verify: !params.nocheckcertificate,
    client_certificate: params.client_certificate,
    client_certificate_key: params.client_certificate_key,
    client_certificate_password: params.client_certificate_password,
    legacy_support: params.legacyserverconnect,
    use_certifi: !Array.isArray(params.compat_opts) || !params.compat_opts.includes("no-certifi"),
  });
}

export const make_HTTPS_handler = makeHTTPSHandler;

export function processCommunicateOrKill(
  processLike: {
    communicate_or_kill?: (...args: unknown[]) => unknown;
    communicate?: (...args: unknown[]) => unknown;
    kill?: (...args: unknown[]) => unknown;
  },
  ...args: unknown[]
): unknown {
  if (typeof processLike.communicate_or_kill === "function") {
    return processLike.communicate_or_kill(...args);
  }
  if (typeof processLike.communicate === "function") {
    try {
      return processLike.communicate(...args);
    } catch (error) {
      processLike.kill?.();
      throw error;
    }
  }
  throw new TypeError("process object does not provide communicate");
}

export const process_communicate_or_kill = processCommunicateOrKill;

export function encodeFilename(value: string, _forSubprocess = false): string {
  return value;
}

export const encodeFilename_ = encodeFilename;

export function decodeFilename(value: string, _forSubprocess = false): string {
  return value;
}

export const decodeFilename_ = decodeFilename;

export function decodeArgument(value: string): string {
  return value;
}

export const decodeArgument_ = decodeArgument;

export function decodeOption(value: string | Uint8Array | null): string | null {
  if (value === null) {
    return value;
  }
  return value instanceof Uint8Array ? new TextDecoder().decode(value) : value;
}

export const decodeOption_ = decodeOption;

export function errorToCompatStr(error: unknown): string {
  return String(error);
}

export const error_to_compat_str = errorToCompatStr;
