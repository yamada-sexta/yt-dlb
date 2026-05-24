// Source: new ytdlb Bun CLI/API entrypoint.
// There is no direct Python source; this is the Bun rewrite package surface requested as "ytdlb".

import { main as ytdlpMain } from "./yt_dlp/index.ts";

export interface YtdlbRunOptions {
  argv?: readonly string[];
}

export async function main(options: YtdlbRunOptions = {}): Promise<number> {
  return await ytdlpMain(options.argv ?? Bun.argv.slice(2));
}

if (import.meta.main) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
