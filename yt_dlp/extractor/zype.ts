// Source: yt_dlp/extractor/zype.py

import { dictGet, ExtractorError, intOrNone, jsToJson, parseIso8601 } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface ZypeOutput {
  name?: string;
  url?: string;
  bitrate?: unknown;
  height?: unknown;
  width?: unknown;
}

interface ZypeVideo {
  title: string;
  friendly_title?: string;
  thumbnails?: Array<{ url?: string; width?: unknown; height?: unknown }>;
  description?: string;
  ott_description?: string;
  short_description?: string;
  published_at?: string;
  duration?: unknown;
  request_count?: unknown;
  rating?: unknown;
  season?: unknown;
  episode?: unknown;
}

export class ZypeIE extends InfoExtractor {
  private static readonly ID_RE = String.raw`[\da-fA-F]+`;
  private static readonly COMMON_RE = String.raw`//player\.zype\.com/embed/${ZypeIE.ID_RE}\.(?:js|json|html)\?.*?(?:access_token|(?:ap[ip]|player)_key)=`;
  static override readonly _VALID_URL = String.raw`https?://player\.zype\.com/embed/(?<id>${ZypeIE.ID_RE})\.(?:js|json|html)\?.*?(?:access_token|(?:ap[ip]|player)_key)=[^&]+`;
  static override readonly _EMBED_REGEX = [String.raw`<script[^>]+\bsrc=(["'])(?<url>(?:https?:)?${ZypeIE.COMMON_RE}.+?)\1`];

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const jsonUrl = url.replace(/\.(?:js|html)\?/, ".json?");
    const responseJson = await this.downloadJson<{ response?: { body?: unknown; video?: ZypeVideo } }>(jsonUrl, videoId);
    const response = responseJson ? responseJson.response : null;
    const body = response?.body;
    const video = response?.video;
    if (!video || body === undefined) {
      throw new ExtractorError("Unable to extract Zype response", { videoId });
    }

    let formats: Array<Record<string, unknown>> = [];
    let subtitles: Record<string, unknown[]> = {};
    let textTracks: unknown = null;
    if (body && typeof body === "object" && !Array.isArray(body)) {
      const bodyRecord = body as { outputs?: ZypeOutput[]; subtitles?: unknown };
      for (const output of bodyRecord.outputs ?? []) {
        if (!output.url) {
          continue;
        }
        if (output.name === "m3u8") {
          [formats, subtitles] = await this.extractM3u8FormatsAndSubtitles(output.url, videoId, "mp4", { entryProtocol: "m3u8_native", m3u8Id: "hls", fatal: false });
        } else {
          formats.push({
            format_id: output.name,
            tbr: intOrNone(output.bitrate) ?? undefined,
            url: output.url,
            ...(output.name === "m4a" || output.name === "mp3"
              ? { vcodec: "none" }
              : { height: intOrNone(output.height) ?? undefined, width: intOrNone(output.width) ?? undefined }),
          });
        }
      }
      textTracks = bodyRecord.subtitles;
    } else if (typeof body === "string") {
      let m3u8Url = this.searchRegex(/(["'])(?<url>(?:(?!\1).)+\.m3u8(?:(?!\1).)*)\1/, body, "m3u8 url", { group: "url", defaultValue: null }) as string | null;
      if (!m3u8Url) {
        const source = this.searchRegex(/sources\s*:\s*\[\s*({[\s\S]+?})\s*\]/, body, "source") as string;
        const integration = this.searchRegex(/\bintegration\s*:\s*(['"])(?<val>(?:(?!\1).)+)\1/, source, "integration", { group: "val" }) as string;
        const id = this.searchRegex(/\bid\s*:\s*(['"])(?<val>(?:(?!\1).)+)\1/, source, "id", { group: "val" }) as string;
        if (integration === "verizon-media") {
          m3u8Url = `https://content.uplynk.com/${id}.m3u8`;
        }
      }
      if (!m3u8Url) {
        throw new ExtractorError("Unable to extract m3u8 URL", { videoId });
      }
      [formats, subtitles] = await this.extractM3u8FormatsAndSubtitles(m3u8Url, videoId, "mp4", { entryProtocol: "m3u8_native", m3u8Id: "hls" });
      const textTracksSource = this.searchRegex(/textTracks\s*:\s*(\[[^\]]+\])/, body, "text tracks", { defaultValue: null }) as string | null;
      if (textTracksSource) {
        textTracks = this.parseJson(textTracksSource, videoId, { transform_source: jsToJson, fatal: false });
      }
    }

    if (Array.isArray(textTracks)) {
      for (const track of textTracks) {
        if (!track || typeof track !== "object") {
          continue;
        }
        const record = track as Record<string, unknown>;
        const trackUrl = dictGet(record as Record<string, string>, ["file", "src"]);
        if (!trackUrl) {
          continue;
        }
        const label = typeof record.label === "string" ? record.label : "English";
        subtitles[label] ??= [];
        subtitles[label]!.push({ url: trackUrl });
      }
    }

    return {
      id: videoId,
      display_id: video.friendly_title,
      title: video.title,
      thumbnails: (video.thumbnails ?? []).flatMap((thumbnail) => thumbnail.url ? [{
        url: thumbnail.url,
        width: intOrNone(thumbnail.width) ?? undefined,
        height: intOrNone(thumbnail.height) ?? undefined,
      }] : []),
      description: video.description ?? video.ott_description ?? video.short_description,
      timestamp: parseIso8601(video.published_at) ?? undefined,
      duration: intOrNone(video.duration) ?? undefined,
      view_count: intOrNone(video.request_count) ?? undefined,
      average_rating: intOrNone(video.rating) ?? undefined,
      season_number: intOrNone(video.season) ?? undefined,
      episode_number: intOrNone(video.episode) ?? undefined,
      formats,
      subtitles,
    };
  }
}
