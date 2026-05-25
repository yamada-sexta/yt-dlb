// Source: test/test_youtube_misc.py and YouTube redirect/mistake extractor tests

import { describe, expect, test } from "bun:test";

import { ExtractorError } from "../yt_dlp/utils/index.ts";
import { BadgeType, getInnertubeClient, INNERTUBE_CLIENTS, shortClientName, YoutubeBaseInfoExtractor } from "../yt_dlp/extractor/youtube/base.ts";
import { YoutubeClipIE } from "../yt_dlp/extractor/youtube/clip.ts";
import { YoutubeTruncatedIDIE, YoutubeTruncatedURLIE } from "../yt_dlp/extractor/youtube/mistakes.ts";
import { YoutubeNotificationsIE } from "../yt_dlp/extractor/youtube/notifications.ts";
import {
  YoutubeConsentRedirectIE,
  YoutubeFavouritesIE,
  YoutubeLivestreamEmbedIE,
  YoutubeRecommendedIE,
  YoutubeShortsAudioPivotIE,
  YoutubeSubscriptionsIE,
  YoutubeWatchLaterIE,
  YoutubeYtBeIE,
  YoutubeYtUserIE,
} from "../yt_dlp/extractor/youtube/redirect.ts";
import { YoutubeTabBaseInfoExtractor, YoutubeTabIE } from "../yt_dlp/extractor/youtube/tab.ts";
import { isYoutubeWatchUrl, YoutubeIE } from "../yt_dlp/extractor/youtube/video.ts";

class TestYoutubeBaseIE extends YoutubeBaseInfoExtractor {
  getTextForTest(data: unknown, ...paths: Parameters<YoutubeBaseInfoExtractor["_get_text"]> extends [unknown, ...infer Rest] ? Rest : never): string | null {
    return this._get_text(data, ...paths);
  }

  getCountForTest(data: unknown, ...paths: Parameters<YoutubeBaseInfoExtractor["_get_count"]> extends [unknown, ...infer Rest] ? Rest : never): number | null {
    return this._get_count(data, ...paths);
  }

  extractThumbnailsForTest(data: unknown, ...paths: Parameters<YoutubeBaseInfoExtractor["_extract_thumbnails"]> extends [unknown, ...infer Rest] ? Rest : never) {
    return this._extract_thumbnails(data, ...paths);
  }

  extractBadgesForTest(data: unknown) {
    return this._extract_badges(data);
  }

  extractContextForTest(ytcfg?: unknown, defaultClient?: string) {
    return this._extract_context(ytcfg, defaultClient);
  }

  generateApiHeadersForTest(options: Parameters<YoutubeBaseInfoExtractor["generate_api_headers"]>[0]) {
    return this.generate_api_headers(options);
  }

  extractYtcfgForTest(videoId: string, webpage: string) {
    return this.extract_ytcfg(videoId, webpage);
  }

  extractDataSyncIdForTest(...args: unknown[]) {
    return this._extract_data_sync_id(...args);
  }
}

class TestYoutubeNotificationsIE extends YoutubeNotificationsIE {
  extractNotificationRendererForTest(notification: unknown) {
    return this._extract_notification_renderer(notification);
  }
}

class TestYoutubeTabIE extends YoutubeTabBaseInfoExtractor {
  extractVideoForTest(renderer: Record<string, unknown>) {
    return this._extract_video(renderer);
  }

  extractChannelForTest(renderer: Record<string, unknown>) {
    return this._extract_channel_renderer(renderer);
  }

  gridEntriesForTest(renderer: unknown) {
    return [...this._grid_entries(renderer)];
  }
}

describe("YouTube URL helpers", () => {
  test.each([
    "http://www.youtube.com/watch?&v=BaW_jenozKc",
    "https://www.youtube.com/watch?&v=BaW_jenozKc",
    "https://www.youtube.com/watch?feature=player_embedded&v=BaW_jenozKc",
    "https://m.youtube.com/watch?v=BaW_jenozKc",
    "https://music.youtube.com/watch?v=BaW_jenozKc",
  ])("recognizes watch URL %s", (url) => {
    expect(isYoutubeWatchUrl(url)).toBe(true);
  });

  test("rejects non-watch URLs", () => {
    expect(isYoutubeWatchUrl("https://www.youtube.com/playlist?list=LL")).toBe(false);
    expect(isYoutubeWatchUrl("BaW_jenozKc")).toBe(false);
  });
});

describe("YouTube base renderer helpers", () => {
  const ie = new TestYoutubeBaseIE();

  test("Innertube client table matches core Python clients", () => {
    expect(Object.keys(INNERTUBE_CLIENTS).sort()).toEqual([
      "android",
      "android_vr",
      "ios",
      "mweb",
      "tv",
      "tv_downgraded",
      "tv_simply",
      "web",
      "web_creator",
      "web_embedded",
      "web_music",
      "web_safari",
    ]);
    expect(getInnertubeClient("web").INNERTUBE_HOST).toBe("www.youtube.com");
    expect(getInnertubeClient("web_music").INNERTUBE_HOST).toBe("music.youtube.com");
    expect(getInnertubeClient("android").GVS_PO_TOKEN_POLICY?.https?.not_required_with_player_token).toBe(true);
    expect(shortClientName("web_safari")).toBe("WEBS");
    expect(shortClientName("tv_downgraded")).toBe("TVD");
  });

  test("builds API context and headers from ytcfg/default client", () => {
    expect(ie.extractContextForTest({ INNERTUBE_CONTEXT: { client: { clientName: "WEB", clientVersion: "1" } } })).toMatchObject({
      client: {
        clientName: "WEB",
        clientVersion: "1",
        hl: "en",
        timeZone: "UTC",
        utcOffsetMinutes: 0,
      },
    });
    expect(ie.generateApiHeadersForTest({
      ytcfg: {
        INNERTUBE_CONTEXT_CLIENT_NAME: 67,
        INNERTUBE_CONTEXT: { client: { clientVersion: "1.2.3", userAgent: "UA" } },
        VISITOR_DATA: "visitor",
      },
      default_client: "web_music",
    })).toMatchObject({
      "X-YouTube-Client-Name": "67",
      "X-YouTube-Client-Version": "1.2.3",
      "X-Goog-Visitor-Id": "visitor",
      "User-Agent": "UA",
      Origin: "https://music.youtube.com",
    });
  });

  test("extracts ytcfg and session identifiers", () => {
    expect(ie.extractYtcfgForTest("id", '<script>ytcfg.set({"SESSION_INDEX":"2","DATASYNC_ID":"delegated||user"});</script>')).toEqual({
      SESSION_INDEX: "2",
      DATASYNC_ID: "delegated||user",
    });
    expect(TestYoutubeBaseIE._parse_data_sync_id("delegated||user")).toEqual(["delegated", "user"]);
    expect(TestYoutubeBaseIE._parse_data_sync_id("primary||")).toEqual([null, "primary"]);
    expect(ie.extractDataSyncIdForTest({ responseContext: { mainAppWebResponseContext: { datasyncId: "a||b" } } })).toBe("a||b");
  });

  test("extracts continuation queries and alerts", () => {
    expect(TestYoutubeBaseIE._extract_next_continuation_data({
      continuations: [{ nextContinuationData: { continuation: "token", clickTrackingParams: "ctp" } }],
    })).toEqual({ continuation: "token", clickTracking: { clickTrackingParams: "ctp" } });
    expect(TestYoutubeBaseIE._extract_continuation({
      contents: [{
        continuationItemRenderer: {
          continuationEndpoint: { continuationCommand: { token: "next" } },
        },
      }],
    })).toEqual({ continuation: "next" });
    expect(TestYoutubeBaseIE._extract_alerts({
      alerts: [{ alertRenderer: { type: "ERROR", text: { simpleText: "Nope" } } }],
    })).toEqual([["ERROR", "Nope"]]);
  });

  test("extracts text from simpleText and runs", () => {
    expect(ie.getTextForTest({ simpleText: "Plain" })).toBe("Plain");
    expect(ie.getTextForTest({ runs: [{ text: "A" }, { text: "B" }] })).toBe("AB");
    expect(ie.getTextForTest({ title: { runs: [{ text: "Nested" }] } }, "title")).toBe("Nested");
  });

  test("extracts counts from YouTube text", () => {
    expect(ie.getCountForTest({ simpleText: "50K views" })).toBe(50_000);
    expect(ie.getCountForTest({ simpleText: "1,234 subscribers" })).toBe(1234);
  });

  test("extracts thumbnails and strips maxres query", () => {
    expect(ie.extractThumbnailsForTest({
      thumbnail: {
        thumbnails: [
          { url: "https://i.ytimg.com/vi/x/maxresdefault.jpg?foo=1", width: 1280, height: 720 },
        ],
      },
    }, "thumbnail")).toEqual([{ url: "https://i.ytimg.com/vi/x/maxresdefault.jpg", height: 720, width: 1280 }]);
  });

  test("extracts known badges", () => {
    expect(ie.extractBadgesForTest([
      { metadataBadgeRenderer: { icon: { iconType: "CHECK" } } },
      { metadataBadgeRenderer: { style: "BADGE_STYLE_TYPE_LIVE_NOW" } },
      { metadataBadgeRenderer: { label: "Members only" } },
    ])).toEqual([
      { type: BadgeType.VERIFIED },
      { type: BadgeType.LIVE_NOW },
      { type: BadgeType.AVAILABILITY_SUBSCRIPTION },
    ]);
  });
});

describe("YouTube tab renderer helpers", () => {
  const ie = new TestYoutubeTabIE();

  test("extracts video renderer entries", () => {
    const result = ie.extractVideoForTest({
      videoId: "BaW_jenozKc",
      title: { runs: [{ text: "Test video" }] },
      lengthSeconds: "10",
      ownerText: { runs: [{ text: "yt-dlp" }] },
      shortBylineText: {
        runs: [{
          text: "yt-dlp",
          navigationEndpoint: { browseEndpoint: { browseId: "UC2_KI6RB__jGdlnK6dvFEZA", canonicalBaseUrl: "/@ytdlp" } },
        }],
      },
      viewCountText: { simpleText: "1,234 views" },
      thumbnail: { thumbnails: [{ url: "https://i.ytimg.com/vi/BaW_jenozKc/default.jpg" }] },
      ownerBadges: [{ metadataBadgeRenderer: { icon: { iconType: "CHECK" } } }],
    });
    expect(result).toMatchObject({
      _type: "url",
      url: "https://www.youtube.com/watch?v=BaW_jenozKc",
      ie_key: YoutubeIE.ieKey(),
      id: "BaW_jenozKc",
      title: "Test video",
      duration: 10,
      channel_id: "UC2_KI6RB__jGdlnK6dvFEZA",
      channel: "yt-dlp",
      uploader_id: "@ytdlp",
      view_count: 1234,
      channel_is_verified: true,
    });
  });

  test("extracts channel renderer entries", () => {
    const result = ie.extractChannelForTest({
      channelId: "UC2_KI6RB__jGdlnK6dvFEZA",
      title: { simpleText: "yt-dlp" },
      subscriberCountText: { simpleText: "50K subscribers" },
      navigationEndpoint: { browseEndpoint: { canonicalBaseUrl: "/@ytdlp" } },
    });
    expect(result).toMatchObject({
      _type: "url",
      url: "https://www.youtube.com/channel/UC2_KI6RB__jGdlnK6dvFEZA",
      ie_key: YoutubeTabIE.ieKey(),
      id: "UC2_KI6RB__jGdlnK6dvFEZA",
      title: "yt-dlp",
      channel_follower_count: 50_000,
      uploader_id: "@ytdlp",
    });
  });

  test("grid entries dispatch playlists, videos, and channels", () => {
    const entries = ie.gridEntriesForTest({
      items: [
        { gridPlaylistRenderer: { playlistId: "PL63F0C78739B09958", title: { simpleText: "Playlist" } } },
        { gridVideoRenderer: { videoId: "BaW_jenozKc", title: { simpleText: "Video" } } },
        { gridChannelRenderer: { channelId: "UC2_KI6RB__jGdlnK6dvFEZA", title: { simpleText: "Channel" } } },
      ],
    });
    expect(entries.map((entry) => entry.url)).toEqual([
      "https://www.youtube.com/playlist?list=PL63F0C78739B09958",
      "https://www.youtube.com/watch?v=BaW_jenozKc",
      "https://www.youtube.com/channel/UC2_KI6RB__jGdlnK6dvFEZA",
    ]);
  });
});

describe("YouTube redirect extractors", () => {
  test("YoutubeYtBeIE returns a YoutubeTab watch URL with playlist", async () => {
    const result = await new YoutubeYtBeIE().extract("https://youtu.be/yeWKywCrFtk?list=PL2qgrgXsNUG5ig9cat4ohreBjYLAPC0J5");
    expect(result).toMatchObject({
      _type: "url",
      id: "PL2qgrgXsNUG5ig9cat4ohreBjYLAPC0J5",
      ie_key: YoutubeTabIE.ieKey(),
    });
    expect(result?.url).toBe("https://www.youtube.com/watch?v=yeWKywCrFtk&list=PL2qgrgXsNUG5ig9cat4ohreBjYLAPC0J5&feature=youtu.be");
  });

  test("livestream embed redirects to channel live tab", async () => {
    const result = await new YoutubeLivestreamEmbedIE().extract("https://www.youtube.com/embed/live_stream?channel=UC2_KI6RB__jGdlnK6dvFEZA");
    expect(result).toMatchObject({
      _type: "url",
      id: "UC2_KI6RB__jGdlnK6dvFEZA",
      ie_key: YoutubeTabIE.ieKey(),
      url: "https://www.youtube.com/channel/UC2_KI6RB__jGdlnK6dvFEZA/live",
    });
  });

  test("ytuser redirects to user tab", async () => {
    const result = await new YoutubeYtUserIE().extract("ytuser:phihag");
    expect(result).toMatchObject({
      _type: "url",
      id: "phihag",
      ie_key: YoutubeTabIE.ieKey(),
      url: "https://www.youtube.com/user/phihag",
    });
  });

  test.each([
    [new YoutubeFavouritesIE(), ":ytfav", "https://www.youtube.com/playlist?list=LL"],
    [new YoutubeWatchLaterIE(), ":ytwatchlater", "https://www.youtube.com/playlist?list=WL"],
    [new YoutubeRecommendedIE(), ":ytrec", "https://www.youtube.com/feed/recommended"],
    [new YoutubeSubscriptionsIE(), ":ytsubs", "https://www.youtube.com/feed/subscriptions"],
  ])("keyword redirect %#", async (extractor, url, expectedUrl) => {
    const result = await extractor.extract(url);
    expect(result).toMatchObject({
      _type: "url",
      ie_key: YoutubeTabIE.ieKey(),
      url: expectedUrl,
    });
  });

  test("shorts audio pivot builds sfv URL", async () => {
    const result = await new YoutubeShortsAudioPivotIE().extract("https://www.youtube.com/source/Lyj-MZSAA9o/shorts");
    expect(result?.url).toStartWith("https://www.youtube.com/feed/sfv_audio_pivot?bp=");
    expect(result?.ie_key).toBe(YoutubeTabIE.ieKey());
  });

  test("consent redirect extracts continue URL", async () => {
    const result = await new YoutubeConsentRedirectIE().extract("https://consent.youtube.com/m?continue=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DBaW_jenozKc&gl=NL");
    expect(result).toMatchObject({
      _type: "url",
      url: "https://www.youtube.com/watch?v=BaW_jenozKc",
    });
  });
});

describe("YouTube clip and notifications extractors", () => {
  test("clip URL matching", () => {
    expect(YoutubeClipIE.suitable("https://www.youtube.com/clip/UgytZKpehg-hEMBSn3F4AaABCQ")).toBe(true);
  });

  test.each([":ytnotif", ":ytnotifications"])("notifications keyword matching %s", (url) => {
    expect(YoutubeNotificationsIE.suitable(url)).toBe(true);
  });

  test("notification renderer extracts video entry", () => {
    const result = new TestYoutubeNotificationsIE().extractNotificationRendererForTest({
      navigationEndpoint: { watchEndpoint: { videoId: "BaW_jenozKc" } },
      contextualMenu: { menuRenderer: { items: [null, { menuServiceItemRenderer: { text: { runs: [{ text: "unused" }, { text: "yt-dlp" }] } } }] } },
      shortMessage: { simpleText: "yt-dlp uploaded: Test video" },
      videoThumbnail: { thumbnails: [{ url: "https://i.ytimg.com/vi/BaW_jenozKc/default.jpg", width: 120, height: 90 }] },
    });
    expect(result).toMatchObject({
      _type: "url",
      url: "https://www.youtube.com/watch?v=BaW_jenozKc",
      ie_key: YoutubeIE.ieKey(),
      video_id: "BaW_jenozKc",
      title: "Test video",
      channel: "yt-dlp",
      thumbnails: [{ url: "https://i.ytimg.com/vi/BaW_jenozKc/default.jpg", width: 120, height: 90 }],
    });
  });

  test("notification renderer extracts community post entry", () => {
    const result = new TestYoutubeNotificationsIE().extractNotificationRendererForTest({
      navigationEndpoint: { browseEndpoint: { browseId: "UC2_KI6RB__jGdlnK6dvFEZA", canonicalBaseUrl: "/post/Ugkx123" } },
      contextualMenu: { menuRenderer: { items: [null, { menuServiceItemRenderer: { text: { runs: [{ text: "unused" }, { text: "Channel" }] } } }] } },
      shortMessage: { simpleText: "Channel posted: Community update" },
    });
    expect(result).toMatchObject({
      _type: "url",
      url: "https://www.youtube.com/channel/UC2_KI6RB__jGdlnK6dvFEZA/community?lb=Ugkx123",
      ie_key: YoutubeTabIE.ieKey(),
      channel_id: "UC2_KI6RB__jGdlnK6dvFEZA",
      channel: "Channel",
    });
  });
});

describe("YouTube mistake extractors", () => {
  test("truncated URL reports quote guidance", async () => {
    await expect(new YoutubeTruncatedURLIE().extract("https://www.youtube.com/watch?feature=foo")).rejects.toThrow(ExtractorError);
  });

  test("truncated ID reports incomplete ID", async () => {
    await expect(new YoutubeTruncatedIDIE().extract("https://www.youtube.com/watch?v=N_708QY7Ob")).rejects.toThrow(/Incomplete YouTube ID/);
  });
});
