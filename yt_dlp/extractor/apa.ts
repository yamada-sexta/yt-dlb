// Source: yt_dlp/extractor/apa.py

import { determineExt, intOrNone, urlOrNone } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

export class APAIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`(?<base_url>https?://[^/]+\.apa\.at)/embed/(?<id>[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const videoId = match?.groups?.id;
    const baseUrl = match?.groups?.base_url;
    if (!videoId || !baseUrl) {
      throw new Error("Unable to extract APA video id");
    }
    const webpage = await this.downloadWebpage(`${baseUrl}/player/${videoId}`, videoId);
    if (webpage === false) {
      throw new Error("Unable to download APA player page");
    }

    const jwplatformId = this.searchRegex(/media[iI]d\s*:\s*["'](?<id>[a-zA-Z0-9]{8})/, webpage, "jwplatform id", {
      defaultValue: null,
      group: "id",
    });
    if (typeof jwplatformId === "string") {
      return this.urlResult(`jwplatform:${jwplatformId}`, "JWPlatform", videoId);
    }

    const extract = (field: string, name = field): string | null => {
      const result = this.searchRegex(new RegExp(`\\b${RegExp.escape(field)}["']\\s*:\\s*(["'])(?<value>(?:(?!\\1).)+)\\1`), webpage, name, {
        defaultValue: null,
        group: "value",
      });
      return typeof result === "string" ? result : null;
    };

    const formats: Array<Record<string, unknown>> = [];
    for (const formatId of ["hls", "progressive"]) {
      const sourceUrl = urlOrNone(extract(formatId));
      if (!sourceUrl) {
        continue;
      }
      if (determineExt(sourceUrl) === "m3u8") {
        formats.push(...this.extractM3u8Formats(sourceUrl, videoId, "mp4", { entryProtocol: "m3u8_native", m3u8Id: "hls" }));
      } else {
        const height = this.searchRegex(/(\d+)\.mp4/, sourceUrl, "height", { defaultValue: null });
        formats.push({
          url: sourceUrl,
          format_id: formatId,
          height: intOrNone(height) ?? undefined,
        });
      }
    }

    return {
      id: videoId,
      title: extract("title") ?? videoId,
      description: extract("description") ?? undefined,
      thumbnail: extract("poster", "thumbnail") ?? undefined,
      formats,
    };
  }
}
