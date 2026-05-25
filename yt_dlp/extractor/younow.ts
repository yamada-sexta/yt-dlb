// Source: yt_dlp/extractor/younow.py

import { ExtractorError, formatField, intOrNone, strOrNone, tryGet } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

const CDN_API_BASE = "https://cdn.younow.com/php/api";
const MOMENT_URL_FORMAT = `${CDN_API_BASE}/moment/fetch/id=`;

function extractMoment(item: Record<string, unknown>, fatal = true): ExtractorInfo | null {
  const rawMomentId = item.momentId;
  if (!rawMomentId) {
    if (!fatal) {
      return null;
    }
    throw new ExtractorError("Unable to extract moment id");
  }
  const momentId = String(rawMomentId);
  const uploader = tryGet(item, (value) => (value as { owner?: { name?: string } }).owner?.name, (value): value is string => typeof value === "string");
  const uploaderId = tryGet(item, (value) => (value as { owner?: { userId?: unknown } }).owner?.userId);
  const title = typeof item.text === "string" && item.text
    ? item.text
    : `YouNow ${String(item.momentType ?? item.titleType ?? "moment")}`;
  return {
    extractor_key: "YouNowMoment",
    id: momentId,
    title,
    view_count: intOrNone(item.views) ?? undefined,
    like_count: intOrNone(item.likes) ?? undefined,
    timestamp: intOrNone(item.created) ?? undefined,
    creator: uploader ?? undefined,
    uploader: uploader ?? undefined,
    uploader_id: strOrNone(uploaderId) ?? undefined,
    uploader_url: formatField(uploader, null, "https://www.younow.com/%s") ?? undefined,
    formats: [{
      url: `https://hls.younow.com/momentsplaylists/live/${momentId}/${momentId}.m3u8`,
      ext: "mp4",
      protocol: "m3u8_native",
    }],
  };
}

export class YouNowLiveIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?younow\.com/(?<id>[^/?#&]+)`;

  static override suitable(url: string): boolean {
    return YouNowChannelIE.suitable(url) || YouNowMomentIE.suitable(url) ? false : super.suitable(url);
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const username = this.matchId(url);
    const data = await this.downloadJson<Record<string, unknown>>(`https://api.younow.com/php/api/broadcast/info/curId=0/user=${username}`, username) as Record<string, unknown> | false;
    if (!data) {
      throw new ExtractorError("Unable to download YouNow broadcast info", { videoId: username });
    }
    if (data.errorCode !== 0) {
      throw new ExtractorError(String(data.errorMsg ?? "YouNow broadcast is unavailable"), { expected: true, videoId: username });
    }
    const uploader = tryGet(data, (value) => (value as { user?: { profileUrlString?: string } }).user?.profileUrlString, (value): value is string => typeof value === "string") ?? username;
    return {
      id: uploader,
      is_live: true,
      title: uploader,
      thumbnail: data.awsUrl,
      tags: data.tags,
      categories: data.tags,
      uploader,
      uploader_id: data.userId,
      uploader_url: `https://www.younow.com/${username}`,
      creator: uploader,
      view_count: intOrNone(data.viewers) ?? undefined,
      like_count: intOrNone(data.likes) ?? undefined,
      formats: [{
        url: `${CDN_API_BASE}/broadcast/videoPath/hls=1/broadcastId=${data.broadcastId}/channelId=${data.userId}`,
        ext: "mp4",
        protocol: "m3u8",
      }],
    };
  }
}

export class YouNowChannelIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?younow\.com/(?<id>[^/]+)/channel`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const username = this.matchId(url);
    const info = await this.downloadJson<Record<string, unknown>>(`https://api.younow.com/php/api/broadcast/info/curId=0/user=${username}`, username, { note: "Downloading user information" }) as Record<string, unknown> | false;
    const channelId = String(info ? info.userId : username);
    const page = await this.downloadJson<Record<string, unknown>>(`${CDN_API_BASE}/moment/profile/channelId=${channelId}/createdBefore=0/records=20`, username, { note: "Downloading moments page 1" }) as Record<string, unknown> | false;
    const entries: ExtractorInfo[] = [];
    const items = page && Array.isArray(page.items) ? page.items : [];
    for (const item of items) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        continue;
      }
      const entry = extractMoment(item as Record<string, unknown>, false);
      if (entry) {
        entries.push(entry);
      }
    }
    return this.playlistResult(entries, channelId, `${username} moments`);
  }
}

export class YouNowMomentIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?younow\.com/[^/]+/(?<id>[^/?#&]+)`;

  static override suitable(url: string): boolean {
    return YouNowChannelIE.suitable(url) ? false : super.suitable(url);
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const item = await this.downloadJson<{ item?: Record<string, unknown> }>(`${MOMENT_URL_FORMAT}${videoId}`, videoId) as { item?: Record<string, unknown> } | false;
    if (!item || !item.item) {
      throw new ExtractorError("Unable to download YouNow moment", { videoId });
    }
    return extractMoment(item.item) as ExtractorInfo;
  }
}
