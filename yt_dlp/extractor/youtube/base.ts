// Source: yt_dlp/extractor/youtube/_base.py
// Port note: shared YouTube constants and base extraction helpers are being migrated incrementally.

import { z } from "zod";

import { NotImplementedError } from "../../errors.ts";
import { InfoExtractor, type ExtractorInfo } from "../common.ts";

const JsonObjectSchema = z.record(z.string(), z.unknown());

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
  static readonly _PLAYLIST_ID_RE = String.raw`(?:PL|LL|EC|UU|FL|RD|UL|TL|PU|OLAK5uy_|UUMO|UUSH|UULF|UULP|UULV|UUMF|UUMV|UUMS|UUMO)[0-9A-Za-z_-]+`;
  static readonly _VIDEO_ID_RE = String.raw`[0-9A-Za-z_-]{11}`;

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
}

export const _PoTokenContext = PoTokenContext;
