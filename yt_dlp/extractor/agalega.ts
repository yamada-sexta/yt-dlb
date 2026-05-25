// Source: yt_dlp/extractor/agalega.py

import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import {
  ExtractorError,
  jwtDecodeHs256,
  urlOrNone,
  traverseObj,
  Ellipsis,
} from "../utils/index.ts";

export abstract class AGalegaBaseIE extends InfoExtractor {
  protected static accessToken: string | null = null;

  private static jwtIsExpired(token: string): boolean {
    try {
      const decoded = jwtDecodeHs256(token);
      const exp = decoded.exp as number;
      return exp - Date.now() / 1000 < 120;
    } catch {
      return true;
    }
  }

  protected async refreshAccessToken(videoId: string): Promise<void> {
    const data = (await this.downloadJson(
      "https://www.agalega.gal/api/fetch-api/jwt/token",
      videoId,
      {
        note: "Downloading access token",
        data: JSON.stringify({
          username: null,
          password: null,
          client: "crtvg",
          checkExistsCookies: false,
        }),
      },
    )) as any;
    AGalegaBaseIE.accessToken = data?.access || null;
  }

  protected async callApi(
    endpoint: string,
    displayId: string,
    note: string,
    fatal = true,
    query?: Record<string, string>,
  ): Promise<any> {
    if (
      !AGalegaBaseIE.accessToken ||
      AGalegaBaseIE.jwtIsExpired(AGalegaBaseIE.accessToken)
    ) {
      await this.refreshAccessToken(endpoint);
    }
    if (!AGalegaBaseIE.accessToken) {
      if (fatal) {
        throw new ExtractorError("Failed to obtain access token", {
          expected: true,
        });
      }
      return null;
    }
    return await this.downloadJson(
      `https://api-agalega.interactvty.com/api/2.0/contents/${endpoint}`,
      displayId,
      {
        note,
        fatal,
        query,
        headers: { Authorization: `jwtok ${AGalegaBaseIE.accessToken}` },
      },
    );
  }
}

export class AGalegaIE extends AGalegaBaseIE {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?agalega\.gal/videos/(?:detail/)?(?<id>[0-9]+)`;

  static override get IE_NAME(): string {
    return "agalega:videos";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const contentData = await this.callApi(
      `content/${videoId}/`,
      videoId,
      "Downloading content data",
      false,
      {
        optional_fields: "image,is_premium,short_description,has_subtitle",
      },
    );
    const resourceData = await this.callApi(
      `content_resources/${videoId}/`,
      videoId,
      "Downloading resource data",
      true,
      {
        optional_fields: "media_url",
      },
    );

    const formats: any[] = [];
    const subtitles: Record<string, any[]> = {};

    const mediaUrls = traverseObj(resourceData, [
      "results",
      Ellipsis,
      "media_url",
    ]) as string[];
    const urlsList = Array.isArray(mediaUrls)
      ? mediaUrls
      : mediaUrls
        ? [mediaUrls]
        : [];

    for (const m3u8Url of urlsList) {
      const cleanUrl = urlOrNone(m3u8Url);
      if (!cleanUrl) {
        continue;
      }
      const [fmts, subs] = await this.extractM3u8FormatsAndSubtitles(
        cleanUrl,
        videoId,
        "mp4",
        { m3u8Id: "hls" },
      );
      formats.push(...fmts);
      this.mergeSubtitles(subs, subtitles);
    }

    const title = (traverseObj(contentData, ["name"]) as string | null) ?? "";
    const description =
      ((traverseObj(contentData, ["description"]) ??
        traverseObj(contentData, ["short_description"])) as string | null) ??
      undefined;
    const thumbnail = urlOrNone(
      traverseObj(contentData, ["image"]) as string | null,
    );

    return {
      id: videoId,
      formats,
      subtitles,
      title,
      description,
      thumbnail: thumbnail || undefined,
    };
  }
}
