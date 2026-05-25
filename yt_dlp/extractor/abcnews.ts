// Source: yt_dlp/extractor/abcnews.py

import { AMPIE } from "./amp.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import {
  parseDuration,
  parseIso8601,
  tryGet,
  ExtractorError,
} from "../utils/index.ts";

export class AbcNewsVideoIE extends AMPIE {
  static override readonly _VALID_URL = String.raw`https?://(?:abcnews\.go\.com/(?:(?:[^/]+/)*video/(?<display_id>[0-9a-z-]+)-|video/(?:embed|itemfeed)\?.*?\bid=)|fivethirtyeight\.abcnews\.go\.com/video/embed/\d+/)(?<id>\d+)`;

  static override get IE_NAME(): string {
    return "abcnews:video";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const displayId = match?.groups?.display_id;
    const videoId = match?.groups?.id;
    if (!videoId) {
      throw new Error("Unable to extract ABC News video ID");
    }

    const infoDict = await this.extractFeedInfo(`http://abcnews.go.com/video/itemfeed?id=${videoId}`);
    return {
      ...infoDict,
      id: videoId,
      display_id: displayId ?? undefined,
    };
  }
}

export class AbcNewsIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://abcnews\.go\.com/(?:[^/]+/)+(?<display_id>[0-9a-z-]+)/story\?id=(?<id>\d+)`;

  static override get IE_NAME(): string {
    return "abcnews";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const storyId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, storyId);
    if (webpage === false) {
      throw new ExtractorError("Unable to download webpage");
    }

    const rawData = this.searchRegex(
      /window\['__abcnews__'\]\s*=\s*({.+?});/,
      webpage,
      "data"
    );
    if (typeof rawData !== "string") {
      throw new Error("Unable to locate page data");
    }

    const parsedData = this.parseJson<any>(rawData, storyId);
    const story = parsedData?.page?.content?.story?.everscroll?.[0] || {};
    const articleContents = story.articleContents || {};

    const entriesList: ExtractorInfo[] = [];

    const featuredVideo = story.featuredVideo || {};
    const feed = tryGet(featuredVideo, (x: any) => x.video.feed);
    if (feed) {
      entriesList.push({
        _type: "url",
        id: String(featuredVideo.id ?? ""),
        title: String(featuredVideo.name ?? ""),
        url: String(feed),
        thumbnail: featuredVideo.images ? String(featuredVideo.images) : undefined,
        description: featuredVideo.description ? String(featuredVideo.description) : undefined,
        timestamp: parseIso8601(featuredVideo.uploadDate) ?? undefined,
        duration: parseDuration(featuredVideo.duration) ?? undefined,
        ie_key: "AbcNewsVideo",
      });
    }

    const inlines = articleContents.inlines || [];
    for (const inline of inlines) {
      const inlineType = inline.type;
      if (inlineType === "iframe") {
        const iframeUrl = tryGet(inline, (x: any) => x.attrs.src);
        if (iframeUrl) {
          entriesList.push(this.urlResult(String(iframeUrl)));
        }
      } else if (inlineType === "video") {
        const videoId = inline.id;
        if (videoId) {
          entriesList.push({
            _type: "url",
            id: String(videoId),
            url: "http://abcnews.go.com/video/embed?id=" + videoId,
            thumbnail: inline.imgSrc || inline.imgDefault || undefined,
            description: inline.description || undefined,
            duration: parseDuration(inline.duration) ?? undefined,
            ie_key: "AbcNewsVideo",
          });
        }
      }
    }

    return this.playlistResult(
      entriesList,
      storyId,
      articleContents.headline || undefined,
      articleContents.subHead || undefined
    );
  }
}
