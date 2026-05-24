// Source: yt_dlp/downloader/fragment.py
// Port note: concurrent fragment workers and .ytdl resume state are deferred; unsupported resume cases throw.

import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

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

  protected async downloadFragments(filename: string, info: DownloadInfo, fragments: Iterable<FragmentInfo>): Promise<boolean> {
    const tmpfilename = this.tempName(filename);
    const resumeLen = this.params.continuedl === false ? 0 : await this.filesizeOrZero(tmpfilename);
    await mkdir(dirname(tmpfilename), { recursive: true });
    const writer = resumeLen > 0
      ? createWriteStream(tmpfilename, { flags: "a" })
      : Bun.file(tmpfilename).writer({ highWaterMark: Number(this.params.buffersize ?? 64 * 1024) });
    const started = performance.now() / 1000;
    let downloaded = resumeLen;
    let index = 0;
    const list = [...fragments];
    try {
      for (const fragment of list) {
        index += 1;
        const url = fragment.url;
        if (!url) {
          throw new Error(`Fragment ${index} has no URL`);
        }
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
            if (fragment.transformData) {
              chunks.push(chunk);
              continue;
            }
            downloaded += chunk.byteLength;
            await writeChunk(writer, chunk);
          }
          if (fragment.transformData) {
            const transformed = fragment.transformData(concatBytes(chunks));
            downloaded += transformed.byteLength;
            await writeChunk(writer, transformed);
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
        } catch (error) {
          if (this.params.skip_unavailable_fragments) {
            this.reportSkipFragment(index, error);
            continue;
          }
          throw error;
        }
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
