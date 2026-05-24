# Agent Notes

This repo is a yt-dlp fork being migrated to a Bun/TypeScript runtime named `ytdlb`. Do not modify the original Python files unless explicitly asked; add TypeScript files beside their Python sources instead.

Follow [YTDLB_MIGRATION_TODO.md](YTDLB_MIGRATION_TODO.md) for the full source-to-target inventory. Migrate layer by layer: finish all direct `yt_dlp/*.py` files before moving into subdirectories, then proceed one directory layer at a time. Do not mark a TODO item complete until the file is fully ported, has a source header, and `tsc --noEmit` passes.

TS filenames should use kebab-case, `index.ts` for `__init__.py`, and `internal-*.ts` for private Python modules that would collide with public module names. Never leave placeholder facades marked complete; if a file depends on an unfinished layer, leave it unchecked.

Unimplemented migrated features must fail loudly with `NotImplementedError` or an equally explicit error. Do not leave live exported functions, classes, or constants as blank no-ops, empty arrays, nullable stand-ins, or silent placeholder behavior.

Every new TS file must start with a short source header naming the Python source, or explaining that the file is new. Prefer Bun-native APIs (`Bun.file`, `Bun.write`, `fetch`, `bun:sqlite`, Web streams, Bun-compatible crypto) and avoid Python dependencies.

Use async only for IO/network/runtime work; keep pure transforms synchronous. Prefer typed schemas such as `zod` for external data, and avoid broad `any`. When translating Python `re.escape` or dynamic literal regex construction, use native `RegExp.escape()`.
