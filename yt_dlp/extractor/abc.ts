// Source: yt_dlp/extractor/abc.py

import crypto from "crypto";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import {
  ExtractorError,
  dictGet,
  intOrNone,
  jsToJson,
  parseIso8601,
  strOrNone,
  traverseObj,
  tryGet,
  unescapeHTML,
  updateUrlQuery,
  urlOrNone,
} from "../utils/index.ts";

export class ABCIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?abc\.net\.au/(?:news|btn|listen)/(?:[^/?#]+/){1,4}(?<id>\d{5,})`;

  static override get IE_NAME(): string {
    return "abc.net.au";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new ExtractorError("Unable to download webpage");
    }

    let mobj =
      /<a\s+href="(?<url>[^"]+)"\s+data-duration="\d+"\s+title="Download audio directly">/.exec(
        webpage,
      );
    let urlsInfo: any = null;
    let youtube = false;
    let video = false;

    if (mobj) {
      urlsInfo = { url: mobj.groups?.url };
      youtube = false;
      video = false;
    } else {
      mobj =
        /<a href="(?<url>http:\/\/www\.youtube\.com\/watch\?v=[^"]+)"><span><strong>External Link:<\/strong>/.exec(
          webpage,
        );
      if (!mobj) {
        mobj =
          /<iframe width="100%" src="(?<url>\/\/www\.youtube-nocookie\.com\/embed\/[^?"]+)/.exec(
            webpage,
          );
      }
      if (mobj) {
        urlsInfo = { url: mobj.groups?.url };
        youtube = true;
        video = true;
      }
    }

    if (!mobj) {
      mobj =
        /(?:"sources"|"files"|"renditions"):\s*(?<json_data>\[[^\]]+\])/.exec(
          webpage,
        );
      if (!mobj) {
        mobj =
          /inline(?<type>Video|Audio|YouTube)Data\.push\((?<json_data>[^)]+)\);/.exec(
            webpage,
          );
        if (!mobj) {
          const expired = this.htmlSearchRegex(
            /class="expired-(?:video|audio)".+?<span>(.+?)<\/span>/,
            webpage,
            "expired",
            { defaultValue: null },
          );
          if (expired) {
            throw new ExtractorError(
              `${this.constructor.name} said: ${expired}`,
              { expected: true },
            );
          }
          throw new ExtractorError("Unable to extract video urls");
        }
      }

      urlsInfo = this.parseJson<any>(mobj.groups?.json_data || "", videoId, {
        transform_source: jsToJson,
      });
      youtube = mobj.groups?.type === "YouTube";
      video =
        mobj.groups?.type === "Video" ||
        traverseObj(urlsInfo, [0, ["contentType", "MIMEType"]], {
          getAll: false,
        }) === "video/mp4";
    }

    const urlsInfoList = Array.isArray(urlsInfo) ? urlsInfo : [urlsInfo];

    if (youtube) {
      return this.playlistResult(
        urlsInfoList.map((urlInfo: any) => this.urlResult(urlInfo.url)),
      );
    }

    const formats: Array<Record<string, any>> = [];
    for (const urlInfo of urlsInfoList) {
      if (!urlInfo || !urlInfo.url) {
        continue;
      }
      let height = intOrNone(urlInfo.height);
      let bitrate = intOrNone(urlInfo.bitrate);
      let width = intOrNone(urlInfo.width);
      let formatId: string | null = null;
      const matchUrl = /_(?:(?<height>\d+)|(?<bitrate>\d+)k)\.mp4$/.exec(
        urlInfo.url,
      );
      if (matchUrl) {
        const heightFromUrl = matchUrl.groups?.height;
        if (heightFromUrl) {
          height = height || intOrNone(heightFromUrl);
          width = width || intOrNone(urlInfo.label);
        } else {
          bitrate = bitrate || intOrNone(matchUrl.groups?.bitrate);
          formatId = strOrNone(urlInfo.label);
        }
      }
      formats.push({
        url: urlInfo.url,
        vcodec: video ? urlInfo.codec || undefined : "none",
        width: width ?? undefined,
        height: height ?? undefined,
        tbr: bitrate ?? undefined,
        filesize: intOrNone(urlInfo.filesize) ?? undefined,
        format_id: formatId ?? undefined,
      });
    }

    return {
      id: videoId,
      title: this.ogSearchTitle(webpage) || videoId,
      formats,
      description: this.ogSearchDescription(webpage) || undefined,
      thumbnail: this.ogSearchThumbnail(webpage) || undefined,
    };
  }
}

export class ABCIViewIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://iview\.abc\.net\.au/(?:[^/]+/)*video/(?<id>[^/?#]+)`;
  static override readonly _GEO_COUNTRIES = ["AU"];

  static override get IE_NAME(): string {
    return "abc.net.au:iview";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const videoParams = await this.downloadJson<any>(
      "https://iview.abc.net.au/api/programs/" + videoId,
      videoId,
    );
    const title =
      unescapeHTML(videoParams.title || videoParams.seriesTitle) || videoId;
    const stream = videoParams.playlist.find((s: any) =>
      ["program", "livestream"].includes(s?.type),
    );
    if (!stream) {
      throw new ExtractorError("No playlist stream found");
    }

    const houseNumber = videoParams.episodeHouseNumber || videoId;
    const ts = Math.floor(Date.now() / 1000);
    const path = `/auth/hls/sign?ts=${ts}&hn=${houseNumber}&d=android-tablet`;
    const sig = crypto
      .createHmac("sha256", Buffer.from("android.content.res.Resources"))
      .update(path)
      .digest("hex");
    const token = await this.downloadWebpage(
      `http://iview.abc.net.au${path}&sig=${sig}`,
      videoId,
    );
    if (token === false) {
      throw new ExtractorError("Unable to download token");
    }

    const tokenizeUrl = (urlStr: string, tokenVal: string) => {
      return updateUrlQuery(urlStr, { hdnea: tokenVal });
    };

    let formats: Array<Record<string, any>> = [];
    for (const sd of ["1080", "720", "sd", "sd-low"]) {
      const sdUrl = tryGet(stream, (x: any) => x.streams.hls[sd]);
      if (!sdUrl) {
        continue;
      }
      try {
        formats = this.extractM3u8Formats(
          tokenizeUrl(String(sdUrl), token),
          videoId,
          "mp4",
          { entryProtocol: "m3u8_native", m3u8Id: "hls" },
        );
        if (formats.length) {
          break;
        }
      } catch (e) {
        // ignore and try next rendition
      }
    }

    const subtitles: Record<string, Array<{ url: string; ext: string }>> = {};
    const srcVtt = tryGet(stream, (x: any) => x.captions?.["src-vtt"]);
    if (srcVtt) {
      subtitles.en = [
        {
          url: String(srcVtt),
          ext: "vtt",
        },
      ];
    }

    const isLive = videoParams.livestream === "1";

    return {
      id: videoId,
      title,
      description: videoParams.description || undefined,
      thumbnail: videoParams.thumbnail || undefined,
      duration: intOrNone(videoParams.eventDuration) ?? undefined,
      timestamp: parseIso8601(videoParams.pubDate, " ") ?? undefined,
      series: unescapeHTML(videoParams.seriesTitle) || undefined,
      series_id: videoParams.seriesHouseNumber || videoId.slice(0, 7),
      season_number:
        intOrNone(
          this.searchRegex(/\bSeries\s+(\d+)\b/, title, "season number", {
            fatal: false,
            defaultValue: null,
          }),
        ) ?? undefined,
      episode_number:
        intOrNone(
          this.searchRegex(/\bEp\s+(\d+)\b/, title, "episode number", {
            fatal: false,
            defaultValue: null,
          }),
        ) ?? undefined,
      episode_id: houseNumber,
      episode:
        this.searchRegex(
          /^(?:Series\s+\d+)?\s*(?:Ep\s+\d+)?\s*(.*)$/,
          title,
          "episode",
          { fatal: false, defaultValue: "" },
        ) || undefined,
      uploader_id: videoParams.channel || undefined,
      formats,
      subtitles,
      is_live: isLive,
    };
  }
}

export class ABCIViewShowSeriesIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://iview\.abc\.net\.au/show/(?<id>[^/]+)(?:/series/\d+)?$`;
  static override readonly _GEO_COUNTRIES = ["AU"];

  static override get IE_NAME(): string {
    return "abc.net.au:iview:showseries";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const showId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, showId);
    if (webpage === false) {
      throw new ExtractorError("Unable to download webpage");
    }

    const parsedState = this.searchJson<any>(
      `window.__INITIAL_STATE__\\s*=\\s*['"]`,
      webpage,
      "initial state",
      showId,
      {
        endPattern: `['"]\\s*;`,
        transform_source: decodeUnicodeEscape,
      },
    );
    if (!parsedState) {
      throw new Error("Unable to locate initial state");
    }
    const videoData = parsedState.route?.pageData?._embedded || {};

    const highlight = tryGet(videoData, (x: any) => x.highlightVideo?.shareUrl);
    if (
      highlight &&
      !this.yesPlaylist(showId, true, { videoLabel: "highlight video" })
    ) {
      return this.urlResult(String(highlight), "ABCIView");
    }

    const series = videoData.selectedSeries || {};
    const entries: ExtractorInfo[] = [];
    const items =
      series._embedded?.videoEpisodes?.items ||
      series._embedded?.videoEpisodes ||
      [];
    const itemsList = Array.isArray(items) ? items : [items];
    for (const item of itemsList) {
      if (item?.shareUrl) {
        const itemUrl = urlOrNone(item.shareUrl);
        if (itemUrl) {
          entries.push(this.urlResult(itemUrl, "ABCIView"));
        }
      }
    }

    const thumbnail = traverseObj(
      series,
      ["thumbnail", "images", (v: any) => v.name === "seriesThumbnail", "url"],
      { getAll: false },
    ) as string | null;

    return {
      _type: "playlist",
      id: series.id ? String(series.id) : showId,
      title: String(dictGet(series, ["title", "displaySubtitle"]) || showId),
      description: series.description ? String(series.description) : undefined,
      series: String(dictGet(series, ["showTitle", "displayTitle"]) || ""),
      season: String(dictGet(series, ["title", "displaySubtitle"]) || ""),
      thumbnail: thumbnail || undefined,
      entries,
    };
  }
}

function decodeUnicodeEscape(str: string): string {
  return str
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\\(['"\\/bfnrt])/g, (_, char) => {
      const map: Record<string, string> = {
        "'": "'",
        '"': '"',
        "\\": "\\",
        "/": "/",
        b: "\b",
        f: "\f",
        n: "\n",
        r: "\r",
        t: "\t",
      };
      return map[char] || char;
    });
}
