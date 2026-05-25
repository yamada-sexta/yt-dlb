// Source: yt_dlp/extractor/zingmp3.py

import { createHash, createHmac } from "node:crypto";

import { ExtractorError, intOrNone, joinNonempty, tryGet, urlOrNone, urljoin } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

abstract class ZingMp3BaseIE extends InfoExtractor {
  static readonly VALID_URL_TMPL = String.raw`https?://(?:mp3\.zing|zingmp3)\.vn/(?<type>(?:%s))/[^/?#]+/(?<id>\w+)(?:\.html|\?)`;
  static override readonly _GEO_COUNTRIES = ["VN"];
  protected static readonly DOMAIN = "https://zingmp3.vn";
  protected static readonly PER_PAGE = 50;
  private static readonly API_SLUGS: Record<string, string> = {
    "bai-hat": "/api/v2/page/get/song",
    embed: "/api/v2/page/get/song",
    "video-clip": "/api/v2/page/get/video",
    lyric: "/api/v2/lyric/get/lyric",
    "song-streaming": "/api/v2/song/get/streaming",
    liveradio: "/api/v2/livestream/get/info",
    eps: "/api/v2/page/get/podcast-episode",
    "episode-streaming": "/api/v2/podcast/episode/get/streaming",
    playlist: "/api/v2/page/get/playlist",
    album: "/api/v2/page/get/playlist",
    pgr: "/api/v2/page/get/podcast-program",
    "pgr-list": "/api/v2/podcast/episode/get/list",
    cgr: "/api/v2/page/get/podcast-category",
    "cgr-list": "/api/v2/podcast/program/get/list-by-cate",
    cgrs: "/api/v2/page/get/podcast-categories",
    "zing-chart": "/api/v2/page/get/chart-home",
    "zing-chart-tuan": "/api/v2/page/get/week-chart",
    "moi-phat-hanh": "/api/v2/page/get/newrelease-chart",
    "the-loai-video": "/api/v2/video/get/list",
    "info-artist": "/api/v2/page/get/artist",
    "user-list-song": "/api/v2/song/get/list",
    "user-list-video": "/api/v2/video/get/list",
    hub: "/api/v2/page/get/hub-detail",
    "new-release": "/api/v2/chart/get/new-release",
    top100: "/api/v2/page/get/top-100",
    "podcast-new": "/api/v2/podcast/program/get/list-by-type",
    "top-podcast": "/api/v2/podcast/program/get/top-episode",
  };

  protected apiUrl(urlType: string, params: Record<string, string | number>): string {
    const apiSlug = ZingMp3BaseIE.API_SLUGS[urlType];
    if (!apiSlug) {
      throw new ExtractorError(`Unsupported Zing MP3 API type ${urlType}`, { expected: true });
    }
    const allParams = { ...params, ctime: "1" };
    const signatureInput = Object.entries(allParams).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join("");
    const sha256 = createHash("sha256").update(signatureInput).digest("hex");
    const sig = createHmac("sha512", "acOrvUS15XRW2o9JksiK1KgQ6Vbds8ZW").update(`${apiSlug}${sha256}`).digest("hex");
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...allParams, apiKey: "X5BM3w8N7MKozC0B85o4KMlzLZKhV00y", sig })) {
      query.set(key, String(value));
    }
    return `${ZingMp3BaseIE.DOMAIN}${apiSlug}?${query}`;
  }

  protected async callApi<T = Record<string, unknown>>(urlType: string, params: Record<string, string | number>, displayId: string | null = null, options: { fatal?: boolean; query?: Record<string, string> } = {}): Promise<T | Record<string, never>> {
    let url = this.apiUrl(urlType, params);
    if (options.query) {
      const parsed = new URL(url);
      for (const [key, value] of Object.entries(options.query)) {
        parsed.searchParams.set(key, value);
      }
      url = parsed.toString();
    }
    const resp = await this.downloadJson<{ data?: T }>(url, displayId ?? String(params.id ?? ""), {
      note: `Downloading ${urlType} JSON metadata`,
      fatal: options.fatal ?? true,
    });
    return resp ? resp.data ?? {} as T : {};
  }

  protected override async realInitialize(): Promise<void> {
    await this.requestWebpage(this.apiUrl("bai-hat", { id: "" }), "zingmp3", { note: "Updating cookies", fatal: false });
  }

  protected parseItems(items: unknown): ExtractorInfo[] {
    return asArray(items).flatMap((item) => {
      const link = stringValue(getRecord(item).link);
      const fullUrl = link ? urljoin(ZingMp3BaseIE.DOMAIN, link) : null;
      return fullUrl ? [this.urlResult(fullUrl)] : [];
    });
  }

  protected abstract fetchPage(id: string, urlType: string, page: number): Promise<Record<string, unknown>>;

  protected async pagedList(id: string, urlType: string): Promise<ExtractorInfo[]> {
    const entries: ExtractorInfo[] = [];
    let count = 0;
    for (let page = 1; ; page += 1) {
      const data = await this.fetchPage(id, urlType, page);
      const pageEntries = this.parseItems(data.items);
      count += pageEntries.length;
      entries.push(...pageEntries);
      if (!data.hasMore || (intOrNone(data.total) !== null && count > intOrNone(data.total)!)) {
        break;
      }
    }
    return entries;
  }
}

export class ZingMp3IE extends ZingMp3BaseIE {
  static override readonly _VALID_URL = ZingMp3BaseIE.VALID_URL_TMPL.replace("%s", "bai-hat|video-clip|embed|eps");
  static override readonly IE_NAME = "zingmp3";
  static readonly IE_DESC = "zingmp3.vn";

  protected override async fetchPage(): Promise<Record<string, unknown>> {
    throw new Error("ZingMp3IE does not use paged extraction");
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const songId = match?.groups?.id;
    const urlType = match?.groups?.type;
    if (!songId || !urlType) {
      throw new ExtractorError("Invalid Zing MP3 URL", { expected: true });
    }
    const item = await this.callApi<Record<string, unknown>>(urlType, { id: songId });
    const itemId = stringValue(item.encodeId) ?? songId;
    let source: Record<string, unknown>;
    if (urlType === "video-clip") {
      source = getRecord(item.streaming);
      const videoInfo = await this.downloadJson<{ source?: unknown }>(
        "http://api.mp3.zing.vn/api/mobile/video/getvideoinfo",
        itemId,
        { query: { requestdata: JSON.stringify({ id: itemId }) }, note: "Downloading mp4 JSON metadata" },
      );
      source.mp4 = videoInfo ? videoInfo.source : undefined;
    } else if (urlType === "eps") {
      source = await this.callApi<Record<string, unknown>>("episode-streaming", { id: itemId });
    } else {
      source = await this.callApi<Record<string, unknown>>("song-streaming", { id: itemId });
    }

    const formats: Array<Record<string, unknown>> = [];
    for (const [key, value] of Object.entries(source ?? {})) {
      if (!value || value === "VIP") {
        continue;
      }
      if (key !== "mp4" && key !== "hls") {
        formats.push({
          ext: "mp3",
          format_id: key,
          tbr: intOrNone(key) ?? undefined,
          url: this.protoRelativeUrl(String(value)) ?? String(value),
          vcodec: "none",
        });
        continue;
      }
      for (const [res, videoUrl] of Object.entries(getRecord(value))) {
        if (!videoUrl) {
          continue;
        }
        if (key === "hls") {
          formats.push(...this.extractM3u8Formats(String(videoUrl), itemId, "mp4", { m3u8Id: key }));
        } else {
          formats.push({ format_id: `mp4-${res}`, url: String(videoUrl), height: intOrNone(res) ?? undefined });
        }
      }
    }
    if (!formats.length) {
      if (item.msg === "Sorry, this content is not available in your country.") {
        this.raiseGeoRestricted(undefined, { countries: (this.constructor as typeof ZingMp3BaseIE)._GEO_COUNTRIES, metadataAvailable: true });
      }
      this.raiseNoFormats("The song is only for VIP accounts.", { expected: true, videoId: itemId });
    }
    const lyric = stringValue(item.lyric) ?? stringValue((await this.callApi<Record<string, unknown>>("lyric", { id: itemId }, null, { fatal: false })).file);
    return {
      id: itemId,
      title: stringValue(item.title) ?? stringValue(item.alias),
      thumbnail: stringValue(item.thumbnail) ?? stringValue(item.thumbnailM),
      duration: intOrNone(item.duration) ?? undefined,
      track: stringValue(item.title) ?? stringValue(item.alias),
      artist: stringValue(item.artistsNames) ?? stringValue(item.artists_names) ?? stringValue(getPath(item, ["artists", 0, "name"])),
      album: stringValue(getPath(item, ["album", "name"])) ?? stringValue(getPath(item, ["album", "title"])) ?? stringValue(getPath(item, ["genres", 0, "name"])),
      album_artist: stringValue(getPath(item, ["album", "artistsNames"])) ?? stringValue(getPath(item, ["album", "artists_names"])) ?? stringValue(getPath(item, ["artists", 0, "name"])),
      formats,
      subtitles: lyric ? { origin: [{ url: lyric }] } : undefined,
    };
  }
}

export class ZingMp3AlbumIE extends ZingMp3BaseIE {
  static override readonly _VALID_URL = ZingMp3BaseIE.VALID_URL_TMPL.replace("%s", "album|playlist");
  static override readonly IE_NAME = "zingmp3:album";

  protected override async fetchPage(): Promise<Record<string, unknown>> {
    throw new Error("ZingMp3AlbumIE does not use paged extraction");
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const songId = match?.groups?.id ?? "";
    const urlType = match?.groups?.type ?? "";
    const data = await this.callApi<Record<string, unknown>>(urlType, { id: songId });
    return this.playlistResult(
      this.parseItems(getPath(data, ["song", "items"])),
      stringValue(data.id) ?? stringValue(data.encodeId) ?? songId,
      stringValue(data.name) ?? stringValue(data.title) ?? null,
    );
  }
}

export class ZingMp3ChartHomeIE extends ZingMp3BaseIE {
  static override readonly _VALID_URL = String.raw`https?://(?:mp3\.zing|zingmp3)\.vn/(?<id>(?:zing-chart|moi-phat-hanh|top100|podcast-discover))/?(?:[#?]|$)`;
  static override readonly IE_NAME = "zingmp3:chart-home";

  protected override async fetchPage(): Promise<Record<string, unknown>> {
    throw new Error("ZingMp3ChartHomeIE does not use paged extraction");
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const urlType = this.matchId(url);
    const params: Record<string, string> = { id: urlType };
    if (urlType === "podcast-discover") {
      params.type = "discover";
    }
    const data = await this.callApi<Record<string, unknown>>(urlType, params);
    const items = urlType === "top100"
      ? asArray(data).flatMap((item) => asArray(getRecord(item).items))
      : urlType === "zing-chart" ? asArray(getPath(data, ["RTChart", "items"])) : asArray(data.items);
    return this.playlistResult(this.parseItems(items), urlType);
  }
}

export class ZingMp3WeekChartIE extends ZingMp3BaseIE {
  static override readonly _VALID_URL = ZingMp3BaseIE.VALID_URL_TMPL.replace("%s", "zing-chart-tuan");
  static override readonly IE_NAME = "zingmp3:week-chart";

  protected override async fetchPage(): Promise<Record<string, unknown>> {
    throw new Error("ZingMp3WeekChartIE does not use paged extraction");
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const songId = match?.groups?.id ?? "";
    const urlType = match?.groups?.type ?? "";
    const data = await this.callApi<Record<string, unknown>>(urlType, { id: songId });
    return this.playlistResult(this.parseItems(data.items), songId, `zing-chart-${stringValue(data.country) ?? ""}`);
  }
}

export class ZingMp3ChartMusicVideoIE extends ZingMp3BaseIE {
  static override readonly _VALID_URL = String.raw`https?://(?:mp3\.zing|zingmp3)\.vn/(?<type>the-loai-video)/(?<regions>[^/]+)/(?<id>[^.]+)`;
  static override readonly IE_NAME = "zingmp3:chart-music-video";

  protected override async fetchPage(songId: string, urlType: string, page: number): Promise<Record<string, unknown>> {
    return await this.callApi<Record<string, unknown>>(urlType, { id: songId, type: "genre", page, count: ZingMp3BaseIE.PER_PAGE });
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const songId = match?.groups?.id ?? "";
    const regions = match?.groups?.regions ?? "";
    const urlType = match?.groups?.type ?? "";
    return this.playlistResult(await this.pagedList(songId, urlType), songId, `${urlType}_${regions}`);
  }
}

export class ZingMp3UserIE extends ZingMp3BaseIE {
  static override readonly _VALID_URL = String.raw`https?://(?:mp3\.zing|zingmp3)\.vn/(?<user>[^/]+)/(?<type>bai-hat|single|album|video|song)/?(?:[?#]|$)`;
  static override readonly IE_NAME = "zingmp3:user";

  protected override async fetchPage(userId: string, urlType: string, page: number): Promise<Record<string, unknown>> {
    return await this.callApi<Record<string, unknown>>(urlType === "bai-hat" ? "user-list-song" : "user-list-video", {
      id: userId,
      type: "artist",
      page,
      count: ZingMp3BaseIE.PER_PAGE,
    });
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const alias = match?.groups?.user ?? "";
    const urlType = match?.groups?.type || "bai-hat";
    const userInfo = await this.callApi<Record<string, unknown>>("info-artist", {}, alias, { query: { alias } });
    if (alias === "new-release" && (urlType === "song" || urlType === "album")) {
      const id = `${alias}-${urlType}`;
      return this.playlistResult(this.parseItems(await this.callApi("new-release", { type: urlType }, id)), id);
    }
    const entries = urlType === "bai-hat" || urlType === "video"
      ? await this.pagedList(stringValue(userInfo.id) ?? "", urlType)
      : this.parseItems(asArray(userInfo.sections)
        .filter((section) => getRecord(section).sectionId === (urlType === "album" ? "aAlbum" : "aSingle"))
        .flatMap((section) => asArray(getRecord(section).items)));
    return this.playlistResult(entries, stringValue(userInfo.id) ?? null, joinNonempty(userInfo.name, urlType, { delim: " - " }), stringValue(userInfo.biography) ?? null);
  }
}

export class ZingMp3HubIE extends ZingMp3BaseIE {
  static override readonly IE_NAME = "zingmp3:hub";
  static override readonly _VALID_URL = String.raw`https?://(?:mp3\.zing|zingmp3)\.vn/(?<type>hub)/[^/?#]+/(?<id>[^./?#]+)`;

  protected override async fetchPage(): Promise<Record<string, unknown>> {
    throw new Error("ZingMp3HubIE does not use paged extraction");
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const songId = match?.groups?.id ?? "";
    const urlType = match?.groups?.type ?? "";
    const hub = await this.callApi<Record<string, unknown>>(urlType, { id: songId });
    const entries = this.parseItems(asArray(hub.sections).filter((section) => getRecord(section).sectionId === "hub").flatMap((section) => asArray(getRecord(section).items)));
    return this.playlistResult(entries, songId, stringValue(hub.title) ?? null, stringValue(hub.description) ?? null);
  }
}

export class ZingMp3LiveRadioIE extends ZingMp3BaseIE {
  static override readonly IE_NAME = "zingmp3:liveradio";
  static override readonly _VALID_URL = String.raw`https?://(?:mp3\.zing|zingmp3)\.vn/(?<type>liveradio)/(?<id>\w+)(?:\.html|\?)`;

  protected override async fetchPage(): Promise<Record<string, unknown>> {
    throw new Error("ZingMp3LiveRadioIE does not use paged extraction");
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const urlType = match?.groups?.type ?? "";
    const liveRadioId = match?.groups?.id ?? "";
    const info = await this.callApi<Record<string, unknown>>(urlType, { id: liveRadioId });
    const manifestUrl = stringValue(info.streaming);
    if (!manifestUrl) {
      throw new ExtractorError("This radio is offline.", { expected: true, videoId: liveRadioId });
    }
    const [formats, subtitles] = await this.extractM3u8FormatsAndSubtitles(manifestUrl, liveRadioId, "mp4", { fatal: false });
    return {
      id: liveRadioId,
      is_live: true,
      formats,
      subtitles,
      title: stringValue(info.title),
      thumbnail: urlOrNone(info.thumbnail) ?? urlOrNone(info.thumbnailM) ?? urlOrNone(info.thumbnailV) ?? urlOrNone(info.thumbnailH) ?? undefined,
      view_count: intOrNone(info.activeUsers) ?? undefined,
      like_count: intOrNone(info.totalReaction) ?? undefined,
      description: stringValue(info.description),
    };
  }
}

export class ZingMp3PodcastEpisodeIE extends ZingMp3BaseIE {
  static override readonly IE_NAME = "zingmp3:podcast-episode";
  static override readonly _VALID_URL = ZingMp3BaseIE.VALID_URL_TMPL.replace("%s", "pgr|cgr");

  protected override async fetchPage(id: string, urlType: string, page: number): Promise<Record<string, unknown>> {
    return await this.callApi<Record<string, unknown>>(urlType, { id, page, count: ZingMp3BaseIE.PER_PAGE });
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const podcastId = match?.groups?.id ?? "";
    const urlType = match?.groups?.type ?? "";
    const info = await this.callApi<Record<string, unknown>>(urlType, { id: podcastId });
    const entries = await this.pagedList(podcastId, urlType === "pgr" ? "pgr-list" : "cgr-list");
    return this.playlistResult(entries, podcastId, stringValue(info.title) ?? null, stringValue(info.description) ?? null);
  }
}

export class ZingMp3PodcastIE extends ZingMp3BaseIE {
  static override readonly IE_NAME = "zingmp3:podcast";
  static override readonly _VALID_URL = String.raw`https?://(?:mp3\.zing|zingmp3)\.vn/(?<id>(?:cgr|top-podcast|podcast-new))/?(?:[#?]|$)`;

  protected override async fetchPage(): Promise<Record<string, unknown>> {
    throw new Error("ZingMp3PodcastIE does not use paged extraction");
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const urlType = this.matchId(url);
    const params: Record<string, string> = { id: urlType };
    if (urlType === "podcast-new") {
      params.type = "new";
    }
    const items = (await this.callApi<Record<string, unknown>>(urlType === "cgr" ? "cgrs" : urlType, params)).items;
    return this.playlistResult(this.parseItems(items), urlType);
  }
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function getPath(value: unknown, path: readonly (string | number)[]): unknown {
  let current = value;
  for (const key of path) {
    if (Array.isArray(current) && typeof key === "number") {
      current = current[key];
    } else if (current && typeof current === "object" && !Array.isArray(current) && typeof key === "string") {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}
