// Source: yt_dlp/YoutubeDL.py
// Port note: this top-layer Bun class provides the downloader shell and direct URL fetching.
// Site-specific extraction and format selection continue in lower extractor/downloader layers.

import { basename } from "node:path";

import { Cache } from "./cache.ts";
import { extractCookiesFromBrowserForUrl, loadCookies, YoutubeDLCookieJar } from "./cookies.ts";
import { getSuitableDownloader } from "./downloader/index.ts";
import { NotImplementedError } from "./errors.ts";
import { extractYoutubeVideo, isYoutubeWatchUrl } from "./extractor/youtube/video.ts";

export interface YoutubeDLOptions {
  outtmpl?: string | Record<string, string>;
  quiet?: boolean;
  verbose?: boolean;
  simulate?: boolean;
  skipDownload?: boolean;
  cookiefile?: string;
  cookiesfrombrowser?: readonly [string, string?, string?, string?];
  http_headers?: Record<string, string>;
  proxy?: string;
  socket_timeout?: number;
  cachedir?: string | false | null;
  remote_components?: readonly string[];
  extractor_args?: Record<string, readonly string[]>;
  [key: string]: unknown;
}

export interface DirectInfo {
  id: string;
  url: string;
  title: string;
  ext: string;
  webpage_url: string;
  filename: string;
}

export class DownloadError extends Error {}
export class DownloadCancelled extends Error {}
export class YoutubeDLError extends Error {}

export class YoutubeDL {
  readonly params: YoutubeDLOptions;
  readonly cache: Cache;
  cookies = new YoutubeDLCookieJar();
  downloadRetcode = 0;
  readonly #browserCookieOriginsLoaded = new Set<string>();

  constructor(params: YoutubeDLOptions = {}) {
    this.params = params;
    this.cache = new Cache({
      params: { cachedir: params.cachedir },
      writeDebug: (message) => this.writeDebug(message),
      reportWarning: (message) => this.reportWarning(message),
      toScreen: (message) => this.toScreen(message),
    });
  }

  async init(): Promise<this> {
    this.cookies = await loadCookies(this.params.cookiefile, this.params.cookiesfrombrowser, this);
    return this;
  }

  async close(): Promise<void> {
    this.cookies.clear();
  }

  async using<T>(callback: (ydl: this) => Promise<T>): Promise<T> {
    try {
      await this.init();
      return await callback(this);
    } finally {
      await this.close();
    }
  }

  toScreen(message: string): void {
    if (!this.params.quiet) {
      console.error(message);
    }
  }

  toStdout(message: string): void {
    console.log(message);
  }

  writeDebug(message: string): void {
    if (this.params.verbose) {
      console.error(`[debug] ${message}`);
    }
  }

  reportWarning(message: string): void {
    if (!this.params.quiet) {
      console.error(`WARNING: ${message}`);
    }
  }

  reportError(message: string): void {
    this.downloadRetcode = 1;
    console.error(`ERROR: ${message}`);
  }

  async urlopen(url: string | URL | Request): Promise<Response> {
    const request = url instanceof Request ? url : new Request(url.toString());
    const headers = new Headers(request.headers);
    for (const [key, value] of Object.entries(this.params.http_headers ?? {})) {
      headers.set(key, value);
    }
    await this.ensureBrowserCookiesForUrl(request.url);
    const cookieHeader = this.cookies.getCookieHeader(request.url);
    if (cookieHeader) {
      headers.set("Cookie", cookieHeader);
    }
    const response = await fetch(request, { headers });
    if (!response.ok) {
      throw new DownloadError(`HTTP Error ${response.status}: ${response.statusText}`);
    }
    return response;
  }

  async extractInfo(url: string): Promise<DirectInfo> {
    if (isYoutubeWatchUrl(url)) {
      // Logic change: direct URL fallback downloaded the YouTube HTML page. Dispatch watch URLs to
      // a Bun-native extractor so the selected media URL is downloaded instead.
      return await extractYoutubeVideo(url, this);
    }
    const parsed = new URL(url);
    const title = decodeURIComponent(basename(parsed.pathname) || parsed.hostname);
    const ext = extensionFromPath(parsed.pathname) || "bin";
    return {
      id: createId(url),
      url,
      title,
      ext,
      webpage_url: url,
      filename: this.prepareFilename({ title, id: createId(url), ext }),
    };
  }

  prepareFilename(info: { title: string; id: string; ext: string }): string {
    const template = typeof this.params.outtmpl === "string"
      ? this.params.outtmpl
      : this.params.outtmpl?.default ?? "%(title)s-%(id)s.%(ext)s";
    return template
      .replaceAll("%(title)s", sanitizeFilename(info.title))
      .replaceAll("%(id)s", sanitizeFilename(info.id))
      .replaceAll("%(ext)s", sanitizeFilename(info.ext));
  }

  evaluateOuttmpl(template: string, info: Record<string, unknown>): string {
    return renderSimpleOuttmpl(template, info, false);
  }

  async download(urls: readonly string[]): Promise<number> {
    await this.init();
    for (const url of urls) {
      try {
        const info = await this.extractInfo(url);
        if (this.params.simulate || this.params.skipDownload) {
          this.toStdout(info.url);
          continue;
        }
        await this.downloadDirect(info);
      } catch (error) {
        this.reportError(error instanceof Error ? error.message : String(error));
      }
    }
    return this.downloadRetcode;
  }

  async downloadWithInfoFile(filename: string): Promise<number> {
    const data = await Bun.file(filename).json() as { url?: string; webpage_url?: string };
    const url = data.url ?? data.webpage_url;
    if (!url) {
      throw new DownloadError(`No URL found in ${filename}`);
    }
    return await this.download([url]);
  }

  warnIfShortId(args: readonly string[]): void {
    for (const arg of args) {
      if (/^[\w-]{10,12}$/.test(arg) && !/^https?:/.test(arg)) {
        this.reportWarning(`${arg} looks like a video id, not a URL`);
      }
    }
  }

  private async downloadDirect(info: DirectInfo): Promise<void> {
    const Downloader = getSuitableDownloader({ ...info, protocol: new URL(info.url).protocol.replace(/:$/, "") });
    const fd = new Downloader(this, this.params as Record<string, unknown>);
    const ok = await fd.download(info.filename, {
      ...info,
      http_headers: this.params.http_headers,
    });
    if (ok) {
      this.toScreen(`[download] Destination: ${info.filename}`);
    }
  }

  private async ensureBrowserCookiesForUrl(url: string): Promise<void> {
    const spec = this.params.cookiesfrombrowser;
    if (!spec) {
      return;
    }
    const origin = new URL(url).origin;
    const cacheKey = `${spec.join("\0")}\0${origin}`;
    if (this.#browserCookieOriginsLoaded.has(cacheKey)) {
      return;
    }
    this.#browserCookieOriginsLoaded.add(cacheKey);
    try {
      const jar = await extractCookiesFromBrowserForUrl(spec, url, {
        debug: (message) => this.writeDebug(message),
        info: (message) => this.writeDebug(message),
        warning: (message) => this.reportWarning(message),
        error: (message) => this.reportError(message),
      });
      for (const cookie of jar) {
        this.cookies.setCookie(cookie);
      }
    } catch (error) {
      this.reportWarning(`failed to extract browser cookies for ${origin}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function extensionFromPath(pathname: string): string | null {
  const match = /\.([A-Za-z0-9]+)$/.exec(pathname);
  return match?.[1] ?? null;
}

function createId(url: string): string {
  return Bun.hash(url).toString(36);
}

function sanitizeFilename(value: string): string {
  return value.replaceAll(/[\\/:*?"<>|]/g, "_").trim() || "_";
}

function renderSimpleOuttmpl(template: string, info: Record<string, unknown>, sanitize: boolean): string {
  const tokenPattern = /%\((?<key>[^)]+)\)(?<type>[sl])/g;
  const rendered = template.replaceAll(tokenPattern, (_match, key: string, type: string) => {
    if (!/^\w+$/.test(key)) {
      throw new NotImplementedError(`outtmpl field expression ${key}`);
    }
    const rawValue = info[key];
    const value = type === "l" && Array.isArray(rawValue)
      ? rawValue.map((item) => String(item)).join(", ")
      : String(rawValue ?? "");
    return sanitize ? sanitizeFilename(value) : value;
  });
  const unsupported = /%/.exec(template.replaceAll("%%", "").replaceAll(tokenPattern, ""));
  if (unsupported) {
    throw new NotImplementedError(`outtmpl syntax near ${unsupported[0]}`);
  }
  return rendered.replaceAll("%%", "%");
}
