// Source: yt_dlp/__init__.py

import {
  IN_CLI,
  pluginDirs,
  supportedJsRuntimes,
  supportedRemoteComponents,
} from "./globals.ts";
import { parseOpts, type ParsedOptions } from "./options.ts";
import { loadAllPlugins } from "./plugins.ts";
import { Updater } from "./update.ts";
import { YoutubeDL, DownloadCancelled, DownloadError } from "./YoutubeDL.ts";
import { BunJsRuntime } from "./utils/jsruntime.ts";
import { NotImplementedError } from "./errors.ts";

export { YoutubeDL } from "./YoutubeDL.ts";
export { parseOpts as parse_options } from "./options.ts";

export function getUrls(urls: readonly string[]): string[] {
  return urls.map((url) => url.trim()).filter(Boolean);
}

export function validateOptions(_opts: ParsedOptions): void {
  throw new NotImplementedError("full option validation");
}

export function setCompatOpts(_opts: ParsedOptions): void {
  throw new NotImplementedError("compat option rewriting");
}

export function getPostprocessors(_opts: ParsedOptions): unknown[] {
  throw new NotImplementedError("postprocessor construction");
}

export async function realMain(
  argv: readonly string[] = Bun.argv.slice(2),
): Promise<number | undefined> {
  const [parser, opts, urls] = parseOpts(argv);
  if (opts.printHelp || opts.version) {
    return 0;
  }

  pluginDirs.value = opts.pluginDirs;
  if (pluginDirs.value.length) {
    await loadAllPlugins();
  }

  const ydlOpts = {
    outtmpl: opts.output,
    quiet: opts.quiet,
    verbose: opts.verbose,
    simulate: opts.simulate,
    skipDownload: opts.skipDownload,
    cookiefile: opts.cookiefile,
    cookiesfrombrowser: opts.cookiesfrombrowser,
    http_headers: opts.headers,
    proxy: opts.proxy,
    socket_timeout: opts.socketTimeout,
    remote_components: opts.remoteComponents,
    extractor_args: opts.extractorArgs,
  };
  const ydl = new YoutubeDL(ydlOpts);

  if (opts.rmCacheDir) {
    await ydl.cache.remove();
  }
  if (opts.updateSelf) {
    const updated = await new Updater(
      ydl,
      opts.updateSelf === true ? null : opts.updateSelf,
    ).update();
    if (updated && urls.length) {
      return (await new Updater(ydl).restart()) ?? undefined;
    }
  }

  const allUrls = getUrls(urls);
  if (!allUrls.length) {
    parser.error(
      "You must provide at least one URL.\nType ytdlb --help to see a list of options.",
    );
  }
  return await ydl.download(allUrls);
}

export async function main(
  argv: readonly string[] = Bun.argv.slice(2),
): Promise<number> {
  IN_CLI.value = true;
  try {
    return (await realMain(argv)) ?? 0;
  } catch (error) {
    if (error instanceof DownloadCancelled) {
      console.error("Aborting remaining downloads");
      return 101;
    }
    if (error instanceof DownloadError) {
      console.error(`ERROR: ${error.message}`);
      return 1;
    }
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  }
}

supportedJsRuntimes.value.bun = BunJsRuntime;
supportedRemoteComponents.value.push("ejs:github", "ejs:npm");

export const gen_extractors = (): unknown[] => {
  throw new NotImplementedError("extractor generation");
};

export const list_extractors = (): string[] => {
  throw new NotImplementedError("extractor listing");
};
