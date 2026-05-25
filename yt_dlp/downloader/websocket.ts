// Source: yt_dlp/downloader/websocket.py
// Port note: Python threads are replaced with a Bun WebSocket feeding ffmpeg stdin.

import { $ } from "bun";

import { FileDownloader, type DownloadInfo } from "./common.ts";
import { headersToFfmpegArgs, outputFormat } from "./external.ts";

export class FFmpegSinkFD extends FileDownloader {
  override async realDownload(
    filename: string,
    info: DownloadInfo,
  ): Promise<boolean> {
    const exe = Bun.which("ffmpeg");
    if (!exe) {
      throw new Error("ffmpeg is not available");
    }
    const tmpfilename = this.tempName(filename);
    const args = [
      "-hide_banner",
      "-y",
      ...headersToFfmpegArgs(info.http_headers),
      "-i",
      "pipe:0",
      "-c",
      "copy",
      "-f",
      outputFormat(filename),
      tmpfilename,
    ];
    const started = performance.now() / 1000;
    const shell = $`${[exe, ...args]}`.nothrow().quiet();
    const writer = shell.stdin.getWriter();
    const pump = this.realConnection(writer, info)
      .catch(async (error: unknown) => {
        await writer.abort(error).catch(() => undefined);
        throw error;
      })
      .finally(async () => {
        try {
          await writer.close();
        } catch {
          // ffmpeg may close stdin first when enough data has been received.
        }
      });
    const [output] = await Promise.all([shell, pump]);
    const stdout = output.stdout.toString();
    const stderr = output.stderr.toString();
    const exitCode = output.exitCode;
    if (exitCode !== 0) {
      throw new Error(
        `ffmpeg exited with code ${exitCode}${stderr ? `: ${stderr.trim()}` : ""}${stdout ? `\n${stdout.trim()}` : ""}`,
      );
    }
    await this.tryRename(tmpfilename, filename);
    const size = await this.filesizeOrZero(filename);
    await this.hookProgress(
      {
        status: "finished",
        filename,
        downloaded_bytes: size,
        total_bytes: size,
        elapsed: performance.now() / 1000 - started,
      },
      info,
    );
    return true;
  }

  async realConnection(
    _sink: WritableStreamDefaultWriter<Uint8Array>,
    _info: DownloadInfo,
  ): Promise<void> {
    throw new Error(
      "FFmpegSinkFD.realConnection must be implemented by subclasses",
    );
  }
}

export class WebSocketFragmentFD extends FFmpegSinkFD {
  override async realConnection(
    sink: WritableStreamDefaultWriter<Uint8Array>,
    info: DownloadInfo,
  ): Promise<void> {
    const ws = await openWebSocket(info.url, info.http_headers);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener("message", (event) => {
        void bytesFromMessage(event.data)
          .then(async (chunk) => {
            await sink.write(chunk);
          })
          .catch(reject);
      });
      ws.addEventListener("close", () => resolve());
      ws.addEventListener("error", () =>
        reject(new Error(`WebSocket download failed for ${info.url}`)),
      );
    });
  }
}

export async function openWebSocket(
  url: string,
  headers?: Record<string, string>,
): Promise<WebSocket> {
  const ws = new WebSocket(url, headers ? { headers } : undefined);
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve(), { once: true });
    ws.addEventListener(
      "error",
      () => reject(new Error(`WebSocket connection failed for ${url}`)),
      { once: true },
    );
  });
  return ws;
}

async function bytesFromMessage(data: unknown): Promise<Uint8Array> {
  if (typeof data === "string") {
    return new TextEncoder().encode(data);
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (data instanceof Blob) {
    return new Uint8Array(await data.arrayBuffer());
  }
  throw new Error(
    `Unsupported WebSocket message type: ${Object.prototype.toString.call(data)}`,
  );
}
