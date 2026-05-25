// Source: yt_dlp/extractor/youtube/pot/cache.py

import {
  IEContentProvider,
  IEContentProviderError,
  type IEContentProviderHost,
  type IEContentProviderLogger,
} from "./internal-provider.ts";
import {
  potCacheProviderPreferences,
  potCacheProviders,
  potPcsProviders,
} from "./registry.ts";
import type { PoTokenRequest } from "./provider.ts";

export class PoTokenCacheProviderError extends IEContentProviderError {}

export abstract class PoTokenCacheProvider extends IEContentProvider {
  abstract get(key: string): string | null;
  abstract store(key: string, value: string, expiresAt: number): void;
  abstract delete(key: string): void;
}

export enum CacheProviderWritePolicy {
  WRITE_ALL = "write_all",
  WRITE_FIRST = "write_first",
}

export interface PoTokenCacheSpec {
  keyBindings: Record<string, string | null | undefined>;
  defaultTtl: number;
  writePolicy: CacheProviderWritePolicy;
  provider?: PoTokenCacheSpecProvider;
}

export abstract class PoTokenCacheSpecProvider extends IEContentProvider {
  override isAvailable(): boolean {
    return true;
  }

  abstract generateCacheSpec(request: PoTokenRequest): PoTokenCacheSpec | null;
}

export type PoTokenCacheProviderConstructor = {
  readonly providerName: string;
  new (
    host: IEContentProviderHost,
    logger?: IEContentProviderLogger,
    settings?: Record<string, readonly string[] | undefined>,
  ): PoTokenCacheProvider;
};

export type PoTokenCacheSpecProviderConstructor = {
  readonly providerName: string;
  new (
    host: IEContentProviderHost,
    logger?: IEContentProviderLogger,
    settings?: Record<string, readonly string[] | undefined>,
  ): PoTokenCacheSpecProvider;
};

export type CacheProviderPreference = (
  provider: PoTokenCacheProvider,
  request: PoTokenRequest,
) => number;

export function registerProvider<T extends PoTokenCacheProviderConstructor>(
  provider: T,
): T {
  if (potCacheProviders.has(provider.providerName)) {
    throw new Error(
      `PoTokenCacheProvider ${provider.providerName} already registered`,
    );
  }
  potCacheProviders.set(provider.providerName, provider);
  return provider;
}

export function registerSpec<T extends PoTokenCacheSpecProviderConstructor>(
  provider: T,
): T {
  if (potPcsProviders.has(provider.providerName)) {
    throw new Error(
      `PoTokenCacheSpecProvider ${provider.providerName} already registered`,
    );
  }
  potPcsProviders.set(provider.providerName, provider);
  return provider;
}

export function registerPreference(
  preference: CacheProviderPreference,
): CacheProviderPreference {
  potCacheProviderPreferences.add(preference);
  return preference;
}
