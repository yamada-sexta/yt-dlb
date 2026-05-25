// Source: yt_dlp/extractor/americastestkitchen.py

import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import {
  ExtractorError,
  cleanHtml,
  intOrNone,
  tryGet,
  unifiedStrdate,
  unifiedTimestamp,
} from "../utils/index.ts";

export class AmericasTestKitchenIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?(?:americastestkitchen|cooks(?:country|illustrated))\.com/(?:cooks(?:country|illustrated)/)?(?<resource_type>episode|videos)/(?<id>\d+)`;

  static override get IE_NAME(): string {
    return "americastestkitchen";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const resourceTypeRaw = match?.groups?.resource_type;
    const videoId = match?.groups?.id;
    if (!resourceTypeRaw || !videoId) {
      throw new ExtractorError("Invalid America's Test Kitchen URL", { expected: true });
    }

    const isEpisode = resourceTypeRaw === "episode";
    const resourceType = isEpisode ? "episodes" : resourceTypeRaw;

    const resource = await this.downloadJson<any>(
      `https://www.americastestkitchen.com/api/v6/${resourceType}/${videoId}`,
      videoId
    );
    if (!resource || resource === false) {
      throw new ExtractorError("Failed to download metadata");
    }

    const video = isEpisode ? resource.video : resource;
    const episode = isEpisode ? resource : (resource.episode ?? {});

    if (!video?.zypeId) {
      throw new ExtractorError("No zype ID found in metadata");
    }

    return {
      _type: "url_transparent",
      url: `https://player.zype.com/embed/${video.zypeId}.js?api_key=jZ9GUhRmxcPvX7M3SlfejB6Hle9jyHTdk2jVxG7wOHPLODgncEKVdPYBhuz9iWXQ`,
      ie_key: "Zype",
      description: cleanHtml(video.description) ?? undefined,
      timestamp: unifiedTimestamp(video.publishDate) ?? undefined,
      release_date: unifiedStrdate(video.publishDate) ?? undefined,
      episode_number: intOrNone(episode.number) ?? undefined,
      season_number: intOrNone(episode.season) ?? undefined,
      series: tryGet(episode, (x: any) => x.show.title) ?? undefined,
      episode: episode.title ?? undefined,
    };
  }
}

export class AmericasTestKitchenSeasonIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?(?<show>americastestkitchen|(?<cooks>cooks(?:country|illustrated)))\.com(?:(?:/(?<show2>cooks(?:country|illustrated)))?(?:/?$|(?<!ated)(?<!ated\.com)/episodes/browse/season_(?<season>\d+)))`;

  static override get IE_NAME(): string {
    return "americastestkitchen:season";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const seasonRaw = match?.groups?.season;
    const show1 = match?.groups?.show;
    const show2 = match?.groups?.show2;

    const showPath = show2 ? `/${show2}` : "";
    const show = show2 || show1;
    if (!show) {
      throw new ExtractorError("Could not determine show name from URL", { expected: true });
    }

    const seasonNumber = intOrNone(seasonRaw);

    const showMapping: Record<string, [string, string]> = {
      americastestkitchen: ["atk", "America's Test Kitchen"],
      cookscountry: ["cco", "Cook's Country"],
      cooksillustrated: ["cio", "Cook's Illustrated"],
    };

    const mapping = showMapping[show];
    if (!mapping) {
      throw new ExtractorError(`Unsupported show: ${show}`, { expected: true });
    }
    const [slug, title] = mapping;

    const facetFilters: string[] = [
      "search_document_klass:episode",
      `search_show_slug:${slug}`,
    ];

    let playlistId: string;
    let playlistTitle: string;

    if (seasonNumber) {
      playlistId = `season_${seasonNumber}`;
      playlistTitle = `Season ${seasonNumber}`;
      facetFilters.push(`search_season_list:${playlistTitle}`);
    } else {
      playlistId = show;
      playlistTitle = title;
    }

    const seasonSearch = await this.downloadJson<any>(
      `https://y1fnzxui30-dsn.algolia.net/1/indexes/everest_search_${slug}_season_desc_production`,
      playlistId,
      {
        headers: {
          Origin: "https://www.americastestkitchen.com",
          "X-Algolia-API-Key": "8d504d0099ed27c1b73708d22871d805",
          "X-Algolia-Application-Id": "Y1FNZXUI30",
        },
        query: {
          facetFilters: JSON.stringify(facetFilters),
          attributesToRetrieve: `description,search_${slug}_episode_number,search_document_date,search_url,title,search_atk_episode_season`,
          attributesToHighlight: "",
          hitsPerPage: 1000,
        },
      }
    );

    if (!seasonSearch || seasonSearch === false) {
      throw new ExtractorError("Failed to fetch Algolia search index");
    }

    const entries = (seasonSearch.hits ?? []).map((episode: any) => {
      const searchUrl = episode?.search_url;
      if (!searchUrl) {
        return null;
      }
      const rawObjectId = episode?.objectID;
      const objectId = rawObjectId ? rawObjectId.split("_").pop() : null;

      return {
        _type: "url" as const,
        url: `https://www.americastestkitchen.com${showPath}${searchUrl}`,
        id: objectId ?? undefined,
        title: episode?.title ?? undefined,
        description: episode?.description ?? undefined,
        timestamp: unifiedTimestamp(episode?.search_document_date) ?? undefined,
        season_number: seasonNumber ?? undefined,
        episode_number: intOrNone(episode?.[`search_${slug}_episode_number`]) ?? undefined,
        ie_key: "AmericasTestKitchen",
      };
    }).filter((x: any): x is ExtractorInfo => x !== null);

    return this.playlistResult(entries, playlistId, playlistTitle);
  }
}
