# ytdlb

`ytdlb` is a Bun/TypeScript video downloader based on yt-dlp. It is early software and is not a drop-in replacement for yt-dlp yet.

YTDLB aims to be a more developer friendly version of YTDLP. Consider the fact that YTDLP is hard dependent on a JS runtime, a full JavaScript/TypeScript version is going to provide better DX/UX. But unfortunately I am unable to contribute to the upstream :(

<img width="525" height="169" alt="image" src="https://github.com/user-attachments/assets/a6ca526d-4bce-4a8a-9912-c172f209ea0a" />

Use upstream yt-dlp for production downloads. Use `ytdlb` if you want to try the Bun runtime as it grows.

## What Works

- Bun CLI entrypoint: `bun ytdl ...`
- YouTube watch URL downloads for currently supported progressive HTTP formats.
- YouTube JS challenge solving through the `yt-dlp/ejs` package.
- Direct HTTP/HTTPS downloads.
- Some native downloader support for DASH, HLS, F4M, ISM, MHTML, RTMP/RTSP wrappers, WebSocket fragments, and selected live/site-specific flows.
- Netscape cookie file loading and URL-scoped browser cookie extraction through Sweet Cookie.
- Basic options such as output templates, simulation, quiet/verbose mode, cookies, headers, proxy, cache removal, and plugin directories.

## Still In Progress

- Full yt-dlp site support.
- Full YouTube parity, including all clients, live streams, subtitles, playlists, and account-gated flows.
- Full format selection, postprocessing, and media merging from the CLI.
- Complete yt-dlp option compatibility.

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
bun run build
./dist/ytdlb --help
```

Run the current checks:

```bash
bun run test
```

Other useful project commands:

```bash
bun run check
bun run typecheck
bun run bundle
bun run build
bun run clean
```

## Project Layout

- `ytdlb.ts`: Bun CLI/API entrypoint for the rewrite.
- `index.ts`: package surface for currently migrated modules.
- `yt_dlp/**/*.ts`: Bun/TypeScript ports placed beside the Python source files.
- `yt_dlp/**/*.py`: original yt-dlp Python source, retained for reference and not modified during the migration.
- `YTDLB_MIGRATION_TODO.md`: source-to-target migration checklist.
- `AGENTS.md`: short rules for agents working in this repository.

## Relationship To yt-dlp

This repository is based on yt-dlp, but the active goal here is the Bun/TypeScript runtime named `ytdlb`. For production yt-dlp usage, use the upstream yt-dlp project until this rewrite reaches parity.

The original upstream documentation and license files are retained where relevant.
