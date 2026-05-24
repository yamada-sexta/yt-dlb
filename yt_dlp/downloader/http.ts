// Source: yt_dlp/downloader/http.py
// Port note: the Python response read loop is rewritten as async Web stream iteration.

import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { FileDownloader, type DownloadInfo } from "./common.ts";

export class HttpFD extends FileDownloader {
  override async realDownload(filename: string, info: DownloadInfo): Promise<boolean> {
    const url = info.url;
    const tmpfilename = this.tempName(filename);
    const resumeLen = this.params.continuedl === false ? 0 : await this.filesizeOrZero(tmpfilename);
    const headers = new Headers(info.http_headers);
    headers.set("Accept-Encoding", "identity");
    if (resumeLen > 0) {
      headers.set("Range", `bytes=${resumeLen}-`);
      this.toScreen(`[download] Resuming download at byte ${resumeLen}`);
    }

    const response = await this.ydl.urlopen(new Request(url, {
      method: info.request_data ? "POST" : "GET",
      body: info.request_data ?? undefined,
      headers,
    }));
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    const total = contentLength ? contentLength + resumeLen : undefined;
    await mkdir(dirname(tmpfilename), { recursive: true });
    const appending = resumeLen > 0 && response.status === 206;
    const writer = appending
      ? createWriteStream(tmpfilename, { flags: "a" })
      : Bun.file(tmpfilename).writer({ highWaterMark: Number(this.params.buffersize ?? 64 * 1024) });

    const start = performance.now() / 1000;
    let downloaded = resumeLen;
    try {
      if (!response.body) {
        throw new Error("HTTP response has no body");
      }
      for await (const chunk of response.body) {
        const bytes = this.params.test ? chunk.subarray(0, Math.max(0, FileDownloader.TEST_FILE_SIZE - downloaded)) : chunk;
        if (!bytes.length) {
          break;
        }
        await writeChunk(writer, bytes);
        downloaded += bytes.byteLength;
        const now = performance.now() / 1000;
        await this.hookProgress({
          status: "downloading",
          filename,
          tmpfilename,
          downloaded_bytes: downloaded,
          total_bytes: total,
          elapsed: now - start,
          speed: FileDownloader.calcSpeed(start, now, downloaded - resumeLen) ?? undefined,
        }, info);
        if (this.params.test && downloaded >= FileDownloader.TEST_FILE_SIZE) {
          break;
        }
      }
      await endWriter(writer);
      await this.tryRename(tmpfilename, filename);
      const elapsed = performance.now() / 1000 - start;
      await this.hookProgress({
        status: "finished",
        filename,
        downloaded_bytes: downloaded,
        total_bytes: total ?? downloaded,
        elapsed,
      }, info);
      return true;
    } catch (error) {
      await endWriter(writer);
      await this.hookProgress({ status: "error", filename, tmpfilename, downloaded_bytes: downloaded, total_bytes: total }, info);
      throw error;
    }
  }
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
