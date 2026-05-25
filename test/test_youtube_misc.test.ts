// Source: test/test_youtube_misc.py and YouTube redirect/mistake extractor tests

import { describe, expect, test } from "bun:test";

import { ExtractorError } from "../yt_dlp/utils/index.ts";
import { BadgeType, YoutubeBaseInfoExtractor } from "../yt_dlp/extractor/youtube/base.ts";
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
import { YoutubeTabIE } from "../yt_dlp/extractor/youtube/tab.ts";
import { isYoutubeWatchUrl } from "../yt_dlp/extractor/youtube/video.ts";

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
});

describe("YouTube mistake extractors", () => {
  test("truncated URL reports quote guidance", async () => {
    await expect(new YoutubeTruncatedURLIE().extract("https://www.youtube.com/watch?feature=foo")).rejects.toThrow(ExtractorError);
  });

  test("truncated ID reports incomplete ID", async () => {
    await expect(new YoutubeTruncatedIDIE().extract("https://www.youtube.com/watch?v=N_708QY7Ob")).rejects.toThrow(/Incomplete YouTube ID/);
  });
});
