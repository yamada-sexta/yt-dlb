// Source: yt_dlp/extractor/anchorfm.py

import { cleanHtml, floatOrNone, intOrNone, strOrNone, traverseObj, unifiedTimestamp } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface AnchorEpisode {
  title?: string;
  episodeEnclosureUrl?: string;
  episodeImage?: string;
  description?: string;
  descriptionPreview?: string;
  duration?: unknown;
  modified?: string;
  publishOnUnixTimestamp?: unknown;
  podcastSeasonNumber?: unknown;
}

interface AnchorApiData {
  episode?: AnchorEpisode;
  episodeAudios?: Array<{ url?: string }>;
  creator?: {
    name?: string;
    userId?: unknown;
    vanitySlug?: string;
  };
}

export class AnchorFMEpisodeIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://anchor\.fm/(?<channel_name>\w+)/(?:embed/)?episodes/[\w-]+-(?<episode_id>\w+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const channelName = match?.groups?.channel_name;
    const episodeId = match?.groups?.episode_id;
    if (!episodeId) {
      throw new Error("Unable to extract AnchorFM episode id");
    }
    const apiData = await this.downloadJson<AnchorApiData>(`https://anchor.fm/api/v3/episodes/${episodeId}`, episodeId);
    if (apiData === false) {
      throw new Error("Unable to download AnchorFM episode metadata");
    }
    const description = traverseObj<string>(apiData, ["episode", ["description", "descriptionPreview"]], { get_all: false });
    return {
      id: episodeId,
      title: apiData.episode?.title,
      url: apiData.episode?.episodeEnclosureUrl ?? apiData.episodeAudios?.[0]?.url,
      ext: "mp3",
      vcodec: "none",
      thumbnail: apiData.episode?.episodeImage,
      description: cleanHtml(typeof description === "string" ? description : null) ?? undefined,
      duration: floatOrNone(apiData.episode?.duration, 1000) ?? undefined,
      modified_timestamp: unifiedTimestamp(apiData.episode?.modified) ?? undefined,
      release_timestamp: intOrNone(apiData.episode?.publishOnUnixTimestamp) ?? undefined,
      episode_id: episodeId,
      uploader: apiData.creator?.name,
      uploader_id: strOrNone(apiData.creator?.userId) ?? undefined,
      season_number: intOrNone(apiData.episode?.podcastSeasonNumber) ?? undefined,
      channel: channelName ?? apiData.creator?.vanitySlug,
    };
  }
}
