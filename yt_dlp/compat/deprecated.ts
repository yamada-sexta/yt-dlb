// Source: yt_dlp/compat/_deprecated.py

import { realpathSync } from "node:fs";

export const compat_os_name = process.platform === "win32" ? "nt" : "posix";
export const compat_realpath = realpathSync;

export function compat_shlex_quote(value: string): string {
  if (!value) {
    return "''";
  }
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\"'\"'")}'`;
}
