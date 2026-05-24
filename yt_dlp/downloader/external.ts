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
    const args = [
      "-hide_banner",
      "-nostdin",
      "-y",
      ...headersToFfmpegArgs(info.http_headers),
      "-i",
      info.url,
      "-c",
      "copy",
      "-f",
      outputFormat(filename),
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

function headersToFfmpegArgs(headers: Record<string, string> | undefined): string[] {
  if (!headers || !Object.keys(headers).length) {
    return [];
  }
  return ["-headers", Object.entries(headers).map(([key, value]) => `${key}: ${value}`).join("\r\n") + "\r\n"];
}

function outputFormat(filename: string): string {
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
