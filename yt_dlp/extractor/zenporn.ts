// Source: yt_dlp/extractor/zenporn.py

import {
  determineExt,
  ExtractorError,
  unifiedStrdate,
  urlOrNone,
} from "../utils/index.ts";
import { traverseObj } from "../utils/traversal.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface ZenPornVideoFile {
  video_url?: string;
  format?: string;
}

interface ZenPornInfo {
  video?: {
    title?: string;
    description?: string;
    thumb?: string;
    post_date?: string;
    user?: { username?: string };
  };
}

export class ZenPornIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?zenporn\.com/video/(?<id>\d+)`;

  private genInfoUrl(
    extDomain: string,
    extrId: string,
    lifetime = 86400,
  ): string {
    const id = Number(extrId);
    const path = [1_000_000, 1_000, 1]
      .map((divisor) => Math.trunc(id / divisor) * divisor)
      .join("/");
    return `https://${extDomain}/api/json/video/${lifetime}/${path}.json`;
  }

  private static decodeVideoUrl(encodedUrl: string): string | null {
    const map: Record<string, string> = {
      А: "A",
      В: "B",
      С: "C",
      Е: "E",
      М: "M",
      ".": "+",
      ",": "/",
      "~": "=",
    };
    const normalized = [...encodedUrl]
      .map((char) => map[char] ?? char)
      .join("");
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized)) {
      return null;
    }
    try {
      return Buffer.from(normalized, "base64").toString("utf8");
    } catch {
      return null;
    }
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const displayId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, displayId);
    if (webpage === false) {
      throw new ExtractorError("Unable to download ZenPorn webpage", {
        videoId: displayId,
      });
    }
    const [extDomain, videoId] = this.searchRegex(
      /https:\/\/(?<ext_domain>[\w.-]+\.\w{3})\/embed\/(?<extr_id>\d+)\//,
      webpage,
      "embed info",
      { group: ["ext_domain", "extr_id"] },
    ) as string[];
    if (!extDomain || !videoId) {
      throw new ExtractorError("Unable to extract embed info", {
        videoId: displayId,
      });
    }

    const infoJson = await this.downloadJson<ZenPornInfo>(
      this.genInfoUrl(extDomain, videoId),
      videoId,
      { fatal: false },
    );
    const videoJson = await this.downloadJson<ZenPornVideoFile[]>(
      `https://${extDomain}/api/videofile.php`,
      videoId,
      {
        query: { video_id: videoId, lifetime: 8640000 },
        note: "Downloading video file JSON",
        errnote: "Failed to download video file JSON",
      },
    );
    if (videoJson === false || !videoJson[0]?.video_url) {
      throw new ExtractorError("Unable to extract video file metadata", {
        videoId,
      });
    }
    const decodedUrl = ZenPornIE.decodeVideoUrl(videoJson[0].video_url);
    if (!decodedUrl) {
      throw new ExtractorError("Unable to decode the video url", { videoId });
    }

    const info = infoJson ? (infoJson.video ?? {}) : {};
    return {
      id: videoId,
      display_id: displayId,
      ext: traverseObj(videoJson, [0, "format", new Set([determineExt])], {
        get_all: false,
      }) as string | undefined,
      url: `https://${extDomain}${decodedUrl}`,
      age_limit: 18,
      title: info.title,
      description: info.description,
      thumbnail: urlOrNone(info.thumb) ?? undefined,
      upload_date: unifiedStrdate(info.post_date) ?? undefined,
      uploader: info.user?.username,
    };
  }
}
