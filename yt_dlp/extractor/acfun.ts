// Source: yt_dlp/extractor/acfun.py

import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import {
  ExtractorError,
  floatOrNone,
  formatField,
  intOrNone,
  parseCodecs,
  parseQs,
  strOrNone,
  traverseObj,
  Ellipsis,
} from "../utils/index.ts";

export abstract class AcFunVideoBaseIE extends InfoExtractor {
  protected async extractMetadata(videoId: string, videoInfo: any): Promise<any> {
    const playjson = this.parseJson(videoInfo.ksPlayJson, videoId) as any;

    const formats: any[] = [];
    const subtitles: Record<string, any[]> = {};

    const representations = traverseObj(playjson, ["adaptationSet", 0, "representation"]) as any[];
    const reps = Array.isArray(representations) ? representations : representations ? [representations] : [];

    for (const video of reps) {
      if (!video?.url) {
        continue;
      }
      const [fmts, subs] = await this.extractM3u8FormatsAndSubtitles(
        video.url,
        videoId,
        "mp4",
        { fatal: false }
      );
      formats.push(...fmts);
      this.mergeSubtitles(subs, subtitles);
      for (const f of fmts) {
        Object.assign(f, {
          fps: floatOrNone(video.frameRate),
          width: intOrNone(video.width),
          height: intOrNone(video.height),
          tbr: floatOrNone(video.avgBitrate),
          ...parseCodecs(video.codecs || ""),
        });
      }
    }

    return {
      id: videoId,
      formats,
      subtitles,
      duration: floatOrNone(videoInfo.durationMillis, 1000),
      timestamp: intOrNone(videoInfo.uploadTime, 1000),
      http_headers: { Referer: "https://www.acfun.cn/" },
    };
  }
}

export class AcFunVideoIE extends AcFunVideoBaseIE {
  static override readonly _VALID_URL = String.raw`https?://www\.acfun\.cn/v/ac(?<id>[_\d]+)`;

  static override get IE_NAME(): string {
    return "AcFunVideo";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new ExtractorError("Unable to download webpage");
    }

    const jsonAll = this.searchJson<any>(
      String.raw`window\.videoInfo\s*=`,
      webpage,
      "videoInfo",
      videoId
    );
    if (!jsonAll) {
      throw new ExtractorError("Unable to extract video info json");
    }

    let title = jsonAll.title as string;
    const videoList = (jsonAll.videoList || []) as any[];
    const videoInternalId = traverseObj(jsonAll, ["currentVideoInfo", "id"]);
    if (videoInternalId && videoList.length > 1) {
      const entry = videoList.map((v, idx) => ({ v, idx })).find((item) => item.v.id === videoInternalId);
      if (entry) {
        const partIdx = entry.idx + 1;
        const partVideoInfo = entry.v;
        const partIdxStr = String(partIdx).padStart(2, "0");
        title = `${title} P${partIdxStr} ${partVideoInfo.title || ""}`;
      }
    }

    const metadata = await this.extractMetadata(videoId, jsonAll.currentVideoInfo);

    return {
      ...metadata,
      title,
      thumbnail: jsonAll.coverUrl || undefined,
      description: jsonAll.description || undefined,
      uploader: traverseObj(jsonAll, ["user", "name"]) as string | null ?? undefined,
      uploader_id: traverseObj(jsonAll, ["user", "href"]) as string | null ?? undefined,
      tags: traverseObj(jsonAll, ["tagList", Ellipsis, "name"]) as string[] | null ?? undefined,
      view_count: intOrNone(jsonAll.viewCount),
      like_count: intOrNone(jsonAll.likeCountShow),
      comment_count: intOrNone(jsonAll.commentCountShow),
    };
  }
}

export class AcFunBangumiIE extends AcFunVideoBaseIE {
  static override readonly _VALID_URL = String.raw`https?://www\.acfun\.cn/bangumi/(?<id>aa[_\d]+)`;

  static override get IE_NAME(): string {
    return "AcFunBangumi";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const acIdx = parseQs(url).ac?.[0];

    const fullVideoId = `${videoId}${formatField(acIdx, undefined, "__%s")}`;

    const webpage = await this.downloadWebpage(url, fullVideoId);
    if (webpage === false) {
      throw new ExtractorError("Unable to download webpage");
    }

    const jsonBangumiData = this.searchJson<any>(
      String.raw`window\.bangumiData\s*=`,
      webpage,
      "bangumiData",
      fullVideoId
    );
    if (!jsonBangumiData) {
      throw new ExtractorError("Unable to extract bangumi data json");
    }

    if (acIdx) {
      const videoInfo = jsonBangumiData.hlVideoInfo;
      const metadata = await this.extractMetadata(fullVideoId, videoInfo);
      return {
        ...metadata,
        title: videoInfo?.title || "",
      };
    }

    const videoInfo = jsonBangumiData.currentVideoInfo;
    const seasonId = jsonBangumiData.bangumiId;
    let seasonNumber: number | undefined ;

    if (seasonId) {
      const relatedBangumis = (jsonBangumiData.relatedBangumis || []) as any[];
      const idx = relatedBangumis.findIndex((v) => v?.id === seasonId);
      seasonNumber = idx !== -1 ? idx + 1 : 1;
    }

    const jsonBangumiList = this.searchJson<any>(
      String.raw`window\.bangumiList\s*=`,
      webpage,
      "bangumiList",
      fullVideoId,
      { fatal: false }
    ) || {};

    const videoInternalId = intOrNone(traverseObj(jsonBangumiData, ["currentVideoInfo", "id"]));
    let episodeNumber: number | undefined ;
    if (videoInternalId) {
      const items = (jsonBangumiList.items || []) as any[];
      const idx = items.findIndex((v) => intOrNone(v?.videoId) === videoInternalId);
      episodeNumber = idx !== -1 ? idx + 1 : undefined;
    }

    const metadata = await this.extractMetadata(fullVideoId, videoInfo);

    return {
      ...metadata,
      title: jsonBangumiData.showTitle || "",
      thumbnail: jsonBangumiData.image || undefined,
      season: jsonBangumiData.bangumiTitle || undefined,
      season_id: strOrNone(seasonId) || undefined,
      season_number: seasonNumber,
      episode: jsonBangumiData.title || undefined,
      episode_number: episodeNumber,
      comment_count: intOrNone(jsonBangumiData.commentCount),
    };
  }
}
