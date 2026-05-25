// Source: yt_dlp/extractor/youtube/pot/_director.py
// Port note: this ports the PO-token provider/cache orchestration used by YouTube extraction.

import { createHash } from "node:crypto";
import { z } from "zod";

import { bugReportsMessage, formatField, joinNonempty } from "../../../utils/index.ts";
import {
  CacheProviderWritePolicy,
  type PoTokenCacheProvider,
  PoTokenCacheProviderError,
  type PoTokenCacheSpecProvider,
  type CacheProviderPreference,
  type PoTokenCacheProviderConstructor,
  type PoTokenCacheSpec,
  type PoTokenCacheSpecProviderConstructor,
} from "./cache.ts";
import {
  BuiltinIEContentProvider,
  ConsoleIEContentProviderLogger,
  type IEContentProvider,
  type IEContentProviderHost,
  type IEContentProviderLogger,
  LogLevel,
} from "./internal-provider.ts";
import {
  potCacheProviderPreferences,
  potCacheProviders,
  potPcsProviders,
  potProviders,
  ptpPreferences,
} from "./registry.ts";
import {
  type PoTokenProvider,
  PoTokenProviderError,
  PoTokenProviderRejectedRequest,
  type PoTokenPreference,
  type PoTokenProviderConstructor,
  type PoTokenRequest,
  type PoTokenResponse,
  providerBugReportMessage,
} from "./provider.ts";
import "./_builtin/index.ts";

const PoTokenResponseSchema = z.object({
  poToken: z.string().min(1),
  expiresAt: z.number().int().optional(),
}).passthrough();

const ProviderSettingsSchema = z.record(z.string(), z.array(z.string()).optional());

export class YoutubeIEContentProviderLogger extends ConsoleIEContentProviderLogger {
  constructor(
    readonly host: YoutubePoTokenHost,
    prefix: string,
    logLevel: LogLevel = LogLevel.INFO,
  ) {
    super(prefix, logLevel);
  }

  override trace(message: string): void {
    if (this.logLevel <= LogLevel.TRACE) {
      this.host.writeDebug?.(this.formatMessage(`TRACE: ${message}`));
    }
  }

  override debug(message: string, options: { once?: boolean } = {}): void {
    if (this.logLevel <= LogLevel.DEBUG) {
      this.host.writeDebug?.(this.formatMessage(message), options);
    }
  }

  override info(message: string): void {
    if (this.logLevel <= LogLevel.INFO) {
      this.host.toScreen?.(this.formatMessage(message));
    }
  }

  override warning(message: string, options: { once?: boolean } = {}): void {
    if (this.logLevel <= LogLevel.WARNING) {
      this.host.reportWarning?.(this.formatMessage(message), options);
    }
  }

  override error(message: string, cause?: Error): void {
    if (this.logLevel <= LogLevel.ERROR) {
      this.host.reportError?.(this.formatMessage(message), cause);
      if (!this.host.reportError) {
        this.host.reportWarning?.(this.formatMessage(cause ? `${message}: ${cause.message}` : message));
      }
    }
  }

  private formatMessage(message: string): string {
    return `${formatField(this.prefix, null, "[%s] ")}${message}`;
  }
}

export class PoTokenCache {
  readonly cacheProviders: Map<string, PoTokenCacheProvider>;
  readonly cacheSpecProviders: Map<string, PoTokenCacheSpecProvider>;

  constructor(
    readonly logger: IEContentProviderLogger,
    cacheProviders: readonly PoTokenCacheProvider[],
    cacheSpecProviders: readonly PoTokenCacheSpecProvider[],
    readonly cacheProviderPreferences: readonly CacheProviderPreference[] = [],
  ) {
    this.cacheProviders = new Map(cacheProviders.map((provider) => [provider.providerName, provider]));
    this.cacheSpecProviders = new Map(cacheSpecProviders.map((provider) => [provider.providerName, provider]));
  }

  get(request: PoTokenRequest): PoTokenResponse | null {
    const spec = this.getCacheSpec(request);
    if (!spec) {
      this.logger.trace("No cache spec available for this request, unable to fetch from cache");
      return null;
    }
    const cacheKey = this.generateKey(this.generateKeyBindings(spec));
    for (const [index, provider] of this.getCacheProviders(request).entries()) {
      try {
        const cacheResponse = provider.get(cacheKey);
        if (!cacheResponse) {
          continue;
        }
        const parsed = PoTokenResponseSchema.safeParse(JSON.parse(cacheResponse));
        const poTokenResponse = parsed.success ? parsed.data : null;
        if (!validateResponse(poTokenResponse)) {
          this.logger.error(`Invalid PO Token response retrieved from cache provider "${provider.providerName}": ${cacheResponse}${providerBugReportMessage(provider)}`);
          provider.delete(cacheKey);
          continue;
        }
        if (index > 0) {
          this.store(request, poTokenResponse, CacheProviderWritePolicy.WRITE_FIRST);
        }
        return poTokenResponse;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (error instanceof PoTokenCacheProviderError && error.expected) {
          this.logger.warning(`Error from "${provider.providerName}" PO Token cache provider: ${message}`);
        } else {
          this.logger.error(`Error occurred with "${provider.providerName}" PO Token cache provider: ${message}${providerBugReportMessage(provider)}`);
        }
      }
    }
    return null;
  }

  store(request: PoTokenRequest, response: PoTokenResponse, writePolicy?: CacheProviderWritePolicy): void {
    const spec = this.getCacheSpec(request);
    if (!spec) {
      this.logger.trace("No cache spec available for this request. Not caching.");
      return;
    }
    if (!validateResponse(response)) {
      this.logger.error(`Invalid PO Token response provided to PoTokenCache.store(): ${JSON.stringify(response)}${bugReportsMessage()}`);
      return;
    }
    const cacheKey = this.generateKey(this.generateKeyBindings(spec));
    const expiresAt = response.expiresAt ?? nowSeconds() + spec.defaultTtl;
    const cacheResponse = { ...response, expiresAt };
    const resolvedWritePolicy = writePolicy ?? spec.writePolicy;
    for (const [index, provider] of this.getCacheProviders(request).entries()) {
      try {
        provider.store(cacheKey, JSON.stringify(cacheResponse), expiresAt);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warning(`Error from "${provider.providerName}" PO Token cache provider: ${message}`);
      }
      if (index === 0 && resolvedWritePolicy === CacheProviderWritePolicy.WRITE_FIRST) {
        return;
      }
    }
  }

  close(): void {
    for (const provider of this.cacheProviders.values()) {
      provider.close();
    }
    for (const provider of this.cacheSpecProviders.values()) {
      provider.close();
    }
  }

  private getCacheProviders(request: PoTokenRequest): PoTokenCacheProvider[] {
    const preferences = new Map([...this.cacheProviders.values()].map((provider) => [
      provider,
      this.cacheProviderPreferences.reduce((total, preference) => total + preference(provider, request), 0),
    ]));
    return [...this.cacheProviders.values()]
      .sort((left, right) => (preferences.get(right) ?? 0) - (preferences.get(left) ?? 0))
      .filter((provider) => provider.isAvailable());
  }

  private getCacheSpec(request: PoTokenRequest): PoTokenCacheSpec | null {
    for (const provider of this.cacheSpecProviders.values()) {
      if (!provider.isAvailable()) {
        continue;
      }
      try {
        const spec = provider.generateCacheSpec(request);
        if (!spec) {
          continue;
        }
        if (!validateCacheSpec(spec)) {
          this.logger.error(`PoTokenCacheSpecProvider "${provider.providerName}" generateCacheSpec() returned invalid spec ${JSON.stringify(spec)}${providerBugReportMessage(provider)}`);
          continue;
        }
        return { ...spec, provider };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error occurred with "${provider.providerName}" PO Token cache spec provider: ${message}${providerBugReportMessage(provider)}`);
      }
    }
    return null;
  }

  private generateKeyBindings(spec: PoTokenCacheSpec): Record<string, string> {
    return {
      ...Object.fromEntries(Object.entries(spec.keyBindings).filter((entry): entry is [string, string] => entry[1] !== null && entry[1] !== undefined)),
      _dlp_cache: "v1",
      ...(spec.provider ? { _p: spec.provider.providerName } : {}),
    };
  }

  private generateKey(bindings: Record<string, string>): string {
    return createHash("sha256").update(JSON.stringify(Object.fromEntries(Object.entries(bindings).sort()))).digest("hex");
  }
}

export class PoTokenRequestDirector {
  readonly providers = new Map<string, PoTokenProvider>();
  readonly preferences: PoTokenPreference[] = [];

  constructor(
    readonly logger: IEContentProviderLogger,
    readonly cache: PoTokenCache,
  ) {}

  registerProvider(provider: PoTokenProvider): void {
    this.providers.set(provider.providerName, provider);
  }

  registerPreference(preference: PoTokenPreference): void {
    this.preferences.push(preference);
  }

  async getPoToken(request: PoTokenRequest): Promise<string | null> {
    if (!request.bypassCache) {
      const cached = this.cache.get(request);
      if (cached) {
        return cleanPot(cached.poToken);
      }
    }
    if (!this.providers.size) {
      this.logger.trace("No PO Token providers registered");
      return null;
    }
    const response = await this.getPoTokenResponse(request);
    if (!response) {
      return null;
    }
    response.poToken = cleanPot(response.poToken);
    if (response.expiresAt === undefined || response.expiresAt > 0) {
      this.cache.store(request, response);
    }
    return response.poToken;
  }

  close(): void {
    for (const provider of this.providers.values()) {
      provider.close();
    }
    this.cache.close();
  }

  private getProviders(request: PoTokenRequest): PoTokenProvider[] {
    const preferences = new Map([...this.providers.values()].map((provider) => [
      provider,
      this.preferences.reduce((total, preference) => total + preference(provider, [request]), 0),
    ]));
    return [...this.providers.values()]
      .sort((left, right) => (preferences.get(right) ?? 0) - (preferences.get(left) ?? 0))
      .filter((provider) => provider.isAvailable());
  }

  private async getPoTokenResponse(request: PoTokenRequest): Promise<PoTokenResponse | null> {
    for (const provider of this.getProviders(request)) {
      try {
        const response = await provider.requestPot({ ...request });
        if (!validateResponse(response)) {
          this.logger.error(`Invalid PO Token response received from "${provider.providerName}" provider: ${JSON.stringify(response)}${providerBugReportMessage(provider)}`);
          continue;
        }
        return response;
      } catch (error) {
        if (error instanceof PoTokenProviderRejectedRequest) {
          this.logger.trace(`PO Token Provider "${provider.providerName}" rejected this request, trying next available provider. Reason: ${error.message}`);
        } else if (error instanceof PoTokenProviderError) {
          this.logger.warning(`Error fetching PO Token from "${provider.providerName}" provider: ${error.message}${error.expected ? "" : providerBugReportMessage(provider)}`);
        } else {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.error(`Unexpected error when fetching PO Token from "${provider.providerName}" provider: ${message}${providerBugReportMessage(provider)}`);
        }
      }
    }
    return null;
  }
}

export function initializePotDirector(host: YoutubePoTokenHost): PoTokenRequestDirector {
  const extractorArgs = host.params?.extractor_args ?? {};
  const youtubeArgs = extractorArgs.youtube;
  const enableTrace = Array.isArray(youtubeArgs) && youtubeArgs.includes("pot_trace=true");
  const logLevel = enableTrace ? LogLevel.TRACE : host.params?.verbose ? LogLevel.DEBUG : LogLevel.INFO;

  const getLoggerAndSettings = (provider: { providerName: string }, loggerKey: string): [YoutubeIEContentProviderLogger, Record<string, readonly string[] | undefined>] => {
    const extractorKey = `youtubepot-${provider.providerName.toLowerCase()}`;
    const rawSettings = extractorArgs[extractorKey];
    const settings = ProviderSettingsSchema.safeParse(rawSettings).success
      ? rawSettings as Record<string, readonly string[] | undefined>
      : {};
    return [
      new YoutubeIEContentProviderLogger(host, `${loggerKey}:${provider.providerName}`, logLevel),
      settings,
    ];
  };

  const cacheProviders = [...potCacheProviders.values()].map((Provider) => {
    const Ctor = Provider as PoTokenCacheProviderConstructor;
    const [logger, settings] = getLoggerAndSettings(Ctor, "pot:cache");
    return new Ctor(host, logger, settings);
  });
  const cacheSpecProviders = [...potPcsProviders.values()].map((Provider) => {
    const Ctor = Provider as PoTokenCacheSpecProviderConstructor;
    const [logger, settings] = getLoggerAndSettings(Ctor, "pot:cache:spec");
    return new Ctor(host, logger, settings);
  });
  const cache = new PoTokenCache(
    new YoutubeIEContentProviderLogger(host, "pot:cache", logLevel),
    cacheProviders,
    cacheSpecProviders,
    [...potCacheProviderPreferences] as CacheProviderPreference[],
  );
  const director = new PoTokenRequestDirector(new YoutubeIEContentProviderLogger(host, "pot", logLevel), cache);
  host.addCloseHook?.(() => director.close());
  for (const Provider of potProviders.values()) {
    const Ctor = Provider as PoTokenProviderConstructor;
    const [logger, settings] = getLoggerAndSettings(Ctor, "pot");
    director.registerProvider(new Ctor(host, logger, settings));
  }
  for (const preference of ptpPreferences) {
    director.registerPreference(preference);
  }
  return director;
}

export const initialize_pot_director = initializePotDirector;

export function providerDisplayList(providers: Iterable<IEContentProvider>): string {
  const displayNames = [...providers].map((provider) => {
    let display = joinNonempty(
      provider.providerName,
      provider instanceof BuiltinIEContentProvider ? null : (provider.constructor as typeof IEContentProvider).providerVersion,
    );
    const statuses: string[] = [];
    if (!(provider instanceof BuiltinIEContentProvider)) {
      statuses.push("external");
    }
    if (!provider.isAvailable()) {
      statuses.push("unavailable");
    }
    if (statuses.length) {
      display += ` (${statuses.join(", ")})`;
    }
    return display;
  });
  return displayNames.join(", ") || "none";
}

export function cleanPot(poToken: string): string {
  const token = decodeURIComponent(poToken).match(/^[^?&#]+/)?.[0];
  if (!token) {
    throw new Error("Invalid PO Token");
  }
  try {
    return Buffer.from(Buffer.from(token, "base64url")).toString("base64url");
  } catch {
    throw new Error("Invalid PO Token");
  }
}

export const clean_pot = cleanPot;

export function validateResponse(response: PoTokenResponse | null | undefined): response is PoTokenResponse {
  if (!response?.poToken) {
    return false;
  }
  try {
    cleanPot(response.poToken);
  } catch {
    return false;
  }
  return response.expiresAt === undefined || response.expiresAt <= 0 || response.expiresAt > nowSeconds();
}

export const validate_response = validateResponse;

export function validateCacheSpec(spec: PoTokenCacheSpec | null | undefined): spec is PoTokenCacheSpec {
  return Boolean(
    spec &&
      Object.values(CacheProviderWritePolicy).includes(spec.writePolicy) &&
      Number.isInteger(spec.defaultTtl) &&
      spec.keyBindings &&
      Object.keys(spec.keyBindings).every((key) => typeof key === "string") &&
      Object.values(spec.keyBindings).every((value) => value === null || value === undefined || typeof value === "string") &&
      Object.values(spec.keyBindings).some((value) => value !== null && value !== undefined),
  );
}

export const validate_cache_spec = validateCacheSpec;

export interface YoutubePoTokenHost extends IEContentProviderHost {
  params?: {
    verbose?: boolean;
    extractor_args?: Record<string, Record<string, readonly string[] | undefined> | readonly string[] | undefined>;
  };
  writeDebug?(message: string, options?: { once?: boolean }): void;
  toScreen?(message: string): void;
  reportWarning?(message: string, options?: { once?: boolean }): void;
  reportError?(message: string, cause?: Error): void;
  addCloseHook?(hook: () => void): void;
}

function nowSeconds(): number {
  return Math.trunc(Date.now() / 1000);
}
