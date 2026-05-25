// Source: yt_dlp/extractor/bigo.py

import { ExtractorError, UserNotLive, urlencodePostdata } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface BigoResponse {
  code?: number | string | null;
  msg?: string;
  data?: BigoData;
}

interface BigoData {
  alive?: boolean;
  hls_src?: string;
  roomId?: string;
  roomTopic?: string;
  nick_name?: string;
  snapshot?: string;
}

export class BigoIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?bigo\.tv/(?:[a-z]{2,}/)?(?<id>[^/]+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const userId = this.matchId(url);
    const infoRaw = await this.downloadJson<BigoResponse>(
      "https://ta.bigo.tv/official_website/studio/getInternalStudioInfo",
      userId,
      {
        data: urlencodePostdata({ siteId: userId }),
        headers: { Accept: "application/json" },
      },
    );
    if (infoRaw === false || !infoRaw || typeof infoRaw !== "object" || Array.isArray(infoRaw)) {
      throw new ExtractorError("Received invalid JSON data", { videoId: userId });
    }
    if (infoRaw.code) {
      throw new ExtractorError(`Bigo says: ${infoRaw.msg ?? "unknown error"} (code ${infoRaw.code})`, {
        expected: true,
        videoId: userId,
      });
    }

    const info = infoRaw.data ?? {};
    if (!info.alive) {
      throw new UserNotLive(undefined, { videoId: userId });
    }
    if (!info.hls_src) {
      throw new ExtractorError("Unable to extract HLS URL", { videoId: userId });
    }

    const [formats, subtitles] = await this.extractM3u8FormatsAndSubtitles(
      info.hls_src,
      userId,
      "mp4",
      { m3u8Id: "m3u8" },
    );

    return {
      id: info.roomId ?? userId,
      title: info.roomTopic ?? info.nick_name ?? userId,
      formats,
      subtitles,
      thumbnail: info.snapshot,
      uploader: info.nick_name,
      uploader_id: userId,
      is_live: true,
    };
  }
}
