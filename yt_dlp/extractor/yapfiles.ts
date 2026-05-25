// Source: yt_dlp/extractor/yapfiles.py

import {
  ExtractorError,
  intOrNone,
  qualities,
  urlOrNone,
} from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

type YapPlayerResponse = {
  player?: {
    playlist?: string;
    title?: string;
    poster?: string;
    hd?: unknown;
    length?: unknown;
    main?: Record<string, unknown>;
  };
};

export class YapFilesIE extends InfoExtractor {
  static override readonly _WORKING = false;
  static readonly _YAPFILES_URL =
    String.raw`//(?:(?:www|api)\.)?yapfiles\.ru/get_player/*\?.*?\bv=(?<id>\w+)`;
  static override readonly _VALID_URL =
    String.raw`https?:${YapFilesIE._YAPFILES_URL}`;
  static override readonly _EMBED_REGEX = [
    String.raw`<iframe\b[^>]+\bsrc=(["'])(?<url>(?:https?:)?${YapFilesIE._YAPFILES_URL}.*?)\1`,
  ];

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, videoId, { fatal: false });

    let playerUrl: string | null = null;
    let query: Record<string, string> = {};
    if (webpage) {
      playerUrl = this.searchRegex(
        String.raw`player\.init\s*\(\s*(["'])(?<url>(?:(?!\1).)+)\1`,
        webpage,
        "player url",
        { defaultValue: null, group: "url" },
      ) as string | null;
    }
    if (!playerUrl) {
      playerUrl = `http://api.yapfiles.ru/load/${videoId}/`;
      query = {
        md5: "ded5f369be61b8ae5f88e2eeb2f3caff",
        type: "json",
        ref: url,
      };
    }

    const playerData = (await this.downloadJson<YapPlayerResponse>(
      playerUrl,
      videoId,
      { query },
    )) as YapPlayerResponse | false;
    const player = playerData ? playerData.player : null;
    if (!player?.playlist || !player.title) {
      throw new ExtractorError("Unable to extract YapFiles player metadata", {
        videoId,
      });
    }
    if (
      player.title === "Ролик удален" ||
      String(player.poster ?? "").includes("deleted.jpg")
    ) {
      throw new ExtractorError(`Video ${videoId} has been removed`, {
        expected: true,
        videoId,
      });
    }

    const playlistData = (await this.downloadJson<YapPlayerResponse>(
      player.playlist,
      videoId,
    )) as YapPlayerResponse | false;
    const playlist = playlistData ? (playlistData.player?.main ?? {}) : {};
    const hdHeight = intOrNone(player.hd);
    const quality = qualities(["sd", "hd"]);
    const formats = ["sd", "hd"].flatMap((formatId) => {
      const urlKey = formatId === "hd" ? "file_hd" : "file";
      const formatUrl = urlOrNone(playlist[urlKey]);
      return formatUrl
        ? [
            {
              url: formatUrl,
              format_id: formatId,
              quality: quality(formatId),
              height: formatId === "hd" ? hdHeight : null,
            },
          ]
        : [];
    });

    return {
      id: videoId,
      title: player.title,
      thumbnail: typeof player.poster === "string" ? player.poster : undefined,
      duration: intOrNone(player.length) ?? undefined,
      formats,
    };
  }
}
