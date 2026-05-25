// Source: yt_dlp/extractor/youtube/_tab.py
// Port note: tab browsing is a large pending migration; currently this is an explicit boundary for redirect extractors.

import { NotImplementedError } from "../../errors.ts";
import { intOrNone, parseDuration, urljoin } from "../../utils/index.ts";
import { Ellipsis, traverseObj } from "../../utils/traversal.ts";
import { type ExtractorInfo } from "../common.ts";
import { BadgeType, YoutubeBaseInfoExtractor } from "./base.ts";
import { YoutubeIE } from "./video.ts";

export class YoutubeTabBaseInfoExtractor extends YoutubeBaseInfoExtractor {
  protected extractBasicItemRenderer(item: unknown): Record<string, unknown> | null {
    if (!isRecord(item)) {
      return null;
    }
    const knownBasicRenderers = new Set([
      "playlistRenderer",
      "videoRenderer",
      "channelRenderer",
      "showRenderer",
      "reelItemRenderer",
    ]);
    for (const [key, renderer] of Object.entries(item)) {
      if (!isRecord(renderer)) {
        continue;
      }
      if (knownBasicRenderers.has(key) || (key.startsWith("grid") && key.endsWith("Renderer"))) {
        return renderer;
      }
    }
    return null;
  }

  protected extractVideo(renderer: Record<string, unknown>): ExtractorInfo | null {
    const videoId = typeof renderer.videoId === "string" ? renderer.videoId : null;
    if (!videoId) {
      return null;
    }
    const title = this.getText(renderer, "title", "headline");
    const description = this.getText(renderer, "descriptionSnippet", ["detailedMetadataSnippets", Ellipsis, "snippetText"]);
    const duration = intOrNone(renderer.lengthSeconds) ?? parseDuration(this.getText(renderer, "lengthText", ["thumbnailOverlays", Ellipsis, "thumbnailOverlayTimeStatusRenderer", "text"]));
    const channelId = this.ucidOrNone(firstString(traverseObj<string>(renderer, [
      "shortBylineText",
      "runs",
      Ellipsis,
      "navigationEndpoint",
      "browseEndpoint",
      "browseId",
    ], { expected_type: isString, get_all: false })));
    const overlayStyle = firstString(traverseObj<string>(renderer, [
      "thumbnailOverlays",
      Ellipsis,
      "thumbnailOverlayTimeStatusRenderer",
      "style",
    ], { expected_type: isString, get_all: false }));
    const badges = this.extractBadges(renderer.badges);
    const ownerBadges = this.extractBadges(renderer.ownerBadges);
    const navigationUrl = urljoin("https://www.youtube.com/", firstString(traverseObj<string>(renderer, [
      "navigationEndpoint",
      "commandMetadata",
      "webCommandMetadata",
      "url",
    ], { expected_type: isString, get_all: false }))) ?? "";
    const url = overlayStyle === "SHORTS" || navigationUrl.includes("/shorts/")
      ? `https://www.youtube.com/shorts/${videoId}`
      : `https://www.youtube.com/watch?v=${videoId}`;
    const timeText = this.getText(renderer, "publishedTimeText", "videoInfo") ?? "";
    const liveStatus = overlayStyle === "LIVE" || this.hasBadge(badges, BadgeType.LIVE_NOW)
      ? "is_live"
      : timeText.toLowerCase().includes("streamed") ? "was_live" : null;
    const viewCountText = this.getText(renderer, "viewCountText", "shortViewCountText", "videoInfo") ?? "";
    const viewCount = viewCountText.toLowerCase().includes("no views") ? 0 : this.getCount({ simpleText: viewCountText });
    const channel = this.getText(renderer, "ownerText", "shortBylineText");
    const channelHandle = this.extractHandleFromBylineRuns(renderer);

    return this.urlResult(url, YoutubeIE, videoId, title, {
      description,
      duration,
      channel_id: channelId,
      channel,
      channel_url: channelId ? `https://www.youtube.com/channel/${channelId}` : null,
      uploader: channel,
      uploader_id: channelHandle,
      uploader_url: channelHandle ? `https://www.youtube.com/${channelHandle}` : null,
      thumbnails: this.extractThumbnails(renderer, "thumbnail"),
      view_count: liveStatus ? undefined : viewCount,
      concurrent_view_count: liveStatus === "is_live" ? viewCount : undefined,
      live_status: liveStatus,
      channel_is_verified: this.hasBadge(ownerBadges, BadgeType.VERIFIED) ? true : null,
    });
  }

  protected extractChannelRenderer(renderer: Record<string, unknown>): ExtractorInfo | null {
    const channelId = this.ucidOrNone(renderer.channelId);
    if (!channelId) {
      return null;
    }
    const title = this.getText(renderer, "title");
    const channelHandle = this.extractHandleFromEndpoint(renderer.navigationEndpoint) ?? this.handleOrNone(this.getText(renderer, "subscriberCountText"));
    return this.urlResult(`https://www.youtube.com/channel/${channelId}`, YoutubeTabIE, channelId, title, {
      channel: title,
      uploader: title,
      channel_id: channelId,
      channel_url: `https://www.youtube.com/channel/${channelId}`,
      uploader_id: channelHandle,
      uploader_url: channelHandle ? `https://www.youtube.com/${channelHandle}` : null,
      channel_follower_count: this.getCount(renderer, "subscriberCountText", "videoCountText"),
      thumbnails: this.extractThumbnails(renderer, "thumbnail"),
      playlist_count: this.getCount(renderer, "subscriberCountText") == null ? null : this.getCount(renderer, "videoCountText"),
      description: this.getText(renderer, "descriptionSnippet"),
      channel_is_verified: this.hasBadge(this.extractBadges(renderer.ownerBadges), BadgeType.VERIFIED) ? true : null,
    });
  }

  protected *gridEntries(gridRenderer: unknown): Iterable<ExtractorInfo> {
    const items = traverseObj<unknown>(gridRenderer, "items");
    for (const item of Array.isArray(items) ? items : []) {
      const renderer = this.extractBasicItemRenderer(item);
      if (!renderer) {
        continue;
      }
      const title = this.getText(renderer, "title");
      if (typeof renderer.playlistId === "string") {
        yield this.urlResult(`https://www.youtube.com/playlist?list=${renderer.playlistId}`, YoutubeTabIE, renderer.playlistId, title);
        continue;
      }
      if (typeof renderer.videoId === "string") {
        const entry = this.extractVideo(renderer);
        if (entry) {
          yield entry;
        }
        continue;
      }
      if (typeof renderer.channelId === "string") {
        const entry = this.extractChannelRenderer(renderer);
        if (entry) {
          yield entry;
        }
        continue;
      }
      const endpointUrl = urljoin("https://www.youtube.com/", firstString(traverseObj<string>(renderer, [
        "navigationEndpoint",
        "commandMetadata",
        "webCommandMetadata",
        "url",
      ], { expected_type: isString, get_all: false })));
      if (!endpointUrl) {
        continue;
      }
      for (const Extractor of [YoutubeTabIE, YoutubePlaylistIE, YoutubeIE] as const) {
        if (Extractor.suitable(endpointUrl)) {
          yield this.urlResult(endpointUrl, Extractor, Extractor.getTempId(endpointUrl), title);
          break;
        }
      }
    }
  }

  private extractHandleFromBylineRuns(renderer: Record<string, unknown>): string | null {
    const runs = traverseObj<unknown>(renderer, ["shortBylineText", "runs", Ellipsis]);
    for (const run of Array.isArray(runs) ? runs : []) {
      const handle = this.extractHandleFromEndpoint(isRecord(run) ? run.navigationEndpoint : null);
      if (handle) {
        return handle;
      }
    }
    return null;
  }

  private extractHandleFromEndpoint(endpoint: unknown): string | null {
    return this.handleFromUrl(firstString(traverseObj<string>(endpoint, ["commandMetadata", "webCommandMetadata", "url"], {
      expected_type: isString,
      get_all: false,
    }))) ?? this.handleFromUrl(firstString(traverseObj<string>(endpoint, ["browseEndpoint", "canonicalBaseUrl"], {
      expected_type: isString,
      get_all: false,
    })));
  }

  protected _extract_basic_item_renderer(item: unknown): Record<string, unknown> | null {
    return this.extractBasicItemRenderer(item);
  }

  protected _extract_video(renderer: Record<string, unknown>): ExtractorInfo | null {
    return this.extractVideo(renderer);
  }

  protected _extract_channel_renderer(renderer: Record<string, unknown>): ExtractorInfo | null {
    return this.extractChannelRenderer(renderer);
  }

  protected _grid_entries(gridRenderer: unknown): Iterable<ExtractorInfo> {
    return this.gridEntries(gridRenderer);
  }

  protected override async realExtract(_url: string): Promise<ExtractorInfo | null> {
    throw new NotImplementedError("YouTube tab base extraction");
  }
}

export class YoutubeTabIE extends YoutubeTabBaseInfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?!consent\.)(?:\w+\.)?youtube(?:kids)?\.com/(?:(?<channel_type>channel|c|user|browse)/|(?<not_channel>feed/|hashtag/|(?:playlist|watch)\?.*?\blist=)|(?!(?:${YoutubeBaseInfoExtractor._RESERVED_NAMES})\b))(?<id>[^/?#&]+)`;

  static override suitable(url: string): boolean {
    return YoutubeIE.suitable(url) ? false : super.suitable(url);
  }

  static override get IE_NAME(): string {
    return "youtube:tab";
  }
}

export class YoutubePlaylistIE extends YoutubeTabIE {
  static override readonly _VALID_URL = String.raw`^(?:(?:https?://)?(?:\w+\.)?youtube(?:kids)?\.com/.*?\?.*?\blist=)?(?<id>${YoutubeBaseInfoExtractor._PLAYLIST_ID_RE})`;

  static override suitable(url: string): boolean {
    if (YoutubeTabIE.suitable(url) || hasQueryValue(url, "v")) {
      return false;
    }
    return super.suitable(url);
  }

  static override get IE_NAME(): string {
    return "youtube:playlist";
  }
}

function hasQueryValue(url: string, key: string): boolean {
  try {
    return Boolean(new URL(url).searchParams.get(key));
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function firstString(value: string | string[] | null): string | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
