// Source: yt_dlp/extractor/adobeconnect.py

import { InfoExtractor, type ExtractorInfo } from "./common.ts";

export class AdobeConnectIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://\w+\.adobeconnect\.com/(?<id>[\w-]+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new Error("Unable to download Adobe Connect page");
    }
    const title = this.htmlExtractTitle(webpage) ?? videoId;
    const swfUrl = this.searchRegex(/swfUrl\s*=\s*'([^']+)'/, webpage, "swf url");
    if (typeof swfUrl !== "string") {
      throw new Error("Unable to extract Adobe Connect swf URL");
    }
    const query = new URLSearchParams(swfUrl.split("?", 2)[1] ?? "");
    const isLive = query.get("isLive") === "true";
    const conStrings = query.get("conStrings")?.split(",") ?? [];
    const appInstance = query.get("appInstance") ?? "";
    const streamName = query.get("streamName") ?? "";
    const ticket = query.get("ticket") ?? "";
    const formats = conStrings.map((connection) => {
      const connectionQuery = connection.split("?", 2)[1] ?? "";
      return {
        format_id: connection.split("://", 1)[0],
        app: encodeURIComponent(`?${connectionQuery}flvplayerapp/${appInstance}`),
        ext: "flv",
        play_path: `mp4:${streamName}`,
        rtmp_conn: `S:${ticket}`,
        rtmp_live: isLive,
        url: connection,
      };
    });

    return {
      id: videoId,
      title,
      formats,
      is_live: isLive,
    };
  }
}
