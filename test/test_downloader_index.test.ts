// Source: yt_dlp/downloader/__init__.py

import { describe, expect, test } from "bun:test";

import {
  DashSegmentsFD,
  FFmpegFD,
  getSuitableDownloader,
  HttpFD,
  shortenProtocolName,
} from "../yt_dlp/downloader/index.ts";

const BASE_INFO = {
  url: "https://example.com/video.mp4",
  filename: "video.mp4",
};

describe("downloader protocol selection", () => {
  test("short protocol names match Python selector keys", () => {
    expect(shortenProtocolName("m3u8_native")).toBe("m3u8");
    expect(shortenProtocolName("m3u8")).toBe("m3u8F");
    expect(shortenProtocolName("m3u8", true)).toBe("m3u8");
    expect(shortenProtocolName("http_dash_segments_generator", true)).toBe(
      "dash",
    );
  });

  test("single protocols return the selected downloader", () => {
    expect(getSuitableDownloader(BASE_INFO)).toBe(HttpFD);
    expect(
      getSuitableDownloader({
        ...BASE_INFO,
        protocol: "http_dash_segments",
      }),
    ).toBe(DashSegmentsFD);
  });

  test("unsupported merged protocols return null for caller-side fallback", () => {
    expect(
      getSuitableDownloader({
        ...BASE_INFO,
        requested_formats: [
          { url: "https://example.com/video.mp4", protocol: "https" },
          {
            url: "https://example.com/manifest.mpd",
            protocol: "http_dash_segments",
          },
        ],
        protocol: "https+http_dash_segments",
      }),
    ).toBeNull();
  });

  test("DASH generator merge special case matches Python", () => {
    expect(
      getSuitableDownloader({
        ...BASE_INFO,
        protocol: "http_dash_segments_generator+http_dash_segments_generator",
      }),
    ).toBe(DashSegmentsFD);
    expect(
      getSuitableDownloader(
        {
          ...BASE_INFO,
          protocol: "http_dash_segments_generator+http_dash_segments_generator",
        },
        {},
        HttpFD,
        undefined,
        true,
      ),
    ).toBeNull();
  });

  test("FFmpeg merge is selected only when formats are mergeable", () => {
    const info = {
      ...BASE_INFO,
      requested_formats: [
        { url: "https://example.com/video.mp4", protocol: "https" },
        { url: "https://example.com/audio.m4a", protocol: "https" },
      ],
      protocol: "https+https",
    };
    const expected = FFmpegFD.available() ? FFmpegFD : null;
    expect(getSuitableDownloader(info)).toBe(expected);
    expect(
      getSuitableDownloader(info, { allow_unplayable_formats: true }),
    ).toBe(null);
  });
});
