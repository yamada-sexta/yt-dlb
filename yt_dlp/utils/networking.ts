// Source: yt_dlp/utils/networking.py

export class HTTPHeaderDict {
  readonly #values = new Map<string, string>();
  readonly #sensitive = new Map<string, string>();

  constructor(...sources: Array<Record<string, string> | Headers | HTTPHeaderDict | null | undefined>) {
    for (const source of sources) {
      if (source) {
        this.update(source);
      }
    }
  }

  get size(): number {
    return this.#values.size;
  }

  [Symbol.iterator](): IterableIterator<[string, string]> {
    return this.entries();
  }

  entries(): IterableIterator<[string, string]> {
    return this.#values.entries();
  }

  sensitive(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, value] of this.#values) {
      out[this.#sensitive.get(key) ?? key] = value;
    }
    return out;
  }

  has(key: string): boolean {
    return this.#values.has(normalizeHeaderKey(key));
  }

  get(key: string, defaultValue?: string): string | undefined {
    return this.#values.get(normalizeHeaderKey(key)) ?? defaultValue;
  }

  set(key: string, value: string | number | boolean | Uint8Array): void {
    const normalized = normalizeHeaderKey(key);
    this.#sensitive.set(normalized, key);
    this.#values.set(normalized, value instanceof Uint8Array ? latin1Decode(value) : String(value).trim());
  }

  delete(key: string): boolean {
    const normalized = normalizeHeaderKey(key);
    this.#sensitive.delete(normalized);
    return this.#values.delete(normalized);
  }

  pop(key: string, defaultValue?: string): string | undefined {
    const value = this.get(key, defaultValue);
    this.delete(key);
    return value;
  }

  clear(): void {
    this.#values.clear();
    this.#sensitive.clear();
  }

  copy(): HTTPHeaderDict {
    return new HTTPHeaderDict(this);
  }

  update(source: Record<string, string> | Headers | HTTPHeaderDict): void {
    if (source instanceof HTTPHeaderDict) {
      source = source.sensitive();
    }
    if (source instanceof Headers) {
      for (const [key, value] of source) {
        this.set(key, value);
      }
      return;
    }
    for (const [key, value] of Object.entries(source)) {
      this.set(key, value);
    }
  }

  toHeaders(): Headers {
    return new Headers(this.sensitive());
  }
}

export const stdHeaders = new HTTPHeaderDict({
  "User-Agent": randomUserAgent(),
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-us,en;q=0.5",
  "Sec-Fetch-Mode": "navigate",
});

export const std_headers = stdHeaders;

export function randomUserAgent(): string {
  const major = Math.floor(Math.random() * (143 - 137 + 1)) + 137;
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

export const random_user_agent = randomUserAgent;

export function cleanProxies(proxies: Record<string, string | null>, headers: HTTPHeaderDict): void {
  const requestProxy = headers.pop("Ytdl-Request-Proxy");
  if (requestProxy) {
    for (const key of Object.keys(proxies)) {
      delete proxies[key];
    }
    proxies.all = requestProxy;
  }
  for (const [key, value] of Object.entries(proxies)) {
    if (value === "__noproxy__") {
      proxies[key] = null;
      continue;
    }
    if (key !== "no" && value && !/^[a-zA-Z][\w+.-]*:\/\//.test(value)) {
      proxies[key] = `http://${value.replace(/^\/\//, "")}`;
    }
  }
}

export const clean_proxies = cleanProxies;

export function cleanHeaders(headers: HTTPHeaderDict): void {
  if (headers.has("Youtubedl-No-Compression")) {
    headers.delete("Youtubedl-No-Compression");
    headers.set("Accept-Encoding", "identity");
  }
  headers.delete("Ytdl-socks-proxy");
}

export const clean_headers = cleanHeaders;

export function removeDotSegments(path: string): string {
  const output: string[] = [];
  const segments = path.split("/");
  for (const segment of segments) {
    if (segment === ".") {
      continue;
    }
    if (segment === "..") {
      output.pop();
    } else {
      output.push(segment);
    }
  }
  if (segments[0] === "" && (output.length === 0 || output[0] !== "")) {
    output.unshift("");
  }
  if (segments.at(-1) === "." || segments.at(-1) === "..") {
    output.push("");
  }
  return output.join("/");
}

export const remove_dot_segments = removeDotSegments;

export function escapeRfc3986(value: string): string {
  return encodeURI(value).replaceAll(/[^\w%/;:@&=+$,!~*'()?#.[\]-]/g, (char) => encodeURIComponent(char));
}

export const escape_rfc3986 = escapeRfc3986;

export function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hostname = parsed.hostname ? new URL(`http://${parsed.hostname}`).hostname : parsed.hostname;
  parsed.pathname = escapeRfc3986(removeDotSegments(parsed.pathname));
  parsed.search = parsed.search ? `?${escapeRfc3986(parsed.search.slice(1))}` : "";
  parsed.hash = parsed.hash ? `#${escapeRfc3986(parsed.hash.slice(1))}` : "";
  return parsed.toString();
}

export const normalize_url = normalizeUrl;

export function selectProxy(url: string, proxies: Record<string, string | null | undefined>): string | null | undefined {
  const parsed = new URL(url);
  return proxies[parsed.protocol.replace(/:$/, "") || "http"] ?? proxies.all;
}

export const select_proxy = selectProxy;

function normalizeHeaderKey(key: string): string {
  return key.toLowerCase().replaceAll(/(^|-)([a-z])/g, (match) => match.toUpperCase());
}

function latin1Decode(value: Uint8Array): string {
  return String.fromCharCode(...value);
}
