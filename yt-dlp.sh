#!/usr/bin/env sh
exec "${BUN:-bun}" run "$(dirname "$(realpath "$0")")/ytdlb.ts" "$@"
