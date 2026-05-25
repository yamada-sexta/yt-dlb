// Source: test/test_downloader_http.py

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { HttpFD } from "../yt_dlp/downloader/http.ts";

const TEST_SIZE = 10 * 1024;
const endpoints = ["regular", "no-content-length", "no-range", "no-range-no-content-length"] as const;

describe("HTTP downloader", () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ytdlb-httpfd-"));
  });

  afterAll(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("test_regular", async () => {
    await downloadAll({});
  });

  test("test_chunked", async () => {
    await downloadAll({ http_chunk_size: 1000 });
  });

  async function downloadAll(params: Record<string, unknown>): Promise<void> {
    for (const endpoint of endpoints) {
      await download(params, endpoint);
    }
  }

  async function download(params: Record<string, unknown>, endpoint: string): Promise<void> {
    const filename = join(tempDir, `${endpoint}-${crypto.randomUUID()}.mp4`);
    const downloader = new HttpFD(fakeDownloader(), { ...params, quiet: true, noprogress: true });
    expect(await downloader.realDownload(filename, { url: `http://127.0.0.1/${endpoint}` }), endpoint).toBe(true);
    expect((await stat(filename)).size, endpoint).toBe(TEST_SIZE);
    await rm(filename, { force: true });
  }
});

function fakeDownloader() {
  return {
    params: {},
    async urlopen(url: string | URL | Request) {
      const request = url instanceof Request ? url : new Request(url.toString());
      return serveTestRequest(request);
    },
    toScreen() {},
    reportWarning() {},
    writeDebug() {},
  };
}

function serveTestRequest(request: Request): Response {
  const path = new URL(request.url).pathname;
  if (!["/regular", "/no-content-length", "/no-range", "/no-range-no-content-length"].includes(path)) {
    return new Response("not found", { status: 404 });
  }

  const supportsRange = path !== "/no-range" && path !== "/no-range-no-content-length";
  const sendsContentLength = path !== "/no-content-length" && path !== "/no-range-no-content-length";
  const headers: Record<string, string> = { "Content-Type": "video/mp4" };
  const range = supportsRange ? parseRange(request.headers.get("Range")) : null;
  const size = range ? range.end - range.start + 1 : TEST_SIZE;

  if (range) {
    headers["Content-Range"] = `bytes ${range.start}-${range.end}/${TEST_SIZE}`;
  }
  if (sendsContentLength) {
    headers["Content-Length"] = String(size);
  }
  return new Response(Buffer.alloc(size, "#"), { status: range ? 206 : 200, headers });
}

function parseRange(rangeHeader: string | null): { start: number; end: number } | null {
  const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader ?? "");
  if (!match) {
    return null;
  }
  const start = Number.parseInt(match[1]!, 10);
  const end = match[2] ? Number.parseInt(match[2], 10) : TEST_SIZE - 1;
  return Number.isFinite(start) && Number.isFinite(end) && end >= start ? { start, end } : null;
}
