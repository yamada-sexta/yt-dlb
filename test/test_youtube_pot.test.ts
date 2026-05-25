// Source: test/test_pot/test_pot_director.py and YouTube PO-token director behavior

import { describe, expect, test } from "bun:test";

import {
  CacheProviderWritePolicy,
  PoTokenCache,
  PoTokenCacheProvider,
  PoTokenCacheSpecProvider,
  PoTokenContext,
  PoTokenProvider,
  PoTokenProviderRejectedRequest,
  PoTokenRequestDirector,
  cleanPot,
  validateCacheSpec,
  validateResponse,
} from "../yt_dlp/extractor/youtube/pot/index.ts";
import {
  ConsoleIEContentProviderLogger,
  LogLevel,
  type IEContentProviderHost,
} from "../yt_dlp/extractor/youtube/pot/internal-provider.ts";
import type {
  PoTokenRequest,
  PoTokenResponse,
} from "../yt_dlp/extractor/youtube/pot/provider.ts";

class TestCacheProvider extends PoTokenCacheProvider {
  static override readonly providerName = "test-cache";
  readonly values = new Map<string, string>();

  override isAvailable(): boolean {
    return true;
  }

  override get(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  override store(key: string, value: string): void {
    this.values.set(key, value);
  }

  override delete(key: string): void {
    this.values.delete(key);
  }
}

class TestSpecProvider extends PoTokenCacheSpecProvider {
  static override readonly providerName = "test-spec";

  override generateCacheSpec(request: PoTokenRequest) {
    return {
      keyBindings: {
        context: request.context,
        visitor: request.visitorData,
      },
      defaultTtl: 60,
      writePolicy: CacheProviderWritePolicy.WRITE_ALL,
    };
  }
}

class RejectingProvider extends PoTokenProvider {
  static override readonly providerName = "rejecting";
  protected override supportedContexts = null;
  protected override supportedClients = null;

  override isAvailable(): boolean {
    return true;
  }

  protected override realRequestPot(): Promise<PoTokenResponse> {
    throw new PoTokenProviderRejectedRequest("not this request");
  }
}

class WorkingProvider extends PoTokenProvider {
  static override readonly providerName = "working";
  protected override supportedContexts = null;
  protected override supportedClients = null;
  calls = 0;

  override isAvailable(): boolean {
    return true;
  }

  protected override async realRequestPot(): Promise<PoTokenResponse> {
    this.calls += 1;
    return { poToken: token("fresh") };
  }
}

const host: IEContentProviderHost = {};
const logger = new ConsoleIEContentProviderLogger("test", LogLevel.ERROR);

describe("YouTube PO-token director dependencies", () => {
  test("cleanPot normalizes and strips accidental URL parameters", () => {
    expect(cleanPot(`${token("abc")}?foo=bar`)).toBe(token("abc"));
  });

  test("validates responses and cache specs", () => {
    expect(validateResponse({ poToken: token("abc") })).toBe(true);
    expect(validateResponse({ poToken: "" })).toBe(false);
    expect(
      validateCacheSpec({
        keyBindings: { visitor: "VISITOR" },
        defaultTtl: 60,
        writePolicy: CacheProviderWritePolicy.WRITE_ALL,
      }),
    ).toBe(true);
    expect(
      validateCacheSpec({
        keyBindings: { visitor: null },
        defaultTtl: 60,
        writePolicy: CacheProviderWritePolicy.WRITE_ALL,
      }),
    ).toBe(false);
  });

  test("uses providers in preference order and caches successful responses", async () => {
    const cacheProvider = new TestCacheProvider(host, logger);
    const cache = new PoTokenCache(
      logger,
      [cacheProvider],
      [new TestSpecProvider(host, logger)],
    );
    const director = new PoTokenRequestDirector(logger, cache);
    const rejecting = new RejectingProvider(host, logger);
    const working = new WorkingProvider(host, logger);
    director.registerProvider(rejecting);
    director.registerProvider(working);
    director.registerPreference((provider) =>
      provider.providerName === "rejecting" ? 10 : 0,
    );

    const request = {
      context: PoTokenContext.GVS,
      innertubeContext: { client: { clientName: "WEB" } },
      visitorData: "VISITOR",
    };
    expect(await director.getPoToken(request)).toBe(token("fresh"));
    expect(await director.getPoToken(request)).toBe(token("fresh"));
    expect(working.calls).toBe(1);
  });
});

function token(value: string): string {
  return Buffer.from(value).toString("base64url");
}
