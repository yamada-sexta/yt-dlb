// Source: yt_dlp/extractor/bigflix.py

import { InfoExtractor, type ExtractorInfo } from "./common.ts";

export class BigflixIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?bigflix\.com/.+/(?<id>[0-9]+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new Error("Unable to download Bigflix page");
    }
    const title = this.htmlSearchRegex(/<div[^>]+class=["']pagetitle["'][^>]*>(.+?)<\/div>/, webpage, "title");
    if (typeof title !== "string") {
      throw new Error("Unable to extract Bigflix title");
    }

    const formats: Array<Record<string, unknown>> = [];
    for (const match of webpage.matchAll(/ContentURL_(\d{3,4})[pP][^=]+=([^&]+)/g)) {
      const height = Number(match[1]);
      const videoUrl = decodeUrl(match[2] ?? "");
      formats.push({
        url: videoUrl,
        format_id: `${height}p`,
        height,
        ext: videoUrl.startsWith("rtmp") ? "flv" : undefined,
      });
    }

    const fileUrl = this.searchRegex(/file=([^&]+)/, webpage, "video url", { defaultValue: null });
    if (typeof fileUrl === "string") {
      const videoUrl = decodeUrl(fileUrl);
      if (!formats.some((format) => format.url === videoUrl)) {
        formats.push({ url: videoUrl });
      }
    }

    return {
      id: videoId,
      title,
      description: this.htmlSearchMeta("description", webpage) ?? undefined,
      formats,
    };
  }
}

function decodeUrl(quotedBase64Url: string): string {
  return Buffer.from(decodeURIComponent(quotedBase64Url), "base64").toString("utf8");
}
