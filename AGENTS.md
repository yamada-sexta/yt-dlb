# Agent Notes

This repo is a yt-dlp fork being migrated to a Bun/TypeScript runtime named `ytdlb`. Do not modify the original Python files unless explicitly asked; add TypeScript files beside their Python sources instead.

Follow [YTDLB_MIGRATION_TODO.md](YTDLB_MIGRATION_TODO.md) for the full source-to-target inventory. TS filenames should use kebab-case, `index.ts` for `__init__.py`, and `internal-*.ts` for private Python modules that would collide with public module names.

Every new TS file must start with a short source header naming the Python source, or explaining that the file is new. Prefer Bun-native APIs (`Bun.file`, `Bun.write`, `fetch`, `bun:sqlite`, Web streams, Bun-compatible crypto) and avoid Python dependencies.

Use async only for IO/network/runtime work; keep pure transforms synchronous. Prefer typed schemas such as `zod` for external data, and avoid broad `any`.
