// Source: yt_dlp/extractor/byutv.py

import { z } from "zod";

import { determineExt, parseDuration, urlOrNone } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

const ByuTvEpisodeSchema = z.object({
  videoUrl: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  imageThumbnail: z.string().optional(),
  length: z.union([z.string(), z.number()]).optional(),
}).passthrough();

const ByuTvVideoSchema = z.record(z.string(), z.unknown());

export class BYUtvIE extends InfoExtractor {
  static override readonly _WORKING = false;
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?byutv\.org/(?:watch|player)/(?!event/)(?<id>[0-9a-f-]+)(?:/(?<display_id>[^/?#&]+))?`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const videoId = match?.groups?.id;
    const displayId = match?.groups?.display_id ?? videoId;
    if (!videoId || !displayId) {
      throw new Error("Unable to extract BYUtv URL fields");
    }

    const rawVideo = await this.downloadJson<unknown>(
      "https://api.byutv.org/api3/catalog/getvideosforcontent",
      displayId,
      {
        query: {
          contentid: videoId,
          channel: "byutv",
          "x-byutv-context": "web$US",
        },
        headers: {
          "x-byutv-context": "web$US",
          "x-byutv-platformkey": "xsaaw9c7y5",
        },
      },
    );
    const video = ByuTvVideoSchema.parse(rawVideo);

    const info: Record<string, unknown> = {};
    const formats: Array<Record<string, unknown>> = [];
    const subtitles: Record<string, unknown[]> = {};
    for (const [formatId, rawEpisode] of Object.entries(video)) {
      const parsed = ByuTvEpisodeSchema.safeParse(rawEpisode);
      if (!parsed.success) {
        continue;
      }
      const episode = parsed.data;
      const videoUrl = urlOrNone(episode.videoUrl);
      if (!videoUrl) {
        continue;
      }
      const ext = determineExt(videoUrl);
      if (ext === "m3u8") {
        const [m3u8Formats, m3u8Subtitles] = await this.extractM3u8FormatsAndSubtitles(
          videoUrl,
          videoId,
          "mp4",
          { entryProtocol: "m3u8_native", m3u8Id: "hls" },
        );
        formats.push(...m3u8Formats);
        this.mergeSubtitles(m3u8Subtitles, subtitles);
      } else if (ext === "mpd") {
        const [mpdFormats, mpdSubtitles] = await this.extractMpdFormatsAndSubtitles(videoUrl, videoId, { mpdId: "dash", fatal: false });
        formats.push(...mpdFormats);
        this.mergeSubtitles(mpdSubtitles, subtitles);
      } else {
        formats.push({
          url: videoUrl,
          format_id: formatId,
        });
      }
      fillMissing(info, {
        title: episode.title,
        description: episode.description,
        thumbnail: episode.imageThumbnail,
        duration: parseDuration(episode.length),
      });
    }

    return {
      id: videoId,
      display_id: displayId,
      title: typeof info.title === "string" ? info.title : displayId,
      description: typeof info.description === "string" ? info.description : undefined,
      thumbnail: typeof info.thumbnail === "string" ? info.thumbnail : undefined,
      duration: typeof info.duration === "number" ? info.duration : undefined,
      formats,
      subtitles,
    };
  }
}

function fillMissing(target: Record<string, unknown>, source: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(source)) {
    if (target[key] === undefined && value !== undefined && value !== null) {
      target[key] = value;
    }
  }
}
