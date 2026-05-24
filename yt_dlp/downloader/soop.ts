// Source: yt_dlp/downloader/soop.py
// Port note: the AfreecaTV helper is inlined until the extractor layer is migrated.

import { FileDownloader, type DownloadInfo, type DownloaderHost } from "./common.ts";
import { HlsFD } from "./hls.ts";

interface SoopRefreshParams {
  m3u8_url: string;
  strm_id: string;
  video_id: string;
  _last_refresh?: number;
}

interface CookieLike {
  name: string;
  expires: number | null;
}

interface CookieAwareHost extends DownloaderHost {
  cookies?: {
    getCookiesForUrl(url: string): CookieLike[];
  };
}

export class SoopVodFD extends FileDownloader {
  override async realDownload(filename: string, info: DownloadInfo): Promise<boolean> {
    this.toScreen(`[${this.fdName}] Downloading Soop subscription VOD HLS`);
    const refreshParams = parseRefreshParams(info._cookie_refresh_params);
    const refererUrl = typeof info.webpage_url === "string" ? info.webpage_url : info.url;
    const controller = new AbortController();
    const refreshTask = this.cookieRefreshLoop(controller.signal, refreshParams, refererUrl);
    try {
      return await new HlsFD(this.ydl, this.params).realDownload(filename, info);
    } finally {
      controller.abort();
      await refreshTask.catch(() => undefined);
    }
  }

  private async cookieRefreshLoop(signal: AbortSignal, params: SoopRefreshParams, refererUrl: string): Promise<void> {
    while (!signal.aborted) {
      await sleep(5_000, signal);
      if (signal.aborted) {
        break;
      }
      const currentTime = Date.now() / 1000;
      const expirationTime = this.cloudfrontCookieExpiration(params.m3u8_url);
      const lastRefreshCheck = params._last_refresh ?? 0;
      const shouldRefresh = (
        (expirationTime !== 0 && currentTime >= expirationTime - 15)
        || (expirationTime === 0 && currentTime - lastRefreshCheck >= 75)
      );
      if (!shouldRefresh) {
        continue;
      }
      try {
        await this.ydl.urlopen(cloudfrontAuthRequest(params, refererUrl));
        params._last_refresh = currentTime;
      } catch (error) {
        this.toScreen(`[${this.fdName}] Cookie refresh attempt failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private cloudfrontCookieExpiration(m3u8Url: string): number {
    const ydl = this.ydl as CookieAwareHost;
    const cookies = ydl.cookies?.getCookiesForUrl(m3u8Url) ?? [];
    const expirations = cookies
      .filter((cookie) => cookie.name.includes("CloudFront") && cookie.expires !== null)
      .map((cookie) => cookie.expires as number);
    return expirations.length ? Math.min(...expirations) : 0;
  }
}

function parseRefreshParams(value: unknown): SoopRefreshParams {
  if (!value || typeof value !== "object") {
    throw new Error("Soop cookie refresh params are missing");
  }
  const data = value as Record<string, unknown>;
  if (typeof data.m3u8_url !== "string" || typeof data.strm_id !== "string" || typeof data.video_id !== "string") {
    throw new Error("Soop cookie refresh params are invalid");
  }
  return {
    m3u8_url: data.m3u8_url,
    strm_id: data.strm_id,
    video_id: data.video_id,
    _last_refresh: typeof data._last_refresh === "number" ? data._last_refresh : undefined,
  };
}

function cloudfrontAuthRequest(params: SoopRefreshParams, refererUrl: string): Request {
  const body = new URLSearchParams({
    type: "vod",
    strm_id: params.strm_id,
    title_no: params.video_id,
    url: params.m3u8_url,
  });
  return new Request("https://live.sooplive.com/api/private_auth.php", {
    method: "POST",
    headers: {
      Referer: refererUrl,
      Origin: "https://vod.sooplive.com",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
}

async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}
