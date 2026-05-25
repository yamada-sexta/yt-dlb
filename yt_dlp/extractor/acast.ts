// Source: yt_dlp/extractor/acast.py

import {
  cleanHtml,
  cleanPodcastUrl,
  intOrNone,
  parseIso8601,
} from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface AcastEpisode {
  id?: string;
  episodeUrl?: string;
  url?: string;
  title?: string;
  description?: string;
  summary?: string;
  image?: string;
  publishDate?: string;
  duration?: unknown;
  contentLength?: unknown;
  season?: unknown;
  episode?: unknown;
  show?: AcastShow;
}

interface AcastShow {
  id?: string;
  author?: string;
  title?: string;
  description?: string;
  episodes?: AcastEpisode[];
}

abstract class ACastBaseIE extends InfoExtractor {
  protected extractEpisode(
    episode: AcastEpisode,
    showInfo: Record<string, unknown>,
  ): ExtractorInfo {
    const title = episode.title ?? episode.id ?? "episode";
    return {
      ...showInfo,
      id: episode.id,
      display_id: episode.episodeUrl,
      url: episode.url ? cleanPodcastUrl(episode.url) : undefined,
      title,
      description: cleanHtml(episode.description ?? episode.summary),
      thumbnail: episode.image,
      timestamp: parseIso8601(episode.publishDate),
      duration: intOrNone(episode.duration) ?? undefined,
      filesize: intOrNone(episode.contentLength) ?? undefined,
      season_number: intOrNone(episode.season) ?? undefined,
      episode: title,
      episode_number: intOrNone(episode.episode) ?? undefined,
    };
  }

  protected extractShowInfo(show: AcastShow): Record<string, unknown> {
    return {
      creator: show.author,
      series: show.title,
    };
  }

  protected async callApi<T>(
    path: string,
    videoId: string,
    query?: Record<string, string>,
  ): Promise<T> {
    const data = await this.downloadJson<T>(
      `https://feeder.acast.com/api/v1/shows/${path}`,
      videoId,
      { query },
    );
    if (data === false) {
      throw new Error(`Unable to download Acast metadata for ${path}`);
    }
    return data;
  }
}

export class ACastIE extends ACastBaseIE {
  static override get IE_NAME(): string {
    return "acast";
  }

  static override readonly _VALID_URL =
    String.raw`https?://(?:(?:(?:embed|www|shows)\.)?acast\.com/|play\.acast\.com/s/)(?<channel>[^/?#]+)/(?:episodes/)?(?<id>[^/#?"]+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const channel = match?.groups?.channel;
    const displayId = match?.groups?.id;
    if (!channel || !displayId) {
      throw new Error("Unable to extract Acast episode id");
    }
    const episode = await this.callApi<AcastEpisode>(
      `${channel}/episodes/${displayId}`,
      displayId,
      { showInfo: "true" },
    );
    return this.extractEpisode(
      episode,
      this.extractShowInfo(episode.show ?? {}),
    );
  }
}

export class ACastChannelIE extends ACastBaseIE {
  static override get IE_NAME(): string {
    return "acast:channel";
  }

  static override readonly _VALID_URL =
    String.raw`https?://(?:(?:(?:www|shows)\.)?acast\.com/|play\.acast\.com/s/)(?<id>[^/#?]+)`;

  static override suitable(url: string): boolean {
    return ACastIE.suitable(url) ? false : ACastBaseIE.suitable(url);
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const showSlug = this.matchId(url);
    const show = await this.callApi<AcastShow>(showSlug, showSlug);
    const showInfo = this.extractShowInfo(show);
    const entries = (show.episodes ?? []).map((episode) =>
      this.extractEpisode(episode, showInfo),
    );
    return this.playlistResult(
      entries,
      show.id ?? null,
      show.title ?? null,
      show.description ?? null,
    );
  }
}
