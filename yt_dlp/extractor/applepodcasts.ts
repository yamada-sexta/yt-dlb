// Source: yt_dlp/extractor/applepodcasts.py

import { cleanHtml, cleanPodcastUrl, intOrNone, parseIso8601 } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface AppleEpisodeModel {
  title?: string;
  summary?: string;
  playAction?: { episodeOffer?: { streamUrl?: string } };
  releaseDate?: string;
  duration?: unknown;
  episodeNumber?: unknown;
  showTitle?: string;
}

interface AppleServerItem {
  data?: unknown;
}

export class ApplePodcastsIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://podcasts\.apple\.com/(?:[^/]+/)?podcast(?:/[^/]+){1,2}.*?\bi=(?<id>\d+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const episodeId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, episodeId);
    if (webpage === false) {
      throw new Error("Unable to download Apple Podcasts page");
    }
    const serverJson = this.searchRegex(
      /<script [^>]*\bid=["']serialized-server-data["'][^>]*>(?<json>[\s\S]*?)<\/script>/,
      webpage,
      "server data",
      { group: "json" },
    );
    if (typeof serverJson !== "string") {
      throw new Error("Unable to extract Apple Podcasts server data");
    }
    const serverData = this.parseJson<AppleServerItem[]>(serverJson, episodeId);
    const rootData = Array.isArray(serverData) ? serverData[0]?.data : null;
    const model = findEpisodeModel(rootData);
    if (!model) {
      throw new Error("Unable to extract Apple Podcasts episode model");
    }

    return {
      id: episodeId,
      title: model.title,
      description: cleanHtml(model.summary) ?? undefined,
      url: model.playAction?.episodeOffer?.streamUrl ? cleanPodcastUrl(model.playAction.episodeOffer.streamUrl) : undefined,
      timestamp: parseIso8601(model.releaseDate) ?? undefined,
      duration: intOrNone(model.duration) ?? undefined,
      episode: model.title,
      episode_number: intOrNone(model.episodeNumber) ?? undefined,
      series: model.showTitle,
      thumbnail: this.ogSearchThumbnail(webpage) ?? undefined,
      vcodec: "none",
    };
  }
}

function findEpisodeModel(value: unknown): AppleEpisodeModel | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findEpisodeModel(item);
      if (found) {
        return found;
      }
    }
    return null;
  }
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.$kind === "share" && record.modelType === "EpisodeLockup" && record.model && typeof record.model === "object") {
    return record.model as AppleEpisodeModel;
  }
  for (const item of Object.values(record)) {
    const found = findEpisodeModel(item);
    if (found) {
      return found;
    }
  }
  return null;
}
