// Source: yt_dlp/extractor/baidu.py

import { unescapeHTML } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface BaiduPlaylistDetail {
  title?: string;
  intro?: string;
}

interface BaiduEpisodesDetail {
  videos?: Array<{ url?: string; title?: string }>;
}

export class BaiduVideoIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://v\.baidu\.com/(?<type>[a-z]+)/(?<id>\d+)\.htm`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    let category = match?.groups?.type;
    const playlistId = match?.groups?.id;
    if (!category || !playlistId) {
      throw new Error("Unable to extract Baidu playlist id");
    }
    if (category === "show") {
      category = "tvshow";
    }
    if (category === "tv") {
      category = "tvplay";
    }

    const playlistDetail = await this.callApi<BaiduPlaylistDetail>("xqinfo", category, playlistId, "Download playlist JSON metadata");
    const episodesDetail = await this.callApi<BaiduEpisodesDetail>("xqsingle", category, playlistId, "Download episodes JSON metadata");
    const entries = (episodesDetail.videos ?? [])
      .filter((episode) => episode.url)
      .map((episode) => this.urlResult(episode.url!, null, null, episode.title ?? null));

    return this.playlistResult(
      entries,
      playlistId,
      playlistDetail.title ?? null,
      unescapeHTML(playlistDetail.intro) ?? null,
    );
  }

  private async callApi<T>(path: string, category: string, playlistId: string, note: string): Promise<T> {
    const data = await this.downloadJson<T>(
      `http://app.video.baidu.com/${path}/?worktype=adnative${category}&id=${encodeURIComponent(playlistId)}`,
      playlistId,
      { note },
    );
    if (data === false) {
      throw new Error(`Unable to download Baidu ${path} metadata`);
    }
    return data;
  }
}
