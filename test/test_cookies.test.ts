// Source: selected cases from test/test_cookies.py

import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  Cookie,
  LenientSimpleCookie,
  LinuxChromeCookieDecryptor,
  LinuxKeyring,
  YoutubeDLCookieJar,
  parseSafariCookies,
  pbkdf2Sha1,
} from "../yt_dlp/cookies.ts";

const cookieFile = join("/tmp", `ytdlb-cookie-test-${process.pid}.txt`);

const logger = {
  debug() {},
  info() {},
  warning(message: string) {
    throw new Error(message);
  },
  error(message: string) {
    throw new Error(message);
  },
};

describe("cookie helpers", () => {
  afterEach(async () => {
    await rm(cookieFile, { force: true });
  });

  test("YoutubeDLCookieJar filters cookies for URL and serializes Netscape format", async () => {
    const jar = new YoutubeDLCookieJar(cookieFile);
    jar.setCookie(new Cookie({
      name: "test",
      value: "ytdlp",
      domain: ".example.com",
      path: "/",
      secure: false,
      expires: null,
    }));
    jar.setCookie(new Cookie({
      name: "secure",
      value: "yes",
      domain: ".example.com",
      path: "/",
      secure: true,
      expires: null,
    }));

    expect(jar.getCookieHeader("http://www.example.com/")).toBe("test=ytdlp");
    expect(jar.getCookieHeader("https://www.example.com/")).toBe("test=ytdlp; secure=yes");
    expect(jar.getCookieHeader("https://other.example.invalid/")).toBeUndefined();

    await jar.save();
    const reloaded = new YoutubeDLCookieJar(cookieFile);
    await reloaded.load();
    expect(reloaded.getCookieHeader("https://www.example.com/")).toBe("test=ytdlp; secure=yes");
  });

  test("pbkdf2Sha1 matches Python fixture", () => {
    expect(pbkdf2Sha1(Buffer.from("peanuts"), Buffer.from(" ".repeat(16)), 1, 16)).toEqual(Buffer.from([
      0x67, 0xe1, 0x8e, 0x0f, 0x51, 0x1c, 0x9b, 0xf3, 0xc9, 0x60, 0x21, 0xaa, 0x90, 0xd9, 0xd3, 0x34,
    ]));
  });

  test("LinuxChromeCookieDecryptor decrypts v10 basic-text fixture", () => {
    const encrypted = Uint8Array.from([0x76, 0x31, 0x30, 0xcc, 0x57, 0x25, 0xcd, 0xe6, 0xe6, 0x9f, 0x4d, 0x22, 0x20, 0xa7, 0xb0, 0xca, 0xe4, 0x07, 0xd6]);
    const decryptor = new LinuxChromeCookieDecryptor("Chrome", logger, LinuxKeyring.BASICTEXT, 0);
    expect(decryptor.decrypt(encrypted)).toBe("USD");
  });

  test("LinuxChromeCookieDecryptor decrypts v10 meta24 fixture", () => {
    const encrypted = Uint8Array.from([
      0x76, 0x31, 0x30, 0x1f, 0xe4, 0x0e, 0x5b, 0x83, 0x0c, 0xcc, 0x2a, 0x6b, 0x50, 0x69, 0x20, 0xce,
      0x8d, 0x1d, 0xbb, 0x80, 0x0d, 0x11, 0x09, 0xbb, 0x9e, 0x5e, 0x48, 0x79, 0x94, 0xf4, 0x96, 0x33,
      0x9f, 0x82, 0xba, 0xfe, 0xa1, 0xed, 0xb9, 0xf1, 0x29, 0x00, 0x37, 0x31, 0x30, 0x92, 0xc8, 0x2f,
      0x3c, 0x96, 0x42,
    ]);
    const decryptor = new LinuxChromeCookieDecryptor("Chrome", logger, LinuxKeyring.BASICTEXT, 24);
    expect(decryptor.decrypt(encrypted)).toBe("DE");
  });

  test("parseSafariCookies parses Python fixture", () => {
    const data = Buffer.concat([
      Buffer.from("cook", "binary"),
      Buffer.from([
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x69, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00,
        0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x59, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x38, 0x00, 0x00, 0x00, 0x42, 0x00, 0x00, 0x00,
        0x46, 0x00, 0x00, 0x00, 0x48, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x80, 0x03, 0xa5, 0x3e, 0xc3, 0x41, 0x00, 0x00, 0x80, 0xc3, 0x07, 0x3a, 0xc3, 0x41,
      ]),
      Buffer.from("localhost\0foo\0/\0test%20%3Bcookie\0", "binary"),
      Buffer.from([
        0x00, 0x00, 0x00, 0x05, 0x34, 0x07, 0x17, 0x20, 0x05, 0x00, 0x00, 0x00, 0x4b,
      ]),
      Buffer.from("bplist00", "binary"),
      Buffer.from([
        0xd1, 0x01, 0x02, 0x5f, 0x10, 0x18,
      ]),
      Buffer.from("NSHTTPCookieAcceptPolicy", "binary"),
      Buffer.from([
        0x10, 0x02, 0x08, 0x0b, 0x26, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x01, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x28,
      ]),
    ]);

    const jar = parseSafariCookies(data, undefined, logger);
    const cookies = [...jar];
    const [cookie] = cookies;
    expect(cookies).toHaveLength(1);
    expect(cookie).toMatchObject({
      domain: "localhost",
      path: "/",
      name: "foo",
      value: "test%20%3Bcookie",
      secure: false,
      expires: Date.UTC(2021, 5, 18, 21, 39, 19) / 1000,
    });
  });

  test.each([
    ["basic cookie", "chips=ahoy; vienna=finger", { chips: "ahoy", vienna: "finger" }],
    ["allow '=' in an unquoted value", "keebler=E=mc2", { keebler: "E=mc2" }],
    ["allow ':' in names", "key:term=value:term", { "key:term": "value:term" }],
    ["allow brackets in values", "a=b; c=[; d=r; f=h", { a: "b", c: "[", d: "r", f: "h" }],
    ["keep last value", "a=c; a=b", { a: "b" }],
    ["ignore cookies without a name", "a=b; unnamed; c=d", { a: "b", c: "d" }],
    ["ignore control character name", "foo\x0a=bar;", {}],
    ["continue after control character name", "foo\x0d=bar; x=y;", { x: "y" }],
  ] as const)("LenientSimpleCookie %s", (_message, raw, expected) => {
    const cookie = new LenientSimpleCookie(raw);
    expect(Object.fromEntries(cookie.cookies)).toEqual(expected);
  });

  test("LenientSimpleCookie strips quoted simple values", () => {
    const cookie = new LenientSimpleCookie('Customer="WILE_E_COYOTE"; foo=bar');
    expect(cookie.get("Customer")).toBe("WILE_E_COYOTE");
    expect(cookie.get("foo")).toBe("bar");
  });

  test.todo("test_get_desktop_environment once Linux desktop environment detection is exported", () => undefined);
  test.todo("test_chrome_cookie_decryptor_linux_derive_key once derive key compatibility is exported", () => undefined);
  test.todo("test_chrome_cookie_decryptor_mac_derive_key once macOS keychain compatibility is ported", () => undefined);
  test.todo("test_chrome_cookie_decryptor_linux_v11 once Linux keyring decrypt support is ported", () => undefined);
  test.todo("test_chrome_cookie_decryptor_windows_v10 once Windows DPAPI is ported", () => undefined);
  test.todo("test_chrome_cookie_decryptor_windows_v10_meta24 once Windows DPAPI is ported", () => undefined);
  test.todo("test_chrome_cookie_decryptor_mac_v10 once macOS keychain compatibility is ported", () => undefined);
  test.todo("TestLenientSimpleCookie attribute morsel compatibility once attributes are stored", () => undefined);
});
