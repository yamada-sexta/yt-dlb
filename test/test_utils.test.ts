// Source: selected cases from test/test_utils.py and yt_dlp/utils/_deprecated.py

import { describe, expect, test } from "bun:test";

import { bytesToIntlist, intlistToBytes, jwtEncodeHs256 } from "../yt_dlp/utils/deprecated.ts";
import { decodeBase, decodeFilename, decodeOption, encodeFilename, errorToCompatStr, handleYoutubedlHeaders, requestToUrl } from "../yt_dlp/utils/legacy.ts";
import {
  cleanHtml,
  cleanPodcastUrl,
  cliBoolOption,
  cliOption,
  cliValuelessOption,
  determineExt,
  escapeHTML,
  extractAttributes,
  filterDict,
  floatOrNone,
  formatSeconds,
  getElementByClass,
  getElementById,
  intOrNone,
  isOutdatedVersion,
  joinNonempty,
  mergeDicts,
  mimetype2ext,
  orderedSet,
  parseDuration,
  parseFilesize,
  parseIso8601,
  parseM3u8Attributes,
  parseQs,
  parseResolution,
  prependExtension,
  qualities,
  removeEnd,
  removeStart,
  replaceExtension,
  shellQuote,
  strOrNone,
  strToInt,
  stripOrNone,
  truncateString,
  unescapeHTML,
  unifiedStrdate,
  unifiedTimestamp,
  updateUrlQuery,
  urlBasename,
  urlencodePostdata,
  urljoin,
  urlOrNone,
  variadic,
} from "../yt_dlp/utils/utils.ts";

describe("deprecated utility compatibility", () => {
  test("bytes/int list conversion", () => {
    expect(bytesToIntlist(Uint8Array.from([0, 1, 255]))).toEqual([0, 1, 255]);
    expect(intlistToBytes([0, 1, 255])).toEqual(Uint8Array.from([0, 1, 255]));
  });

  test("jwtEncodeHs256 returns three base64 parts", () => {
    const token = new TextDecoder().decode(jwtEncodeHs256({ sub: "1" }, "secret"));
    expect(token.split(".")).toHaveLength(3);
    expect(token).toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
  });
});

describe("legacy utility compatibility", () => {
  test("decodeBase", () => {
    expect(decodeBase("101", "01")).toBe(5);
    expect(decodeBase("ff", "0123456789abcdef")).toBe(255);
  });

  test("handleYoutubedlHeaders strips no-compression marker", () => {
    expect(handleYoutubedlHeaders({
      "Accept-Encoding": "gzip",
      "Youtubedl-No-Compression": "1",
      Other: "ok",
    })).toEqual({ Other: "ok" });
  });

  test("filename and option shims are identity transforms", () => {
    expect(encodeFilename("abc")).toBe("abc");
    expect(decodeFilename("abc")).toBe("abc");
    expect(decodeOption(Uint8Array.from([0x61, 0x62, 0x63]))).toBe("abc");
    expect(errorToCompatStr(new Error("boom"))).toBe("Error: boom");
  });

  test("requestToUrl", () => {
    expect(requestToUrl("https://example.com/")).toBe("https://example.com/");
    expect(requestToUrl(new URL("https://example.com/path"))).toBe("https://example.com/path");
    expect(requestToUrl(new Request("https://example.com/request"))).toBe("https://example.com/request");
  });

  test("joinNonempty", () => {
    expect(joinNonempty("title", null, "section", { delim: " - " })).toBe("title - section");
    expect(joinNonempty("title", "missing", { from_dict: { title: "Name" }, delim: ":" })).toBe("Name");
  });
});

describe("general utility helpers", () => {
  test("determineExt and mime mapping", () => {
    expect(determineExt("https://example.com/video.mp4?x=1")).toBe("mp4");
    expect(determineExt("https://example.com/no-extension", "unknown")).toBe("unknown");
    expect(mimetype2ext("video/mp4; codecs=avc1")).toBe("mp4");
  });

  test("removeStart/removeEnd", () => {
    expect(removeStart("foobar", "foo")).toBe("bar");
    expect(removeStart("foobar", "bar")).toBe("foobar");
    expect(removeEnd("foobar", "bar")).toBe("foo");
    expect(removeEnd("foobar", "foo")).toBe("foobar");
  });

  test("URL helpers", () => {
    expect(urljoin("https://example.com/a/b", "../c")).toBe("https://example.com/c");
    expect(urlOrNone("https://example.com/path")).toBe("https://example.com/path");
    expect(urlOrNone("not a url")).toBeNull();
    expect(updateUrlQuery("https://example.com/path?a=1", { a: "2", b: ["x", "y"] })).toBe("https://example.com/path?a=2&b=x&b=y");
    expect(parseQs("https://example.com/path?a=1&a=2&b=x")).toEqual({ a: ["1", "2"], b: ["x"] });
    expect(urlBasename("https://example.com/a/video.mp4?x=1")).toBe("video.mp4");
  });

  test("urlencodePostdata", () => {
    expect(urlencodePostdata({ a: 1, b: true, c: null }).toString()).toBe("a=1&b=true");
  });

  test("parseM3u8Attributes", () => {
    expect(parseM3u8Attributes('BANDWIDTH=1280000,RESOLUTION="1920x1080",CODECS="avc1,mp4a"')).toEqual({
      BANDWIDTH: "1280000",
      RESOLUTION: "1920x1080",
      CODECS: "avc1,mp4a",
    });
  });

  test("numeric parsers", () => {
    expect(intOrNone("10")).toBe(10);
    expect(intOrNone("ff", 1, null, 1, 16)).toBe(255);
    expect(intOrNone(null, 1, 7)).toBe(7);
    expect(floatOrNone("12.5")).toBe(12.5);
    expect(floatOrNone(null, 1, 7)).toBe(7);
    expect(strToInt("1,234")).toBe(1234);
    expect(strToInt("abc")).toBeNull();
  });

  test("string option helpers", () => {
    expect(strOrNone(10)).toBe("10");
    expect(strOrNone(null, "fallback")).toBe("fallback");
    expect(stripOrNone("  value  ")).toBe("value");
    expect(stripOrNone("  ", "fallback")).toBe("fallback");
  });

  test("dict helpers", () => {
    expect(filterDict({ a: 1, b: null, c: 0 })).toEqual({ a: 1, c: 0 });
    expect(mergeDicts({ a: 1, b: null }, { b: 2, c: 3 })).toEqual({ b: 2, c: 3, a: 1 });
    expect(variadic("x")).toEqual(["x"]);
    expect(variadic(["x", "y"])).toEqual(["x", "y"]);
  });

  test("format and truncate helpers", () => {
    expect(formatSeconds(65)).toBe("1:05");
    expect(formatSeconds(3661.25, ":", true)).toBe("1:01:01.250");
    expect(truncateString("abcdefghijklmnopqrstuvwxyz", 5, 5)).toBe("ab...vwxyz");
  });

  test("HTML helpers", () => {
    expect(escapeHTML("<a&b>")).toBe("&lt;a&amp;b&gt;");
    expect(unescapeHTML("&lt;a&amp;b&gt;")).toBe("<a&b>");
    expect(cleanHtml("<p>Hello<br>world</p>")).toBe("Hello\nworld");
    expect(getElementById("x", '<div id="x">Text</div>')).toBe("Text");
    expect(getElementByClass("a", '<div class="b a">Text</div>')).toBe("Text");
    expect(extractAttributes('<div data-id="1" disabled class=test>')).toEqual({
      "data-id": "1",
      disabled: null,
      class: "test",
    });
  });

  test("date and time parsers", () => {
    expect(parseIso8601("1970-01-01T00:00:01Z")).toBe(1);
    expect(unifiedTimestamp("1970-01-01 00:00:01")).toBe(1);
    expect(unifiedStrdate("2020-02-03")).toBe("20200203");
    expect(parseDuration("1:02:03")).toBe(3723);
    expect(parseDuration("1 hour 2 minutes 3 seconds")).toBe(3723);
    expect(parseDuration("PT0H12M23S")).toBe(743);
    expect(parseDuration("PT34M39.23S")).toBe(2079.23);
  });

  test("media parsers", () => {
    expect(parseFilesize("1.5MiB")).toBe(1572864);
    expect(parseResolution("1920x1080")).toEqual({ width: 1920, height: 1080 });
    expect(parseResolution("720p")).toEqual({ height: 720 });
    const q = qualities(["small", "medium", "large"]);
    expect(q("medium")).toBe(1);
    expect(q("missing")).toBe(-1);
  });

  test("CLI option helpers", () => {
    expect(cliOption({ path: "file" }, "--path", "path")).toEqual(["--path", "file"]);
    expect(cliOption({ path: "file" }, "--path", "path", "=")).toEqual(["--path=file"]);
    expect(cliBoolOption({ enabled: false }, "--enabled", "enabled")).toEqual(["--enabled", "false"]);
    expect(cliValuelessOption({ verbose: true }, "--verbose", "verbose")).toEqual(["--verbose"]);
  });

  test("path and shell helpers", () => {
    expect(replaceExtension("file.webm", "mp4")).toBe("file.mp4");
    expect(prependExtension("file.webm", "temp")).toBe("file.temp.webm");
    expect(shellQuote(["echo", "hello world"])).toBe("echo 'hello world'");
    expect(orderedSet(["a", "b", "a"])).toEqual(["a", "b"]);
  });

  test("version helper", () => {
    expect(isOutdatedVersion("1.2.0", "1.3.0")).toBe(true);
    expect(isOutdatedVersion("1.3.0", "1.2.0")).toBe(false);
  });

  test("podcast URL cleaner", () => {
    expect(cleanPodcastUrl("https://chtbl.com/track/123/https://example.com/audio.mp3")).toBe("https://example.com/audio.mp3");
  });
});
