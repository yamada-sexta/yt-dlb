// Source: yt_dlp/compat/_legacy.py
// Port note: legacy Python names are mapped only where Bun has a direct equivalent.

import { Buffer } from "node:buffer";
import { createConnection } from "node:net";
import { brotli as compat_brotli } from "../dependencies/index.ts";
import { compatExpanduser, compat_HTMLParseError } from "./index.ts";

export { compat_brotli };
export const compat_base64_b64decode = (value: string): Uint8Array =>
  new Uint8Array(Buffer.from(value, "base64"));
export const compat_basestring = String;
export const compat_chr = String.fromCodePoint;
export const compat_get_terminal_size = (): {
  columns: number;
  rows: number;
} => ({
  columns: process.stdout.columns ?? 80,
  rows: process.stdout.rows ?? 24,
});
export const compat_getenv = (key: string): string | undefined =>
  process.env[key];
export const compat_html_parser_HTMLParseError = compat_HTMLParseError;
export const compat_integer_types = [Number] as const;
export const compat_numeric_types = [Number] as const;
export const compat_os_path_expanduser = compatExpanduser;
export const compat_print = (...items: readonly unknown[]): void =>
  console.log(...items);
export const compat_socket_create_connection = createConnection;
export const compat_urllib_parse_quote = encodeURIComponent;
export const compat_urllib_parse_unquote = decodeURIComponent;
export const compat_zip = <T extends readonly unknown[]>(
  ...iterables: { [K in keyof T]: Iterable<T[K]> }
): T[] => {
  const iterators = iterables.map((iterable) => iterable[Symbol.iterator]());
  const out: T[] = [];
  while (true) {
    const next = iterators.map((iterator) => iterator.next());
    if (next.some((item) => item.done)) {
      return out;
    }
    out.push(next.map((item) => item.value) as unknown as T);
  }
};

export const workaround_optparse_bug9161 = (): void => {};
export const compat_str = String;
export const compat_b64decode = compat_base64_b64decode;
export const compat_urlparse = URL;
export const legacy: string[] = [];
