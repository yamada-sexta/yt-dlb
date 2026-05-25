// Source: yt_dlp/extractor/yfanefa.py

import { determineExt, intOrNone, joinNonempty, removeEnd, urlOrNone } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

export class YfanefaIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?yfanefa\.com/(?<id>[^?#]+)`;

  static override get IE_NAME(): string {
    return "yfanefa";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new Error("Unable to download Yfanefa webpage");
    }
    const playerData = this.searchJson<Record<string, unknown>>(
      String.raw`iwPlayer\.options\["[\w.]+"\]\s*=`,
      webpage,
      "player options",
      videoId,
    ) ?? {};

    const rawVideoUrl = joinNonempty(playerData.url, playerData.signature, { delim: "" });
    const videoUrl = urlOrNone(rawVideoUrl);
    const formats = !videoUrl
      ? []
      : determineExt(videoUrl) === "m3u8"
        ? this.extractM3u8Formats(videoUrl, videoId, "mp4", { m3u8Id: "hls" })
        : [{ url: videoUrl, ext: "mp4" }];

    return {
      id: videoId.replace(/^\/+|\/+$/g, "").replaceAll("/", "-"),
      title: this.ogSearchTitle(webpage) ?? removeEnd(this.htmlExtractTitle(webpage), " | Yorkshire Film Archive") ?? videoId,
      formats,
      thumbnail: urlOrNone(playerData.preview),
      duration: intOrNone(playerData.duration) ?? undefined,
    };
  }
}
