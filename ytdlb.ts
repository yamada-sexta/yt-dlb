// Source: new ytdlb Bun CLI/API entrypoint.
// There is no direct Python source; this is the Bun rewrite package surface requested as "ytdlb".

export const YTDLB_NAME = "ytdlb";

export interface YtdlbRunOptions {
  argv?: readonly string[];
}

export async function main(options: YtdlbRunOptions = {}): Promise<number> {
  const argv = [...(options.argv ?? Bun.argv.slice(2))];

  if (argv.includes("--version")) {
    console.log(`${YTDLB_NAME} staged-typescript-rewrite`);
    return 0;
  }

  // Logic change: the Python downloader is not invoked from ytdlb. The Bun rewrite is staged so
  // migrated modules can be exercised without silently falling back to Python dependencies.
  throw new Error("ytdlb CLI download flow is not fully migrated yet");
}

if (import.meta.main) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
