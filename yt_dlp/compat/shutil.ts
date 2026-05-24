// Source: yt_dlp/compat/shutil.py
// Port note: selected shutil behavior is mapped to Bun/Node filesystem APIs.

import { basename, join } from "node:path";
import { cp, mkdir, rename, stat } from "node:fs/promises";

export async function copy2(src: string, dst: string): Promise<string> {
  let target = dst;
  try {
    if ((await stat(dst)).isDirectory()) {
      target = join(dst, basename(src));
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  await cp(src, target, { preserveTimestamps: true });
  return target;
}

export async function move(src: string, dst: string): Promise<string> {
  await mkdir(dirnameFromTarget(dst), { recursive: true });
  await rename(src, dst);
  return dst;
}

function dirnameFromTarget(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index === -1 ? "." : path.slice(0, index) || "/";
}
