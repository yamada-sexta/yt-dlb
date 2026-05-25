// Source: selected cases from test/test_cookies.py

import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";

import {
  Cookie,
  CookieMorsel,
  LenientSimpleCookie,
  LinuxDesktopEnvironment,
  LinuxChromeCookieDecryptor,
  LinuxKeyring,
  MacChromeCookieDecryptor,
  YoutubeDLCookieJar,
  getLinuxDesktopEnvironment,
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
    jar.setCookie(
      new Cookie({
        name: "test",
        value: "ytdlp",
        domain: ".example.com",
        path: "/",
        secure: false,
        expires: null,
      }),
    );
    jar.setCookie(
      new Cookie({
        name: "secure",
        value: "yes",
        domain: ".example.com",
        path: "/",
        secure: true,
        expires: null,
      }),
    );

    expect(jar.getCookieHeader("http://www.example.com/")).toBe("test=ytdlp");
    expect(jar.getCookieHeader("https://www.example.com/")).toBe(
      "test=ytdlp; secure=yes",
    );
    expect(
      jar.getCookieHeader("https://other.example.invalid/"),
    ).toBeUndefined();

    await jar.save();
    const reloaded = new YoutubeDLCookieJar(cookieFile);
    await reloaded.load();
    expect(reloaded.getCookieHeader("https://www.example.com/")).toBe(
      "test=ytdlp; secure=yes",
    );
  });

  test("pbkdf2Sha1 matches Python fixture", () => {
    expect(
      pbkdf2Sha1(Buffer.from("peanuts"), Buffer.from(" ".repeat(16)), 1, 16),
    ).toEqual(
      Buffer.from([
        0x67, 0xe1, 0x8e, 0x0f, 0x51, 0x1c, 0x9b, 0xf3, 0xc9, 0x60, 0x21, 0xaa,
        0x90, 0xd9, 0xd3, 0x34,
      ]),
    );
  });

  test.each([
    [{}, LinuxDesktopEnvironment.OTHER],
    [{ DESKTOP_SESSION: "my_custom_de" }, LinuxDesktopEnvironment.OTHER],
    [{ XDG_CURRENT_DESKTOP: "my_custom_de" }, LinuxDesktopEnvironment.OTHER],
    [{ DESKTOP_SESSION: "gnome" }, LinuxDesktopEnvironment.GNOME],
    [{ DESKTOP_SESSION: "mate" }, LinuxDesktopEnvironment.GNOME],
    [{ DESKTOP_SESSION: "kde4" }, LinuxDesktopEnvironment.KDE4],
    [{ DESKTOP_SESSION: "kde" }, LinuxDesktopEnvironment.KDE3],
    [{ DESKTOP_SESSION: "xfce" }, LinuxDesktopEnvironment.XFCE],
    [
      { XDG_CURRENT_DESKTOP: "my_custom_de", DESKTOP_SESSION: "gnome" },
      LinuxDesktopEnvironment.GNOME,
    ],
    [
      { XDG_CURRENT_DESKTOP: "my_custom_de", DESKTOP_SESSION: "mate" },
      LinuxDesktopEnvironment.GNOME,
    ],
    [
      { XDG_CURRENT_DESKTOP: "my_custom_de", DESKTOP_SESSION: "kde4" },
      LinuxDesktopEnvironment.KDE4,
    ],
    [
      { XDG_CURRENT_DESKTOP: "my_custom_de", DESKTOP_SESSION: "kde" },
      LinuxDesktopEnvironment.KDE3,
    ],
    [
      { XDG_CURRENT_DESKTOP: "my_custom_de", DESKTOP_SESSION: "xfce" },
      LinuxDesktopEnvironment.XFCE,
    ],
    [
      {
        XDG_CURRENT_DESKTOP: "my_custom_de",
        DESKTOP_SESSION: "my_custom_de",
        GNOME_DESKTOP_SESSION_ID: 1,
      },
      LinuxDesktopEnvironment.GNOME,
    ],
    [{ GNOME_DESKTOP_SESSION_ID: 1 }, LinuxDesktopEnvironment.GNOME],
    [{ KDE_FULL_SESSION: 1 }, LinuxDesktopEnvironment.KDE3],
    [
      { KDE_FULL_SESSION: 1, DESKTOP_SESSION: "kde4" },
      LinuxDesktopEnvironment.KDE4,
    ],
    [{ XDG_CURRENT_DESKTOP: "X-Cinnamon" }, LinuxDesktopEnvironment.CINNAMON],
    [{ XDG_CURRENT_DESKTOP: "Deepin" }, LinuxDesktopEnvironment.DEEPIN],
    [{ XDG_CURRENT_DESKTOP: "GNOME" }, LinuxDesktopEnvironment.GNOME],
    [
      { XDG_CURRENT_DESKTOP: "GNOME:GNOME-Classic" },
      LinuxDesktopEnvironment.GNOME,
    ],
    [
      { XDG_CURRENT_DESKTOP: "GNOME : GNOME-Classic" },
      LinuxDesktopEnvironment.GNOME,
    ],
    [{ XDG_CURRENT_DESKTOP: "ubuntu:GNOME" }, LinuxDesktopEnvironment.GNOME],
    [
      { XDG_CURRENT_DESKTOP: "Unity", DESKTOP_SESSION: "gnome-fallback" },
      LinuxDesktopEnvironment.GNOME,
    ],
    [
      { XDG_CURRENT_DESKTOP: "KDE", KDE_SESSION_VERSION: "5" },
      LinuxDesktopEnvironment.KDE5,
    ],
    [
      { XDG_CURRENT_DESKTOP: "KDE", KDE_SESSION_VERSION: "6" },
      LinuxDesktopEnvironment.KDE6,
    ],
    [{ XDG_CURRENT_DESKTOP: "KDE" }, LinuxDesktopEnvironment.KDE4],
    [{ XDG_CURRENT_DESKTOP: "Pantheon" }, LinuxDesktopEnvironment.PANTHEON],
    [{ XDG_CURRENT_DESKTOP: "UKUI" }, LinuxDesktopEnvironment.UKUI],
    [{ XDG_CURRENT_DESKTOP: "Unity" }, LinuxDesktopEnvironment.UNITY],
    [{ XDG_CURRENT_DESKTOP: "Unity:Unity7" }, LinuxDesktopEnvironment.UNITY],
    [{ XDG_CURRENT_DESKTOP: "Unity:Unity8" }, LinuxDesktopEnvironment.UNITY],
  ] as const)("getLinuxDesktopEnvironment %s", (env, expected) => {
    expect(getLinuxDesktopEnvironment(env, logger)).toBe(expected);
  });

  test("LinuxChromeCookieDecryptor derives keys like Python", () => {
    expect(LinuxChromeCookieDecryptor.deriveKey(Buffer.from("abc"))).toEqual(
      Buffer.from([
        0x37, 0xa1, 0xec, 0xd4, 0x6d, 0xfc, 0x41, 0xc7, 0xb1, 0x39, 0x5a, 0xd0,
        0x19, 0xdc, 0x4d, 0x17,
      ]),
    );
  });

  test("MacChromeCookieDecryptor derives keys like Python", () => {
    expect(MacChromeCookieDecryptor.deriveKey(Buffer.from("abc"))).toEqual(
      Buffer.from([
        0x59, 0xe2, 0xc0, 0xd0, 0x50, 0xf6, 0xf4, 0xe1, 0x6c, 0xc1, 0x8c, 0x51,
        0xcb, 0x7c, 0xcd, 0x59,
      ]),
    );
  });

  test("LinuxChromeCookieDecryptor decrypts v10 basic-text fixture", () => {
    const encrypted = Uint8Array.from([
      0x76, 0x31, 0x30, 0xcc, 0x57, 0x25, 0xcd, 0xe6, 0xe6, 0x9f, 0x4d, 0x22,
      0x20, 0xa7, 0xb0, 0xca, 0xe4, 0x07, 0xd6,
    ]);
    const decryptor = new LinuxChromeCookieDecryptor(
      "Chrome",
      logger,
      LinuxKeyring.BASICTEXT,
      0,
    );
    expect(decryptor.decrypt(encrypted)).toBe("USD");
  });

  test("LinuxChromeCookieDecryptor decrypts v11 basic-text fixture", () => {
    const encrypted = Uint8Array.from([
      0x76, 0x31, 0x31, 0x23, 0x81, 0x10, 0x3e, 0x60, 0x77, 0x8f, 0x29, 0xc0,
      0xb2, 0xc1, 0x0d, 0xf4, 0x1a, 0x6c, 0xdd, 0x93, 0xfd, 0xf8, 0xf8, 0x4e,
      0xf2, 0xa9, 0x83, 0xf1, 0xe9, 0x6f, 0x0e, 0x6c, 0x56, 0x51, 0x64,
    ]);
    const decryptor = new LinuxChromeCookieDecryptor(
      "Chrome",
      logger,
      LinuxKeyring.BASICTEXT,
      0,
    );
    expect(decryptor.decrypt(encrypted)).toBe("tz=Europe.London");
  });

  test("LinuxChromeCookieDecryptor decrypts v10 meta24 fixture", () => {
    const encrypted = Uint8Array.from([
      0x76, 0x31, 0x30, 0x1f, 0xe4, 0x0e, 0x5b, 0x83, 0x0c, 0xcc, 0x2a, 0x6b,
      0x50, 0x69, 0x20, 0xce, 0x8d, 0x1d, 0xbb, 0x80, 0x0d, 0x11, 0x09, 0xbb,
      0x9e, 0x5e, 0x48, 0x79, 0x94, 0xf4, 0x96, 0x33, 0x9f, 0x82, 0xba, 0xfe,
      0xa1, 0xed, 0xb9, 0xf1, 0x29, 0x00, 0x37, 0x31, 0x30, 0x92, 0xc8, 0x2f,
      0x3c, 0x96, 0x42,
    ]);
    const decryptor = new LinuxChromeCookieDecryptor(
      "Chrome",
      logger,
      LinuxKeyring.BASICTEXT,
      24,
    );
    expect(decryptor.decrypt(encrypted)).toBe("DE");
  });

  test("parseSafariCookies parses Python fixture", () => {
    const data = Buffer.concat([
      Buffer.from("cook", "binary"),
      Buffer.from([
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x69, 0x00, 0x00, 0x01, 0x00,
        0x01, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x59, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x20, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x38, 0x00, 0x00, 0x00, 0x42, 0x00, 0x00, 0x00,
        0x46, 0x00, 0x00, 0x00, 0x48, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x03, 0xa5, 0x3e, 0xc3, 0x41, 0x00,
        0x00, 0x80, 0xc3, 0x07, 0x3a, 0xc3, 0x41,
      ]),
      Buffer.from("localhost\0foo\0/\0test%20%3Bcookie\0", "binary"),
      Buffer.from([
        0x00, 0x00, 0x00, 0x05, 0x34, 0x07, 0x17, 0x20, 0x05, 0x00, 0x00, 0x00,
        0x4b,
      ]),
      Buffer.from("bplist00", "binary"),
      Buffer.from([0xd1, 0x01, 0x02, 0x5f, 0x10, 0x18]),
      Buffer.from("NSHTTPCookieAcceptPolicy", "binary"),
      Buffer.from([
        0x10, 0x02, 0x08, 0x0b, 0x26, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01,
        0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x28,
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
    [
      "basic cookie",
      "chips=ahoy; vienna=finger",
      { chips: "ahoy", vienna: "finger" },
    ],
    ["allow '=' in an unquoted value", "keebler=E=mc2", { keebler: "E=mc2" }],
    ["allow ':' in names", "key:term=value:term", { "key:term": "value:term" }],
    [
      "allow brackets in values",
      "a=b; c=[; d=r; f=h",
      { a: "b", c: "[", d: "r", f: "h" },
    ],
    [
      "quoted cookie with semicolon and escaped quotes",
      'keebler="E=mc2; L=\\"Loves\\"; fudge=;"',
      { keebler: 'E=mc2; L="Loves"; fudge=;' },
    ],
    ["quoted semicolon", 'chips="a;hoy"; vienna=finger', { chips: "a;hoy", vienna: "finger" }],
    ["keep last value", "a=c; a=b", { a: "b" }],
    ["ignore cookies without a name", "a=b; unnamed; c=d", { a: "b", c: "d" }],
    ["skip invalid complex cookie", 'chips={"ahoy;": 1}; vienna="finger;"', { vienna: "finger;" }],
    ["skip space separated garbage", "x a=b c=d x; e=f", { a: "b", c: "d", e: "f" }],
    ["mend invalid quote", 'a=b; invalid="; c=d', { a: "b", c: "d" }],
    ["invalid morsel key", "Key=Value; [Invalid]=Value; Another=Value", { Key: "Value", Another: "Value" }],
    ["ignore control character name", "foo\x0a=bar;", {}],
    ["continue after control character name", "foo\x0d=bar; x=y;", { x: "y" }],
    ['ignore quote without name', 'a=b; "; c=d', { a: "b", c: "d" }],
    ["ignore quoted control character value", 'keebler="E=mc2; L=\\"Loves\\"; fudge=\\012;"', {}],
  ] as const)("LenientSimpleCookie %s", (_message, raw, expected) => {
    const cookie = new LenientSimpleCookie(raw);
    expect(Object.fromEntries(cookie.cookies)).toEqual(expected);
  });

  test("LenientSimpleCookie strips quoted simple values", () => {
    const cookie = new LenientSimpleCookie('Customer="WILE_E_COYOTE"; foo=bar');
    expect(cookie.get("Customer")).toBe("WILE_E_COYOTE");
    expect(cookie.get("foo")).toBe("bar");
  });

  test("LenientSimpleCookie stores Python-style morsel attributes", () => {
    const cookie = new LenientSimpleCookie(
      'Customer="WILE_E_COYOTE"; Version=1; Path=/acme; HttpOnly; Secure; SameSite=Lax',
    );
    const morsel = cookie.getMorsel("Customer");
    expect(morsel).toBeInstanceOf(CookieMorsel);
    expect(morsel?.value).toBe("WILE_E_COYOTE");
    expect(
      Object.fromEntries(morsel?.entries().filter(([, value]) => value !== "") ?? []),
    ).toEqual({
      version: "1",
      path: "/acme",
      httponly: true,
      secure: true,
      samesite: "Lax",
    });
  });

  test("LenientSimpleCookie resets morsel after invalid attributes", () => {
    const invalidAttribute = new LenientSimpleCookie("a=b; invalid; Version=1; c=d");
    expect(Object.fromEntries(invalidAttribute.cookies)).toEqual({ a: "b", c: "d" });
    expect(invalidAttribute.getMorsel("a")?.getAttribute("version")).toBe("");

    const controlAttribute = new LenientSimpleCookie(
      'Customer="WILE_E_COYOTE"; Version="1\\012"; Path="/acme"',
    );
    expect(Object.fromEntries(controlAttribute.cookies)).toEqual({});
  });

  test.todo("test_chrome_cookie_decryptor_windows_v10 once Windows DPAPI is ported", () =>
    undefined);
  test.todo("test_chrome_cookie_decryptor_windows_v10_meta24 once Windows DPAPI is ported", () =>
    undefined);
  test.todo("test_chrome_cookie_decryptor_mac_v10 once macOS keychain compatibility is ported", () =>
    undefined);
});
