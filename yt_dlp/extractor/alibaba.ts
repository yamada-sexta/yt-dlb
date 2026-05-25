// Source: yt_dlp/extractor/alibaba.py
// Port note: Python traversal is replaced with typed record checks for the product media shape.

import { intOrNone, strOrNone } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import { z } from "zod";

const RecordSchema = z.record(z.string(), z.unknown());

export class AlibabaIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?alibaba\.com/product-detail/[\w-]+_(?<id>\d+)\.html`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const displayId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, displayId);
    if (webpage === false) {
      throw new Error("Unable to download Alibaba product page");
    }
    const json = this.searchRegex(
      /window\.detailData\s*=\s*({[\s\S]+?})\s*;/,
      webpage,
      "detail data",
    );
    if (typeof json !== "string") {
      throw new Error("Unable to extract Alibaba detail data");
    }
    const data = JSON.parse(json) as Record<string, unknown>;
    const product = getRecord(getRecord(data)?.globalData)?.product;
    const productData = getRecord(product);
    const mediaItems = getArray(productData?.mediaItems).filter(isRecord);
    const video = mediaItems.find(
      (item) => item.type === "video" && item.videoId,
    );
    const formats = getFormats(video?.videoUrl);

    return {
      id: strOrNone(video?.videoId) ?? displayId,
      display_id: displayId,
      title: strOrNone(productData?.subject) ?? displayId,
      duration: intOrNone(video?.duration) ?? undefined,
      thumbnail: urlOrNone(video?.videoCoverUrl) ?? undefined,
      formats,
    };
  }
}

function getFormats(value: unknown): Array<Record<string, unknown>> {
  const rows = Array.isArray(value)
    ? value
    : isRecord(value)
      ? Object.values(value)
      : [];
  return rows
    .filter(isRecord)
    .map((row) => ({
      url: urlOrNone(row.videoUrl) ?? urlOrNone(row.url),
      format_id: strOrNone(row.definition) ?? undefined,
      tbr: intOrNone(row.bitrate) ?? undefined,
      width: intOrNone(row.width) ?? undefined,
      height: intOrNone(row.height) ?? undefined,
      filesize: intOrNone(row.length) ?? undefined,
    }))
    .filter((format) => format.url);
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return RecordSchema.safeParse(value).success;
}

function urlOrNone(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  try {
    return new URL(value).toString();
  } catch {
    return null;
  }
}
