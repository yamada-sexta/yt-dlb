// Source: yt_dlp/extractor/youtube/_tab.py
// Port note: tab browsing is a large pending migration; currently this is an explicit boundary for redirect extractors.

import { NotImplementedError } from "../../errors.ts";
import { intOrNone, parseCount, parseDuration, parseQs, updateUrlQuery, urljoin } from "../../utils/index.ts";
import { Ellipsis, traverseObj } from "../../utils/traversal.ts";
import { type ExtractorInfo } from "../common.ts";
import { BadgeType, YoutubeBaseInfoExtractor } from "./base.ts";
import { YoutubeIE } from "./video.ts";
import { z } from "zod";

const RecordSchema = z.record(z.string(), z.unknown());

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

  protected musicResponsiveListEntry(renderer: Record<string, unknown>): ExtractorInfo | null {
    const videoId = nestedString(renderer, ["playlistItemData", "videoId"]);
    if (videoId) {
      const title = nestedString(renderer, ["flexColumns", 0, "musicResponsiveListItemFlexColumnRenderer", "text", "runs", 0, "text"]);
      return this.urlResult(`https://music.youtube.com/watch?v=${videoId}`, YoutubeIE, videoId, title);
    }

    const playlistId = nestedString(renderer, ["navigationEndpoint", "watchEndpoint", "playlistId"]);
    if (playlistId) {
      const endpointVideoId = nestedString(renderer, ["navigationEndpoint", "watchEndpoint", "videoId"]);
      return endpointVideoId
        ? this.urlResult(`https://music.youtube.com/watch?v=${endpointVideoId}&list=${playlistId}`, YoutubeTabIE, playlistId)
        : this.urlResult(`https://music.youtube.com/playlist?list=${playlistId}`, YoutubeTabIE, playlistId);
    }

    const browseId = nestedString(renderer, ["navigationEndpoint", "browseEndpoint", "browseId"]);
    return browseId ? this.urlResult(`https://music.youtube.com/browse/${browseId}`, YoutubeTabIE, browseId) : null;
  }

  protected *shelfEntriesFromContent(shelfRenderer: Record<string, unknown>): Iterable<ExtractorInfo> {
    const content = isRecord(shelfRenderer.content) ? shelfRenderer.content : null;
    if (!content) {
      return;
    }
    const renderer = firstRecord([content.gridRenderer, content.expandedShelfContentsRenderer]);
    if (renderer) {
      yield* this.gridEntries(renderer);
    }
  }

  protected *shelfEntries(shelfRenderer: Record<string, unknown>, skipChannels = false): Iterable<ExtractorInfo> {
    const endpointUrl = nestedString(shelfRenderer, ["endpoint", "commandMetadata", "webCommandMetadata", "url"]);
    const shelfUrl = endpointUrl ? urljoin("https://www.youtube.com", endpointUrl) : null;
    if (shelfUrl) {
      if (skipChannels && shelfUrl.includes("/channels?")) {
        return;
      }
      yield this.urlResult(shelfUrl, null, null, this.getText(shelfRenderer, "title"));
    }
    yield* this.shelfEntriesFromContent(shelfRenderer);
  }

  protected *playlistEntries(videoListRenderer: Record<string, unknown>): Iterable<ExtractorInfo> {
    const contents = Array.isArray(videoListRenderer.contents) ? videoListRenderer.contents : [];
    for (const content of contents) {
      if (!isRecord(content)) {
        continue;
      }
      const renderer = firstRecord([content.playlistVideoRenderer, content.playlistPanelVideoRenderer]);
      if (!renderer?.videoId) {
        continue;
      }
      const entry = this.extractVideo(renderer);
      if (entry) {
        yield entry;
      }
    }
  }

  protected extractLockupViewModel(viewModel: Record<string, unknown>): ExtractorInfo | null {
    const contentId = typeof viewModel.contentId === "string" ? viewModel.contentId : null;
    if (!contentId) {
      return null;
    }

    const contentType = typeof viewModel.contentType === "string" ? viewModel.contentType : null;
    let url: string;
    let ie: typeof YoutubeIE | typeof YoutubeTabIE;
    if (contentType === "LOCKUP_CONTENT_TYPE_VIDEO") {
      ie = YoutubeIE;
      url = `https://www.youtube.com/watch?v=${contentId}`;
    } else if (contentType === "LOCKUP_CONTENT_TYPE_PLAYLIST" || contentType === "LOCKUP_CONTENT_TYPE_PODCAST") {
      ie = YoutubeTabIE;
      url = `https://www.youtube.com/playlist?list=${contentId}`;
    } else {
      this.reportWarning(`Unsupported lockup view model content type "${contentType}"`, null, true);
      return null;
    }

    const durationText = firstStringDeep(viewModel, [
      ["contentImage", "thumbnailViewModel", "overlays", Ellipsis, "thumbnailBottomOverlayViewModel", "badges", Ellipsis, "thumbnailBadgeViewModel", "text"],
      ["contentImage", "thumbnailViewModel", "overlays", Ellipsis, "thumbnailOverlayBadgeViewModel", "thumbnailBadges", Ellipsis, "thumbnailBadgeViewModel", "text"],
    ]);
    return this.urlResult(url, ie, contentId, nestedString(viewModel, ["metadata", "lockupMetadataViewModel", "title", "content"]), {
      duration: parseDuration(durationText),
    });
  }

  protected *richEntries(richItemRenderer: Record<string, unknown>): Iterable<ExtractorInfo> {
    const lockupViewModel = isRecord(nestedUnknown(richItemRenderer, ["content", "lockupViewModel"]))
      ? nestedUnknown(richItemRenderer, ["content", "lockupViewModel"]) as Record<string, unknown>
      : null;
    if (lockupViewModel) {
      const entry = this.extractLockupViewModel(lockupViewModel);
      if (entry) {
        yield entry;
      }
      return;
    }

    const renderer = firstRecord([
      nestedUnknown(richItemRenderer, ["content", "videoRenderer"]),
      nestedUnknown(richItemRenderer, ["content", "reelItemRenderer"]),
      nestedUnknown(richItemRenderer, ["content", "playlistRenderer"]),
      nestedUnknown(richItemRenderer, ["content", "shortsLockupViewModel"]),
    ]);
    if (!renderer) {
      return;
    }

    if (typeof renderer.videoId === "string") {
      const entry = this.extractVideo(renderer);
      if (entry) {
        yield entry;
      }
      return;
    }
    if (typeof renderer.playlistId === "string") {
      yield this.urlResult(`https://www.youtube.com/playlist?list=${renderer.playlistId}`, YoutubeTabIE, renderer.playlistId, this.getText(renderer, "title"));
      return;
    }

    if (typeof renderer.entityId === "string") {
      const videoId = nestedString(renderer, ["onTap", "innertubeCommand", "reelWatchEndpoint", "videoId"]);
      if (!videoId) {
        return;
      }
      const accessibilityText = typeof renderer.accessibilityText === "string" ? renderer.accessibilityText : "";
      const title = nestedString(renderer, ["overlayMetadata", "primaryText", "content"]) ?? /^(.+), (?:[\d,.]+(?:[KM]| million)?|No) views? - play Short$/.exec(accessibilityText)?.[1] ?? null;
      yield this.urlResult(`https://www.youtube.com/shorts/${videoId}`, YoutubeIE, videoId, title, {
        view_count: parseCount(nestedString(renderer, ["overlayMetadata", "secondaryText", "content"])),
      });
    }
  }

  protected videoEntry(videoRenderer: Record<string, unknown>): ExtractorInfo | null {
    return typeof videoRenderer.videoId === "string" ? this.extractVideo(videoRenderer) : null;
  }

  protected hashtagTileEntry(hashtagTileRenderer: Record<string, unknown>): ExtractorInfo | null {
    const url = urljoin("https://youtube.com", nestedString(hashtagTileRenderer, ["onTapCommand", "commandMetadata", "webCommandMetadata", "url"]));
    return url ? this.urlResult(url, YoutubeTabIE, null, this.getText(hashtagTileRenderer, "hashtag")) : null;
  }

  protected *postThreadEntries(postThreadRenderer: Record<string, unknown>): Iterable<ExtractorInfo> {
    const postRenderer = isRecord(nestedUnknown(postThreadRenderer, ["post", "backstagePostRenderer"]))
      ? nestedUnknown(postThreadRenderer, ["post", "backstagePostRenderer"]) as Record<string, unknown>
      : null;
    if (!postRenderer) {
      return;
    }
    const videoRenderer = firstRecord([nestedUnknown(postRenderer, ["backstageAttachment", "videoRenderer"])]);
    const videoId = typeof videoRenderer?.videoId === "string" ? videoRenderer.videoId : null;
    if (videoRenderer && videoId) {
      const entry = this.extractVideo(videoRenderer);
      if (entry) {
        yield entry;
      }
    }
    const playlistId = nestedString(postRenderer, ["backstageAttachment", "playlistRenderer", "playlistId"]);
    if (playlistId) {
      yield this.urlResult(`https://www.youtube.com/playlist?list=${playlistId}`, YoutubeTabIE, playlistId);
    }
    const runs = Array.isArray(nestedUnknown(postRenderer, ["contentText", "runs"]))
      ? nestedUnknown(postRenderer, ["contentText", "runs"]) as unknown[]
      : [];
    for (const run of runs) {
      const endpointUrl = nestedString(run, ["navigationEndpoint", "urlEndpoint", "url"]);
      if (!endpointUrl || !YoutubeIE.suitable(endpointUrl)) {
        continue;
      }
      const endpointVideoId = YoutubeIE.matchValidUrl(endpointUrl)?.groups?.id ?? null;
      if (!endpointVideoId || endpointVideoId === videoId) {
        continue;
      }
      yield this.urlResult(endpointUrl, YoutubeIE, endpointVideoId);
    }
  }

  protected *postThreadContinuationEntries(postThreadContinuation: Record<string, unknown>): Iterable<ExtractorInfo> {
    const contents = Array.isArray(postThreadContinuation.contents) ? postThreadContinuation.contents : [];
    for (const content of contents) {
      if (!isRecord(content)) {
        continue;
      }
      if (isRecord(content.backstagePostThreadRenderer)) {
        yield* this.postThreadEntries(content.backstagePostThreadRenderer);
      } else if (isRecord(content.videoRenderer)) {
        const entry = this.videoEntry(content.videoRenderer);
        if (entry) {
          yield entry;
        }
      }
    }
  }

  protected *reportHistoryEntries(renderer: unknown): Iterable<ExtractorInfo> {
    const urls = collectStringsByKey(renderer, "url");
    for (const url of urls) {
      const fullUrl = urljoin("https://www.youtube.com", url);
      if (fullUrl && YoutubeIE.suitable(fullUrl)) {
        yield this.urlResult(fullUrl, YoutubeIE);
      }
    }
  }

  protected *extractEntries(parentRenderer: Record<string, unknown>, continuationList: Array<Record<string, unknown> | null>): Iterable<ExtractorInfo> {
    continuationList[0] = null;
    const contents = Array.isArray(parentRenderer.contents) ? parentRenderer.contents : [];
    for (const content of contents) {
      if (!isRecord(content)) {
        continue;
      }
      const itemSection = firstRecord([content.itemSectionRenderer, content.musicShelfRenderer, content.musicShelfContinuation]);
      if (!itemSection) {
        if (isRecord(content.richItemRenderer)) {
          yield* this.richEntries(content.richItemRenderer);
          continuationList[0] = YoutubeBaseInfoExtractor.extractContinuation(parentRenderer);
        } else if (isRecord(content.reportHistorySectionRenderer)) {
          yield* this.reportHistoryEntries(nestedUnknown(content, ["reportHistorySectionRenderer", "table", "tableRenderer"]));
        }
        continue;
      }

      const itemContents = Array.isArray(itemSection.contents) ? itemSection.contents : [];
      for (const item of itemContents) {
        if (!isRecord(item)) {
          continue;
        }
        yield* this.entriesFromKnownRenderer(item, continuationList);
      }
      continuationList[0] ??= YoutubeBaseInfoExtractor.extractContinuation(itemSection);
    }
    continuationList[0] ??= YoutubeBaseInfoExtractor.extractContinuation(parentRenderer);
  }

  private *entriesFromKnownRenderer(item: Record<string, unknown>, continuationList: Array<Record<string, unknown> | null>): Iterable<ExtractorInfo> {
    for (const [key, value] of Object.entries(item)) {
      if (!isRecord(value)) {
        continue;
      }
      let entries: Iterable<ExtractorInfo | null> | null = null;
      if (key === "playlistVideoListRenderer") {
        entries = this.playlistEntries(value);
      } else if (key === "gridRenderer" || key === "reelShelfRenderer") {
        entries = this.gridEntries(value);
      } else if (key === "shelfRenderer") {
        entries = this.shelfEntries(value);
      } else if (key === "musicResponsiveListItemRenderer") {
        entries = [this.musicResponsiveListEntry(value)];
      } else if (key === "backstagePostThreadRenderer") {
        entries = this.postThreadEntries(value);
      } else if (key === "gridPlaylistRenderer" || key === "gridVideoRenderer" || key === "gridChannelRenderer") {
        entries = this.gridEntries({ items: [{ [key]: value }] });
      } else if (key === "playlistVideoRenderer") {
        entries = this.playlistEntries({ contents: [{ playlistVideoRenderer: value }] });
      } else if (key === "playlistVideoListContinuation") {
        entries = this.playlistEntries(value);
      } else if (key === "gridContinuation") {
        entries = this.gridEntries(value);
      } else if (key === "sectionListContinuation") {
        entries = this.extractEntries(value, continuationList);
      } else if (key === "itemSectionContinuation") {
        entries = this.postThreadContinuationEntries(value);
      } else if (key === "reportHistoryTableRowRenderer") {
        entries = this.reportHistoryEntries({ rows: [value] });
      } else if (key === "videoRenderer") {
        entries = [this.videoEntry(value)];
      } else if (key === "playlistRenderer") {
        entries = this.gridEntries({ items: [{ playlistRenderer: value }] });
      } else if (key === "channelRenderer") {
        entries = this.gridEntries({ items: [{ channelRenderer: value }] });
      } else if (key === "hashtagTileRenderer") {
        entries = [this.hashtagTileEntry(value)];
      } else if (key === "richGridRenderer") {
        entries = this.extractEntries(value, continuationList);
      } else if (key === "lockupViewModel") {
        entries = [this.extractLockupViewModel(value)];
      }
      if (!entries) {
        continue;
      }
      for (const entry of entries) {
        if (entry) {
          yield entry;
        }
      }
      continuationList[0] = YoutubeBaseInfoExtractor.extractContinuation(value);
      break;
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

  protected _music_reponsive_list_entry(renderer: Record<string, unknown>): ExtractorInfo | null {
    return this.musicResponsiveListEntry(renderer);
  }

  protected _shelf_entries_from_content(shelfRenderer: Record<string, unknown>): Iterable<ExtractorInfo> {
    return this.shelfEntriesFromContent(shelfRenderer);
  }

  protected _shelf_entries(shelfRenderer: Record<string, unknown>, skipChannels = false): Iterable<ExtractorInfo> {
    return this.shelfEntries(shelfRenderer, skipChannels);
  }

  protected _playlist_entries(videoListRenderer: Record<string, unknown>): Iterable<ExtractorInfo> {
    return this.playlistEntries(videoListRenderer);
  }

  protected _extract_lockup_view_model(viewModel: Record<string, unknown>): ExtractorInfo | null {
    return this.extractLockupViewModel(viewModel);
  }

  protected _rich_entries(richGridRenderer: Record<string, unknown>): Iterable<ExtractorInfo> {
    return this.richEntries(richGridRenderer);
  }

  protected _video_entry(videoRenderer: Record<string, unknown>): ExtractorInfo | null {
    return this.videoEntry(videoRenderer);
  }

  protected _hashtag_tile_entry(hashtagTileRenderer: Record<string, unknown>): ExtractorInfo | null {
    return this.hashtagTileEntry(hashtagTileRenderer);
  }

  protected _post_thread_entries(postThreadRenderer: Record<string, unknown>): Iterable<ExtractorInfo> {
    return this.postThreadEntries(postThreadRenderer);
  }

  protected _post_thread_continuation_entries(postThreadContinuation: Record<string, unknown>): Iterable<ExtractorInfo> {
    return this.postThreadContinuationEntries(postThreadContinuation);
  }

  protected _report_history_entries(renderer: unknown): Iterable<ExtractorInfo> {
    return this.reportHistoryEntries(renderer);
  }

  protected _extract_entries(parentRenderer: Record<string, unknown>, continuationList: Array<Record<string, unknown> | null>): Iterable<ExtractorInfo> {
    return this.extractEntries(parentRenderer, continuationList);
  }

  static extractSelectedTab(tabs: readonly Record<string, unknown>[], fatal = true): Record<string, unknown> | null {
    const selected = tabs.find((tab) => tab.selected);
    if (!selected && fatal) {
      throw new Error("Unable to find selected tab");
    }
    return selected ?? null;
  }

  static _extract_selected_tab(tabs: readonly Record<string, unknown>[], fatal = true): Record<string, unknown> | null {
    return this.extractSelectedTab(tabs, fatal);
  }

  static extractTabRenderers(response: unknown): Record<string, unknown>[] {
    const tabs = nestedUnknown(response, ["contents", "twoColumnBrowseResultsRenderer", "tabs"]);
    return (Array.isArray(tabs) ? tabs : []).flatMap((tab) => {
      const renderer = firstRecord([nestedUnknown(tab, ["tabRenderer"]), nestedUnknown(tab, ["expandableTabRenderer"])]);
      return renderer ? [renderer] : [];
    });
  }

  static _extract_tab_renderers(response: unknown): Record<string, unknown>[] {
    return this.extractTabRenderers(response);
  }

  protected extractMetadataFromTabs(itemId: string, data: Record<string, unknown>): Record<string, unknown> {
    const metadataRenderer = firstRecord([
      nestedUnknown(data, ["metadata", "channelMetadataRenderer"]),
      nestedUnknown(data, ["metadata", "playlistMetadataRenderer"]),
    ]);
    const channelId = this.ucidOrNone(nestedString(metadataRenderer, ["externalId"]))
      ?? this.ucidFromUrl(nestedString(metadataRenderer, ["channelUrl"]));
    const title = nestedString(metadataRenderer, ["title"])
      ?? this.getText(data, ["header", "hashtagHeaderRenderer", "hashtag"])
      ?? itemId;
    const handle = this.handleFromUrl(nestedString(metadataRenderer, ["vanityChannelUrl"]))
      ?? firstStringDeep(metadataRenderer, [["ownerUrls", Ellipsis]])?.replace(/^https?:\/\/(?:www\.)?youtube\.com\//, "") ?? null;
    const id = channelId ?? itemId;
    return {
      id,
      title,
      channel: nestedString(metadataRenderer, ["title"]) ?? null,
      channel_id: channelId,
      channel_url: channelId ? `https://www.youtube.com/channel/${channelId}` : null,
      uploader: nestedString(metadataRenderer, ["title"]) ?? null,
      uploader_id: handle,
      uploader_url: handle ? `https://www.youtube.com/${handle}` : null,
      description: nestedString(metadataRenderer, ["description"]) ?? "",
      tags: Array.isArray(nestedUnknown(data, ["microformat", "microformatDataRenderer", "tags"]))
        ? nestedUnknown(data, ["microformat", "microformatDataRenderer", "tags"])
        : [],
      thumbnails: this.extractThumbnails(metadataRenderer, "avatar"),
    };
  }

  protected _extract_metadata_from_tabs(itemId: string, data: Record<string, unknown>): Record<string, unknown> {
    return this.extractMetadataFromTabs(itemId, data);
  }

  protected entriesFromTab(tab: Record<string, unknown>): ExtractorInfo[] {
    const content = firstRecord([tab.content]);
    const parentRenderer = firstRecord([
      nestedUnknown(content, ["sectionListRenderer"]),
      nestedUnknown(content, ["richGridRenderer"]),
    ]);
    if (!parentRenderer) {
      return [];
    }
    const continuationList: Array<Record<string, unknown> | null> = [null];
    return [...this.extractEntries(parentRenderer, continuationList)];
  }

  protected extractFromTabs(itemId: string, data: Record<string, unknown>, tabs: readonly Record<string, unknown>[], webpageUrl: string): ExtractorInfo {
    const metadata = this.extractMetadataFromTabs(itemId, data);
    const selectedTab = YoutubeTabBaseInfoExtractor.extractSelectedTab(tabs) ?? {};
    const tabTitle = nestedString(selectedTab, ["title"]);
    const expandedText = nestedString(selectedTab, ["expandedText"]);
    const title = [metadata.title, tabTitle, expandedText].filter((part, index, array) => part && array.indexOf(part) === index).join(" - ");
    return this.playlistResult(this.entriesFromTab(selectedTab), String(metadata.id ?? itemId), title || String(metadata.title ?? itemId), typeof metadata.description === "string" ? metadata.description : null, {
      ...metadata,
      extractor_key: YoutubeTabIE.ieKey(),
      extractor: YoutubeTabIE.IE_NAME,
      webpage_url: webpageUrl,
    });
  }

  protected async extractFromTabsWithContinuations(itemId: string, ytcfg: Record<string, unknown>, data: Record<string, unknown>, tabs: readonly Record<string, unknown>[], webpageUrl: string): Promise<ExtractorInfo> {
    const metadata = this.extractMetadataFromTabs(itemId, data);
    const selectedTab = YoutubeTabBaseInfoExtractor.extractSelectedTab(tabs) ?? {};
    const tabTitle = nestedString(selectedTab, ["title"]);
    const expandedText = nestedString(selectedTab, ["expandedText"]);
    const title = [metadata.title, tabTitle, expandedText].filter((part, index, array) => part && array.indexOf(part) === index).join(" - ");
    return this.playlistResult(
      await this.entriesFromTabWithContinuations(selectedTab, String(metadata.id ?? itemId), ytcfg, data),
      String(metadata.id ?? itemId),
      title || String(metadata.title ?? itemId),
      typeof metadata.description === "string" ? metadata.description : null,
      {
        ...metadata,
        extractor_key: YoutubeTabIE.ieKey(),
        extractor: YoutubeTabIE.IE_NAME,
        webpage_url: webpageUrl,
      },
    );
  }

  protected async entriesFromTabWithContinuations(tab: Record<string, unknown>, itemId: string, ytcfg: Record<string, unknown>, data: Record<string, unknown>): Promise<ExtractorInfo[]> {
    const content = firstRecord([tab.content]);
    const parentRenderer = firstRecord([
      nestedUnknown(content, ["sectionListRenderer"]),
      nestedUnknown(content, ["richGridRenderer"]),
    ]);
    if (!parentRenderer) {
      return [];
    }

    const entries: ExtractorInfo[] = [];
    const continuationList: Array<Record<string, unknown> | null> = [null];
    entries.push(...this.extractEntries(parentRenderer, continuationList));

    const seenContinuations = new Set<string>();
    let continuation = continuationList[0];
    let visitorData = this.extractVisitorData(data, ytcfg);
    for (let pageNum = 1; continuation; pageNum += 1) {
      const continuationToken = typeof continuation.continuation === "string" ? continuation.continuation : null;
      if (continuationToken && seenContinuations.has(continuationToken)) {
        this.writeDebug("Detected YouTube feed looping - assuming end of feed.");
        break;
      }
      if (continuationToken) {
        seenContinuations.add(continuationToken);
      }
      const response = await this.callApi<unknown>("browse", continuation, `${itemId} page ${pageNum}`, {
        headers: this.generateApiHeaders({
          ytcfg,
          delegatedSessionId: this.extractDelegatedSessionId(ytcfg, data),
          visitorData,
        }),
        context: this.extractContext(ytcfg),
        note: "Downloading API JSON",
        errnote: "Unable to download API page",
      });
      const parsedResponse = RecordSchema.safeParse(response);
      if (!parsedResponse.success) {
        break;
      }
      visitorData = this.extractVisitorData(parsedResponse.data) ?? visitorData;
      const continuationItems = tabContinuationContentItems(parsedResponse.data);
      if (!continuationItems.length) {
        break;
      }
      continuationList[0] = null;
      entries.push(...this.extractEntries({ contents: continuationItems }, continuationList));
      continuation = continuationList[0] ?? YoutubeBaseInfoExtractor.extractContinuation({ contents: continuationItems });
    }
    return entries;
  }

  protected _extract_from_tabs(itemId: string, _ytcfg: unknown, data: Record<string, unknown>, tabs: readonly Record<string, unknown>[]): ExtractorInfo {
    return this.extractFromTabs(itemId, data, tabs, `https://www.youtube.com/${itemId}`);
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

  protected override async realExtract(url: string): Promise<ExtractorInfo | null> {
    const itemId = YoutubeTabIE.matchValidUrl(url)?.groups?.id ?? YoutubeTabIE.getTempId(url) ?? url;
    const normalizedUrl = normalizeYoutubeUrl(url);
    const webpage = await this.downloadWebpage(normalizedUrl, itemId, { note: "Downloading webpage" });
    if (webpage === false) {
      return null;
    }
    const ytcfg = this.extract_ytcfg(itemId, webpage);
    const data = this._extract_yt_initial_data(itemId, webpage, true);
    if (!data) {
      return null;
    }
    this._extract_and_report_alerts(data, true, true, true);

    const tabs = YoutubeTabBaseInfoExtractor.extractTabRenderers(data);
    if (tabs.length) {
      return await this.extractFromTabsWithContinuations(itemId, ytcfg, data, tabs, normalizedUrl);
    }

    const inlinePlaylist = firstRecord([nestedUnknown(data, ["contents", "twoColumnWatchNextResults", "playlist", "playlist"])]);
    if (inlinePlaylist) {
      const playlistId = nestedString(inlinePlaylist, ["playlistId"]) ?? itemId;
      return this.playlistResult([...this.playlistEntries(inlinePlaylist)], playlistId, nestedString(inlinePlaylist, ["title"]));
    }

    const videoId = nestedString(data, ["currentVideoEndpoint", "watchEndpoint", "videoId"]) ?? parseQs(normalizedUrl).v?.[0] ?? null;
    if (videoId) {
      this.reportWarning(`Unable to recognize playlist. Downloading just video ${videoId}`, itemId, true);
      return this.urlResult(`https://www.youtube.com/watch?v=${videoId}`, YoutubeIE, videoId);
    }

    void ytcfg;
    throw new Error("Unable to recognize tab page");
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

  protected override async realExtract(url: string): Promise<ExtractorInfo | null> {
    const playlistId = YoutubePlaylistIE.matchValidUrl(url)?.groups?.id;
    if (!playlistId) {
      throw new Error("Unable to extract YouTube playlist ID");
    }
    const qs = isUrlLike(url) ? parseQs(url) : {};
    const playlistUrl = updateUrlQuery("https://www.youtube.com/playlist", Object.keys(qs).length ? qs : { list: playlistId });
    return this.urlResult(playlistUrl, YoutubeTabIE, playlistId);
  }
}

function isUrlLike(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(url) || url.includes("?");
}

function hasQueryValue(url: string, key: string): boolean {
  try {
    return Boolean(new URL(url).searchParams.get(key));
  } catch {
    return false;
  }
}

function normalizeYoutubeUrl(url: string): string {
  const parsed = new URL(url, "https://www.youtube.com");
  parsed.hostname = "www.youtube.com";
  return parsed.toString();
}

function tabContinuationContentItems(response: Record<string, unknown>): unknown[] {
  return [
    nestedUnknown(response, ["onResponseReceivedActions", Ellipsis, "appendContinuationItemsAction", "continuationItems"]),
    nestedUnknown(response, ["onResponseReceivedEndpoints", Ellipsis, "appendContinuationItemsAction", "continuationItems"]),
    nestedUnknown(response, ["onResponseReceivedCommands", Ellipsis, "appendContinuationItemsAction", "continuationItems"]),
    nestedUnknown(response, ["continuationContents"]),
  ].flatMap((value) => Array.isArray(value) ? value : isRecord(value) ? [value] : [])
    .map((item) => isDirectContinuationRenderer(item) ? { itemSectionRenderer: { contents: [item] } } : item);
}

function isDirectContinuationRenderer(item: unknown): item is Record<string, unknown> {
  return isRecord(item) && !Object.keys(item).some((key) => key === "itemSectionRenderer" || key === "musicShelfRenderer" || key === "musicShelfContinuation" || key === "richItemRenderer" || key === "reportHistorySectionRenderer");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return RecordSchema.safeParse(value).success;
}

function firstRecord(values: readonly unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    if (isRecord(value)) {
      return value;
    }
  }
  return null;
}

function nestedUnknown(value: unknown, path: readonly (string | number | typeof Ellipsis)[]): unknown {
  const read = (current: unknown, keys: readonly (string | number | typeof Ellipsis)[]): unknown[] => {
    if (!keys.length) {
      return [current];
    }
    const [key, ...rest] = keys;
    if (key === undefined) {
      return [];
    }
    if (key === Ellipsis) {
      return (Array.isArray(current) ? current : []).flatMap((item) => read(item, rest));
    }
    if (typeof key === "number") {
      return Array.isArray(current) ? read(current[key], rest) : [];
    }
    return isRecord(current) ? read(current[key], rest) : [];
  };
  const values = read(value, path).filter((item) => item !== undefined && item !== null);
  return values.length > 1 ? values : values[0];
}

function nestedString(value: unknown, path: readonly (string | number | typeof Ellipsis)[]): string | null {
  const result = nestedUnknown(value, path);
  if (typeof result === "string") {
    return result;
  }
  if (Array.isArray(result)) {
    return result.find((item): item is string => typeof item === "string") ?? null;
  }
  return null;
}

function firstStringDeep(value: unknown, paths: readonly (readonly (string | number | typeof Ellipsis)[])[]): string | null {
  for (const path of paths) {
    const result = nestedString(value, path);
    if (result) {
      return result;
    }
  }
  return null;
}

function collectStringsByKey(value: unknown, key: string): string[] {
  const out: string[] = [];
  const visit = (item: unknown): void => {
    if (Array.isArray(item)) {
      for (const child of item) {
        visit(child);
      }
      return;
    }
    if (!isRecord(item)) {
      return;
    }
    for (const [childKey, childValue] of Object.entries(item)) {
      if (childKey === key && typeof childValue === "string") {
        out.push(childValue);
      } else {
        visit(childValue);
      }
    }
  };
  visit(value);
  return out;
}

function firstString(value: string | string[] | null): string | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
