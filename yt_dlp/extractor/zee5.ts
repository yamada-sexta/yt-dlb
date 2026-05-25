// Source: yt_dlp/extractor/zee5.py

import {
  ExtractorError,
  intOrNone,
  jwtDecodeHs256,
  parseAgeLimit,
  strOrNone,
  tryGet,
  unifiedStrdate,
  unifiedTimestamp,
  urlOrNone,
} from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface Zee5Asset {
  title: string;
  business_type?: string | string[];
  hls_url?: string;
  subtitle_url?: Array<{ url?: string; language?: string }>;
  duration?: unknown;
  description?: unknown;
  original_title?: unknown;
  content_owner?: unknown;
  age_rating?: unknown;
  release_date?: string;
  image_url?: unknown;
  tvshow_name?: unknown;
  orderid?: unknown;
  tags?: unknown;
}

interface Zee5Playback {
  assetDetails: Zee5Asset;
  showDetails?: Record<string, unknown>;
}

export class Zee5IE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`(?:zee5:|https?://(?:www\.)?zee5\.com/(?:[^#?]+/)?(?:(?:tv-shows|kids|web-series|zee5originals)(?:/[^#/?]+){3}|(?:movies|kids|videos|news|music-videos)/(?!kids-shows)[^#/?]+)/(?<display_id>[^#/?]+)/)(?<id>[^#/?]+)/?(?:$|[?#])`;
  static override readonly _NETRC_MACHINE = "zee5";
  static override readonly _GEO_COUNTRIES = ["IN"];
  private readonly deviceId = crypto.randomUUID();
  private userToken: string | null = null;
  private userCountry: string | null = null;

  protected async performLogin(
    username: string,
    password: string | null,
  ): Promise<void> {
    const loginHint =
      'Use "--username <mobile_number>" to login using otp or "--username token" and "--password <user_token>" to login using user token.';
    if (/^\d{10}$/.test(username) && this.userToken === null) {
      const otpRequest = await this.downloadJson<{
        code?: number;
        message?: string;
      }>(
        `https://b2bapi.zee5.com/device/sendotp_v1.php?phoneno=91${username}`,
        username,
        { note: "Sending OTP" },
      );
      if (otpRequest === false || otpRequest.code !== 0) {
        throw new ExtractorError(
          otpRequest === false
            ? "Unable to request OTP"
            : (otpRequest.message ?? "Unable to request OTP"),
          { expected: true },
        );
      }
      const otpCode = this.getTfaInfo("OTP");
      if (!otpCode) {
        throw new ExtractorError(
          "Zee5 OTP login requires the twofactor parameter",
          { expected: true },
        );
      }
      const otpVerify = await this.downloadJson<{
        token?: string;
        message?: string;
      }>(
        `https://b2bapi.zee5.com/device/verifyotp_v1.php?phoneno=91${username}&otp=${encodeURIComponent(otpCode)}&guest_token=${this.deviceId}&platform=web`,
        username,
        { note: "Verifying OTP", fatal: false },
      );
      this.userToken = otpVerify ? (otpVerify.token ?? null) : null;
      if (!this.userToken) {
        throw new ExtractorError(
          otpVerify
            ? (otpVerify.message ?? "Unable to verify OTP")
            : "Unable to verify OTP",
          { expected: true },
        );
      }
    } else if (username.toLowerCase() === "token" && password) {
      jwtDecodeHs256(password);
      this.userToken = password;
    } else {
      throw new ExtractorError(loginHint, { expected: true });
    }

    const token = jwtDecodeHs256(this.userToken);
    if (
      intOrNone(token.exp) !== null &&
      intOrNone(token.exp)! <= Math.trunc(Date.now() / 1000)
    ) {
      throw new ExtractorError("User token has expired", { expected: true });
    }
    this.userCountry = strOrNone(token.current_country);
  }

  protected override async realInitialize(): Promise<void> {
    const [username, password] = await this.getLoginInfo("zee5");
    if (username) {
      await this.performLogin(username, password);
    }
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const videoId = match?.groups?.id;
    const displayId = match?.groups?.display_id;
    if (!videoId) {
      throw new ExtractorError("Invalid Zee5 URL", { expected: true });
    }

    const launch = await this.downloadJson<{
      platform_token?: { token?: string };
    }>("https://launchapi.zee5.com/launch?platform_name=web_app", videoId, {
      note: "Downloading access token",
    });
    const platformToken = launch ? launch.platform_token?.token : null;
    if (!platformToken) {
      throw new ExtractorError("Unable to extract Zee5 platform token", {
        videoId,
      });
    }
    const requestData: Record<string, string> = {
      "x-access-token": platformToken,
    };
    if (this.userToken) {
      requestData.Authorization = `bearer ${this.userToken}`;
    } else {
      requestData["X-Z5-Guest-Token"] = this.deviceId;
    }

    const jsonData = await this.downloadJson<Zee5Playback>(
      "https://spapi.zee5.com/singlePlayback/getDetails/secure",
      videoId,
      {
        query: {
          content_id: videoId,
          device_id: this.deviceId,
          platform_name: "desktop_web",
          country:
            this.userCountry ??
            this.getParam<string | null>("geo_bypass_country", null) ??
            "IN",
          check_parental_control: false,
        },
        headers: { "content-type": "application/json" },
        data: JSON.stringify(requestData),
      },
    );
    if (jsonData === false) {
      throw new ExtractorError("Unable to download Zee5 playback data", {
        videoId,
      });
    }
    const asset = jsonData.assetDetails;
    const businessType = Array.isArray(asset.business_type)
      ? asset.business_type
      : [asset.business_type ?? ""];
    if (
      businessType.includes("premium") ||
      businessType.some((item) => String(item).includes("premium"))
    ) {
      throw new ExtractorError("Premium content is DRM protected.", {
        expected: true,
        videoId,
      });
    }
    if (!asset.hls_url) {
      this.raiseLoginRequired(
        'Use "--username <mobile_number>" to login using otp or "--username token" and "--password <user_token>" to login using user token.',
        { metadataAvailable: true, method: null },
      );
    }
    const [formats, m3u8Subs] = await this.extractM3u8FormatsAndSubtitles(
      asset.hls_url,
      videoId,
      "mp4",
      { fatal: false },
    );

    const subtitles: Record<string, unknown[]> = {};
    for (const sub of asset.subtitle_url ?? []) {
      if (sub.url) {
        subtitles[sub.language ?? "en"] ??= [];
        subtitles[sub.language ?? "en"]!.push({
          url: this.protoRelativeUrl(sub.url) ?? sub.url,
        });
      }
    }
    this.mergeSubtitles(m3u8Subs, subtitles);

    const showData = jsonData.showDetails ?? {};
    const seasons = tryGet(
      showData,
      (value) => (value as { seasons?: unknown }).seasons,
    );
    const firstSeason = Array.isArray(seasons)
      ? (seasons[0] as Record<string, unknown> | undefined)
      : undefined;
    return {
      id: videoId,
      display_id: displayId,
      title: asset.title,
      formats,
      subtitles,
      duration: intOrNone(asset.duration) ?? undefined,
      description: strOrNone(asset.description) ?? undefined,
      alt_title: strOrNone(asset.original_title) ?? undefined,
      uploader: strOrNone(asset.content_owner) ?? undefined,
      age_limit: parseAgeLimit(asset.age_rating),
      release_date: unifiedStrdate(asset.release_date),
      timestamp: unifiedTimestamp(asset.release_date) ?? undefined,
      thumbnail: urlOrNone(asset.image_url) ?? undefined,
      series: strOrNone(asset.tvshow_name) ?? undefined,
      season:
        strOrNone(
          (showData.seasons as Record<string, unknown> | undefined)?.title ??
            firstSeason?.title,
        ) ?? undefined,
      season_number: intOrNone(firstSeason?.orderid) ?? undefined,
      episode_number: intOrNone(asset.orderid) ?? undefined,
      tags: Array.isArray(asset.tags) ? asset.tags : undefined,
    };
  }
}

export class Zee5SeriesIE extends InfoExtractor {
  static override readonly IE_NAME = "zee5:series";
  static override readonly _VALID_URL =
    String.raw`(?:zee5:series:|https?://(?:www\.)?zee5\.com/(?:[^#?]+/)?(?:tv-shows|web-series|kids|zee5originals)/(?!kids-movies)(?:[^#/?]+/){2})(?<id>[^#/?]+)(?:/episodes)?/?(?:$|[?#])`;

  private async entries(showId: string): Promise<ExtractorInfo[]> {
    const launch = await this.downloadJson<{
      platform_token?: { token?: string };
    }>("https://launchapi.zee5.com/launch?platform_name=web_app", showId, {
      note: "Downloading access token",
    });
    const token = launch ? launch.platform_token?.token : null;
    if (!token) {
      throw new ExtractorError("Unable to extract Zee5 platform token", {
        videoId: showId,
      });
    }
    const headers = {
      "X-Access-Token": token,
      Referer: "https://www.zee5.com/",
    };
    const showJson = await this.downloadJson<{
      seasons?: Array<{ id?: string }>;
    }>(
      `https://gwapi.zee5.com/content/tvshow/${showId}?translation=en&country=IN`,
      showId,
      { headers },
    );
    if (showJson === false) {
      throw new ExtractorError("Unable to download Zee5 show metadata", {
        videoId: showId,
      });
    }
    const entries: ExtractorInfo[] = [];
    let pageNum = 0;
    for (const season of showJson.seasons ?? []) {
      let nextUrl: string | null = season.id
        ? `https://gwapi.zee5.com/content/tvshow/?season_id=${season.id}&type=episode&translation=en&country=IN&on_air=false&asset_subtype=tvshow&page=1&limit=100`
        : null;
      while (nextUrl) {
        pageNum += 1;
        const episodesJson = await this.downloadJson<{
          episode?: Array<{ id?: string }>;
          next_episode_api?: string;
        }>(nextUrl, showId, {
          headers,
          note: `Downloading JSON metadata page ${pageNum}`,
        });
        if (episodesJson === false) {
          break;
        }
        for (const episode of episodesJson.episode ?? []) {
          if (episode.id) {
            entries.push(
              this.urlResult(`zee5:${episode.id}`, Zee5IE, episode.id),
            );
          }
        }
        nextUrl = urlOrNone(episodesJson.next_episode_api);
      }
    }
    return entries;
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const showId = this.matchId(url);
    return this.playlistResult(await this.entries(showId), showId);
  }
}
