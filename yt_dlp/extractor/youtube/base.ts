// Source: yt_dlp/extractor/youtube/_base.py
// Port note: shared YouTube constants and base extraction helpers are being migrated incrementally.

import { z } from "zod";

import { NotImplementedError } from "../../errors.ts";
import { intOrNone, strToInt, urlOrNone } from "../../utils/index.ts";
import { Ellipsis, traverseObj, type TraversePath } from "../../utils/traversal.ts";
import { InfoExtractor, type ExtractorInfo } from "../common.ts";

const JsonObjectSchema = z.record(z.string(), z.unknown());
const RecordSchema = z.record(z.string(), z.unknown());
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
}

export const INNERTUBE_CLIENTS = {
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
    REQUIRE_JS_PLAYER: false,
  },
} satisfies Record<string, InnertubeClient>;

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

  protected generateApiHeaders(options: { delegatedSessionId?: string | null; userSessionId?: string | null } = {}): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-YouTube-Client-Name": String(INNERTUBE_CLIENTS.web.INNERTUBE_CONTEXT_CLIENT_NAME),
      "X-YouTube-Client-Version": String(INNERTUBE_CLIENTS.web.INNERTUBE_CONTEXT.client.clientVersion),
      Origin: "https://www.youtube.com",
    };
    if (options.delegatedSessionId) {
      headers["X-Goog-PageId"] = options.delegatedSessionId;
    }
    if (options.userSessionId) {
      headers["X-Goog-AuthUser"] = options.userSessionId;
    }
    return headers;
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

function isString(value: unknown): value is string {
  return typeof value === "string";
}
