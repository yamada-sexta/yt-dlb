// Source: yt_dlp/extractor/youku.py

import {
  ExtractorError,
  cleanHtml,
  getElementByClass,
  jsToJson,
  strOrNone,
  stripJsonp,
} from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function randomYsuid(): string {
  const letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let suffix = "";
  for (let index = 0; index < 3; index += 1) {
    suffix += letters[Math.floor(Math.random() * letters.length)] ?? "a";
  }
  return `${Math.trunc(Date.now() / 1000)}${suffix}`;
}

export class YoukuIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`(?x)(?:(?:https?://(?:(?:v|play(?:er)?)\.(?:youku|tudou)\.com/(?:v_show/id_|player\.php/sid/)|video\.tudou\.com/v/))|youku:)(?<id>[A-Za-z0-9]+)(?:\.html|/v\.swf|)`.replace(
      /\(\?x\)|\s+/g,
      "",
    );

  static override get IE_NAME(): string {
    return "youku";
  }

  private formatName(format: unknown): string | undefined {
    const map: Record<string, string> = {
      "3gp": "h6",
      "3gphd": "h5",
      flv: "h4",
      flvhd: "h4",
      mp4: "h3",
      mp4hd: "h3",
      mp4hd2: "h4",
      mp4hd3: "h4",
      hd2: "h2",
      hd3: "h1",
    };
    return typeof format === "string" ? map[format] : undefined;
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    void randomYsuid();
    const egResponse = await this.downloadWebpageHandle(
      "https://log.mmstat.com/eg.js",
      videoId,
      { note: "Retrieving cna info", fatal: false },
    );
    const etag =
      egResponse === false ? null : egResponse[1].headers.get("etag");
    const cna = etag ? etag.replace(/^"|"$/g, "") : "";

    const query: Record<string, string | number> = {
      vid: videoId,
      ccode: "0564",
      client_ip: "192.168.1.1",
      utid: cna,
      client_ts: Date.now() / 1000,
    };
    const videoPassword = this.getParam<string | null>("videopassword", null);
    if (videoPassword) {
      query.password = videoPassword;
    }

    const response = (await this.downloadJson<{
      data?: Record<string, unknown>;
    }>("https://ups.youku.com/ups/get.json", videoId, {
      note: "Downloading JSON metadata",
      query,
      headers: { Referer: url },
    })) as { data?: Record<string, unknown> } | false;
    const data = record(response ? response.data : null);
    const error = record(data.error);
    if (Object.keys(error).length) {
      const note = typeof error.note === "string" ? error.note : null;
      if (note?.includes("因版权原因无法观看此视频")) {
        throw new ExtractorError(
          "Youku said: Sorry, this video is available in China only",
          { expected: true, videoId },
        );
      }
      if (note?.includes("该视频被设为私密")) {
        throw new ExtractorError("Youku said: Sorry, this video is private", {
          expected: true,
          videoId,
        });
      }
      throw new ExtractorError(
        `Youku server reported error ${String(error.code ?? "")}${note ? `: ${cleanHtml(note)}` : ""}`,
        { videoId },
      );
    }

    const videoData = record(data.video);
    const streams = Array.isArray(data.stream) ? data.stream : [];
    const formats = streams.flatMap((item) => {
      const stream = record(item);
      if (
        stream.channel_type === "tail" ||
        typeof stream.m3u8_url !== "string"
      ) {
        return [];
      }
      return [
        {
          url: stream.m3u8_url,
          format_id: this.formatName(stream.stream_type),
          ext: "mp4",
          protocol: "m3u8_native",
          filesize: Number(stream.size),
          width: stream.width,
          height: stream.height,
        },
      ];
    });

    return {
      id: videoId,
      title: String(videoData.title ?? videoId),
      formats,
      duration: videoData.seconds,
      thumbnail: videoData.logo,
      uploader: videoData.username,
      uploader_id: strOrNone(videoData.userid) ?? undefined,
      uploader_url: record(data.uploader).homepage,
      tags: videoData.tags,
    };
  }
}

export class YoukuShowIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://list\.youku\.com/show/id_(?<id>[0-9a-z]+)\.html`;

  static override get IE_NAME(): string {
    return "youku:show";
  }

  private async extractEntries(
    playlistDataUrl: string,
    showId: string,
    note: string,
    query: Record<string, string>,
  ): Promise<[string | null, ExtractorInfo[] | null]> {
    const response = (await this.downloadJson<{ html?: string }>(
      playlistDataUrl,
      showId,
      {
        query: { ...query, callback: "cb" },
        note,
        transform_source: (source) => jsToJson(stripJsonp(source)),
      },
    )) as { html?: string } | false;
    const playlistData = response ? (response.html ?? null) : null;
    if (playlistData === null) {
      return [null, null];
    }
    const dramaList =
      getElementByClass("p-drama-grid", playlistData) ??
      getElementByClass("p-drama-half-row", playlistData);
    if (dramaList === null) {
      throw new ExtractorError("No episodes found", { videoId: showId });
    }
    const entries = [...dramaList.matchAll(/<a[^>]+href="([^"]+)"/g)]
      .map((match) =>
        this.urlResult(
          this.protoRelativeUrl(match[1] ?? "", "http:") ?? "",
          YoukuIE,
        ),
      )
      .filter((entry) => Boolean(entry.url));
    return [playlistData, entries];
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const showId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, showId);
    if (webpage === false) {
      throw new Error("Unable to download Youku show webpage");
    }
    const pageConfigRaw = this.searchRegex(
      String.raw`var\s+PageConfig\s*=\s*(\{.+});`,
      webpage,
      "page config",
    );
    const pageConfig =
      typeof pageConfigRaw === "string"
        ? (this.parseJson<Record<string, unknown>>(pageConfigRaw, showId, {
            transform_source: jsToJson,
          }) ?? {})
        : {};
    const [firstPage, initialEntries] = await this.extractEntries(
      "http://list.youku.com/show/module",
      showId,
      "Downloading initial playlist data page",
      {
        id: String(pageConfig.showid ?? showId),
        tab: "showInfo",
      },
    );
    const entries = initialEntries ? [...initialEntries] : [];
    if (firstPage) {
      const firstPageReloadId = this.htmlSearchRegex(
        String.raw`<div[^>]+id="(reload_\d+)`,
        firstPage,
        "first page reload id",
        { defaultValue: null },
      );
      const reloadIds = [...firstPage.matchAll(/<li[^>]+data-id="([^"]+)"/g)]
        .map((match) => match[1])
        .filter((item): item is string => Boolean(item));
      for (const [index, reloadId] of reloadIds.entries()) {
        if (reloadId === firstPageReloadId) {
          continue;
        }
        const [, newEntries] = await this.extractEntries(
          "http://list.youku.com/show/episode",
          showId,
          `Downloading playlist data page ${index + 1}`,
          {
            id: String(pageConfig.showid ?? showId),
            stage: reloadId,
          },
        );
        if (newEntries) {
          entries.push(...newEntries);
        }
      }
    }
    const description = this.htmlSearchMeta("description", webpage);
    const playlistTitle = description?.split(",")[0] ?? null;
    const detail = getElementByClass("p-intro", webpage);
    const playlistDescription = detail
      ? getElementByClass("intro-more", detail)
      : null;
    return this.playlistResult(
      entries,
      showId,
      playlistTitle,
      playlistDescription,
    );
  }
}
