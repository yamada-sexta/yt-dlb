// Source: yt_dlp/extractor/youtube/_redirect.py

import {
  ExtractorError,
  parseQs,
  updateUrlQuery,
  urlOrNone,
} from "../../utils/index.ts";
import type { ExtractorInfo } from "../common.ts";
import { YoutubeBaseInfoExtractor } from "./base.ts";
import { YoutubeTabIE } from "./tab.ts";

export class YoutubeYtBeIE extends YoutubeBaseInfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://youtu\.be/(?<id>[0-9A-Za-z_-]{11})/*?.*?\blist=(?<playlist_id>${YoutubeBaseInfoExtractor._PLAYLIST_ID_RE})`;

  static readonly IE_DESC = "youtu.be";

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const videoId = match?.groups?.id;
    const playlistId = match?.groups?.playlist_id;
    if (!videoId || !playlistId) {
      throw new Error("Unable to extract youtu.be redirect fields");
    }
    return this.urlResult(
      updateUrlQuery("https://www.youtube.com/watch", {
        v: videoId,
        list: playlistId,
        feature: "youtu.be",
      }),
      YoutubeTabIE,
      playlistId,
    );
  }
}

export class YoutubeLivestreamEmbedIE extends YoutubeBaseInfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:\w+\.)?youtube\.com/embed/live_stream/?\?(?:[^#]+&)?channel=(?<id>[^&#]+)`;

  static readonly IE_DESC = "YouTube livestream embeds";

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const channelId = this.matchId(url);
    return this.urlResult(
      `https://www.youtube.com/channel/${channelId}/live`,
      YoutubeTabIE,
      channelId,
    );
  }
}

export class YoutubeYtUserIE extends YoutubeBaseInfoExtractor {
  static override readonly _VALID_URL = String.raw`ytuser:(?<id>.+)`;

  static override get IE_NAME(): string {
    return "youtube:user";
  }

  static readonly IE_DESC = 'YouTube user videos; "ytuser:" prefix';

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const userId = this.matchId(url);
    return this.urlResult(
      `https://www.youtube.com/user/${userId}`,
      YoutubeTabIE,
      userId,
    );
  }
}

export class YoutubeFavouritesIE extends YoutubeBaseInfoExtractor {
  static override readonly _VALID_URL = String.raw`:ytfav(?:ou?rite)?s?`;
  static readonly _LOGIN_REQUIRED = true;

  static override get IE_NAME(): string {
    return "youtube:favorites";
  }

  static readonly IE_DESC =
    'YouTube liked videos; ":ytfav" keyword (requires cookies)';

  protected override async realExtract(_url: string): Promise<ExtractorInfo> {
    return this.urlResult(
      "https://www.youtube.com/playlist?list=LL",
      YoutubeTabIE,
    );
  }
}

export class YoutubeFeedsInfoExtractor extends YoutubeBaseInfoExtractor {
  static readonly _LOGIN_REQUIRED: boolean = true;
  static readonly _FEED_NAME: string = "feeds";

  static override get IE_NAME(): string {
    return `youtube:${YoutubeFeedsInfoExtractor._FEED_NAME}`;
  }

  protected override async realExtract(_url: string): Promise<ExtractorInfo> {
    return this.urlResult(
      `https://www.youtube.com/feed/${(this.constructor as typeof YoutubeFeedsInfoExtractor)._FEED_NAME}`,
      YoutubeTabIE,
    );
  }
}

export class YoutubeWatchLaterIE extends YoutubeBaseInfoExtractor {
  static override readonly _VALID_URL = String.raw`:ytwatchlater`;

  static override get IE_NAME(): string {
    return "youtube:watchlater";
  }

  static readonly IE_DESC =
    'Youtube watch later list; ":ytwatchlater" keyword (requires cookies)';

  protected override async realExtract(_url: string): Promise<ExtractorInfo> {
    return this.urlResult(
      "https://www.youtube.com/playlist?list=WL",
      YoutubeTabIE,
    );
  }
}

export class YoutubeRecommendedIE extends YoutubeFeedsInfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?youtube\.com/?(?:[?#]|$)|:ytrec(?:ommended)?`;
  static override readonly _FEED_NAME = "recommended";
  static override readonly _LOGIN_REQUIRED = false;
  static readonly IE_DESC = 'YouTube recommended videos; ":ytrec" keyword';
}

export class YoutubeSubscriptionsIE extends YoutubeFeedsInfoExtractor {
  static override readonly _VALID_URL = String.raw`:ytsub(?:scription)?s?`;
  static override readonly _FEED_NAME = "subscriptions";
  static readonly IE_DESC =
    'YouTube subscriptions feed; ":ytsubs" keyword (requires cookies)';
}

export class YoutubeHistoryIE extends YoutubeFeedsInfoExtractor {
  static override readonly _VALID_URL = String.raw`:ythis(?:tory)?`;
  static override readonly _FEED_NAME = "history";
  static readonly IE_DESC =
    'Youtube watch history; ":ythis" keyword (requires cookies)';
}

export class YoutubeShortsAudioPivotIE extends YoutubeBaseInfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?youtube\.com/source/(?<id>[\w-]{11})/shorts`;

  static override get IE_NAME(): string {
    return "youtube:shorts:pivot:audio";
  }

  static readonly IE_DESC =
    "YouTube Shorts audio pivot (Shorts using audio of a given video)";

  static generateAudioPivotParams(videoId: string): string {
    const bytes = Buffer.concat([
      Buffer.from([0xf2, 0x05, 0x2b, 0x0a, 0x29, 0x12, 0x27, 0x0a, 0x0b]),
      Buffer.from(videoId),
      Buffer.from([0x12, 0x0b]),
      Buffer.from(videoId),
      Buffer.from([0x1a, 0x0b]),
      Buffer.from(videoId),
    ]);
    return encodeURIComponent(bytes.toString("base64"));
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    return this.urlResult(
      `https://www.youtube.com/feed/sfv_audio_pivot?bp=${YoutubeShortsAudioPivotIE.generateAudioPivotParams(videoId)}`,
      YoutubeTabIE,
    );
  }
}

export class YoutubeConsentRedirectIE extends YoutubeBaseInfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://consent\.youtube\.com/m\?`;

  static override get IE_NAME(): string {
    return "youtube:consent";
  }

  static readonly IE_DESC = false;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const redirectUrl = urlOrNone(parseQs(url).continue?.at(-1));
    if (!redirectUrl) {
      throw new ExtractorError("Invalid cookie consent redirect URL", {
        expected: true,
      });
    }
    return this.urlResult(redirectUrl);
  }
}
