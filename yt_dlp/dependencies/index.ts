// Source: yt_dlp/dependencies/__init__.py
// Port note: Python optional dependencies are mapped to Bun-native capabilities or explicit unavailable records.

import * as Brotli from "./brotli.ts";
import * as Cryptodome from "./Cryptodome.ts";
import * as Mediabunny from "./mediabunny.ts";

export interface DependencyInfo {
  name: string;
  version: string | null;
  available: boolean;
  reason?: string;
}

function dependency(
  name: string,
  version: string | null,
  available = true,
  reason?: string,
): DependencyInfo {
  return { name, version, available, reason };
}

export const brotli = {
  ...dependency("brotli", null),
  decompress: Brotli.decompress,
  error: Brotli.error,
  module: Brotli,
};
export const certifi = dependency(
  "certifi",
  null,
  false,
  "Bun uses platform/Web TLS trust instead of Python certifi",
);
export const mediabunny = {
  ...dependency("mediabunny", null),
  module: Mediabunny,
};
export const mutagen = {
  ...dependency(
    "mediabunny",
    null,
    true,
    "Mediabunny replaces Mutagen metadata reads/writes through container rewrites",
  ),
  module: Mediabunny,
};
export const secretstorage = dependency(
  "secretstorage",
  null,
  false,
  "Bun rewrite does not use Python secretstorage",
);
export const _SECRETSTORAGE_UNAVAILABLE_REASON =
  "Bun rewrite does not use Python secretstorage";
export const sqlite3 = dependency("bun:sqlite", process.versions.bun);
export const websockets = dependency("WebSocket", process.versions.bun);
export const urllib3 = dependency(
  "urllib3",
  null,
  false,
  "Bun rewrite uses fetch instead of urllib3",
);
export const requests = dependency(
  "requests",
  null,
  false,
  "Bun rewrite uses fetch instead of requests",
);
export const xattr = dependency(
  "xattr",
  null,
  false,
  "extended attributes are not implemented in ytdlb yet",
);
export const curl_cffi = dependency(
  "curl_cffi",
  null,
  false,
  "Bun rewrite uses fetch instead of curl_cffi",
);
export const yt_dlp_ejs = dependency(
  "yt_dlp_ejs",
  null,
  false,
  "EJS support is provided by Bun-native JSC providers",
);

export const Cryptodome_AES = Cryptodome.AES;

export const all_dependencies = {
  brotli,
  certifi,
  mediabunny,
  mutagen,
  secretstorage,
  sqlite3,
  websockets,
  urllib3,
  requests,
  xattr,
  curl_cffi,
  Cryptodome,
  yt_dlp_ejs,
} as const;

export const available_dependencies = Object.fromEntries(
  Object.entries(all_dependencies).filter(([, value]) =>
    Boolean(
      value &&
        (typeof value !== "object" ||
          !("available" in value) ||
          value.available),
    ),
  ),
) as Partial<typeof all_dependencies>;
