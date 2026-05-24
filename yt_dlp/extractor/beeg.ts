// Source: yt_dlp/extractor/beeg.py

import { intOrNone, strOrNone, unifiedTimestamp } from "../utils/index.ts";
import { ExtractorError } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import { z } from "zod";

const BeegFactSchema = z.object({
  id: z.unknown().optional(),
  fc_created: z.unknown().optional(),
  hls_resources: z.record(z.string(), z.unknown()).optional(),
}).passthrough();

const BeegResponseSchema = z.object({
  fc_facts: z.array(BeegFactSchema).optional(),
  file: z.object({
    hls_resources: z.record(z.string(), z.unknown()).optional(),
    fl_duration: z.unknown().optional(),
    stuff: z.object({
      sf_name: z.string().optional(),
      sf_story: z.string().optional(),
    }).passthrough().optional(),
  }).passthrough().optional(),
  tags: z.array(z.object({
    tg_name: z.string().optional(),
  }).passthrough()).optional(),
}).passthrough();

export class BeegIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?beeg\.(?:com(?:/video)?)/-?(?<id>\d+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new ExtractorError("Unable to download webpage", { videoId });
    }

    const rawVideo = await this.downloadJson<unknown>(
      `https://store.externulls.com/facts/file/${videoId}`,
      videoId,
      { note: `Downloading JSON for ${videoId}` },
    );
    if (rawVideo === false) {
      throw new ExtractorError("Unable to download video metadata", { videoId });
    }
    const video = BeegResponseSchema.parse(rawVideo);
    const firstFact = [...(video.fc_facts ?? [])].sort((left, right) => (intOrNone(left.id) ?? Number.MAX_SAFE_INTEGER) - (intOrNone(right.id) ?? Number.MAX_SAFE_INTEGER))[0] ?? {};
    const resources = video.file?.hls_resources ?? firstFact.hls_resources ?? {};

    const formats: Array<Record<string, unknown>> = [];
    for (const [formatId, videoUri] of Object.entries(resources)) {
      if (typeof videoUri !== "string" || !videoUri) {
        continue;
      }
      const height = intOrNone(this.searchRegex(/fl_cdn_(\d+)/, formatId, "height", { defaultValue: null }));
      for (const format of this.extractM3u8Formats(`https://video.beeg.com/${videoUri}`, videoId, "mp4", { m3u8Id: strOrNone(height) ?? undefined })) {
        format.height = height ?? undefined;
        formats.push(format);
      }
    }

    return {
      id: videoId,
      display_id: strOrNone(firstFact.id) ?? undefined,
      title: video.file?.stuff?.sf_name,
      description: video.file?.stuff?.sf_story,
      timestamp: unifiedTimestamp(firstFact.fc_created),
      duration: intOrNone(video.file?.fl_duration) ?? undefined,
      tags: video.tags?.map((tag) => tag.tg_name).filter(Boolean),
      formats,
      age_limit: this.rtaSearch(webpage),
    };
  }
}
