// Source: test/test_networking_utils.py

import { describe, expect, test } from "bun:test";

import {
  addAcceptEncodingHeader,
  getRedirectMethod,
  InstanceStoreMixin,
  makeSslContext,
  makeSocksProxyOpts,
  sslLoadCerts,
} from "../yt_dlp/networking/helper.ts";
import { YoutubeDLCookieJar } from "../yt_dlp/cookies.ts";
import { HTTPError, IncompleteRead } from "../yt_dlp/networking/exceptions.ts";
import { ProxyType } from "../yt_dlp/socks.ts";
import {
  HTTPHeaderDict,
  cleanHeaders,
  cleanProxies,
  normalizeUrl,
  removeDotSegments,
  selectProxy,
} from "../yt_dlp/utils/networking.ts";

describe("networking utility helpers", () => {
  test.each([
    ["GET", 303, "GET"],
    ["HEAD", 303, "HEAD"],
    ["PUT", 303, "GET"],
    ["POST", 301, "GET"],
    ["HEAD", 301, "HEAD"],
    ["POST", 302, "GET"],
    ["HEAD", 302, "HEAD"],
    ["PUT", 302, "PUT"],
    ["POST", 308, "POST"],
    ["POST", 307, "POST"],
  ] as const)("getRedirectMethod %s %s", (method, status, expected) => {
    expect(getRedirectMethod(method, status)).toBe(expected);
  });

  test("addAcceptEncodingHeader", () => {
    const headers = new Headers();
    addAcceptEncodingHeader(headers, ["gzip", "br"]);
    expect(headers.get("Accept-Encoding")).toBe("gzip, br");

    addAcceptEncodingHeader(headers, ["identity"]);
    expect(headers.get("Accept-Encoding")).toBe("gzip, br");
  });

  test("HTTPHeaderDict is case-insensitive but preserves sensitive casing", () => {
    const headers = new HTTPHeaderDict({ "Content-type": "application/json" });
    expect(headers.get("content-TYPE")).toBe("application/json");
    headers.set("X-Test", " ok ");
    expect(headers.sensitive()).toEqual({
      "Content-type": "application/json",
      "X-Test": "ok",
    });
  });

  test("cleanProxies and selectProxy", () => {
    const headers = new HTTPHeaderDict({
      "Ytdl-Request-Proxy": "socks5://example.com",
    });
    const proxies: Record<string, string | null> = { http: "proxy.local:8080" };
    cleanProxies(proxies, headers);
    expect(proxies).toEqual({ all: "socks5://example.com" });
    expect(selectProxy("https://example.com", proxies)).toBe(
      "socks5://example.com",
    );
  });

  test("cleanHeaders handles yt-dlp sentinels", () => {
    const headers = new HTTPHeaderDict({
      "Youtubedl-No-Compression": "1",
      "Ytdl-socks-proxy": "socks5://example.com",
    });
    cleanHeaders(headers);
    expect(headers.get("Accept-Encoding")).toBe("identity");
    expect(headers.has("Ytdl-socks-proxy")).toBe(false);
  });

  test("URL normalization", () => {
    expect(removeDotSegments("/a/b/./../../headers")).toBe("/headers");
    expect(normalizeUrl("https://example.com/a/b/./../c?q=a b")).toBe(
      "https://example.com/a/c?q=a%20b",
    );
  });

  test.each([
    [
      "socks5h://example.com",
      {
        proxytype: ProxyType.SOCKS5,
        addr: "example.com",
        port: 1080,
        rdns: true,
        username: null,
        password: null,
      },
    ],
    [
      "socks5://user:@example.com:5555",
      {
        proxytype: ProxyType.SOCKS5,
        addr: "example.com",
        port: 5555,
        rdns: false,
        username: "user",
        password: "",
      },
    ],
    [
      "socks4://u%40ser:pa%20ss@127.0.0.1:1080",
      {
        proxytype: ProxyType.SOCKS4,
        addr: "127.0.0.1",
        port: 1080,
        rdns: false,
        username: "u@ser",
        password: "pa ss",
      },
    ],
    [
      "socks4a://:pa%20ss@127.0.0.1",
      {
        proxytype: ProxyType.SOCKS4A,
        addr: "127.0.0.1",
        port: 1080,
        rdns: true,
        username: "",
        password: "pa ss",
      },
    ],
  ] as const)("makeSocksProxyOpts %s", (proxy, expected) => {
    expect(makeSocksProxyOpts(proxy)).toEqual(expected);
  });

  test("makeSocksProxyOpts unknown version", () => {
    expect(() => makeSocksProxyOpts("socks://127.0.0.1")).toThrow(
      "Unknown SOCKS proxy version: socks",
    );
  });

  test("makeSslContext builds Bun TLS options from Python helper inputs", () => {
    const previous = process.env.SSLKEYLOGFILE;
    process.env.SSLKEYLOGFILE = "/tmp/ytdlb-ssl-keys.log";
    try {
      const context = makeSslContext({
        verify: false,
        client_certificate: "test/testdata/certificate/client.crt",
        client_certificate_key: "test/testdata/certificate/client.key",
        client_certificate_password: "foobar",
      });
      expect(context.verify).toBe(false);
      expect(context.tls.rejectUnauthorized).toBe(false);
      expect(context.tls.ALPNProtocols).toBe("http/1.1");
      expect(context.tls.cert).toContain("BEGIN CERTIFICATE");
      expect(context.tls.key).toContain("BEGIN");
      expect(context.tls.passphrase).toBe("foobar");
      expect(context.keylogFilename).toBe("/tmp/ytdlb-ssl-keys.log");
      expect(context.postHandshakeAuth).toBe(true);
    } finally {
      if (previous === undefined) {
        delete process.env.SSLKEYLOGFILE;
      } else {
        process.env.SSLKEYLOGFILE = previous;
      }
    }
  });

  test("makeSslContext handles legacy and certificate errors explicitly", () => {
    const legacy = makeSslContext({ legacy_support: true, use_certifi: false });
    expect(legacy.tls.secureOptions).toBe(4);
    expect(legacy.tls.ciphers).toBe("DEFAULT");
    expect(legacy.trustSource).toBe("platform");

    expect(() =>
      makeSslContext({ client_certificate: "test/testdata/certificate/missing.crt" }),
    ).toThrow("Unable to load client certificate");
  });

  test("sslLoadCerts uses platform trust when certifi is unavailable", () => {
    const tls = {};
    expect(sslLoadCerts(tls, { use_certifi: true })).toBe("platform");
    expect(tls).toEqual({});
  });

  test("InstanceStoreMixin caches by Python-style value equality", () => {
    class FakeInstanceStoreMixin extends InstanceStoreMixin<number> {
      instances = 0;

      protected override createInstance(): number {
        this.instances += 1;
        return this.instances;
      }
    }

    const mixin = new FakeInstanceStoreMixin();
    expect(mixin._get_instance({ d: { a: 1, b: 2, c: new Set(["d", 4]) } })).toBe(
      mixin._get_instance({ d: { c: new Set([4, "d"]), b: 2, a: 1 } }),
    );
    expect(mixin._get_instance({ d: { a: 1 }, e: [1, 2, 3] })).toBe(
      mixin._get_instance({ e: [1, 2, 3], d: { a: 1 } }),
    );
    expect(mixin._get_instance({ d: { a: 1 }, e: [1, 2, 3] })).not.toBe(
      mixin._get_instance({ d: { a: 1 }, e: [1, 2, 3, 4] }),
    );

    const cookiejar = new YoutubeDLCookieJar();
    expect(mixin._get_instance({ b: [1, 2], c: cookiejar })).toBe(
      mixin._get_instance({ c: cookiejar, b: [1, 2] }),
    );
    expect(mixin._get_instance({ b: [1, 2], c: cookiejar })).not.toBe(
      mixin._get_instance({ b: [1, 2], c: new YoutubeDLCookieJar() }),
    );

    const cached = mixin._get_instance({ t: 1234 });
    expect(mixin._get_instance({ t: 1234 })).toBe(cached);
    mixin._clear_instances();
    expect(mixin._get_instance({ t: 1234 })).not.toBe(cached);
  });
});

describe("networking exceptions", () => {
  test("HTTPError exposes status and response", () => {
    const response = new Response("test", {
      status: 403,
      statusText: "Forbidden",
    });
    const error = new HTTPError(response);
    expect(error.status).toBe(403);
    expect(error.reason).toBe("Forbidden");
    expect(error.message).toBe("HTTP Error 403: Forbidden");
    expect(error.response).toBe(response);
  });

  test("IncompleteRead message", () => {
    const error = new IncompleteRead(4, 3);
    expect(error.partial).toBe(4);
    expect(error.expected).toBe(3);
    expect(error.message).toBe("4 bytes read, 3 more expected");
  });
});
