// Source: yt_dlp/extractor/zattoo.py

import { ExtractorError, intOrNone, joinNonempty, tryGet, urlOrNone, urlencodePostdata } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

type ZattooType = "video" | "live" | "record" | "ondemand";

abstract class ZattooPlatformBaseIE extends InfoExtractor {
  protected powerGuideHash: string | null = null;

  protected hostUrl(): string {
    const ctor = this.constructor as typeof ZattooPlatformBaseIE;
    return `https://${ctor.API_HOST ?? ctor.HOST}`;
  }

  static readonly HOST: string;
  static readonly API_HOST?: string;
  static readonly TYPE: ZattooType;

  protected override async realInitialize(): Promise<void> {
    await this.initializePreLogin();
    const [username, password] = await this.getLoginInfo((this.constructor as typeof ZattooPlatformBaseIE)._NETRC_MACHINE || null);
    if (username && password) {
      await this.performLogin(username, password);
    }
    if (!this.powerGuideHash) {
      this.raiseLoginRequired("An account is needed to access this media", { method: "password" });
    }
  }

  protected async performLogin(username: string, password: string): Promise<void> {
    const data = await this.downloadJson<{ session?: { power_guide_hash?: string } }>(
      `${this.hostUrl()}/zapi/v2/account/login`,
      "login",
      {
        note: "Logging in",
        data: urlencodePostdata({ login: username, password, remember: "true" }),
        headers: {
          Referer: `${this.hostUrl()}/login`,
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
      },
    );
    const powerGuideHash = data ? data.session?.power_guide_hash : null;
    if (!powerGuideHash) {
      throw new ExtractorError("Unable to login: incorrect username and/or password", { expected: true });
    }
    this.powerGuideHash = powerGuideHash;
  }

  protected override async initializePreLogin(): Promise<void> {
    const tokenData = await this.downloadJson<{ session_token?: string }>(
      `${this.hostUrl()}/token.json`,
      "session",
      { note: "Downloading session token" },
    );
    const sessionToken = tokenData ? tokenData.session_token : null;
    if (!sessionToken) {
      throw new ExtractorError("Unable to extract session token");
    }
    await this.requestWebpage(`${this.hostUrl()}/zapi/v3/session/hello`, "session", {
      note: "Opening session",
      data: urlencodePostdata({
        uuid: crypto.randomUUID(),
        lang: "en",
        app_version: "1.8.2",
        format: "json",
        client_app_token: sessionToken,
      }),
    });
  }

  protected async extractVideoIdFromRecording(recordId: string): Promise<string> {
    const playlist = await this.downloadJson<{ recordings?: Array<{ id?: unknown; program_id?: unknown }> }>(
      `${this.hostUrl()}/zapi/v2/playlist`,
      recordId,
      { note: "Downloading playlist" },
    );
    if (playlist !== false) {
      for (const item of playlist.recordings ?? []) {
        if (item.program_id && String(item.id) === recordId) {
          return String(item.program_id);
        }
      }
    }
    throw new ExtractorError("Could not extract video id from recording", { videoId: recordId });
  }

  protected async extractCid(videoId: string, channelName: string): Promise<string> {
    const data = await this.downloadJson<{ channel_groups?: Array<{ channels?: Array<Record<string, unknown>> }> }>(
      `${this.hostUrl()}/zapi/v2/cached/channels/${this.powerGuideHash}`,
      videoId,
      { note: "Downloading channel list", query: { details: false } },
    );
    if (data !== false) {
      for (const channel of (data.channel_groups ?? []).flatMap((group) => group.channels ?? [])) {
        const cid = stringValue(channel.cid);
        if (cid && (channel.display_alias === channelName || cid === channelName)) {
          return cid;
        }
      }
    }
    throw new ExtractorError("Could not extract channel id", { videoId });
  }

  protected async extractCidAndVideoInfo(videoId: string): Promise<[string, ExtractorInfo]> {
    const data = await this.downloadJson<{ programs?: Array<Record<string, unknown>> }>(
      `${this.hostUrl()}/zapi/v2/cached/program/power_details/${this.powerGuideHash}`,
      videoId,
      {
        note: "Downloading video information",
        query: { program_ids: videoId, complete: true },
      },
    );
    const program = data !== false ? data.programs?.[0] : null;
    const cid = stringValue(program?.cid);
    if (!program || !cid) {
      throw new ExtractorError("Unable to extract video information", { videoId });
    }
    return [cid, {
      id: videoId,
      title: stringValue(program.t) ?? stringValue(program.et),
      description: stringValue(program.d),
      thumbnail: stringValue(program.i_url),
      creator: stringValue(program.channel_name),
      episode: stringValue(program.et),
      episode_number: intOrNone(program.e_no) ?? undefined,
      season_number: intOrNone(program.s_no) ?? undefined,
      release_year: intOrNone(program.year) ?? undefined,
      categories: Array.isArray(program.c) ? program.c : undefined,
      tags: Array.isArray(program.g) ? program.g : undefined,
    }];
  }

  protected async extractOndemandInfo(ondemandId: string): Promise<[string, string, ExtractorInfo]> {
    const data = await this.downloadJson<Record<string, unknown>>(
      `${this.hostUrl()}/zapi/vod/movies/${ondemandId}`,
      ondemandId,
      { note: "Downloading ondemand information" },
    );
    if (data === false) {
      throw new ExtractorError("Unable to download ondemand information", { videoId: ondemandId });
    }
    const token = stringValue(getPath(data, ["terms_catalog", 0, "terms", 0, "token"]));
    const type = stringValue(data.type);
    if (!token || !type) {
      throw new ExtractorError("Unable to extract ondemand token", { videoId: ondemandId });
    }
    return [token, type, {
      id: ondemandId,
      title: stringValue(data.title),
      description: stringValue(data.description),
      duration: intOrNone(data.duration) ?? undefined,
      release_year: intOrNone(data.year) ?? undefined,
      episode_number: intOrNone(data.episode_number) ?? undefined,
      season_number: intOrNone(data.season_number) ?? undefined,
      categories: Array.isArray(data.categories) ? data.categories : undefined,
    }];
  }

  protected async extractFormats(
    cid: string | null,
    videoId: string,
    options: { recordId?: string | null; ondemandId?: string | null; ondemandTermtoken?: string | null; ondemandType?: string | null; isLive?: boolean } = {},
  ): Promise<[Array<Record<string, unknown>>, Record<string, unknown[]>]> {
    const common: Record<string, string | number | boolean | null | undefined> = { https_watch_urls: true };
    let endpoint: string;
    if (options.isLive) {
      common.timeshift = 10800;
      endpoint = `${this.hostUrl()}/zapi/watch/live/${cid}`;
    } else if (options.recordId) {
      endpoint = `${this.hostUrl()}/zapi/watch/recording/${options.recordId}`;
    } else if (options.ondemandId) {
      Object.assign(common, {
        teasable_id: options.ondemandId,
        term_token: options.ondemandTermtoken,
        teasable_type: options.ondemandType,
      });
      endpoint = `${this.hostUrl()}/zapi/watch/vod/video`;
    } else {
      endpoint = `${this.hostUrl()}/zapi/v3/watch/replay/${cid}/${videoId}`;
    }

    const formats: Array<Record<string, unknown>> = [];
    const subtitles: Record<string, unknown[]> = {};
    for (const streamType of ["dash", "hls7"]) {
      const data = await this.downloadJson<{ stream?: { watch_urls?: Array<Record<string, unknown>> } }>(endpoint, videoId, {
        note: `Downloading ${streamType.toUpperCase()} formats`,
        data: urlencodePostdata({ ...common, stream_type: streamType }),
        fatal: false,
      });
      for (const watch of data ? data.stream?.watch_urls ?? [] : []) {
        const watchUrl = urlOrNone(watch.url);
        if (!watchUrl) {
          continue;
        }
        const audioChannel = stringValue(watch.audio_channel);
        const preference = audioChannel === "A" ? 1 : undefined;
        const formatId = joinNonempty(streamType, watch.maxrate, audioChannel);
        let theseFormats: Array<Record<string, unknown>> = [];
        let theseSubtitles: Record<string, unknown[]> = {};
        if (streamType.startsWith("dash")) {
          [theseFormats, theseSubtitles] = await this.extractMpdFormatsAndSubtitles(watchUrl, videoId, { mpdId: formatId, fatal: false });
        } else {
          [theseFormats, theseSubtitles] = await this.extractM3u8FormatsAndSubtitles(watchUrl, videoId, "mp4", {
            entryProtocol: "m3u8_native",
            m3u8Id: formatId,
            fatal: false,
          });
        }
        this.mergeSubtitles(theseSubtitles, subtitles);
        for (const format of theseFormats) {
          format.quality = preference;
          formats.push(format);
        }
      }
    }
    return [formats, subtitles];
  }

  protected async extractVideo(videoId: string, recordId: string | null = null): Promise<ExtractorInfo> {
    const [cid, info] = await this.extractCidAndVideoInfo(videoId);
    const [formats, subtitles] = await this.extractFormats(cid, videoId, { recordId });
    return { ...info, formats, subtitles };
  }

  protected async extractLive(channelName: string): Promise<ExtractorInfo> {
    const cid = await this.extractCid(channelName, channelName);
    const [formats, subtitles] = await this.extractFormats(cid, cid, { isLive: true });
    return { id: channelName, title: channelName, is_live: true, formats, subtitles };
  }

  protected async extractRecord(recordId: string): Promise<ExtractorInfo> {
    const videoId = await this.extractVideoIdFromRecording(recordId);
    return await this.extractVideo(videoId, recordId);
  }

  protected async extractOndemand(ondemandId: string): Promise<ExtractorInfo> {
    const [termToken, ondemandType, info] = await this.extractOndemandInfo(ondemandId);
    const [formats, subtitles] = await this.extractFormats(null, ondemandId, {
      ondemandId,
      ondemandTermtoken: termToken,
      ondemandType,
    });
    return { ...info, formats, subtitles };
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const videoId = match?.groups?.vid1 || match?.groups?.vid2;
    if (!videoId) {
      throw new ExtractorError("Invalid Zattoo platform URL", { expected: true });
    }
    const type = (this.constructor as typeof ZattooPlatformBaseIE).TYPE;
    if (type === "video") return await this.extractVideo(videoId);
    if (type === "live") return await this.extractLive(videoId);
    if (type === "record") return await this.extractRecord(videoId);
    return await this.extractOndemand(videoId);
  }
}

function createValidUrl(host: string, match: string, qs: string, baseRe: string | null = null): string {
  const matchBase = baseRe ? String.raw`|${baseRe}/(?<vid1>${match})` : "(?<vid1>)";
  return String.raw`https?://(?:www\.)?${RegExp.escape(host)}/(?:[^?#]+\?(?:[^#]+&)?${qs}=(?<vid2>${match})${matchBase})`;
}

abstract class ZattooBaseIE extends ZattooPlatformBaseIE {
  static override readonly _NETRC_MACHINE = "zattoo";
  static override readonly HOST = "zattoo.com";
}
export class ZattooIE extends ZattooBaseIE { static override readonly _VALID_URL = createValidUrl(ZattooBaseIE.HOST, String.raw`\d+`, "program", String.raw`(?:program|watch)/[^/]+`); static override readonly TYPE = "video" as const; }
export class ZattooLiveIE extends ZattooBaseIE { static override readonly _VALID_URL = createValidUrl(ZattooBaseIE.HOST, String.raw`[^/?&#]+`, "channel", "live"); static override readonly TYPE = "live" as const; static override suitable(url: string): boolean { return ZattooIE.suitable(url) ? false : super.suitable(url); } }
export class ZattooMoviesIE extends ZattooBaseIE { static override readonly _VALID_URL = createValidUrl(ZattooBaseIE.HOST, String.raw`\w+`, "movie_id", "vod/movies"); static override readonly TYPE = "ondemand" as const; }
export class ZattooRecordingsIE extends ZattooBaseIE { static override readonly _VALID_URL = createValidUrl("zattoo.com", String.raw`\d+`, "recording"); static override readonly TYPE = "record" as const; }

abstract class NetPlusTVBaseIE extends ZattooPlatformBaseIE { static override readonly _NETRC_MACHINE = "netplus"; static override readonly HOST = "netplus.tv"; static override readonly API_HOST = "www.netplus.tv"; }
export class NetPlusTVIE extends NetPlusTVBaseIE { static override readonly _VALID_URL = createValidUrl(NetPlusTVBaseIE.HOST, String.raw`\d+`, "program", String.raw`(?:program|watch)/[^/]+`); static override readonly TYPE = "video" as const; }
export class NetPlusTVLiveIE extends NetPlusTVBaseIE { static override readonly _VALID_URL = createValidUrl(NetPlusTVBaseIE.HOST, String.raw`[^/?&#]+`, "channel", "live"); static override readonly TYPE = "live" as const; static override suitable(url: string): boolean { return NetPlusTVIE.suitable(url) ? false : super.suitable(url); } }
export class NetPlusTVRecordingsIE extends NetPlusTVBaseIE { static override readonly _VALID_URL = createValidUrl(NetPlusTVBaseIE.HOST, String.raw`\d+`, "recording"); static override readonly TYPE = "record" as const; }

abstract class MNetTVBaseIE extends ZattooPlatformBaseIE { static override readonly _NETRC_MACHINE = "mnettv"; static override readonly HOST = "tvplus.m-net.de"; }
export class MNetTVIE extends MNetTVBaseIE { static override readonly _VALID_URL = createValidUrl(MNetTVBaseIE.HOST, String.raw`\d+`, "program", String.raw`(?:program|watch)/[^/]+`); static override readonly TYPE = "video" as const; }
export class MNetTVLiveIE extends MNetTVBaseIE { static override readonly _VALID_URL = createValidUrl(MNetTVBaseIE.HOST, String.raw`[^/?&#]+`, "channel", "live"); static override readonly TYPE = "live" as const; static override suitable(url: string): boolean { return MNetTVIE.suitable(url) ? false : super.suitable(url); } }
export class MNetTVRecordingsIE extends MNetTVBaseIE { static override readonly _VALID_URL = createValidUrl(MNetTVBaseIE.HOST, String.raw`\d+`, "recording"); static override readonly TYPE = "record" as const; }

abstract class WalyTVBaseIE extends ZattooPlatformBaseIE { static override readonly _NETRC_MACHINE = "walytv"; static override readonly HOST = "player.waly.tv"; }
export class WalyTVIE extends WalyTVBaseIE { static override readonly _VALID_URL = createValidUrl(WalyTVBaseIE.HOST, String.raw`\d+`, "program", String.raw`(?:program|watch)/[^/]+`); static override readonly TYPE = "video" as const; }
export class WalyTVLiveIE extends WalyTVBaseIE { static override readonly _VALID_URL = createValidUrl(WalyTVBaseIE.HOST, String.raw`[^/?&#]+`, "channel", "live"); static override readonly TYPE = "live" as const; static override suitable(url: string): boolean { return WalyTVIE.suitable(url) ? false : super.suitable(url); } }
export class WalyTVRecordingsIE extends WalyTVBaseIE { static override readonly _VALID_URL = createValidUrl(WalyTVBaseIE.HOST, String.raw`\d+`, "recording"); static override readonly TYPE = "record" as const; }

abstract class BBVTVBaseIE extends ZattooPlatformBaseIE { static override readonly _NETRC_MACHINE = "bbvtv"; static override readonly HOST = "bbv-tv.net"; static override readonly API_HOST = "www.bbv-tv.net"; }
export class BBVTVIE extends BBVTVBaseIE { static override readonly _VALID_URL = createValidUrl(BBVTVBaseIE.HOST, String.raw`\d+`, "program", String.raw`(?:program|watch)/[^/]+`); static override readonly TYPE = "video" as const; }
export class BBVTVLiveIE extends BBVTVBaseIE { static override readonly _VALID_URL = createValidUrl(BBVTVBaseIE.HOST, String.raw`[^/?&#]+`, "channel", "live"); static override readonly TYPE = "live" as const; static override suitable(url: string): boolean { return BBVTVIE.suitable(url) ? false : super.suitable(url); } }
export class BBVTVRecordingsIE extends BBVTVBaseIE { static override readonly _VALID_URL = createValidUrl(BBVTVBaseIE.HOST, String.raw`\d+`, "recording"); static override readonly TYPE = "record" as const; }

abstract class VTXTVBaseIE extends ZattooPlatformBaseIE { static override readonly _NETRC_MACHINE = "vtxtv"; static override readonly HOST = "vtxtv.ch"; static override readonly API_HOST = "www.vtxtv.ch"; }
export class VTXTVIE extends VTXTVBaseIE { static override readonly _VALID_URL = createValidUrl(VTXTVBaseIE.HOST, String.raw`\d+`, "program", String.raw`(?:program|watch)/[^/]+`); static override readonly TYPE = "video" as const; }
export class VTXTVLiveIE extends VTXTVBaseIE { static override readonly _VALID_URL = createValidUrl(VTXTVBaseIE.HOST, String.raw`[^/?&#]+`, "channel", "live"); static override readonly TYPE = "live" as const; static override suitable(url: string): boolean { return VTXTVIE.suitable(url) ? false : super.suitable(url); } }
export class VTXTVRecordingsIE extends VTXTVBaseIE { static override readonly _VALID_URL = createValidUrl(VTXTVBaseIE.HOST, String.raw`\d+`, "recording"); static override readonly TYPE = "record" as const; }

abstract class GlattvisionTVBaseIE extends ZattooPlatformBaseIE { static override readonly _NETRC_MACHINE = "glattvisiontv"; static override readonly HOST = "iptv.glattvision.ch"; }
export class GlattvisionTVIE extends GlattvisionTVBaseIE { static override readonly _VALID_URL = createValidUrl(GlattvisionTVBaseIE.HOST, String.raw`\d+`, "program", String.raw`(?:program|watch)/[^/]+`); static override readonly TYPE = "video" as const; }
export class GlattvisionTVLiveIE extends GlattvisionTVBaseIE { static override readonly _VALID_URL = createValidUrl(GlattvisionTVBaseIE.HOST, String.raw`[^/?&#]+`, "channel", "live"); static override readonly TYPE = "live" as const; static override suitable(url: string): boolean { return GlattvisionTVIE.suitable(url) ? false : super.suitable(url); } }
export class GlattvisionTVRecordingsIE extends GlattvisionTVBaseIE { static override readonly _VALID_URL = createValidUrl(GlattvisionTVBaseIE.HOST, String.raw`\d+`, "recording"); static override readonly TYPE = "record" as const; }

abstract class SAKTVBaseIE extends ZattooPlatformBaseIE { static override readonly _NETRC_MACHINE = "saktv"; static override readonly HOST = "saktv.ch"; static override readonly API_HOST = "www.saktv.ch"; }
export class SAKTVIE extends SAKTVBaseIE { static override readonly _VALID_URL = createValidUrl(SAKTVBaseIE.HOST, String.raw`\d+`, "program", String.raw`(?:program|watch)/[^/]+`); static override readonly TYPE = "video" as const; }
export class SAKTVLiveIE extends SAKTVBaseIE { static override readonly _VALID_URL = createValidUrl(SAKTVBaseIE.HOST, String.raw`[^/?&#]+`, "channel", "live"); static override readonly TYPE = "live" as const; static override suitable(url: string): boolean { return SAKTVIE.suitable(url) ? false : super.suitable(url); } }
export class SAKTVRecordingsIE extends SAKTVBaseIE { static override readonly _VALID_URL = createValidUrl(SAKTVBaseIE.HOST, String.raw`\d+`, "recording"); static override readonly TYPE = "record" as const; }

abstract class EWETVBaseIE extends ZattooPlatformBaseIE { static override readonly _NETRC_MACHINE = "ewetv"; static override readonly HOST = "tvonline.ewe.de"; }
export class EWETVIE extends EWETVBaseIE { static override readonly _VALID_URL = createValidUrl(EWETVBaseIE.HOST, String.raw`\d+`, "program", String.raw`(?:program|watch)/[^/]+`); static override readonly TYPE = "video" as const; }
export class EWETVLiveIE extends EWETVBaseIE { static override readonly _VALID_URL = createValidUrl(EWETVBaseIE.HOST, String.raw`[^/?&#]+`, "channel", "live"); static override readonly TYPE = "live" as const; static override suitable(url: string): boolean { return EWETVIE.suitable(url) ? false : super.suitable(url); } }
export class EWETVRecordingsIE extends EWETVBaseIE { static override readonly _VALID_URL = createValidUrl(EWETVBaseIE.HOST, String.raw`\d+`, "recording"); static override readonly TYPE = "record" as const; }

abstract class QuantumTVBaseIE extends ZattooPlatformBaseIE { static override readonly _NETRC_MACHINE = "quantumtv"; static override readonly HOST = "quantum-tv.com"; static override readonly API_HOST = "www.quantum-tv.com"; }
export class QuantumTVIE extends QuantumTVBaseIE { static override readonly _VALID_URL = createValidUrl(QuantumTVBaseIE.HOST, String.raw`\d+`, "program", String.raw`(?:program|watch)/[^/]+`); static override readonly TYPE = "video" as const; }
export class QuantumTVLiveIE extends QuantumTVBaseIE { static override readonly _VALID_URL = createValidUrl(QuantumTVBaseIE.HOST, String.raw`[^/?&#]+`, "channel", "live"); static override readonly TYPE = "live" as const; static override suitable(url: string): boolean { return QuantumTVIE.suitable(url) ? false : super.suitable(url); } }
export class QuantumTVRecordingsIE extends QuantumTVBaseIE { static override readonly _VALID_URL = createValidUrl(QuantumTVBaseIE.HOST, String.raw`\d+`, "recording"); static override readonly TYPE = "record" as const; }

abstract class OsnatelTVBaseIE extends ZattooPlatformBaseIE { static override readonly _NETRC_MACHINE = "osnateltv"; static override readonly HOST = "tvonline.osnatel.de"; }
export class OsnatelTVIE extends OsnatelTVBaseIE { static override readonly _VALID_URL = createValidUrl(OsnatelTVBaseIE.HOST, String.raw`\d+`, "program", String.raw`(?:program|watch)/[^/]+`); static override readonly TYPE = "video" as const; }
export class OsnatelTVLiveIE extends OsnatelTVBaseIE { static override readonly _VALID_URL = createValidUrl(OsnatelTVBaseIE.HOST, String.raw`[^/?&#]+`, "channel", "live"); static override readonly TYPE = "live" as const; static override suitable(url: string): boolean { return OsnatelTVIE.suitable(url) ? false : super.suitable(url); } }
export class OsnatelTVRecordingsIE extends OsnatelTVBaseIE { static override readonly _VALID_URL = createValidUrl(OsnatelTVBaseIE.HOST, String.raw`\d+`, "recording"); static override readonly TYPE = "record" as const; }

abstract class EinsUndEinsTVBaseIE extends ZattooPlatformBaseIE { static override readonly _NETRC_MACHINE = "1und1tv"; static override readonly HOST = "1und1.tv"; static override readonly API_HOST = "www.1und1.tv"; }
export class EinsUndEinsTVIE extends EinsUndEinsTVBaseIE { static override readonly _VALID_URL = createValidUrl(EinsUndEinsTVBaseIE.HOST, String.raw`\d+`, "program", String.raw`(?:program|watch)/[^/]+`); static override readonly TYPE = "video" as const; }
export class EinsUndEinsTVLiveIE extends EinsUndEinsTVBaseIE { static override readonly _VALID_URL = createValidUrl(EinsUndEinsTVBaseIE.HOST, String.raw`[^/?&#]+`, "channel", "live"); static override readonly TYPE = "live" as const; static override suitable(url: string): boolean { return EinsUndEinsTVIE.suitable(url) ? false : super.suitable(url); } }
export class EinsUndEinsTVRecordingsIE extends EinsUndEinsTVBaseIE { static override readonly _VALID_URL = createValidUrl(EinsUndEinsTVBaseIE.HOST, String.raw`\d+`, "recording"); static override readonly TYPE = "record" as const; }

abstract class SaltTVBaseIE extends ZattooPlatformBaseIE { static override readonly _NETRC_MACHINE = "salttv"; static override readonly HOST = "tv.salt.ch"; }
export class SaltTVIE extends SaltTVBaseIE { static override readonly _VALID_URL = createValidUrl(SaltTVBaseIE.HOST, String.raw`\d+`, "program", String.raw`(?:program|watch)/[^/]+`); static override readonly TYPE = "video" as const; }
export class SaltTVLiveIE extends SaltTVBaseIE { static override readonly _VALID_URL = createValidUrl(SaltTVBaseIE.HOST, String.raw`[^/?&#]+`, "channel", "live"); static override readonly TYPE = "live" as const; static override suitable(url: string): boolean { return SaltTVIE.suitable(url) ? false : super.suitable(url); } }
export class SaltTVRecordingsIE extends SaltTVBaseIE { static override readonly _VALID_URL = createValidUrl(SaltTVBaseIE.HOST, String.raw`\d+`, "recording"); static override readonly TYPE = "record" as const; }

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

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
