// Source: yt_dlp/extractor/youtube/pot/_registry.py
// Port note: Python Indirect wrappers become plain exported maps/sets in the Bun rewrite.

import type {
  PoTokenProvider,
  PoTokenProviderConstructor,
  PoTokenPreference,
} from "./provider.ts";

export const potProviders = new Map<string, PoTokenProviderConstructor>();
export const ptpPreferences = new Set<PoTokenPreference>();
export const potPcsProviders = new Map<string, unknown>();
export const potCacheProviders = new Map<string, unknown>();
export const potCacheProviderPreferences = new Set<unknown>();
export const potMemoryCache = new Map<string, unknown>();

export function providerDisplayList(
  providers: Iterable<PoTokenProvider>,
): string {
  return [...providers].map((provider) => provider.providerName).join(", ");
}
