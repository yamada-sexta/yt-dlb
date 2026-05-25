// Source: yt_dlp/extractor/beatport.py

import { intOrNone } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface BeatportTrack {
  id?: number;
  slug?: string;
  name?: string;
  mix?: string;
  artists?: Array<{ name?: string }>;
  preview?: Record<string, { url?: string }>;
  images?: Record<string, { url?: string; height?: unknown; width?: unknown }>;
}

interface BeatportPlayables {
  tracks?: BeatportTrack[];
}

export class BeatportIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.|pro\.)?beatport\.com/track/(?<display_id>[^/]+)/(?<id>[0-9]+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const trackId = match?.groups?.id;
    const displayId = match?.groups?.display_id;
    if (!trackId || !displayId) {
      throw new Error("Unable to extract Beatport track id");
    }
    const webpage = await this.downloadWebpage(url, displayId);
    if (webpage === false) {
      throw new Error("Unable to download Beatport track page");
    }
    const playablesJson = this.searchRegex(
      /window\.Playables\s*=\s*({[\s\S]+?});/,
      webpage,
      "playables info",
    );
    if (typeof playablesJson !== "string") {
      throw new Error("Unable to extract Beatport playables info");
    }
    const playables = this.parseJson<BeatportPlayables>(playablesJson, trackId);
    const track = playables?.tracks?.find(
      (item) => item.id === Number(trackId),
    );
    if (!track) {
      throw new Error(`Unable to find Beatport track ${trackId}`);
    }

    const artistText = (track.artists ?? [])
      .map((artist) => artist.name)
      .filter(Boolean)
      .join(", ");
    const title = `${artistText}${artistText ? " - " : ""}${track.name ?? trackId}${track.mix ? ` (${track.mix})` : ""}`;
    const formats = Object.entries(track.preview ?? {}).flatMap(
      ([ext, info]) => {
        if (!info.url) {
          return [];
        }
        return [
          {
            url: info.url,
            ext,
            format_id: ext,
            vcodec: "none",
            acodec: ext === "mp3" ? "mp3" : ext === "mp4" ? "aac" : undefined,
            abr: ext === "mp3" || ext === "mp4" ? 96 : undefined,
            asr: ext === "mp3" || ext === "mp4" ? 44100 : undefined,
          },
        ];
      },
    );
    const thumbnails = Object.entries(track.images ?? {}).flatMap(
      ([name, info]) => {
        if (name === "dynamic" || !info.url) {
          return [];
        }
        return [
          {
            id: name,
            url: info.url,
            height: intOrNone(info.height) ?? undefined,
            width: intOrNone(info.width) ?? undefined,
          },
        ];
      },
    );

    return {
      id: String(track.id ?? trackId),
      display_id: track.slug ?? displayId,
      title,
      formats,
      thumbnails,
    };
  }
}
