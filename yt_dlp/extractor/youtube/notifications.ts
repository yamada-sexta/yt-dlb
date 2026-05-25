// Source: yt_dlp/extractor/youtube/_notifications.py
// Port note: authenticated notification menu pagination uses the shared Innertube API helpers.

import { z } from "zod";

import { traverseObj } from "../../utils/traversal.ts";
import type { ExtractorInfo } from "../common.ts";
import { YoutubeTabBaseInfoExtractor } from "./tab.ts";
import { YoutubeTabIE } from "./tab.ts";
import { YoutubeIE } from "./video.ts";

const BrowseEndpointSchema = z
  .object({
    browseId: z.string().optional(),
    canonicalBaseUrl: z.string().optional(),
  })
  .passthrough();
const RecordSchema = z.record(z.string(), z.unknown());

export class YoutubeNotificationsIE extends YoutubeTabBaseInfoExtractor {
  static override readonly _VALID_URL = String.raw`:ytnotif(?:ication)?s?`;
  static readonly _LOGIN_REQUIRED = true;
  static readonly IE_DESC =
    'YouTube notifications; ":ytnotif" keyword (requires cookies)';

  static override get IE_NAME(): string {
    return "youtube:notif";
  }

  protected extractNotificationRenderer(
    notification: unknown,
  ): ExtractorInfo | null {
    const videoId = firstString(
      traverseObj<string>(
        notification,
        ["navigationEndpoint", "watchEndpoint", "videoId"],
        {
          expected_type: isString,
          get_all: false,
        },
      ),
    );
    let url: string;
    let channelId: string | null = null;
    if (videoId) {
      url = `https://www.youtube.com/watch?v=${videoId}`;
    } else {
      const browseEndpoint = BrowseEndpointSchema.safeParse(
        traverseObj<unknown>(
          notification,
          ["navigationEndpoint", "browseEndpoint"],
          { get_all: false },
        ),
      );
      if (!browseEndpoint.success) {
        return null;
      }
      channelId = this.ucidOrNone(browseEndpoint.data.browseId);
      const postId =
        /\/post\/(.+)/.exec(browseEndpoint.data.canonicalBaseUrl ?? "")?.[1] ??
        null;
      if (!channelId || !postId) {
        return null;
      }
      url = `https://www.youtube.com/channel/${channelId}/community?lb=${postId}`;
    }

    const channel = firstString(
      traverseObj<string>(
        notification,
        [
          "contextualMenu",
          "menuRenderer",
          "items",
          1,
          "menuServiceItemRenderer",
          "text",
          "runs",
          1,
          "text",
        ],
        { expected_type: isString, get_all: false },
      ),
    );
    const notificationTitle =
      this.getText(notification, "shortMessage")?.replaceAll("\xad", "") ??
      null;
    const title = notificationTitle
      ? (new RegExp(`${RegExp.escape(channel ?? "")}[^:]+: (.+)`).exec(
          notificationTitle,
        )?.[1] ?? null)
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

  protected *extractNotificationMenu(
    response: unknown,
    continuationList: Array<Record<string, unknown> | null>,
  ): Iterable<ExtractorInfo> {
    continuationList[0] = null;
    const notificationList = firstArray([
      traverseObj<unknown>(
        response,
        [
          "actions",
          0,
          "openPopupAction",
          "popup",
          "multiPageMenuRenderer",
          "sections",
          0,
          "multiPageMenuNotificationSectionRenderer",
          "items",
        ],
        { get_all: false },
      ),
      traverseObj<unknown>(
        response,
        ["actions", 0, "appendContinuationItemsAction", "continuationItems"],
        { get_all: false },
      ),
    ]);
    for (const item of notificationList) {
      if (!isRecord(item)) {
        continue;
      }
      const entry = this.extractNotificationRenderer(item.notificationRenderer);
      if (entry) {
        yield entry;
      }
      if (isRecord(item.continuationItemRenderer)) {
        continuationList[0] = item.continuationItemRenderer;
      }
    }
  }

  protected _extract_notification_renderer(
    notification: unknown,
  ): ExtractorInfo | null {
    return this.extractNotificationRenderer(notification);
  }

  protected _extract_notification_menu(
    response: unknown,
    continuationList: Array<Record<string, unknown> | null>,
  ): Iterable<ExtractorInfo> {
    return this.extractNotificationMenu(response, continuationList);
  }

  protected async notificationMenuEntries(
    ytcfg: Record<string, unknown>,
  ): Promise<ExtractorInfo[]> {
    const entries: ExtractorInfo[] = [];
    const continuationList: Array<Record<string, unknown> | null> = [null];
    let previousResponse: Record<string, unknown> | null = null;
    for (let page = 1; ; page += 1) {
      const ctoken = nestedString(continuationList[0], [
        "continuationEndpoint",
        "getNotificationMenuEndpoint",
        "ctoken",
      ]);
      const response = await this.callApi<unknown>(
        "notification/get_notification_menu",
        ctoken ? { ctoken } : {},
        `page ${page}`,
        {
          headers: this.generateApiHeaders({
            ytcfg,
            visitorData: this.extractVisitorData(previousResponse),
          }),
          context: this.extractContext(ytcfg),
          note: "Downloading notification menu API JSON",
          errnote: "Unable to download notification menu API page",
        },
      );
      const parsedResponse = RecordSchema.safeParse(response);
      if (!parsedResponse.success) {
        break;
      }
      previousResponse = parsedResponse.data;
      entries.push(
        ...this.extractNotificationMenu(parsedResponse.data, continuationList),
      );
      if (!continuationList[0]) {
        break;
      }
    }
    return entries;
  }

  protected _notification_menu_entries(
    ytcfg: Record<string, unknown>,
  ): Promise<ExtractorInfo[]> {
    return this.notificationMenuEntries(ytcfg);
  }

  protected override async realExtract(
    _url: string,
  ): Promise<ExtractorInfo | null> {
    const displayId = "notifications";
    return this.playlistResult(
      await this.notificationMenuEntries({}),
      displayId,
      displayId,
    );
  }
}

function firstString(value: string | string[] | null): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function firstArray(values: readonly unknown[]): unknown[] {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
}

function nestedString(
  value: unknown,
  path: readonly (string | number)[],
): string | null {
  let current = value;
  for (const key of path) {
    if (typeof key === "number") {
      if (!Array.isArray(current)) {
        return null;
      }
      current = current[key];
      continue;
    }
    if (!isRecord(current)) {
      return null;
    }
    current = current[key];
  }
  return typeof current === "string" ? current : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return RecordSchema.safeParse(value).success;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
