// Source: test/test_all_urls.py

import { describe, expect, test } from "bun:test";

import { ABCOTVSClipsIE, ABCOTVSIE } from "../yt_dlp/extractor/abcotvs.ts";
import {
  YoutubeConsentRedirectIE,
  YoutubeHistoryIE,
  YoutubeLivestreamEmbedIE,
  YoutubeRecommendedIE,
  YoutubeSubscriptionsIE,
  YoutubeYtBeIE,
} from "../yt_dlp/extractor/youtube/redirect.ts";
import {
  YoutubeTruncatedIDIE,
  YoutubeTruncatedURLIE,
} from "../yt_dlp/extractor/youtube/mistakes.ts";
import { YoutubeSearchURLIE } from "../yt_dlp/extractor/youtube/search.ts";
import {
  YoutubePlaylistIE,
  YoutubeTabIE,
} from "../yt_dlp/extractor/youtube/tab.ts";
import { YoutubeIE } from "../yt_dlp/extractor/youtube/video.ts";

describe("ported extractor URL matching", () => {
  test.each([
    [
      ABCOTVSIE,
      "http://abc7news.com/entertainment/east-bay-museum-celebrates-vintage-synthesizers/472581/",
    ],
    [ABCOTVSClipsIE, "https://clips.abcotvs.com/kabc/video/214814"],
    [YoutubePlaylistIE, "ECUl4u3cNGP61MdtwGTqZA0MreSaDybji8"],
    [YoutubePlaylistIE, "UUBABnxM4Ar9ten8Mdjj1j0Q"],
    [YoutubePlaylistIE, "PL63F0C78739B09958"],
    [YoutubeTabIE, "https://www.youtube.com/AsapSCIENCE"],
    [YoutubeTabIE, "https://www.youtube.com/embedded"],
    [
      YoutubeTabIE,
      "https://www.youtube.com/playlist?list=PLwP_SiAcdui0KVebT0mU9Apz359a4ubsC",
    ],
    [
      YoutubeTabIE,
      "https://www.youtube.com/watch?v=AV6J6_AeFEQ&playnext=1&list=PL4023E734DA416012",
    ],
    [YoutubeTabIE, "https://www.youtube.com/playlist?list=MCUS.20142101"],
    [YoutubeTabIE, "https://www.youtube.com/channel/HCtnHdj3df7iM"],
    [
      YoutubeTabIE,
      "https://www.youtube.com/channel/HCtnHdj3df7iM?feature=gb_ch_rec",
    ],
    [YoutubeTabIE, "https://www.youtube.com/channel/HCtnHdj3df7iM/videos"],
    [YoutubeTabIE, "http://www.youtube.com/NASAgovVideo/videos"],
    [YoutubeTabIE, "https://www.youtube.com/feed/library"],
    [YoutubeTabIE, "https://www.youtube.com/feed/history"],
    [YoutubeTabIE, "https://www.youtube.com/feed/watch_later"],
    [YoutubeTabIE, "https://www.youtube.com/feed/subscriptions"],
    [YoutubeIE, "http://youtu.be/BaW_jenozKc"],
    [YoutubeIE, "https://youtube.googleapis.com/v/BaW_jenozKc"],
    [
      YoutubeIE,
      "http://www.cleanvideosearch.com/media/action/yt/watch?videoId=8v_4O44sfjM",
    ],
    [
      YoutubeSearchURLIE,
      "http://www.youtube.com/results?search_query=making+mustard",
    ],
    [
      YoutubeSearchURLIE,
      "https://www.youtube.com/results?baz=bar&search_query=youtube-dl+test+video&filters=video&lclk=video",
    ],
    [YoutubeRecommendedIE, "https://www.youtube.com/"],
    [YoutubeSubscriptionsIE, ":ytsubs"],
    [YoutubeSubscriptionsIE, ":ytsubscriptions"],
    [YoutubeHistoryIE, ":ythistory"],
    [
      YoutubeYtBeIE,
      "https://youtu.be/yeWKywCrFtk?list=PL2qgrgXsNUG5ig9cat4ohreBjYLAPC0J5",
    ],
    [
      YoutubeLivestreamEmbedIE,
      "https://www.youtube.com/embed/live_stream?channel=UC2_KI6RB__jGdlnK6dvFEZA",
    ],
    [
      YoutubeConsentRedirectIE,
      "https://consent.youtube.com/m?continue=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DBaW_jenozKc",
    ],
    [YoutubeTruncatedURLIE, "https://www.youtube.com/watch?feature=foo"],
    [YoutubeTruncatedIDIE, "https://www.youtube.com/watch?v=N_708QY7Ob"],
  ] as const)("matches %s", (Extractor, url) => {
    expect(Extractor.suitable(url)).toBe(true);
  });

  test("YouTube URL matching follows yt-dlp precedence", () => {
    expect(YoutubeIE.suitable("PLtS2H6bU1M")).toBe(true);
    expect(
      YoutubeIE.suitable(
        "https://www.youtube.com/watch?v=AV6J6_AeFEQ&playnext=1&list=PL4023E734DA416012",
      ),
    ).toBe(false);
    expect(YoutubePlaylistIE.suitable("PLtS2H6bU1M")).toBe(false);
    expect(
      YoutubePlaylistIE.suitable(
        "https://www.youtube.com/playlist?list=PLwP_SiAcdui0KVebT0mU9Apz359a4ubsC",
      ),
    ).toBe(false);
  });
});

describe("Python test_all_urls.py parity TODOs", () => {
  test.todo("test_facebook_matching once FacebookIE is ported", () =>
    undefined);
  test.todo("test_no_duplicates once the full extractor registry imports cleanly", () =>
    undefined);
  test.todo("test_vimeo_matching once Vimeo extractors are ported", () =>
    undefined);
  test.todo("test_soundcloud_not_matching_sets once SoundCloud extractors are ported", () =>
    undefined);
  test.todo("test_tumblr once Tumblr extractor is ported", () => undefined);
  test.todo("test_pbs once PBS extractor is ported", () => undefined);
});
