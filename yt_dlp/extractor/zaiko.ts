// Source: yt_dlp/extractor/zaiko.py

import {
  ExtractorError,
  intOrNone,
  strOrNone,
  unescapeHTML,
  urlBasename,
  urlOrNone,
} from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

abstract class ZaikoBaseIE extends InfoExtractor {
  protected async downloadRealWebpage(
    url: string,
    videoId: string,
  ): Promise<string> {
    const result = await this.downloadWebpageHandle(url, videoId);
    if (result === false) {
      throw new ExtractorError("Unable to download Zaiko webpage", { videoId });
    }
    const [webpage, response] = result;
    const finalUrl = response.url;
    if (finalUrl.includes("zaiko.io/login")) {
      this.raiseLoginRequired();
    } else if (finalUrl.includes("/_buy/")) {
      throw new ExtractorError(
        "Your account does not have tickets to this event",
        { expected: true, videoId },
      );
    }
    return webpage;
  }

  protected parseVueElementAttr(
    name: string,
    html: string,
    videoId: string,
  ): Record<string, unknown> {
    const attrs: Record<string, unknown> = {};
    let found = false;
    new HTMLRewriter()
      .on(name, {
        element: (element) => {
          if (found) {
            return;
          }
          found = true;
          for (const [key, value] of element.attributes) {
            if (!key.startsWith(":") || value === null) {
              continue;
            }
            attrs[key.slice(1)] = this.parseJson(
              unescapeHTML(value) ?? value,
              videoId,
              { fatal: false },
            );
          }
        },
      })
      .transform(html);
    if (!found) {
      throw new ExtractorError(`Unable to extract ${name}`, { videoId });
    }
    return attrs;
  }
}

export class ZaikoIE extends ZaikoBaseIE {
  static override readonly _VALID_URL =
    String.raw`https?://(?:[\w-]+\.)?zaiko\.io/event/(?<id>\d+)/stream(?:/\d+)+`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const webpage = await this.downloadRealWebpage(url, videoId);
    const streamMeta = this.parseVueElementAttr(
      "stream-page",
      webpage,
      videoId,
    );

    const streamAccess = getRecord(streamMeta["stream-access"]);
    const videoSource = stringValue(streamAccess.video_source);
    if (!videoSource) {
      throw new ExtractorError("Unable to extract player page URL", {
        videoId,
      });
    }
    const playerPage = await this.downloadWebpage(videoSource, videoId, {
      note: "Downloading player page",
      headers: { referer: "https://zaiko.io/" },
    });
    if (playerPage === false) {
      throw new ExtractorError("Unable to download player page", { videoId });
    }
    const playerMeta = this.parseVueElementAttr("player", playerPage, videoId);
    const initialEventInfo = getRecord(playerMeta.initial_event_info);
    const status = stringValue(initialEventInfo.status);
    const [liveStatus, msg, expected] = statusInfo(status);

    let streamUrl: string | null = null;
    if (initialEventInfo.is_jwt_protected === true) {
      const jwtUrl = stringValue(initialEventInfo.jwt_token_url);
      if (jwtUrl) {
        const jwtData = await this.downloadJson<{ playback_url?: string }>(
          jwtUrl,
          videoId,
          {
            note: "Downloading JWT-protected stream URL",
            errnote: "Failed to download JWT-protected stream URL",
          },
        );
        streamUrl = jwtData ? (jwtData.playback_url ?? null) : null;
      }
    } else {
      streamUrl = urlOrNone(initialEventInfo.endpoint);
    }

    const formats = streamUrl
      ? this.extractM3u8Formats(streamUrl, videoId, "mp4", {
          entryProtocol: "m3u8_native",
        })
      : [];
    if (!formats.length) {
      this.raiseNoFormats(msg, { expected, videoId });
    }

    const eventPage = await this.downloadWebpage(
      `https://zaiko.io/event/${videoId}`,
      videoId,
      { note: "Downloading event page", fatal: false },
    );
    const thumbnailUrls = [
      urlOrNone(initialEventInfo.poster_url),
      eventPage ? this.ogSearchThumbnail(eventPage) : null,
    ].filter((item): item is string => Boolean(urlOrNone(item)));

    const event = getRecord(streamMeta.event);
    const profile = getRecord(streamMeta.profile);
    const stream = getRecord(streamMeta.stream);
    const start = getRecord(stream.start);
    return {
      id: videoId,
      formats,
      live_status: liveStatus,
      title: stringValue(event.name),
      uploader: stringValue(profile.name),
      uploader_id: strOrNone(profile.id) ?? undefined,
      release_timestamp: intOrNone(start.timestamp) ?? undefined,
      categories: Array.isArray(event.genres)
        ? event.genres.filter((item) => typeof item === "string")
        : undefined,
      alt_title: stringValue(initialEventInfo.title),
      thumbnails: thumbnailUrls.map((thumbnail) => ({
        url: thumbnail,
        id: urlBasename(thumbnail),
      })),
    };
  }
}

export class ZaikoETicketIE extends ZaikoBaseIE {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?zaiko\.io/account/eticket/(?<id>[\w=-]{49})`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const rawTicketId = this.matchId(url);
    const ticketId = decodeTicketId(rawTicketId) ?? rawTicketId;
    const webpage = await this.downloadRealWebpage(url, ticketId);
    const eticket = this.parseVueElementAttr("eticket", webpage, ticketId);
    const streams = Array.isArray(eticket.streams) ? eticket.streams : [];
    const ticketDetails = getRecord(eticket["ticket-details"]);
    return this.playlistResult(
      streams.flatMap((stream) =>
        typeof getRecord(stream).url === "string"
          ? [this.urlResult(getRecord(stream).url as string, ZaikoIE)]
          : [],
      ),
      ticketId,
      stringValue(ticketDetails.event_name) ?? null,
      null,
      { thumbnail: stringValue(ticketDetails.event_img_url) },
    );
  }
}

function statusInfo(status: string | undefined): [string, string, boolean] {
  const map: Record<string, [string, string, boolean]> = {
    vod: ["was_live", "No VOD stream URL was found", false],
    archiving: ["post_live", "Event VOD is still being processed", true],
    deleting: ["post_live", "This event has ended", true],
    deleted: ["post_live", "This event has ended", true],
    error: ["post_live", "This event has ended", true],
    disconnected: ["post_live", "Stream has been disconnected", true],
    live_to_disconnected: ["post_live", "Stream has been disconnected", true],
    live: ["is_live", "No livestream URL found was found", false],
    waiting: ["is_upcoming", "Live event has not yet started", true],
    cancelled: ["not_live", "Event has been cancelled", true],
  };
  return status && map[status]
    ? map[status]
    : ["not_live", `Unknown event status "${status}"`, false];
}

function decodeTicketId(ticketId: string): string | null {
  try {
    return Buffer.from(ticketId.slice(1), "base64url")
      .toString("utf8")
      .replaceAll("|", "-");
  } catch {
    return null;
  }
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
