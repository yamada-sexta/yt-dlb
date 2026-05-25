// Source: yt_dlp/extractor/zoom.py

import {
  ExtractorError,
  intOrNone,
  jsToJson,
  parseFilesize,
  parseQs,
  parseResolution,
  strOrNone,
  updateUrlQuery,
  urlBasename,
  urlencodePostdata,
  urljoin,
} from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface ZoomPageData {
  meetingId?: string;
  fileId?: string;
}

interface ZoomPlayInfo {
  transcriptUrl?: string;
  ccUrl?: string;
  chapterUrl?: string;
  viewMp4Url?: string;
  shareMp4Url?: string;
  viewMp4WithshareUrl?: string;
  viewResolvtions?: unknown[];
  shareResolvtions?: unknown[];
  recording?: { fileSizeInMB?: unknown };
  meet?: { topic?: unknown };
  duration?: unknown;
}

export class ZoomIE extends InfoExtractor {
  static override readonly IE_NAME = "zoom";
  static override readonly _VALID_URL = String.raw`(?<base_url>https?://(?:[^.]+\.)?zoom\.us/)rec(?:ording)?/(?<type>play|share)/(?<id>[\w.-]+)`;

  private getPageData(webpage: string, videoId: string): ZoomPageData {
    const json = extractAssignedJson(webpage, "window.__data__");
    if (!json) {
      throw new ExtractorError("Unable to extract data", { videoId });
    }
    return JSON.parse(jsToJson(json)) as ZoomPageData;
  }

  private async getRealWebpage(url: string, baseUrl: string, videoId: string, urlType: string): Promise<string> {
    const webpage = await this.downloadWebpage(url, videoId, { note: `Downloading ${urlType} webpage` });
    if (webpage === false) {
      throw new ExtractorError(`Unable to download ${urlType} webpage`, { videoId });
    }
    let form: Record<string, string>;
    try {
      form = this.formHiddenInputs("password_form", webpage);
    } catch {
      return webpage;
    }

    const password = this.getParam<string | null>("videopassword", null);
    if (!password) {
      throw new ExtractorError("This video is protected by a passcode, use the --video-password option", { expected: true, videoId });
    }
    const isMeeting = form.useWhichPasswd === "meeting";
    const validation = await this.downloadJson<{ status?: boolean; errorMessage?: string }>(
      `${baseUrl}rec/validate${isMeeting ? "_meet" : ""}_passwd`,
      videoId,
      {
        note: "Validating passcode",
        errnote: "Wrong passcode",
        data: urlencodePostdata({
          id: form[`${isMeeting ? "meet" : "file"}Id`],
          passwd: password,
          action: form.action,
        }),
      },
    );
    if (validation === false || !validation.status) {
      throw new ExtractorError(validation === false ? "Wrong passcode" : validation.errorMessage ?? "Wrong passcode", { expected: true, videoId });
    }
    const redownloaded = await this.downloadWebpage(url, videoId, { note: `Re-downloading ${urlType} webpage` });
    if (redownloaded === false) {
      throw new ExtractorError(`Unable to download ${urlType} webpage`, { videoId });
    }
    return redownloaded;
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const baseUrl = match?.groups?.base_url;
    const urlType = match?.groups?.type;
    const videoId = match?.groups?.id;
    if (!baseUrl || !urlType || !videoId) {
      throw new ExtractorError("Invalid Zoom URL", { expected: true });
    }

    const startTime = parseQs(url).startTime?.at(-1);
    const startParams: Record<string, string> = startTime ? { startTime } : {};
    const query: Record<string, string | readonly string[]> = {};
    if (urlType === "share") {
      const webpage = await this.getRealWebpage(url, baseUrl, videoId, "share");
      const meetingId = this.getPageData(webpage, videoId).meetingId;
      if (!meetingId) {
        throw new ExtractorError("Unable to extract meeting ID", { videoId });
      }
      const shareInfo = await this.downloadJson<{ result?: { redirectUrl?: string } }>(
        `${baseUrl}nws/recording/1.0/play/share-info/${meetingId}`,
        videoId,
        { note: "Downloading share info JSON" },
      );
      const redirectPath = shareInfo ? shareInfo.result?.redirectUrl : null;
      if (!redirectPath) {
        throw new ExtractorError("Unable to extract redirect URL", { videoId });
      }
      url = updateUrlQuery(urljoin(baseUrl, redirectPath) ?? redirectPath, startParams);
      query.continueMode = "true";
    }

    const webpage = await this.getRealWebpage(url, baseUrl, videoId, "play");
    const fileId = this.getPageData(webpage, videoId).fileId;
    if (!fileId) {
      throw new ExtractorError("Unable to extract file ID", { videoId });
    }

    Object.assign(query, startParams);
    const info = await this.downloadJson<{ result?: ZoomPlayInfo }>(
      `${baseUrl}nws/recording/1.0/play/info/${fileId}`,
      videoId,
      { query, note: "Downloading play info JSON" },
    );
    const data = info ? info.result ?? {} : {};

    const subtitles: Record<string, Array<Record<string, unknown>>> = {};
    for (const type of ["transcript", "cc", "chapter"] as const) {
      const subUrl = data[`${type}Url`];
      if (subUrl) {
        subtitles[type] = [{ url: urljoin(baseUrl, subUrl) ?? subUrl, ext: "vtt" }];
      }
    }

    const formats: Array<Record<string, unknown>> = [];
    if (data.viewMp4Url) {
      formats.push({
        format_note: "Camera stream",
        url: data.viewMp4Url,
        width: intOrNone(data.viewResolvtions?.[0]) ?? undefined,
        height: intOrNone(data.viewResolvtions?.[1]) ?? undefined,
        format_id: "view",
        ext: "mp4",
        filesize_approx: parseFilesize(strOrNone(data.recording?.fileSizeInMB)) ?? undefined,
        preference: 0,
      });
    }
    if (data.shareMp4Url) {
      formats.push({
        format_note: "Screen share stream",
        url: data.shareMp4Url,
        width: intOrNone(data.shareResolvtions?.[0]) ?? undefined,
        height: intOrNone(data.shareResolvtions?.[1]) ?? undefined,
        format_id: "share",
        ext: "mp4",
        preference: -1,
      });
    }
    if (data.viewMp4WithshareUrl) {
      formats.push({
        ...parseResolution(this.searchRegex(/_(\d+x\d+)\.mp4/, urlBasename(data.viewMp4WithshareUrl), "resolution", { defaultValue: null }) as string | null),
        format_note: "Screen share with camera",
        url: data.viewMp4WithshareUrl,
        format_id: "view_with_share",
        ext: "mp4",
        preference: 1,
      });
    }

    return {
      id: videoId,
      title: strOrNone(data.meet?.topic) ?? undefined,
      duration: intOrNone(data.duration) ?? undefined,
      subtitles,
      formats,
      http_headers: { Referer: baseUrl },
    };
  }
}

function extractAssignedJson(webpage: string, variableName: string): string | null {
  const index = webpage.search(new RegExp(`${variableName.replaceAll(".", String.raw`\.`)}\\s*=`));
  if (index < 0) {
    return null;
  }
  const open = webpage.indexOf("{", index);
  if (open < 0) {
    return null;
  }
  const close = findMatchingBracket(webpage, open);
  return close < 0 ? null : webpage.slice(open, close + 1);
}

function findMatchingBracket(source: string, openIndex: number): number {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index]!;
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}
