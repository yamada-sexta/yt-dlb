// Source: yt_dlp/extractor/ccc.py

import { intOrNone, parseIso8601, tryGet, urlOrNone } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface CccRecording {
  recording_url?: string;
  language?: string;
  folder?: string;
  width?: unknown;
  height?: unknown;
  size?: unknown;
}

interface CccEvent {
  title?: string;
  persons?: string[];
  description?: string;
  thumb_url?: string;
  date?: string;
  length?: unknown;
  view_count?: unknown;
  tags?: string[];
  recordings?: CccRecording[];
}

interface CccConference {
  title?: string;
  events?: Array<{ frontend_link?: string }>;
}

export class CCCIE extends InfoExtractor {
  static override get IE_NAME(): string {
    return "media.ccc.de";
  }

  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?media\.ccc\.de/v/(?<id>[^/?#&]+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const displayId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, displayId);
    if (webpage === false) {
      throw new Error("Unable to download CCC event page");
    }
    const eventId = this.searchRegex(
      /data-id=(['"])(?<event_id>\d+)\1/,
      webpage,
      "event id",
      { group: "event_id" },
    );
    if (typeof eventId !== "string") {
      throw new Error("Unable to extract CCC event id");
    }
    const eventData = await this.downloadJson<CccEvent>(
      `https://media.ccc.de/public/events/${eventId}`,
      eventId,
    );
    if (eventData === false) {
      throw new Error("Unable to download CCC event metadata");
    }

    const formats = (eventData.recordings ?? []).flatMap((recording) => {
      if (!recording.recording_url) {
        return [];
      }
      const language = recording.language;
      const folder = recording.folder;
      const formatId =
        [language, folder].filter(Boolean).join("-") || undefined;
      const vcodec = folder?.includes("h264")
        ? "h264"
        : folder === "mp3" || folder === "opus"
          ? "none"
          : undefined;
      return [
        {
          format_id: formatId,
          url: recording.recording_url,
          width: intOrNone(recording.width) ?? undefined,
          height: intOrNone(recording.height) ?? undefined,
          filesize:
            intOrNone(recording.size, 1, null, 1024 * 1024) ?? undefined,
          language,
          vcodec,
        },
      ];
    });

    return {
      id: eventId,
      display_id: displayId,
      title: eventData.title,
      creator: tryGet(eventData, (value) =>
        (value as CccEvent).persons?.join(", "),
      ),
      description: eventData.description,
      thumbnail: eventData.thumb_url,
      timestamp: parseIso8601(eventData.date) ?? undefined,
      duration: intOrNone(eventData.length) ?? undefined,
      view_count: intOrNone(eventData.view_count) ?? undefined,
      tags: eventData.tags,
      formats,
    };
  }
}

export class CCCPlaylistIE extends InfoExtractor {
  static override get IE_NAME(): string {
    return "media.ccc.de:lists";
  }

  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?media\.ccc\.de/c/(?<id>[^/?#&]+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const playlistId = this.matchId(url);
    const conf = await this.downloadJson<CccConference>(
      `https://media.ccc.de/public/conferences/${playlistId}`,
      playlistId,
    );
    if (conf === false) {
      throw new Error("Unable to download CCC conference metadata");
    }
    const entries = (conf.events ?? []).flatMap((event) => {
      const eventUrl = urlOrNone(event.frontend_link);
      return eventUrl ? [this.urlResult(eventUrl, CCCIE.ieKey())] : [];
    });
    return this.playlistResult(entries, playlistId, conf.title ?? null);
  }
}
