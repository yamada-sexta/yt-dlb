// Source: yt_dlp/extractor/youtube/pot/_builtin/memory_cache.py

import { BuiltinIEContentProvider } from "../internal-provider.ts";
import { potMemoryCache } from "../registry.ts";
import {
  PoTokenCacheProvider,
  registerPreference,
  registerProvider,
} from "../cache.ts";
import type { IEContentProviderHost, IEContentProviderLogger } from "../internal-provider.ts";

type CacheValue = [value: string, expiresAt: number];

interface MemoryCacheState {
  cache: Map<string, CacheValue>;
  maxSize: number;
}

export function initializeGlobalCache(maxSize: number): MemoryCacheState {
  const existing = potMemoryCache.get("cache");
  if (!existing) {
    const state: MemoryCacheState = { cache: new Map(), maxSize };
    potMemoryCache.set("cache", state);
    return state;
  }
  const state = existing as MemoryCacheState;
  if (state.maxSize !== maxSize) {
    throw new Error("Cannot change max_size of initialized global memory cache");
  }
  return state;
}

export class MemoryLRUPCP extends PoTokenCacheProvider {
  static override readonly providerName = "memory";
  static readonly DEFAULT_CACHE_SIZE = 25;

  readonly #state: MemoryCacheState;

  constructor(
    host: IEContentProviderHost,
    logger?: IEContentProviderLogger,
    settings?: Record<string, readonly string[] | undefined>,
    initializeCache = initializeGlobalCache,
  ) {
    super(host, logger, settings);
    this.#state = initializeCache(MemoryLRUPCP.DEFAULT_CACHE_SIZE);
  }

  override isAvailable(): boolean {
    return true;
  }

  override get(key: string): string | null {
    const item = this.#state.cache.get(key);
    if (!item) {
      return null;
    }
    this.#state.cache.delete(key);
    const [value, expiresAt] = item;
    if (expiresAt < nowSeconds()) {
      return null;
    }
    this.#state.cache.set(key, item);
    return value;
  }

  override store(key: string, value: string, expiresAt: number): void {
    if (expiresAt < nowSeconds()) {
      return;
    }
    this.#state.cache.delete(key);
    this.#state.cache.set(key, [value, expiresAt]);
    if (this.#state.cache.size > this.#state.maxSize) {
      const oldestKey = this.#state.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.#state.cache.delete(oldestKey);
      }
    }
  }

  override delete(key: string): void {
    this.#state.cache.delete(key);
  }
}

// Keep the BuiltinIEContentProvider import live as documentation of the Python inheritance source.
void BuiltinIEContentProvider;

registerProvider(MemoryLRUPCP);
registerPreference(() => 10000);

function nowSeconds(): number {
  return Math.trunc(Date.now() / 1000);
}
