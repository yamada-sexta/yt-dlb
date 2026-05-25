// Source: yt_dlp/extractor/alsace20tv.py

import {
  cleanHtml,
  getElementByClass,
  intOrNone,
  unifiedStrdate,
  urlOrNone,
} from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface Alsace20Info {
  titre?: string;
  files?: Record<string, string>;
  image?: string;
  preview?: string;
  nb_vues?: unknown;
}

class Alsace20TVBaseIE extends InfoExtractor {
  protected async extractVideo(
    videoId: string,
    url: string | null = null,
  ): Promise<ExtractorInfo> {
    const info =
      (await this.downloadJson<Alsace20Info>(
        `https://www.alsace20.tv/visionneuse/visio_v9_js.php?key=${videoId}&habillage=0&mode=html`,
        videoId,
      )) || {};

    const formats: Array<Record<string, unknown>> = [];
    for (const [res, formatUrl] of Object.entries(info.files ?? {})) {
      formats.push(
        ...(formatUrl.includes("/smil:_")
          ? this.extractSmilFormats(formatUrl, videoId, { fatal: false })
          : this.extractMpdFormats(formatUrl, videoId, {
              mpdId: res,
              fatal: false,
            })),
      );
    }

    const webpage = url
      ? await this.downloadWebpage(url, videoId, { fatal: false })
      : "";
    const page = webpage || "";
    const thumbnail = urlOrNone(
      info.image ?? info.preview ?? this.ogSearchThumbnail(page),
    );
    const uploadDateRaw = this.searchRegex(
      /\/(\d{6})_/,
      thumbnail,
      "upload_date",
      { defaultValue: null },
    );
    const uploadDate =
      typeof uploadDateRaw === "string"
        ? unifiedStrdate(
            `20${uploadDateRaw.slice(0, 2)}-${uploadDateRaw.slice(2, 4)}-${uploadDateRaw.slice(4)}`,
          )
        : null;

    return {
      id: videoId,
      title: info.titre,
      formats,
      description: cleanHtml(getElementByClass("wysiwyg", page)),
      upload_date: uploadDate,
      thumbnail,
      duration: intOrNone(
        page ? this.ogSearchProperty("video:duration", page, false) : null,
      ),
      view_count: intOrNone(info.nb_vues),
    };
  }
}

export class Alsace20TVIE extends Alsace20TVBaseIE {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?alsace20\.tv/(?:[\w-]+/)+[\w-]+-(?<id>[\w]+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    return await this.extractVideo(this.matchId(url), url);
  }
}

export class Alsace20TVEmbedIE extends Alsace20TVBaseIE {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?alsace20\.tv/emb/(?<id>[\w]+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    return await this.extractVideo(this.matchId(url));
  }
}
