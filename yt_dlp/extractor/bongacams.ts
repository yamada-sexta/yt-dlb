// Source: yt_dlp/extractor/bongacams.py

import { ExtractorError, intOrNone, urlencodePostdata } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import { z } from "zod";

const BongaCamsResponseSchema = z.object({
  localData: z.object({
    videoServerUrl: z.string(),
  }).passthrough(),
  performerData: z.object({
    username: z.string().optional(),
    displayName: z.string().optional(),
    loversCount: z.unknown().optional(),
  }).passthrough().optional(),
}).passthrough();

export class BongaCamsIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?<host>(?:[^/]+\.)?bongacams\d*\.(?:com|net))/(?<id>[^/?&#]+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const host = match?.groups?.host;
    const channelId = match?.groups?.id;
    if (!host || !channelId) {
      throw new ExtractorError("Unable to extract BongaCams channel id");
    }

    const rawAmf = await this.downloadJson<unknown>(
      `https://${host}/tools/amf.php`,
      channelId,
      {
        data: urlencodePostdata([
          ["method", "getRoomData"],
          ["args[]", channelId],
          ["args[]", "false"],
        ]),
        headers: { "X-Requested-With": "XMLHttpRequest" },
      },
    );
    if (rawAmf === false) {
      throw new ExtractorError("Unable to download room data", { videoId: channelId });
    }
    const amf = BongaCamsResponseSchema.parse(rawAmf);
    const performer = amf.performerData ?? {};
    const uploaderId = performer.username ?? channelId;
    const uploader = performer.displayName;
    const formats = this.extractM3u8Formats(
      `${amf.localData.videoServerUrl}/hls/stream_${uploaderId}/playlist.m3u8`,
      channelId,
      "mp4",
      { m3u8Id: "hls" },
    );

    return {
      id: channelId,
      title: uploader ?? uploaderId,
      uploader,
      uploader_id: uploaderId,
      like_count: intOrNone(performer.loversCount) ?? undefined,
      age_limit: 18,
      is_live: true,
      formats,
    };
  }
}
