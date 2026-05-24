// Source: yt_dlp/downloader/fragment.py
// Port note: fragment workers may run concurrently, but appending is kept ordered; .ytdl resume state is handled with Bun files.

import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname } from "node:path";

import { aesCbcDecryptBytes, unpadPkcs7 } from "../aes.ts";
import { Request } from "../networking/index.ts";
import { FileDownloader, type DownloadInfo } from "./common.ts";
import { HttpFD } from "./http.ts";

export interface FragmentInfo {
  url?: string;
  path?: string;
  frag_index?: number;
  index?: number;
  fragment_count?: number;
  http_headers?: Record<string, string>;
  request_data?: RequestInit["body"] | null;
  transformData?: (data: Uint8Array) => Uint8Array;
  decrypt_info?: FragmentDecryptInfo;
  media_sequence?: number;
  duration?: number;
}

export interface FragmentDecryptInfo {
  METHOD?: string;
  URI?: string;
  IV?: string | Uint8Array;
  KEY?: Uint8Array;
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

  protected async decryptFragment(fragment: FragmentInfo, data: Uint8Array, info: DownloadInfo): Promise<Uint8Array> {
    if (fragment.transformData) {
      return fragment.transformData(data);
    }
    const decryptInfo = fragment.decrypt_info;
    if (!decryptInfo || decryptInfo.METHOD !== "AES-128") {
      return data;
    }
    const key = decryptInfo.KEY ?? await this.fetchFragmentKey(decryptInfo, info);
    const iv = parseFragmentIv(decryptInfo.IV) ?? sequenceIv(Number(fragment.media_sequence ?? 0));
    // Tests may intentionally truncate fragment data, which cannot be PKCS#7 unpadded.
    if (this.params.test) {
      return data;
    }
    return unpadPkcs7(aesCbcDecryptBytes(data, key, iv));
  }

  async downloadAndAppendFragmentsMultiple(
    ...downloads: Array<[FragmentDownloadContext, Iterable<FragmentInfo> | AsyncIterable<FragmentInfo>, DownloadInfo]>
  ): Promise<boolean> {
    if (downloads.length === 1) {
      const [ctx, fragments, info] = downloads[0]!;
      return await this.downloadAndAppendFragments(ctx, fragments, info);
    }
    const maxWorkers = Math.max(1, Number(this.params.concurrent_fragment_downloads ?? 1));
    let cursor = 0;
    let result = true;
    const worker = async (): Promise<void> => {
      while (cursor < downloads.length) {
        const position = cursor;
        cursor += 1;
        const [ctx, fragments, info] = downloads[position]!;
        ctx.max_progress = downloads.length;
        ctx.progress_idx = position;
        result = await this.downloadAndAppendFragments(ctx, fragments, info) && result;
      }
    };
    await Promise.all(Array.from({ length: Math.min(maxWorkers, downloads.length) }, () => worker()));
    return result;
  }

  async downloadAndAppendFragments(
    ctx: FragmentDownloadContext,
    fragments: Iterable<FragmentInfo> | AsyncIterable<FragmentInfo>,
    info: DownloadInfo,
    options: FragmentAppendOptions = {},
  ): Promise<boolean> {
    const filename = ctx.filename;
    if (!filename) {
      throw new Error("Fragment download context is missing filename");
    }
    const wrapped = wrapFragments(fragments, options.packFunc);
    const ok = await this.downloadFragments(filename, { ...info, is_live: ctx.live ?? info.is_live }, wrapped, {
      isFatal: options.isFatal,
      finishFunc: options.finishFunc,
    });
    return ok;
  }

  protected async downloadFragments(
    filename: string,
    info: DownloadInfo,
    fragments: Iterable<FragmentInfo> | AsyncIterable<FragmentInfo>,
    options: FragmentAppendOptions = {},
  ): Promise<boolean> {
    if (isAsyncIterable(fragments)) {
      return await this.downloadFragmentsStream(filename, info, fragments, options);
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
      .map((fragment, offset) => ({ fragment, index: startFragmentIndex + offset + 1, isFatal: options.isFatal }))
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
        const data = result.data;
        downloaded += data.byteLength;
        await writeChunk(writer, data);
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
      const finishData = encodeFinishData(options.finishFunc?.());
      if (finishData) {
        downloaded += finishData.byteLength;
        await writeChunk(writer, finishData);
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

  private async downloadFragmentsStream(
    filename: string,
    info: DownloadInfo,
    fragments: AsyncIterable<FragmentInfo>,
    options: FragmentAppendOptions = {},
  ): Promise<boolean> {
    const tmpfilename = this.tempName(filename);
    await mkdir(dirname(tmpfilename), { recursive: true });
    const writer = Bun.file(tmpfilename).writer({ highWaterMark: Number(this.params.buffersize ?? 64 * 1024) });
    const started = performance.now() / 1000;
    let downloaded = 0;
    let index = 0;
    try {
      for await (const fragment of fragments) {
        index += 1;
        const item = { fragment, index, isFatal: options.isFatal };
        const result = await this.downloadFragmentItem(item, info);
        if (!result.data) {
          continue;
        }
        const data = result.data;
        downloaded += data.byteLength;
        await writeChunk(writer, data);
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
      const finishData = encodeFinishData(options.finishFunc?.());
      if (finishData) {
        downloaded += finishData.byteLength;
        await writeChunk(writer, finishData);
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
        data: await this.decryptFragment(item.fragment, await this.downloadFragmentWithRetries(url, info, item.fragment, item.index), info),
      };
    } catch (error) {
      const fatal = item.isFatal?.(item.fragment.index ?? item.index - 1) ?? item.index <= 1;
      if (!fatal && this.params.skip_unavailable_fragments !== false) {
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
        return concatBytes(chunks);
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

  private async fetchFragmentKey(decryptInfo: FragmentDecryptInfo, info: DownloadInfo): Promise<Uint8Array> {
    const uri = decryptInfo.URI;
    if (!uri) {
      throw new Error("AES-128 fragment key is missing URI");
    }
    const url = new URL(uri, info.url).toString();
    const key = new Uint8Array(await (await this.ydl.urlopen(this.prepareUrl(info, url))).arrayBuffer());
    decryptInfo.KEY = key;
    return key;
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

export interface FragmentDownloadContext {
  filename?: string;
  live?: boolean | string;
  total_frags?: number | null;
  fragment_index?: number;
  max_progress?: number;
  progress_idx?: number;
  [key: string]: unknown;
}

export interface FragmentAppendOptions {
  isFatal?: (index: number) => boolean;
  packFunc?: (content: Uint8Array, index: number) => Uint8Array;
  finishFunc?: () => Uint8Array | string | null | undefined;
}

interface FragmentDownloadItem {
  fragment: FragmentInfo;
  index: number;
  isFatal?: (index: number) => boolean;
}

interface DownloadedFragment {
  index: number;
  data: Uint8Array | null;
}

function isAsyncIterable(value: unknown): value is AsyncIterable<FragmentInfo> {
  return Boolean(value && typeof value === "object" && Symbol.asyncIterator in value);
}

function wrapFragments(
  fragments: Iterable<FragmentInfo> | AsyncIterable<FragmentInfo>,
  packFunc: FragmentAppendOptions["packFunc"],
): Iterable<FragmentInfo> | AsyncIterable<FragmentInfo> {
  if (!packFunc) {
    return fragments;
  }
  const wrap = (fragment: FragmentInfo): FragmentInfo => {
    const previous = fragment.transformData;
    const fragmentIndex = fragment.frag_index ?? 0;
    return {
      ...fragment,
      transformData: (data) => packFunc(previous ? previous(data) : data, fragmentIndex),
    };
  };
  if (isAsyncIterable(fragments)) {
    return (async function* (): AsyncIterable<FragmentInfo> {
      for await (const fragment of fragments) {
        yield wrap(fragment);
      }
    })();
  }
  return Array.from(fragments, wrap);
}

function encodeFinishData(value: Uint8Array | string | null | undefined): Uint8Array | null {
  if (value == null) {
    return null;
  }
  return typeof value === "string" ? new TextEncoder().encode(value) : value;
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

function parseFragmentIv(iv: string | Uint8Array | undefined): Uint8Array | null {
  if (iv instanceof Uint8Array) {
    return iv;
  }
  if (typeof iv !== "string") {
    return null;
  }
  const hex = iv.replace(/^0x/i, "").padStart(32, "0");
  if (!/^[\da-f]+$/i.test(hex) || hex.length % 2) {
    throw new Error(`Invalid AES-128 IV: ${iv}`);
  }
  const out = new Uint8Array(hex.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

function sequenceIv(sequence: number): Uint8Array {
  const out = new Uint8Array(16);
  const view = new DataView(out.buffer);
  view.setBigUint64(8, BigInt(sequence));
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
