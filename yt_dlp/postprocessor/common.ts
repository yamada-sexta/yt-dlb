// Source: yt_dlp/postprocessor/common.py
// Port note: postprocessor hooks are async-capable, matching Bun subprocess/file APIs.

import { rm, utimes } from "node:fs/promises";
import { z } from "zod";

import type { DownloaderHost } from "../downloader/common.ts";
import { configurationArgs, PostProcessingError } from "../utils/utils.ts";

const StringSchema = z.string();

export interface PostProcessorInfo {
  filepath?: string;
  ext?: string;
  [key: string]: unknown;
}

export interface PostProcessorProgress {
  status: "started" | "finished" | "processing" | "error";
  info_dict?: PostProcessorInfo;
  postprocessor?: string;
  [key: string]: unknown;
}

export type PostProcessorHook = (status: PostProcessorProgress) => void | Promise<void>;

export class PostProcessor {
  protected progressHooks: PostProcessorHook[] = [];
  protected downloader: DownloaderHost | null = null;
  readonly PP_NAME: string;

  constructor(downloader: DownloaderHost | null = null) {
    this.PP_NAME = this.ppKey();
    this.addProgressHook((status) => this.reportProgress(status));
    this.setDownloader(downloader);
  }

  static ppKey(): string {
    const name = this.name.endsWith("PP") ? this.name.slice(0, -2) : this.name;
    return name.toLowerCase().startsWith("ffmpeg") ? name.slice("ffmpeg".length) : name;
  }

  ppKey(): string {
    return (this.constructor as typeof PostProcessor).ppKey();
  }

  setDownloader(downloader: DownloaderHost | null): void {
    this.downloader = downloader;
  }

  toScreen(text: string, prefix = true): void {
    this.downloader?.toScreen(`${prefix ? `[${this.PP_NAME}] ` : ""}${text}`);
  }

  reportWarning(text: string): void {
    this.downloader?.reportWarning?.(text);
  }

  reportError(text: string): void {
    this.downloader?.reportError?.(text);
  }

  writeDebug(text: string): void {
    this.downloader?.writeDebug?.(text);
  }

  getParam<T>(name: string, defaultValue: T): T {
    const value = this.downloader?.params?.[name];
    return value === undefined ? defaultValue : value as T;
  }

  async run(information: PostProcessorInfo): Promise<[string[], PostProcessorInfo]> {
    return [[], information];
  }

  async tryUtime(path: string, atime: number, mtime: number, errnote = "Cannot update utime of file"): Promise<void> {
    try {
      await utimes(path, atime, mtime);
    } catch {
      this.reportWarning(errnote);
    }
  }

  async deleteDownloadedFiles(...filesToDelete: Array<string | null | undefined>): Promise<void> {
    const filenames = filesToDelete.flatMap((item) => {
      const parsed = StringSchema.safeParse(item);
      return parsed.success ? [parsed.data] : [];
    });
    await Promise.all([...new Set(filenames)].map((filename) => rm(filename, { force: true })));
  }

  configurationArgs(exe: string, keys?: readonly string[], defaultValue: readonly string[] = []): string[] {
    return configurationArgs(this.ppKey(), this.getParam("postprocessor_args", null), exe, keys, defaultValue);
  }

  addProgressHook(hook: PostProcessorHook): void {
    this.progressHooks.push(hook);
  }

  protected async hookProgress(status: PostProcessorProgress, info: PostProcessorInfo): Promise<void> {
    const data = { ...status, info_dict: info, postprocessor: this.ppKey() };
    for (const hook of this.progressHooks) {
      await hook(data);
    }
  }

  protected reportProgress(_status: PostProcessorProgress): void {
    return;
  }
}

export class AudioConversionError extends PostProcessingError {
  override name = "AudioConversionError";
}
