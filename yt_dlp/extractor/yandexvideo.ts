// Source: yt_dlp/extractor/yandexvideo.py

import {
  bugReportsMessage,
  determineExt,
  intOrNone,
  parseQs,
  qualities,
  updateUrlQuery,
  urlOrNone,
} from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nested(value: unknown, path: readonly (string | number)[]): unknown {
  let current = value;
  for (const key of path) {
    current =
      typeof key === "number"
        ? Array.isArray(current)
          ? current[key]
          : undefined
        : record(current)[key];
  }
  return current;
}

function collectStrings(value: unknown, key: string): string[] {
  const out: string[] = [];
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) {
      for (const child of item) {
        visit(child);
      }
      return;
    }
    const itemRecord = record(item);
    for (const [childKey, childValue] of Object.entries(itemRecord)) {
      if (childKey === key && typeof childValue === "string") {
        out.push(childValue);
      } else {
        visit(childValue);
      }
    }
  };
  visit(value);
  return out;
}

export class YandexVideoIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:yandex\.ru(?:/(?:portal/(?:video|efir)|efir))?/?\?.*?stream_id=|frontend\.vh\.yandex\.ru/player/)(?<id>(?:[\da-f]{32}|[\w-]{12}))`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const graphql = (await this.downloadJson<Record<string, unknown>>(
      "https://frontend.vh.yandex.ru/graphql",
      videoId,
      {
        data: `{
  player(content_id: "${videoId}") {
    computed_title content_url description dislikes duration likes program_title release_date
    release_date_ut release_year restriction_age season start_time streams thumbnail title views_count
  }
}`,
        fatal: false,
      },
    )) as Record<string, unknown> | false | null;
    let player = record(nested(graphql || {}, ["player", "content"]));
    if (!Object.keys(player).length || player.error) {
      const response = (await this.downloadJson<{
        content?: Record<string, unknown>;
      }>(`https://frontend.vh.yandex.ru/v23/player/${videoId}.json`, videoId, {
        query: { stream_options: "hires", disable_trackings: 1 },
      })) as { content?: Record<string, unknown> } | false;
      player = response ? record(response.content) : {};
    }

    const title =
      stringValue(player.title) ??
      stringValue(player.computed_title) ??
      videoId;
    const formats: Array<Record<string, unknown>> = [];
    const streams = Array.isArray(player.streams) ? [...player.streams] : [];
    streams.push({ url: player.content_url });
    for (const stream of streams) {
      const contentUrl = urlOrNone(record(stream).url);
      if (!contentUrl) {
        continue;
      }
      const ext = determineExt(contentUrl);
      if (ext === "ismc") {
        continue;
      }
      if (ext === "m3u8") {
        formats.push(
          ...this.extractM3u8Formats(contentUrl, videoId, "mp4", {
            entryProtocol: "m3u8_native",
            m3u8Id: "hls",
          }),
        );
      } else if (ext === "mpd") {
        formats.push(
          ...this.extractMpdFormats(contentUrl, videoId, {
            mpdId: "dash",
            fatal: false,
          }),
        );
      } else {
        formats.push({ url: contentUrl });
      }
    }

    const timestamp =
      intOrNone(player.release_date) ??
      intOrNone(player.release_date_ut) ??
      intOrNone(player.start_time);
    const season = record(player.season);
    return {
      id: videoId,
      title,
      description: player.description,
      thumbnail: player.thumbnail,
      timestamp: timestamp ?? undefined,
      duration: intOrNone(player.duration) ?? undefined,
      series: player.program_title,
      age_limit: intOrNone(player.restriction_age) ?? undefined,
      view_count: intOrNone(player.views_count) ?? undefined,
      like_count: intOrNone(player.likes) ?? undefined,
      dislike_count: intOrNone(player.dislikes) ?? undefined,
      season_number: intOrNone(season.season_number) ?? undefined,
      season_id: season.id,
      release_year: intOrNone(player.release_year) ?? undefined,
      formats,
    };
  }
}

export class YandexVideoPreviewIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?yandex\.\w{2,3}(?:\.(?:am|ge|il|tr))?/video/preview(?:/?\?.*?filmId=|/)(?<id>\d+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new Error("Unable to download Yandex video preview webpage");
    }
    const dataRaw = this.searchRegex(
      String.raw`window\.Ya\.__inline_params__\s*=\s*JSON\.parse\('([^"]+?\\u0022video\\u0022:[^"]+?})'\);`,
      webpage,
      "data_raw",
    );
    const data =
      typeof dataRaw === "string"
        ? (this.parseJson<Record<string, unknown>>(dataRaw, videoId, {
            transform_source: lowercaseEscape,
          }) ?? {})
        : {};
    const videoUrl = stringValue(nested(data, ["video", "url"]));
    if (!videoUrl) {
      throw new Error("Unable to extract preview video URL");
    }
    return this.urlResult(videoUrl);
  }
}

abstract class ZenYandexBaseIE extends InfoExtractor {
  protected async fetchSsrData(
    url: string,
    videoId: string,
  ): Promise<[string, Record<string, unknown>]> {
    let webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new Error("Unable to download Dzen webpage");
    }
    const redirect = stringValue(
      record(
        this.searchJson<Record<string, unknown>>(
          String.raw`(?:var|let|const)\s+it\s*=`,
          webpage,
          "redirect",
          videoId,
          { defaultValue: {} },
        ),
      ).retpath,
    );
    if (redirect) {
      videoId = this.matchId(redirect);
      webpage = await this.downloadWebpage(redirect, videoId, {
        note: "Redirecting",
      });
      if (webpage === false) {
        throw new Error("Unable to download redirected Dzen webpage");
      }
    }
    const metadata =
      this.searchJson<Record<string, unknown>>(
        String.raw`(?:var|let|const)\s+_params\s*=\s*\(`,
        webpage,
        "metadata",
        videoId,
        { containsPattern: String.raw`\{["']ssrData[\s\S]+?\}` },
      ) ?? {};
    return [videoId, record(metadata.ssrData)];
  }
}

export class ZenYandexIE extends ZenYandexBaseIE {
  static override readonly _VALID_URL =
    String.raw`https?://(?:zen\.yandex|dzen)\.ru(?:/video)?/(?:media|watch)/(?:(?:id/[^/]+/|[^/]+/)(?:[a-z0-9-]+)-)?(?<id>[a-z0-9-]+)`;

  static override get IE_NAME(): string {
    return "dzen.ru";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    let videoId = this.matchId(url);
    const result = await this.fetchSsrData(url, videoId);
    videoId = result[0];
    const videoData = record(result[1].videoMetaResponse);

    const formats: Array<Record<string, unknown>> = [];
    let subtitles: Record<string, unknown[]> = {};
    const quality = qualities(["4", "0", "1", "2", "3", "5", "6", "7"]);
    const streamUrls = new Set<string>(
      [
        ...collectStrings(nested(videoData, ["video", "id"]), "url"),
        ...collectStrings(nested(videoData, ["video", "streams"]), "url"),
        ...collectStrings(nested(videoData, ["video", "mp4Streams"]), "url"),
        ...collectStrings(
          nested(videoData, ["video", "oneVideoStreams"]),
          "url",
        ),
      ].flatMap((item) => {
        const valid = urlOrNone(item);
        return valid ? [updateUrlQuery(valid, { dzen_dash: [] })] : [];
      }),
    );
    for (const streamUrl of streamUrls) {
      const ext = determineExt(streamUrl);
      const contentType = parseQs(streamUrl).ct?.[0];
      if (ext === "mpd" || contentType === "6") {
        const [fmts, subs] = await this.extractMpdFormatsAndSubtitles(
          streamUrl,
          videoId,
          { mpdId: "dash", fatal: false },
        );
        formats.push(...fmts);
        subtitles = this.mergeSubtitles(subs, subtitles);
      } else if (ext === "m3u8" || contentType === "8") {
        const [fmts, subs] = await this.extractM3u8FormatsAndSubtitles(
          streamUrl,
          videoId,
          "mp4",
          { m3u8Id: "hls", fatal: false },
        );
        formats.push(...fmts);
        subtitles = this.mergeSubtitles(subs, subtitles);
      } else if (contentType === "0") {
        const formatType = parseQs(streamUrl).type?.[0];
        formats.push({
          url: streamUrl,
          format_id: formatType,
          ext: "mp4",
          quality: quality(formatType),
        });
      } else {
        this.reportWarning(
          `Unsupported stream URL: ${streamUrl}${bugReportsMessage()}`,
        );
      }
    }

    return {
      id: videoId,
      formats,
      subtitles,
      title: stringValue(videoData.title) ?? videoId,
      description: stringValue(videoData.description) ?? undefined,
      thumbnail: urlOrNone(videoData.image) ?? undefined,
      duration:
        intOrNone(nested(videoData, ["video", "duration"])) ?? undefined,
      view_count: intOrNone(nested(videoData, ["video", "views"])) ?? undefined,
      timestamp: intOrNone(videoData.publicationDate) ?? undefined,
      tags: Array.isArray(videoData.tags)
        ? videoData.tags.filter(
            (item): item is string => typeof item === "string",
          )
        : undefined,
      uploader:
        stringValue(nested(videoData, ["source", "title"])) ?? undefined,
    };
  }
}

export class ZenYandexChannelIE extends ZenYandexBaseIE {
  static override readonly _VALID_URL =
    String.raw`https?://(?:zen\.yandex|dzen)\.ru/(?!media|video)(?:id/)?(?<id>[a-z0-9-_]+)`;

  static override get IE_NAME(): string {
    return "dzen.ru:channel";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    let channelId = this.matchId(url);
    const result = await this.fetchSsrData(url, channelId);
    channelId = result[0];
    const channelData = record(result[1].exportResponse);
    const feedData = record(channelData.feedData);
    const entries: ExtractorInfo[] = [];
    const items = [
      ...(Array.isArray(feedData.items) ? feedData.items : []),
      ...collectStrings(feedData, "link").map((link) => ({ link })),
    ];
    for (const item of items) {
      const itemRecord = record(item);
      const link = urlOrNone(itemRecord.link);
      if (link) {
        entries.push(
          this.urlResult(
            link,
            ZenYandexIE,
            stringValue(itemRecord.id),
            stringValue(itemRecord.title),
          ),
        );
      }
    }
    return this.playlistResult(
      entries,
      channelId,
      stringValue(nested(channelData, ["channel", "source", "title"])),
      stringValue(nested(channelData, ["channel", "source", "description"])),
    );
  }
}

function lowercaseEscape(source: string): string {
  return source.replaceAll(
    /\\u([0-9A-Fa-f]{4})/g,
    (_match, hex: string) => `\\u${hex.toLowerCase()}`,
  );
}
