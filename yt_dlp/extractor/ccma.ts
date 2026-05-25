// Source: yt_dlp/extractor/ccma.py

import {
  cleanHtml,
  determineExt,
  intOrNone,
  parseDuration,
  parseResolution,
  tryGet,
  unifiedTimestamp,
  urlOrNone,
} from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface CcmaMediaUrl {
  file?: string;
  label?: string;
}

interface CcmaMedia {
  media?: { url?: string | CcmaMediaUrl[] };
  informacio?: Record<string, unknown>;
  subtitols?: Record<string, string> | Array<Record<string, string>>;
  imatges?: { url?: string; amplada?: unknown; alcada?: unknown };
}

export class CCMAIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?3cat\.cat/(?:3cat|tv3/sx3)/[^/?#]+/(?<type>video|audio)/(?<id>\d+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const mediaType = match?.groups?.type;
    const mediaId = match?.groups?.id;
    if (!mediaType || !mediaId) {
      throw new Error("Unable to extract CCMA media id");
    }

    const media = await this.downloadJson<CcmaMedia>(
      "http://api-media.3cat.cat/pvideo/media.jsp",
      mediaId,
      {
        query: {
          media: mediaType,
          idint: mediaId,
          format: "dm",
        },
      },
    );
    if (media === false) {
      throw new Error("Unable to download CCMA media metadata");
    }

    const formats: Array<Record<string, unknown>> = [];
    const mediaUrl = media.media?.url;
    if (Array.isArray(mediaUrl)) {
      for (const format of mediaUrl) {
        const formatUrl = urlOrNone(format.file);
        if (!formatUrl) {
          continue;
        }
        if (determineExt(formatUrl) === "mpd") {
          formats.push(
            ...this.extractMpdFormats(formatUrl, mediaId, {
              mpdId: "dash",
              fatal: false,
            }),
          );
          continue;
        }
        formats.push({
          ...parseResolution(format.label),
          url: formatUrl,
          format_id: format.label,
        });
      }
    } else if (typeof mediaUrl === "string") {
      formats.push({
        url: mediaUrl,
        vcodec: mediaType === "audio" ? "none" : undefined,
      });
    }

    const informacio = media.informacio ?? {};
    const title = String(informacio.titol ?? mediaId);
    const durationInfo = getRecord(informacio.durada);
    const duration =
      intOrNone(durationInfo?.milisegons, 1000) ??
      parseDuration(
        typeof durationInfo?.text === "string" ? durationInfo.text : null,
      );
    const tematica = tryGet(
      informacio,
      (value) => getRecord(getRecord(value).tematica).text,
    );
    const timestamp = unifiedTimestamp(
      tryGet(
        informacio,
        (value) => getRecord(getRecord(value).data_emissio).utc,
      ),
    );

    const subtitles: Record<string, Array<Record<string, unknown>>> = {};
    const subtitleRows = Array.isArray(media.subtitols)
      ? media.subtitols
      : media.subtitols
        ? [media.subtitols]
        : [];
    for (const subtitle of subtitleRows) {
      if (!subtitle.url) {
        continue;
      }
      const language = subtitle.iso ?? subtitle.text ?? "ca";
      subtitles[language] ??= [];
      subtitles[language].push({ url: subtitle.url });
    }

    const thumbnails = media.imatges?.url
      ? [
          {
            url: media.imatges.url,
            width: intOrNone(media.imatges.amplada) ?? undefined,
            height: intOrNone(media.imatges.alcada) ?? undefined,
          },
        ]
      : [];

    const codiEtic = tryGet(
      informacio,
      (value) => getRecord(getRecord(value).codi_etic).id,
    );
    const codiParts = typeof codiEtic === "string" ? codiEtic.split("_") : [];
    const ageLimit =
      codiParts.length === 2
        ? codiParts[1] === "TP"
          ? 0
          : intOrNone(codiParts[1])
        : null;

    return {
      id: mediaId,
      title,
      description:
        cleanHtml(
          typeof informacio.descripcio === "string"
            ? informacio.descripcio
            : null,
        ) ?? undefined,
      duration: duration ?? undefined,
      timestamp: timestamp ?? undefined,
      thumbnails,
      subtitles,
      formats,
      age_limit: ageLimit ?? undefined,
      alt_title:
        typeof informacio.titol_complet === "string"
          ? informacio.titol_complet
          : undefined,
      episode_number: intOrNone(informacio.capitol) ?? undefined,
      categories: typeof tematica === "string" ? [tematica] : undefined,
      series:
        typeof informacio.programa === "string"
          ? informacio.programa
          : undefined,
    };
  }
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
