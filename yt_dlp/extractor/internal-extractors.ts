// Source: yt_dlp/extractor/_extractors.py
// Port note: Python's generated static import list is replaced with Bun Glob discovery of migrated TS extractors.

import { Glob } from "bun";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { extractors } from "../globals.ts";
import { InfoExtractor } from "./common.ts";
import type { DownloaderHost } from "../downloader/common.ts";

export type InfoExtractorConstructor = {
  new (downloader?: DownloaderHost | null): InfoExtractor;
  readonly name: string;
  readonly IE_NAME: string;
  ieKey(): string;
  suitable(url: string): boolean;
  getTempId(url: string): string | null;
};

type ExtractorModule = Record<string, unknown>;

let loaded = false;

export async function importExtractors(): Promise<Record<string, InfoExtractorConstructor>> {
  if (loaded) {
    return extractors.value as Record<string, InfoExtractorConstructor>;
  }
  const registry: Record<string, InfoExtractorConstructor> = {};
  const root = dirname(fileURLToPath(import.meta.url));
  const glob = new Glob("**/*.ts");
  for await (const file of glob.scan({ cwd: root, dot: false, onlyFiles: true })) {
    if (file === "common.ts" || file === "index.ts" || file === "internal-extractors.ts") {
      continue;
    }
    const module = await import(pathToFileURL(resolve(root, file)).href) as ExtractorModule;
    for (const value of Object.values(module)) {
      if (isInfoExtractorConstructor(value)) {
        registry[value.name] = value;
      }
    }
  }
  extractors.value = { ...registry, ...extractors.value };
  loaded = true;
  return extractors.value as Record<string, InfoExtractorConstructor>;
}

export function isInfoExtractorConstructor(value: unknown): value is InfoExtractorConstructor {
  return typeof value === "function"
    && value.prototype instanceof InfoExtractor
    && value.name.endsWith("IE");
}
