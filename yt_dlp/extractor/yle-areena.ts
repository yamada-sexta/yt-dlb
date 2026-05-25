// Source: yt_dlp/extractor/yle_areena.py

import { ExtractorError, intOrNone, parseIso8601, smuggleUrl, urlOrNone } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nested(value: unknown, path: readonly string[]): unknown {
  let current = value;
  for (const key of path) {
    current = record(current)[key];
  }
  return current;
}

export class YleAreenaIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://areena\.yle\.fi/(?<podcast>podcastit/)?(?<id>[\d-]+)`;
  static override readonly _GEO_COUNTRIES = ["FI"];

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const videoId = match?.groups?.id;
    if (!videoId) {
      throw new ExtractorError("Unable to extract Yle Areena id", { expected: true });
    }
    const isPodcast = Boolean(match?.groups?.podcast);
    const webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new ExtractorError("Unable to download Yle Areena webpage", { videoId });
    }
    const jsonLd = record(this.searchJsonLd(webpage, videoId, { defaultValue: {} }));
    const response = await this.downloadJson<{ data?: Record<string, unknown> }>(
      `https://player.api.yle.fi/v1/preview/${videoId}.json?app_id=player_static_prod&app_key=8930d72170e48303cf5f3867780d549b`,
      videoId,
      {
        headers: {
          origin: "https://areena.yle.fi",
          referer: "https://areena.yle.fi/",
          "content-type": "application/json",
        },
      },
    ) as { data?: Record<string, unknown> } | false;
    const videoData = response ? record(response.data) : {};

    const episodeMatch = /K(?<season_no>\d+),\s*J(?<episode_no>\d+):?\s*\b(?<episode>[^|]+)\s*\|\s*(?<series>.+)/.exec(stringValue(jsonLd.title) ?? "");
    const description = stringValue(nested(videoData, ["ongoing_ondemand", "description", "fin"]));
    const subtitles: Record<string, Array<Record<string, unknown>>> = {};
    const subtitleItems = Array.isArray(nested(videoData, ["ongoing_ondemand", "subtitles"]))
      ? nested(videoData, ["ongoing_ondemand", "subtitles"]) as unknown[]
      : [];
    for (const subtitle of subtitleItems) {
      const sub = record(subtitle);
      const subUrl = urlOrNone(sub.uri);
      if (!subUrl) {
        continue;
      }
      const lang = stringValue(sub.language) ?? "und";
      subtitles[lang] ??= [];
      subtitles[lang].push({ url: subUrl, ext: "srt", name: sub.kind });
    }

    const info: ExtractorInfo = {};
    let metadata: Record<string, unknown> = {};
    const ondemand = record(videoData.ongoing_ondemand);
    const event = record(videoData.ongoing_event);
    if (isPodcast && urlOrNone(ondemand.media_url)) {
      metadata = ondemand;
      info.url = String(ondemand.media_url);
    } else if (urlOrNone(event.manifest_url)) {
      metadata = event;
      info.live_status = "is_live";
    } else if (urlOrNone(ondemand.manifest_url)) {
      metadata = ondemand;
    } else if (typeof nested(ondemand, ["kaltura", "id"]) === "string") {
      metadata = ondemand;
      const kalturaId = nested(ondemand, ["kaltura", "id"]) as string;
      info._type = "url_transparent";
      info.url = smuggleUrl(`kaltura:1955031:${kalturaId}`, { source_url: url });
      info.ie_key = "Kaltura";
    } else if (Object.keys(record(videoData.gone)).length) {
      this.raiseNoFormats("The content is no longer available", { expected: true, videoId });
    } else {
      throw new ExtractorError("Unable to extract content", { videoId });
    }

    if (!info.url && typeof metadata.manifest_url === "string") {
      const [formats, manifestSubtitles] = await this.extractM3u8FormatsAndSubtitles(metadata.manifest_url, videoId, "mp4", { m3u8Id: "hls" });
      info.formats = formats;
      info.subtitles = this.mergeSubtitles(manifestSubtitles, subtitles);
    } else if (Object.keys(subtitles).length) {
      info.subtitles = subtitles;
    }

    const metaTitle = stringValue(nested(metadata, ["title", "fin"]));
    const metaDescription = stringValue(nested(metadata, ["description", "fin"]));
    return {
      id: videoId,
      title: metaTitle ?? stringValue(episodeMatch?.groups?.episode) ?? stringValue(jsonLd.title) ?? videoId,
      description: metaDescription ?? description ?? undefined,
      series: stringValue(nested(metadata, ["series", "title", "fin"])) ?? stringValue(episodeMatch?.groups?.series) ?? undefined,
      season_number: intOrNone(this.searchRegex(String.raw`Kausi (\d+)`, description ?? "", "season number", { defaultValue: null })) ?? intOrNone(episodeMatch?.groups?.season_no) ?? undefined,
      episode_number: intOrNone(metadata.episode_number) ?? intOrNone(episodeMatch?.groups?.episode_no) ?? undefined,
      age_limit: intOrNone(nested(metadata, ["content_rating", "age_restriction"])) ?? undefined,
      release_timestamp: parseIso8601(stringValue(metadata.start_time)) ?? undefined,
      duration: intOrNone(nested(metadata, ["duration", "duration_in_seconds"])) ?? undefined,
      thumbnails: Array.isArray(jsonLd.thumbnails) ? jsonLd.thumbnails : undefined,
      ...info,
    };
  }
}
