// Source: yt_dlp/extractor/yappy.py

import { intOrNone, unifiedTimestamp, urlOrNone } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nested(value: unknown, path: readonly (string | number)[]): unknown {
  let current = value;
  for (const key of path) {
    if (typeof key === "number") {
      current = Array.isArray(current) ? current[key] : undefined;
    } else {
      current = record(current)[key];
    }
  }
  return current;
}

export class YappyIE extends InfoExtractor {
  static override readonly _WORKING = false;
  static override readonly _VALID_URL = String.raw`https?://yappy\.media/video/(?<id>\w+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new Error("Unable to download Yappy webpage");
    }
    const jsonLd = record(this.searchJsonLd(webpage, videoId, { defaultValue: {} }));
    const nextjsData = record(this.searchNextjsData(webpage, videoId, { defaultValue: {} }));
    let mediaData = record(nested(nextjsData, ["props", "pageProps", "data"]));
    mediaData = record(mediaData.OpenGraphParameters) ?? mediaData;
    if (!Object.keys(mediaData).length) {
      const downloaded = await this.downloadJson<Record<string, unknown>>(`https://yappy.media/api/video/${videoId}`, videoId) as Record<string, unknown> | false;
      mediaData = downloaded || {};
    }

    const mediaUrl = urlOrNone(mediaData.link);
    const hasWatermark = Boolean(mediaUrl?.endsWith("-wm.mp4"));
    const formats: Array<Record<string, unknown>> = mediaUrl
      ? [{
        url: mediaUrl,
        ext: "mp4",
        format_note: hasWatermark ? "Watermarked" : undefined,
        preference: hasWatermark ? -10 : undefined,
      }]
      : [];
    if (hasWatermark && mediaUrl) {
      formats.push({ url: mediaUrl.replace("-wm.mp4", ".mp4"), ext: "mp4" });
    }
    const audioLink = urlOrNone(nested(mediaData, ["audio", "link"]));
    if (audioLink) {
      formats.push({ url: audioLink, ext: "mp3", acodec: "mp3", vcodec: "none" });
    }

    const categories = Array.isArray(mediaData.categories)
      ? mediaData.categories.flatMap((item) => {
        const name = stringValue(record(item).name);
        return name ? [name] : [];
      })
      : undefined;

    return {
      id: videoId,
      title: stringValue(jsonLd.description) ?? this.htmlSearchMeta("og:title", webpage) ?? this.htmlExtractTitle(webpage) ?? videoId,
      formats,
      thumbnail: stringValue(mediaData.thumbnail) ?? this.htmlSearchMeta(["og:image", "og:image:secure_url"], webpage) ?? undefined,
      description: stringValue(mediaData.description) ?? stringValue(jsonLd.description) ?? this.htmlSearchMeta(["description", "og:description"], webpage) ?? undefined,
      timestamp: unifiedTimestamp(mediaData.publishedAt ?? jsonLd.timestamp) ?? undefined,
      view_count: intOrNone(mediaData.viewsCount ?? jsonLd.view_count) ?? undefined,
      like_count: intOrNone(mediaData.likesCount) ?? undefined,
      uploader: stringValue(nested(mediaData, ["creator", "firstName"])) ?? undefined,
      uploader_id: stringValue(nested(mediaData, ["creator", "uuid"])) ?? stringValue(nested(mediaData, ["creator", "nickname"])) ?? undefined,
      categories,
      repost_count: intOrNone(mediaData.sharingCount) ?? undefined,
    };
  }
}

export class YappyProfileIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://yappy\.media/profile/(?<id>\w+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const profileId = this.matchId(url);
    const entries: ExtractorInfo[] = [];
    for (let page = 1; page <= 1; page += 1) {
      const videos = await this.downloadJson<Record<string, unknown>>(`https://yappy.media/api/video/list/${profileId}?page=${page}`, profileId, { note: `Downloading profile page ${page} JSON` }) as Record<string, unknown> | false;
      const results = videos && Array.isArray(videos.results) ? videos.results : [];
      for (const item of results) {
        const video = record(item);
        const uuid = stringValue(video.uuid);
        if (uuid) {
          entries.push(this.urlResult(`https://yappy.media/video/${uuid}`, YappyIE, uuid, stringValue(video.description)));
        }
      }
    }
    return this.playlistResult(entries, profileId);
  }
}
