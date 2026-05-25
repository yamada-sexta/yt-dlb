// Source: yt_dlp/extractor/youtube/_base.py
// Port note: shared YouTube constants and base extraction helpers are being migrated incrementally.

import { createHash } from "node:crypto";

import { z } from "zod";

import { NotImplementedError } from "../../errors.ts";
import { ExtractorError, intOrNone, joinNonempty, strToInt, unifiedTimestamp, urlOrNone } from "../../utils/index.ts";
import { Ellipsis, traverseObj, type TraversePath } from "../../utils/traversal.ts";
import { InfoExtractor, type ExtractorInfo } from "../common.ts";

const JsonObjectSchema = z.record(z.string(), z.unknown());
const RecordSchema = z.record(z.string(), z.unknown());
const ExtractorArgsSchema = z.record(z.string(), z.array(z.string()));
const ThumbnailSchema = z.object({
  url: z.string(),
  height: z.union([z.string(), z.number()]).optional(),
  width: z.union([z.string(), z.number()]).optional(),
}).passthrough();

export enum BadgeType {
  AVAILABILITY_UNLISTED = "availability_unlisted",
  AVAILABILITY_PRIVATE = "availability_private",
  AVAILABILITY_PUBLIC = "availability_public",
  AVAILABILITY_PREMIUM = "availability_premium",
  AVAILABILITY_SUBSCRIPTION = "availability_subscription",
  LIVE_NOW = "live_now",
  VERIFIED = "verified",
}

export interface YoutubeBadge {
  type: BadgeType;
}

export interface YoutubeThumbnail {
  url: string;
  height?: number;
  width?: number;
}

export enum PoTokenContext {
  PLAYER = "player",
  GVS = "gvs",
  SUBS = "subs",
}

export enum StreamingProtocol {
  HTTPS = "https",
  DASH = "dash",
  HLS = "hls",
}

export interface BasePoTokenPolicy {
  required?: boolean;
  recommended?: boolean;
  not_required_for_premium?: boolean;
}

export interface GvsPoTokenPolicy extends BasePoTokenPolicy {
  not_required_with_player_token?: boolean;
}

export type PlayerPoTokenPolicy = BasePoTokenPolicy;
export type SubsPoTokenPolicy = BasePoTokenPolicy;

export const WEB_PO_TOKEN_POLICIES = {
  GVS_PO_TOKEN_POLICY: {
    [StreamingProtocol.HTTPS]: {
      required: true,
      recommended: true,
      not_required_for_premium: true,
      not_required_with_player_token: false,
    },
    [StreamingProtocol.DASH]: {
      required: true,
      recommended: true,
      not_required_for_premium: true,
      not_required_with_player_token: false,
    },
    [StreamingProtocol.HLS]: {
      required: false,
      recommended: true,
    },
  },
  PLAYER_PO_TOKEN_POLICY: { required: false },
  SUBS_PO_TOKEN_POLICY: { required: false },
} as const;

export interface InnertubeClient {
  INNERTUBE_HOST?: string;
  INNERTUBE_CONTEXT: {
    client: Record<string, string | number>;
    [key: string]: unknown;
  };
  INNERTUBE_CONTEXT_CLIENT_NAME: number;
  SUPPORTS_COOKIES?: boolean;
  SUPPORTS_AD_PLAYBACK_CONTEXT?: boolean;
  REQUIRE_AUTH?: boolean;
  REQUIRE_JS_PLAYER?: boolean;
  GVS_PO_TOKEN_POLICY?: Record<StreamingProtocol, GvsPoTokenPolicy> | Partial<Record<StreamingProtocol, GvsPoTokenPolicy>>;
  PLAYER_PO_TOKEN_POLICY?: PlayerPoTokenPolicy;
  SUBS_PO_TOKEN_POLICY?: SubsPoTokenPolicy;
  PLAYER_PARAMS?: string | null;
  priority?: number;
}

export const INNERTUBE_CLIENTS: Record<string, InnertubeClient> = {
  web: {
    INNERTUBE_CONTEXT: {
      client: {
        clientName: "WEB",
        clientVersion: "2.20260114.08.00",
      },
    },
    INNERTUBE_CONTEXT_CLIENT_NAME: 1,
    SUPPORTS_COOKIES: true,
    ...WEB_PO_TOKEN_POLICIES,
  },
  web_safari: {
    INNERTUBE_CONTEXT: {
      client: {
        clientName: "WEB",
        clientVersion: "2.20260114.08.00",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Safari/605.1.15,gzip(gfe)",
      },
    },
    INNERTUBE_CONTEXT_CLIENT_NAME: 1,
    SUPPORTS_COOKIES: true,
    ...WEB_PO_TOKEN_POLICIES,
  },
  web_embedded: {
    INNERTUBE_CONTEXT: {
      client: {
        clientName: "WEB_EMBEDDED_PLAYER",
        clientVersion: "1.20260115.01.00",
      },
    },
    INNERTUBE_CONTEXT_CLIENT_NAME: 56,
    SUPPORTS_COOKIES: true,
  },
  web_music: {
    INNERTUBE_HOST: "music.youtube.com",
    INNERTUBE_CONTEXT: {
      client: {
        clientName: "WEB_REMIX",
        clientVersion: "1.20260114.03.00",
      },
    },
    INNERTUBE_CONTEXT_CLIENT_NAME: 67,
    SUPPORTS_COOKIES: true,
    SUPPORTS_AD_PLAYBACK_CONTEXT: true,
  },
  web_creator: {
    INNERTUBE_CONTEXT: {
      client: {
        clientName: "WEB_CREATOR",
        clientVersion: "1.20260114.05.00",
      },
    },
    INNERTUBE_CONTEXT_CLIENT_NAME: 62,
    GVS_PO_TOKEN_POLICY: {
      [StreamingProtocol.HTTPS]: {
        required: true,
        recommended: true,
        not_required_for_premium: true,
        not_required_with_player_token: false,
      },
      [StreamingProtocol.DASH]: {
        required: true,
        recommended: true,
        not_required_for_premium: true,
        not_required_with_player_token: false,
      },
      [StreamingProtocol.HLS]: {
        required: false,
        recommended: true,
      },
    },
    REQUIRE_AUTH: true,
    SUPPORTS_COOKIES: true,
  },
  android: {
    INNERTUBE_CONTEXT: {
      client: {
        clientName: "ANDROID",
        clientVersion: "21.02.35",
        androidSdkVersion: 30,
        userAgent: "com.google.android.youtube/21.02.35 (Linux; U; Android 11) gzip",
        osName: "Android",
        osVersion: "11",
      },
    },
    INNERTUBE_CONTEXT_CLIENT_NAME: 3,
    REQUIRE_JS_PLAYER: false,
    GVS_PO_TOKEN_POLICY: {
      [StreamingProtocol.HTTPS]: {
        required: true,
        recommended: true,
        not_required_with_player_token: true,
      },
      [StreamingProtocol.DASH]: {
        required: true,
        recommended: true,
        not_required_with_player_token: true,
      },
      [StreamingProtocol.HLS]: {
        required: false,
        recommended: true,
        not_required_with_player_token: true,
      },
    },
    PLAYER_PO_TOKEN_POLICY: { required: false, recommended: true },
  },
  android_vr: {
    INNERTUBE_CONTEXT: {
      client: {
        clientName: "ANDROID_VR",
        clientVersion: "1.65.10",
        deviceMake: "Oculus",
        deviceModel: "Quest 3",
        androidSdkVersion: 32,
        userAgent: "com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip",
        osName: "Android",
        osVersion: "12L",
      },
    },
    INNERTUBE_CONTEXT_CLIENT_NAME: 28,
    REQUIRE_JS_PLAYER: false,
  },
  ios: {
    INNERTUBE_CONTEXT: {
      client: {
        clientName: "IOS",
        clientVersion: "21.02.3",
        deviceMake: "Apple",
        deviceModel: "iPhone16,2",
        userAgent: "com.google.ios.youtube/21.02.3 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)",
        osName: "iPhone",
        osVersion: "18.3.2.22D82",
      },
    },
    INNERTUBE_CONTEXT_CLIENT_NAME: 5,
    GVS_PO_TOKEN_POLICY: {
      [StreamingProtocol.HTTPS]: {
        required: true,
        recommended: true,
        not_required_with_player_token: true,
      },
      [StreamingProtocol.HLS]: {
        required: true,
        recommended: true,
        not_required_with_player_token: true,
      },
    },
    PLAYER_PO_TOKEN_POLICY: { required: false, recommended: true },
    REQUIRE_JS_PLAYER: false,
  },
  mweb: {
    INNERTUBE_CONTEXT: {
      client: {
        clientName: "MWEB",
        clientVersion: "2.20260115.01.00",
        userAgent: "Mozilla/5.0 (iPad; CPU OS 16_7_10 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1,gzip(gfe)",
      },
    },
    INNERTUBE_CONTEXT_CLIENT_NAME: 2,
    GVS_PO_TOKEN_POLICY: {
      [StreamingProtocol.HTTPS]: {
        required: true,
        recommended: true,
        not_required_for_premium: true,
        not_required_with_player_token: false,
      },
      [StreamingProtocol.DASH]: {
        required: true,
        recommended: true,
        not_required_for_premium: true,
        not_required_with_player_token: false,
      },
      [StreamingProtocol.HLS]: {
        required: false,
        recommended: true,
      },
    },
    SUPPORTS_COOKIES: true,
    SUPPORTS_AD_PLAYBACK_CONTEXT: true,
  },
  tv: {
    INNERTUBE_CONTEXT: {
      client: {
        clientName: "TVHTML5",
        clientVersion: "7.20260114.12.00",
        userAgent: "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/25.lts.30.1034943-gold (unlike Gecko), Unknown_TV_Unknown_0/Unknown (Unknown, Unknown)",
      },
    },
    INNERTUBE_CONTEXT_CLIENT_NAME: 7,
    SUPPORTS_COOKIES: true,
  },
  tv_downgraded: {
    INNERTUBE_CONTEXT: {
      client: {
        clientName: "TVHTML5",
        clientVersion: "5.20260114",
        userAgent: "Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version",
      },
    },
    INNERTUBE_CONTEXT_CLIENT_NAME: 7,
    REQUIRE_AUTH: true,
    SUPPORTS_COOKIES: true,
  },
  tv_simply: {
    INNERTUBE_CONTEXT: {
      client: {
        clientName: "TVHTML5_SIMPLY",
        clientVersion: "1.0",
      },
    },
    GVS_PO_TOKEN_POLICY: {
      [StreamingProtocol.HTTPS]: {
        required: true,
        recommended: true,
      },
      [StreamingProtocol.DASH]: {
        required: true,
        recommended: true,
      },
      [StreamingProtocol.HLS]: {
        required: false,
        recommended: true,
      },
    },
    INNERTUBE_CONTEXT_CLIENT_NAME: 75,
  },
};

export type InnertubeClientName = keyof typeof INNERTUBE_CLIENTS;

export function splitInnertubeClient(clientName: string): [string, string, string | null] {
  const dotIndex = clientName.lastIndexOf(".");
  if (dotIndex !== -1) {
    const variant = clientName.slice(0, dotIndex);
    return [variant, clientName.slice(dotIndex + 1), variant];
  }
  const [base, ...variantParts] = clientName.split("_");
  return [clientName, base ?? clientName, variantParts.join("_") || null];
}

export const _split_innertube_client = splitInnertubeClient;

export function shortClientName(clientName: string): string {
  const [splitClient] = splitInnertubeClient(clientName);
  const [main, ...parts] = splitClient.split("_");
  return joinNonempty((main ?? "").slice(0, 4), parts.map((part) => part[0] ?? "").join(""), { delim: "" }).toUpperCase();
}

export const short_client_name = shortClientName;

function fixEmbeddedYtcfg(ytcfg: InnertubeClient): void {
  const context = ytcfg.INNERTUBE_CONTEXT as Record<string, unknown>;
  const thirdParty = z.record(z.string(), z.unknown()).safeParse(context.thirdParty).success
    ? context.thirdParty as Record<string, unknown>
    : {};
  thirdParty.embedUrl = "https://www.reddit.com/";
  context.thirdParty = thirdParty;
}

export function buildInnertubeClients(): void {
  const baseClients = ["tv", "web", "mweb", "android", "ios"];
  const priority = (client: string): number => {
    const index = [...baseClients].reverse().indexOf(client);
    return index === -1 ? -1 : index;
  };

  for (const [client, ytcfg] of Object.entries(INNERTUBE_CLIENTS)) {
    ytcfg.INNERTUBE_HOST ??= "www.youtube.com";
    ytcfg.REQUIRE_JS_PLAYER ??= true;
    ytcfg.GVS_PO_TOKEN_POLICY ??= {};
    for (const protocol of Object.values(StreamingProtocol)) {
      ytcfg.GVS_PO_TOKEN_POLICY[protocol] ??= {};
    }
    ytcfg.PLAYER_PO_TOKEN_POLICY ??= {};
    ytcfg.SUBS_PO_TOKEN_POLICY ??= {};
    ytcfg.REQUIRE_AUTH ??= false;
    ytcfg.SUPPORTS_COOKIES ??= false;
    ytcfg.SUPPORTS_AD_PLAYBACK_CONTEXT ??= false;
    ytcfg.PLAYER_PARAMS ??= null;
    ytcfg.INNERTUBE_CONTEXT.client.hl ??= "en";

    const [, baseClient, variant] = splitInnertubeClient(client);
    ytcfg.priority = 10 * priority(baseClient);
    if (variant === "embedded") {
      fixEmbeddedYtcfg(ytcfg);
    }
  }
}

buildInnertubeClients();

export function getInnertubeClient(client: string = "web"): InnertubeClient {
  const ytcfg = INNERTUBE_CLIENTS[client];
  if (!ytcfg) {
    throw new Error(`Unknown YouTube Innertube client: ${client}`);
  }
  return ytcfg;
}

export class YoutubeBaseInfoExtractor extends InfoExtractor {
  static readonly _RESERVED_NAMES = String.raw`channel|c|user|playlist|watch|w|v|embed|e|live|watch_popup|clip|shorts|movies|results|search|shared|hashtag|trending|explore|feed|feeds|browse|oembed|get_video_info|iframe_api|s/player|source|storefront|oops|index|account|t/terms|about|upload|signin|logout`;
  static readonly _PLAYLIST_ID_RE = String.raw`(?:(?:PL|LL|EC|UU|FL|RD|UL|TL|PU|OLAK5uy_)[0-9A-Za-z-_]{10,}|RDMM|WL|LL|LM)`;
  static readonly _VIDEO_ID_RE = String.raw`[0-9A-Za-z_-]{11}`;
  static readonly _YT_CHANNEL_UCID_RE = String.raw`UC[\w-]{22}`;
  static readonly _YT_HANDLE_RE = String.raw`@[\w.-]{3,30}`;

  protected override async realExtract(_url: string): Promise<ExtractorInfo | null> {
    throw new NotImplementedError("full YouTube base extractor flow");
  }

  protected ytInitialData(webpage: string, videoId: string): Record<string, unknown> {
    const rawData = this.searchJson<unknown>(
      String.raw`(?:window\s*\[\s*["']ytInitialData["']\s*\]|ytInitialData)\s*=`,
      webpage,
      "yt initial data",
      videoId,
      { endPattern: String.raw`(?:</script>|;|\n)` },
    );
    return JsonObjectSchema.parse(rawData ?? {});
  }

  protected extractYtInitialData(itemId: string, webpage: string, options: { fatal?: boolean } = {}): Record<string, unknown> | null {
    try {
      return this.ytInitialData(webpage, itemId);
    } catch (error) {
      if (options.fatal === false) {
        this.reportWarning(`unable to extract yt initial data`, itemId, true);
        return null;
      }
      throw error;
    }
  }

  protected _extract_yt_initial_data(itemId: string, webpage: string, fatal = true): Record<string, unknown> | null {
    return this.extractYtInitialData(itemId, webpage, { fatal });
  }

  protected getDefaultYtcfg(client = "web"): InnertubeClient {
    return structuredClone(getInnertubeClient(client));
  }

  protected _get_default_ytcfg(client = "web"): InnertubeClient {
    return this.getDefaultYtcfg(client);
  }

  protected getInnertubeHost(client = "web"): string {
    return getInnertubeClient(client).INNERTUBE_HOST ?? "www.youtube.com";
  }

  protected _get_innertube_host(client = "web"): string {
    return this.getInnertubeHost(client);
  }

  protected ytcfgGetSafe<T>(ytcfg: unknown, getters: readonly ((value: Record<string, unknown>) => T | null | undefined)[] | ((value: Record<string, unknown>) => T | null | undefined), defaultClient = "web"): T | null {
    const candidates = [ytcfg, this.getDefaultYtcfg(defaultClient)];
    for (const candidate of candidates) {
      const record = RecordSchema.safeParse(candidate);
      if (!record.success) {
        continue;
      }
      for (const getter of Array.isArray(getters) ? getters : [getters]) {
        const value = tryGetter(record.data, getter);
        if (value !== null && value !== undefined) {
          return value as T;
        }
      }
    }
    return null;
  }

  protected _ytcfg_get_safe<T>(ytcfg: unknown, getter: readonly ((value: Record<string, unknown>) => T | null | undefined)[] | ((value: Record<string, unknown>) => T | null | undefined), _expectedType: unknown = null, defaultClient = "web"): T | null {
    void _expectedType;
    return this.ytcfgGetSafe(ytcfg, getter, defaultClient);
  }

  protected extractClientName(ytcfg: unknown, defaultClient = "web"): string | null {
    return this.ytcfgGetSafe(ytcfg, [
      (value) => typeof value.INNERTUBE_CLIENT_NAME === "string" ? value.INNERTUBE_CLIENT_NAME : null,
      (value) => nestedString(value, ["INNERTUBE_CONTEXT", "client", "clientName"]),
    ], defaultClient);
  }

  protected _extract_client_name(ytcfg: unknown, defaultClient = "web"): string | null {
    return this.extractClientName(ytcfg, defaultClient);
  }

  protected extractClientVersion(ytcfg: unknown, defaultClient = "web"): string | null {
    return this.ytcfgGetSafe(ytcfg, [
      (value) => typeof value.INNERTUBE_CLIENT_VERSION === "string" ? value.INNERTUBE_CLIENT_VERSION : null,
      (value) => nestedString(value, ["INNERTUBE_CONTEXT", "client", "clientVersion"]),
    ], defaultClient);
  }

  protected _extract_client_version(ytcfg: unknown, defaultClient = "web"): string | null {
    return this.extractClientVersion(ytcfg, defaultClient);
  }

  protected selectApiHostname(reqApiHostname: string | null | undefined, defaultClient = "web"): string {
    return this.youtubeConfigurationArg("innertube_host", [])[0] ?? reqApiHostname ?? this.getInnertubeHost(defaultClient);
  }

  protected _select_api_hostname(reqApiHostname: string | null | undefined, defaultClient = "web"): string {
    return this.selectApiHostname(reqApiHostname, defaultClient);
  }

  protected youtubeConfigurationArg(key: string, defaultValue: readonly (string | null)[]): (string | null)[] {
    const parsedArgs = ExtractorArgsSchema.safeParse(RecordSchema.safeParse(this.downloader?.params).success
      ? (this.downloader?.params as Record<string, unknown>).extractor_args
      : undefined);
    const args = parsedArgs.success ? parsedArgs.data.youtube ?? [] : [];
    const results: Array<string | null> = [];
    for (const arg of args) {
      const [argKey, ...valueParts] = String(arg).split("=");
      if (argKey === key) {
        results.push(valueParts.join("=") || null);
      }
    }
    return results.length ? results : [...defaultValue];
  }

  protected extractContext(ytcfg: unknown = null, defaultClient = "web"): Record<string, unknown> {
    const context = structuredClone(
      firstRecord(
        [
          nestedUnknown(ytcfg, ["INNERTUBE_CONTEXT"]),
          this.getDefaultYtcfg(defaultClient).INNERTUBE_CONTEXT,
        ],
      ) ?? {},
    );
    const client = RecordSchema.safeParse(context.client).success
      ? context.client as Record<string, unknown>
      : {};
    client.hl = "en";
    client.timeZone = "UTC";
    client.utcOffsetMinutes = 0;
    context.client = client;
    return context;
  }

  protected _extract_context(ytcfg: unknown = null, defaultClient = "web"): Record<string, unknown> {
    return this.extractContext(ytcfg, defaultClient);
  }

  static makeSidAuthorization(scheme: string, sid: string, origin: string, additionalParts: Record<string, string> = {}): string {
    const timestamp = String(Math.round(Date.now() / 1000));
    const hashParts = Object.keys(additionalParts).length ? [Object.values(additionalParts).join(":")] : [];
    hashParts.push(timestamp, sid, origin);
    const sidHash = createHash("sha1").update(hashParts.join(" ")).digest("hex");
    const suffix = Object.keys(additionalParts).length ? Object.entries(additionalParts).map(([key, value]) => `${key}${value}`).join("") : "";
    return `${scheme} ${[timestamp, sidHash, suffix].filter(Boolean).join("_")}`;
  }

  static _make_sid_authorization(scheme: string, sid: string, origin: string, additionalParts: Record<string, string> = {}): string {
    return this.makeSidAuthorization(scheme, sid, origin, additionalParts);
  }

  protected getYoutubeCookies() {
    return this.getCookies("https://www.youtube.com");
  }

  protected getSidCookies(): [string | null, string | null, string | null] {
    const cookies = this.getYoutubeCookies();
    const sapisid = cookies.get("SAPISID") ?? cookies.get("__Secure-3PAPISID") ?? null;
    return [
      sapisid,
      cookies.get("__Secure-1PAPISID") ?? null,
      cookies.get("__Secure-3PAPISID") ?? null,
    ];
  }

  protected _get_sid_cookies(): [string | null, string | null, string | null] {
    return this.getSidCookies();
  }

  protected getSidAuthorizationHeader(origin = "https://www.youtube.com", userSessionId: string | null = null): string | null {
    const additionalParts: Record<string, string> = userSessionId ? { u: userSessionId } : {};
    const [sapisid, onePSapisid, threePSapisid] = this.getSidCookies();
    const authorizations = [
      sapisid ? YoutubeBaseInfoExtractor.makeSidAuthorization("SAPISIDHASH", sapisid, origin, additionalParts) : null,
      onePSapisid ? YoutubeBaseInfoExtractor.makeSidAuthorization("SAPISID1PHASH", onePSapisid, origin, additionalParts) : null,
      threePSapisid ? YoutubeBaseInfoExtractor.makeSidAuthorization("SAPISID3PHASH", threePSapisid, origin, additionalParts) : null,
    ].filter((value): value is string => Boolean(value));
    return authorizations.length ? authorizations.join(" ") : null;
  }

  protected _get_sid_authorization_header(origin = "https://www.youtube.com", userSessionId: string | null = null): string | null {
    return this.getSidAuthorizationHeader(origin, userSessionId);
  }

  protected hasAuthCookies(): boolean {
    const [sapisid, onePSapisid, threePSapisid] = this.getSidCookies();
    return Boolean(this.getYoutubeCookies().get("LOGIN_INFO") && (sapisid || onePSapisid || threePSapisid));
  }

  get isAuthenticated(): boolean {
    return this.hasAuthCookies();
  }

  protected _has_auth_cookies(): boolean {
    return this.hasAuthCookies();
  }

  static extractSessionIndex(...data: unknown[]): number | null {
    for (const ytcfg of data) {
      const value = nestedUnknown(ytcfg, ["SESSION_INDEX"]);
      const sessionIndex = intOrNone(value);
      if (sessionIndex !== null) {
        return sessionIndex;
      }
    }
    return null;
  }

  static _extract_session_index(...data: unknown[]): number | null {
    return this.extractSessionIndex(...data);
  }

  static parseDataSyncId(dataSyncId: unknown): [string | null, string | null] {
    if (typeof dataSyncId !== "string" || !dataSyncId) {
      return [null, null];
    }
    const [first = "", second = ""] = dataSyncId.split("||", 2);
    return second ? [first, second] : [null, first];
  }

  static _parse_data_sync_id(dataSyncId: unknown): [string | null, string | null] {
    return this.parseDataSyncId(dataSyncId);
  }

  protected extractDataSyncId(...args: unknown[]): string | null {
    const configured = this.youtubeConfigurationArg("data_sync_id", [])[0];
    if (configured) {
      return configured;
    }
    return firstStringDeep(args, ["DATASYNC_ID", ["responseContext", "mainAppWebResponseContext", "datasyncId"]]);
  }

  protected _extract_data_sync_id(...args: unknown[]): string | null {
    return this.extractDataSyncId(...args);
  }

  protected extractDelegatedSessionId(...args: unknown[]): string | null {
    return firstStringDeep(args, ["DELEGATED_SESSION_ID"]) ?? YoutubeBaseInfoExtractor.parseDataSyncId(this.extractDataSyncId(...args))[0];
  }

  protected _extract_delegated_session_id(...args: unknown[]): string | null {
    return this.extractDelegatedSessionId(...args);
  }

  protected extractUserSessionId(...args: unknown[]): string | null {
    return firstStringDeep(args, ["USER_SESSION_ID"]) ?? YoutubeBaseInfoExtractor.parseDataSyncId(this.extractDataSyncId(...args))[1];
  }

  protected _extract_user_session_id(...args: unknown[]): string | null {
    return this.extractUserSessionId(...args);
  }

  protected extractVisitorData(...args: unknown[]): string | null {
    const configured = this.youtubeConfigurationArg("visitor_data", [])[0];
    if (configured) {
      return configured;
    }
    return firstStringDeep(args, ["VISITOR_DATA", ["INNERTUBE_CONTEXT", "client", "visitorData"], ["responseContext", "visitorData"]]);
  }

  protected _extract_visitor_data(...args: unknown[]): string | null {
    return this.extractVisitorData(...args);
  }

  protected extractYtcfg(videoId: string, webpage: string | null | undefined): Record<string, unknown> {
    if (!webpage) {
      return {};
    }
    const match = /ytcfg\.set\s*\(\s*(\{[\s\S]+?\})\s*\)\s*;/.exec(webpage);
    if (!match?.[1]) {
      return {};
    }
    try {
      return JsonObjectSchema.parse(JSON.parse(match[1]));
    } catch {
      this.reportWarning("unable to parse ytcfg", videoId, true);
      return {};
    }
  }

  protected extract_ytcfg(videoId: string, webpage: string | null | undefined): Record<string, unknown> {
    return this.extractYtcfg(videoId, webpage);
  }

  protected generateCookieAuthHeaders(options: { ytcfg?: unknown; delegatedSessionId?: string | null; userSessionId?: string | null; sessionIndex?: number | null; origin?: string } = {}): Record<string, string> {
    const origin = options.origin ?? "https://www.youtube.com";
    const delegatedSessionId = options.delegatedSessionId ?? this.extractDelegatedSessionId(options.ytcfg);
    const sessionIndex = options.sessionIndex ?? YoutubeBaseInfoExtractor.extractSessionIndex(options.ytcfg);
    const headers: Record<string, string> = {};
    if (delegatedSessionId) {
      headers["X-Goog-PageId"] = delegatedSessionId;
    }
    if (delegatedSessionId || sessionIndex !== null) {
      headers["X-Goog-AuthUser"] = String(sessionIndex ?? 0);
    }
    const auth = this.getSidAuthorizationHeader(origin, options.userSessionId ?? this.extractUserSessionId(options.ytcfg));
    if (auth) {
      headers.Authorization = auth;
      headers["X-Origin"] = origin;
    }
    if (nestedUnknown(options.ytcfg, ["LOGGED_IN"]) === true) {
      headers["X-Youtube-Bootstrap-Logged-In"] = "true";
    }
    return headers;
  }

  protected _generate_cookie_auth_headers(options: { ytcfg?: unknown; delegated_session_id?: string | null; user_session_id?: string | null; session_index?: number | null; origin?: string } = {}): Record<string, string> {
    return this.generateCookieAuthHeaders({
      ytcfg: options.ytcfg,
      delegatedSessionId: options.delegated_session_id,
      userSessionId: options.user_session_id,
      sessionIndex: options.session_index,
      origin: options.origin,
    });
  }

  protected generateApiHeaders(options: { ytcfg?: unknown; delegatedSessionId?: string | null; userSessionId?: string | null; sessionIndex?: number | null; visitorData?: string | null; apiHostname?: string | null; defaultClient?: string } = {}): Record<string, string> {
    const defaultClient = options.defaultClient ?? "web";
    const origin = `https://${this.selectApiHostname(options.apiHostname, defaultClient)}`;
    return filterNullish({
      "X-YouTube-Client-Name": String(this.ytcfgGetSafe(options.ytcfg, (value) => value.INNERTUBE_CONTEXT_CLIENT_NAME as number | null, defaultClient)),
      "X-YouTube-Client-Version": this.extractClientVersion(options.ytcfg, defaultClient),
      Origin: origin,
      "X-Goog-Visitor-Id": options.visitorData ?? this.extractVisitorData(options.ytcfg),
      "User-Agent": this.ytcfgGetSafe(options.ytcfg, (value) => nestedString(value, ["INNERTUBE_CONTEXT", "client", "userAgent"]), defaultClient),
      ...this.generateCookieAuthHeaders({
        ytcfg: options.ytcfg,
        delegatedSessionId: options.delegatedSessionId,
        userSessionId: options.userSessionId,
        sessionIndex: options.sessionIndex,
        origin,
      }),
    });
  }

  protected generate_api_headers(options: { ytcfg?: unknown; delegated_session_id?: string | null; user_session_id?: string | null; session_index?: number | null; visitor_data?: string | null; api_hostname?: string | null; default_client?: string } = {}): Record<string, string> {
    return this.generateApiHeaders({
      ytcfg: options.ytcfg,
      delegatedSessionId: options.delegated_session_id,
      userSessionId: options.user_session_id,
      sessionIndex: options.session_index,
      visitorData: options.visitor_data,
      apiHostname: options.api_hostname,
      defaultClient: options.default_client,
    });
  }

  protected async callApi<T = unknown>(ep: string, query: Record<string, unknown>, videoId: string, options: { fatal?: boolean; headers?: Record<string, string>; note?: string; errnote?: string; context?: Record<string, unknown>; apiKey?: string | null; apiHostname?: string | null; defaultClient?: string } = {}): Promise<T | false | null> {
    const defaultClient = options.defaultClient ?? "web";
    const data = {
      context: options.context ?? this.extractContext(null, defaultClient),
      ...query,
    };
    const headers = {
      ...this.generateApiHeaders({ defaultClient }),
      "content-type": "application/json",
      ...options.headers,
    };
    const apiKey = this.youtubeConfigurationArg("innertube_key", [options.apiKey ?? null])[0];
    return await this.downloadJson<T>(
      `https://${this.selectApiHostname(options.apiHostname, defaultClient)}/youtubei/v1/${ep}`,
      videoId,
      {
        fatal: options.fatal ?? true,
        note: options.note ?? "Downloading API JSON",
        errnote: options.errnote ?? "Unable to download API page",
        data: JSON.stringify(data),
        headers,
        query: {
          key: apiKey,
          prettyPrint: "false",
        },
      },
    );
  }

  protected _call_api<T = unknown>(ep: string, query: Record<string, unknown>, videoId: string, fatal = true, headers?: Record<string, string>, note?: string, errnote?: string, context?: Record<string, unknown>, apiKey?: string | null, apiHostname?: string | null, defaultClient = "web"): Promise<T | false | null> {
    return this.callApi<T>(ep, query, videoId, { fatal, headers, note, errnote, context, apiKey, apiHostname, defaultClient });
  }

  static buildApiContinuationQuery(continuation: string, ctp: string | null = null): Record<string, unknown> {
    return ctp
      ? { continuation, clickTracking: { clickTrackingParams: ctp } }
      : { continuation };
  }

  static _build_api_continuation_query(continuation: string, ctp: string | null = null): Record<string, unknown> {
    return this.buildApiContinuationQuery(continuation, ctp);
  }

  static extractNextContinuationData(renderer: unknown): Record<string, unknown> | null {
    const nextContinuation = firstRecord([
      nestedUnknown(renderer, ["continuations", 0, "nextContinuationData"]),
      nestedUnknown(renderer, ["continuation", "reloadContinuationData"]),
    ]);
    if (!nextContinuation) {
      return null;
    }
    const continuation = typeof nextContinuation.continuation === "string" ? nextContinuation.continuation : null;
    if (!continuation) {
      return null;
    }
    const ctp = typeof nextContinuation.clickTrackingParams === "string" ? nextContinuation.clickTrackingParams : null;
    return this.buildApiContinuationQuery(continuation, ctp);
  }

  static _extract_next_continuation_data(renderer: unknown): Record<string, unknown> | null {
    return this.extractNextContinuationData(renderer);
  }

  static extractContinuationEpData(continuationEp: unknown): Record<string, unknown> | null {
    const commands = arrayOfRecords(nestedUnknown(continuationEp, ["commandExecutorCommand", "commands"]));
    const continuationCommands = [...commands, ...arrayOfRecords([continuationEp])];
    for (const command of continuationCommands) {
      const continuation = nestedString(command, ["continuationCommand", "token"]);
      if (!continuation) {
        continue;
      }
      const ctp = typeof command.clickTrackingParams === "string" ? command.clickTrackingParams : null;
      return this.buildApiContinuationQuery(continuation, ctp);
    }
    return null;
  }

  static _extract_continuation_ep_data(continuationEp: unknown): Record<string, unknown> | null {
    return this.extractContinuationEpData(continuationEp);
  }

  static extractContinuation(renderer: unknown): Record<string, unknown> | null {
    return this.extractNextContinuationData(renderer) ?? this.extractContinuationEpData(findContinuationEndpoint(renderer));
  }

  static _extract_continuation(renderer: unknown): Record<string, unknown> | null {
    return this.extractContinuation(renderer);
  }

  static extractAlerts(data: unknown): Array<[string, string]> {
    const alerts = arrayOfRecords(nestedUnknown(data, ["alerts"]));
    const out: Array<[string, string]> = [];
    for (const alertDict of alerts) {
      for (const alert of Object.values(alertDict)) {
        const record = RecordSchema.safeParse(alert);
        if (!record.success || typeof record.data.type !== "string") {
          continue;
        }
        const message = extractTextItem(record.data.text);
        if (message) {
          out.push([record.data.type, message]);
        }
      }
    }
    return out;
  }

  static _extract_alerts(data: unknown): Array<[string, string]> {
    return this.extractAlerts(data);
  }

  protected reportAlerts(alerts: Iterable<[string, string]>, options: { expected?: boolean; fatal?: boolean; onlyOnce?: boolean } = {}): void {
    const fatal = options.fatal ?? true;
    const errors: Array<[string, string]> = [];
    const warnings: Array<[string, string]> = [];
    for (const [alertType, alertMessage] of alerts) {
      if (alertType.toLowerCase() === "error" && fatal) {
        errors.push([alertType, alertMessage]);
      } else {
        warnings.push([alertType, alertMessage]);
      }
    }
    for (const [alertType, alertMessage] of [...warnings, ...errors.slice(0, -1)]) {
      this.reportWarning(`YouTube said: ${alertType} - ${alertMessage}`, null, options.onlyOnce ?? false);
    }
    const lastError = errors.at(-1);
    if (lastError) {
      throw new ExtractorError(`YouTube said: ${lastError[1]}`, { expected: options.expected ?? true });
    }
  }

  protected _report_alerts(alerts: Iterable<[string, string]>, expected = true, fatal = true, onlyOnce = false): void {
    this.reportAlerts(alerts, { expected, fatal, onlyOnce });
  }

  protected extractAndReportAlerts(data: unknown, options: { expected?: boolean; fatal?: boolean; onlyOnce?: boolean } = {}): void {
    this.reportAlerts(YoutubeBaseInfoExtractor.extractAlerts(data), options);
  }

  protected _extract_and_report_alerts(data: unknown, expected = true, fatal = true, onlyOnce = false): void {
    this.extractAndReportAlerts(data, { expected, fatal, onlyOnce });
  }

  static extractRelativeTime(relativeTimeText: string): Date | null {
    const match = /(?<start>today|yesterday|now)|(?<time>\d+)\s*(?<unit>sec(?:ond)?|s|min(?:ute)?|h(?:our|r)?|d(?:ay)?|w(?:eek|k)?|mo(?:nth)?|y(?:ear|r)?)s?\s*ago/i.exec(relativeTimeText);
    if (!match?.groups) {
      return null;
    }
    if (match.groups.start) {
      return relativeDate(match.groups.start);
    }
    const amount = Number(match.groups.time);
    const unit = match.groups.unit;
    if (!Number.isFinite(amount) || !unit) {
      return null;
    }
    const date = new Date();
    const lowered = unit.toLowerCase();
    const days = lowered.startsWith("w") ? amount * 7 : lowered.startsWith("mo") ? amount * 30 : lowered.startsWith("y") ? amount * 365 : lowered.startsWith("d") ? amount : 0;
    if (days) {
      date.setUTCDate(date.getUTCDate() - days);
    } else if (lowered.startsWith("h")) {
      date.setUTCHours(date.getUTCHours() - amount);
    } else if (lowered.startsWith("m")) {
      date.setUTCMinutes(date.getUTCMinutes() - amount);
    } else {
      date.setUTCSeconds(date.getUTCSeconds() - amount);
    }
    return date;
  }

  static extract_relative_time(relativeTimeText: string): Date | null {
    return this.extractRelativeTime(relativeTimeText);
  }

  protected parseTimeText(text: string | null | undefined, reportFailure = true): number | null {
    if (!text) {
      return null;
    }
    const relative = YoutubeBaseInfoExtractor.extractRelativeTime(text);
    const timestamp = relative ? Math.floor(relative.getTime() / 1000) : unifiedTimestamp(text);
    if (reportFailure && timestamp === null) {
      this.reportWarning(`Cannot parse localized time text "${text}"`, null, true);
    }
    return timestamp;
  }

  protected _parse_time_text(text: string | null | undefined, reportFailure = true): number | null {
    return this.parseTimeText(text, reportFailure);
  }

  protected ucidOrNone(ucid: unknown): string | null {
    if (typeof ucid !== "string") {
      return null;
    }
    const match = new RegExp(`^(${YoutubeBaseInfoExtractor._YT_CHANNEL_UCID_RE})$`).exec(ucid);
    return match?.[1] ?? null;
  }

  protected handleOrNone(handle: unknown): string | null {
    if (typeof handle !== "string") {
      return null;
    }
    const match = new RegExp(`^(${YoutubeBaseInfoExtractor._YT_HANDLE_RE})$`).exec(decodeURIComponent(handle));
    return match?.[1] ?? null;
  }

  protected handleFromUrl(url: unknown): string | null {
    if (typeof url !== "string") {
      return null;
    }
    const match = new RegExp(String.raw`^(?:https?://(?:www\.)?youtube\.com)?/(${YoutubeBaseInfoExtractor._YT_HANDLE_RE})`).exec(decodeURIComponent(url));
    return match?.[1] ?? null;
  }

  protected ucidFromUrl(url: unknown): string | null {
    if (typeof url !== "string") {
      return null;
    }
    const match = new RegExp(String.raw`^(?:https?://(?:www\.)?youtube\.com)?/channel/(${YoutubeBaseInfoExtractor._YT_CHANNEL_UCID_RE})`).exec(decodeURIComponent(url));
    return match?.[1] ?? null;
  }

  protected ucid_from_url(url: unknown): string | null {
    return this.ucidFromUrl(url);
  }

  static isMusicUrl(url: string): boolean {
    return /^(?:https?:\/\/)?music\.youtube\.com\//.test(url);
  }

  protected extractBadges(badgeList: unknown): YoutubeBadge[] {
    const iconTypeMap: Record<string, BadgeType> = {
      PRIVACY_UNLISTED: BadgeType.AVAILABILITY_UNLISTED,
      PRIVACY_PRIVATE: BadgeType.AVAILABILITY_PRIVATE,
      PRIVACY_PUBLIC: BadgeType.AVAILABILITY_PUBLIC,
      CHECK_CIRCLE_THICK: BadgeType.VERIFIED,
      OFFICIAL_ARTIST_BADGE: BadgeType.VERIFIED,
      CHECK: BadgeType.VERIFIED,
    };
    const badgeStyleMap: Record<string, BadgeType> = {
      BADGE_STYLE_TYPE_MEMBERS_ONLY: BadgeType.AVAILABILITY_SUBSCRIPTION,
      BADGE_STYLE_TYPE_PREMIUM: BadgeType.AVAILABILITY_PREMIUM,
      BADGE_STYLE_TYPE_LIVE_NOW: BadgeType.LIVE_NOW,
      BADGE_STYLE_TYPE_VERIFIED: BadgeType.VERIFIED,
      BADGE_STYLE_TYPE_VERIFIED_ARTIST: BadgeType.VERIFIED,
    };
    const labelMap: Array<[string, BadgeType]> = [
      ["unlisted", BadgeType.AVAILABILITY_UNLISTED],
      ["private", BadgeType.AVAILABILITY_PRIVATE],
      ["members only", BadgeType.AVAILABILITY_SUBSCRIPTION],
      ["live", BadgeType.LIVE_NOW],
      ["premium", BadgeType.AVAILABILITY_PREMIUM],
      ["verified", BadgeType.VERIFIED],
      ["official artist channel", BadgeType.VERIFIED],
    ];

    const badgeRenderers = collectBadgeRenderers(badgeList);
    const badges: YoutubeBadge[] = [];
    for (const badge of badgeRenderers) {
      const iconType = traverseObj<string>(badge, ["icon", "iconType"], { expected_type: isString, get_all: false });
      const style = traverseObj<string>(badge, "style", { expected_type: isString, get_all: false });
      const badgeType =
        (!Array.isArray(iconType) && iconType ? iconTypeMap[iconType] : undefined) ??
        (!Array.isArray(style) && style ? badgeStyleMap[style] : undefined);
      if (badgeType) {
        badges.push({ type: badgeType });
        continue;
      }

      const label = firstString(
        traverseObj<string>(badge, "label", ["accessibilityData", "label"], "tooltip", "iconTooltip", {
          expected_type: isString,
          get_all: false,
          default: "",
        }),
      ) ?? "";
      const lowerLabel = label.toLowerCase();
      const labelBadgeType = labelMap.find(([match]) => lowerLabel.includes(match))?.[1];
      if (labelBadgeType) {
        badges.push({ type: labelBadgeType });
      }
    }
    return badges;
  }

  protected hasBadge(badges: readonly YoutubeBadge[] | null | undefined, badgeType: BadgeType): boolean {
    return Boolean(badges?.some((badge) => badge.type === badgeType));
  }

  protected getText(data: unknown, ...pathList: TraversePath[]): string | null {
    const paths = pathList.length ? pathList : [null];
    for (const path of paths) {
      for (const item of valuesForTextPath(data, path)) {
        const text = extractTextItem(item);
        if (text) {
          return text;
        }
      }
    }
    return null;
  }

  protected getCount(data: unknown, ...pathList: TraversePath[]): number | null {
    const countText = this.getText(data, ...pathList) ?? "";
    return parseYoutubeCount(countText) ?? strToInt(countText.replace(/\s/g, ""));
  }

  protected extractThumbnails(data: unknown, ...pathList: TraversePath[]): YoutubeThumbnail[] {
    const paths = pathList.length ? pathList : [[]];
    const thumbnails: YoutubeThumbnail[] = [];
    for (const path of paths) {
      const pathArray = Array.isArray(path) ? path : [path];
      const values = traverseObj<unknown>(data, [...pathArray, "thumbnails", Ellipsis]);
      for (const value of Array.isArray(values) ? values : values ? [values] : []) {
        const thumbnail = ThumbnailSchema.safeParse(value);
        if (!thumbnail.success) {
          continue;
        }
        let thumbnailUrl = urlOrNone(thumbnail.data.url);
        if (!thumbnailUrl) {
          continue;
        }
        if (thumbnailUrl.includes("maxresdefault")) {
          thumbnailUrl = thumbnailUrl.split("?")[0]!;
        }
        thumbnails.push({
          url: thumbnailUrl,
          ...(intOrNone(thumbnail.data.height) == null ? {} : { height: intOrNone(thumbnail.data.height)! }),
          ...(intOrNone(thumbnail.data.width) == null ? {} : { width: intOrNone(thumbnail.data.width)! }),
        });
      }
    }
    return thumbnails;
  }

  protected _extract_badges(badgeList: unknown): YoutubeBadge[] {
    return this.extractBadges(badgeList);
  }

  protected _has_badge(badges: readonly YoutubeBadge[] | null | undefined, badgeType: BadgeType): boolean {
    return this.hasBadge(badges, badgeType);
  }

  protected _get_text(data: unknown, ...pathList: TraversePath[]): string | null {
    return this.getText(data, ...pathList);
  }

  protected _get_count(data: unknown, ...pathList: TraversePath[]): number | null {
    return this.getCount(data, ...pathList);
  }

  protected _extract_thumbnails(data: unknown, ...pathList: TraversePath[]): YoutubeThumbnail[] {
    return this.extractThumbnails(data, ...pathList);
  }
}

export const _PoTokenContext = PoTokenContext;

function collectBadgeRenderers(value: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) {
      for (const child of item) {
        visit(child);
      }
      return;
    }
    const record = RecordSchema.safeParse(item);
    if (!record.success) {
      return;
    }
    for (const [key, child] of Object.entries(record.data)) {
      if (/[bB]adgeRenderer$/.test(key)) {
        const renderer = RecordSchema.safeParse(child);
        if (renderer.success) {
          out.push(renderer.data);
        }
      } else {
        visit(child);
      }
    }
  };
  visit(value);
  return out;
}

function valuesForTextPath(data: unknown, path: TraversePath): unknown[] {
  if (path === null) {
    return [data];
  }
  const value = traverseObj<unknown>(data, path, { default: [] });
  const pathArray = Array.isArray(path) ? path : [path];
  const hasBranch = pathArray.some((key) => key === Ellipsis || Array.isArray(key));
  if (hasBranch) {
    return Array.isArray(value) ? value : value == null ? [] : [value];
  }
  return [value];
}

function extractTextItem(item: unknown): string | null {
  const record = RecordSchema.safeParse(item);
  if (record.success) {
    const simpleText = record.data.simpleText;
    if (typeof simpleText === "string" && simpleText) {
      return simpleText;
    }
    const runs = Array.isArray(record.data.runs) ? record.data.runs : [];
    const text = runs.map((run) => RecordSchema.safeParse(run).success ? RecordSchema.parse(run).text : null)
      .filter(isString)
      .join("");
    return text || null;
  }
  if (Array.isArray(item)) {
    const text = item.map((run) => RecordSchema.safeParse(run).success ? RecordSchema.parse(run).text : null)
      .filter(isString)
      .join("");
    return text || null;
  }
  return null;
}

function parseYoutubeCount(value: string): number | null {
  const match = /([\d,.]+)\s*([KMB])?/i.exec(value);
  if (!match) {
    return null;
  }
  const numeric = Number(match[1]!.replaceAll(",", ""));
  if (!Number.isFinite(numeric)) {
    return null;
  }
  const multiplier = { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[match[2]?.toLowerCase() ?? ""] ?? 1;
  return Math.trunc(numeric * multiplier);
}

function firstString(value: string | string[] | null): string | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function firstRecord(values: readonly unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    const parsed = RecordSchema.safeParse(value);
    if (parsed.success) {
      return parsed.data;
    }
  }
  return null;
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  const values = Array.isArray(value) ? value : [];
  return values.flatMap((item) => {
    const parsed = RecordSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

function nestedUnknown(value: unknown, path: readonly (string | number)[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (typeof key === "number") {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[key];
      continue;
    }
    const record = RecordSchema.safeParse(current);
    if (!record.success) {
      return undefined;
    }
    current = record.data[key];
  }
  return current;
}

function nestedString(value: unknown, path: readonly (string | number)[]): string | null {
  const result = nestedUnknown(value, path);
  return typeof result === "string" ? result : null;
}

function tryGetter<T>(record: Record<string, unknown>, getter: (value: Record<string, unknown>) => T | null | undefined): T | null {
  try {
    return getter(record) ?? null;
  } catch {
    return null;
  }
}

function firstStringDeep(value: unknown, paths: readonly (string | readonly (string | number)[])[]): string | null {
  const values = Array.isArray(value) ? value : [value];
  for (const item of values) {
    for (const path of paths) {
      const result = nestedString(item, typeof path === "string" ? [path] : path);
      if (result) {
        return result;
      }
    }
  }
  return null;
}

function filterNullish(record: Record<string, string | number | null | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (value !== null && value !== undefined) {
      out[key] = String(value);
    }
  }
  return out;
}

function findContinuationEndpoint(value: unknown): unknown {
  const visit = (item: unknown): unknown => {
    const record = RecordSchema.safeParse(item);
    if (!record.success) {
      if (Array.isArray(item)) {
        for (const child of item) {
          const found = visit(child);
          if (found) {
            return found;
          }
        }
      }
      return null;
    }
    const direct = nestedUnknown(record.data, ["continuationItemRenderer", "continuationEndpoint"])
      ?? nestedUnknown(record.data, ["continuationItemRenderer", "button", "buttonRenderer", "command"]);
    if (direct) {
      return direct;
    }
    for (const child of Object.values(record.data)) {
      const found = visit(child);
      if (found) {
        return found;
      }
    }
    return null;
  };
  return visit(value);
}

function relativeDate(value: string): Date {
  const now = new Date();
  if (value === "yesterday") {
    now.setUTCDate(now.getUTCDate() - 1);
  }
  return now;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
