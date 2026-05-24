// Source: yt_dlp/downloader/fragment.py
// Port note: fragment workers run sequentially to preserve append order; .ytdl resume state is handled with Bun files.

import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";

import { Request } from "../networking/index.ts";
import { FileDownloader, type DownloadInfo } from "./common.ts";
import { HttpFD } from "./http.ts";

export interface FragmentInfo {
  url?: string;
  path?: string;
  frag_index?: number;
  fragment_count?: number;
  http_headers?: Record<string, string>;
  request_data?: RequestInit["body"] | null;
  transformData?: (data: Uint8Array) => Uint8Array;
  duration?: number;
}

export class HttpQuietDownloader extends HttpFD {
  protected override toScreen(_message: string): void {
    return;
  }
}

export class FragmentFD extends FileDownloader {
  protected reportSkipFragment(fragIndex: number, error?: unknown): void {
    const reason = error == null ? "" : ` ${String(error)};`;
    this.toScreen(`[download]${reason} Skipping fragment ${fragIndex} ...`);
  }

  protected prepareUrl(info: DownloadInfo, url: string): Request {
    return new Request(url, { headers: info.http_headers });
  }

  protected async downloadFragments(filename: string, info: DownloadInfo, fragments: Iterable<FragmentInfo> | AsyncIterable<FragmentInfo>): Promise<boolean> {
    if (isAsyncIterable(fragments)) {
      return await this.downloadFragmentsStream(filename, info, fragments);
    }
    const tmpfilename = this.tempName(filename);
    const stateFile = this.ytdlFilename(filename);
    const list = [...fragments];
    const useYtdlFile = this.shouldUseYtdlFile(filename, info);
    const resumeState = useYtdlFile
      ? await this.readFragmentState(stateFile, list.length)
      : { fragmentIndex: 0, corrupt: false };
    let resumeLen = this.params.continuedl === false ? 0 : await this.filesizeOrZero(tmpfilename);
    let startFragmentIndex = resumeState.fragmentIndex;
    if (this.params.continuedl === false) {
      startFragmentIndex = 0;
      resumeLen = 0;
      await this.removeFile(tmpfilename);
      if (useYtdlFile) {
        await this.removeFile(stateFile);
      }
    } else if (useYtdlFile && (resumeState.corrupt || (startFragmentIndex > 0 && resumeLen === 0))) {
      // Logic change: Python warns and restarts corrupt/inconsistent fragment resumes; this Bun port does the same.
      this.ydl.reportWarning?.(`${resumeState.corrupt ? ".ytdl file is corrupt" : "Inconsistent state of incomplete fragment download"}. Restarting from the beginning ...`);
      startFragmentIndex = 0;
      resumeLen = 0;
      await this.removeFile(tmpfilename);
      await this.removeFile(stateFile);
    } else if (!useYtdlFile && resumeLen > 0) {
      // Logic change: appending without per-fragment state can duplicate media, so restart instead of guessing.
      this.ydl.reportWarning?.(`Cannot safely resume fragmented download without ${stateFile}. Restarting from the beginning ...`);
      resumeLen = 0;
      await this.removeFile(tmpfilename);
    }
    if (useYtdlFile && startFragmentIndex === 0) {
      await this.writeFragmentState(stateFile, 0, list.length);
    }
    await mkdir(dirname(tmpfilename), { recursive: true });
    const writer = resumeLen > 0
      ? createWriteStream(tmpfilename, { flags: "a" })
      : Bun.file(tmpfilename).writer({ highWaterMark: Number(this.params.buffersize ?? 64 * 1024) });
    const started = performance.now() / 1000;
    let downloaded = resumeLen;
    const remaining = list
      .slice(startFragmentIndex)
      .map((fragment, offset) => ({ fragment, index: startFragmentIndex + offset + 1 }))
      .slice(0, this.params.test ? 1 : undefined);
    try {
      const maxWorkers = Math.max(1, Number(this.params.concurrent_fragment_downloads ?? 1));
      const downloadedFragments = maxWorkers > 1 && remaining.length > 1
        ? await this.downloadFragmentItemsConcurrently(remaining, info, maxWorkers)
        : await this.downloadFragmentItemsSequentially(remaining, info);
      for (const result of downloadedFragments) {
        if (!result.data) {
          continue;
        }
        downloaded += result.data.byteLength;
        await writeChunk(writer, result.data);
        if (useYtdlFile) {
          await this.writeFragmentState(stateFile, result.index, list.length);
        }
        const now = performance.now() / 1000;
        await this.hookProgress({
          status: "downloading",
          filename,
          tmpfilename,
          downloaded_bytes: downloaded,
          total_bytes: undefined,
          elapsed: now - started,
          speed: FileDownloader.calcSpeed(started, now, downloaded) ?? undefined,
        }, info);
      }
      await endWriter(writer);
      await this.tryRename(tmpfilename, filename);
      if (useYtdlFile) {
        await this.removeFile(stateFile);
      }
      await this.hookProgress({
        status: "finished",
        filename,
        downloaded_bytes: downloaded,
        total_bytes: downloaded,
        elapsed: performance.now() / 1000 - started,
      }, info);
      return true;
    } catch (error) {
      await endWriter(writer);
      await this.hookProgress({ status: "error", filename, tmpfilename, downloaded_bytes: downloaded }, info);
      throw error;
    }
  }

  private async downloadFragmentsStream(filename: string, info: DownloadInfo, fragments: AsyncIterable<FragmentInfo>): Promise<boolean> {
    const tmpfilename = this.tempName(filename);
    await mkdir(dirname(tmpfilename), { recursive: true });
    const writer = Bun.file(tmpfilename).writer({ highWaterMark: Number(this.params.buffersize ?? 64 * 1024) });
    const started = performance.now() / 1000;
    let downloaded = 0;
    let index = 0;
    try {
      for await (const fragment of fragments) {
        index += 1;
        const item = { fragment, index };
        const result = await this.downloadFragmentItem(item, info);
        if (!result.data) {
          continue;
        }
        downloaded += result.data.byteLength;
        await writeChunk(writer, result.data);
        const now = performance.now() / 1000;
        await this.hookProgress({
          status: "downloading",
          filename,
          tmpfilename,
          downloaded_bytes: downloaded,
          elapsed: now - started,
          speed: FileDownloader.calcSpeed(started, now, downloaded) ?? undefined,
        }, info);
        if (this.params.test) {
          break;
        }
      }
      await endWriter(writer);
      await this.tryRename(tmpfilename, filename);
      await this.hookProgress({
        status: "finished",
        filename,
        downloaded_bytes: downloaded,
        total_bytes: downloaded,
        elapsed: performance.now() / 1000 - started,
      }, info);
      return true;
    } catch (error) {
      await endWriter(writer);
      await this.hookProgress({ status: "error", filename, tmpfilename, downloaded_bytes: downloaded }, info);
      throw error;
    }
  }

  private async downloadFragmentItemsSequentially(items: readonly FragmentDownloadItem[], info: DownloadInfo): Promise<DownloadedFragment[]> {
    const out: DownloadedFragment[] = [];
    for (const item of items) {
      out.push(await this.downloadFragmentItem(item, info));
    }
    return out;
  }

  private async downloadFragmentItemsConcurrently(items: readonly FragmentDownloadItem[], info: DownloadInfo, maxWorkers: number): Promise<DownloadedFragment[]> {
    const out = new Array<DownloadedFragment>(items.length);
    let cursor = 0;
    const worker = async (): Promise<void> => {
      while (cursor < items.length) {
        const position = cursor;
        cursor += 1;
        out[position] = await this.downloadFragmentItem(items[position]!, info);
      }
    };
    await Promise.all(Array.from({ length: Math.min(maxWorkers, items.length) }, () => worker()));
    return out;
  }

  private async downloadFragmentItem(item: FragmentDownloadItem, info: DownloadInfo): Promise<DownloadedFragment> {
    const url = item.fragment.url;
    if (!url) {
      throw new Error(`Fragment ${item.index} has no URL`);
    }
    try {
      return {
        index: item.index,
        data: await this.downloadFragmentWithRetries(url, info, item.fragment, item.index),
      };
    } catch (error) {
      if (this.params.skip_unavailable_fragments !== false && item.index > 1) {
        this.reportSkipFragment(item.index, error);
        return { index: item.index, data: null };
      }
      throw error;
    }
  }

  private async downloadFragmentWithRetries(url: string, info: DownloadInfo, fragment: FragmentInfo, index: number): Promise<Uint8Array> {
    const retries = Number(this.params.fragment_retries ?? 0);
    let attempt = 0;
    let lastError: unknown;
    while (attempt <= retries) {
      try {
        const response = await this.ydl.urlopen(new Request(url, {
          headers: fragment.http_headers ?? info.http_headers,
          body: fragment.request_data ?? undefined,
          method: fragment.request_data ? "POST" : "GET",
        }));
        if (!response.body) {
          throw new Error(`Fragment ${index} response has no body`);
        }
        const chunks: Uint8Array[] = [];
        for await (const chunk of response.body) {
          chunks.push(chunk);
        }
        const data = concatBytes(chunks);
        return fragment.transformData ? fragment.transformData(data) : data;
      } catch (error) {
        lastError = error;
        attempt += 1;
        if (attempt > retries) {
          break;
        }
        this.toScreen(`[download] Got error: ${error instanceof Error ? error.message : String(error)}. Retrying fragment ${index} (${attempt}/${retries}) ...`);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  private shouldUseYtdlFile(filename: string, info: DownloadInfo): boolean {
    return filename !== "-" && info.is_live !== true && this.params._no_ytdl_file !== true;
  }

  private ytdlFilename(filename: string): string {
    return `${filename}.ytdl`;
  }

  private async readFragmentState(filename: string, totalFragments: number): Promise<{ fragmentIndex: number; corrupt: boolean }> {
    if (this.params.continuedl === false || !await Bun.file(filename).exists()) {
      return { fragmentIndex: 0, corrupt: false };
    }
    try {
      const data = await Bun.file(filename).json() as FragmentStateFile;
      const index = data.downloader.current_fragment.index;
      const expectedTotal = data.downloader.fragment_count;
      if (!Number.isSafeInteger(index) || index < 0 || (expectedTotal != null && expectedTotal !== totalFragments)) {
        return { fragmentIndex: 0, corrupt: true };
      }
      return { fragmentIndex: Math.min(index, totalFragments), corrupt: false };
    } catch {
      return { fragmentIndex: 0, corrupt: true };
    }
  }

  private async writeFragmentState(filename: string, fragmentIndex: number, fragmentCount: number): Promise<void> {
    await Bun.write(filename, JSON.stringify({
      downloader: {
        current_fragment: { index: fragmentIndex },
        fragment_count: fragmentCount,
      },
    }));
  }

  private async removeFile(filename: string): Promise<void> {
    await rm(filename, { force: true });
  }
}

interface FragmentStateFile {
  downloader: {
    current_fragment: {
      index: number;
    };
    fragment_count?: number;
  };
}

interface FragmentDownloadItem {
  fragment: FragmentInfo;
  index: number;
}

interface DownloadedFragment {
  index: number;
  data: Uint8Array | null;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<FragmentInfo> {
  return Boolean(value && typeof value === "object" && Symbol.asyncIterator in value);
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

type ChunkWriter = ReturnType<typeof Bun.file> extends { writer(): infer T } ? T : never;
type NodeWriter = ReturnType<typeof createWriteStream>;

async function writeChunk(writer: ChunkWriter | NodeWriter, chunk: Uint8Array): Promise<void> {
  if ("once" in writer) {
    if (!writer.write(chunk)) {
      await new Promise<void>((resolve, reject) => {
        writer.once("drain", resolve);
        writer.once("error", reject);
      });
    }
    return;
  }
  writer.write(chunk);
}

async function endWriter(writer: ChunkWriter | NodeWriter): Promise<void> {
  if ("once" in writer) {
    await new Promise<void>((resolve, reject) => {
      writer.end(resolve);
      writer.once("error", reject);
    });
    return;
  }
  await writer.end();
}
