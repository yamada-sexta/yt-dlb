// Source: yt_dlp/extractor/youtube/_notifications.py
// Port note: URL routing is migrated; authenticated notification menu pagination is pending.

import { z } from "zod";

import { NotImplementedError } from "../../errors.ts";
import { traverseObj } from "../../utils/traversal.ts";
import { type ExtractorInfo } from "../common.ts";
import { YoutubeTabBaseInfoExtractor } from "./tab.ts";
import { YoutubeTabIE } from "./tab.ts";
import { YoutubeIE } from "./video.ts";

const BrowseEndpointSchema = z.object({
  browseId: z.string().optional(),
  canonicalBaseUrl: z.string().optional(),
}).passthrough();

export class YoutubeNotificationsIE extends YoutubeTabBaseInfoExtractor {
  static override readonly _VALID_URL = String.raw`:ytnotif(?:ication)?s?`;
  static readonly _LOGIN_REQUIRED = true;
  static readonly IE_DESC = 'YouTube notifications; ":ytnotif" keyword (requires cookies)';

  static override get IE_NAME(): string {
    return "youtube:notif";
  }

  protected extractNotificationRenderer(notification: unknown): ExtractorInfo | null {
    const videoId = firstString(traverseObj<string>(notification, ["navigationEndpoint", "watchEndpoint", "videoId"], {
      expected_type: isString,
      get_all: false,
    }));
    let url: string;
    let channelId: string | null = null;
    if (videoId) {
      url = `https://www.youtube.com/watch?v=${videoId}`;
    } else {
      const browseEndpoint = BrowseEndpointSchema.safeParse(traverseObj<unknown>(notification, ["navigationEndpoint", "browseEndpoint"], { get_all: false }));
      if (!browseEndpoint.success) {
        return null;
      }
      channelId = this.ucidOrNone(browseEndpoint.data.browseId);
      const postId = /\/post\/(.+)/.exec(browseEndpoint.data.canonicalBaseUrl ?? "")?.[1] ?? null;
      if (!channelId || !postId) {
        return null;
      }
      url = `https://www.youtube.com/channel/${channelId}/community?lb=${postId}`;
    }

    const channel = firstString(traverseObj<string>(notification, [
      "contextualMenu",
      "menuRenderer",
      "items",
      1,
      "menuServiceItemRenderer",
      "text",
      "runs",
      1,
      "text",
    ], { expected_type: isString, get_all: false }));
    const notificationTitle = this.getText(notification, "shortMessage")?.replaceAll("\xad", "") ?? null;
    const title = notificationTitle
      ? new RegExp(`${RegExp.escape(channel ?? "")}[^:]+: (.+)`).exec(notificationTitle)?.[1] ?? null
      : null;

    return {
      ...this.urlResult(url, videoId ? YoutubeIE : YoutubeTabIE),
      video_id: videoId,
      ...(title ? { title } : {}),
      channel_id: channelId,
      channel,
      uploader: channel,
      thumbnails: this.extractThumbnails(notification, "videoThumbnail"),
    };
  }

  protected _extract_notification_renderer(notification: unknown): ExtractorInfo | null {
    return this.extractNotificationRenderer(notification);
  }

  protected override async realExtract(_url: string): Promise<ExtractorInfo | null> {
    throw new NotImplementedError("YouTube notification menu pagination");
  }
}

function firstString(value: string | string[] | null): string | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
