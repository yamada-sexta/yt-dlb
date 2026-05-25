// Source: yt_dlp/extractor/adobetv.py

import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import {
  cleanHtml,
  determineExt,
  floatOrNone,
  intOrNone,
  urlOrNone,
  ISO639Utils,
  traverseObj,
} from "../utils/index.ts";

export class AdobeTVVideoIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://video\.tv\.adobe\.com/v/(?<id>\d+)`;
  static override readonly _EMBED_REGEX = [
    String.raw`<iframe[^>]+src=["'](?<url>(?:https?:)?//video\.tv\.adobe\.com/v/\d+)`,
  ];

  static override get IE_NAME(): string {
    return "adobetv";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new Error("Unable to download webpage");
    }

    const videoData = this.searchJson(
      "var\\s+bridge\\s*=",
      webpage,
      "bridged data",
      videoId
    );

    const formats: any[] = [];
    const sources = traverseObj(videoData, [
      "sources",
      (_k: string | number, v: any) => v?.format !== "playlist" && !!urlOrNone(v?.src),
    ]);

    const sourcesList = Array.isArray(sources) ? sources : sources ? [sources] : [];
    for (const source of sourcesList) {
      const sourceUrl = this.protoRelativeUrl(source.src);
      if (!sourceUrl) {
        continue;
      }

      let fmts: any[] = [];
      if (determineExt(sourceUrl) === "m3u8") {
        fmts = this.extractM3u8Formats(
          sourceUrl,
          videoId,
          "mp4",
          { m3u8Id: "hls" }
        ) as any[];
      } else {
        fmts = [{ url: sourceUrl }];
      }

      for (const fmt of fmts) {
        const durationVal = traverseObj(source, ["duration"]) as number | string | null;
        const filesizeVal = traverseObj(source, ["kilobytes"]) as number | string | null;
        const heightVal = traverseObj(source, ["height"]) as number | string | null;
        const tbrVal = traverseObj(source, ["bitrate"]) as number | string | null;
        const widthVal = traverseObj(source, ["width"]) as number | string | null;

        const formatIdVal = (traverseObj(source, ["format"]) || traverseObj(source, ["label"])) as string | null;

        Object.assign(fmt, {
          duration: durationVal !== null ? floatOrNone(durationVal, 1000) : undefined,
          filesize: filesizeVal !== null ? floatOrNone(filesizeVal, 0.001) : undefined,
          format_id: formatIdVal || undefined,
          height: intOrNone(heightVal),
          tbr: intOrNone(tbrVal),
          width: intOrNone(widthVal),
        });
      }
      formats.push(...fmts);
    }

    const subtitles: Record<string, any[]> = {};
    const translations = traverseObj(videoData, [
      "translations",
      (_k: string | number, v: any) => !!urlOrNone(v?.vttPath),
    ]);
    const translationsList = Array.isArray(translations) ? translations : translations ? [translations] : [];
    for (const translation of translationsList) {
      const vttPath = translation.vttPath;
      const langMedium = translation.language_medium;
      const lang =
        translation.language_w3c ||
        (langMedium ? ISO639Utils.long2short(langMedium) : undefined) ||
        "und";

      const subUrl = this.protoRelativeUrl(vttPath);
      if (subUrl) {
        subtitles[lang] ??= [];
        subtitles[lang].push({
          ext: "vtt",
          url: subUrl,
        });
      }
    }

    const titleVal = traverseObj(videoData, ["title"]) as string | null;
    const descVal = traverseObj(videoData, ["description"]) as string | null;
    const thumbnailVal = traverseObj(videoData, ["video", "poster"]) as string | null;

    return {
      id: videoId,
      formats,
      subtitles,
      title: titleVal ? cleanHtml(titleVal) || "" : "",
      description: descVal ? cleanHtml(descVal) || undefined : undefined,
      thumbnail: (thumbnailVal ? this.protoRelativeUrl(thumbnailVal) : undefined) || undefined,
    };
  }
}
