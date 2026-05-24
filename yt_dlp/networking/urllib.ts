// Source: yt_dlp/networking/_urllib.py
// Port note: urllib backend is replaced by a Bun fetch request handler.

import { HTTPError, TransportError } from "./exceptions.ts";
import { Features, Request, RequestHandler } from "./common.ts";

export class UrllibRH extends RequestHandler {
  static override readonly SUPPORTED_URL_SCHEMES = ["http", "https", "file", "data"];
  static override readonly SUPPORTED_PROXY_SCHEMES = ["http", "https"];
  static override readonly SUPPORTED_FEATURES = [Features.ALL_PROXY, Features.NO_PROXY];

  protected override async doSend(request: Request): Promise<Response> {
    try {
      const timeout = Number(request.extensions.timeout ?? this.timeout) * 1000;
      const response = await fetch(request, {
        headers: this.mergedHeaders(request),
        signal: Number.isFinite(timeout) && timeout > 0 ? AbortSignal.timeout(timeout) : undefined,
      });
      if (!response.ok) {
        throw new HTTPError(response);
      }
      return response;
    } catch (error) {
      if (error instanceof HTTPError) {
        throw error;
      }
      throw new TransportError(String(error));
    }
  }
}
