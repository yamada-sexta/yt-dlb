// Source: yt_dlp/extractor/amadeustv.py

import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import {
  ExtractorError,
  floatOrNone,
  intOrNone,
  parseIso8601,
  urlOrNone,
  traverseObj,
} from "../utils/index.ts";

export class AmadeusTVIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?amadeus\.tv/library/(?<id>[\da-f]+)`;

  static override get IE_NAME(): string {
    return "amadeustv";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const displayId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, displayId);
    if (webpage === false) {
      throw new ExtractorError("Unable to download webpage");
    }

    const nuxtData = this._search_nuxt_data<any>(
      webpage,
      displayId,
      "__NUXT__",
      {
        traverse: ["fetch", "0"],
      },
    );

    const videoId = traverseObj(nuxtData, ["item", "video"]) as string | null;
    if (!videoId) {
      throw new ExtractorError("Unable to extract actual video ID");
    }

    const videoData = await this.downloadJson(
      `http://playvideo.qcloud.com/getplayinfo/v2/1253584441/${videoId}`,
      videoId,
      {
        headers: { Referer: "http://www.amadeus.tv/" },
      },
    );

    const formats: any[] = [];
    const videos = traverseObj(videoData, [
      "videoInfo",
      ["sourceVideo", "transcodeList"],
    ]) as any;
    const videosList = Array.isArray(videos) ? videos : videos ? [videos] : [];
    for (const video of videosList) {
      const videoUrl = urlOrNone(video?.url);
      if (!videoUrl) {
        continue;
      }

      const formatIdVal = traverseObj(video, ["definition"]) as
        | string
        | number
        | null;
      const widthVal = traverseObj(video, ["width"]) as string | number | null;
      const heightVal = traverseObj(video, ["height"]) as
        | string
        | number
        | null;
      const filesizeVal = (traverseObj(video, ["totalSize"]) ??
        traverseObj(video, ["size"])) as string | number | null;
      const vcodecVal = traverseObj(video, ["videoStreamList", 0, "codec"]) as
        | string
        | null;
      const acodecVal = traverseObj(video, ["audioStreamList", 0, "codec"]) as
        | string
        | null;
      const fpsVal = traverseObj(video, ["videoStreamList", 0, "fps"]) as
        | string
        | number
        | null;

      formats.push({
        url: videoUrl,
        format_id: formatIdVal !== null ? `http-${formatIdVal}` : "http-0",
        width: intOrNone(widthVal),
        height: intOrNone(heightVal),
        filesize: intOrNone(filesizeVal),
        vcodec: vcodecVal ?? undefined,
        acodec: acodecVal ?? undefined,
        fps: fpsVal !== null ? floatOrNone(fpsVal) : undefined,
        http_headers: { Referer: "http://www.amadeus.tv/" },
      });
    }

    const basicTitle = traverseObj(videoData, [
      "videoInfo",
      "basicInfo",
      "name",
    ]) as string | null;
    const basicThumbnail = traverseObj(videoData, ["coverInfo", "coverUrl"]) as
      | string
      | null;
    const basicDuration = (traverseObj(videoData, [
      "videoInfo",
      "sourceVideo",
      "floatDuration",
    ]) ?? traverseObj(videoData, ["videoInfo", "sourceVideo", "duration"])) as
      | string
      | number
      | null;

    const nuxtItem = traverseObj(nuxtData, ["item"]) || {};
    const nuxtTitle = (traverseObj(nuxtItem, ["title"]) ??
      traverseObj(nuxtItem, ["title_en"]) ??
      traverseObj(nuxtItem, ["title_cn"])) as string | null;
    const nuxtDesc = (traverseObj(nuxtItem, ["description"]) ??
      traverseObj(nuxtItem, ["description_en"]) ??
      traverseObj(nuxtItem, ["description_cn"])) as string | null;
    const nuxtDate = traverseObj(nuxtItem, ["date"]) as string | null;
    const nuxtView = traverseObj(nuxtItem, ["view"]) as string | number | null;

    return {
      id: videoId,
      display_id: displayId,
      formats,
      title: basicTitle ?? nuxtTitle ?? "",
      thumbnail: basicThumbnail
        ? urlOrNone(basicThumbnail) || undefined
        : undefined,
      duration: basicDuration !== null ? floatOrNone(basicDuration) : undefined,
      description: nuxtDesc || undefined,
      timestamp: nuxtDate ? (parseIso8601(nuxtDate) ?? undefined) : undefined,
      view_count: nuxtView !== null ? intOrNone(nuxtView) : undefined,
    };
  }
}
