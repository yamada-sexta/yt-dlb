// Source: selected cases from test/test_utils.py and yt_dlp/utils/_deprecated.py

import { describe, expect, test } from "bun:test";

import {
  bytesToIntlist,
  intlistToBytes,
  jwtEncodeHs256,
} from "../yt_dlp/utils/deprecated.ts";
import {
  decodeBase,
  decodeFilename,
  decodeOption,
  encodeFilename,
  errorToCompatStr,
  handleYoutubedlHeaders,
  requestToUrl,
} from "../yt_dlp/utils/legacy.ts";
import {
  ageRestricted,
  argsToStr,
  baseUrl,
  caesar,
  cleanHtml,
  cleanPodcastUrl,
  cliBoolOption,
  cliOption,
  cliValuelessOption,
  dfxp2srt,
  encodeBaseN,
  determineExt,
  escapeHTML,
  extractBasicAuth,
  extractAttributes,
  filterDict,
  floatOrNone,
  formatBytes,
  formatSeconds,
  InAdvancePagedList,
  getCompatibleExt,
  getElementByClass,
  getElementById,
  intOrNone,
  iriToUri,
  isHtml,
  isOutdatedVersion,
  joinNonempty,
  OnDemandPagedList,
  matchStr,
  limitLength,
  lowercaseEscape,
  mergeDicts,
  mimetype2ext,
  monthByName,
  orderedSet,
  parseBitrate,
  parseCodecs,
  parseDfxpTimeExpr,
  parseDuration,
  parseFilesize,
  parseIso8601,
  parseM3u8Attributes,
  parseQs,
  parseResolution,
  prependExtension,
  qualities,
  removeEnd,
  removeQuotes,
  removeStart,
  replaceExtension,
  renderTable,
  rot47,
  sanitizeFilename,
  sanitizeUrl,
  shellQuote,
  strOrNone,
  strToInt,
  stripOrNone,
  subtitlesFilename,
  truncateString,
  unescapeHTML,
  unifiedStrdate,
  unifiedTimestamp,
  updateUrlQuery,
  uppercaseEscape,
  urlBasename,
  urlencodePostdata,
  urljoin,
  urlOrNone,
  urshift,
  variadic,
  versionTuple,
} from "../yt_dlp/utils/utils.ts";

describe("deprecated utility compatibility", () => {
  test("bytes/int list conversion", () => {
    expect(bytesToIntlist(Uint8Array.from([0, 1, 255]))).toEqual([0, 1, 255]);
    expect(intlistToBytes([0, 1, 255])).toEqual(Uint8Array.from([0, 1, 255]));
  });

  test("jwtEncodeHs256 returns three base64 parts", () => {
    const token = new TextDecoder().decode(
      jwtEncodeHs256({ sub: "1" }, "secret"),
    );
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
    expect(
      handleYoutubedlHeaders({
        "Accept-Encoding": "gzip",
        "Youtubedl-No-Compression": "1",
        Other: "ok",
      }),
    ).toEqual({ Other: "ok" });
  });

  test("filename and option shims are identity transforms", () => {
    expect(encodeFilename("abc")).toBe("abc");
    expect(decodeFilename("abc")).toBe("abc");
    expect(decodeOption(Uint8Array.from([0x61, 0x62, 0x63]))).toBe("abc");
    expect(errorToCompatStr(new Error("boom"))).toBe("Error: boom");
  });

  test("requestToUrl", () => {
    expect(requestToUrl("https://example.com/")).toBe("https://example.com/");
    expect(requestToUrl(new URL("https://example.com/path"))).toBe(
      "https://example.com/path",
    );
    expect(requestToUrl(new Request("https://example.com/request"))).toBe(
      "https://example.com/request",
    );
  });

  test("joinNonempty", () => {
    expect(joinNonempty("title", null, "section", { delim: " - " })).toBe(
      "title - section",
    );
    expect(
      joinNonempty("title", "missing", {
        from_dict: { title: "Name" },
        delim: ":",
      }),
    ).toBe("Name");
  });
});

describe("general utility helpers", () => {
  test("determineExt and mime mapping", () => {
    expect(determineExt("https://example.com/video.mp4?x=1")).toBe("mp4");
    expect(determineExt("https://example.com/no-extension", "unknown")).toBe(
      "unknown",
    );
    expect(mimetype2ext("video/mp4; codecs=avc1")).toBe("mp4");
  });

  test("removeStart/removeEnd", () => {
    expect(removeStart("foobar", "foo")).toBe("bar");
    expect(removeStart("foobar", "bar")).toBe("foobar");
    expect(removeEnd("foobar", "bar")).toBe("foo");
    expect(removeEnd("foobar", "foo")).toBe("foobar");
    expect(removeQuotes('"value"')).toBe("value");
    expect(removeQuotes("'value'")).toBe("value");
    expect(removeQuotes("'value\"")).toBe("'value\"");
  });

  test("URL helpers", () => {
    expect(urljoin("https://example.com/a/b", "../c")).toBe(
      "https://example.com/c",
    );
    expect(urlOrNone("https://example.com/path")).toBe(
      "https://example.com/path",
    );
    expect(urlOrNone("//example.com/path")).toBe("//example.com/path");
    expect(urlOrNone("rtmpte://example.com/live")).toBe(
      "rtmpte://example.com/live",
    );
    expect(urlOrNone("not a url")).toBeNull();
    expect(
      updateUrlQuery("https://example.com/path?a=1", { a: "2", b: ["x", "y"] }),
    ).toBe("https://example.com/path?a=2&b=x&b=y");
    expect(parseQs("https://example.com/path?a=1&a=2&b=x")).toEqual({
      a: ["1", "2"],
      b: ["x"],
    });
    expect(parseQs("a=1")).toEqual({});
    expect(urlBasename("https://example.com/a/video.mp4?x=1")).toBe(
      "video.mp4",
    );
    expect(urlBasename("https://example.com/a/video.mp4/")).toBe("video.mp4");
    expect(baseUrl("http://foo.de/bar/baz?x=z/x/c")).toBe("http://foo.de/bar/");
    expect(sanitizeUrl("//example.com/video")).toBe("http://example.com/video");
    expect(sanitizeUrl("example.com/video", { scheme: "https" })).toBe(
      "https://example.com/video",
    );
    expect(extractBasicAuth("https://user:pass@example.com/path")).toEqual([
      "https://example.com/path",
      { Authorization: "Basic dXNlcjpwYXNz" },
    ]);
    expect(iriToUri("http://тест.рф/фрагмент")).toBe(
      "http://xn--e1aybc.xn--p1ai/%D1%84%D1%80%D0%B0%D0%B3%D0%BC%D0%B5%D0%BD%D1%82",
    );
  });

  test("urlencodePostdata", () => {
    expect(urlencodePostdata({ a: 1, b: true, c: null }).toString()).toBe(
      "a=1&b=true",
    );
  });

  test("parseM3u8Attributes", () => {
    expect(
      parseM3u8Attributes(
        'BANDWIDTH=1280000,RESOLUTION="1920x1080",CODECS="avc1,mp4a"',
      ),
    ).toEqual({
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
    expect(mergeDicts({ a: 1, b: null }, { b: 2, c: 3 })).toEqual({
      b: 2,
      c: 3,
      a: 1,
    });
    expect(variadic("x")).toEqual(["x"]);
    expect(variadic(["x", "y"])).toEqual(["x", "y"]);
  });

  test("format and truncate helpers", () => {
    expect(formatSeconds(65)).toBe("1:05");
    expect(formatSeconds(3661.25, ":", true)).toBe("1:01:01.250");
    expect(truncateString("abcdefghijklmnopqrstuvwxyz", 5, 5)).toBe(
      "ab...vwxyz",
    );
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
    expect(parseDuration("3 hours, 11 mins, 53 secs")).toBe(11513);
    expect(parseDuration("87 Min.")).toBe(5220);
  });

  test("media parsers", () => {
    expect(parseFilesize("1.5MiB")).toBe(1572864);
    expect(parseFilesize("1,24 KB")).toBe(1240);
    expect(parseResolution("1920x1080")).toEqual({ width: 1920, height: 1080 });
    expect(parseResolution("1920×1080")).toEqual({ width: 1920, height: 1080 });
    expect(parseResolution("1920, 1080")).toEqual({ width: 1920, height: 1080 });
    expect(parseResolution("720p")).toEqual({ height: 720 });
    expect(parseResolution("4k")).toEqual({ height: 2160 });
    expect(parseResolution("1920w", { lenient: true })).toEqual({ width: 1920 });
    expect(parseBitrate("video 4500 kbps")).toBe(4500);
    expect(mimetype2ext(null)).toBeNull();
    expect(mimetype2ext("application/x-mpegURL")).toBe("m3u8");
    expect(parseCodecs("avc1.77.30, mp4a.40.2")).toEqual({
      vcodec: "avc1.77.30",
      acodec: "mp4a.40.2",
      dynamic_range: null,
    });
    expect(parseCodecs("vp9.2")).toEqual({
      vcodec: "vp9.2",
      acodec: "none",
      dynamic_range: "HDR10",
    });
    expect(
      getCompatibleExt({
        vcodecs: [null],
        acodecs: [null],
        vexts: ["mp4"],
        aexts: ["m4a"],
      }),
    ).toBe("mp4");
    expect(
      getCompatibleExt({
        vcodecs: [null],
        acodecs: [null],
        vexts: ["mp4"],
        aexts: ["webm"],
      }),
    ).toBe("mkv");
    const q = qualities(["small", "medium", "large"]);
    expect(q("medium")).toBe(1);
    expect(q("missing")).toBe(-1);
  });

  test("CLI option helpers", () => {
    expect(cliOption({ path: "file" }, "--path", "path")).toEqual([
      "--path",
      "file",
    ]);
    expect(cliOption({ path: "file" }, "--path", "path", "=")).toEqual([
      "--path=file",
    ]);
    expect(cliBoolOption({ enabled: false }, "--enabled", "enabled")).toEqual([
      "--enabled",
      "false",
    ]);
    expect(
      cliValuelessOption({ verbose: true }, "--verbose", "verbose"),
    ).toEqual(["--verbose"]);
  });

  test("path and shell helpers", () => {
    expect(sanitizeFilename("")).toBe("");
    expect(sanitizeFilename("abc/de")).toBe("abc⧸de");
    expect(sanitizeFilename("abc/<>\\*|de", { is_id: false })).toBe("abc_de");
    expect(sanitizeFilename("this: that", { is_id: false })).toBe("this - that");
    expect(sanitizeFilename("New World record at 0:12:34")).toBe("New World record at 0_12_34");
    expect(sanitizeFilename("--gasdgf", { is_id: false })).toBe("_-gasdgf");
    expect(sanitizeFilename("aäb中国的c", { restricted: true })).toBe("aab_c");
    expect(replaceExtension("file.webm", "mp4")).toBe("file.mp4");
    expect(prependExtension("file.webm", "temp")).toBe("file.temp.webm");
    expect(subtitlesFilename("file.webm", "en", "vtt")).toBe(
      "file.en.vtt.webm",
    );
    expect(shellQuote(["echo", "hello world"])).toBe("echo 'hello world'");
    expect(argsToStr(["echo", "hello world"])).toBe("echo 'hello world'");
    expect(orderedSet(["a", "b", "a"])).toEqual(["a", "b"]);
  });

  test("version helper", () => {
    expect(isOutdatedVersion("1.2.0", "1.3.0")).toBe(true);
    expect(isOutdatedVersion("1.3.0", "1.2.0")).toBe(false);
    expect(versionTuple("1.2-3")).toEqual([1, 2, 3]);
    expect(limitLength("foo bar baz asd", 12)).toBe("foo bar b...");
  });

  test("podcast URL cleaner", () => {
    expect(
      cleanPodcastUrl(
        "https://chtbl.com/track/123/https://example.com/audio.mp3",
      ),
    ).toBe("https://example.com/audio.mp3");
  });

  test("misc parity helpers", () => {
    expect(monthByName("December")).toBe(12);
    expect(monthByName("décembre", "fr")).toBe(12);
    expect(uppercaseEscape("\\U0001d550")).toBe("𝕐");
    expect(lowercaseEscape("\\u0026")).toBe("&");
    expect(formatBytes(1024)).toBe("1.00kB");
    expect(ageRestricted(18, 17)).toBe(true);
    expect(ageRestricted(18, 18)).toBe(false);
    expect(isHtml("<!DOCTYPE html><html></html>")).toBe(true);
    expect(isHtml(Uint8Array.from([0x49, 0x44, 0x43, 0x3c, 0x68, 0x74, 0x6d, 0x6c]))).toBe(false);
    expect(isHtml(Uint8Array.from([0xef, 0xbb, 0xbf, 0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50, 0x45]))).toBe(true);
    expect(encodeBaseN(255, 16, "0123456789abcdef")).toBe("ff");
    expect(caesar("abc", "abc", 1)).toBe("bca");
    expect(rot47("youtube-dl")).toBe("J@FEF36\\5=");
    expect(urshift(-1, 1)).toBe(2147483647);
  });

  test("renderTable", () => {
    expect(renderTable(["a", "empty", "bcd"], [[123, "", 4], [9999, "", 51]])).toBe(
      "a    empty bcd\n123        4\n9999       51",
    );
    expect(renderTable(["a", "empty", "bcd"], [[123, "", 4], [9999, "", 51]], { hide_empty: true })).toBe(
      "a    bcd\n123  4\n9999 51",
    );
    expect(renderTable(["\ta", "bcd"], [["1\t23", 4], ["\t9999", 51]])).toBe(
      "   a bcd\n1 23 4\n9999 51",
    );
    expect(renderTable(["a", "bcd"], [[123, 4], [9999, 51]], { delim: "-" })).toBe(
      "a    bcd\n--------\n123  4\n9999 51",
    );
    expect(renderTable(["a", "bcd"], [[123, 4], [9999, 51]], { delim: "-", extra_gap: 2 })).toBe(
      "a      bcd\n----------\n123    4\n9999   51",
    );
  });

  test("dfxp2srt converts TTML timing, spans, style and UTF-16 input", () => {
    expect(parseDfxpTimeExpr(null)).toBeNull();
    expect(parseDfxpTimeExpr("00:00:01:100")).toBe(1.1);
    const dfxpData = `<?xml version="1.0" encoding="UTF-8"?>
      <tt xmlns="http://www.w3.org/ns/ttml"><body><div>
        <p begin="0" end="1">The following line contains Chinese characters and special symbols</p>
        <p begin="1" end="2">第二行<br/>♪♪</p>
        <p begin="2" dur="1"><span>Third<br/>Line</span></p>
        <p begin="3" end="-1">Lines with invalid timestamps are ignored</p>
      </div></body></tt>`;
    expect(dfxp2srt(dfxpData)).toBe(`1
00:00:00,000 --> 00:00:01,000
The following line contains Chinese characters and special symbols

2
00:00:01,000 --> 00:00:02,000
第二行
♪♪

3
00:00:02,000 --> 00:00:03,000
Third
Line

`);
    const styled = `<?xml version="1.0" encoding="utf-8"?>
<tt xmlns="http://www.w3.org/2006/10/ttaf1" xmlns:tts="http://www.w3.org/2006/10/ttaf1#style">
  <head><styling>
    <style id="s2" style="s0" tts:color="cyan" tts:fontWeight="bold" />
    <style id="s1" style="s0" tts:color="yellow" tts:fontStyle="italic" />
    <style id="s3" style="s0" tts:color="lime" tts:textDecoration="underline" />
    <style id="s0" tts:fontStyle="normal" tts:fontSize="16" tts:fontFamily="sansSerif" tts:color="white" />
  </styling></head>
  <body style="s0"><div>
    <p begin="00:00:02.08" end="00:00:05.84">default style<span tts:color="red">custom style</span></p>
    <p style="s2" begin="00:00:02.08" end="00:00:05.84"><span tts:color="lime">part 1<br /></span><span tts:color="cyan">part 2</span></p>
    <p style="s3" begin="00:00:05.84" end="00:00:09.56">line 3<br />part 3</p>
    <p style="s1" tts:textDecoration="underline" begin="00:00:09.56" end="00:00:12.36"><span style="s2" tts:color="lime">inner<br /> </span>style</p>
  </div></body>
</tt>`;
    expect(dfxp2srt(styled)).toBe(`1
00:00:02,080 --> 00:00:05,840
<font color="white" face="sansSerif" size="16">default style<font color="red">custom style</font></font>

2
00:00:02,080 --> 00:00:05,840
<b><font color="cyan" face="sansSerif" size="16"><font color="lime">part 1
</font>part 2</font></b>

3
00:00:05,840 --> 00:00:09,560
<u><font color="lime">line 3
part 3</font></u>

4
00:00:09,560 --> 00:00:12,360
<i><u><font color="yellow"><font color="lime">inner
 </font>style</font></u></i>

`);
    const utf16 = Uint8Array.from([
      0xff,
      0xfe,
      ...Buffer.from(
        `<?xml version="1.0" encoding="UTF-16"?><tt><body><div><p begin="0" end="1">Line 1</p></div></body></tt>`,
        "utf16le",
      ),
    ]);
    expect(dfxp2srt(utf16)).toContain("Line 1");
  });

  test("paged list helpers", () => {
    const getPage = (page: number) => {
      const first = page * 2;
      return [first, first + 1].filter((item) => item < 5);
    };
    const onDemand = new OnDemandPagedList(getPage, 2);
    const inAdvance = new InAdvancePagedList(getPage, 3, 2);
    expect(onDemand.getslice()).toEqual([0, 1, 2, 3, 4]);
    expect(onDemand.getslice(1, 4)).toEqual([1, 2, 3]);
    expect(inAdvance.getslice(2, 99)).toEqual([2, 3, 4]);
    expect(inAdvance.at(4)).toBe(4);
  });

  test("matchStr filter expressions", () => {
    expect(matchStr("x", { x: 0 })).toBe(true);
    expect(matchStr("!xy", { x: 1200 })).toBe(true);
    expect(matchStr("x>1K", { x: 1200 })).toBe(true);
    expect(matchStr("x>2K", { x: 1200 })).toBe(false);
    expect(matchStr("x>=1200 & x < 1300", { x: 1200 })).toBe(true);
    expect(matchStr("x > 1:0:0", { x: 3700 })).toBe(true);
    expect(matchStr("y=foobar42", { y: "foobar42" })).toBe(true);
    expect(matchStr("y^=foo", { y: "foobar42" })).toBe(true);
    expect(matchStr("y!*=baz", { y: "foobar42" })).toBe(true);
    expect(matchStr(String.raw`x~=\bbar`, { x: "foo bar" })).toBe(true);
    expect(matchStr(String.raw`x~=(?i)^FOO`, { x: "foo bar" })).toBe(true);
  });
});
