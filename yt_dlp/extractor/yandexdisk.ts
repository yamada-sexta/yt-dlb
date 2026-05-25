// Source: yt_dlp/extractor/yandexdisk.py

import { Cookie } from "../cookies.ts";
import {
  determineExt,
  floatOrNone,
  intOrNone,
  joinNonempty,
  mimetype2ext,
  tryGet,
  urljoin,
} from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export class YandexDiskIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`(?x)https?://(?<domain>yadi\.sk|disk\.(?:360\.)?yandex\.(?:az|by|co(?:m(?:\.(?:am|ge|tr))?|\.il)|ee|fr|k[gz]|l[tv]|md|t[jm]|u[az]|ru))/(?:[di]/|public.*?\bhash=)(?<id>[^/?#&]+)`.replace(
      /\(\?x\)|\s+#.*|\s+/g,
      "",
    );

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const domain = match?.groups?.domain;
    let videoId = match?.groups?.id;
    if (!domain || !videoId) {
      throw new Error("Unable to extract Yandex Disk id");
    }

    const webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new Error("Unable to download Yandex Disk webpage");
    }
    const storeJson = this.searchRegex(
      String.raw`<script[^>]+id=["']store-prefetch["'][^>]*>\s*(\{.+?\})\s*</script>`,
      webpage,
      "store",
    );
    const store =
      typeof storeJson === "string"
        ? (this.parseJson<Record<string, unknown>>(storeJson, videoId) ?? {})
        : {};
    const rootResourceId = String(store.rootResourceId ?? "");
    const resource = record(record(store.resources)[rootResourceId]);
    const title = String(resource.name ?? videoId);
    const meta = record(resource.meta);

    if (typeof meta.short_url === "string") {
      videoId = this.matchId(meta.short_url);
    }

    const sourceResp = (await this.downloadJson<{ href?: string }>(
      "https://cloud-api.yandex.net/v1/disk/public/resources/download",
      videoId,
      { query: { public_key: url }, fatal: false },
    )) as { href?: string } | false | null;
    let sourceUrl = sourceResp ? sourceResp.href : undefined;
    let videoStreams = record(resource.videoStreams);
    const environment = record(store.environment);
    const sk = typeof environment.sk === "string" ? environment.sk : null;
    const yandexuid =
      typeof environment.yandexuid === "string" ? environment.yandexuid : null;
    if (sk && yandexuid && (!sourceUrl || !Object.keys(videoStreams).length)) {
      const cookieJar = this.downloader?.cookies as
        | { setCookie?: (cookie: Cookie) => void }
        | undefined;
      cookieJar?.setCookie?.(
        new Cookie({ name: "yandexuid", value: yandexuid, domain }),
      );
      const apiBase = urljoin(url, "/public/api/");
      const callApi = async (
        action: string,
      ): Promise<Record<string, unknown>> => {
        if (!apiBase) {
          return {};
        }
        const response = (await this.downloadJson<{
          data?: Record<string, unknown>;
        }>(`${apiBase}${action}`, videoId, {
          data: JSON.stringify({ hash: resource.hash ?? url, sk }),
          headers: { "Content-Type": "text/plain" },
          fatal: false,
        })) as { data?: Record<string, unknown> } | false | null;
        return response ? record(response.data) : {};
      };
      if (!sourceUrl) {
        const downloadUrlData = await callApi("download-url");
        sourceUrl =
          typeof downloadUrlData.url === "string"
            ? downloadUrlData.url
            : undefined;
      }
      if (!Object.keys(videoStreams).length) {
        videoStreams = await callApi("get-video-streams");
      }
    }

    const formats: Array<Record<string, unknown>> = [];
    if (sourceUrl) {
      formats.push({
        url: sourceUrl,
        format_id: "source",
        ext: determineExt(
          title,
          String(
            meta.ext ??
              mimetype2ext(
                typeof meta.mime_type === "string" ? meta.mime_type : null,
              ) ??
              "mp4",
          ),
        ),
        quality: 1,
        filesize: intOrNone(meta.size),
      });
    }
    const videos = Array.isArray(videoStreams.videos)
      ? videoStreams.videos
      : [];
    for (const item of videos) {
      const video = record(item);
      const formatUrl = typeof video.url === "string" ? video.url : null;
      if (!formatUrl) {
        continue;
      }
      if (video.dimension === "adaptive") {
        formats.push(
          ...this.extractM3u8Formats(formatUrl, videoId, "mp4", {
            entryProtocol: "m3u8_native",
            m3u8Id: "hls",
          }),
        );
      } else {
        const size = record(video.size);
        const height = intOrNone(size.height);
        formats.push({
          ext: "mp4",
          format_id: joinNonempty("hls", height ? `${height}p` : null),
          height,
          protocol: "m3u8_native",
          url: formatUrl,
          width: intOrNone(size.width),
        });
      }
    }

    const uid = typeof resource.uid === "string" ? resource.uid : undefined;
    const displayName = uid
      ? tryGet(
          store,
          (value) => record(record(record(value).users)[uid]).displayName,
          (value): value is string => typeof value === "string",
        )
      : null;
    return {
      id: videoId,
      title,
      duration: floatOrNone(videoStreams.duration, 1000) ?? undefined,
      uploader: displayName ?? undefined,
      uploader_id: uid,
      view_count: intOrNone(meta.views_counter) ?? undefined,
      formats,
    };
  }
}
