// Source: yt_dlp/extractor/bloomberg.py

import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface BloombergEmbedInfo {
  streams?: Array<{ url?: string; muxing_format?: string }>;
}

export class BloombergIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?bloomberg\.com/(?:[^/]+/)*(?<id>[^/?#]+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const name = this.matchId(url);
    const webpage = await this.downloadWebpage(url, name);
    if (webpage === false) {
      throw new Error("Unable to download Bloomberg page");
    }
    let videoId = this.searchRegex([
      /["']bmmrId["']\s*:\s*(["'])(?<id>(?:(?!\1).)+)\1/,
      /videoId\s*:\s*(["'])(?<id>(?:(?!\1).)+)\1/,
      /data-bmmrid=(["'])(?<id>(?:(?!\1).)+)\1/,
    ], webpage, "id", { group: "id", defaultValue: null });

    if (!videoId) {
      const bplayerJson = this.searchRegex(/BPlayer\(null,\s*({[^;]+})\);/, webpage, "id");
      if (typeof bplayerJson !== "string") {
        throw new Error("Unable to extract Bloomberg player data");
      }
      videoId = this.parseJson<{ id?: string }>(bplayerJson, name)?.id ?? null;
    }
    if (typeof videoId !== "string") {
      throw new Error("Unable to extract Bloomberg video id");
    }

    const title = (this.ogSearchTitle(webpage) ?? name).replace(/: Video$/, "");
    const embedInfo = await this.downloadJson<BloombergEmbedInfo>(`http://www.bloomberg.com/multimedia/api/embed?id=${encodeURIComponent(videoId)}`, videoId);
    if (embedInfo === false) {
      throw new Error("Unable to download Bloomberg embed metadata");
    }

    const formats: Array<Record<string, unknown>> = [];
    for (const stream of embedInfo.streams ?? []) {
      if (!stream.url) {
        continue;
      }
      if (stream.muxing_format === "TS") {
        formats.push(...this.extractM3u8Formats(stream.url, videoId, "mp4", { m3u8Id: "hls" }));
      } else {
        formats.push(...this.extractF4mFormats(`${stream.url}?hdcore=2.11.3`, videoId, { f4mId: "hds", fatal: false }));
      }
    }

    return {
      id: videoId,
      title,
      formats,
      description: this.ogSearchDescription(webpage) ?? undefined,
      thumbnail: this.ogSearchThumbnail(webpage) ?? undefined,
    };
  }
}
