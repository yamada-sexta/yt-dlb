// Source: yt_dlp/extractor/aliexpress.py

import { floatOrNone, tryGet } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import { z } from "zod";

const StringSchema = z.string();

export class AliExpressLiveIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://live\.aliexpress\.com/live/(?<id>\d+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new Error("Unable to download AliExpress live page");
    }
    const json = this.searchRegex(
      /runParams\s*=\s*({[\s\S]+?})\s*;?\s*var/,
      webpage,
      "runParams",
    );
    if (typeof json !== "string") {
      throw new Error("Unable to extract AliExpress runParams");
    }
    const data = JSON.parse(json) as Record<string, unknown>;
    return {
      id: videoId,
      title: String(data.title ?? videoId),
      thumbnail: typeof data.coverUrl === "string" ? data.coverUrl : undefined,
      uploader:
        tryGet(
          data,
          (value) =>
            (value as { followBar?: { name?: unknown } }).followBar?.name,
          isString,
        ) ?? undefined,
      timestamp: floatOrNone(data.startTimeLong, 1000) ?? undefined,
      formats:
        typeof data.replyStreamUrl === "string"
          ? this.extractM3u8Formats(data.replyStreamUrl, videoId, "mp4", {
              entryProtocol: "m3u8_native",
              m3u8Id: "hls",
            })
          : [],
    };
  }
}

function isString(value: unknown): value is string {
  return StringSchema.safeParse(value).success;
}
