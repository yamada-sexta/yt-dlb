// Source: yt_dlp/extractor/audioboom.py

import {
  cleanHtml,
  floatOrNone,
  traverseObj,
  unescapeHTML,
} from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import { z } from "zod";

const AudioBoomClipSchema = z
  .object({
    clipURLPriorToLoading: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    formattedDescription: z.string().optional(),
    duration: z.unknown().optional(),
    author: z.string().optional(),
    author_url: z.string().optional(),
  })
  .passthrough();

type AudioBoomClip = z.infer<typeof AudioBoomClipSchema>;

export class AudioBoomIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?audioboom\.com/(?:boos|posts)/(?<id>[0-9]+)(?:\.mp3)?`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const webpage = await this.downloadWebpage(
      `https://audioboom.com/posts/${videoId}`,
      videoId,
    );
    if (webpage === false) {
      throw new Error("Unable to download AudioBoom page");
    }

    const clipStore = this.searchJson<Record<string, unknown>>(
      String.raw`data-react-class="V5DetailPagePlayer"\s*data-react-props=["']`,
      webpage,
      "clip store",
      videoId,
      { fatal: false, transform_source: unescapeHTML },
    );
    const clip = (traverseObj<AudioBoomClip>(clipStore, ["clips", 0], {
      expected_type: isAudioBoomClip,
      get_all: false,
    }) ?? {}) as AudioBoomClip;

    return {
      id: videoId,
      url:
        clip.clipURLPriorToLoading ??
        this.ogSearchProperty("audio", webpage, false) ??
        undefined,
      title:
        clip.title ??
        this.htmlSearchMeta(
          ["og:title", "og:audio:title", "audio_title"],
          webpage,
        ) ??
        undefined,
      description:
        clip.description ??
        cleanHtml(clip.formattedDescription) ??
        this.ogSearchDescription(webpage) ??
        undefined,
      duration:
        floatOrNone(
          clip.duration ?? this.htmlSearchMeta("weibo:audio:duration", webpage),
        ) ?? undefined,
      uploader:
        clip.author ??
        this.htmlSearchMeta(
          ["og:audio:artist", "twitter:audio:artist_name", "audio_artist"],
          webpage,
          "uploader",
        ) ??
        undefined,
      uploader_url:
        clip.author_url ??
        this.htmlSearchRegex(
          /<div class="avatar flex-shrink-0">\s*<a href="(?<uploader_url>http[^"]+)"/,
          webpage,
          "uploader url",
          { fatal: false, group: "uploader_url" },
        ) ??
        undefined,
    };
  }
}

function isAudioBoomClip(value: unknown): value is AudioBoomClip {
  return AudioBoomClipSchema.safeParse(value).success;
}
