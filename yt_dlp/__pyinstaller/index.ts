// Source: yt_dlp/__pyinstaller/__init__.py
// Port note: Bun packaging does not use PyInstaller hooks, but keeping this helper preserves the package surface.

import { dirname } from "node:path";

export function getHookDirs(): string[] {
  return [dirname(import.meta.path)];
}

export const get_hook_dirs = getHookDirs;
