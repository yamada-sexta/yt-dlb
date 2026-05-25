// Source: yt_dlp/extractor/zhihu.py

import { floatOrNone, formatField, intOrNone } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface ZhihuPlaylistEntry {
  url?: string;
  play_url?: string;
  sample_rate?: unknown;
  size?: unknown;
  fps?: unknown;
  height?: unknown;
  bitrate?: unknown;
  width?: unknown;
}

interface ZhihuZVideo {
  title: string;
  image_url?: string;
  published_at?: unknown;
  play_count?: unknown;
  liked_count?: unknown;
  comment_count?: unknown;
  author?: {
    id?: string;
    name?: string;
    url_token?: string;
  };
  video?: {
    thumbnail?: string;
    duration?: unknown;
    playlist?: Record<string, ZhihuPlaylistEntry>;
  };
}

export class ZhihuIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?zhihu\.com/zvideo/(?<id>[0-9]+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const zvideo = await this.downloadJson<ZhihuZVideo>(
      `https://www.zhihu.com/api/v4/zvideos/${videoId}`,
      videoId,
    );
    if (zvideo === false) {
      throw new Error("Unable to download Zhihu video metadata");
    }

    const formats = Object.entries(zvideo.video?.playlist ?? {}).flatMap(
      ([formatId, item]) => {
        const playUrl = item.url ?? item.play_url;
        return playUrl
          ? [
              {
                asr: intOrNone(item.sample_rate) ?? undefined,
                filesize: intOrNone(item.size) ?? undefined,
                format_id: formatId,
                fps: intOrNone(item.fps) ?? undefined,
                height: intOrNone(item.height) ?? undefined,
                tbr: floatOrNone(item.bitrate) ?? undefined,
                url: playUrl,
                width: intOrNone(item.width) ?? undefined,
              },
            ]
          : [];
      },
    );

    const author = zvideo.author ?? {};
    return {
      id: videoId,
      title: zvideo.title,
      formats,
      thumbnail: zvideo.video?.thumbnail ?? zvideo.image_url,
      uploader: author.name,
      timestamp: intOrNone(zvideo.published_at) ?? undefined,
      uploader_id: author.id,
      uploader_url:
        formatField(
          author.url_token,
          null,
          "https://www.zhihu.com/people/%s",
        ) || undefined,
      duration: floatOrNone(zvideo.video?.duration) ?? undefined,
      view_count: intOrNone(zvideo.play_count) ?? undefined,
      like_count: intOrNone(zvideo.liked_count) ?? undefined,
      comment_count: intOrNone(zvideo.comment_count) ?? undefined,
    };
  }
}
