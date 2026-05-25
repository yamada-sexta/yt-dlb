// Source: test/test_networking.py

import { describe, expect, test } from "bun:test";

import {
  Features,
  HEADRequest,
  PATCHRequest,
  PUTRequest,
  Request,
  RequestDirector,
  RequestHandler,
} from "../yt_dlp/networking/index.ts";
import {
  NoSupportingHandlers,
  UnsupportedRequest,
} from "../yt_dlp/networking/exceptions.ts";
import {
  ImpersonateRequestHandler,
  ImpersonateTarget,
} from "../yt_dlp/networking/impersonate.ts";

describe("networking common request objects", () => {
  test("Request applies query and protocol-relative normalization", () => {
    const request = new Request("//example.com/path", {
      query: { a: "1", b: ["2", "3"] },
    });
    expect(request.url).toBe("http://example.com/path?a=1&b=2&b=3");
  });

  test("method request subclasses", () => {
    expect(new HEADRequest("https://example.com").method).toBe("HEAD");
    expect(new PUTRequest("https://example.com").method).toBe("PUT");
    expect(new PATCHRequest("https://example.com").method).toBe("PATCH");
  });

  test("RequestHandler validates supported URL schemes and proxies", () => {
    class HttpOnlyRH extends RequestHandler {
      static override readonly SUPPORTED_URL_SCHEMES = ["http"];
      static override readonly SUPPORTED_PROXY_SCHEMES = ["http"];
      static override readonly SUPPORTED_FEATURES = [Features.ALL_PROXY];
      protected override async doSend(request: Request): Promise<Response> {
        return new Response(request.url);
      }
    }

    const handler = new HttpOnlyRH();
    expect(() => handler.validate(new Request("ftp://example.com"))).toThrow(
      UnsupportedRequest,
    );
    expect(() =>
      handler.validate(
        new Request("http://example.com", {
          proxies: { all: "socks5://example.com" },
        }),
      ),
    ).toThrow(UnsupportedRequest);
    expect(() =>
      handler.validate(
        new Request("http://example.com", { extensions: { unknown: true } }),
      ),
    ).toThrow(UnsupportedRequest);
  });

  test("RequestDirector reports no handlers", async () => {
    await expect(
      new RequestDirector().send(new Request("https://example.com")),
    ).rejects.toThrow("No request handlers configured");
  });

  test("RequestDirector falls through unsupported handlers", async () => {
    class UnsupportedRH extends RequestHandler {
      static override readonly SUPPORTED_URL_SCHEMES = ["ftp"];
      protected override async doSend(_request: Request): Promise<Response> {
        return new Response();
      }
    }
    const director = new RequestDirector();
    director.addHandler(new UnsupportedRH());
    await expect(
      director.send(new Request("https://example.com")),
    ).rejects.toThrow(NoSupportingHandlers);
  });
});

describe("networking optional backends", () => {
  test.todo("RequestsRH send behavior once requests backend is ported", () =>
    undefined);
  test.todo("CurlCFFIRH send behavior once curl_cffi backend is ported", () =>
    undefined);
  test.todo("BunWebSocketRH send behavior once websocket backend is ported", () =>
    undefined);
  test.todo("WebSocketResponse recv behavior once websocket receive is ported", () =>
    undefined);
});

describe("impersonation targets", () => {
  test("parse and compare targets", () => {
    const target = ImpersonateTarget.fromString("chrome-120:windows-10");
    expect(target.client).toBe("chrome");
    expect(target.version).toBe("120");
    expect(target.os).toBe("windows");
    expect(target.osVersion).toBe("10");
    expect(target.toString()).toBe("chrome-120:windows-10");
    expect(new ImpersonateTarget("chrome").contains(target)).toBe(true);
    expect(new ImpersonateTarget("firefox").contains(target)).toBe(false);
  });

  test("request handler rejects unsupported impersonation", () => {
    class ChromeRH extends ImpersonateRequestHandler {
      static override readonly SUPPORTED_IMPERSONATE_TARGETS = [
        new ImpersonateTarget("chrome"),
      ];
      protected override async doSend(_request: Request): Promise<Response> {
        return new Response();
      }
    }
    const handler = new ChromeRH();
    expect(() =>
      handler.validate(
        new Request("https://example.com", {
          extensions: { impersonate: new ImpersonateTarget("firefox") },
        }),
      ),
    ).toThrow(UnsupportedRequest);
  });
});
