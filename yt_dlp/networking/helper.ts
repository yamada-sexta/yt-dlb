// Source: yt_dlp/networking/_helper.py
// Port note: TLS context construction is delegated to Bun fetch options; Python socket helpers are explicit unsupported boundaries.

import { NotImplementedError } from "../errors.ts";
import { RequestError } from "./exceptions.ts";

export function getRedirectMethod(method: string, status: number): string {
  const upper = method.toUpperCase();
  if (status === 303 && upper !== "HEAD") {
    return "GET";
  }
  if ((status === 301 || status === 302) && upper === "POST") {
    return "GET";
  }
  return upper;
}

export function addAcceptEncodingHeader(headers: Headers, supportedEncodings: Iterable<string>): void {
  if (!headers.has("Accept-Encoding")) {
    const value = [...supportedEncodings].join(", ");
    headers.set("Accept-Encoding", value || "identity");
  }
}

export function makeSslContext(): never {
  throw new NotImplementedError("Python SSL context construction; use Bun fetch TLS options instead");
}

export function makeSocksProxyOpts(): never {
  throw new NotImplementedError("Python SOCKS socket options; use Bun fetch proxy support instead");
}

export function wrapRequestErrors<T extends (...args: never[]) => unknown>(handler: object, fn: T): T {
  return ((...args: Parameters<T>): ReturnType<T> => {
    try {
      return fn(...args) as ReturnType<T>;
    } catch (error) {
      if (error instanceof RequestError && error.handler == null) {
        error.handler = handler;
      }
      throw error;
    }
  }) as T;
}
