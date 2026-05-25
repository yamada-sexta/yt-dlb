// Source: selected cases from test/test_utils.py and yt_dlp/utils/_deprecated.py

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  compat_HTMLParseError,
  compatEtreeFromstring,
  type XmlElement,
} from "../yt_dlp/compat/index.ts";
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
  loadPlugins,
  makeHTTPSHandler,
  processCommunicateOrKill,
  requestToUrl,
  sanitizedRequest,
} from "../yt_dlp/utils/legacy.ts";
import {
  _UnsafeExtensionError,
  ageRestricted,
  argsToStr,
  baseUrl,
  caesar,
  cleanHtml,
  cleanPodcastUrl,
  cliBoolOption,
  cliConfigurationArgs,
  cliOption,
  cliValuelessOption,
  configurationArgs,
  Config,
  DateRange,
  dateFromStr,
  detectExeVersion,
  decodePackedCodes,
  datetimeFromStr,
  datetimeRound,
  determineProtocol,
  dfxp2srt,
  encodeBaseN,
  determineExt,
  determineFileEncoding,
  extractTimezone,
  expandPath,
  escapeHTML,
  escapeRfc3986,
  extractBasicAuth,
  extractAttributes,
  filterDict,
  floatOrNone,
  FormatSorter,
  findXpathAttr,
  fixXmlAmpersands,
  formatBytes,
  formatField,
  formatSeconds,
  frange,
  GeoUtils,
  HTTPHeaderDict,
  InAdvancePagedList,
  getCompatibleExt,
  getElementByAttribute,
  getElementByClass,
  getElementHtmlByAttribute,
  getElementHtmlByClass,
  getElementById,
  getElementsByAttribute,
  getElementsByClass,
  getElementsHtmlByAttribute,
  getElementsHtmlByClass,
  getElementsTextAndHtmlByAttribute,
  getElementTextAndHtmlByTag,
  intOrNone,
  iriToUri,
  isHtml,
  isOutdatedVersion,
  jsToJson,
  jwtDecodeHs256,
  jwtEncode,
  joinNonempty,
  LazyList,
  locked_file,
  NO_DEFAULT,
  OnDemandPagedList,
  matchStr,
  limitLength,
  lowercaseEscape,
  makeArchiveId,
  mergeDicts,
  mimetype2ext,
  monthByName,
  multipartEncode,
  normalizeUrl,
  numberOfDigits,
  ohdaveRsaEncrypt,
  orderedSet,
  orderedSetFromOptions,
  pkcs1pad,
  parseList,
  parseBitrate,
  parseBytes,
  parseCodecs,
  parseDfxpTimeExpr,
  parseDuration,
  parseFilesize,
  parseHttpRange,
  parseAgeLimit,
  parseIso8601,
  parseM3u8Attributes,
  parseCount,
  parseQs,
  readBatchUrls,
  parseResolution,
  partialApplication,
  prependExtension,
  qualities,
  removeEnd,
  removeDotSegments,
  removeQuotes,
  removeStart,
  replaceExtension,
  renderTable,
  rot47,
  sanitizeFilename,
  sanitizePath,
  sanitizeUrl,
  scaleThumbnailsToMaxFormatWidth,
  shellQuote,
  smuggleUrl,
  strOrNone,
  strToInt,
  stripJsonp,
  stripOrNone,
  strftimeOrNone,
  subtitlesFilename,
  timetupleFromMsec,
  timeconvert,
  truncateString,
  tryCall,
  unescapeHTML,
  unifiedStrdate,
  unifiedTimestamp,
  unsmuggleUrl,
  updateUrl,
  updateUrlQuery,
  uppercaseEscape,
  urlBasename,
  urlencodePostdata,
  urljoin,
  urlOrNone,
  urshift,
  variadic,
  versionTuple,
  xpathAttr,
  xpathElement,
  xpathText,
  xpathWithNs,
  KNOWN_EXTENSIONS,
  MEDIA_EXTENSIONS,
  POSTPROCESS_WHEN,
} from "../yt_dlp/utils/utils.ts";

function utf16Le(value: string): Uint8Array {
  return Uint8Array.from([...value].flatMap((char) => {
    const code = char.charCodeAt(0);
    return [code & 0xff, code >> 8];
  }));
}

function utf32Be(value: string): Uint8Array {
  return Uint8Array.from([...value].flatMap((char) => {
    const code = char.codePointAt(0) ?? 0;
    return [(code >> 24) & 0xff, (code >> 16) & 0xff, (code >> 8) & 0xff, code & 0xff];
  }));
}

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
  test("loadPlugins populates namespace when plugin loading is disabled", async () => {
    const previous = process.env.YTDLP_NO_PLUGINS;
    process.env.YTDLP_NO_PLUGINS = "1";
    const namespace = { Existing: class Existing {} };
    try {
      await expect(loadPlugins("extractor", "IE", namespace)).resolves.toEqual({});
      expect(Object.keys(namespace)).toEqual(["Existing"]);
    } finally {
      if (previous === undefined) {
        delete process.env.YTDLP_NO_PLUGINS;
      } else {
        process.env.YTDLP_NO_PLUGINS = previous;
      }
    }
  });

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
    const request = sanitizedRequest("https://user:pass@example.com/path");
    expect(request.url).toBe("https://example.com/path");
    expect(request.headers.get("Authorization")).toBe("Basic dXNlcjpwYXNz");
    const typoRequest = sanitizedRequest("httpss://example.com/path", {
      headers: { Existing: "ok" },
    });
    expect(typoRequest.url).toBe("https://example.com/path");
    expect(typoRequest.headers.get("Existing")).toBe("ok");
  });

  test("legacy handler and subprocess shims", () => {
    const handler = makeHTTPSHandler({
      nocheckcertificate: true,
      compat_opts: ["no-certifi"],
    });
    expect(handler.params.nocheckcertificate).toBe(true);
    expect(handler.options.verify).toBe(false);
    expect(handler.options.use_certifi).toBe(false);
    expect(processCommunicateOrKill({
      communicate_or_kill: (...args: unknown[]) => args,
    }, "x")).toEqual(["x"]);
    let killed = false;
    expect(() =>
      processCommunicateOrKill({
        communicate: () => {
          throw new Error("boom");
        },
        kill: () => {
          killed = true;
        },
      }),
    ).toThrow("boom");
    expect(killed).toBe(true);
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

describe("XML utility compatibility", () => {
  test("findXpathAttr matches descendant elements by attribute", () => {
    const doc = compatEtreeFromstring(`<root>
      <node/>
      <node x="a"/>
      <node x="a" y="c"/>
      <node x="b" y="d"/>
      <node x=""/>
    </root>`);

    expect(findXpathAttr(doc, ".//fourohfour", "n")).toBeNull();
    expect(findXpathAttr(doc, ".//fourohfour", "n", "v")).toBeNull();
    expect(findXpathAttr(doc, ".//node", "n")).toBeNull();
    expect(findXpathAttr(doc, ".//node", "n", "v")).toBeNull();
    expect(findXpathAttr(doc, ".//node", "x")).toBe(doc.children[1] as XmlElement);
    expect(findXpathAttr(doc, ".//node", "x", "a")).toBe(doc.children[1] as XmlElement);
    expect(findXpathAttr(doc, ".//node", "x", "b")).toBe(doc.children[3] as XmlElement);
    expect(findXpathAttr(doc, ".//node", "y")).toBe(doc.children[2] as XmlElement);
    expect(findXpathAttr(doc, ".//node", "y", "c")).toBe(doc.children[2] as XmlElement);
    expect(findXpathAttr(doc, ".//node", "y", "d")).toBe(doc.children[3] as XmlElement);
    expect(findXpathAttr(doc, ".//node", "x", "")).toBe(doc.children[4] as XmlElement);
  });

  test("xpathWithNs qualifies namespace-prefixed path parts", () => {
    const doc = compatEtreeFromstring(`<root xmlns:media="http://example.com/">
      <media:song>
        <media:author>The Author</media:author>
        <url>http://server.com/download.mp3</url>
      </media:song>
    </root>`);
    const qualify = (path: string) =>
      xpathElement(doc, xpathWithNs(path, { media: "http://example.com/" })) as
        | XmlElement
        | null;

    expect(qualify("media:song")).not.toBeNull();
    expect(qualify("media:song/media:author")?.text).toBe("The Author");
    expect(qualify("media:song/url")?.text).toBe(
      "http://server.com/download.mp3",
    );
    expect(() => xpathWithNs("media:song", {})).toThrow(
      "Unknown XML namespace prefix media",
    );
  });

  test("xpath element, text, attr, and XML ampersand helpers", () => {
    const doc = compatEtreeFromstring(`<root><div><p x="a">Foo</p></div></root>`);
    const p = doc.children[0]?.children[0] as XmlElement;

    expect(xpathElement(doc, "div/p")).toBe(p);
    expect(xpathElement(doc, ["div/bar", "div/p"])).toBe(p);
    expect(xpathElement(doc, "div/bar", null, { defaultValue: "default" })).toBe(
      "default",
    );
    expect(xpathElement(doc, "div/bar")).toBeNull();
    expect(() => xpathElement(doc, "div/bar", null, { fatal: true })).toThrow(
      "Could not find XML element",
    );

    expect(xpathText(doc, "div/p")).toBe("Foo");
    expect(xpathText(doc, "div/bar", null, { defaultValue: "default" })).toBe(
      "default",
    );
    expect(xpathText(doc, "div/bar")).toBeNull();
    expect(() => xpathText(doc, "div/bar", null, { fatal: true })).toThrow(
      "Could not find XML element",
    );

    expect(xpathAttr(doc, "div/p", "x")).toBe("a");
    expect(xpathAttr(doc, "div/bar", "x")).toBeNull();
    expect(xpathAttr(doc, "div/p", "y")).toBeNull();
    expect(xpathAttr(doc, "div/bar", "x", null, { defaultValue: "default" })).toBe(
      "default",
    );
    expect(() => xpathAttr(doc, "div/p", "y", null, { fatal: true })).toThrow(
      "Could not find XML attribute",
    );

    expect(fixXmlAmpersands('"&x=y&z=a')).toBe('"&amp;x=y&amp;z=a');
    expect(fixXmlAmpersands("&amp;&apos;&gt;&lt;&quot;")).toBe(
      "&amp;&apos;&gt;&lt;&quot;",
    );
    expect(fixXmlAmpersands("&#1234;&#x1abC;")).toBe("&#1234;&#x1abC;");
    expect(fixXmlAmpersands("&#&#")).toBe("&amp;#&amp;#");
  });
});

describe("general utility helpers", () => {
  test("determineExt and mime mapping", () => {
    expect(determineExt("https://example.com/video.mp4?x=1")).toBe("mp4");
    expect(determineExt("https://example.com/foo/bar.mp4/?download")).toBe("mp4");
    expect(determineExt("https://example.com/foo/bar.m3u8//?download")).toBe("m3u8");
    expect(determineExt("https://example.com/no-extension", "unknown")).toBe(
      "unknown",
    );
    expect(determineExt("https://example.com/foo/bar.nonext/?download", null)).toBeNull();
    expect(determineExt("https://example.com/foo/bar/mp4?download", null)).toBeNull();
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
    expect(urljoin(new TextEncoder().encode("http://foo.de/"), "/a/b/c.txt")).toBe("http://foo.de/a/b/c.txt");
    expect(urljoin("http://foo.de/", new TextEncoder().encode("/a/b/c.txt"))).toBe("http://foo.de/a/b/c.txt");
    expect(urljoin(null, "http://foo.de/a/b/c.txt")).toBe("http://foo.de/a/b/c.txt");
    expect(urljoin("http://foo.de/", null)).toBeNull();
    expect(urljoin("http://foo.de/", "")).toBeNull();
    expect(urljoin("//foo.de/", "/a/b/c.txt")).toBe("//foo.de/a/b/c.txt");
    expect(urljoin("http://foo.de/a/b/c.txt", ".././../d.txt")).toBe("http://foo.de/d.txt");
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
    expect(() =>
      updateUrl("https://example.com/path", {
        query: "a=1",
        query_update: { b: "2" },
      }),
    ).toThrow("query_update and query cannot be specified at the same time");
    expect(
      parseQs(updateUrlQuery("http://example.com/path", {
        quality: ["HD"],
        format: ["mp4"],
      })),
    ).toEqual(parseQs("http://example.com/path?quality=HD&format=mp4"));
    expect(
      parseQs(updateUrlQuery("http://example.com/path", { system: ["LINUX", "WINDOWS"] })),
    ).toEqual(parseQs("http://example.com/path?system=LINUX&system=WINDOWS"));
    expect(
      parseQs(updateUrlQuery("http://example.com/path", { fields: ["id,formats,subtitles", "thumbnails"] })),
    ).toEqual(parseQs("http://example.com/path?fields=id,formats,subtitles&fields=thumbnails"));
    expect(
      parseQs(updateUrlQuery("http://example.com/path?manifest=f4m", { manifest: [] })),
    ).toEqual(parseQs("http://example.com/path"));
    expect(
      parseQs(updateUrlQuery("http://example.com/path?system=LINUX&system=WINDOWS", { system: "LINUX" })),
    ).toEqual(parseQs("http://example.com/path?system=LINUX"));
    expect(
      parseQs(updateUrlQuery("http://example.com/path", {
        fields: new TextEncoder().encode("id,formats,subtitles"),
      })),
    ).toEqual(parseQs("http://example.com/path?fields=id,formats,subtitles"));
    expect(
      parseQs(updateUrlQuery("http://example.com/path", { width: 1080, height: 720 })),
    ).toEqual(parseQs("http://example.com/path?width=1080&height=720"));
    expect(
      parseQs(updateUrlQuery("http://example.com/path", { bitrate: 5020.43 })),
    ).toEqual(parseQs("http://example.com/path?bitrate=5020.43"));
    expect(
      parseQs(updateUrlQuery("http://example.com/path", { test: "第二行тест" })),
    ).toEqual(parseQs("http://example.com/path?test=%E7%AC%AC%E4%BA%8C%E8%A1%8C%D1%82%D0%B5%D1%81%D1%82"));
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
    expect(sanitizeUrl("httpss://foo.bar")).toBe("https://foo.bar");
    expect(sanitizeUrl("rmtps://foo.bar")).toBe("rtmps://foo.bar");
    expect(sanitizeUrl("foo bar", { scheme: "https" })).toBe("foo bar");
    expect(extractBasicAuth("https://user:pass@example.com/path")).toEqual([
      "https://example.com/path",
      "Basic dXNlcjpwYXNz",
    ]);
    expect(extractBasicAuth("http://:foo.bar")).toEqual(["http://:foo.bar", null]);
    expect(extractBasicAuth("http://foo.bar")).toEqual(["http://foo.bar", null]);
    expect(extractBasicAuth("http://@foo.bar")).toEqual(["http://foo.bar", "Basic Og=="]);
    expect(extractBasicAuth("http://:pass@foo.bar")).toEqual(["http://foo.bar", "Basic OnBhc3M="]);
    expect(extractBasicAuth("http://user:@foo.bar")).toEqual(["http://foo.bar", "Basic dXNlcjo="]);
    expect(iriToUri("http://тест.рф/фрагмент")).toBe(
      "http://xn--e1aybc.xn--p1ai/%D1%84%D1%80%D0%B0%D0%B3%D0%BC%D0%B5%D0%BD%D1%82",
    );
    expect(escapeRfc3986("foo bar")).toBe("foo%20bar");
    expect(escapeRfc3986("тест")).toBe("%D1%82%D0%B5%D1%81%D1%82");
    expect(normalizeUrl("http://тест.рф/фрагмент")).toBe(
      "http://xn--e1aybc.xn--p1ai/%D1%84%D1%80%D0%B0%D0%B3%D0%BC%D0%B5%D0%BD%D1%82",
    );
    expect(normalizeUrl("http://www.example.com/../a/b/../c/./d.html")).toBe(
      "http://www.example.com/a/c/d.html",
    );
    expect(removeDotSegments("/a/b/c/./../../g")).toBe("/a/g");
    expect(removeDotSegments("mid/content=5/../6")).toBe("mid/6");
    const originalUrl = "https://foo.bar/baz?x=y#a";
    const smuggledUrl = smuggleUrl(originalUrl, { "ö": "ö", abc: [3] });
    expect(unsmuggleUrl(smuggledUrl)).toEqual([originalUrl, { "ö": "ö", abc: [3] }]);
    expect(unsmuggleUrl(originalUrl, null as never)).toEqual([originalUrl, null]);
    const doubleSmuggled = smuggleUrl(smuggleUrl(originalUrl, { a: "b" }), { c: "d" });
    expect(unsmuggleUrl(doubleSmuggled)).toEqual([originalUrl, { a: "b", c: "d" }]);
  });

  test("urlencodePostdata", () => {
    expect(urlencodePostdata({ a: 1, b: true, c: null }).toString()).toBe(
      "a=1&b=true",
    );
  });

  test("multipartEncode and stripJsonp", () => {
    expect(new TextDecoder().decode(multipartEncode({ field: "value" }, "AAAAAA")[0])).toBe(
      '--AAAAAA\r\nContent-Disposition: form-data; name="field"\r\n\r\nvalue\r\n--AAAAAA--\r\n',
    );
    expect(() => multipartEncode({ field: "value" }, "value")).toThrow(
      "Boundary occurs in data",
    );
    expect(JSON.parse(stripJsonp('cb ([ {"id":"532cb",\n\n\n"x":\n3}\n]\n);'))).toEqual([
      { id: "532cb", x: 3 },
    ]);
    expect(JSON.parse(stripJsonp('parseMetadata({"STATUS":"OK"})\n\n\n//epc'))).toEqual({
      STATUS: "OK",
    });
    expect(JSON.parse(stripJsonp('ps.embedHandler({"status": "success"});'))).toEqual({
      status: "success",
    });
    expect(JSON.parse(stripJsonp('window.cb && cb({"status": "success"});'))).toEqual({
      status: "success",
    });
    expect(JSON.parse(stripJsonp('({"status": "success"});'))).toEqual({
      status: "success",
    });
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
    expect(intOrNone(10, 0.1)).toBe(100);
    expect(intOrNone({ scale: 10 })(100)).toBe(10);
    expect(intOrNone({ scale: 0.1 })(10)).toBe(100);
    expect(intOrNone({ get_attr: "value" })({ value: "42" })).toBe(42);
    expect(intOrNone({ default: 7 })(null)).toBe(7);
    expect(floatOrNone("12.5")).toBe(12.5);
    expect(floatOrNone(null, 1, 7)).toBe(7);
    expect(floatOrNone({ scale: 1000 })(1234)).toBe(1.234);
    expect(floatOrNone({ invscale: 1000 })("1.5")).toBe(1500);
    expect(floatOrNone({ default: 7 })("")).toBe(7);
    expect(strToInt("1,234")).toBe(1234);
    expect(strToInt("abc")).toBeNull();
    expect(parseAgeLimit(null)).toBeNull();
    expect(parseAgeLimit(false)).toBeNull();
    expect(parseAgeLimit(18)).toBe(18);
    expect(parseAgeLimit(22)).toBeNull();
    expect(parseAgeLimit("18+")).toBe(18);
    expect(parseAgeLimit("PG-13")).toBe(13);
    expect(parseAgeLimit("TV-MA")).toBe(17);
    expect(parseAgeLimit("TV14")).toBe(14);
    expect(parseAgeLimit("TV_G")).toBe(0);
  });

  test("string option helpers", () => {
    expect(strOrNone(10)).toBe("10");
    expect(strOrNone(null, "fallback")).toBe("fallback");
    expect(stripOrNone("  value  ")).toBe("value");
    expect(stripOrNone("  ", "fallback")).toBe("fallback");
    expect(tryCall(null)).toBeNull();
    expect(tryCall(() => 1)).toBe(1);
    expect(tryCall(() => 1, { expected_type: (value): value is number => typeof value === "number" })).toBe(1);
    expect(tryCall(() => 1, { expected_type: (value): value is Record<string, unknown> => typeof value === "object" && value !== null })).toBeNull();
    expect(tryCall((...items: unknown[]) => items.map(Number).reduce((left, right) => left + right, 0), { args: [0, 1, 0], expected_type: (value): value is number => typeof value === "number" })).toBe(1);
    expect(tryCall(() => ({}), () => 42, { expected_type: (value): value is number => typeof value === "number" })).toBe(42);
    const partial = partialApplication((value: number, scale: number) => value / scale);
    expect(typeof partial()).toBe("function");
    expect(partial(10, 0.1)).toBe(100);
    expect((partial(10) as (scale: number) => number)(0.1)).toBe(100);
  });

  test("dict helpers", () => {
    expect(filterDict({ a: 1, b: null, c: 0 })).toEqual({ a: 1, c: 0 });
    expect(mergeDicts({ a: 1, b: null }, { b: 2, c: 3 })).toEqual({
      a: 1,
      b: 2,
      c: 3,
    });
    expect(mergeDicts({ a: 1 }, { a: 2 })).toEqual({ a: 1 });
    expect(mergeDicts({ a: "" }, { a: 1 })).toEqual({ a: "" });
    expect(mergeDicts({ a: "" }, { a: "abc" })).toEqual({ a: "abc" });
    expect(mergeDicts({ a: null }, { a: "" }, { a: "abc" })).toEqual({ a: "abc" });
    expect(variadic("x")).toEqual(["x"]);
    expect(variadic(["x", "y"])).toEqual(["x", "y"]);
    expect(variadic(null)).toEqual([null]);
    expect(variadic(new Set(["x", "y"]))).toEqual(["x", "y"]);
    const headers = new HTTPHeaderDict({ "content-type": "text/plain" });
    headers.set("Content-Type", "application/json");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.has("CONTENT-TYPE")).toBe(true);
    headers.set("ytdl-test", new Uint8Array([48]));
    expect([...headers.entries()]).toContainEqual(["Ytdl-Test", "0"]);
    expect(headers.sensitive()["ytdl-test"]).toBe("0");
    headers.set("Ytdl-test", 2);
    expect(headers.sensitive()["Ytdl-test"]).toBe("2");
    headers.update({ "X-dlp": " data; " });
    expect(headers.get("x-DLP")).toBe("data;");
    const mergedHeaders = new HTTPHeaderDict({ "Ytdl-TeSt": 1 }, { "Ytdl-test": 2 });
    expect([...mergedHeaders.entries()]).toEqual([["Ytdl-Test", "2"]]);
    expect(mergedHeaders.sensitive()["Ytdl-test"]).toBe("2");
    const iterableHeaders = new HTTPHeaderDict([["X-dlp", "data3"]], headers, [["X-dlP", "data2"]]);
    expect(iterableHeaders.get("x-dlp")).toBe("data2");
    expect(iterableHeaders.sensitive()["X-dlP"]).toBe("data2");
    expect(iterableHeaders.setdefault("x-dlp", "ignored")).toBe("data2");
    expect(iterableHeaders.setdefault("x-new", 5)).toBe("5");
    expect(iterableHeaders.pop("X-New")).toBe("5");
  });

  test("format and truncate helpers", () => {
    expect(formatSeconds(65)).toBe("1:05");
    expect(formatSeconds(3661.25, ":", true)).toBe("1:01:01.250");
    expect(formatField({ id: "abc" }, "id", "ID:%s")).toBe("ID:abc");
    expect(formatField({ id: "" }, "id", "ID:%s")).toBe("");
    expect(formatField({ id: 0 }, "id", "ID:%s")).toBe("");
    expect(formatField({ id: 0 }, "id", "ID:%s", null)).toBe("ID:0");
    expect(formatField({ id: "skip" }, "id", "ID:%s", ["skip", "other"])).toBe("");
    expect(formatField(5, null, "ID:%s", NO_DEFAULT, "", (value) => Number(value) + 1)).toBe("ID:6");
    expect([...frange(3)]).toEqual([0, 1, 2]);
    expect([...frange(1, 3, 0.5)]).toEqual([1, 1.5, 2, 2.5]);
    expect([...frange(3, 1, -1)]).toEqual([3, 2]);
    expect([...frange(1, 3, -1)]).toEqual([]);
    expect(numberOfDigits(0)).toBe(1);
    expect(numberOfDigits(1234)).toBe(4);
    expect(numberOfDigits(-1234)).toBe(5);
    expect(timetupleFromMsec(3661250)).toEqual({
      hours: 1,
      minutes: 1,
      seconds: 1,
      milliseconds: 250,
    });
    expect(truncateString("abcdefghijklmnopqrstuvwxyz", 5, 5)).toBe(
      "ab...vwxyz",
    );
    expect(() => truncateString("abcdef", 3)).toThrow("left > 3");
    expect(() => truncateString("abcdef", 4, -1)).toThrow("right >= 0");
    expect(makeArchiveId("ZDF", "abc")).toBe("zdf abc");
    expect(makeArchiveId({ IE_NAME: "ZDF:Channel" }, 123)).toBe("zdf:channel 123");
    class MyIE {
      readonly instanceState = true;

      static ieKey(): string {
        return "MyIE";
      }
    }
    expect(makeArchiveId(new MyIE(), "id")).toBe("myie id");
  });

  test("HTML helpers", () => {
    expect(escapeHTML("<a&b>")).toBe("&lt;a&amp;b&gt;");
    expect(unescapeHTML("&lt;a&amp;b&gt;")).toBe("<a&b>");
    expect(unescapeHTML("&#39;&#x27;&wrong;")).toBe("''&wrong;");
    expect(unescapeHTML("&Eacute;ric")).toBe("Éric");
    expect(unescapeHTML("&eacute;")).toBe("é");
    expect(unescapeHTML("&#2013266066;")).toBe("&#2013266066;");
    expect(unescapeHTML("&a&quot;")).toBe('&a"');
    expect(unescapeHTML("&period;&apos;")).toBe(".'");
    expect(cleanHtml("<p>Hello<br>world</p>")).toBe("Hello\nworld");
    expect(cleanHtml("a:\nb")).toBe("a: b");
    expect(cleanHtml('a:\n   "b"')).toBe('a: "b"');
    expect(cleanHtml("a<br>\u00a0b")).toBe("a\nb");
    expect(getElementById("x", '<div id="x">Text</div>')).toBe("Text");
    expect(getElementByClass("a", '<div class="b a">Text</div>')).toBe("Text");
    const classHtml = '<span class="foo bar">nice</span>';
    expect(getElementByClass("foo", classHtml)).toBe("nice");
    expect(getElementByClass("no-such-class", classHtml)).toBeNull();
    expect(getElementHtmlByClass("foo", classHtml)).toBe(classHtml);
    expect(getElementByAttribute("class", "foo bar", classHtml)).toBe("nice");
    expect(getElementByAttribute("class", "foo", classHtml)).toBeNull();
    expect(getElementHtmlByAttribute("class", "foo bar", classHtml)).toBe(classHtml);
    const itempropHtml = '<div itemprop="author" itemscope>foo</div>';
    expect(getElementByAttribute("itemprop", "author", itempropHtml)).toBe("foo");
    expect(getElementHtmlByAttribute("itemprop", "author", itempropHtml)).toBe(itempropHtml);
    const repeatedClassHtml = '<span class="foo bar">nice</span><span class="foo bar">also nice</span>';
    const repeatedClassElements: [string, string] = [
      '<span class="foo bar">nice</span>',
      '<span class="foo bar">also nice</span>',
    ];
    expect(getElementsByClass("foo", repeatedClassHtml)).toEqual(["nice", "also nice"]);
    expect(getElementsHtmlByClass("foo", repeatedClassHtml)).toEqual(repeatedClassElements);
    expect(getElementsByAttribute("class", "foo bar", repeatedClassHtml)).toEqual(["nice", "also nice"]);
    expect(getElementsHtmlByAttribute("class", "foo bar", repeatedClassHtml)).toEqual(repeatedClassElements);
    expect(getElementsTextAndHtmlByAttribute("class", "foo bar", repeatedClassHtml)).toEqual([
      ["nice", repeatedClassElements[0]],
      ["also nice", repeatedClassElements[1]],
    ]);
    expect(getElementsTextAndHtmlByAttribute("class", "foo", '<a class="foo">nice</a><span class="foo">nice</span>', { tag: "a" })).toEqual([
      ["nice", '<a class="foo">nice</a>'],
    ]);
    const nestedTagHtml = `
    random text lorem ipsum</p>
    <div>
        this should be returned
        <span>this should also be returned</span>
        <div>
            this should also be returned
        </div>
        closing tag above should not trick, so this should also be returned
    </div>
    but this text should not be returned
    `;
    const [outerText, outerHtml] = getElementTextAndHtmlByTag("div", nestedTagHtml);
    expect(outerHtml?.trim().startsWith("<div>")).toBe(true);
    expect(outerText).toContain("closing tag above should not trick");
    expect(outerText).not.toContain("but this text should not be returned");
    expect(getElementTextAndHtmlByTag("span", nestedTagHtml)[0]?.trim()).toBe("this should also be returned");
    expect(() => getElementTextAndHtmlByTag("article", nestedTagHtml)).toThrow(compat_HTMLParseError);
    expect(extractAttributes('<div data-id="1" disabled class=test>')).toEqual({
      "data-id": "1",
      disabled: null,
      class: "test",
    });
    expect(extractAttributes('<e x="&#121;">')).toEqual({ x: "y" });
    expect(extractAttributes('<e x="&#x79;">')).toEqual({ x: "y" });
    expect(extractAttributes('<e x="&amp;">')).toEqual({ x: "&" });
    expect(extractAttributes('<e x="&pound;">')).toEqual({ x: "£" });
    expect(extractAttributes('<e x="&lambda;">')).toEqual({ x: "λ" });
    expect(extractAttributes('<e x="&foo">')).toEqual({ x: "&foo" });
    expect(extractAttributes('<e x >')).toEqual({ x: null });
    expect(extractAttributes('<e x=1 y=2 x=3>')).toEqual({ y: "2", x: "3" });
    expect(extractAttributes('<e \nx=\n"y"\n>')).toEqual({ x: "y" });
    expect(extractAttributes('<e CAPS=x>')).toEqual({ caps: "x" });
    expect(extractAttributes('<e _:funny-name1=1>')).toEqual({ "_:funny-name1": "1" });
    expect(extractAttributes('<mal"formed/>')).toEqual({});
    expect(getElementByClass("a", '<div class="a">1<div class="a">2</div></div>')).toBe("12");
    expect(parseList('<li data-id="1">One</li><li><span><li data-id="nested"></li></span></li><li data-id="3" disabled>Three</li>')).toEqual([
      { "data-id": "1" },
      {},
      { "data-id": "3", disabled: null },
    ]);
  });

  test("date and time parsers", () => {
    expect(timeconvert("")).toBeNull();
    expect(timeconvert("bougrg")).toBeNull();
    expect(dateFromStr("20200229+365day").toISOString()).toBe(dateFromStr("20200229+1year").toISOString());
    expect(dateFromStr("20210131+28day").toISOString()).toBe(dateFromStr("20210131+1month").toISOString());
    expect(datetimeFromStr("20210131+59day", "day")?.toISOString()).toBe(datetimeFromStr("20210131+2month", "auto")?.toISOString());
    expect(datetimeFromStr("now+1day", "hour")?.getUTCHours()).toBe(datetimeFromStr("now+24hours", "auto")?.getUTCHours());
    expect(datetimeRound(new Date("1820-05-12T01:23:45Z")).toISOString()).toBe("1820-05-12T00:00:00.000Z");
    expect(datetimeRound(new Date("1969-12-31T23:34:45Z"), "hour").toISOString()).toBe("1970-01-01T00:00:00.000Z");
    expect(datetimeRound(new Date("2024-12-25T01:23:45Z"), "minute").toISOString()).toBe("2024-12-25T01:24:00.000Z");
    expect(datetimeRound(new Date("2024-12-25T01:23:45.123Z"), "second").toISOString()).toBe("2024-12-25T01:23:45.000Z");
    expect(datetimeRound(new Date("2024-12-25T01:23:45.678Z"), "second").toISOString()).toBe("2024-12-25T01:23:46.000Z");
    expect(strftimeOrNone(-4722192000)).toBe("18200512");
    expect(strftimeOrNone(0)).toBe("19700101");
    expect(strftimeOrNone(1735084800)).toBe("20241225");
    expect(strftimeOrNone(1735084800000)).toBeNull();
    const twentiethCentury = new DateRange("19000101", "20000101");
    expect(twentiethCentury.includes("17890714")).toBe(false);
    expect(new DateRange("00010101").includes("19690721")).toBe(true);
    expect(new DateRange(null, "10000101").includes("07110427")).toBe(true);
    expect(new DateRange("00010101").start.getUTCFullYear()).toBe(1);
    expect(DateRange.day("20240525").includes("20240525")).toBe(true);
    expect(DateRange.day("20240525").includes("20240526")).toBe(false);
    expect(new DateRange("20240525", "20240526").toString()).toBe("2024-05-25 to 2024-05-26");
    expect(new DateRange("20240525", "20240526").equals(new DateRange("20240525", "20240526"))).toBe(true);
    expect(() => new DateRange("20240526", "20240525")).toThrow("start date must be before");
    expect(parseIso8601("0001-01-01T00:00:00Z")).toBe(-62135596800);
    expect(parseIso8601("2014-03-23T23:04:26+0100")).toBe(1395612266);
    expect(parseIso8601("2014-03-23T23:04:26-07:00")).toBe(1395641066);
    expect(parseIso8601("2014-03-23T23:04:26", { timezone: -7 * 3600 })).toBe(1395641066);
    expect(parseIso8601("2014-03-23T23:04:26", { timezone: NO_DEFAULT })).toBeNull();
    expect(parseIso8601("2014-03-23T23:04:26-07:00", { timezone: -10 * 3600 })).toBe(1395641066);
    expect(parseIso8601("2014-03-23T22:04:26+0000")).toBe(1395612266);
    expect(parseIso8601("2014-03-23T22:04:26Z")).toBe(1395612266);
    expect(parseIso8601("2014-03-23T22:04:26.1234Z")).toBe(1395612266);
    expect(parseIso8601("1970-01-01T00:00:01Z")).toBe(1);
    expect(parseIso8601("2015-09-29T08:27:31.727")).toBe(1443515251);
    expect(parseIso8601("2015-09-29T08-27-31.727")).toBeNull();
    expect(unifiedTimestamp("1970-01-01 00:00:01")).toBe(1);
    expect(unifiedStrdate("2020-02-03")).toBe("20200203");
    expect(unifiedStrdate("8/7/2009")).toBe("20090708");
    expect(unifiedStrdate("11/26/2014 11:30:00 AM PST", false)).toBe("20141126");
    expect(unifiedStrdate("Feb 14th 2016 5:45PM")).toBe("20160214");
    expect(unifiedTimestamp("December 21, 2010")).toBe(1292889600);
    expect(unifiedTimestamp("8/7/2009")).toBe(1247011200);
    expect(unifiedTimestamp("Dec 14, 2012")).toBe(1355443200);
    expect(unifiedTimestamp("2012/10/11 01:56:38 +0000")).toBe(1349920598);
    expect(unifiedTimestamp("1968 12 10")).toBe(-33436800);
    expect(unifiedTimestamp("25-09-2014")).toBe(1411603200);
    expect(unifiedTimestamp("27.02.2016 17:30")).toBe(1456594200);
    expect(unifiedTimestamp("UNKNOWN DATE FORMAT")).toBeNull();
    expect(unifiedTimestamp("28/01/2014 21:00:00 +0100")).toBe(1390939200);
    expect(unifiedTimestamp("11/26/2014 11:30:00 AM PST", false)).toBe(1417001400);
    expect(unifiedTimestamp("2/2/2015 6:47:40 PM", false)).toBe(1422902860);
    expect(unifiedTimestamp("Feb 14th 2016 5:45PM")).toBe(1455471900);
    expect(unifiedTimestamp("May 16, 2016 11:15 PM")).toBe(1463440500);
    expect(unifiedTimestamp("Feb 7, 2016 at 6:35 pm")).toBe(1454870100);
    expect(unifiedTimestamp("2017-03-30T17:52:41Q")).toBe(1490896361);
    expect(unifiedTimestamp("Sep 11, 2013 | 5:49 AM")).toBe(1378878540);
    expect(unifiedTimestamp("December 15, 2017 at 7:49 am")).toBe(1513324140);
    expect(unifiedTimestamp("2018-03-14T08:32:43.1493874+00:00")).toBe(1521016363);
    expect(unifiedTimestamp("Sunday, 26 Nov 2006, 19:00")).toBe(1164567600);
    expect(unifiedTimestamp("wed, aug 16, 2008, 12:00pm")).toBe(1218931200);
    expect(unifiedTimestamp("December 31 1969 20:00:01 EDT")).toBe(1);
    expect(unifiedTimestamp("Wednesday 31 December 1969 18:01:26 MDT")).toBe(86);
    expect(unifiedTimestamp("12/31/1969 20:01:18 EDT", false)).toBe(78);
    expect(unifiedTimestamp("2026-01-01 00:00:00", true, 8)).toBe(1767196800);
    expect(unifiedTimestamp("2026-01-01 00:00:00 +0800", true, -5)).toBe(1767196800);
    expect(extractTimezone("December 31 1969 20:00:01 EDT")).toEqual([-4 * 3600, "December 31 1969 20:00:01"]);
    expect(extractTimezone("2014-03-23T23:04:26-07:00")).toEqual([-7 * 3600, "2014-03-23T23:04:26"]);
    expect(parseDuration("1:02:03")).toBe(3723);
    expect(parseDuration("1 hour 2 minutes 3 seconds")).toBe(3723);
    expect(parseDuration("PT0H12M23S")).toBe(743);
    expect(parseDuration("PT34M39.23S")).toBe(2079.23);
    expect(parseDuration("3 hours, 11 mins, 53 secs")).toBe(11513);
    expect(parseDuration("87 Min.")).toBe(5220);
    expect(parseDuration("1337:12")).toBe(80232);
    expect(parseDuration("01:02:03.05")).toBe(3723.05);
    expect(parseDuration("T30M38S")).toBe(1838);
    expect(parseDuration("PT1H0.040S")).toBe(3600.04);
    expect(parseDuration("PT00H03M30SZ")).toBe(210);
    expect(parseDuration("P0Y0M0DT0H4M20.880S")).toBe(260.88);
    expect(parseDuration("01:02:03:04")).toBe(93784);
    expect(parseDuration("01:02:03:050")).toBe(3723.05);
    expect(parseDuration("103:050")).toBe(103.05);
    expect(parseDuration("1HR 3MIN")).toBe(3780);
    expect(parseDuration("2hrs 3mins")).toBe(7380);
  });

  test("media parsers", () => {
    expect(parseFilesize("1.5MiB")).toBe(1572864);
    expect(parseFilesize(null)).toBeNull();
    expect(parseFilesize("")).toBeNull();
    expect(parseFilesize("91 B")).toBe(91);
    expect(parseFilesize("foobar")).toBeNull();
    expect(parseFilesize("2 MiB")).toBe(2097152);
    expect(parseFilesize("5 GB")).toBe(5000000000);
    expect(parseFilesize("1,24 KB")).toBe(1240);
    expect(parseFilesize("1,24 kb")).toBe(1240);
    expect(parseFilesize("1.2Tb")).toBe(1200000000000);
    expect(parseFilesize("1.2tb")).toBe(1200000000000);
    expect(parseFilesize("8.5 megabytes")).toBe(8500000);
    expect(parseBytes("1.5M")).toBe(1572864);
    expect(parseBytes("1,5M")).toBeNull();
    expect(parseBytes("1 KB")).toBeNull();
    expect(parseCount(null)).toBeNull();
    expect(parseCount("")).toBeNull();
    expect(parseCount("0")).toBe(0);
    expect(parseCount("1000")).toBe(1000);
    expect(parseCount("1.000")).toBe(1000);
    expect(parseCount("1.2 thousand")).toBe(12);
    expect(parseCount("1.1k")).toBe(1100);
    expect(parseCount("1.1 k")).toBe(1100);
    expect(parseCount("1,1 k")).toBe(1100);
    expect(parseCount("1.1kk")).toBe(1100000);
    expect(parseCount("1.1kk ")).toBe(1100000);
    expect(parseCount("1,1kk")).toBe(1100000);
    expect(parseCount("100 views")).toBe(100);
    expect(parseCount("1,100 views")).toBe(1100);
    expect(parseCount("1.1kk views")).toBe(1100000);
    expect(parseCount("10M views")).toBe(10000000);
    expect(parseCount("has 10M views")).toBe(10000000);
    expect(parseResolution("1920x1080")).toEqual({ width: 1920, height: 1080 });
    expect(parseResolution("1920×1080")).toEqual({ width: 1920, height: 1080 });
    expect(parseResolution("1920 x 1080")).toEqual({ width: 1920, height: 1080 });
    expect(parseResolution("1920, 1080")).toEqual({ width: 1920, height: 1080 });
    expect(parseResolution("720p")).toEqual({ height: 720 });
    expect(parseResolution("4k")).toEqual({ height: 2160 });
    expect(parseResolution("8K")).toEqual({ height: 4320 });
    expect(parseResolution("pre_1920x1080_post")).toEqual({ width: 1920, height: 1080 });
    expect(parseResolution("ep1x2")).toEqual({});
    expect(parseResolution("1920w", { lenient: true })).toEqual({ width: 1920 });
    expect(parseBitrate("video 4500 kbps")).toBe(4500);
    expect(mimetype2ext(null)).toBeNull();
    expect(mimetype2ext("application/x-mpegURL")).toBe("m3u8");
    expect(mimetype2ext("video/x-flv")).toBe("flv");
    expect(mimetype2ext("text/vtt;charset=utf-8")).toBe("vtt");
    expect(mimetype2ext("text/html; charset=utf-8")).toBe("html");
    expect(mimetype2ext("audio/x-wav;codec=pcm")).toBe("wav");
    expect(mimetype2ext("video/3gpp")).toBe("3gp");
    expect(mimetype2ext("image/jpeg")).toBe("jpg");
    expect(mimetype2ext("application/ttml+xml")).toBe("ttml");
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
    const format: Record<string, unknown> = {
      url: "https://example.com/video.mp4",
      vcodec: "h264",
      acodec: "aac",
      height: 720,
      width: 1280,
      format_id: "720p",
    };
    const sorter = new FormatSorter({ params: { format_sort: ["res"] } });
    const preference = sorter.calculate_preference(format);
    expect(preference.length).toBeGreaterThan(1);
    expect(format.protocol).toBe("https");
    expect(format.video_ext).toBe("mp4");
    expect(format.audio_ext).toBe("none");
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
    expect(cliConfigurationArgs(["--compat"], ["default"], [], true)).toEqual(["--compat"]);
    expect(cliConfigurationArgs(["--compat"], ["default"], [], false)).toEqual([]);
    expect(cliConfigurationArgs({ default: ["--a"], "external+ffmpeg_i": ["--b"] }, [["external", "ffmpeg"], "default"])).toEqual(["--a"]);
    expect(configurationArgs("external", { "external+ffmpeg": ["--ffmpeg"], external: ["--external"], default: ["--default"] }, "ffmpeg")).toEqual(["--ffmpeg"]);
    expect(configurationArgs("external", { external: ["--external"], ffmpeg: ["--ffmpeg"], default: ["--default"] }, "ffmpeg")).toEqual(["--external", "--ffmpeg"]);
    expect(configurationArgs("external", ["--compat"], "ffmpeg", [""], [], false)).toEqual([]);
    expect(Config.hideLoginInfo(["-u", "foo", "-p", "bar"])).toEqual(["-u", "PRIVATE", "-p", "PRIVATE"]);
    expect(Config.hideLoginInfo(["--username=foo"])).toEqual(["--username=PRIVATE"]);
    const parser = {
      parse_known_args: (args?: Iterable<string>) => [{ config_locations: [] }, [...(args ?? [])]],
      parse_args: (args?: Iterable<string>) => [...(args ?? [])],
    };
    const config = new Config(parser, "test");
    expect(config.init(["--foo", "bar"])).toBe(true);
    expect([...config.all_args]).toEqual(["--foo", "bar"]);
    expect(config.parse_args()).toEqual(["--foo", "bar"]);
  });

  test("path and shell helpers", () => {
    expect(sanitizeFilename("")).toBe("");
    expect(sanitizeFilename("abc/de")).toBe("abc⧸de");
    expect(sanitizeFilename("abc/<>\\*|de", { is_id: false })).toBe("abc_de");
    expect(sanitizeFilename("this: that", { is_id: false })).toBe("this - that");
    expect(sanitizeFilename("New World record at 0:12:34")).toBe("New World record at 0_12_34");
    expect(sanitizeFilename("--gasdgf", { is_id: false })).toBe("_-gasdgf");
    expect(sanitizeFilename("aäb中国的c", { restricted: true })).toBe("aab_c");
    expect(sanitizeFilename("abc/de", { restricted: true })).toBe("abc_de");
    expect(sanitizeFilename("yes? no", { restricted: true })).toBe("yes_no");
    expect(sanitizeFilename("this: that", { restricted: true })).toBe("this_-_that");
    expect(sanitizeFilename("大声带 - Song", { restricted: true })).toBe("Song");
    expect(sanitizeFilename("总统: Speech", { restricted: true })).toBe("Speech");
    expect(sanitizeFilename("_n_cd26wFpw", { is_id: true })).toBe("_n_cd26wFpw");
    expect(sanitizeFilename("N0Y__7-UOdI", { is_id: true })).toBe("N0Y__7-UOdI");
    expect(sanitizePath("abc/def")).toBe("abc\\def");
    expect(sanitizePath("abc\\def")).toBe("abc\\def");
    expect(sanitizePath("abc|def")).toBe("abc#def");
    expect(sanitizePath('<>:"|?*')).toBe("#######");
    expect(sanitizePath("C:/abc/def")).toBe("C:\\abc\\def");
    expect(sanitizePath("C?:/abc/def")).toBe("C##\\abc\\def");
    expect(sanitizePath("\\\\?\\UNC\\ComputerName\\abc")).toBe("\\\\?\\UNC\\ComputerName\\abc");
    expect(sanitizePath("\\\\?\\UNC/ComputerName/abc")).toBe("\\\\?\\UNC\\ComputerName\\abc");
    expect(sanitizePath("\\\\?\\C:\\abc")).toBe("\\\\?\\C:\\abc");
    expect(sanitizePath("\\\\?\\C:/abc")).toBe("\\\\?\\C:\\abc");
    expect(sanitizePath("\\\\?\\C:\\ab?c\\de:f")).toBe("\\\\?\\C:\\ab#c\\de#f");
    expect(sanitizePath("youtube/%(uploader)s/%(autonumber)s-%(title)s-%(upload_date)s.%(ext)s")).toBe("youtube\\%(uploader)s\\%(autonumber)s-%(title)s-%(upload_date)s.%(ext)s");
    expect(sanitizePath("youtube/TheWreckingYard ./00001-Not bad, Especially for Free! (1987 Yamaha 700)-20141116.mp4.part")).toBe("youtube\\TheWreckingYard #\\00001-Not bad, Especially for Free! (1987 Yamaha 700)-20141116.mp4.part");
    expect(sanitizePath("abc/def...")).toBe("abc\\def..#");
    expect(sanitizePath("abc.../def")).toBe("abc..#\\def");
    expect(sanitizePath("abc.../def...")).toBe("abc..#\\def..#");
    expect(sanitizePath("C:\\abc:%(title)s.%(ext)s")).toBe("C:\\abc#%(title)s.%(ext)s");
    for (const [input, expected] of [
      ["C:\\", "C:\\"],
      ["../abc", "..\\abc"],
      ["../../abc", "..\\..\\abc"],
      ["./abc", "abc"],
      ["./../abc", "..\\abc"],
      ["\\abc", "\\abc"],
      ["C:abc", "C:abc"],
      ["C:abc\\..\\", "C:"],
      ["C:abc\\..\\def\\..\\..\\", "C:.."],
      ["C:\\abc\\xyz///..\\def\\", "C:\\abc\\def"],
      ["abc/../", "."],
      ["./abc/../", "."],
    ] as const) {
      const result = sanitizePath(input);
      expect(result).toBe(expected);
      expect(sanitizePath(result)).toBe(result);
    }
    const oldEnvPath = process.env.yt_dlp_EXPATH_PATH;
    const oldHome = process.env.HOME;
    try {
      process.env.yt_dlp_EXPATH_PATH = "expanded";
      process.env.HOME = "C:\\Documents and Settings\\\u0442\u0435\u0441\u0442\\Application Data";
      expect(expandPath("$yt_dlp_EXPATH_PATH")).toBe("expanded");
      expect(expandPath("%yt_dlp_EXPATH_PATH%")).toBe("expanded");
      expect(expandPath("$HOME")).toBe(process.env.HOME);
      expect(expandPath("%HOME%")).toBe(process.env.HOME);
      expect(expandPath("~")).toBe(process.env.HOME);
      expect(expandPath("~/$yt_dlp_EXPATH_PATH")).toBe(`${process.env.HOME}/expanded`);
      expect(expandPath("~/%yt_dlp_EXPATH_PATH%")).toBe(`${process.env.HOME}/expanded`);
    } finally {
      if (oldEnvPath === undefined) {
        delete process.env.yt_dlp_EXPATH_PATH;
      } else {
        process.env.yt_dlp_EXPATH_PATH = oldEnvPath;
      }
      if (oldHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = oldHome;
      }
    }
    expect(determineFileEncoding(new Uint8Array())).toEqual([null, 0]);
    expect(determineFileEncoding(new TextEncoder().encode("--verbose -x --audio-format mkv\n"))).toEqual([null, 0]);
    expect(determineFileEncoding(Uint8Array.from([0xef, 0xbb, 0xbf]))).toEqual(["utf-8", 3]);
    expect(determineFileEncoding(Uint8Array.from([0x00, 0x00, 0xfe, 0xff]))).toEqual(["utf-32-be", 4]);
    expect(determineFileEncoding(Uint8Array.from([0xff, 0xfe, 0x00, 0x00]))).toEqual(["utf-32-le", 4]);
    expect(determineFileEncoding(Uint8Array.from([0xff, 0xfe]))).toEqual(["utf-16-le", 2]);
    expect(determineFileEncoding(Uint8Array.from([0xfe, 0xff]))).toEqual(["utf-16-be", 2]);
    expect(determineFileEncoding(Uint8Array.from([0xff, 0xfe, ...utf16Le("# coding: utf-8\n--verbose")]))).toEqual(["utf-16-le", 2]);
    expect(determineFileEncoding(new TextEncoder().encode("#coding:utf-8\n--verbose"))).toEqual(["utf-8", 0]);
    expect(determineFileEncoding(new TextEncoder().encode("#  coding:   utf-8   \r\n--verbose"))).toEqual(["utf-8", 0]);
    expect(determineFileEncoding(new TextEncoder().encode("# coding: someencodinghere-12345\n--verbose"))).toEqual(["someencodinghere-12345", 0]);
    expect(determineFileEncoding(utf32Be("# coding: utf-32-be"))).toEqual(["utf-32-be", 0]);
    expect(determineFileEncoding(utf16Le("# coding: utf-16-le"))).toEqual(["utf-16-le", 0]);
    const configDir = mkdtempSync(join(tmpdir(), "ytdlb-config-"));
    try {
      const missingDefault = ["--fallback"];
      expect(Config.readFile(join(configDir, "missing.conf"), missingDefault)).toBe(missingDefault);
      const utf8Config = join(configDir, "utf8.conf");
      writeFileSync(utf8Config, "--verbose # ignored\n--audio-format 'best opus'\n");
      expect(Config.readFile(utf8Config)).toEqual(["--verbose", "--audio-format", "best opus"]);
      const bomConfig = join(configDir, "bom.conf");
      writeFileSync(bomConfig, Uint8Array.from([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("--extract-audio")]));
      expect(Config.readFile(bomConfig)).toEqual(["--extract-audio"]);
      const utf16Config = join(configDir, "utf16.conf");
      writeFileSync(utf16Config, utf16Le("# coding: utf-16-le\n--audio-format mkv"));
      expect(Config.readFile(utf16Config)).toEqual(["--audio-format", "mkv"]);
    } finally {
      rmSync(configDir, { recursive: true, force: true });
    }
    expect(replaceExtension("file.webm", "mp4")).toBe("file.mp4");
    expect(prependExtension("file.webm", "temp")).toBe("file.temp.webm");
    expect(replaceExtension("file.bin", "bin")).toBe("file.unknown_video");
    expect(replaceExtension("file.webm", "description")).toBe("file.description");
    expect(() => replaceExtension("file.webm", "unsafe/ext")).toThrow(_UnsafeExtensionError);
    expect(() => prependExtension("file.webm", "unsafe/ext")).toThrow(_UnsafeExtensionError);
    expect(subtitlesFilename("file.webm", "en", "vtt")).toBe("file.en.vtt");
    expect(subtitlesFilename("file.unexpected_ext", "en", "vtt", "webm")).toBe("file.unexpected_ext.en.vtt");
    expect(shellQuote(["echo", "hello world"])).toBe("echo 'hello world'");
    expect(argsToStr(["echo", "hello world"])).toBe("echo 'hello world'");
    expect(orderedSet([1, 1, 2, 3, 4, 4, 5, 6, 7, 3, 5])).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(orderedSet([])).toEqual([]);
    expect(orderedSet([1])).toEqual([1]);
    expect(orderedSet([135, 1, 1, 1])).toEqual([135, 1]);
    expect(orderedSet(["a", "b", "a"])).toEqual(["a", "b"]);
    expect(orderedSet([[1], [1], [2]])).toEqual([[1], [2]]);
    let generated = 0;
    const lazy = orderedSet(function* () {
      generated += 1;
      yield 1;
      generated += 1;
      yield 1;
      generated += 1;
      yield 2;
    }(), { lazy: true });
    expect(generated).toBe(0);
    const lazyIterator = lazy[Symbol.iterator]();
    expect(lazyIterator.next()).toEqual({ value: 1, done: false });
    expect(generated).toBe(1);
    expect(lazyIterator.next()).toEqual({ value: 2, done: false });
    expect(lazyIterator.next()).toEqual({ value: undefined, done: true });
    expect(generated).toBe(3);
    expect(orderedSetFromOptions(["all", "-b", "c"], { all: ["a", "b", "c"], all_alias: ["a", "b"] })).toEqual(["a", "c"]);
    expect(readBatchUrls("\uFEFF foo\n  bar\r\nbaz\n# comment\n; comment\nbam")).toEqual(["foo", "bar", "baz", "bam"]);
  });

  test("locked_file", () => {
    const text = "test_locked_file\n";
    const dir = mkdtempSync(join(tmpdir(), "ytdlb-locked-file-"));
    const file = join(dir, "test_locked_file.ytdl");
    try {
      for (const lockMode of ["w", "a", "r"]) {
        const outer = new locked_file(file, lockMode, false);
        try {
          if (lockMode === "r") {
            expect(outer.read()).toBe(text.repeat(2));
          } else {
            outer.write(text);
          }
          for (const testMode of ["w", "a", "r"]) {
            const testingWrite = testMode !== "r";
            try {
              const inner = new locked_file(file, testMode, false);
              inner.close();
              expect(testingWrite).toBe(false);
            } catch (error) {
              expect((error as Error).name).toBe("BlockingIOError");
              expect(testingWrite).toBe(true);
            }
          }
        } finally {
          outer.close();
        }
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
    expect(POSTPROCESS_WHEN).toContain("post_process");
    expect(MEDIA_EXTENSIONS.video).toContain("mp4");
    expect(KNOWN_EXTENSIONS).toContain("m3u8");
    expect(decodePackedCodes("}('0 1 2',3,3,'foo|bar|baz'.split('|')")).toBe("foo bar baz");
    expect(GeoUtils.randomIPv4("127.0.0.0/32")).toBe("127.0.0.0");
    expect(GeoUtils.randomIPv4("ZZ")).toBeNull();
    expect(monthByName("December")).toBe(12);
    expect(monthByName("décembre", "fr")).toBe(12);
    expect(uppercaseEscape("\\U0001d550")).toBe("𝕐");
    expect(lowercaseEscape("\\u0026")).toBe("&");
    const rsaModulus = BigInt("0xab86b6371b5318aaa1d3c9e612a9f1264f372323c8c0f19875b5fc3b3fd3afcc1e5bec527aa94bfa85bffc157e4245aebda05389a5357b75115ac94f074aefcd");
    expect(ohdaveRsaEncrypt(new TextEncoder().encode("aa111222"), 65537, rsaModulus)).toBe(
      "726664bd9a23fd0c70f9f1b84aab5e3905ce1e45a584e9cbcf9bcc7510338fc1986d6c599ff990d923aa43c51c0d9013cd572e13bc58f4ae48f2ed8c0b0ba881",
    );
    const padded = pkcs1pad(Uint8Array.from([1, 2, 3]), 32);
    expect([...padded.slice(0, 2)]).toEqual([0, 2]);
    expect([...padded.slice(28)]).toEqual([0, 1, 2, 3]);
    expect(() => pkcs1pad(Uint8Array.from([1, 2, 3]), 8)).toThrow("Input data too long");
    expect(formatBytes(0)).toBe("0.00B");
    expect(formatBytes(1000)).toBe("1000.00B");
    expect(formatBytes(1024)).toBe("1.00KiB");
    expect(formatBytes(1024 ** 2)).toBe("1.00MiB");
    expect(formatBytes(1024 ** 3)).toBe("1.00GiB");
    expect(formatBytes(1024 ** 4)).toBe("1.00TiB");
    expect(formatBytes(1024 ** 5)).toBe("1.00PiB");
    expect(formatBytes(1024 ** 6)).toBe("1.00EiB");
    expect(formatBytes(1024 ** 7)).toBe("1.00ZiB");
    expect(formatBytes(1024 ** 8)).toBe("1.00YiB");
    expect(formatBytes(1024 ** 9)).toBe("1024.00YiB");
    expect(ageRestricted(18, 17)).toBe(true);
    expect(ageRestricted(18, 18)).toBe(false);
    expect(isHtml("<!DOCTYPE html><html></html>")).toBe(true);
    expect(isHtml(Uint8Array.from([0x49, 0x44, 0x43, 0x3c, 0x68, 0x74, 0x6d, 0x6c]))).toBe(false);
    expect(isHtml(Uint8Array.from([0xef, 0xbb, 0xbf, 0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50, 0x45]))).toBe(true);
    expect(encodeBaseN(255, 16, "0123456789abcdef")).toBe("ff");
    const jwt = jwtEncode({ sub: "1" }, "secret");
    expect(jwtDecodeHs256(jwt)).toEqual({ sub: "1" });
    expect(jwtEncode({ foo: "bar", qux: "baz" }, "12345678")).toBe(
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJmb28iOiJiYXIiLCJxdXgiOiJiYXoifQ.fKojvTWqnjNTbsdoDTmYNc4tgYAG3h_SWRzM77iLH0U",
    );
    expect(jwtEncode({ foo: "bar", qux: "baz" }, "12345678", { headers: { typ: "JWT", alg: "HS256" } })).toBe(
      "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJmb28iOiJiYXIiLCJxdXgiOiJiYXoifQ.slg-7COta5VOfB36p3tqV4MGPV6TTA_ouGnD48UEVq4",
    );
    expect(caesar("abc", "abc", 1)).toBe("bca");
    expect(rot47("youtube-dl")).toBe("J@FEF36\\5=");
    expect(urshift(-1, 1)).toBe(2147483647);
    expect(parseHttpRange(null)).toEqual([null, null, null]);
    expect(parseHttpRange("bytes=10-20")).toEqual([10, 20, null]);
    expect(parseHttpRange("bytes 10-20/30")).toEqual([10, 20, 30]);
    expect(parseHttpRange("items 10-20/30")).toEqual([null, null, null]);
    expect(
      scaleThumbnailsToMaxFormatWidth(
        [{ width: 640, height: 360 }, { width: 1280, height: 720 }],
        [{ url: "https://example.com/thumb/320.jpg" }, { url: "https://example.com/thumb/160.jpg", width: 160 }],
        /\d+(?=\.jpg)/,
      ),
    ).toEqual([
      { url: "https://example.com/thumb/1280.jpg", width: 1280, height: 720 },
      { url: "https://example.com/thumb/1280.jpg", width: 1280, height: 720 },
    ]);
    const thumbnails = [{ url: "https://example.com/thumb/320.jpg" }];
    expect(scaleThumbnailsToMaxFormatWidth([], thumbnails, /\d+(?=\.jpg)/)).toBe(thumbnails);
    expect(determineProtocol({ protocol: "custom", url: "http://example.com/video.mp4" })).toBe("custom");
    expect(determineProtocol({ url: "rtmps://example.com/live" })).toBe("rtmp");
    expect(determineProtocol({ url: "mms://example.com/video" })).toBe("mms");
    expect(determineProtocol({ url: "rtsp://example.com/video" })).toBe("rtsp");
    expect(determineProtocol({ url: "https://example.com/live.m3u8" })).toBe("m3u8_native");
    expect(determineProtocol({ url: "https://example.com/live.m3u8", is_live: true })).toBe("m3u8");
    expect(determineProtocol({ url: "https://example.com/manifest.f4m" })).toBe("f4m");
    expect(detectExeVersion("ffmpeg version 1.2.1\nbuilt")).toBe("1.2.1");
    expect(detectExeVersion("ffmpeg version N-63176-g1fb4685\nbuilt")).toBe("N-63176-g1fb4685");
    expect(JSON.parse(jsToJson('new Map([["a", 5]])'))).toEqual({ a: 5 });
    expect(JSON.parse(jsToJson("Array(5, 10)"))).toEqual([5, 10]);
    expect(JSON.parse(jsToJson("new Array(15,5)"))).toEqual([15, 5]);
    expect(JSON.parse(jsToJson("new Map([Array(5, 10),new Array(15,5)])"))).toEqual({ "5": 10, "15": 5 });
    expect(JSON.parse(jsToJson('new Date("123")'))).toBe("123");
    expect(JSON.parse(jsToJson("new Date('2023-10-19')"))).toBe("2023-10-19");
    const templateLiteral = ["`Hello ", "{name}`"].join("$");
    expect(jsToJson(templateLiteral, { name: '"world"' })).toBe('"Hello world"');
    expect(jsToJson(["`", "{name}`"].join("$"), {})).toBe('"name"');
    expect(JSON.parse(jsToJson('["abc", "def",]'))).toEqual(["abc", "def"]);
    expect(JSON.parse(jsToJson('[/*comment\n*/"abc"/*comment\n*/,/*comment\n*/"def",/*comment\n*/]'))).toEqual(["abc", "def"]);
    expect(JSON.parse(jsToJson('[//comment\n"abc" //comment\n,//comment\n"def",//comment\n]'))).toEqual(["abc", "def"]);
    expect(JSON.parse(jsToJson("{0xff:0xff}"))).toEqual({ "255": 255 });
    expect(JSON.parse(jsToJson("{077:077}"))).toEqual({ "63": 63 });
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
    const source = function* () {
      yield 1;
      yield 2;
      yield 3;
    };
    const lazy = new LazyList(source());
    expect(lazy.at(0)).toBe(1);
    expect(lazy.slice(1)).toEqual([2, 3]);
    expect([...lazy]).toEqual([1, 2, 3]);
    const range = (length: number) => Array.from({ length }, (_, index) => index);
    const lazyRange = new LazyList(range(10));
    expect(lazyRange.at(0)).toBe(0);
    expect(lazyRange._cache).toEqual([0]);
    expect(lazyRange.at(5)).toBe(5);
    expect(lazyRange._cache).toEqual(range(6));
    expect(lazyRange.at(-3)).toBe(7);
    expect(lazyRange._cache).toEqual(range(10));
    expect(new LazyList(range(10)).slice(5)).toEqual(range(10).slice(5));
    expect(new LazyList(range(10)).slice(undefined, undefined, 2)).toEqual([0, 2, 4, 6, 8]);
    expect(new LazyList(range(10)).slice(6, 2, -2)).toEqual([6, 4]);
    expect(new LazyList(range(10)).slice(undefined, undefined, -1)).toEqual(range(10).toReversed());
    expect([...new LazyList(range(10), true)]).toEqual(range(10).toReversed());
    const reverseLazy = new LazyList(range(10), true);
    expect(reverseLazy.at(-1)).toBe(0);
    expect(reverseLazy._cache).toEqual([0]);
    expect(reverseLazy.at(3)).toBe(6);
    expect(reverseLazy._cache).toEqual(range(10));
    function* count() {
      let index = 0;
      while (true) {
        yield index++;
      }
    }
    const infinite = new LazyList(count()).reversed();
    expect(infinite.at(-15)).toBe(14);
    expect(infinite._cache).toEqual(range(15));
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
    expect(matchStr("x~=(?i)^FOO", { x: "foo bar" })).toBe(true);
    expect(matchStr("is_live", { is_live: false })).toBe(false);
    expect(matchStr("!is_live", { is_live: false })).toBe(true);
    expect(matchStr("x>?0", {}, true)).toBe(true);
    expect(matchStr("y!=foobar2", { y: "foobar42" })).toBe(true);
    expect(matchStr("y$=42", { y: "foobar42" })).toBe(true);
    expect(matchStr('x^="foo"', { x: 'foo "bar"' })).toBe(true);
    expect(matchStr(String.raw`x$=" \"bar\""`, { x: 'foo "bar"' })).toBe(true);
    expect(matchStr(String.raw`x=foo \& bar & x^=foo`, { x: "foo & bar" })).toBe(true);
    expect(matchStr(String.raw`x="foo \& bar" & x^=foo`, { x: "foo & bar" })).toBe(true);
    expect(
      matchStr(String.raw`!is_live & like_count>?100 & description~='(?i)\bcats \& dogs\b'`, {
        description: "Raining Cats & Dogs",
      }),
    ).toBe(true);
    expect(matchStr("id!=foo", { id: "foo" }, true)).toBe(false);
    expect(matchStr("x", { id: "foo" }, true)).toBe(true);
    expect(matchStr("!x", { id: "foo" }, true)).toBe(true);
    expect(matchStr("x", { id: "foo" }, false)).toBe(false);
    expect(() => matchStr("x^=42", { x: 42 })).toThrow("only supports string values");
  });
});
