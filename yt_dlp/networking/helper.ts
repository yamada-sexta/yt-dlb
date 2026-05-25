// Source: yt_dlp/networking/_helper.py
// Port note: TLS context construction returns Bun-compatible TLS options; Python socket helpers are explicit unsupported boundaries.

import { readFileSync } from "node:fs";

import { certifi } from "../dependencies/index.ts";
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

export interface SslContextOptions {
  verify?: boolean;
  client_certificate?: string | null;
  client_certificate_key?: string | null;
  client_certificate_password?: string | null;
  legacy_support?: boolean;
  use_certifi?: boolean;
}

export interface YtdlbSslContext {
  tls: Bun.TLSOptions & { minVersion?: "TLSv1.2" };
  verify: boolean;
  legacySupport: boolean;
  useCertifi: boolean;
  keylogFilename: string | null;
  postHandshakeAuth: boolean;
  trustSource: "certifi" | "platform";
}

export function sslLoadCerts(
  tls: Bun.TLSOptions,
  options: { use_certifi?: boolean } = {},
): "certifi" | "platform" {
  if (options.use_certifi !== false && certifi.available && "where" in certifi && typeof certifi.where === "function") {
    tls.ca = readFileSync(certifi.where());
    return "certifi";
  }
  return "platform";
}

export function makeSslContext(options: SslContextOptions = {}): YtdlbSslContext {
  const verify = options.verify ?? true;
  const tls: YtdlbSslContext["tls"] = {
    rejectUnauthorized: verify,
    ALPNProtocols: "http/1.1",
  };
  const keylogFilename = process.env.SSLKEYLOGFILE || null;

  const trustSource = verify
    ? sslLoadCerts(tls, { use_certifi: options.use_certifi ?? true })
    : "platform";

  if (options.legacy_support) {
    tls.secureOptions = (tls.secureOptions ?? 0) | 4;
    tls.ciphers = "DEFAULT";
  } else {
    tls.ciphers = "@SECLEVEL=2:ECDH+AESGCM:ECDH+CHACHA20:ECDH+AES:DHE+AES:!aNULL:!eNULL:!aDSS:!SHA1:!AESCCM";
    tls.minVersion = "TLSv1.2";
  }

  if (options.client_certificate) {
    try {
      tls.cert = readFileSync(options.client_certificate, "utf8");
      if (options.client_certificate_key) {
        tls.key = readFileSync(options.client_certificate_key, "utf8");
      }
      if (options.client_certificate_password) {
        tls.passphrase = options.client_certificate_password;
      }
    } catch (error) {
      throw new RequestError("Unable to load client certificate", {
        cause: error instanceof Error ? error : String(error),
      });
    }
  }

  return {
    tls,
    verify,
    legacySupport: Boolean(options.legacy_support),
    useCertifi: options.use_certifi ?? true,
    keylogFilename,
    postHandshakeAuth: Boolean(options.client_certificate),
    trustSource,
  };
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

export abstract class InstanceStoreMixin<TInstance = unknown> {
  readonly #instances: Array<{
    key: string;
    instance: TInstance;
  }> = [];
  readonly #identities = new WeakMap<object, number>();
  readonly #nextIdentity = { value: 0 };

  protected createInstance(_kwargs: Record<string, unknown>): TInstance {
    throw new NotImplementedError("InstanceStoreMixin.createInstance must be implemented by subclasses");
  }

  protected closeInstance(instance: TInstance): void {
    if (
      instance &&
      typeof instance === "object" &&
      "close" in instance &&
      typeof instance.close === "function"
    ) {
      (instance as { close: () => void }).close();
    }
  }

  _getInstance(kwargs: Record<string, unknown> = {}): TInstance {
    const key = stableInstanceKey(kwargs, this.#identities, this.#nextIdentity);
    const cached = this.#instances.find((entry) => entry.key === key);
    if (cached) {
      return cached.instance;
    }
    const instance = this.createInstance(kwargs);
    this.#instances.push({ key, instance });
    return instance;
  }

  _get_instance(kwargs: Record<string, unknown> = {}): TInstance {
    return this._getInstance(kwargs);
  }

  _clearInstances(): void {
    for (const { instance } of this.#instances) {
      this.closeInstance(instance);
    }
    this.#instances.splice(0);
  }

  _clear_instances(): void {
    this._clearInstances();
  }
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

function stableInstanceKey(
  value: unknown,
  identities = new WeakMap<object, number>(),
  nextIdentity = { value: 0 },
): string {
  const type = typeof value;
  if (value === null || type !== "object") {
    return `${type}:${String(value)}`;
  }
  const object = value as object;
  if (Array.isArray(value)) {
    return `array:[${value.map((item) => stableInstanceKey(item, identities, nextIdentity)).join(",")}]`;
  }
  if (value instanceof Set) {
    return `set:{${[...value].map((item) => stableInstanceKey(item, identities, nextIdentity)).sort().join(",")}}`;
  }
  if (value instanceof Map) {
    return `map:{${[...value].map(([key, item]) => `${stableInstanceKey(key, identities, nextIdentity)}=>${stableInstanceKey(item, identities, nextIdentity)}`).sort().join(",")}}`;
  }
  if (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null) {
    return `object:{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableInstanceKey(item, identities, nextIdentity)}`)
      .join(",")}}`;
  }
  let identity = identities.get(object);
  if (identity === undefined) {
    identity = nextIdentity.value;
    nextIdentity.value += 1;
    identities.set(object, identity);
  }
  return `identity:${identity}`;
}
