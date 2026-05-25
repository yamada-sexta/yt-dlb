// Source: yt_dlp/downloader/bunnycdn.py

import { createHash } from "node:crypto";
import { z } from "zod";

import { FileDownloader, type DownloadInfo } from "./common.ts";
import { HlsFD } from "./hls.ts";

interface BunnyPingData {
  url: string;
  headers?: Record<string, string>;
  secret: string;
  context_id: string;
}

const HeadersSchema = z.record(z.string(), z.string());

export class BunnyCdnFD extends FileDownloader {
  override async realDownload(
    filename: string,
    info: DownloadInfo,
  ): Promise<boolean> {
    this.toScreen("[bunnycdn] Downloading from BunnyCDN");
    const pingData = parsePingData(info._bunnycdn_ping_data);
    const stopPing = this.startPingLoop(pingData);
    try {
      return await new HlsFD(this.ydl, this.params).realDownload(
        filename,
        info,
      );
    } finally {
      stopPing();
    }
  }

  private startPingLoop(data: BunnyPingData): () => void {
    let currentTime = 0;
    const ping = async (): Promise<void> => {
      currentTime += 2;
      const time = currentTime + Math.random();
      const resolution = 1080;
      const paused = "false";
      const hash = createHash("md5")
        .update(
          `${data.secret}_${data.context_id}_${time}_${paused}_${resolution}`,
        )
        .digest("hex");
      const url = `${data.url}?hash=${hash}&time=${time}&paused=${paused}&resolution=${resolution}`;
      try {
        await this.ydl.urlopen(new Request(url, { headers: data.headers }));
      } catch (error) {
        this.toScreen(
          `[bunnycdn] Ping failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    };
    const interval = setInterval(() => void ping(), 2000);
    return () => clearInterval(interval);
  }
}

function parsePingData(value: unknown): BunnyPingData {
  if (!value || typeof value !== "object") {
    throw new Error("BunnyCDN ping data is missing");
  }
  const data = value as Record<string, unknown>;
  if (
    typeof data.url !== "string" ||
    typeof data.secret !== "string" ||
    typeof data.context_id !== "string"
  ) {
    throw new Error("BunnyCDN ping data is invalid");
  }
  return {
    url: data.url,
    secret: data.secret,
    context_id: data.context_id,
    headers: isHeaders(data.headers) ? data.headers : undefined,
  };
}

function isHeaders(value: unknown): value is Record<string, string> {
  return HeadersSchema.safeParse(value).success;
}
