// Source: yt_dlp/extractor/berufetv.py

import { floatOrNone, mimetype2ext } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface BerufeMetadataEntry {
  miId?: string;
  titel?: string;
  beschreibung?: string;
  thumbnail?: string;
  kategorie?: string;
  themengebiete?: string[];
}

interface BerufeMetadata {
  metadaten?: BerufeMetadataEntry[];
}

interface BerufeVideoSource {
  source?: string;
  mimeType?: string;
}

interface BerufeVideo {
  videoSources?: { html?: Record<string, BerufeVideoSource[]> };
  videoTracks?: Array<{
    type?: string;
    language?: string;
    source?: string;
    label?: string;
  }>;
  videoMetaData?: { title?: string };
  duration?: unknown;
}

export class BerufeTVIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?web\.arbeitsagentur\.de/berufetv/[^?#]+/film;filmId=(?<id>[\w-]+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);

    const movieMetadata = await this.downloadJson<BerufeMetadata>(
      "https://rest.arbeitsagentur.de/infosysbub/berufetv/pc/v1/film-metadata",
      videoId,
      {
        note: "Downloading JSON metadata",
        headers: { "X-API-Key": "79089773-4892-4386-86e6-e8503669f426" },
        fatal: false,
      },
    );
    const meta = !movieMetadata
      ? {}
      : (movieMetadata.metadaten?.find((item) => item.miId === videoId) ?? {});

    const video = await this.downloadJson<BerufeVideo>(
      `https://d.video-cdn.net/play/player/8YRzUk6pTzmBdrsLe9Y88W/video/${videoId}`,
      videoId,
      { note: "Downloading video JSON" },
    );
    if (video === false) {
      throw new Error("Unable to download BerufeTV video JSON");
    }

    const formats: Array<Record<string, unknown>> = [];
    let subtitles: Record<string, Array<Record<string, unknown>>> = {};
    for (const [key, sources] of Object.entries(
      video.videoSources?.html ?? {},
    )) {
      const source = sources[0];
      if (!source?.source) {
        continue;
      }
      if (key === "auto") {
        const [m3u8Formats, m3u8Subtitles] =
          await this.extractM3u8FormatsAndSubtitles(source.source, videoId);
        formats.push(...m3u8Formats);
        subtitles = m3u8Subtitles as Record<
          string,
          Array<Record<string, unknown>>
        >;
      } else {
        formats.push({
          url: source.source,
          ext: mimetype2ext(source.mimeType),
          format_id: key,
        });
      }
    }

    for (const track of video.videoTracks ?? []) {
      if (track.type !== "SUBTITLES" || !track.language || !track.source) {
        continue;
      }
      let languageSubtitles = subtitles[track.language];
      if (!languageSubtitles) {
        languageSubtitles = [];
        subtitles[track.language] = languageSubtitles;
      }
      languageSubtitles.push({
        url: track.source,
        name: track.label,
        ext: "vtt",
      });
    }

    return {
      id: videoId,
      title: meta.titel ?? video.videoMetaData?.title,
      description: meta.beschreibung,
      thumbnail:
        meta.thumbnail ??
        `https://asset-out-cdn.video-cdn.net/private/videos/${videoId}/thumbnails/active`,
      duration: floatOrNone(video.duration, 1000) ?? undefined,
      categories: meta.kategorie ? [meta.kategorie] : undefined,
      tags: meta.themengebiete,
      subtitles,
      formats,
    };
  }
}
