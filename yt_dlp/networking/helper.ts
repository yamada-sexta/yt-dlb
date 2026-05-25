// Source: yt_dlp/networking/_helper.py
// Port note: TLS context construction is delegated to Bun fetch options; Python socket helpers are explicit unsupported boundaries.

import { NotImplementedError } from "../errors.ts";
import { RequestError } from "./exceptions.ts";
import { ProxyType } from "../socks.ts";

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

export function addAcceptEncodingHeader(
  headers: Headers,
  supportedEncodings: Iterable<string>,
): void {
  if (!headers.has("Accept-Encoding")) {
    const value = [...supportedEncodings].join(", ");
    headers.set("Accept-Encoding", value || "identity");
  }
}

export function makeSslContext(): never {
  throw new NotImplementedError(
    "Python SSL context construction; use Bun fetch TLS options instead",
  );
}

export function makeSocksProxyOpts(socksProxy: string): {
  proxytype: ProxyType;
  addr: string;
  port: number;
  rdns: boolean;
  username: string | null;
  password: string | null;
} {
  const match = /^(?<scheme>[^:]+):\/\//.exec(socksProxy);
  const scheme = match?.groups?.scheme;
  const proxyTypes: Record<string, [ProxyType, boolean]> = {
    socks4: [ProxyType.SOCKS4, false],
    socks4a: [ProxyType.SOCKS4A, true],
    socks5: [ProxyType.SOCKS5, false],
    socks5h: [ProxyType.SOCKS5, true],
  };
  const proxyInfo = scheme ? proxyTypes[scheme] : undefined;
  if (!scheme || !proxyInfo) {
    throw new Error(
      `Unknown SOCKS proxy version: ${scheme ?? socksProxy.split(":", 1)[0]}`,
    );
  }
  const parsed = new URL(socksProxy);
  const [proxytype, rdns] = proxyInfo;
  return {
    proxytype,
    addr: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 1080,
    rdns,
    username: parsed.username
      ? decodeURIComponent(parsed.username)
      : parsed.username === "" && socksProxy.includes("@")
        ? ""
        : null,
    password: parsed.password
      ? decodeURIComponent(parsed.password)
      : parsed.password === "" && /:[^/@]*@/.test(socksProxy)
        ? ""
        : null,
  };
}

export function wrapRequestErrors<T extends (...args: never[]) => unknown>(
  handler: object,
  fn: T,
): T {
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
