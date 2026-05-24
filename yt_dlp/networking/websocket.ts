// Source: yt_dlp/networking/websocket.py
// Port note: uses Bun's native WebSocket instead of Python websocket libraries.

import { NotImplementedError } from "../errors.ts";
import { Request, RequestHandler } from "./common.ts";

export class WebSocketResponse {
  constructor(readonly socket: WebSocket) {}

  send(message: Uint8Array | string): void {
    this.socket.send(message);
  }

  async recv(): Promise<string | Uint8Array> {
    throw new NotImplementedError("WebSocketResponse.recv async iterator bridge");
  }
}

export abstract class WebSocketRequestHandler extends RequestHandler {
  static override readonly SUPPORTED_URL_SCHEMES = ["ws", "wss"];
}

export class BunWebSocketRH extends WebSocketRequestHandler {
  protected override async doSend(request: Request): Promise<Response> {
    throw new NotImplementedError("WebSocket request handler response adaptation");
  }
}
