// Source: test/test_downloader_external.py

import { describe, expect, test } from "bun:test";

import type { DownloadInfo, DownloaderHost } from "../yt_dlp/downloader/common.ts";
import { Aria2cFD, AxelFD, CurlFD, HttpieFD, WgetFD, outputFormat, outputFormatForInfo } from "../yt_dlp/downloader/external.ts";

const TEST_INFO = { url: "http://www.example.com/" } satisfies DownloadInfo;
const TEST_COOKIE = "test=ytdlp";
const TEST_COOKIE_FILE = "/tmp/ytdlb-test-cookies.txt";

function fakeYdl(cookieHeader?: string): DownloaderHost & { cookies?: unknown } {
  return {
    params: {},
    cookies: cookieHeader ? {
      filename: TEST_COOKIE_FILE,
      getCookieHeader: () => cookieHeader,
    } : {
      getCookieHeader: () => undefined,
    },
    async urlopen(url: string | URL | Request) {
      return await fetch(url);
    },
    toScreen() {},
    writeDebug() {},
    reportWarning() {},
    reportError() {},
  };
}

class TestHttpieFD extends HttpieFD {
  protected override exe(): string {
    return "http";
  }

  makeCmdPublic(filename: string, info: DownloadInfo): Promise<string[]> {
    return this.makeCmd(filename, info);
  }
}

class TestAxelFD extends AxelFD {
  protected override exe(): string {
    return "axel";
  }

  makeCmdPublic(filename: string, info: DownloadInfo): Promise<string[]> {
    return this.makeCmd(filename, info);
  }
}

class TestWgetFD extends WgetFD {
  protected override exe(): string {
    return "wget";
  }

  makeCmdPublic(filename: string, info: DownloadInfo): Promise<string[]> {
    return this.makeCmd(filename, info);
  }
}

class TestCurlFD extends CurlFD {
  protected override exe(): string {
    return "curl";
  }

  makeCmdPublic(filename: string, info: DownloadInfo): Promise<string[]> {
    return this.makeCmd(filename, info);
  }
}

class TestAria2cFD extends Aria2cFD {
  protected override exe(): string {
    return "aria2c";
  }

  makeCmdPublic(filename: string, info: DownloadInfo): Promise<string[]> {
    return this.makeCmd(filename, info);
  }
}

describe("external downloader command builders", () => {
  test("HttpieFD command and Cookie header", async () => {
    expect(await new TestHttpieFD(fakeYdl()).makeCmdPublic("test", TEST_INFO)).toEqual([
      "http", "--download", "--output", "test", "http://www.example.com/",
    ]);
    expect(await new TestHttpieFD(fakeYdl(TEST_COOKIE)).makeCmdPublic("test", TEST_INFO)).toEqual([
      "http", "--download", "--output", "test", "http://www.example.com/", "Cookie:test=ytdlp",
    ]);
  });

  test("AxelFD command and Cookie header", async () => {
    expect(await new TestAxelFD(fakeYdl()).makeCmdPublic("test", TEST_INFO)).toEqual([
      "axel", "-o", "test", "--", "http://www.example.com/",
    ]);
    expect(await new TestAxelFD(fakeYdl(TEST_COOKIE)).makeCmdPublic("test", TEST_INFO)).toEqual([
      "axel", "-o", "test", "-H", "Cookie: test=ytdlp", "--max-redirect=0", "--", "http://www.example.com/",
    ]);
  });

  test("WgetFD command adds cookie file when cookies exist", async () => {
    expect(await new TestWgetFD(fakeYdl()).makeCmdPublic("test", TEST_INFO)).not.toContain("--load-cookies");
    expect(await new TestWgetFD(fakeYdl(TEST_COOKIE)).makeCmdPublic("test", TEST_INFO)).toContain("--load-cookies");
    expect(await new TestWgetFD(fakeYdl(TEST_COOKIE)).makeCmdPublic("test", TEST_INFO)).toContain(TEST_COOKIE_FILE);
  });

  test("CurlFD command adds cookie header when cookies exist", async () => {
    expect(await new TestCurlFD(fakeYdl()).makeCmdPublic("test", TEST_INFO)).not.toContain("--cookie");
    const cmd = await new TestCurlFD(fakeYdl(TEST_COOKIE)).makeCmdPublic("test", TEST_INFO);
    expect(cmd).toContain("--cookie");
    expect(cmd).toContain(TEST_COOKIE);
  });

  test("Aria2cFD command adds cookie file when cookies exist", async () => {
    expect(await new TestAria2cFD(fakeYdl()).makeCmdPublic("test", TEST_INFO)).not.toContain(`--load-cookies=${TEST_COOKIE_FILE}`);
    expect(await new TestAria2cFD(fakeYdl(TEST_COOKIE)).makeCmdPublic("test", TEST_INFO)).toContain(`--load-cookies=${TEST_COOKIE_FILE}`);
  });

  test("ffmpeg output format helpers", () => {
    expect(outputFormat("test.mp4")).toBe("mp4");
    expect(outputFormat("test.webm")).toBe("webm");
    expect(outputFormat("test.mkv")).toBe("matroska");
    expect(outputFormatForInfo("test.mp4", { url: TEST_INFO.url, protocol: "m3u8", is_live: true })).toBe("mpegts");
    expect(outputFormatForInfo("test.mp4", { url: TEST_INFO.url, protocol: "rtmp" })).toBe("flv");
  });

  test.todo("FFmpegFD full command assembly once command execution can be intercepted", () => undefined);
});
