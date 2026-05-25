// Source: test/test_all_urls.py

import { describe, expect, test } from "bun:test";

import { genExtractorClasses } from "../yt_dlp/extractor/index.ts";
import { ABCOTVSClipsIE, ABCOTVSIE } from "../yt_dlp/extractor/abcotvs.ts";
import { YoutubeConsentRedirectIE, YoutubeLivestreamEmbedIE, YoutubeYtBeIE } from "../yt_dlp/extractor/youtube/redirect.ts";
import { YoutubeTruncatedIDIE, YoutubeTruncatedURLIE } from "../yt_dlp/extractor/youtube/mistakes.ts";

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
    [YoutubeYtBeIE, "https://youtu.be/yeWKywCrFtk?list=PL2qgrgXsNUG5ig9cat4ohreBjYLAPC0J5"],
    [YoutubeLivestreamEmbedIE, "https://www.youtube.com/embed/live_stream?channel=UC2_KI6RB__jGdlnK6dvFEZA"],
    [YoutubeConsentRedirectIE, "https://consent.youtube.com/m?continue=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DBaW_jenozKc"],
    [YoutubeTruncatedURLIE, "https://www.youtube.com/watch?feature=foo"],
    [YoutubeTruncatedIDIE, "https://www.youtube.com/watch?v=N_708QY7Ob"],
  ] as const)("matches %s", (Extractor, url) => {
    expect(Extractor.suitable(url)).toBe(true);
  });
});
