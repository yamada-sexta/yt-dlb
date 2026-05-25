// Source: test/test_cache.py

import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import { Cache } from "../yt_dlp/cache.ts";

const testDir = join("/tmp", `ytdlb-cache-test-${process.pid}`);

describe("Cache", () => {
  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  test("store/load/remove JSON cache entries", async () => {
    const cache = new Cache({ params: { cachedir: testDir } });
    const value = { x: 1, y: ["a", "\\a", true] };

    expect(await cache.load("test_cache", "k.")).toBeNull();
    await cache.store("test_cache", "k.", value);
    expect(await cache.load("test_cache", "k2")).toBeNull();
    expect(await cache.load("test_cache", "k.")).toEqual(value);
    expect(await cache.load("test_cache", "y")).toBeNull();
    expect(await cache.load("test_cache2", "k.")).toBeNull();

    await cache.remove();
    expect(await cache.load("test_cache", "k.")).toBeNull();
  });

  test("disabled cache returns defaults and does not write", async () => {
    const cache = new Cache({ params: { cachedir: false } });
    await cache.store("section", "key", { value: true });
    expect(await cache.load("section", "key", "json", "default")).toBe(
      "default",
    );
    expect(cache.enabled).toBe(false);
  });

  test("validates section and dtype", () => {
    const cache = new Cache({ params: { cachedir: testDir } });
    expect(() => cache.getCacheFile("../bad", "key")).toThrow(
      /invalid section/,
    );
    expect(() => cache.getCacheFile("section", "key", "txt")).toThrow(
      /unsupported cache dtype/,
    );
  });
});
