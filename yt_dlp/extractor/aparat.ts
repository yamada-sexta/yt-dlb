// Source: yt_dlp/extractor/aparat.py

import {
  getElementById,
  intOrNone,
  mergeDicts,
  mimetype2ext,
  urlOrNone,
} from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import { z } from "zod";

const AparatSourceSchema = z
  .object({
    src: z.string().optional(),
    type: z.string().optional(),
    label: z.string().optional(),
  })
  .passthrough();

type AparatSource = z.infer<typeof AparatSourceSchema>;

interface AparatOptions {
  multiSRC?: unknown;
  poster?: string;
  duration?: unknown;
}

export class AparatIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?aparat\.com/(?:v/|video/video/embed/videohash/)(?<id>[a-zA-Z0-9]+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    let webpage = await this.downloadWebpage(url, videoId, { fatal: false });
    let options = this.parseOptions(webpage, videoId);

    if (!options) {
      webpage = await this.downloadWebpage(
        `http://www.aparat.com/video/video/embed/vt/frame/showvideo/yes/videohash/${videoId}`,
        videoId,
        { note: "Downloading embed webpage" },
      );
      options = this.parseOptions(webpage, videoId, true);
    }

    const formats: Array<Record<string, unknown>> = [];
    for (const sources of Array.isArray(options.multiSRC)
      ? options.multiSRC
      : []) {
      if (!Array.isArray(sources)) {
        continue;
      }
      for (const item of sources) {
        if (!isAparatSource(item)) {
          continue;
        }
        const fileUrl = urlOrNone(item.src);
        if (!fileUrl) {
          continue;
        }
        if (item.type === "application/vnd.apple.mpegurl") {
          formats.push(
            ...this.extractM3u8Formats(fileUrl, videoId, "mp4", {
              entryProtocol: "m3u8_native",
              m3u8Id: "hls",
            }),
          );
        } else {
          const ext = mimetype2ext(item.type);
          const height = this.searchRegex(
            /(\d+)[pP]/,
            item.label ?? "",
            "height",
            { defaultValue: null },
          );
          formats.push({
            url: fileUrl,
            ext,
            format_id: `http-${item.label || ext}`,
            height: intOrNone(height) ?? undefined,
          });
        }
      }
    }

    const info = this.searchJsonLd(webpage, videoId, { defaultValue: {} });
    if (!info.title && webpage) {
      info.title =
        getElementById("videoTitle", webpage) ??
        this.htmlSearchMeta(
          ["og:title", "twitter:title", "DC.Title", "title"],
          webpage,
          "title",
          true,
        );
    }

    return mergeDicts(info, {
      id: videoId,
      thumbnail: urlOrNone(options.poster) ?? undefined,
      duration: intOrNone(options.duration) ?? undefined,
      formats,
    }) as ExtractorInfo;
  }

  private parseOptions(
    webpage: string | false,
    videoId: string,
    fatal = false,
  ): AparatOptions {
    if (webpage === false) {
      return {};
    }
    const optionsJson = this.searchRegex(
      /options\s*=\s*({[\s\S]+?})\s*;/,
      webpage,
      "options",
      { defaultValue: "{}" },
    );
    if (typeof optionsJson !== "string") {
      if (fatal) {
        throw new Error("Unable to extract Aparat options");
      }
      return {};
    }
    return this.parseJson<AparatOptions>(optionsJson, videoId, { fatal }) ?? {};
  }
}

function isAparatSource(value: unknown): value is AparatSource {
  return AparatSourceSchema.safeParse(value).success;
}
