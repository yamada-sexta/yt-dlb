// Source: yt_dlp/extractor/yandexmusic.py

import { createHash } from "node:crypto";

import {
  ExtractorError,
  floatOrNone,
  intOrNone,
  tryGet,
} from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.flatMap((item) =>
        Object.keys(record(item)).length ? [record(item)] : [],
      )
    : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function md5(value: string): string {
  return createHash("md5").update(value).digest("hex");
}

abstract class YandexMusicBaseIE extends InfoExtractor {
  static readonly _VALID_URL_BASE =
    String.raw`https?://music\.yandex\.(?<tld>ru|kz|ua|by|com)`;

  protected handleError(response: unknown): void {
    const item = record(response);
    const error = item.error;
    if (error) {
      throw new ExtractorError(String(error), { expected: true });
    }
    if (item.type === "captcha" || "captcha" in item) {
      throw new ExtractorError(
        "YandexMusic requested CAPTCHA solving before continuing",
        { expected: true },
      );
    }
  }

  protected async callApi<T = JsonRecord>(
    ep: string,
    tld: string,
    url: string,
    itemId: string,
    note: string,
    query: Record<string, string>,
  ): Promise<T> {
    const response = await this.downloadJson<T | JsonRecord>(
      `https://music.yandex.${tld}/handlers/${ep}.jsx`,
      itemId,
      {
        note,
        fatal: false,
        headers: {
          Referer: url,
          "X-Requested-With": "XMLHttpRequest",
          "X-Retpath-Y": url,
        },
        query,
      },
    );
    if (!response || response === false) {
      throw new ExtractorError(`Unable to download ${ep} JSON`, {
        videoId: itemId,
      });
    }
    this.handleError(response);
    return response as T;
  }
}

export class YandexMusicTrackIE extends YandexMusicBaseIE {
  static override readonly _VALID_URL =
    String.raw`${YandexMusicBaseIE._VALID_URL_BASE}/album/(?<album_id>\d+)/track/(?<id>\d+)`;

  static override get IE_NAME(): string {
    return "yandexmusic:track";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const tld = match?.groups?.tld;
    const albumId = match?.groups?.album_id;
    const trackId = match?.groups?.id;
    if (!tld || !albumId || !trackId) {
      throw new ExtractorError("Unable to extract Yandex Music track id", {
        expected: true,
      });
    }
    const trackResponse = await this.callApi<{ track?: JsonRecord }>(
      "track",
      tld,
      url,
      trackId,
      "Downloading track JSON",
      { track: `${trackId}:${albumId}` },
    );
    const track = record(trackResponse.track);
    const trackTitle = String(track.title ?? trackId);
    const downloadData = (await this.downloadJson<JsonRecord>(
      `https://music.yandex.ru/api/v2.1/handlers/track/${trackId}:${albumId}/web-album_track-track-track-main/download/m`,
      trackId,
      {
        note: "Downloading track location url JSON",
        query: { hq: 1 },
        headers: { "X-Retpath-Y": url },
      },
    )) as JsonRecord | false;
    if (!downloadData || typeof downloadData.src !== "string") {
      throw new ExtractorError("Unable to extract Yandex Music download data", {
        videoId: trackId,
      });
    }
    const fdData = (await this.downloadJson<JsonRecord>(
      downloadData.src,
      trackId,
      { note: "Downloading track location JSON", query: { format: "json" } },
    )) as JsonRecord | false;
    if (!fdData) {
      throw new ExtractorError("Unable to extract Yandex Music file location", {
        videoId: trackId,
      });
    }
    const path = String(fdData.path ?? "");
    const key = md5(
      `XGRlBW9FXlekgbPrRHuSiA${path.slice(1)}${String(fdData.s ?? "")}`,
    );
    const fileUrl = `http://${String(fdData.host ?? "")}/get-mp3/${key}/${String(fdData.ts ?? "")}${path}?track-id=${String(track.id ?? trackId)} `;

    const firstAlbum = record(records(track.albums)[0]);
    const coverUri = stringValue(firstAlbum.coverUri);
    const thumbnail = coverUri
      ? coverUri.replace("%%", "orig").startsWith("http")
        ? coverUri.replace("%%", "orig")
        : `http://${coverUri.replace("%%", "orig")}`
      : undefined;
    const info: ExtractorInfo = {
      id: trackId,
      ext: "mp3",
      url: fileUrl,
      filesize: intOrNone(track.fileSize) ?? undefined,
      duration: floatOrNone(track.durationMs, 1000) ?? undefined,
      thumbnail,
      track: trackTitle,
      acodec: downloadData.codec,
      abr: intOrNone(downloadData.bitrate) ?? undefined,
    };

    if (Object.keys(firstAlbum).length) {
      const position = record(firstAlbum.trackPosition);
      info.album = firstAlbum.title;
      info.album_artist =
        extractArtist(records(firstAlbum.artists)) ?? undefined;
      info.release_year = intOrNone(firstAlbum.year) ?? undefined;
      info.genre = firstAlbum.genre;
      info.disc_number = intOrNone(position.volume) ?? undefined;
      info.track_number = intOrNone(position.index) ?? undefined;
    }
    const artist = extractArtist(records(track.artists));
    if (artist) {
      info.artist = artist;
      info.title = `${artist} - ${trackTitle}`;
    } else {
      info.title = trackTitle;
    }
    return info;
  }
}

abstract class YandexMusicPlaylistBaseIE extends YandexMusicBaseIE {
  protected async extractTracks(
    source: JsonRecord,
    itemId: string,
    url: string,
    tld: string,
  ): Promise<JsonRecord[]> {
    const tracks = records(source.tracks);
    const trackIds = Array.isArray(source.trackIds)
      ? source.trackIds.map((trackId) => String(trackId))
      : [];
    if (tracks.length < trackIds.length) {
      const present = new Set(
        tracks.flatMap((track) => (track.id ? [String(track.id)] : [])),
      );
      const missing = trackIds.filter((trackId) => !present.has(trackId));
      const chunkSize = 250;
      for (let start = 0; start < missing.length; start += chunkSize) {
        const chunk = missing.slice(start, start + chunkSize);
        if (!chunk.length) {
          break;
        }
        const missingTracks = await this.callApi<JsonRecord[]>(
          "track-entries",
          tld,
          url,
          itemId,
          `Downloading missing tracks JSON chunk ${Math.floor(start / chunkSize) + 1}`,
          {
            entries: chunk.join(","),
            lang: tld,
            "external-domain": `music.yandex.${tld}`,
            overembed: "false",
            strict: "true",
          },
        );
        tracks.push(...records(missingTracks));
      }
    }
    return tracks;
  }

  protected buildPlaylist(tracks: JsonRecord[]): ExtractorInfo[] {
    const entries: ExtractorInfo[] = [];
    for (const track of tracks) {
      const trackId = track.id ?? track.realId;
      const album = records(track.albums)[0];
      if (!trackId || !album?.id) {
        continue;
      }
      entries.push(
        this.urlResult(
          `http://music.yandex.ru/album/${String(album.id)}/track/${String(trackId)}`,
          YandexMusicTrackIE,
          String(trackId),
        ),
      );
    }
    return entries;
  }
}

export class YandexMusicAlbumIE extends YandexMusicPlaylistBaseIE {
  static override readonly _VALID_URL =
    String.raw`${YandexMusicBaseIE._VALID_URL_BASE}/album/(?<id>\d+)`;

  static override get IE_NAME(): string {
    return "yandexmusic:album";
  }

  static override suitable(url: string): boolean {
    return YandexMusicTrackIE.suitable(url) ? false : super.suitable(url);
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const tld = match?.groups?.tld;
    const albumId = match?.groups?.id;
    if (!tld || !albumId) {
      throw new ExtractorError("Unable to extract Yandex Music album id", {
        expected: true,
      });
    }
    const album = await this.callApi<JsonRecord>(
      "album",
      tld,
      url,
      albumId,
      "Downloading album JSON",
      { album: albumId },
    );
    const tracks = records(album.volumes).flatMap((volume) => records(volume));
    let title = String(album.title ?? albumId);
    const artist = tryGet(
      album,
      (value) => record(records(record(value).artists)[0]).name,
      (value): value is string => typeof value === "string",
    );
    if (artist) {
      title = `${artist} - ${title}`;
    }
    if (album.year) {
      title += ` (${String(album.year)})`;
    }
    return this.playlistResult(
      this.buildPlaylist(tracks),
      String(album.id ?? albumId),
      title,
    );
  }
}

export class YandexMusicPlaylistIE extends YandexMusicPlaylistBaseIE {
  static override readonly _VALID_URL =
    String.raw`${YandexMusicBaseIE._VALID_URL_BASE}/users/(?<user>[^/]+)/playlists/(?<id>\d+)`;

  static override get IE_NAME(): string {
    return "yandexmusic:playlist";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const tld = match?.groups?.tld;
    const user = match?.groups?.user;
    const playlistId = match?.groups?.id;
    if (!tld || !user || !playlistId) {
      throw new ExtractorError("Unable to extract Yandex Music playlist id", {
        expected: true,
      });
    }
    const response = await this.callApi<{ playlist?: JsonRecord }>(
      "playlist",
      tld,
      url,
      playlistId,
      "Downloading playlist JSON",
      {
        owner: user,
        kinds: playlistId,
        light: "true",
        lang: tld,
        "external-domain": `music.yandex.${tld}`,
        overembed: "false",
      },
    );
    const playlist = record(response.playlist);
    return this.playlistResult(
      this.buildPlaylist(
        await this.extractTracks(playlist, playlistId, url, tld),
      ),
      playlistId,
      stringValue(playlist.title),
      stringValue(playlist.description),
    );
  }
}

abstract class YandexMusicArtistBaseIE extends YandexMusicPlaylistBaseIE {
  protected abstract readonly artistWhat: string;
  protected readonly artistSort: string = "";

  protected callArtist(
    tld: string,
    url: string,
    artistId: string,
  ): Promise<JsonRecord> {
    return this.callApi<JsonRecord>(
      "artist",
      tld,
      url,
      artistId,
      `Downloading artist ${this.artistWhat} JSON`,
      {
        artist: artistId,
        what: this.artistWhat,
        sort: this.artistSort,
        dir: "",
        period: "",
        lang: tld,
        "external-domain": `music.yandex.${tld}`,
        overembed: "false",
      },
    );
  }
}

export class YandexMusicArtistTracksIE extends YandexMusicArtistBaseIE {
  static override readonly _VALID_URL =
    String.raw`${YandexMusicBaseIE._VALID_URL_BASE}/artist/(?<id>\d+)/tracks`;
  protected override readonly artistWhat = "tracks";

  static override get IE_NAME(): string {
    return "yandexmusic:artist:tracks";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const tld = match?.groups?.tld;
    const artistId = match?.groups?.id;
    if (!tld || !artistId) {
      throw new ExtractorError("Unable to extract Yandex Music artist id", {
        expected: true,
      });
    }
    const data = await this.callArtist(tld, url, artistId);
    const artist = stringValue(record(data.artist).name);
    return this.playlistResult(
      this.buildPlaylist(await this.extractTracks(data, artistId, url, tld)),
      artistId,
      `${artist ?? artistId} - Tracks`,
    );
  }
}

export class YandexMusicArtistAlbumsIE extends YandexMusicArtistBaseIE {
  static override readonly _VALID_URL =
    String.raw`${YandexMusicBaseIE._VALID_URL_BASE}/artist/(?<id>\d+)/albums`;
  protected override readonly artistWhat = "albums";
  protected override readonly artistSort = "year";

  static override get IE_NAME(): string {
    return "yandexmusic:artist:albums";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const tld = match?.groups?.tld;
    const artistId = match?.groups?.id;
    if (!tld || !artistId) {
      throw new ExtractorError("Unable to extract Yandex Music artist id", {
        expected: true,
      });
    }
    const data = await this.callArtist(tld, url, artistId);
    const entries = records(data.albums).flatMap((album) =>
      album.id
        ? [
            this.urlResult(
              `http://music.yandex.ru/album/${String(album.id)}`,
              YandexMusicAlbumIE,
              String(album.id),
            ),
          ]
        : [],
    );
    const artist = stringValue(record(data.artist).name);
    return this.playlistResult(
      entries,
      artistId,
      `${artist ?? artistId} - Albums`,
    );
  }
}

function extractArtist(artists: JsonRecord[]): string | null {
  const names = artists.flatMap((artist) => {
    const name = stringValue(artist.name);
    if (!name) {
      return [];
    }
    const decomposed = Array.isArray(artist.decomposed)
      ? artist.decomposed
      : null;
    if (!decomposed) {
      return [name];
    }
    return [
      `${name}${decomposed.map((item) => (typeof item === "string" ? item : (stringValue(record(item).name) ?? ""))).join("")}`,
    ];
  });
  return names.length ? names.join(", ") : null;
}
