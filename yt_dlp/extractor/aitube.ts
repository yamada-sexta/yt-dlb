// Source: yt_dlp/extractor/aitube.py

import { intOrNone, mergeDicts } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface AitubeNextData {
  props?: {
    pageProps?: {
      videoInfo?: {
        title?: string;
        description?: string;
        viewCount?: unknown;
        likeCount?: unknown;
        channelTitle?: string;
        channelId?: string;
        coverUrl?: string;
        commentCount?: unknown;
        channelSubscriberCount?: unknown;
      };
    };
  };
}

export class AitubeKZVideoIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://aitube\.kz/(?:video|embed/)\?(?:[^\?]+)?id=(?<id>[\w-]+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new Error("Unable to download Aitube page");
    }
    const nextData = this.searchNextjsData<AitubeNextData>(webpage, videoId);
    const videoInfo = nextData?.props?.pageProps?.videoInfo ?? {};
    const jsonLdData = this.searchJsonLd(webpage, videoId, { defaultValue: {} });
    const [formats, subtitles] = await this.extractM3u8FormatsAndSubtitles(
      `https://api-http.aitube.kz/kz.aitudala.aitube.staticaccess/video/${videoId}/video`,
      videoId,
    );

    return mergeDicts({
      id: videoId,
      title: videoInfo.title ?? this.htmlSearchMeta(["name", "og:title"], webpage) ?? undefined,
      description: videoInfo.description,
      formats,
      subtitles,
      view_count: videoInfo.viewCount ?? intOrNone(this.htmlSearchMeta("ya:ovs:views_total", webpage)) ?? undefined,
      like_count: videoInfo.likeCount,
      channel: videoInfo.channelTitle,
      channel_id: videoInfo.channelId,
      thumbnail: videoInfo.coverUrl,
      comment_count: videoInfo.commentCount,
      channel_follower_count: intOrNone(videoInfo.channelSubscriberCount) ?? undefined,
    }, jsonLdData) as ExtractorInfo;
  }
}
