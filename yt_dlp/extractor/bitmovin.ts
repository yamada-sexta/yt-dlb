// Source: yt_dlp/extractor/bitmovin.py

import { ExtractorError } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import { z } from "zod";

const BitmovinSourcesSchema = z.object({
  hls: z.string(),
  title: z.string().optional(),
  poster: z.string().optional(),
}).passthrough();

const BitmovinConfigSchema = z.object({
  sources: BitmovinSourcesSchema,
}).passthrough();

export class BitmovinIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://streams\.bitmovin\.com/(?<id>\w+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const rawConfig = await this.downloadJson<unknown>(`https://streams.bitmovin.com/${videoId}/config`, videoId);
    if (rawConfig === false) {
      throw new ExtractorError("Unable to download Bitmovin config", { videoId });
    }
    const playerConfig = BitmovinConfigSchema.parse(rawConfig).sources;
    const [formats, subtitles] = this.extractM3u8FormatsAndSubtitles(playerConfig.hls, videoId, "mp4");

    return {
      id: videoId,
      formats,
      subtitles,
      title: playerConfig.title,
      thumbnail: playerConfig.poster,
    };
  }
}
