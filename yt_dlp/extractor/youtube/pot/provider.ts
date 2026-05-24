// Source: yt_dlp/extractor/youtube/pot/provider.py

import {
  IEContentProvider,
  IEContentProviderError,
  type IEContentProviderHost,
  type IEContentProviderLogger,
} from "./internal-provider.ts";
import { potProviders, ptpPreferences } from "./registry.ts";

export enum PoTokenContext {
  GVS = "gvs",
  PLAYER = "player",
  SUBS = "subs",
}

export enum ExternalRequestFeature {
  PROXY_SCHEME_HTTP = "http",
  PROXY_SCHEME_HTTPS = "https",
  PROXY_SCHEME_SOCKS4 = "socks4",
  PROXY_SCHEME_SOCKS4A = "socks4a",
  PROXY_SCHEME_SOCKS5 = "socks5",
  PROXY_SCHEME_SOCKS5H = "socks5h",
  SOURCE_ADDRESS = "source_address",
  DISABLE_TLS_VERIFICATION = "disable_tls_verification",
}

export interface InnertubeContext {
  client?: {
    clientName?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface PoTokenRequest {
  context: PoTokenContext;
  innertubeContext: InnertubeContext;
  innertubeHost?: string;
  sessionIndex?: string;
  playerUrl?: string;
  isAuthenticated?: boolean;
  videoWebpage?: string;
  internalClientName?: string;
  visitorData?: string;
  dataSyncId?: string;
  videoId?: string;
  gvsBindToVideoId?: boolean;
  requestProxy?: string;
  requestHeaders?: Headers | Record<string, string> | readonly [string, string][];
  requestTimeout?: number;
  requestSourceAddress?: string;
  requestVerifyTls?: boolean;
  bypassCache?: boolean;
}

export interface PoTokenResponse {
  poToken: string;
  expiresAt?: number;
}

export class PoTokenProviderRejectedRequest extends IEContentProviderError {}
export class PoTokenProviderError extends IEContentProviderError {}

export type PoTokenProviderConstructor = {
  readonly providerName: string;
  new (
    host: IEContentProviderHost,
    logger?: IEContentProviderLogger,
    settings?: Record<string, readonly string[] | undefined>,
  ): PoTokenProvider;
};

export type PoTokenPreference = (provider: PoTokenProvider, requests: readonly PoTokenRequest[]) => number;

export abstract class PoTokenProvider extends IEContentProvider {
  protected supportedContexts: readonly PoTokenContext[] | null = [];
  protected supportedClients: readonly string[] | null = [];
  protected supportedExternalRequestFeatures: readonly ExternalRequestFeature[] | null = [];

  async requestPot(request: PoTokenRequest): Promise<PoTokenResponse> {
    this.validateRequest(request);
    return await this.realRequestPot(request);
  }

  protected abstract realRequestPot(request: PoTokenRequest): Promise<PoTokenResponse>;

  protected validateRequest(request: PoTokenRequest): void {
    if (!this.isAvailable()) {
      throw new PoTokenProviderRejectedRequest(`${this.providerName} is not available`);
    }
    if (this.supportedContexts !== null && !this.supportedContexts.includes(request.context)) {
      throw new PoTokenProviderRejectedRequest(`PO Token Context "${request.context}" is not supported by ${this.providerName}`);
    }
    const clientName = request.innertubeContext.client?.clientName;
    if (this.supportedClients !== null && clientName && !this.supportedClients.includes(clientName)) {
      throw new PoTokenProviderRejectedRequest(
        `Client "${clientName}" is not supported by ${this.providerName}. Supported clients: ${this.supportedClients.join(", ") || "none"}`,
      );
    }
    this.validateExternalRequestFeatures(request);
  }

  protected async requestWebpage(request: Request, note?: string | false): Promise<Response> {
    if (note !== false) {
      this.logger.info(note ?? "Requesting webpage");
    }
    if (!this.host.request) {
      return await fetch(request);
    }
    return await this.host.request(request);
  }

  private validateExternalRequestFeatures(request: PoTokenRequest): void {
    if (this.supportedExternalRequestFeatures === null) {
      return;
    }
    if (request.requestProxy) {
      const scheme = URL.canParse(request.requestProxy) ? new URL(request.requestProxy).protocol.replace(/:$/, "") : "";
      if (!this.supportedExternalRequestFeatures.includes(scheme as ExternalRequestFeature)) {
        throw new PoTokenProviderRejectedRequest(
          `External requests by "${this.providerName}" provider do not support proxy scheme "${scheme}"`,
        );
      }
    }
    if (request.requestSourceAddress && !this.supportedExternalRequestFeatures.includes(ExternalRequestFeature.SOURCE_ADDRESS)) {
      throw new PoTokenProviderRejectedRequest(`External requests by "${this.providerName}" provider do not support setting source address`);
    }
    if (request.requestVerifyTls === false && !this.supportedExternalRequestFeatures.includes(ExternalRequestFeature.DISABLE_TLS_VERIFICATION)) {
      throw new PoTokenProviderRejectedRequest(`External requests by "${this.providerName}" provider do not support ignoring TLS certificate failures`);
    }
  }
}

export function registerProvider<T extends PoTokenProviderConstructor>(provider: T): T {
  if (potProviders.has(provider.providerName)) {
    throw new Error(`PoTokenProvider ${provider.providerName} already registered`);
  }
  potProviders.set(provider.providerName, provider);
  return provider;
}

export function registerPreference(preference: PoTokenPreference): PoTokenPreference {
  ptpPreferences.add(preference);
  return preference;
}

export function providerBugReportMessage(provider: IEContentProvider, before = ";"): string {
  const trimmed = before.trimEnd();
  const message = provider.bugReportMessage;
  return trimmed ? `${trimmed} ${message}` : message[0]?.toUpperCase() + message.slice(1);
}
