// Source: test/test_all_urls.py

import { describe, expect, test } from "bun:test";

import { genExtractorClasses } from "../yt_dlp/extractor/index.ts";
import { ABCOTVSClipsIE, ABCOTVSIE } from "../yt_dlp/extractor/abcotvs.ts";
import {
  YoutubeConsentRedirectIE,
  YoutubeHistoryIE,
  YoutubeLivestreamEmbedIE,
  YoutubeSubscriptionsIE,
  YoutubeYtBeIE,
} from "../yt_dlp/extractor/youtube/redirect.ts";
import { YoutubeTruncatedIDIE, YoutubeTruncatedURLIE } from "../yt_dlp/extractor/youtube/mistakes.ts";
import { YoutubeSearchURLIE } from "../yt_dlp/extractor/youtube/search.ts";
import { YoutubePlaylistIE, YoutubeTabIE } from "../yt_dlp/extractor/youtube/tab.ts";

describe("ported extractor URL matching", () => {
  test("registry includes newly ported extractors", async () => {
    const names = new Set((await genExtractorClasses()).map((Extractor) => Extractor.name));
    for (const name of ["ABCOTVSIE", "ABCOTVSClipsIE", "YoutubeYtBeIE", "YoutubeTruncatedURLIE"]) {
      expect(names.has(name)).toBe(true);
    }
  });

  test.each([
    [ABCOTVSIE, "http://abc7news.com/entertainment/east-bay-museum-celebrates-vintage-synthesizers/472581/"],
    [ABCOTVSClipsIE, "https://clips.abcotvs.com/kabc/video/214814"],
    [YoutubePlaylistIE, "https://www.youtube.com/playlist?list=PLwP_SiAcdui0KVebT0mU9Apz359a4ubsC"],
    [YoutubePlaylistIE, "https://www.youtube.com/watch?v=AV6J6_AeFEQ&playnext=1&list=PL4023E734DA416012"],
    [YoutubeTabIE, "https://www.youtube.com/feed/library"],
    [YoutubeTabIE, "https://www.youtube.com/feed/history"],
    [YoutubeTabIE, "https://www.youtube.com/feed/watch_later"],
    [YoutubeTabIE, "https://www.youtube.com/feed/subscriptions"],
    [YoutubeSearchURLIE, "http://www.youtube.com/results?search_query=making+mustard"],
    [YoutubeSearchURLIE, "https://www.youtube.com/results?baz=bar&search_query=youtube-dl+test+video&filters=video&lclk=video"],
    [YoutubeSubscriptionsIE, ":ytsubs"],
    [YoutubeSubscriptionsIE, ":ytsubscriptions"],
    [YoutubeHistoryIE, ":ythistory"],
    [YoutubeYtBeIE, "https://youtu.be/yeWKywCrFtk?list=PL2qgrgXsNUG5ig9cat4ohreBjYLAPC0J5"],
    [YoutubeLivestreamEmbedIE, "https://www.youtube.com/embed/live_stream?channel=UC2_KI6RB__jGdlnK6dvFEZA"],
    [YoutubeConsentRedirectIE, "https://consent.youtube.com/m?continue=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DBaW_jenozKc"],
    [YoutubeTruncatedURLIE, "https://www.youtube.com/watch?feature=foo"],
    [YoutubeTruncatedIDIE, "https://www.youtube.com/watch?v=N_708QY7Ob"],
  ] as const)("matches %s", (Extractor, url) => {
    expect(Extractor.suitable(url)).toBe(true);
  });

  test("ported extractor names are unique case-insensitively", async () => {
    const byName = new Map<string, string[]>();
    for (const Extractor of await genExtractorClasses()) {
      const key = Extractor.IE_NAME.toLowerCase();
      byName.set(key, [...(byName.get(key) ?? []), Extractor.name]);
    }
    for (const [ieName, names] of byName) {
      expect(names, `Multiple extractors with IE_NAME ${JSON.stringify(ieName)}`).toHaveLength(1);
    }
  });
});

describe("Python test_all_urls.py inventory", () => {
  test.todo("test_youtube_playlist_matching raw playlist IDs and tab precedence", () => undefined);
  test.todo("test_youtube_matching youtube.googleapis.com/v and cleanvideosearch compatibility URLs", () => undefined);
  test.todo("test_youtube_channel_matching once full YouTube tab URL patterns are ported", () => undefined);
  test.todo("test_youtube_user_matching once full YouTube tab URL patterns are ported", () => undefined);
  test.todo("test_facebook_matching once FacebookIE is ported", () => undefined);
  test.todo("test_no_duplicates once Python testcase fixture metadata is ported", () => undefined);
  test.todo("test_vimeo_matching once Vimeo extractors are ported", () => undefined);
  test.todo("test_soundcloud_not_matching_sets once SoundCloud extractors are ported", () => undefined);
  test.todo("test_tumblr once Tumblr extractor is ported", () => undefined);
  test.todo("test_pbs once PBS extractor is ported", () => undefined);
});
