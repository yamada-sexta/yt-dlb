# ytdlb

`ytdlb` is an independent Bun/TypeScript fork and rewrite of yt-dlp. It is not associated with, endorsed by, or maintained by the upstream yt-dlp project.

The project is still early software and is not a drop-in replacement for yt-dlp. Use upstream yt-dlp for production downloads; use `ytdlb` if you want to try the Bun runtime while the migration is in progress.

<img width="525" height="169" alt="image" src="https://github.com/user-attachments/assets/a6ca526d-4bce-4a8a-9912-c172f209ea0a" />

## What Works

- Bun CLI entrypoint: `bun ytdl ...`
- YouTube watch URL downloads for currently supported progressive HTTP formats.
- YouTube JS challenge solving through the `yt-dlp/ejs` package.
- Direct HTTP/HTTPS downloads.
- Some native downloader support for DASH, HLS, F4M, ISM, MHTML, RTMP/RTSP wrappers, WebSocket fragments, and selected live/site-specific flows.
- Netscape cookie file loading and URL-scoped browser cookie extraction through Sweet Cookie.
- Basic options such as output templates, simulation, quiet/verbose mode, cookies, headers, proxy, cache removal, and plugin directories.
- Bun test coverage for migrated helpers and static `test.todo` parity entries for Python tests that are not ported yet.

## Still In Progress

- Full yt-dlp site support.
- Full YouTube parity, including all clients, live streams, subtitles, playlists, and account-gated flows.
- Full format selection, postprocessing, and media merging from the CLI.
- Complete yt-dlp option compatibility.
- TypeScript coverage for every upstream Python test expectation. Ported behavior should assert the same result as the Python test; unavailable behavior should remain as `test.todo`.

See [YTDLB_MIGRATION_TODO.md](YTDLB_MIGRATION_TODO.md) for the migration inventory and current status.

## Requirements

- [Bun](https://bun.sh/)
- `ffmpeg` is optional but recommended for formats that need external remuxing or merging.

Install JavaScript dependencies:

```bash
bun install
```

## Usage

Download a currently supported YouTube progressive format:

```bash
bun ytdl https://www.youtube.com/watch\?v\=jqM-wenNiFw
```

Choose an output template:

```bash
bun ytdl -o '/tmp/%(id)s.%(ext)s' https://www.youtube.com/watch\?v\=jqM-wenNiFw
```

Show the current TypeScript CLI help:

```bash
bun ytdl --help
```

Build the Bun entrypoint:

```bash
bun compile
./dist/ytdlb --help
```

Run the current project checks:

```bash
bun check
```

Run the Bun test suite:

```bash
bun test test
```

Run checks and tests together:

```bash
bun ci
```

Other useful project commands:

```bash
bun typecheck
bun test:bun
bun bundle
bun compile
bun clean
```

Bun can run package scripts directly as `bun <script>` when the script name does not overlap a built-in Bun command. This repo avoids project script names such as `build` and `test` for that reason; use `bun compile` for the compiled binary and `bun test test` or `bun test:bun` for tests.

## Project Layout

- `ytdlb.ts`: Bun CLI/API entrypoint for the rewrite.
- `index.ts`: package surface for currently migrated modules.
- `yt_dlp/**/*.ts`: Bun/TypeScript ports placed beside the Python source files.
- `yt_dlp/**/*.py`: original yt-dlp Python source, retained for reference and not modified during the migration.
- `YTDLB_MIGRATION_TODO.md`: source-to-target migration checklist.
- `AGENTS.md`: short rules for agents working in this repository.

## Relationship To yt-dlp

This repository is a fork of yt-dlp source material, but the active goal here is the Bun/TypeScript runtime named `ytdlb`. It is not associated with the upstream yt-dlp project or its maintainers.

The original upstream documentation and license files are retained where relevant.
