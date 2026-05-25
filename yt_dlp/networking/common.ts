// Source: yt_dlp/networking/common.py
// Port note: Request/Response are Bun/Web primitives with a small yt-dlp-compatible handler layer.

import { HTTPHeaderDict, normalizeUrl, updateUrlQuery } from "../utils/index.ts";
import { NoSupportingHandlers, RequestError, UnsupportedRequest } from "./exceptions.ts";

export const DEFAULT_TIMEOUT = 20;

export enum Features {
  ALL_PROXY = "all_proxy",
  NO_PROXY = "no_proxy",
}

export type Preference = (handler: RequestHandler, request: Request) => number;

const REQUEST_HANDLER_REGISTRY = new Map<string, RequestHandlerConstructor>();
const REQUEST_HANDLER_PREFERENCES = new Set<Preference>();

export class RequestDirector {
  readonly handlers = new Map<string, RequestHandler>();
  readonly preferences = new Set<Preference>();

  constructor(readonly logger: RequestLogger = consoleRequestLogger, readonly verbose = false) {}

  close(): void {
    for (const handler of this.handlers.values()) {
      handler.close();
    }
    this.handlers.clear();
  }

  addHandler(handler: RequestHandler): void {
    this.handlers.set(handler.rhKey, handler);
  }

  async send(request: Request): Promise<Response> {
    if (!this.handlers.size) {
      throw new RequestError("No request handlers configured");
    }
    const unexpectedErrors: Error[] = [];
    const unsupportedErrors: UnsupportedRequest[] = [];
    for (const handler of this.sortedHandlers(request)) {
      try {
        handler.validate(request);
      } catch (error) {
        if (error instanceof UnsupportedRequest) {
          unsupportedErrors.push(error);
          continue;
        }
        throw error;
      }
      try {
        return await handler.send(request);
      } catch (error) {
        if (error instanceof RequestError) {
          throw error;
        }
        unexpectedErrors.push(error instanceof Error ? error : new Error(String(error)));
      }
    }
    throw new NoSupportingHandlers(unsupportedErrors, unexpectedErrors);
  }

  private sortedHandlers(request: Request): RequestHandler[] {
    const preferences = new Map<RequestHandler, number>();
    for (const handler of this.handlers.values()) {
      const score = [...REQUEST_HANDLER_PREFERENCES, ...this.preferences]
        .reduce((total, preference) => total + preference(handler, request), 0);
      preferences.set(handler, score);
    }
    return [...this.handlers.values()].sort((left, right) => (preferences.get(right) ?? 0) - (preferences.get(left) ?? 0));
  }
}

export abstract class RequestHandler {
  static readonly SUPPORTED_URL_SCHEMES: readonly string[] | null = [];
  static readonly SUPPORTED_PROXY_SCHEMES: readonly string[] | null = [];
  static readonly SUPPORTED_FEATURES: readonly Features[] | null = [];

  readonly headers: HTTPHeaderDict;
  readonly timeout: number;
  readonly proxies: Record<string, string | null>;

  constructor(options: RequestHandlerOptions = {}) {
    this.headers = new HTTPHeaderDict(options.headers ? new Headers(options.headers) : undefined);
    this.timeout = Number(options.timeout ?? DEFAULT_TIMEOUT);
    this.proxies = options.proxies ?? {};
  }

  get rhName(): string {
    return this.constructor.name.replace(/RH$/, "");
  }

  get rhKey(): string {
    return this.rhName;
  }

  validate(request: Request): void {
    const ctor = this.constructor as typeof RequestHandler;
    const scheme = new URL(request.url).protocol.replace(/:$/, "").toLowerCase();
    if (ctor.SUPPORTED_URL_SCHEMES && !ctor.SUPPORTED_URL_SCHEMES.includes(scheme)) {
      throw new UnsupportedRequest(`Unsupported url scheme: "${scheme}"`, { handler: this });
    }
    this.checkProxies(request.proxies);
    const extensions = new Set(Object.keys(request.extensions));
    for (const supported of ["cookiejar", "timeout", "legacy_ssl", "keep_header_casing"]) {
      extensions.delete(supported);
    }
    if (extensions.size) {
      throw new UnsupportedRequest(`Unsupported extensions: ${[...extensions].join(", ")}`, { handler: this });
    }
  }

  async send(request: Request): Promise<Response> {
    this.validate(request);
    return await this.doSend(request);
  }

  close(): void {
    return;
  }

  protected mergedHeaders(request: Request): Headers {
    const headers = new Headers(this.headers.sensitive());
    for (const [key, value] of request.headers) {
      headers.set(key, value);
    }
    return headers;
  }

  protected abstract doSend(request: Request): Promise<Response>;

  private checkProxies(proxies: Record<string, string | null>): void {
    const ctor = this.constructor as typeof RequestHandler;
    for (const [key, proxy] of Object.entries({ ...this.proxies, ...proxies })) {
      if (proxy == null) {
        continue;
      }
      if (key === "no" && ctor.SUPPORTED_FEATURES && !ctor.SUPPORTED_FEATURES.includes(Features.NO_PROXY)) {
        throw new UnsupportedRequest('"no" proxy is not supported', { handler: this });
      }
      if (key === "all" && ctor.SUPPORTED_FEATURES && !ctor.SUPPORTED_FEATURES.includes(Features.ALL_PROXY)) {
        throw new UnsupportedRequest('"all" proxy is not supported', { handler: this });
      }
      const scheme = URL.canParse(proxy) ? new URL(proxy).protocol.replace(/:$/, "") : "";
      if (ctor.SUPPORTED_PROXY_SCHEMES && scheme && !ctor.SUPPORTED_PROXY_SCHEMES.includes(scheme)) {
        throw new UnsupportedRequest(`Unsupported proxy type: "${scheme}"`, { handler: this });
      }
    }
  }
}

export class Request extends globalThis.Request {
  readonly proxies: Record<string, string | null>;
  readonly extensions: Record<string, unknown>;

  constructor(input: string | URL | globalThis.Request, init: RequestInit & {
    proxies?: Record<string, string | null>;
    query?: Record<string, string | readonly string[]>;
    extensions?: Record<string, unknown>;
  } = {}) {
    const inputUrl = typeof input === "string" || input instanceof URL ? input.toString() : input.url;
    const url = normalizeUrl(inputUrl.startsWith("//") ? `http:${inputUrl}` : inputUrl);
    const finalUrl = init.query ? updateUrlQuery(url, init.query) : url;
    super(finalUrl, init);
    this.proxies = init.proxies ?? {};
    this.extensions = init.extensions ?? {};
  }

  copy(): Request {
    return new Request(this.url, {
      method: this.method,
      headers: this.headers,
      body: this.body,
      proxies: { ...this.proxies },
      extensions: { ...this.extensions },
    });
  }
}

export const Response = globalThis.Response;
export const Headers = globalThis.Headers;

export class HEADRequest extends Request {
  constructor(input: string | URL | globalThis.Request, init: RequestInit = {}) {
    super(input, { ...init, method: "HEAD" });
  }
}

export class PUTRequest extends Request {
  constructor(input: string | URL | globalThis.Request, init: RequestInit = {}) {
    super(input, { ...init, method: "PUT" });
  }
}

export class PATCHRequest extends Request {
  constructor(input: string | URL | globalThis.Request, init: RequestInit = {}) {
    super(input, { ...init, method: "PATCH" });
  }
}

export function registerRh<T extends RequestHandlerConstructor>(handler: T): T {
  REQUEST_HANDLER_REGISTRY.set(handler.name.replace(/RH$/, ""), handler);
  return handler;
}

export const register_rh = registerRh;

export function registerPreference(...handlers: RequestHandlerClass[]): (preference: Preference) => Preference {
  return (preference) => {
    const wrapped: Preference = (handler, request) => (
      !handlers.length || handlers.some((ctor) => handler instanceof ctor) ? preference(handler, request) : 0
    );
    REQUEST_HANDLER_PREFERENCES.add(wrapped);
    return wrapped;
  };
}

export const register_preference = registerPreference;

export interface RequestHandlerOptions {
  headers?: ConstructorParameters<typeof Headers>[0];
  timeout?: number | null;
  proxies?: Record<string, string | null>;
}

export interface RequestLogger {
  stdout?(message: string): void;
  error?(message: string): void;
}

export type RequestHandlerConstructor = new (options?: RequestHandlerOptions) => RequestHandler;
export type RequestHandlerClass = abstract new (options?: RequestHandlerOptions) => RequestHandler;

const consoleRequestLogger: RequestLogger = {
  stdout: (message) => console.log(message),
  error: (message) => console.error(message),
};
