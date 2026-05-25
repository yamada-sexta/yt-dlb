// Source: yt_dlp/extractor/canalplus.py

import { intOrNone, qualities, unifiedStrdate } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface CanalVideoData {
  ID?: string;
  MEDIA?: {
    VIDEOS?: Record<string, string | null>;
    images?: Record<string, string>;
  };
  INFOS?: {
    TITRAGE?: { TITRE?: string; SOUS_TITRE?: string };
    PUBLICATION?: { DATE?: string };
    DESCRIPTION?: string;
    DURATION?: unknown;
    NB_VUES?: unknown;
    NB_LIKES?: unknown;
    NB_COMMENTS?: unknown;
  };
}

export class CanalplusIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?(?<site>mycanal|piwiplus)\.fr/(?:[^/]+/)*(?<display_id>[^?/]+)(?:\.html\?.*\bvid=|/p/)(?<id>\d+)`;
  static readonly VIDEO_INFO_TEMPLATE =
    "http://service.canal-plus.com/video/rest/getVideosLiees/%s/%s?format=json";
  static readonly SITE_ID_MAP: Record<string, string> = {
    mycanal: "cplus",
    piwiplus: "teletoon",
  };
  static override readonly _GEO_COUNTRIES = ["FR"];

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const site = match?.groups?.site;
    const displayId = match?.groups?.display_id;
    const videoId = match?.groups?.id;
    if (!site || !displayId || !videoId) {
      throw new Error("Unable to extract Canalplus video id");
    }
    const siteId = CanalplusIE.SITE_ID_MAP[site];
    if (!siteId) {
      throw new Error(`Unsupported Canalplus site: ${site}`);
    }
    const infoUrl = CanalplusIE.VIDEO_INFO_TEMPLATE.replace(
      "%s",
      siteId,
    ).replace("%s", videoId);
    const rawVideoData = await this.downloadJson<
      CanalVideoData | CanalVideoData[]
    >(infoUrl, videoId, { note: "Downloading video JSON" });
    if (rawVideoData === false) {
      throw new Error("Unable to download Canalplus video JSON");
    }
    const videoData = Array.isArray(rawVideoData)
      ? rawVideoData.find((video) => video.ID === videoId)
      : rawVideoData;
    if (!videoData?.MEDIA || !videoData.INFOS) {
      throw new Error("Canalplus video JSON is missing media info");
    }

    const preference = qualities(["MOBILE", "BAS_DEBIT", "HAUT_DEBIT", "HD"]);
    const formats: Array<Record<string, unknown>> = [];
    for (const [formatId, formatUrl] of Object.entries(
      videoData.MEDIA.VIDEOS ?? {},
    )) {
      if (!formatUrl) {
        continue;
      }
      if (formatId === "HLS") {
        formats.push(
          ...this.extractM3u8Formats(formatUrl, videoId, "mp4", {
            entryProtocol: "m3u8_native",
            m3u8Id: formatId,
          }),
        );
      } else if (formatId === "HDS") {
        formats.push(
          ...this.extractF4mFormats(`${formatUrl}?hdcore=2.11.3`, videoId, {
            f4mId: formatId,
            fatal: false,
          }),
        );
      } else {
        formats.push({
          url: `${formatUrl}?secret=pqzerjlsmdkjfoiuerhsdlfknaes`,
          format_id: formatId,
          quality: preference(formatId),
        });
      }
    }

    const thumbnails = Object.entries(videoData.MEDIA.images ?? {}).map(
      ([imageId, imageUrl]) => ({
        id: imageId,
        url: imageUrl,
      }),
    );
    const titrage = videoData.INFOS.TITRAGE ?? {};
    const title =
      `${titrage.TITRE ?? videoId} - ${titrage.SOUS_TITRE ?? ""}`.trim();

    return {
      id: videoId,
      display_id: displayId,
      title,
      upload_date:
        unifiedStrdate(videoData.INFOS.PUBLICATION?.DATE) ?? undefined,
      thumbnails,
      description: videoData.INFOS.DESCRIPTION,
      duration: intOrNone(videoData.INFOS.DURATION) ?? undefined,
      view_count: intOrNone(videoData.INFOS.NB_VUES) ?? undefined,
      like_count: intOrNone(videoData.INFOS.NB_LIKES) ?? undefined,
      comment_count: intOrNone(videoData.INFOS.NB_COMMENTS) ?? undefined,
      formats,
    };
  }
}
