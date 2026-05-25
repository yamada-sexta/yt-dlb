// Source: yt_dlp/extractor/bild.py

import { intOrNone, unescapeHTML } from "../utils/index.ts";
import { ExtractorError } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import { z } from "zod";

const BildSourceSchema = z
  .object({
    src: z.string(),
    type: z.string().optional(),
  })
  .passthrough();

const BildDataSchema = z
  .object({
    title: z.string(),
    description: z.string().optional(),
    poster: z.string().optional(),
    durationSec: z.unknown().optional(),
    clipList: z
      .array(
        z
          .object({
            srces: z.array(BildSourceSchema).optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

export class BildIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?bild\.de/(?:[^/]+/)+(?<display_id>[^/]+)-(?<id>\d+)(?:,auto=true)?\.bild\.html`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const dataUrl = `${url.split(".bild.html")[0]},view=json.bild.html`;
    const rawVideoData = await this.downloadJson<unknown>(dataUrl, videoId);
    if (rawVideoData === false) {
      throw new ExtractorError("Unable to download video metadata", {
        videoId,
      });
    }
    const videoData = BildDataSchema.parse(rawVideoData);

    const formats: Array<Record<string, unknown>> = [];
    for (const src of videoData.clipList?.[0]?.srces ?? []) {
      if (src.type === "application/x-mpegURL") {
        formats.push(
          ...this.extractM3u8Formats(src.src, videoId, "mp4", {
            m3u8Id: "hls",
          }),
        );
      } else if (src.type === "video/mp4") {
        formats.push({ url: src.src, format_id: "http-mp4" });
      } else {
        this.reportWarning(
          `Skipping unsupported format type: "${src.type}"`,
          videoId,
        );
      }
    }

    return {
      id: videoId,
      title: unescapeHTML(videoData.title)?.trim() ?? videoData.title,
      description:
        unescapeHTML(videoData.description ?? undefined) ?? undefined,
      formats,
      thumbnail: videoData.poster,
      duration: intOrNone(videoData.durationSec) ?? undefined,
    };
  }
}
