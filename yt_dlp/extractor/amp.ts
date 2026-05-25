// Source: yt_dlp/extractor/amp.py

import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import {
  determineExt,
  intOrNone,
  mimetype2ext,
  parseIso8601,
  stripJsonp,
  unifiedTimestamp,
  urlOrNone,
  ExtractorError,
  traverseObj,
} from "../utils/index.ts";

export class AMPIE extends InfoExtractor {
  // parse Akamai Adaptive Media Player feed
  protected async extractFeedInfo(url: string): Promise<ExtractorInfo> {
    const feed = await this.downloadJson<any>(
      url,
      "feed",
      {
        note: "Downloading Akamai AMP feed",
        errnote: "Unable to download Akamai AMP feed",
        transform_source: stripJsonp,
      }
    );

    const item = traverseObj(feed, "channel", "item") as Record<string, any> | undefined;
    if (!item) {
      throw new ExtractorError(`${this.constructor.name} said: ${feed?.error ?? "Unknown error"}`);
    }

    const videoId = String(item.guid);

    const getMediaNode = (name: string, defaultValue: any = null): any => {
      const mediaName = `media-${name}`;
      const mediaGroup = item["media-group"] || item;
      return mediaGroup[mediaName] || item[mediaName] || item[name] || defaultValue;
    };

    const thumbnails: Array<{ url: string; width?: number; height?: number }> = [];
    let mediaThumbnail = getMediaNode("thumbnail");
    if (mediaThumbnail) {
      if (!Array.isArray(mediaThumbnail)) {
        mediaThumbnail = [mediaThumbnail];
      }
      for (const thumbnailData of mediaThumbnail) {
        const thumbnail = thumbnailData["@attributes"] || {};
        const thumbnailUrl = urlOrNone(thumbnail.url);
        if (!thumbnailUrl) {
          continue;
        }
        const protoUrl = this.protoRelativeUrl(thumbnailUrl, "http:");
        if (protoUrl) {
          thumbnails.push({
            url: protoUrl,
            width: intOrNone(thumbnail.width) ?? undefined,
            height: intOrNone(thumbnail.height) ?? undefined,
          });
        }
      }
    }

    const subtitles: Record<string, Array<{ url: string; ext: string }>> = {};
    let mediaSubtitle = getMediaNode("subTitle");
    if (mediaSubtitle) {
      if (!Array.isArray(mediaSubtitle)) {
        mediaSubtitle = [mediaSubtitle];
      }
      for (const subtitleData of mediaSubtitle) {
        const subtitle = subtitleData["@attributes"] || {};
        const subtitleHref = urlOrNone(subtitle.href);
        if (!subtitleHref) {
          continue;
        }
        const lang = subtitle.lang || "en";
        subtitles[lang] ??= [];
        subtitles[lang].push({
          url: subtitleHref,
          ext: mimetype2ext(subtitle.type) || determineExt(subtitleHref),
        });
      }
    }

    const formats: Array<Record<string, any>> = [];
    let mediaContent = getMediaNode("content");
    if (mediaContent) {
      if (!Array.isArray(mediaContent)) {
        mediaContent = [mediaContent];
      }
      for (const mediaData of mediaContent) {
        const media = mediaData["@attributes"] || {};
        const mediaUrl = urlOrNone(media.url);
        if (!mediaUrl) {
          continue;
        }
        const ext = mimetype2ext(media.type) || determineExt(mediaUrl);
        if (ext === "f4m") {
          formats.push(...this.extractF4mFormats(
            mediaUrl + "?hdcore=3.4.0&plugin=aasp-3.4.0.132.124",
            videoId,
            { f4mId: "hds", fatal: false }
          ));
        } else if (ext === "m3u8") {
          const [fmts, subs] = await this.extractM3u8FormatsAndSubtitles(
            mediaUrl,
            videoId,
            "mp4",
            { m3u8Id: "hls" }
          );
          formats.push(...fmts);
          this.mergeSubtitles(subs, subtitles);
        } else {
          formats.push({
            format_id: mediaData["media-category"]?.["@attributes"]?.label ?? undefined,
            url: mediaUrl,
            tbr: intOrNone(media.bitrate) ?? undefined,
            filesize: intOrNone(media.fileSize) ?? undefined,
            ext,
          });
        }
      }
    }

    const timestamp = unifiedTimestamp(item.pubDate) || parseIso8601(item["dc-date"]);

    return {
      id: videoId,
      title: String(getMediaNode("title") || ""),
      description: getMediaNode("description") ? String(getMediaNode("description")) : undefined,
      thumbnails,
      timestamp: timestamp ?? undefined,
      duration: intOrNone(mediaContent?.[0]?.["@attributes"]?.duration) ?? undefined,
      subtitles,
      formats,
    };
  }
}
