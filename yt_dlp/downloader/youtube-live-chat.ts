// Source: yt_dlp/downloader/youtube_live_chat.py
// Port note: writes JSON-line chat actions directly with Bun FileSink instead of Python FragmentFD private temp hooks.

import { FileDownloader, type DownloadInfo } from "./common.ts";

type JsonRecord = Record<string, unknown>;

interface ContinuationResult {
  continuationId: string | null;
  offset: number;
  clickTrackingParams: string | null;
}

export class YoutubeLiveChatFD extends FileDownloader {
  override async realDownload(filename: string, info: DownloadInfo): Promise<boolean> {
    const videoId = typeof info.video_id === "string" ? info.video_id : typeof info.id === "string" ? info.id : "unknown";
    this.toScreen(`[${this.fdName}] Downloading live chat`);
    if (!this.params.skip_download && info.protocol === "youtube_live_chat") {
      this.ydl.reportWarning?.("Live chat download runs until the livestream ends. If you wish to download the video simultaneously, run a separate ytdlb instance");
    }
    const started = performance.now() / 1000;
    const tmpfilename = this.tempName(filename);
    const writer = Bun.file(tmpfilename).writer({ highWaterMark: Number(this.params.buffersize ?? 64 * 1024) });
    let downloaded = 0;
    try {
      const firstPage = await (await this.ydl.urlopen(new Request(info.url, { headers: info.http_headers }))).text();
      const initialData = extractNamedJson(firstPage, "ytInitialData");
      const ytcfg = extractYtcfg(firstPage);
      let continuationId = getPathString(initialData, [
        "contents",
        "twoColumnWatchNextResults",
        "conversationBar",
        "liveChatRenderer",
        "continuations",
        0,
        "reloadContinuationData",
        "continuation",
      ]);
      const apiKey = getPathString(ytcfg, ["INNERTUBE_API_KEY"]);
      const innertubeContext = getPathRecord(ytcfg, ["INNERTUBE_CONTEXT"]);
      if (!continuationId || !apiKey || !innertubeContext) {
        throw new Error(`Could not initialize YouTube live chat downloader for ${videoId}`);
      }
      const visitorData = getPathString(innertubeContext, ["client", "visitorData"]);
      const live = info.protocol === "youtube_live_chat";
      const endpoint = live
        ? `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat?key=${apiKey}`
        : `https://www.youtube.com/youtubei/v1/live_chat/get_live_chat_replay?key=${apiKey}`;
      let chatPageUrl = live
        ? `https://www.youtube.com/live_chat?continuation=${encodeURIComponent(continuationId)}`
        : `https://www.youtube.com/live_chat_replay?continuation=${encodeURIComponent(continuationId)}`;
      let fragIndex = 0;
      let offset = 0;
      let liveOffset = 0;
      let clickTrackingParams: string | null = null;
      const startTime = Date.now();
      while (continuationId) {
        fragIndex += 1;
        const fragment = fragIndex === 1
          ? await (await this.ydl.urlopen(new Request(chatPageUrl, { headers: info.http_headers }))).text()
          : await this.fetchContinuation(endpoint, innertubeContext, continuationId, offset, clickTrackingParams, visitorData, info.http_headers);
        const parsed = parseFragmentData(fragment);
        const liveChatContinuation = getPathRecord(parsed, ["continuationContents", "liveChatContinuation"]) ?? {};
        const result = live
          ? await this.writeLiveActions(writer, liveChatContinuation, liveOffset, startTime)
          : await this.writeReplayActions(writer, liveChatContinuation, fragIndex === 1);
        liveOffset = result.offset;
        offset = result.offset;
        continuationId = result.continuationId;
        clickTrackingParams = result.clickTrackingParams;
        downloaded += await writer.flush();
        const now = performance.now() / 1000;
        await this.hookProgress({
          status: "downloading",
          filename,
          tmpfilename,
          downloaded_bytes: downloaded,
          elapsed: now - started,
          speed: FileDownloader.calcSpeed(started, now, downloaded) ?? undefined,
        }, info);
        if (this.params.test) {
          break;
        }
        chatPageUrl = live
          ? `https://www.youtube.com/live_chat?continuation=${encodeURIComponent(continuationId ?? "")}`
          : `https://www.youtube.com/live_chat_replay?continuation=${encodeURIComponent(continuationId ?? "")}`;
      }
      await writer.end();
      await this.tryRename(tmpfilename, filename);
      const size = await this.filesizeOrZero(filename);
      await this.hookProgress({
        status: "finished",
        filename,
        downloaded_bytes: size,
        total_bytes: size,
        elapsed: performance.now() / 1000 - started,
      }, info);
      return true;
    } catch (error) {
      await writer.end();
      await this.hookProgress({ status: "error", filename, tmpfilename }, info);
      throw error;
    }
  }

  private async fetchContinuation(
    endpoint: string,
    innertubeContext: JsonRecord,
    continuationId: string,
    offset: number,
    clickTrackingParams: string | null,
    visitorData: string | null,
    headers: Record<string, string> | undefined,
  ): Promise<string> {
    const context = structuredClone(innertubeContext) as JsonRecord;
    if (clickTrackingParams) {
      context.clickTracking = { clickTrackingParams };
    }
    const body = {
      context,
      continuation: continuationId,
      currentPlayerState: { playerOffsetMs: String(Math.max(offset - 5000, 0)) },
    };
    return await (await this.ydl.urlopen(new Request(endpoint, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        ...(visitorData ? { "X-Goog-Visitor-Id": visitorData } : {}),
      },
      body: `${JSON.stringify(body)}\n`,
    }))).text();
  }

  private async writeReplayActions(writer: Bun.FileSink, continuation: JsonRecord, firstFragment: boolean): Promise<ContinuationResult> {
    const refresh = firstFragment
      ? getPathRecord(continuation, [
        "header",
        "liveChatHeaderRenderer",
        "viewSelector",
        "sortFilterSubMenuRenderer",
        "subMenuItems",
        1,
        "continuation",
        "reloadContinuationData",
      ])
      : null;
    if (refresh) {
      return {
        continuationId: stringOrNull(refresh.continuation),
        offset: 0,
        clickTrackingParams: stringOrNull(refresh.trackingParams),
      };
    }
    let offset = 0;
    for (const action of getArray(continuation.actions)) {
      const replayAction = getRecord(action)?.replayChatItemAction;
      if (replayAction && typeof replayAction === "object" && "videoOffsetTimeMsec" in replayAction) {
        offset = Number(replayAction.videoOffsetTimeMsec) || offset;
      }
      writer.write(`${JSON.stringify(action)}\n`);
    }
    const data = getPathRecord(continuation, ["continuations", 0, "liveChatReplayContinuationData"]);
    return {
      continuationId: stringOrNull(data?.continuation),
      offset,
      clickTrackingParams: stringOrNull(data?.clickTrackingParams),
    };
  }

  private async writeLiveActions(writer: Bun.FileSink, continuation: JsonRecord, liveOffset: number, startTime: number): Promise<ContinuationResult> {
    let offset = liveOffset;
    for (const action of getArray(continuation.actions)) {
      const timestamp = YoutubeLiveChatFD.parseLiveTimestamp(action);
      if (timestamp !== null) {
        offset = timestamp - startTime;
      }
      writer.write(`${JSON.stringify({
        replayChatItemAction: { actions: [action] },
        videoOffsetTimeMsec: String(offset),
        isLive: true,
      })}\n`);
    }
    const data = getPathRecord(continuation, ["continuations", 0, "invalidationContinuationData"])
      ?? getPathRecord(continuation, ["continuations", 0, "timedContinuationData"]);
    const timeoutMs = typeof data?.timeoutMs === "number" ? data.timeoutMs : Number(data?.timeoutMs);
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      await sleep(timeoutMs);
    }
    return {
      continuationId: stringOrNull(data?.continuation),
      offset,
      clickTrackingParams: stringOrNull(data?.clickTrackingParams),
    };
  }

  static parseLiveTimestamp(action: unknown): number | null {
    const actionContent = pickRecord(getRecord(action), ["addChatItemAction", "addLiveChatTickerItemAction", "addBannerToLiveChatCommand"]);
    const item = pickRecord(getRecord(actionContent?.item), ["liveChatTextMessageRenderer", "liveChatPaidMessageRenderer", "liveChatMembershipItemRenderer", "liveChatPaidStickerRenderer", "liveChatTickerPaidMessageItemRenderer", "liveChatTickerSponsorItemRenderer", "liveChatBannerRenderer"])
      ?? getRecord(actionContent?.bannerRenderer);
    let renderer = pickRecord(item, [
      "liveChatTextMessageRenderer",
      "liveChatPaidMessageRenderer",
      "liveChatMembershipItemRenderer",
      "liveChatPaidStickerRenderer",
      "liveChatTickerPaidMessageItemRenderer",
      "liveChatTickerSponsorItemRenderer",
      "liveChatBannerRenderer",
    ]);
    const parent = getPathRecord(renderer, ["showItemEndpoint", "showLiveChatItemEndpoint", "renderer"])
      ?? getRecord(renderer?.contents);
    if (parent) {
      renderer = pickRecord(parent, ["liveChatTextMessageRenderer", "liveChatPaidMessageRenderer", "liveChatMembershipItemRenderer", "liveChatPaidStickerRenderer"]);
    }
    const timestampUsec = renderer?.timestampUsec;
    if (typeof timestampUsec !== "string" && typeof timestampUsec !== "number") {
      return null;
    }
    const parsed = Number(timestampUsec);
    return Number.isFinite(parsed) ? Math.trunc(parsed / 1000) : null;
  }
}

function parseFragmentData(text: string): JsonRecord {
  try {
    return extractNamedJson(text, "ytInitialData");
  } catch {
    const parsed: unknown = JSON.parse(text);
    const record = getRecord(parsed);
    if (!record) {
      throw new Error("YouTube live chat fragment did not contain an object");
    }
    return record;
  }
}

function extractYtcfg(webpage: string): JsonRecord {
  const marker = "ytcfg.set(";
  const index = webpage.indexOf(marker);
  if (index === -1) {
    throw new Error("Could not find ytcfg in YouTube live chat page");
  }
  const braceIndex = webpage.indexOf("{", index);
  const parsed: unknown = JSON.parse(readBalanced(webpage, braceIndex));
  const record = getRecord(parsed);
  if (!record) {
    throw new Error("Invalid YouTube ytcfg object");
  }
  return record;
}

function extractNamedJson(webpage: string, name: string): JsonRecord {
  const markerIndex = webpage.indexOf(name);
  if (markerIndex === -1) {
    throw new Error(`Could not find ${name}`);
  }
  const braceIndex = webpage.indexOf("{", markerIndex);
  const parsed: unknown = JSON.parse(readBalanced(webpage, braceIndex));
  const record = getRecord(parsed);
  if (!record) {
    throw new Error(`${name} was not a JSON object`);
  }
  return record;
}

function readBalanced(source: string, startIndex: number): string {
  const open = source[startIndex];
  const close = open === "{" ? "}" : open === "[" ? "]" : null;
  if (!close) {
    throw new Error("Expected balanced JSON source");
  }
  let depth = 0;
  let quote: string | null = null;
  let escaping = false;
  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    if (char === undefined) {
      break;
    }
    if (quote) {
      escaping = !escaping && char === "\\";
      if (!escaping && char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }
  throw new Error("Could not find balanced JSON end");
}

function getPathRecord(root: unknown, path: readonly (string | number)[]): JsonRecord | null {
  return getRecord(getPath(root, path));
}

function getPathString(root: unknown, path: readonly (string | number)[]): string | null {
  return stringOrNull(getPath(root, path));
}

function getPath(root: unknown, path: readonly (string | number)[]): unknown {
  let current = root;
  for (const part of path) {
    if (typeof part === "number") {
      if (!Array.isArray(current)) {
        return null;
      }
      current = current[part];
    } else {
      const record = getRecord(current);
      if (!record) {
        return null;
      }
      current = record[part];
    }
  }
  return current;
}

function getRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function getArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function pickRecord(record: JsonRecord | null, keys: readonly string[]): JsonRecord | null {
  if (!record) {
    return null;
  }
  for (const key of keys) {
    const value = getRecord(record[key]);
    if (value) {
      return value;
    }
  }
  return null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
