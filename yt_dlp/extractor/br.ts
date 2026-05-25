// Source: yt_dlp/extractor/br.py

import type { XmlElement } from "../compat/index.ts";
import { ExtractorError, intOrNone, parseDuration } from "../utils/index.ts";
import { xpathElement, xpathText } from "../utils/xml.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

export class BRIE extends InfoExtractor {
  static override readonly _WORKING = false;
  static override readonly _VALID_URL =
    String.raw`(?<base_url>https?://(?:www\.)?br(?:-klassik)?\.de)/(?:[a-z0-9\-_]+/)+(?<id>[a-z0-9\-_]+)\.html`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const baseUrl = match?.groups?.base_url;
    const displayId = match?.groups?.id;
    if (!baseUrl || !displayId) {
      throw new ExtractorError("Unable to extract BR URL fields");
    }
    const page = await this.downloadWebpage(url, displayId);
    if (page === false) {
      throw new ExtractorError("Unable to download webpage", {
        videoId: displayId,
      });
    }
    const xmlUrl = this.searchRegex(
      /return BRavFramework\.register\(BRavFramework\('avPlayer_(?:[a-f0-9-]{36})'\)\.setup\({dataURL:'(\/(?:[a-z0-9-]+\/)+[a-z0-9/~_.-]+)'}\)\);/,
      page,
      "XMLURL",
    );
    if (typeof xmlUrl !== "string") {
      throw new ExtractorError("Unable to extract XMLURL", {
        videoId: displayId,
      });
    }
    const xml = await this.downloadXml(`${baseUrl}${xmlUrl}`, displayId);
    if (xml === false) {
      throw new ExtractorError("Unable to download XML", {
        videoId: displayId,
      });
    }

    const medias: ExtractorInfo[] = [];
    for (const xmlMedia of [
      ...xml.children.filter((child) => child.tag === "video"),
      ...xml.children.filter((child) => child.tag === "audio"),
    ]) {
      const mediaId = xmlMedia.attrib.externalId;
      const assets = xpathElement(xmlMedia, "assets");
      medias.push({
        id: mediaId,
        title:
          xpathText(xmlMedia, "title", "title", { fatal: true }) ?? undefined,
        duration: parseDuration(xpathText(xmlMedia, "duration")),
        formats: this.extractFormats(assets, mediaId ?? displayId),
        thumbnails: this.extractThumbnails(
          xpathElement(xmlMedia, "teaserImage/variants"),
          baseUrl,
        ),
        description: xpathText(xmlMedia, "desc") ?? undefined,
        webpage_url: xpathText(xmlMedia, "permalink") ?? undefined,
        uploader: xpathText(xmlMedia, "author") ?? undefined,
        ...uploadDateInfo(xpathText(xmlMedia, "broadcastDate")),
      });
    }

    if (medias.length > 1) {
      this.reportWarning(
        "found multiple medias; please report this with the video URL to http://yt-dl.org/bug",
      );
    }
    if (!medias.length) {
      throw new ExtractorError("No media entries found", {
        videoId: displayId,
      });
    }
    return medias[0]!;
  }

  private extractFormats(
    assets: XmlElement | null,
    mediaId: string,
  ): Array<Record<string, unknown>> {
    const formats: Array<Record<string, unknown>> = [];
    for (const asset of assets?.children.filter(
      (child) => child.tag === "asset",
    ) ?? []) {
      const formatUrl = xpathText(asset, ["downloadUrl", "url"]);
      const assetType = asset.attrib.type ?? "";
      if (!formatUrl) {
        continue;
      }
      if (assetType.startsWith("HDS")) {
        formats.push(
          ...this.extractF4mFormats(`${formatUrl}?hdcore=3.2.0`, mediaId, {
            f4mId: "hds",
            fatal: false,
          }),
        );
      } else if (assetType.startsWith("HLS")) {
        formats.push(
          ...this.extractM3u8Formats(formatUrl, mediaId, "mp4", {
            entryProtocol: "m3u8_native",
            m3u8Id: "hds",
          }),
        );
      } else {
        const formatInfo = {
          ext: xpathText(asset, "mediaType") ?? undefined,
          width: intOrNone(xpathText(asset, "frameWidth")) ?? undefined,
          height: intOrNone(xpathText(asset, "frameHeight")) ?? undefined,
          tbr: intOrNone(xpathText(asset, "bitrateVideo")) ?? undefined,
          abr: intOrNone(xpathText(asset, "bitrateAudio")) ?? undefined,
          vcodec: xpathText(asset, "codecVideo") ?? undefined,
          acodec: xpathText(asset, "codecAudio") ?? undefined,
          container: xpathText(asset, "mediaType") ?? undefined,
          filesize: intOrNone(xpathText(asset, "size")) ?? undefined,
        };
        const httpUrl = this.protoRelativeUrl(formatUrl);
        if (httpUrl) {
          formats.push({
            ...formatInfo,
            url: httpUrl,
            format_id: `http-${assetType}`,
          });
        }
        const serverPrefix = xpathText(asset, "serverPrefix");
        if (serverPrefix) {
          formats.push({
            ...formatInfo,
            url: serverPrefix,
            play_path: xpathText(asset, "fileName") ?? undefined,
            format_id: `rtmp-${assetType}`,
          });
        }
      }
    }
    return formats;
  }

  private extractThumbnails(
    variants: XmlElement | null,
    baseUrl: string,
  ): Array<Record<string, unknown>> {
    const thumbnails = (
      variants?.children.filter((child) => child.tag === "variant") ?? []
    ).flatMap((variant) => {
      const path = xpathText(variant, "url");
      return path
        ? [
            {
              url: `${baseUrl}${path}`,
              width: intOrNone(xpathText(variant, "width")) ?? undefined,
              height: intOrNone(xpathText(variant, "height")) ?? undefined,
            },
          ]
        : [];
    });
    thumbnails.sort(
      (left, right) =>
        (right.width ?? 0) * (right.height ?? 0) -
        (left.width ?? 0) * (left.height ?? 0),
    );
    return thumbnails;
  }
}

function uploadDateInfo(value: string | null): Record<string, string> {
  const parts = value?.split(".");
  return parts?.length === 3
    ? { upload_date: parts.toReversed().join("") }
    : {};
}
