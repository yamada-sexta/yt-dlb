# ytdlb

`ytdlb` is an in-progress Bun/TypeScript rewrite of the yt-dlp runtime. The original Python source is kept in this repository for reference, but the new runtime is implemented as colocated TypeScript modules under `yt_dlp/` and is launched through `ytdlb.ts`.

This is not currently a drop-in replacement for yt-dlp. The migration is being done layer by layer, with unfinished features throwing explicit `NotImplementedError`-style failures instead of silently falling back to Python or pretending to work.

YTDLB aims to be a more developer friendly version of YTDLP. Consider the fact that YTDLP is hard dependent on a JS runtime, a full JavaScript/TypeScript version is going to provide better DX/UX. But unfortunately I am unable to contribute to the upstream :(

<img width="525" height="169" alt="image" src="https://github.com/user-attachments/assets/a6ca526d-4bce-4a8a-9912-c172f209ea0a" />

## What Works Now

- Bun CLI entrypoint: `bun run ./ytdlb.ts ...`
- YouTube watch URL extraction for progressive HTTP formats.
- YouTube `n` challenge solving through the installed `yt-dlp/ejs` package.
- Direct HTTP/HTTPS downloads through the native TypeScript downloader path.
- Basic DASH fragment downloads.
- Basic HLS media playlist downloads, including AES-128 media segment decryption.
- Basic MHTML archive downloads.
- Basic `ffmpeg` external downloader path when `ffmpeg` is available.
- Netscape cookie file loading and partial browser cookie extraction using Bun APIs.

## Still In Progress

- Full yt-dlp extractor coverage.
- Full YouTube extractor parity, including all player clients, format selection, live streams, subtitles, playlists, and account-gated flows.
- Full downloader parity for RTMP, RTSP, F4M, ISM, live chat, and site-specific live downloaders.
- Full postprocessor support and media merging.
- Full CLI option compatibility.
- Complete test coverage.

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
bun run ./ytdlb.ts 'https://www.youtube.com/watch?v=34618ZnE5HE'
```

Choose an output template:

```bash
bun run ./ytdlb.ts -o '/tmp/%(id)s.%(ext)s' 'https://www.youtube.com/watch?v=34618ZnE5HE'
```

Show the current TypeScript CLI help:

```bash
bun run ./ytdlb.ts --help
```

Typecheck the rewrite:

```bash
./node_modules/.bin/tsc --noEmit
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
