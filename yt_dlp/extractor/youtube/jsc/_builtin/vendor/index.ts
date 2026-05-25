// Source: yt_dlp/extractor/youtube/jsc/_builtin/vendor/__init__.py
// Port note: Bun.file() reads vendored JavaScript lazily from files colocated with this module.

export { HASHES, VERSION } from "./info.ts";

const AVAILABLE_SCRIPTS = new Set([
  "yt.solver.bun.lib.js",
  "yt.solver.core.js",
  "yt.solver.deno.lib.js",
]);

export async function loadScript(
  filename: string,
  errorHook?: (error: Error) => void,
): Promise<string | null> {
  if (!AVAILABLE_SCRIPTS.has(filename)) {
    return null;
  }
  try {
    return await Bun.file(new URL(`./${filename}`, import.meta.url)).text();
  } catch (error) {
    errorHook?.(error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}
