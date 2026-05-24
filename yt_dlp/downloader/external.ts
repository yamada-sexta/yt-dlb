// Source: yt_dlp/downloader/external.py
// Port note: external downloader support is narrowed to a Bun.spawn ffmpeg path.

import { FileDownloader, type DownloadInfo } from "./common.ts";

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
    const exe = Bun.which("ffmpeg");
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
      tmpfilename,
    ];
    this.writeDebug(`ffmpeg command: ${[exe, ...args].join(" ")}`);
    const started = performance.now() / 1000;
    const proc = Bun.spawn([exe, ...args], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
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

export function getExternalDownloader(_externalDownloader: string): typeof FFmpegFD {
  return FFmpegFD;
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
  return "mp4";
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
