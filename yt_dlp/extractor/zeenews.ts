// Source: yt_dlp/extractor/zeenews.py

import { ExtractorError } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

export class ZeeNewsIE extends InfoExtractor {
  static override readonly _WORKING = false;
  static readonly _ENABLED = null;
  static override readonly _VALID_URL =
    String.raw`https?://zeenews\.india\.com/[^#?]+/video/(?<display_id>[^#/?]+)/(?<id>\d+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const contentId = match?.groups?.id;
    const displayId = match?.groups?.display_id;
    if (!contentId || !displayId) {
      throw new ExtractorError("Invalid Zee News URL", { expected: true });
    }
    const webpage = await this.downloadWebpage(url, contentId);
    if (webpage === false) {
      throw new ExtractorError("Unable to download Zee News webpage", {
        videoId: contentId,
      });
    }

    const videoObject = [...this.yieldJsonLd(webpage, displayId)].find(
      (item) => jsonLdType(item) === "VideoObject",
    );
    const embedUrl =
      typeof videoObject?.embedUrl === "string" ? videoObject.embedUrl : null;
    if (!embedUrl) {
      throw new ExtractorError("No video found", {
        expected: true,
        videoId: contentId,
      });
    }

    return {
      ...this.searchJsonLd(webpage, displayId, {
        expectedType: "VideoObject",
        defaultValue: {},
      }),
      id: contentId,
      display_id: displayId,
      formats: this.extractM3u8Formats(embedUrl, contentId, "mp4"),
    };
  }
}

function jsonLdType(item: Record<string, unknown>): string | null {
  const type = item["@type"];
  return Array.isArray(type)
    ? (type.find((value) => typeof value === "string") ?? null)
    : typeof type === "string"
      ? type
      : null;
}
