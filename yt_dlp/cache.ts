// Source: yt_dlp/cache.py
// Port note: file IO uses Bun.file() and Bun.write() instead of Python open/json helpers.

import { mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import { z } from "zod";

const CacheEnvelopeSchema = z.object({
  "yt-dlp_version": z.string().optional(),
  data: z.unknown(),
});

export interface CacheHost {
  params?: {
    cachedir?: string | false | null;
  };
  writeDebug?(message: string): void;
  reportWarning?(message: string): void;
  toScreen?(message: string): void;
}

export interface CacheOptions {
  version?: string;
}

export class Cache {
  readonly #host: CacheHost;
  readonly #version: string;

  constructor(host: CacheHost = {}, options: CacheOptions = {}) {
    this.#host = host;
    this.#version = options.version ?? "ytdlb";
  }

  get enabled(): boolean {
    return this.#host.params?.cachedir !== false;
  }

  getRootDir(): string {
    const configured = this.#host.params?.cachedir;
    if (typeof configured === "string") {
      return expandPath(configured);
    }
    const cacheRoot = process.env.XDG_CACHE_HOME ?? "~/.cache";
    return expandPath(join(cacheRoot, "yt-dlb"));
  }

  getCacheFile(section: string, key: string, dtype = "json"): string {
    if (!/^[\w.-]+$/.test(section)) {
      throw new Error(`invalid section ${section}`);
    }
    if (dtype !== "json") {
      throw new Error(`unsupported cache dtype ${dtype}`);
    }
    const encodedKey = encodeURIComponent(key).replaceAll("%", ",");
    return join(this.getRootDir(), section, `${encodedKey}.${dtype}`);
  }

  async store(
    section: string,
    key: string,
    data: unknown,
    dtype = "json",
  ): Promise<void> {
    if (!this.enabled) {
      return;
    }
    const file = this.getCacheFile(section, key, dtype);
    try {
      await mkdir(dirname(file), { recursive: true });
      this.#host.writeDebug?.(`Saving ${section}.${key} to cache`);
      await Bun.write(
        file,
        JSON.stringify({ "yt-dlp_version": this.#version, data }),
      );
    } catch (error) {
      this.#host.reportWarning?.(
        `Writing cache to ${JSON.stringify(file)} failed: ${error}`,
      );
    }
  }

  async load(
    section: string,
    key: string,
    dtype = "json",
    defaultValue: unknown = null,
  ): Promise<unknown> {
    if (!this.enabled) {
      return defaultValue;
    }
    const file = this.getCacheFile(section, key, dtype);
    try {
      const cacheFile = Bun.file(file);
      this.#host.writeDebug?.(`Loading ${section}.${key} from cache`);
      const parsed = CacheEnvelopeSchema.safeParse(await cacheFile.json());
      if (!parsed.success) {
        this.#host.reportWarning?.(`Cache retrieval from ${file} failed`);
        return defaultValue;
      }
      return parsed.data.data;
    } catch {
      return defaultValue;
    }
  }

  async remove(): Promise<void> {
    if (!this.enabled) {
      this.#host.toScreen?.(
        "Cache is disabled (Did you combine --no-cache-dir and --rm-cache-dir?)",
      );
      return;
    }
    const cacheDir = this.getRootDir();
    if (!cacheDir.includes("cache") && !cacheDir.includes("tmp")) {
      throw new Error(
        `Not removing directory ${cacheDir} - this does not look like a cache dir`,
      );
    }
    this.#host.toScreen?.(`Removing cache dir ${cacheDir}.`);
    await rm(cacheDir, { recursive: true, force: true });
  }
}

function expandPath(path: string): string {
  if (path === "~") {
    return process.env.HOME ?? path;
  }
  if (path.startsWith("~/")) {
    return join(process.env.HOME ?? "~", path.slice(2));
  }
  return path;
}
