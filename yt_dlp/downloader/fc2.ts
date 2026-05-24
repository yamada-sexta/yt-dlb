// Source: yt_dlp/downloader/fc2.py

import { FileDownloader, type DownloadInfo } from "./common.ts";
import { FFmpegFD } from "./external.ts";

interface WebSocketSender {
  send(message: string): void;
}

export class FC2LiveFD extends FileDownloader {
  override async realDownload(filename: string, info: DownloadInfo): Promise<boolean> {
    const ws = parseWebSocketSender(info.ws);
    let heartbeatId = 1;
    const sendHeartbeat = (): void => {
      heartbeatId += 1;
      try {
        ws.send(`{"name":"heartbeat","arguments":{},"id":${heartbeatId}}`);
      } catch (error) {
        this.toScreen(`[fc2:live] Heartbeat failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    };
    sendHeartbeat();
    const interval = setInterval(sendHeartbeat, 30_000);
    try {
      // Logic change: the Python downloader mutates protocol to live_ffmpeg for selection.
      // Here we instantiate FFmpegFD directly because ytdlb's protocol registry is still narrower.
      return await new FFmpegFD(this.ydl, this.params).download(filename, {
        ...info,
        ws: undefined,
        protocol: "live_ffmpeg",
      });
    } finally {
      clearInterval(interval);
    }
  }
}

function parseWebSocketSender(value: unknown): WebSocketSender {
  if (value && typeof value === "object" && "send" in value && typeof value.send === "function") {
    return value as WebSocketSender;
  }
  throw new Error("FC2 live downloader requires an active WebSocket sender in info.ws");
}
