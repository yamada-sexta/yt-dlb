// Source: yt_dlp/extractor/allocine.py

import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import {
  ExtractorError,
  intOrNone,
  qualities,
  removeEnd,
  stripOrNone,
  tryGet,
  unifiedTimestamp,
  urlBasename,
} from "../utils/index.ts";

export class AllocineIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?allocine\.fr/(?:article|video|film)/(?:fichearticle_gen_carticle=|player_gen_cmedia=|fichefilm_gen_cfilm=|video-)(?<id>[0-9]+)(?:\.html)?`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const displayId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, displayId);
    if (webpage === false) {
      throw new ExtractorError("Unable to download webpage");
    }

    const formats: any[] = [];
    const quality = qualities(["ld", "md", "hd"]);

    const model = this.htmlSearchRegex(
      String.raw`data-model="([^"]+)"`,
      webpage,
      "data model",
      { defaultValue: null },
    ) as string | null;

    let videoId = displayId;
    let title: string;
    let duration: number | null = null;
    let viewCount: number | null = null;
    let timestamp: number | null = null;

    if (model) {
      const modelData = this.parseJson(model, displayId) as any;
      const video = modelData?.videos?.[0];
      if (!video) {
        throw new ExtractorError("No video found in model data");
      }
      title = video.title as string;
      const sources = (video.sources || {}) as Record<string, string>;
      for (const videoUrl of Object.values(sources)) {
        const basename = urlBasename(videoUrl);
        const parts = basename.split("_");
        videoId = parts[0] || displayId;
        const formatId = parts[1] || "";
        formats.push({
          format_id: formatId,
          quality: quality(formatId),
          url: videoUrl,
        });
      }
      videoId = videoId! || displayId;
      duration = intOrNone(video.duration);
      viewCount = intOrNone(video.view_count);
      timestamp = unifiedTimestamp(
        tryGet<string>(video, (x: any) => x?.added_at?.date),
      );
    } else {
      videoId = displayId;
      const mediaData = (await this.downloadJson(
        `http://www.allocine.fr/ws/AcVisiondataV5.ashx?media=${videoId}`,
        displayId,
      )) as any;
      const extractedTitle = this.htmlExtractTitle(webpage);
      title = removeEnd(stripOrNone(extractedTitle) || "", " - AlloCiné") || "";
      const videoObj = (mediaData?.video || {}) as Record<string, unknown>;
      for (const [key, value] of Object.entries(videoObj)) {
        if (!key.endsWith("Path") || typeof value !== "string") {
          continue;
        }
        const formatId = key.slice(0, -4); // remove "Path"
        formats.push({
          format_id: formatId,
          quality: quality(formatId),
          url: value,
        });
      }
    }

    return {
      id: videoId,
      display_id: displayId,
      title,
      description: this.ogSearchDescription(webpage) || undefined,
      thumbnail: this.ogSearchThumbnail(webpage) || undefined,
      duration: duration ?? undefined,
      timestamp: timestamp ?? undefined,
      view_count: viewCount ?? undefined,
      formats,
    };
  }
}
