// Source: yt_dlp/downloader/niconico.py
// Port note: the daemon thread is replaced with an async WebSocket task while ffmpeg downloads HLS.

import { FileDownloader, type DownloadInfo } from "./common.ts";
import { FFmpegFD } from "./external.ts";
import { openWebSocket } from "./websocket.ts";

interface NiconicoOptions {
  max_quality: string;
  ws_url: string;
  ws?: WebSocket;
}

interface ClosableWebSocket {
  close(): void;
}

export class NiconicoLiveFD extends FileDownloader {
  override async realDownload(filename: string, info: DownloadInfo): Promise<boolean> {
    const videoId = typeof info.id === "string" ? info.id : "unknown";
    const options = parseNiconicoOptions(info.downloader_options);
    let stopped = false;
    const activeWs: { current: ClosableWebSocket | null } = { current: null };
    const controlTask = (async (): Promise<void> => {
      let reconnect = false;
      while (!stopped) {
        try {
          const done = await this.communicateWs(options, reconnect, (ws) => {
            activeWs.current = ws;
          });
          if (done) {
            return;
          }
        } catch (error) {
          this.toScreen(`[niconico:live] ${videoId}: Connection error occurred, reconnecting after 10 seconds: ${error instanceof Error ? error.message : String(error)}`);
          await sleep(10_000);
        } finally {
          reconnect = true;
        }
      }
    })();
    try {
      return await new FFmpegFD(this.ydl, this.params).download(filename, {
        ...info,
        protocol: "m3u8",
      });
    } finally {
      stopped = true;
      if (activeWs.current) {
        activeWs.current.close();
      }
      await controlTask.catch((error: unknown) => {
        this.writeDebug(`Niconico control WebSocket stopped with error: ${error instanceof Error ? error.message : String(error)}`);
      });
    }
  }

  private async communicateWs(options: NiconicoOptions, reconnect: boolean, setActive: (ws: WebSocket) => void): Promise<boolean> {
    const ws = reconnect || !options.ws
      ? await openWebSocket(options.ws_url, { Origin: "https://live.nicovideo.jp" })
      : options.ws;
    setActive(ws);
    if (reconnect || !options.ws) {
      this.writeDebug("Sending startWatching request");
      ws.send(JSON.stringify({
        data: {
          reconnect: true,
          room: {
            commentable: true,
            protocol: "webSocket",
          },
          stream: {
            accessRightMethod: "single_cookie",
            chasePlay: false,
            latency: "high",
            protocol: "hls",
            quality: options.max_quality,
          },
        },
        type: "startWatching",
      }));
    }
    while (true) {
      const message = await nextWebSocketText(ws);
      if (!message) {
        continue;
      }
      const data = parseJsonObject(message);
      if (!data) {
        continue;
      }
      if (data.type === "ping") {
        ws.send('{"type":"pong"}');
        ws.send('{"type":"keepSeat"}');
      } else if (data.type === "disconnect") {
        this.writeDebug(message);
        return true;
      } else if (data.type === "error") {
        this.writeDebug(message);
        const body = data.body;
        const code = body && typeof body === "object" && "code" in body ? body.code : message;
        throw new Error(typeof code === "string" ? code : message);
      } else {
        this.writeDebug(`Server response: ${truncate(message, 100)}`);
      }
    }
  }
}

function parseNiconicoOptions(value: unknown): NiconicoOptions {
  if (!value || typeof value !== "object") {
    throw new Error("Niconico live downloader options are missing");
  }
  const data = value as Record<string, unknown>;
  if (typeof data.max_quality !== "string" || typeof data.ws_url !== "string") {
    throw new Error("Niconico live downloader options are invalid");
  }
  return {
    max_quality: data.max_quality,
    ws_url: data.ws_url,
    ws: data.ws instanceof WebSocket ? data.ws : undefined,
  };
}

async function nextWebSocketText(ws: WebSocket): Promise<string | null> {
  return await new Promise((resolve, reject) => {
    ws.addEventListener("message", async (event) => {
      try {
        resolve(await messageToText(event.data));
      } catch (error) {
        reject(error);
      }
    }, { once: true });
    ws.addEventListener("close", () => resolve(null), { once: true });
    ws.addEventListener("error", () => reject(new Error("Niconico WebSocket failed")), { once: true });
  });
}

async function messageToText(data: unknown): Promise<string> {
  if (typeof data === "string") {
    return data;
  }
  if (data instanceof Uint8Array) {
    return new TextDecoder().decode(data);
  }
  if (data instanceof ArrayBuffer) {
    return new TextDecoder().decode(data);
  }
  if (data instanceof Blob) {
    return await data.text();
  }
  throw new Error(`Unsupported WebSocket message type: ${Object.prototype.toString.call(data)}`);
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, length - 3)}...`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
