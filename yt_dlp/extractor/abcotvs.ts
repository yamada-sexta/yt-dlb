// Source: yt_dlp/extractor/abcotvs.py

import { z } from "zod";

import { intOrNone } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

const ABCOTVSImageSchema = z
  .object({
    source: z.string().optional(),
    dynamicSource: z.string().optional(),
  })
  .passthrough();

const ABCOTVSVideoSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    publishedKey: z.union([z.string(), z.number()]).optional(),
    title: z.string().optional(),
    linkText: z.string().optional(),
    description: z.string().optional(),
    caption: z.string().optional(),
    meta: z
      .object({
        description: z.string().optional(),
      })
      .passthrough()
      .optional(),
    m3u8: z.string().optional(),
    mp4: z.string().optional(),
    image: ABCOTVSImageSchema.optional(),
    date: z.union([z.string(), z.number()]).optional(),
    length: z.union([z.string(), z.number()]).optional(),
  })
  .passthrough();

const ABCOTVSContentSchema = z
  .object({
    data: ABCOTVSVideoSchema.extend({
      featuredMedia: z
        .object({
          video: ABCOTVSVideoSchema.optional(),
        })
        .passthrough()
        .optional(),
    }).passthrough(),
  })
  .passthrough();

const ABCOTVSClipSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            title: z.string(),
            videoURL: z.string(),
            description: z.string().optional(),
            thumbnailURL: z.string().optional(),
            duration: z.union([z.string(), z.number()]).optional(),
            pubDate: z.union([z.string(), z.number()]).optional(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .passthrough();

export class ABCOTVSIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?<site>abc(?:7(?:news|ny|chicago)?|11|13|30)|6abc)\.com(?:(?:/[^/]+)*/(?<display_id>[^/]+))?/(?<id>\d+)`;

  static override get IE_NAME(): string {
    return "abcotvs";
  }

  static readonly IE_DESC = "ABC Owned Television Stations";

  private static readonly SITE_MAP: Record<string, string> = {
    "6abc": "wpvi",
    abc11: "wtvd",
    abc13: "ktrk",
    abc30: "kfsn",
    abc7: "kabc",
    abc7chicago: "wls",
    abc7news: "kgo",
    abc7ny: "wabc",
  };

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const site = match?.groups?.site;
    const displayId = match?.groups?.display_id ?? match?.groups?.id;
    const urlVideoId = match?.groups?.id;
    if (!site || !displayId || !urlVideoId) {
      throw new Error("Unable to extract ABCOTVS URL fields");
    }

    const station = ABCOTVSIE.SITE_MAP[site];
    if (!station) {
      throw new Error(`Unsupported ABCOTVS station: ${site}`);
    }

    const rawData = await this.downloadJson<unknown>(
      "https://api.abcotvs.com/v2/content",
      displayId,
      {
        query: {
          id: urlVideoId,
          key: `otv.web.${station}.story`,
          station,
        },
      },
    );
    const data = ABCOTVSContentSchema.parse(rawData).data;
    const video = data.featuredMedia?.video ?? data;
    const videoId = String(
      firstDefined(video.id, video.publishedKey, urlVideoId),
    );
    const title = video.title ?? video.linkText;
    if (!title) {
      throw new Error("Unable to extract ABCOTVS title");
    }

    const formats: Array<Record<string, unknown>> = [];
    const m3u8Url = video.m3u8;
    if (m3u8Url) {
      formats.push(
        ...this.extractM3u8Formats(
          m3u8Url.split("?")[0] ?? m3u8Url,
          displayId,
          "mp4",
          {
            m3u8Id: "hls",
          },
        ),
      );
    }
    if (video.mp4) {
      formats.push({
        abr: 128,
        format_id: "https",
        height: 360,
        url: video.mp4,
        width: 640,
      });
    }

    return {
      id: videoId,
      display_id: displayId,
      title,
      description: firstDefined(
        video.description,
        video.caption,
        video.meta?.description,
        null,
      ),
      thumbnail: firstDefined(
        video.image?.source,
        video.image?.dynamicSource,
        null,
      ),
      timestamp: intOrNone(video.date),
      duration: intOrNone(video.length),
      formats,
    };
  }
}

export class ABCOTVSClipsIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://clips\.abcotvs\.com/(?:[^/]+/)*video/(?<id>\d+)`;

  static override get IE_NAME(): string {
    return "abcotvs:clips";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const rawData = await this.downloadJson<unknown>(
      `https://clips.abcotvs.com/vogo/video/getByIds?ids=${videoId}`,
      videoId,
    );
    const videoData = ABCOTVSClipSchema.parse(rawData).results[0];
    if (!videoData) {
      throw new Error("Unable to extract ABCOTVS clip metadata");
    }
    const videoUrl = videoData.videoURL.split("?")[0] ?? videoData.videoURL;

    return {
      id: videoId,
      title: videoData.title,
      description: videoData.description,
      thumbnail: videoData.thumbnailURL,
      duration: intOrNone(videoData.duration),
      timestamp: intOrNone(videoData.pubDate),
      formats: this.extractM3u8Formats(videoUrl, videoId, "mp4"),
    };
  }
}

function firstDefined<T>(...values: Array<T | null | undefined>): T | null {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return value;
    }
  }
  return null;
}
