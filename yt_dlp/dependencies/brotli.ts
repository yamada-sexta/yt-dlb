// Source: yt_dlp/dependencies/__init__.py
// Port note: Bun loads the JS `brotli` package as the optional Brotli dependency.

import { createRequire } from "node:module";
import { z } from "zod";

const require = createRequire(import.meta.url);
const rawDecompress = require("brotli/decompress") as unknown;

if (typeof rawDecompress !== "function") {
  throw new TypeError("brotli/decompress did not export a decompression function");
}

export const error = Error;

export const decompress = z.function({
  input: [z.instanceof(Uint8Array), z.number().int().positive().optional()],
  output: z.instanceof(Uint8Array),
}).implement((data, outSize) => {
  const result = (rawDecompress as (input: Uint8Array, outSize?: number) => Uint8Array | readonly number[])(data, outSize);
  const bytes = result instanceof Uint8Array ? result : Uint8Array.from(result);
  const out = new Uint8Array(bytes.byteLength);
  out.set(bytes);
  return out;
});
