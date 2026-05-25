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

  test("LenientSimpleCookie parses basic key/value cookies", () => {
    const cookie = new LenientSimpleCookie();
    cookie.load('chips=ahoy; vienna=finger; keebler="E=mc2; L=\\"Loves\\"; fudge=;"');
    expect(cookie.get("chips")).toBe("ahoy");
    expect(cookie.get("vienna")).toBe("finger");
    expect(cookie.get("keebler")).toBe('"E=mc2');

    const repeated = new LenientSimpleCookie();
    repeated.load("a=c; a=b");
    expect(repeated.get("a")).toBe("b");
  });

  test.todo("test_get_desktop_environment once Linux desktop environment detection is exported", () => undefined);
  test.todo("test_chrome_cookie_decryptor_linux_derive_key once derive key compatibility is exported", () => undefined);
  test.todo("test_chrome_cookie_decryptor_mac_derive_key once macOS keychain compatibility is ported", () => undefined);
  test.todo("test_chrome_cookie_decryptor_linux_v11 once Linux keyring decrypt support is ported", () => undefined);
  test.todo("test_chrome_cookie_decryptor_linux_v10_meta24 once meta v24 fixture support is audited", () => undefined);
  test.todo("test_chrome_cookie_decryptor_windows_v10 once Windows DPAPI is ported", () => undefined);
  test.todo("test_chrome_cookie_decryptor_windows_v10_meta24 once Windows DPAPI is ported", () => undefined);
  test.todo("test_chrome_cookie_decryptor_mac_v10 once macOS keychain compatibility is ported", () => undefined);
  test.todo("test_safari_cookie_parsing once Safari binary cookie parsing fixture is ported", () => undefined);
  test.todo("TestLenientSimpleCookie attribute and invalid-cookie recovery cases", () => undefined);
});
