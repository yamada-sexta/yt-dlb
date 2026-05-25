// Source: yt_dlp/extractor/youjizz.py

import {
  determineExt,
  intOrNone,
  parseDuration,
  urlOrNone,
} from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

export class YouJizzIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:\w+\.)?youjizz\.com/videos/(?:[^/#?]*-(?<id>\d+)\.html|embed/(?<embed_id>\d+))`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const videoId = match?.groups?.id ?? match?.groups?.embed_id;
    if (!videoId) {
      throw new Error("Unable to extract YouJizz video id");
    }
    let webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new Error("Unable to download YouJizz webpage");
    }

    const title = this.htmlExtractTitle(webpage);
    const encodingsJson = this.searchRegex(
      String.raw`[Ee]ncodings\s*=\s*(\[.+?\]);\n`,
      webpage,
      "encodings",
      { defaultValue: "[]" },
    );
    const encodings =
      typeof encodingsJson === "string"
        ? (this.parseJson<unknown[]>(encodingsJson, videoId, {
            fatal: false,
          }) ?? [])
        : [];
    const formats: Array<Record<string, unknown>> = [];
    for (const encoding of encodings) {
      if (
        !encoding ||
        typeof encoding !== "object" ||
        Array.isArray(encoding)
      ) {
        continue;
      }
      const record = encoding as Record<string, unknown>;
      const formatUrl = urlOrNone(record.filename);
      if (!formatUrl) {
        continue;
      }
      if (determineExt(formatUrl) === "m3u8") {
        formats.push(
          ...this.extractM3u8Formats(formatUrl, videoId, "mp4", {
            entryProtocol: "m3u8_native",
            m3u8Id: "hls",
          }),
        );
      } else {
        const formatId =
          typeof record.name === "string"
            ? record.name
            : typeof record.quality === "string"
              ? record.quality
              : undefined;
        const height = intOrNone(
          this.searchRegex(String.raw`^(\d+)[pP]`, formatId ?? "", "height", {
            defaultValue: null,
          }),
        );
        formats.push({ url: formatUrl, format_id: formatId, height });
      }
    }

    let info: ExtractorInfo = formats.length ? { formats } : {};
    if (!formats.length) {
      webpage = webpage.replaceAll('"controls', '" controls');
      info = this.parseHtml5MediaEntries(url, webpage, videoId)[0] ?? {};
    }

    return {
      ...info,
      id: videoId,
      title: title ?? videoId,
      age_limit: this.rtaSearch(webpage),
      duration: parseDuration(
        this.searchRegex(
          String.raw`<strong>Runtime:</strong>([^<]+)`,
          webpage,
          "duration",
          { defaultValue: null },
        ) as string | null,
      ),
      uploader: this.searchRegex(
        String.raw`<strong>Uploaded By:.*?<a[^>]*>([^<]+)`,
        webpage,
        "uploader",
        { defaultValue: null },
      ) as string | null,
    };
  }
}
