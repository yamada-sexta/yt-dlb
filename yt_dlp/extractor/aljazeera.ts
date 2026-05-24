// Source: yt_dlp/extractor/aljazeera.py

import { tryGet } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface AlJazeeraVideo {
  id?: string;
  accountId?: string;
  playerId?: string;
}

export class AlJazeeraIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?<base>\w+\.aljazeera\.\w+)/(?<type>programs?/[^/]+|(?:feature|video|new)s)?/\d{4}/\d{1,2}/\d{1,2}/(?<id>[^/?&#]+)`;
  static readonly BRIGHTCOVE_URL_RE = /https?:\/\/players\.brightcove\.net\/(?<account>\d+)\/(?<playerId>[a-zA-Z0-9]+)_(?<embed>[^/]+)\/index\.html\?videoId=(?<id>\d+)/;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const base = match?.groups?.base;
    const rawPostType = match?.groups?.type;
    const displayId = match?.groups?.id;
    if (!base || !rawPostType || !displayId) {
      throw new Error("Unable to extract Al Jazeera article id");
    }

    const wp = ({
      "balkans.aljazeera.net": "ajb",
      "chinese.aljazeera.net": "chinese",
      "mubasher.aljazeera.net": "ajm",
    } as Record<string, string>)[base] ?? "aje";
    const postType = ({
      features: "post",
      feature: "post",
      program: "episode",
      programs: "episode",
      videos: "video",
      video: "video",
      news: "news",
      new: "news",
    } as Record<string, string>)[rawPostType.split("/")[0] ?? ""];
    if (!postType) {
      throw new Error(`Unsupported Al Jazeera post type: ${rawPostType}`);
    }

    const apiData = await this.downloadJson<Record<string, unknown>>(`https://${base}/graphql`, displayId, {
      query: {
        "wp-site": wp,
        operationName: "ArchipelagoSingleArticleQuery",
        variables: JSON.stringify({ name: displayId, postType }),
      },
      headers: { "wp-site": wp },
    });
    const video = tryGet(apiData, (value) => (
      value as { data?: { article?: { video?: AlJazeeraVideo } } }
    ).data?.article?.video) ?? {};

    let videoId = video.id ?? null;
    let account = video.accountId ?? "911432371001";
    let playerId = video.playerId ?? "csvTfAlKW";
    let embed = "default";

    if (!videoId) {
      const webpage = await this.downloadWebpage(url, displayId);
      if (webpage === false) {
        throw new Error("Unable to download Al Jazeera article page");
      }
      const brightcove = AlJazeeraIE.BRIGHTCOVE_URL_RE.exec(webpage);
      account = brightcove?.groups?.account ?? account;
      playerId = brightcove?.groups?.playerId ?? playerId;
      embed = brightcove?.groups?.embed ?? embed;
      videoId = brightcove?.groups?.id ?? null;
      if (!videoId) {
        return this.urlResult(url, "Generic", null, null, { url_transparent: true });
      }
    }

    return this.urlResult(
      `https://players.brightcove.net/${account}/${playerId}_${embed}/index.html?videoId=${videoId}`,
      "BrightcoveNew",
      null,
      null,
      { url_transparent: true },
    );
  }
}
