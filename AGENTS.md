# Agent Notes

This repo is a yt-dlp fork being migrated to a Bun/TypeScript runtime named `ytdlb`. Do not modify the original Python files unless explicitly asked; add TypeScript files beside their Python sources instead.

Follow [YTDLB_MIGRATION_TODO.md](YTDLB_MIGRATION_TODO.md) for the full source-to-target inventory. Migrate layer by layer: finish all direct `yt_dlp/*.py` files before moving into subdirectories, then proceed one directory layer at a time. Do not mark a TODO item complete until the file is fully ported, has a source header, and `tsc --noEmit` passes.

Before porting a file, inspect its internal Python imports and port missing internal dependency modules first. Bun-native replacements are acceptable for platform/runtime dependencies, but do not inline or bypass repo modules just to finish a dependent file; leave the dependent file unchecked until its prerequisites exist.

TS filenames should use kebab-case, `index.ts` for `__init__.py`, and `internal-*.ts` for private Python modules that would collide with public module names. Never leave placeholder facades marked complete; if a file depends on an unfinished layer, leave it unchecked.

Unimplemented migrated features must fail loudly with `NotImplementedError` or an equally explicit error. Do not leave live exported functions, classes, or constants as blank no-ops, empty arrays, nullable stand-ins, or silent placeholder behavior. Partial compatibility shims are not acceptable anywhere in the codebase: if a helper only supports part of a Python behavior, every unsupported branch must throw at the point it is requested instead of returning an approximate result.

Every new TS file must start with a short source header naming the Python source, or explaining that the file is new. Prefer Bun-native APIs (`Bun.file`, `Bun.write`, `fetch`, `bun:sqlite`, Web streams, Bun Shell, Bun-compatible crypto) and avoid Python dependencies.

For HTML parsing and extraction, use Bun's native `HTMLRewriter`. Do not introduce Cheerio, DOMParser polyfills, or regex-based HTML parsing for newly migrated code when `HTMLRewriter` can express the extraction. XML helpers may continue to use XML-specific parsers where `HTMLRewriter` is not a semantic fit.

For browser cookies, prefer `@steipete/sweet-cookie` for `--cookies-from-browser`. It requires a target URL, so ytdlb loads browser cookies lazily per request origin in `YoutubeDL.urlopen`; keep file-cookie loading eager and browser-cookie loading URL-scoped.

For YouTube JS challenges, prefer importing the installed `yt-dlp/ejs` package at runtime from Bun. Keep that import behind a typed dynamic boundary so this repo's strict `tsc` does not typecheck EJS internals.

For Python dependency replacements, use the installed JS packages only where their API really matches. `brotli` is the Brotli decompression dependency. `mediabunny` plus `@mediabunny/server` is the Mutagen-side replacement for metadata reads and metadata/tag writes that can be expressed as a media container rewrite. `node-av` is a direct dependency for the native codec layer, but prefer accessing it through `@mediabunny/server` unless low-level frame interop is explicitly needed. Import through `yt_dlp/dependencies/mediabunny.ts` so the server codecs are registered once. Keep ffmpeg as the fallback for media rewrites Mediabunny cannot represent.

Downloader ports should use Bun `fetch`, WebSocket, Bun Shell, and file APIs directly. Prefer Bun Shell over `Bun.spawn`/Node subprocess APIs when interacting with external programs such as `ffmpeg`, `curl`, `aria2c`, `mpv`, or `mplayer`. Use `fetch` for native HTTP downloads; Bun Shell can execute a system `curl` from `PATH`, but `curl` is not one of Bun Shell's built-in commands. If a protocol still needs an unported muxer/extractor layer, keep an explicit throwing downloader instead of a fake success path.

When a command is already represented as an argv array, pass that array to Bun Shell as an interpolated expression, for example `await $\`${cmd}\`.nothrow().quiet()`. This preserves Bun Shell's escaping and avoids rebuilding command lines by hand.

Use async only for IO/network/runtime work; keep pure transforms synchronous. Prefer typed schemas such as `zod` for external data, and avoid broad `any`. When translating Python `re.escape` or dynamic literal regex construction, use native `RegExp.escape()`.

Runtime type predicates for parsed/external data should delegate to `zod` schemas instead of hand-written object checks. Direct TypeScript structural checks are acceptable for non-data constructs that Zod cannot model cleanly, such as class constructors or async iterable protocol checks; do not hide those behind `z.custom`.
