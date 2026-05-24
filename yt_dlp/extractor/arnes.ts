// Source: yt_dlp/extractor/arnes.py

import { ExtractorError, floatOrNone, formatField, intOrNone, parseIso8601, removeStart } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import { z } from "zod";

const ArnesMediaSchema = z.object({
  url: z.string().optional(),
  format: z.string().optional(),
  formatTranslation: z.string().optional(),
  width: z.unknown().optional(),
  height: z.unknown().optional(),
}).passthrough();

type ArnesMedia = z.infer<typeof ArnesMediaSchema>;

interface ArnesChannel {
  name?: string;
  url?: string;
}

interface ArnesVideo {
  title?: string;
  media?: unknown;
  thumbnailUrl?: string;
  description?: string;
  license?: string;
  author?: string;
  creationTime?: string;
  channel?: ArnesChannel;
  duration?: unknown;
  views?: unknown;
  hashtags?: string[];
}

export class ArnesIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://video\.arnes\.si/(?:[a-z]{2}/)?(?:watch|embed|api/(?:asset|public/video))/(?<id>[0-9a-zA-Z]{12})`;
  private static readonly BASE_URL = "https://video.arnes.si";

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const response = await this.downloadJson<{ data?: ArnesVideo }>(
      `${ArnesIE.BASE_URL}/api/public/video/${videoId}`,
      videoId,
    );
    if (response === false) {
      throw new ExtractorError("Unable to download video metadata", { videoId });
    }
    const video = response.data ?? {};

    const formats: Array<Record<string, unknown>> = [];
    for (const media of Array.isArray(video.media) ? video.media : []) {
      if (!isArnesMedia(media) || !media.url) {
        continue;
      }
      formats.push({
        url: `${ArnesIE.BASE_URL}${media.url}`,
        format_id: removeStart(media.format, "FORMAT_"),
        format_note: media.formatTranslation,
        width: intOrNone(media.width) ?? undefined,
        height: intOrNone(media.height) ?? undefined,
      });
    }

    const channel = video.channel ?? {};
    const channelId = channel.url ?? null;
    const thumbnail = video.thumbnailUrl ? `${ArnesIE.BASE_URL}${video.thumbnailUrl}` : undefined;
    const startTime = URL.canParse(url) ? new URL(url).searchParams.get("t") : null;

    return {
      id: videoId,
      title: video.title,
      formats,
      thumbnail,
      description: video.description,
      license: video.license,
      creator: video.author,
      timestamp: parseIso8601(video.creationTime),
      channel: channel.name,
      channel_id: channelId,
      channel_url: formatField(channelId, null, `${ArnesIE.BASE_URL}/?channel=%s`),
      duration: floatOrNone(video.duration, 1000),
      view_count: intOrNone(video.views),
      tags: video.hashtags,
      start_time: intOrNone(startTime),
    };
  }
}

function isArnesMedia(value: unknown): value is ArnesMedia {
  return ArnesMediaSchema.safeParse(value).success;
}
