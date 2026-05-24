# Contributing To YTDLB

YTDLB is a Bun and TypeScript downloader project. Contributions should improve the Bun runtime while keeping the original Python sources available as migration references.

## Setup

Install Bun, then install dependencies from the repository root:

```shell
bun install
```

Useful commands:

```shell
bun ytdl "https://www.youtube.com/watch?v=jqM-wenNiFw"
bun run check
bun run typecheck
bun run smoke:extractors
bun run build
```

Run `bun run check` before submitting a change. It covers TypeScript checking, source-header validation, and the extractor smoke check.

## Migration Rules

- Do not edit the original Python files unless a maintainer explicitly asks for it.
- Add TypeScript modules beside the Python source they migrate.
- Use kebab-case TypeScript filenames, `index.ts` for `__init__.py`, and a first-line `// Source:` header in every TypeScript file.
- Port internal dependencies before porting code that relies on them.
- Prefer Bun and Web APIs such as `Bun.file`, `Bun.write`, `fetch`, `bun:sqlite`, Web streams, Web Crypto, and Bun Shell.
- Use Bun Shell for external tools such as `ffmpeg`, `aria2c`, `curl`, `mpv`, and `mplayer`.
- Use `zod` for parsed or external data validation.
- Use native `RegExp.escape()` for literal regex construction.
- Keep IO, network, and runtime work async; keep pure transforms synchronous.
- Avoid broad `any` types.
- Update `YTDLB_MIGRATION_TODO.md` as migration work changes.
- Never mark partial ports complete.
- Unsupported migrated feature paths must throw `NotImplementedError`.

## TypeScript Style

Follow the existing module style. Keep changes scoped, avoid unnecessary type aliases, and add comments only when the TypeScript logic intentionally differs from the source behavior.

If a helper supports only part of a source feature, make the unsupported branch fail explicitly. Do not return empty arrays, empty objects, nullable stand-ins, or approximate results to keep execution moving.

## Extractors

New or migrated extractors should extend `InfoExtractor`, keep network calls async, validate external JSON with `zod`, and use shared helpers from the migrated layers. If an extractor needs an unported helper, port that helper first or leave the extractor unchecked in the migration todo.

Include at least one real example URL in issue reports or pull requests for extractor changes, plus the exact command used to reproduce the behavior.

## Pull Requests

Keep pull requests focused. Include the commands you ran, note any known unimplemented branches that now throw, and update docs or the migration todo when the public behavior or migration status changes.
