// Source: yt_dlp/downloader/common.py
// Port note: threading/retry decorators are replaced with async methods and Bun stream writes.

import { rename, stat } from "node:fs/promises";

import { NotImplementedError } from "../errors.ts";

export interface DownloadInfo {
  url: string;
  filename?: string;
  http_headers?: Record<string, string>;
  request_data?: RequestInit["body"] | null;
  protocol?: string;
  filesize?: number;
  [key: string]: unknown;
}

export interface ProgressState {
  status: "downloading" | "finished" | "error";
  filename: string;
  tmpfilename?: string;
  downloaded_bytes?: number;
  total_bytes?: number;
  elapsed?: number;
  speed?: number;
}

export interface DownloaderHost {
  params?: Record<string, unknown>;
  urlopen(url: string | URL | Request): Promise<Response>;
  toScreen(message: string): void;
  toStdout?(message: string): void;
  writeDebug?(message: string): void;
  reportWarning?(message: string): void;
  reportError?(message: string): void;
  cookies?: unknown;
}

export type ProgressHook = (state: ProgressState, info: DownloadInfo) => void | Promise<void>;

export class FileDownloader {
  static readonly TEST_FILE_SIZE = 10241;

  protected readonly progressHooks: ProgressHook[] = [];
  #lastProgressReport = 0;

  constructor(readonly ydl: DownloaderHost, readonly params: Record<string, unknown> = {}) {
    this.addProgressHook((state) => this.reportProgress(state));
  }

  get fdName(): string {
    return this.constructor.name.replace(/FD$/, "").replaceAll(/(?<=[a-z])(?=[A-Z])/g, "_").toLowerCase();
  }

  async download(filename: string, info: DownloadInfo): Promise<boolean> {
    return await this.realDownload(filename, info);
  }

  async realDownload(_filename: string, _info: DownloadInfo): Promise<boolean> {
    throw new NotImplementedError(`${this.fdName} downloader`);
  }

  addProgressHook(hook: ProgressHook): void {
    this.progressHooks.push(hook);
  }

  protected async hookProgress(state: ProgressState, info: DownloadInfo): Promise<void> {
    for (const hook of this.progressHooks) {
      await hook(state, info);
    }
  }

  protected reportProgress(state: ProgressState): void {
    if (this.params.noprogress || this.params.quiet) {
      return;
    }
    if (state.status === "finished") {
      this.toScreen(`[download] 100% of ${formatBytes(state.downloaded_bytes ?? state.total_bytes ?? 0)} in ${formatSeconds(state.elapsed)}`);
      return;
    }
    if (state.status === "downloading" && state.total_bytes && state.downloaded_bytes != null) {
      const now = performance.now() / 1000;
      const delta = Number(this.params.progress_delta ?? 0.5);
      if (now - this.#lastProgressReport < delta) {
        return;
      }
      this.#lastProgressReport = now;
      const percent = state.downloaded_bytes / state.total_bytes * 100;
      this.toScreen(`[download] ${percent.toFixed(1)}% of ${formatBytes(state.total_bytes)} at ${formatSpeed(state.speed)}`);
    }
  }

  protected toScreen(message: string): void {
    this.ydl.toScreen(message);
  }

  protected writeDebug(message: string): void {
    this.ydl.writeDebug?.(message);
  }

  tempName(filename: string): string {
    return this.params.nopart || filename === "-" ? filename : `${filename}.part`;
  }

  undoTempName(filename: string): string {
    return filename.endsWith(".part") ? filename.slice(0, -".part".length) : filename;
  }

  async filesizeOrZero(filename: string): Promise<number> {
    try {
      return (await stat(filename)).size;
    } catch {
      return 0;
    }
  }

  async tryRename(oldFilename: string, newFilename: string): Promise<void> {
    if (oldFilename !== newFilename) {
      await rename(oldFilename, newFilename);
    }
  }

  static calcPercent(byteCounter: number, dataLen: number | null | undefined): number | null {
    return dataLen == null ? null : byteCounter / dataLen * 100;
  }

  static calcSpeed(start: number, now: number, bytes: number): number | null {
    const elapsed = now - start;
    return bytes === 0 || elapsed < 0.001 ? null : bytes / elapsed;
  }

  static bestBlockSize(elapsedTime: number, bytes: number): number {
    const newMin = Math.max(bytes / 2, 1);
    const newMax = Math.min(Math.max(bytes * 2, 1), 4_194_304);
    if (elapsedTime < 0.001) {
      return Math.trunc(newMax);
    }
    const rate = bytes / elapsedTime;
    return Math.trunc(Math.max(newMin, Math.min(newMax, rate)));
  }
}

export class UnsupportedFD extends FileDownloader {
  override async realDownload(_filename: string, _info: DownloadInfo): Promise<boolean> {
    throw new NotImplementedError(`${this.fdName} downloader`);
  }
}

export function formatBytes(value: number): string {
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(unit ? 2 : 0)}${units[unit]}`;
}

function formatSpeed(speed: number | null | undefined): string {
  return speed == null ? "Unknown B/s" : `${formatBytes(speed)}/s`;
}

function formatSeconds(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) {
    return "Unknown";
  }
  const total = Math.trunc(seconds);
  const hours = Math.trunc(total / 3600);
  const minutes = Math.trunc((total % 3600) / 60);
  const secs = total % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}
