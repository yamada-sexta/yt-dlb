// Source: yt_dlp/extractor/camdemy.py

import {
  cleanHtml,
  parseDuration,
  strToInt,
  unifiedStrdate,
  urljoin,
} from "../utils/index.ts";
import { xmlFind, xpathText } from "../utils/xml.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface CamdemyOEmbed {
  title?: string;
  thumbnail_url?: string;
  description?: string;
  author_name?: string;
  duration?: string | number;
}

export class CamdemyIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?camdemy\.com/media/(?<id>\d+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new Error("Unable to download Camdemy page");
    }

    const srcFrom = this.htmlSearchRegex(
      /class=['"]srcFrom['"][^>]*>Sources?(?:\s+from)?\s*:\s*<a[^>]+(?:href|title)=(['"])(?<url>(?:(?!\1).)+)\1/,
      webpage,
      "external source",
      { defaultValue: null, group: "url" },
    );
    if (typeof srcFrom === "string") {
      return this.urlResult(srcFrom);
    }

    const oembed = await this.downloadJson<CamdemyOEmbed>(
      `http://www.camdemy.com/oembed/?format=json&url=${encodeURIComponent(url)}`,
      videoId,
    );
    if (oembed === false) {
      throw new Error("Unable to download Camdemy oEmbed JSON");
    }
    const title = oembed.title ?? videoId;
    const thumbUrl = oembed.thumbnail_url;
    if (!thumbUrl) {
      throw new Error("Camdemy oEmbed data is missing thumbnail_url");
    }
    const videoFolder = urljoin(thumbUrl, "video/");
    if (!videoFolder) {
      throw new Error("Unable to build Camdemy video folder URL");
    }
    const fileList = await this.downloadXml(
      urljoin(videoFolder, "fileList.xml") ?? "",
      videoId,
      { note: "Downloading filelist XML" },
    );
    if (fileList === false) {
      throw new Error("Unable to download Camdemy file list XML");
    }
    const videoItem = xmlFind(xmlFind(fileList, "video") ?? fileList, "item");
    const fileName = videoItem
      ? xpathText(videoItem, "fileName", "file name", { fatal: true })
      : null;
    if (!fileName) {
      throw new Error("Unable to extract Camdemy file name");
    }

    return {
      id: videoId,
      url: urljoin(videoFolder, fileName) ?? undefined,
      title,
      thumbnail: thumbUrl,
      description:
        this.htmlSearchMeta("description", webpage) ??
        cleanHtml(oembed.description) ??
        undefined,
      creator: oembed.author_name,
      duration: parseDuration(oembed.duration) ?? undefined,
      upload_date:
        unifiedStrdate(
          this.searchRegex(/>published on ([^<]+)</, webpage, "upload date", {
            defaultValue: null,
          }) as string | null,
        ) ?? undefined,
      view_count:
        strToInt(
          this.searchRegex(
            /role=["']viewCnt["'][^>]*>([\d,.]+) views/,
            webpage,
            "view count",
            { defaultValue: null },
          ) as string | null,
        ) ?? undefined,
    };
  }
}

export class CamdemyFolderIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?camdemy\.com/folder/(?<id>\d+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const folderId = this.matchId(url);
    const parsed = new URL(url);
    parsed.searchParams.set("displayMode", "list");
    const page = await this.downloadWebpage(parsed.toString(), folderId);
    if (page === false) {
      throw new Error("Unable to download Camdemy folder page");
    }
    const entries = [...page.matchAll(/href='(\/media\/\d+\/?)'/g)].map(
      (match) => this.urlResult(`http://www.camdemy.com${match[1]}`),
    );
    return this.playlistResult(
      entries,
      folderId,
      this.htmlSearchMeta("keywords", page),
    );
  }
}
