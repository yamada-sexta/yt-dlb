// Source: yt_dlp/downloader/external.py
// Port note: external downloader process execution uses Bun Shell and Bun.write.

import { $ } from "bun";
import { basename, dirname, isAbsolute } from "node:path";

import { NotImplementedError } from "../errors.ts";
import { FileDownloader, type DownloadInfo, type DownloaderHost } from "./common.ts";
import { EXT_TO_OUT_FORMATS, FFmpegPostProcessor } from "../postprocessor/ffmpeg.ts";
import { cliBoolOption, cliOption, cliValuelessOption, configurationArgs } from "../utils/utils.ts";

interface CookieHost {
  cookies?: {
    getCookieHeader(url: string): string | undefined;
  };
}

type ExternalDownloaderConstructor = {
  new (ydl: DownloaderHost, params?: Record<string, unknown>): FileDownloader;
  available?(path?: string | null): boolean;
  canDownload?(info: DownloadInfo, path?: string): boolean;
};

export class ExternalFD extends FileDownloader {
  static readonly AVAILABLE_OPT: string = "--version";
  static readonly EXE_NAME: string | null = null;
  static readonly SUPPORTED_PROTOCOLS = new Set(["http", "https", "ftp", "ftps"]);

  static get basename(): string {
    return this.name.replace(/FD$/, "").toLowerCase();
  }

  static get exeName(): string {
    return this.EXE_NAME ?? this.basename;
  }

  static available(path?: string | null): boolean {
    const exe = path && path !== this.basename ? path : this.exeName;
    return Boolean(Bun.which(exe));
  }

  static supports(info: DownloadInfo): boolean {
    const protocol = typeof info.protocol === "string" ? info.protocol : new URL(info.url).protocol.replace(/:$/, "");
    return protocol.split("+").every((item) => this.SUPPORTED_PROTOCOLS.has(item));
  }

  static canDownload(info: DownloadInfo, path?: string): boolean {
    return this.available(path) && this.supports(info);
  }

  override async realDownload(filename: string, info: DownloadInfo): Promise<boolean> {
    const tmpfilename = this.tempName(filename);
    const cmd = await this.makeCmd(tmpfilename, info);
    this.writeDebug(`${this.fdName} command: ${cmd.join(" ")}`);
    const started = performance.now() / 1000;
    const { stdout, stderr, exitCode } = await runShellCommand(cmd);
    await this.cleanup(tmpfilename, info);
    if (exitCode !== 0) {
      throw new Error(`${cmd[0]} exited with code ${exitCode}${stderr ? `: ${stderr.trim()}` : ""}${stdout ? `\n${stdout.trim()}` : ""}`);
    }
    await this.tryRename(tmpfilename, filename);
    const size = await this.filesizeOrZero(filename);
    await this.hookProgress({
      status: "finished",
      filename,
      downloaded_bytes: size,
      total_bytes: size,
      elapsed: performance.now() / 1000 - started,
    }, info);
    return true;
  }

  protected async makeCmd(_tmpfilename: string, _info: DownloadInfo): Promise<string[]> {
    throw new NotImplementedError(`${this.fdName} command builder`);
  }

  protected async cleanup(_tmpfilename: string, _info: DownloadInfo): Promise<void> {
    return;
  }

  protected exe(): string {
    const ctor = this.constructor as typeof ExternalFD;
    const path = Bun.which(ctor.exeName);
    if (!path) {
      throw new Error(`${ctor.exeName} is not available`);
    }
    return path;
  }

  protected option(commandOption: string, param: string): string[] {
    return cliOption(this.params, commandOption, param);
  }

  protected boolOption(commandOption: string, param: string, trueValue = "true", falseValue = "false", separator?: string): string[] {
    return cliBoolOption(this.params, commandOption, param, trueValue, falseValue, separator);
  }

  protected valuelessOption(commandOption: string, param: string, expectedValue: unknown = true): string[] {
    return cliValuelessOption(this.params, commandOption, param, expectedValue);
  }

  protected configurationArgs(): string[] {
    const ctor = this.constructor as typeof ExternalFD;
    return configurationArgs(ctor.basename, this.params.external_downloader_args, ctor.exeName);
  }

  protected cookieHeader(url: string): string | undefined {
    return (this.ydl as CookieHost).cookies?.getCookieHeader(url);
  }
}

export class CurlFD extends ExternalFD {
  static override readonly AVAILABLE_OPT = "-V";

  protected override async makeCmd(tmpfilename: string, info: DownloadInfo): Promise<string[]> {
    const cmd = [this.exe(), "--location", "-o", tmpfilename, "--compressed"];
    const cookieHeader = this.cookieHeader(info.url);
    if (cookieHeader) {
      cmd.push("--cookie", cookieHeader);
    }
    pushHeaders(cmd, "--header", info.http_headers);
    cmd.push(...this.boolOption("--continue-at", "continuedl", "-", "0"));
    cmd.push(...this.valuelessOption("--silent", "noprogress"));
    cmd.push(...this.valuelessOption("--verbose", "verbose"));
    cmd.push(...this.option("--limit-rate", "ratelimit"));
    const retry = this.option("--retry", "retries");
    if (retry[1] === "inf" || retry[1] === "infinite") {
      retry[1] = "2147483647";
    }
    cmd.push(...retry);
    cmd.push(...this.option("--max-filesize", "max_filesize"));
    cmd.push(...this.option("--interface", "source_address"));
    cmd.push(...this.option("--proxy", "proxy"));
    cmd.push(...this.valuelessOption("--insecure", "nocheckcertificate"));
    cmd.push(...this.configurationArgs(), "--", info.url);
    return cmd;
  }
}

export class AxelFD extends ExternalFD {
  static override readonly AVAILABLE_OPT = "-V";

  protected override async makeCmd(tmpfilename: string, info: DownloadInfo): Promise<string[]> {
    const cmd = [this.exe(), "-o", tmpfilename];
    pushHeaders(cmd, "-H", info.http_headers);
    const cookieHeader = this.cookieHeader(info.url);
    if (cookieHeader) {
      cmd.push("-H", `Cookie: ${cookieHeader}`, "--max-redirect=0");
    }
    cmd.push(...this.configurationArgs(), "--", info.url);
    return cmd;
  }
}

export class WgetFD extends ExternalFD {
  protected override async makeCmd(tmpfilename: string, info: DownloadInfo): Promise<string[]> {
    const cmd = [this.exe(), "-O", tmpfilename, "-nv", "--compression=auto"];
    pushHeaders(cmd, "--header", info.http_headers);
    cmd.push(...this.option("--limit-rate", "ratelimit"));
    const retry = this.option("--tries", "retries");
    if (retry[1] === "inf" || retry[1] === "infinite") {
      retry[1] = "0";
    }
    cmd.push(...retry);
    cmd.push(...this.option("--bind-address", "source_address"));
    if (typeof this.params.proxy === "string") {
      cmd.push("--execute", `http_proxy=${this.params.proxy}`, "--execute", `https_proxy=${this.params.proxy}`);
    }
    cmd.push(...this.valuelessOption("--no-check-certificate", "nocheckcertificate"));
    cmd.push(...this.configurationArgs(), "--", info.url);
    return cmd;
  }
}

export class Aria2cFD extends ExternalFD {
  static override readonly AVAILABLE_OPT = "-v";
  static override readonly SUPPORTED_PROTOCOLS = new Set(["http", "https", "ftp", "ftps", "dash_frag_urls", "m3u8_frag_urls"]);

  static supportsManifest(manifest: string): boolean {
    return !/#EXT-X-BYTERANGE/m.test(manifest);
  }

  protected override async makeCmd(tmpfilename: string, info: DownloadInfo): Promise<string[]> {
    const cmd = [
      this.exe(),
      "-c",
      "--no-conf",
      "--console-log-level=warn",
      "--summary-interval=0",
      "--download-result=hide",
      "--http-accept-gzip=true",
      "--file-allocation=none",
      "-x16",
      "-j16",
      "-s16",
    ];
    const fragments = Array.isArray(info.fragments) ? info.fragments as Array<{ url?: string }> : null;
    if (fragments) {
      cmd.push("--allow-overwrite=true", "--allow-piece-length-change=true");
    } else {
      cmd.push("--min-split-size", "1M");
    }
    pushHeaders(cmd, "--header", info.http_headers);
    cmd.push(...this.option("--max-overall-download-limit", "ratelimit"));
    cmd.push(...this.option("--interface", "source_address"));
    cmd.push(...this.option("--all-proxy", "proxy"));
    cmd.push(...this.boolOption("--check-certificate", "nocheckcertificate", "false", "true", "="));
    cmd.push(...this.boolOption("--remote-time", "updatetime", "true", "false", "="));
    cmd.push(...this.boolOption("--show-console-readout", "noprogress", "false", "true", "="));
    cmd.push(...this.configurationArgs());
    const dn = dirname(tmpfilename);
    if (dn && dn !== ".") {
      cmd.push("--dir", `${aria2cFilename(dn)}/`);
    }
    if (!fragments) {
      cmd.push("--out", aria2cFilename(basename(tmpfilename)), "--auto-file-renaming=false", "--", info.url);
      return cmd;
    }
    const urlListFile = `${tmpfilename}.frag.urls`;
    const urlList = fragments.map((fragment, index) => {
      if (!fragment.url) {
        throw new Error(`aria2c fragment ${index + 1} has no URL`);
      }
      return `${fragment.url}\n\tout=${aria2cFilename(`${basename(tmpfilename)}-Frag${index}`)}`;
    }).join("\n");
    await Bun.write(urlListFile, urlList);
    cmd.push("--auto-file-renaming=false", "--uri-selector=inorder", "-i", aria2cFilename(urlListFile));
    return cmd;
  }

  protected override async cleanup(tmpfilename: string): Promise<void> {
    await Bun.file(`${tmpfilename}.frag.urls`).delete().catch(() => undefined);
  }
}

export class HttpieFD extends ExternalFD {
  static override readonly EXE_NAME = "http";

  protected override async makeCmd(tmpfilename: string, info: DownloadInfo): Promise<string[]> {
    const cmd = [this.exe(), "--download", "--output", tmpfilename, info.url];
    if (info.http_headers) {
      for (const [key, value] of Object.entries(info.http_headers)) {
        cmd.push(`${key}:${value}`);
      }
    }
    const cookieHeader = this.cookieHeader(info.url);
    if (cookieHeader) {
      cmd.push(`Cookie:${cookieHeader}`);
    }
    return cmd;
  }
}

export class FFmpegFD extends FileDownloader {
  static available(): boolean {
    return Boolean(Bun.which("ffmpeg"));
  }

  static canDownload(_info: DownloadInfo, _externalDownloader?: string): boolean {
    return this.available();
  }

  static canMergeFormats(_info: DownloadInfo, _params: Record<string, unknown> = {}): boolean {
    return this.available();
  }

  override async realDownload(filename: string, info: DownloadInfo): Promise<boolean> {
    const ffpp = new FFmpegPostProcessor(this.ydl);
    ffpp.checkVersion();
    const exe = ffpp.executable;
    if (!exe) {
      throw new Error("ffmpeg is not available");
    }
    const tmpfilename = this.tempName(filename);
    const selectedFormats = selectedFfmpegFormats(info);
    const args = [
      "-hide_banner",
      "-nostdin",
      "-y",
      ...inputArgs(selectedFormats, info),
      "-c",
      "copy",
      ...mapArgs(selectedFormats, info),
      ...testArgs(this.params),
      "-f",
      outputFormatForInfo(filename, info),
      FFmpegPostProcessor.ffmpegFilenameArgument(tmpfilename),
    ];
    this.writeDebug(`ffmpeg command: ${[exe, ...args].join(" ")}`);
    const started = performance.now() / 1000;
    const { stdout, stderr, exitCode } = await runShellCommand([exe, ...args]);
    if (exitCode !== 0) {
      throw new Error(`ffmpeg exited with code ${exitCode}${stderr ? `: ${stderr.trim()}` : ""}${stdout ? `\n${stdout.trim()}` : ""}`);
    }
    await this.tryRename(tmpfilename, filename);
    const size = await this.filesizeOrZero(filename);
    await this.hookProgress({
      status: "finished",
      filename,
      downloaded_bytes: size,
      total_bytes: size,
      elapsed: performance.now() / 1000 - started,
    }, info);
    return true;
  }
}

export function getExternalDownloader(_externalDownloader: string): ExternalDownloaderConstructor {
  const name = _externalDownloader.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "").toLowerCase() ?? "";
  return EXTERNAL_BY_NAME[name] ?? FFmpegFD;
}

export const get_external_downloader = getExternalDownloader;

export function headersToFfmpegArgs(headers: Record<string, string> | undefined): string[] {
  if (!headers || !Object.keys(headers).length) {
    return [];
  }
  return ["-headers", Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join("\r\n") + "\r\n"];
}

export function outputFormat(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext === "mp4" || ext === "m4a") {
    return "mp4";
  }
  if (ext === "webm") {
    return "webm";
  }
  if (ext === "mkv") {
    return "matroska";
  }
  if (ext === "ts") {
    return "mpegts";
  }
  return ext ? EXT_TO_OUT_FORMATS[ext] ?? ext : "mp4";
}

export function outputFormatForInfo(filename: string, info: DownloadInfo): string {
  const protocol = typeof info.protocol === "string" ? info.protocol : "";
  if ((protocol === "m3u8" || protocol === "m3u8_native") && (info.is_live || info.hls_use_mpegts)) {
    return "mpegts";
  }
  if (protocol === "rtmp") {
    return "flv";
  }
  return outputFormat(filename);
}

function selectedFfmpegFormats(info: DownloadInfo): DownloadInfo[] {
  return Array.isArray(info.requested_formats)
    ? info.requested_formats.filter(isDownloadInfo)
    : [info];
}

function isDownloadInfo(value: unknown): value is DownloadInfo {
  return Boolean(value && typeof value === "object" && typeof (value as Record<string, unknown>).url === "string");
}

function inputArgs(formats: readonly DownloadInfo[], info: DownloadInfo): string[] {
  const args: string[] = [];
  const sectionStart = numberOrNull(info.section_start);
  const sectionEnd = numberOrNull(info.section_end);
  for (const format of formats) {
    if (sectionStart !== null) {
      args.push("-ss", String(sectionStart));
    }
    if (sectionStart !== null && sectionEnd !== null) {
      args.push("-t", String(sectionEnd - sectionStart));
    }
    args.push(...headersToFfmpegArgs(format.http_headers ?? info.http_headers));
    args.push(...rtmpArgs(format));
    if (format.protocol === "http_dash_segments" && format.is_live) {
      args.push("-re");
    }
    args.push("-i", format.url);
  }
  return args;
}

function mapArgs(formats: readonly DownloadInfo[], info: DownloadInfo): string[] {
  if (formats.length <= 1 && info.protocol !== "http_dash_segments") {
    return [];
  }
  const args: string[] = [];
  formats.forEach((format, index) => {
    const streamNumber = typeof format.manifest_stream_number === "number" ? format.manifest_stream_number : 0;
    args.push("-map", `${index}:${streamNumber}`);
  });
  return args;
}

function testArgs(params: Record<string, unknown>): string[] {
  return params.test ? ["-fs", String(FileDownloader.TEST_FILE_SIZE)] : [];
}

function rtmpArgs(format: DownloadInfo): string[] {
  if (format.protocol !== "rtmp") {
    return [];
  }
  const args: string[] = [];
  pushOptional(args, "-rtmp_swfverify", format.player_url);
  pushOptional(args, "-rtmp_pageurl", format.page_url);
  pushOptional(args, "-rtmp_app", format.app);
  pushOptional(args, "-rtmp_playpath", format.play_path);
  pushOptional(args, "-rtmp_tcurl", format.tc_url);
  pushOptional(args, "-rtmp_flashver", format.flash_version);
  if (format.rtmp_live) {
    args.push("-rtmp_live", "live");
  }
  if (Array.isArray(format.rtmp_conn)) {
    for (const value of format.rtmp_conn) {
      pushOptional(args, "-rtmp_conn", value);
    }
  } else {
    pushOptional(args, "-rtmp_conn", format.rtmp_conn);
  }
  return args;
}

function pushOptional(args: string[], option: string, value: unknown): void {
  if (typeof value === "string") {
    args.push(option, value);
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

const EXTERNAL_BY_NAME: Record<string, ExternalDownloaderConstructor> = {
  curl: CurlFD,
  axel: AxelFD,
  wget: WgetFD,
  aria2c: Aria2cFD,
  http: HttpieFD,
  httpie: HttpieFD,
  ffmpeg: FFmpegFD,
};

function pushHeaders(cmd: string[], option: string, headers: Record<string, string> | undefined): void {
  if (!headers) {
    return;
  }
  for (const [key, value] of Object.entries(headers)) {
    cmd.push(option, `${key}: ${value}`);
  }
}

function aria2cFilename(filename: string): string {
  return isAbsolute(filename) ? filename : `./${filename}`;
}

async function runShellCommand(cmd: readonly string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const output = await $`${[...cmd]}`.nothrow().quiet();
  return {
    stdout: output.stdout.toString(),
    stderr: output.stderr.toString(),
    exitCode: output.exitCode,
  };
}
