// Source: yt_dlp/extractor/amazonminitv.py

import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import {
  ExtractorError,
  intOrNone,
  traverseObj,
  tryGet,
} from "../utils/index.ts";

export abstract class AmazonMiniTVBaseIE extends InfoExtractor {
  protected static sessionId: string | undefined = undefined;

  protected override async realInitialize(): Promise<void> {
    await this.downloadWebpage(
      "https://www.amazon.in/minitv",
      null,
      { note: "Fetching guest session cookies" }
    );
    AmazonMiniTVBaseIE.sessionId = this.getCookies("https://www.amazon.in").get("session-id");
    if (!AmazonMiniTVBaseIE.sessionId) {
      throw new ExtractorError("Failed to obtain guest session-id cookie");
    }
  }

  protected async callApi(asin: string, options: { data?: any; note?: string } = {}): Promise<any> {
    const device = { clientId: "ATVIN", deviceLocale: "en_GB" };
    const { data, note } = options;

    if (data) {
      data.variables = {
        contentType: "VOD",
        sessionIdToken: AmazonMiniTVBaseIE.sessionId,
        ...device,
        ...data.variables,
      };
    }

    const query = data ? undefined : {
      deviceType: "A1WMMUXPCUJL4N",
      contentId: asin,
      ...device,
    };

    const resp = await this.downloadJson<any>(
      `https://www.amazon.in/minitv/api/web/${data ? "graphql" : "prs"}`,
      asin,
      {
        note,
        headers: {
          "Content-Type": "application/json",
          currentpageurl: "/",
          currentplatform: "dWeb",
        },
        data: data ? JSON.stringify(data) : undefined,
        query: query as any,
      }
    );

    if (!resp || resp === false) {
      throw new ExtractorError("Failed to fetch API response");
    }

    if (resp.errors && resp.errors.length > 0) {
      throw new ExtractorError(`MiniTV said: ${resp.errors[0].message}`);
    } else if (!data) {
      return resp;
    }
    return resp.data?.[data.operationName];
  }
}

export class AmazonMiniTVIE extends AmazonMiniTVBaseIE {
  static override readonly _VALID_URL = String.raw`(?:https?://(?:www\.)?amazon\.in/minitv/tp/|amazonminitv:(?:amzn1\.dv\.gti\.)?)(?<id>[a-f0-9-]+)`;

  static override get IE_NAME(): string {
    return "amazonminitv";
  }

  static readonly _GRAPHQL_QUERY_CONTENT = `
query content($sessionIdToken: String!, $deviceLocale: String, $contentId: ID!, $contentType: ContentType!, $clientId: String) {
  content(
    applicationContextInput: {deviceLocale: $deviceLocale, sessionIdToken: $sessionIdToken, clientId: $clientId}
    contentId: $contentId
    contentType: $contentType
  ) {
    contentId
    name
    ... on Episode {
      contentId
      vodType
      name
      images
      description {
        synopsis
        contentLengthInSeconds
      }
      publicReleaseDateUTC
      audioTracks
      seasonId
      seriesId
      seriesName
      seasonNumber
      episodeNumber
      timecode {
        endCreditsTime
      }
    }
    ... on MovieContent {
      contentId
      vodType
      name
      description {
        synopsis
        contentLengthInSeconds
      }
      images
      publicReleaseDateUTC
      audioTracks
    }
  }
}`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const videoId = match?.groups?.id;
    if (!videoId) {
      throw new ExtractorError("Invalid Amazon MiniTV URL", { expected: true });
    }

    const asin = `amzn1.dv.gti.${videoId}`;
    const prs = await this.callApi(asin, { note: "Downloading playback info" });

    const formats: any[] = [];
    let subtitles: Record<string, any[]> = {};

    const playbackAssets = prs?.playbackAssets ?? {};
    for (const [type_, asset] of Object.entries(playbackAssets)) {
      const assetObj = asset as any;
      const manifestUrl = traverseObj(assetObj, "manifestUrl") as string | null;
      if (!manifestUrl) {
        continue;
      }
      if (type_ === "hls") {
        const [m3u8Fmts, m3u8Subs] = await this.extractM3u8FormatsAndSubtitles(
          manifestUrl,
          asin,
          "mp4",
          { entryProtocol: "m3u8_native", m3u8Id: type_, fatal: false }
        );
        formats.push(...m3u8Fmts);
        subtitles = this.mergeSubtitles(m3u8Subs, subtitles);
      } else if (type_ === "dash") {
        const [mpdFmts, mpdSubs] = await this.extractMpdFormatsAndSubtitles(
          manifestUrl,
          asin,
          { mpdId: type_, fatal: false }
        );
        formats.push(...mpdFmts);
        subtitles = this.mergeSubtitles(mpdSubs, subtitles);
      } else {
        this.reportWarning(`Unknown asset type: ${type_}`);
      }
    }

    const titleInfo = await this.callApi(asin, {
      note: "Downloading title info",
      data: {
        operationName: "content",
        variables: { contentId: asin },
        query: AmazonMiniTVIE._GRAPHQL_QUERY_CONTENT,
      },
    });

    const rawCreditsTime = tryGet(titleInfo, (x: any) => x.timecode.endCreditsTime) as number | null;
    const creditsTime = rawCreditsTime !== null ? rawCreditsTime / 1000 : null;
    const isEpisode = titleInfo?.vodType === "EPISODE";

    const thumbnails = Object.entries(titleInfo?.images ?? {}).map(([type_, thumbUrl]) => ({
      id: type_,
      url: String(thumbUrl),
    }));

    const rawReleaseDate = tryGet(titleInfo, (x: any) => x.publicReleaseDateUTC) as number | null;
    const releaseTimestamp = rawReleaseDate !== null ? Math.trunc(rawReleaseDate / 1000) : null;

    return {
      id: asin,
      title: String(titleInfo?.name ?? ""),
      formats,
      subtitles,
      language: traverseObj(titleInfo, ["audioTracks", 0]) as string | null ?? undefined,
      thumbnails,
      description: traverseObj(titleInfo, ["description", "synopsis"]) as string | null ?? undefined,
      release_timestamp: releaseTimestamp ?? undefined,
      duration: traverseObj(titleInfo, ["description", "contentLengthInSeconds"]) as number | null ?? undefined,
      chapters: creditsTime ? [{ start_time: creditsTime, title: "End Credits" }] : [],
      series: titleInfo?.seriesName ?? undefined,
      series_id: titleInfo?.seriesId ?? undefined,
      season_number: titleInfo?.seasonNumber ?? undefined,
      season_id: titleInfo?.seasonId ?? undefined,
      episode: isEpisode ? String(titleInfo?.name ?? "") : undefined,
      episode_number: titleInfo?.episodeNumber ?? undefined,
      episode_id: isEpisode ? asin : undefined,
    };
  }
}

export class AmazonMiniTVSeasonIE extends AmazonMiniTVBaseIE {
  static override readonly _VALID_URL = String.raw`amazonminitv:season:(?:amzn1\.dv\.gti\.)?(?<id>[a-f0-9-]+)`;

  static override get IE_NAME(): string {
    return "amazonminitv:season";
  }

  static readonly _GRAPHQL_QUERY = `
query getEpisodes($sessionIdToken: String!, $clientId: String, $episodeOrSeasonId: ID!, $deviceLocale: String) {
  getEpisodes(
    applicationContextInput: {sessionIdToken: $sessionIdToken, deviceLocale: $deviceLocale, clientId: $clientId}
    episodeOrSeasonId: $episodeOrSeasonId
  ) {
    episodes {
      ... on Episode {
        contentId
        name
        images
        seriesName
        seasonId
        seriesId
        seasonNumber
        episodeNumber
        description {
          synopsis
          contentLengthInSeconds
        }
        publicReleaseDateUTC
      }
    }
  }
}`;

  protected async *entries(asin: string): AsyncGenerator<ExtractorInfo> {
    const seasonInfo = await this.callApi(asin, {
      note: "Downloading season info",
      data: {
        operationName: "getEpisodes",
        variables: { episodeOrSeasonId: asin },
        query: AmazonMiniTVSeasonIE._GRAPHQL_QUERY,
      },
    });

    const episodes = seasonInfo?.episodes ?? [];
    for (const episode of episodes) {
      if (episode?.contentId) {
        yield this.urlResult(
          `amazonminitv:${episode.contentId}`,
          "AmazonMiniTV",
          episode.contentId
        );
      }
    }
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const seasonId = match?.groups?.id;
    if (!seasonId) {
      throw new ExtractorError("Invalid Amazon MiniTV Season URL", { expected: true });
    }
    const asin = `amzn1.dv.gti.${seasonId}`;
    return this.playlistResult(this.entries(asin), asin);
  }
}

export class AmazonMiniTVSeriesIE extends AmazonMiniTVBaseIE {
  static override readonly _VALID_URL = String.raw`amazonminitv:series:(?:amzn1\.dv\.gti\.)?(?<id>[a-f0-9-]+)`;

  static override get IE_NAME(): string {
    return "amazonminitv:series";
  }

  static readonly _GRAPHQL_QUERY = `
query getSeasons($sessionIdToken: String!, $deviceLocale: String, $episodeOrSeasonOrSeriesId: ID!, $clientId: String) {
  getSeasons(
    applicationContextInput: {deviceLocale: $deviceLocale, sessionIdToken: $sessionIdToken, clientId: $clientId}
    episodeOrSeasonOrSeriesId: $episodeOrSeasonOrSeriesId
  ) {
    seasons {
      seasonId
    }
  }
}`;

  protected async *entries(asin: string): AsyncGenerator<ExtractorInfo> {
    const seasonInfo = await this.callApi(asin, {
      note: "Downloading series info",
      data: {
        operationName: "getSeasons",
        variables: { episodeOrSeasonOrSeriesId: asin },
        query: AmazonMiniTVSeriesIE._GRAPHQL_QUERY,
      },
    });

    const seasons = seasonInfo?.seasons ?? [];
    for (const season of seasons) {
      if (season?.seasonId) {
        yield this.urlResult(
          `amazonminitv:season:${season.seasonId}`,
          "AmazonMiniTVSeason",
          season.seasonId
        );
      }
    }
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const seriesId = match?.groups?.id;
    if (!seriesId) {
      throw new ExtractorError("Invalid Amazon MiniTV Series URL", { expected: true });
    }
    const asin = `amzn1.dv.gti.${seriesId}`;
    return this.playlistResult(this.entries(asin), asin);
  }
}
