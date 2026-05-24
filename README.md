# ytdlb

`ytdlb` is an in-progress Bun/TypeScript rewrite of the yt-dlp runtime. The original Python source remains in this repository as the porting reference; new TypeScript modules are colocated under `yt_dlp/` and the Bun entrypoint is `ytdlb.ts`.

This is not a drop-in replacement for yt-dlp yet. The migration is layer-by-layer, and unsupported migrated behavior is expected to fail with explicit `NotImplementedError`-style errors instead of falling back to Python or silently pretending to work.

## Current CLI

The runnable CLI path is narrow:

- `bun run ./ytdlb.ts ...`
- direct URL downloads through the migrated downloader registry
- focused YouTube watch URL extraction for progressive HTTP formats
- YouTube JS challenge support through the installed `yt-dlp/ejs` package
- Netscape cookie file loading and partial browser cookie extraction
- basic options from `yt_dlp/options.ts`: output templates, simulate/skip download, quiet/verbose, cookies, headers, proxy, cache removal, update check, plugin dirs, and remote component args

The top-level CLI does not yet build postprocessor chains, perform full option validation, or use the async extractor registry for arbitrary sites.

## Migrated Library Surfaces

These TypeScript layers exist and typecheck, but many are still dependency subsets rather than full yt-dlp parity:

- `yt_dlp/downloader`: HTTP/HTTPS, fragment handling, DASH, HLS, F4M, ISM, MHTML, RTMP/RTSP wrappers, WebSocket fragment sinks, YouTube live chat, Niconico/FC2/Soop/BunnyCDN, and external downloaders via Bun Shell.
- `yt_dlp/networking`: Bun/Web `Request`/`Response` handlers, urllib-style handler, exceptions, proxy checks, impersonation target parsing, and explicit unsupported Python backend shims.
- `yt_dlp/postprocessor`: exported postprocessor classes for ffmpeg probing/conversion/merge/fixups, metadata, subtitles, thumbnails, chapter splitting/modification, SponsorBlock metadata, exec, move-after-download, and xattrs. These are not wired into the CLI yet.
- `yt_dlp/extractor`: async Bun Glob registry plus a small migrated extractor set, currently including YouTube watch URLs, common protocol/mistake handlers, unsupported-site handlers, AcademicEarth, AdobeConnect, Alibaba, AliExpress live, AtScaleConf, and Baidu.
- YouTube JS challenge and PO token provider scaffolding under `yt_dlp/extractor/youtube`.

## Still In Progress

- Full yt-dlp extractor coverage.
- Full YouTube parity, including all clients, format selection, live streams, subtitles, playlists, and account-gated flows.
- CLI integration for postprocessors and multi-format media merging.
- Complete yt-dlp option parsing and validation.
- Broader tests beyond the current typecheck and smoke checks.

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
