// Source: yt_dlp/extractor/youtube/_video.py
// Port note: this is a focused Bun extractor for YouTube watch URLs. It covers webpage player
// responses and progressive HTTP formats; DASH/HLS merging remains a later downloader-layer port.

import { DownloadError, type YoutubeDL } from "../../YoutubeDL.ts";
import { intOrNone } from "../../utils/index.ts";
import type { ExtractorInfo } from "../common.ts";
import { z } from "zod";
import {
  initializeJscDirector,
  JsChallengeType,
  type JsChallengeRequest,
  type NChallengeOutput,
  type SigChallengeOutput,
} from "./jsc/index.ts";
import { YoutubeBaseInfoExtractor } from "./base.ts";
import {
  cleanPot,
  initializePotDirector,
  PoTokenContext as ProviderPoTokenContext,
} from "./pot/index.ts";

export class YoutubeIE extends YoutubeBaseInfoExtractor {
  static override readonly _VALID_URL = [
    String.raw`^(?:(?:https?:)?//(?:(?:(?:\w+\.)?[yY][oO][uU][tT][uU][bB][eE](?:-nocookie|kids)?\.com|(?:www\.)?deturl\.com/www\.youtube\.com|(?:www\.)?pwnyoutube\.com|(?:www\.)?hooktube\.com|(?:www\.)?yourepeat\.com|tube\.majestyc\.net|youtube\.googleapis\.com)/(?:.*?#/)?(?:(?:v|embed|e|shorts|live)/(?!videoseries|live_stream)|(?:(?:watch|movie)(?:_popup)?(?:\.php)?/?)?(?:\?|#!?)(?:.*?[&;])?v=)|(?:(?:youtu\.be|vid\.plus|zwearz\.com/watch)/)|(?:(?:www\.)?cleanvideosearch\.com/media/action/yt/watch\?videoId=)))(?<id>[0-9A-Za-z_-]{11})(?:[^\s]*)?(?:#|$)`,
    String.raw`^(?<id>[0-9A-Za-z_-]{11})(?:#|$)`,
  ] as const;

  static override suitable(url: string): boolean {
    if (hasQueryValue(url, "list")) {
      return false;
    }
    return YoutubeBaseInfoExtractor.suitable.call(this, url);
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    if (!isYoutubeDL(this.downloader)) {
      throw new DownloadError("YoutubeIE requires a YoutubeDL downloader host");
    }
    return { ...(await extractYoutubeVideo(url, this.downloader)) };
  }

  static getCheckOkParams(): Record<string, true> {
    return { contentCheckOk: true, racyCheckOk: true };
  }

  static _get_checkok_params(): Record<string, true> {
    return YoutubeIE.getCheckOkParams();
  }

  static generatePlayerContext(
    sts: number | null = null,
    useAdPlaybackContext = false,
    encryptedContext: string | null = null,
  ): Record<string, unknown> {
    const contentPlaybackContext: Record<string, unknown> = {
      html5Preference: "HTML5_PREF_WANTS",
    };
    if (sts !== null) {
      contentPlaybackContext.signatureTimestamp = sts;
    }
    if (encryptedContext) {
      contentPlaybackContext.encryptedHostFlags = encryptedContext;
    }
    const playbackContext: Record<string, unknown> = { contentPlaybackContext };
    if (useAdPlaybackContext) {
      playbackContext.adPlaybackContext = { pyv: true };
    }
    return {
      playbackContext,
      ...YoutubeIE.getCheckOkParams(),
    };
  }

  static _generate_player_context(
    sts: number | null = null,
    useAdPlaybackContext = false,
    encryptedContext: string | null = null,
  ): Record<string, unknown> {
    return YoutubeIE.generatePlayerContext(
      sts,
      useAdPlaybackContext,
      encryptedContext,
    );
  }

  protected async extractSignatureTimestamp(
    videoId: string,
    playerUrl: string | null,
    ytcfg: unknown = null,
    fatal = false,
  ): Promise<number | null> {
    const configuredSts = intOrNone(
      z
        .object({ STS: z.union([z.string(), z.number()]).optional() })
        .passthrough()
        .safeParse(ytcfg).success
        ? (ytcfg as { STS?: string | number }).STS
        : null,
    );
    if (configuredSts) {
      return configuredSts;
    }
    if (!playerUrl) {
      const message = "Cannot extract signature timestamp without player url";
      if (fatal) {
        throw new DownloadError(message);
      }
      this.reportWarning(message, videoId, true);
      return null;
    }
    const cached = stsCache.get(playerUrl);
    if (cached) {
      return cached;
    }
    if (!isYoutubeDL(this.downloader)) {
      throw new DownloadError("YoutubeIE requires a YoutubeDL downloader host");
    }
    const player = await loadPlayer(playerUrl, this.downloader);
    const sts = intOrNone(
      /(?:signatureTimestamp|sts)\s*:\s*(?<sts>[0-9]{5})/.exec(player)?.groups
        ?.sts,
    );
    if (!sts && fatal) {
      throw new DownloadError(
        "Could not extract JS player signature timestamp",
      );
    }
    if (sts) {
      stsCache.set(playerUrl, sts);
    }
    return sts;
  }

  protected _extract_signature_timestamp(
    videoId: string,
    playerUrl: string | null,
    ytcfg: unknown = null,
    fatal = false,
  ): Promise<number | null> {
    return this.extractSignatureTimestamp(videoId, playerUrl, ytcfg, fatal);
  }

  protected getConfigPoToken(
    client: string,
    context: ProviderPoTokenContext,
  ): string | null {
    for (const tokenStr of this.youtubeConfigurationArg("po_token", [])) {
      if (!tokenStr) {
        continue;
      }
      const [metadata, poToken = ""] = tokenStr.split("+", 2);
      if (!metadata) {
        this.reportWarning(
          "Invalid po_token configuration format.",
          null,
          true,
        );
        continue;
      }
      const [tokenClient, tokenContext = ProviderPoTokenContext.GVS] =
        metadata.split(".", 2);
      if (
        tokenClient?.toLowerCase() !== client.toLowerCase() ||
        tokenContext.toLowerCase() !== context
      ) {
        continue;
      }
      try {
        return cleanPot(poToken);
      } catch {
        this.reportWarning(
          `Invalid po_token configuration for ${client} client: ${tokenContext} PO Token should be a base64url-encoded string.`,
          null,
          true,
        );
      }
    }
    return null;
  }

  protected _get_config_po_token(
    client: string,
    context: ProviderPoTokenContext,
  ): string | null {
    return this.getConfigPoToken(client, context);
  }

  protected async fetchPoToken(
    client = "web",
    context: ProviderPoTokenContext = ProviderPoTokenContext.GVS,
    options: {
      ytcfg?: unknown;
      visitorData?: string | null;
      dataSyncId?: string | null;
      videoId?: string | null;
      playerUrl?: string | null;
      videoWebpage?: string | null;
      required?: boolean;
      bypassCache?: boolean;
    } = {},
  ): Promise<string | null> {
    const configPoToken = this.getConfigPoToken(client, context);
    if (configPoToken) {
      this.writeDebug(
        `${options.videoId ?? "unknown"}: Retrieved a ${context} PO Token for ${client} client from config`,
      );
      return configPoToken;
    }
    const fetchPolicy = this.youtubeConfigurationArg("fetch_pot", [""])[0];
    const policy =
      fetchPolicy === "never" ||
      fetchPolicy === "always" ||
      fetchPolicy === "auto"
        ? fetchPolicy
        : "auto";
    if (policy === "never" || (policy === "auto" && !options.required)) {
      return null;
    }
    if (!isYoutubeDL(this.downloader)) {
      throw new DownloadError("YoutubeIE requires a YoutubeDL downloader host");
    }
    const visitorData =
      options.visitorData ?? this.extractVisitorData(options.ytcfg);
    const dataSyncId =
      options.dataSyncId ?? this.extractDataSyncId(options.ytcfg);
    if (
      context === ProviderPoTokenContext.GVS &&
      !this.isAuthenticated &&
      !visitorData
    ) {
      this.reportWarning(
        `Unable to fetch GVS PO Token for ${client} client: Missing required Visitor Data.`,
        options.videoId ?? null,
        true,
      );
      return null;
    }
    if (context === ProviderPoTokenContext.PLAYER && !options.videoId) {
      this.reportWarning(
        `Unable to fetch Player PO Token for ${client} client: Missing required Video ID`,
        null,
        true,
      );
      return null;
    }
    return await getPotDirector(this.downloader).getPoToken({
      context,
      innertubeContext: this.extractContext(options.ytcfg, client),
      innertubeHost: this.getInnertubeHost(client),
      playerUrl: options.playerUrl ?? undefined,
      isAuthenticated: this.isAuthenticated,
      videoWebpage: options.videoWebpage ?? undefined,
      internalClientName: client,
      visitorData: visitorData ?? undefined,
      dataSyncId: dataSyncId ?? undefined,
      videoId: options.videoId ?? undefined,
      gvsBindToVideoId: Boolean(options.videoId),
      bypassCache: options.bypassCache,
    });
  }

  protected fetch_po_token(
    client = "web",
    context: ProviderPoTokenContext = ProviderPoTokenContext.GVS,
    options: Parameters<YoutubeIE["fetchPoToken"]>[2] = {},
  ): Promise<string | null> {
    return this.fetchPoToken(client, context, options);
  }
}

export interface YoutubeVideoInfo {
  id: string;
  url: string;
  title: string;
  ext: string;
  webpage_url: string;
  filename: string;
  format_id?: string;
  height?: number;
  width?: number;
  mime_type?: string;
}

interface YoutubePlayerResponse {
  playabilityStatus?: {
    status?: string;
    reason?: string;
  };
  videoDetails?: {
    videoId?: string;
    title?: string;
    lengthSeconds?: string;
  };
  streamingData?: {
    formats?: YoutubeFormat[];
    adaptiveFormats?: YoutubeFormat[];
  };
}

interface YoutubeFormat {
  itag?: number;
  url?: string;
  signatureCipher?: string;
  cipher?: string;
  mimeType?: string;
  bitrate?: number;
  width?: number;
  height?: number;
  quality?: string;
  qualityLabel?: string;
  audioQuality?: string;
  contentLength?: string;
}

const YoutubeFormatSchema = z
  .object({
    itag: z.number().optional(),
    url: z.string().optional(),
    signatureCipher: z.string().optional(),
    cipher: z.string().optional(),
    mimeType: z.string().optional(),
    bitrate: z.number().optional(),
    width: z.number().optional(),
    height: z.number().optional(),
    quality: z.string().optional(),
    qualityLabel: z.string().optional(),
    audioQuality: z.string().optional(),
    contentLength: z.string().optional(),
  })
  .passthrough();

const YoutubePlayerResponseSchema = z
  .object({
    playabilityStatus: z
      .object({
        status: z.string().optional(),
        reason: z.string().optional(),
      })
      .passthrough()
      .optional(),
    videoDetails: z
      .object({
        videoId: z.string().optional(),
        title: z.string().optional(),
        lengthSeconds: z.string().optional(),
      })
      .passthrough()
      .optional(),
    streamingData: z
      .object({
        formats: z.array(YoutubeFormatSchema).optional(),
        adaptiveFormats: z.array(YoutubeFormatSchema).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

function isYoutubeDL(value: unknown): value is YoutubeDL {
  const candidate = value as Partial<YoutubeDL> | null;
  return Boolean(
    candidate &&
      typeof candidate.urlopen === "function" &&
      typeof candidate.prepareFilename === "function",
  );
}

export function isYoutubeWatchUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
      ].includes(parsed.hostname) &&
      parsed.pathname === "/watch" &&
      Boolean(parsed.searchParams.get("v"))
    );
  } catch {
    return false;
  }
}

export async function extractYoutubeVideo(
  url: string,
  ydl: YoutubeDL,
): Promise<YoutubeVideoInfo> {
  const videoId = extractVideoId(url);
  const webpageUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  const response = await ydl.urlopen(
    new Request(webpageUrl, {
      headers: {
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": defaultUserAgent(),
      },
    }),
  );
  const webpage = await response.text();
  const playerResponse = extractInitialPlayerResponse(webpage);
  const status = playerResponse.playabilityStatus?.status;
  if (status && status !== "OK") {
    throw new DownloadError(
      playerResponse.playabilityStatus?.reason ??
        `YouTube returned playability status ${status}`,
    );
  }

  const playerUrl = extractPlayerUrl(webpage);
  const formats = [
    ...(playerResponse.streamingData?.formats ?? []),
    ...(playerResponse.streamingData?.adaptiveFormats ?? []),
  ];
  const resolved = await Promise.all(
    formats.map((format) => resolveFormat(format, playerUrl, ydl)),
  );
  const playable = resolved.filter(
    (format): format is ResolvedYoutubeFormat => format !== null,
  );
  const selected = selectFormat(playable);
  if (!selected) {
    throw new DownloadError("No playable YouTube HTTP formats found");
  }

  const title = playerResponse.videoDetails?.title ?? videoId;
  const ext =
    extensionFromMime(selected.mimeType) ??
    extensionFromUrl(selected.url) ??
    "mp4";
  return {
    id: videoId,
    url: selected.url,
    title,
    ext,
    webpage_url: webpageUrl,
    filename: ydl.prepareFilename({ title, id: videoId, ext }),
    format_id: selected.itag == null ? undefined : String(selected.itag),
    height: selected.height,
    width: selected.width,
    mime_type: selected.mimeType,
  };
}

interface ResolvedYoutubeFormat extends YoutubeFormat {
  url: string;
}

async function resolveFormat(
  format: YoutubeFormat,
  playerUrl: string | null,
  ydl: YoutubeDL,
): Promise<ResolvedYoutubeFormat | null> {
  let fmtUrl = format.url;
  if (format.url) {
    fmtUrl = format.url;
  } else {
    const cipher = format.signatureCipher ?? format.cipher;
    if (!cipher) {
      return null;
    }
    const params = new URLSearchParams(cipher);
    fmtUrl = params.get("url") ?? undefined;
    const encryptedSignature = params.get("s");
    if (!fmtUrl) {
      return null;
    }
    const parsed = new URL(fmtUrl);
    if (encryptedSignature) {
      if (!playerUrl) {
        throw new DownloadError(
          "YouTube format is signature-ciphered but player JS URL was not found",
        );
      }
      const signature = await decipherSignature(
        encryptedSignature,
        playerUrl,
        ydl,
      );
      parsed.searchParams.set(params.get("sp") ?? "signature", signature);
    }
    fmtUrl = parsed.toString();
  }
  const parsed = new URL(fmtUrl);
  const nChallenge = parsed.searchParams.get("n");
  if (nChallenge) {
    if (!playerUrl) {
      throw new DownloadError(
        "YouTube format has an n challenge but player JS URL was not found",
      );
    }
    parsed.searchParams.set(
      "n",
      await solveNChallenge(nChallenge, playerUrl, ydl),
    );
  }
  return { ...format, url: parsed.toString() };
}

const signatureCache = new Map<string, string>();
const nCache = new Map<string, string>();
const playerCache = new Map<string, string>();
const stsCache = new Map<string, number>();
const jscDirectorCache = new WeakMap<
  YoutubeDL,
  ReturnType<typeof initializeJscDirector>
>();
const potDirectorCache = new WeakMap<
  YoutubeDL,
  ReturnType<typeof initializePotDirector>
>();

async function decipherSignature(
  signature: string,
  playerUrl: string,
  ydl: YoutubeDL,
): Promise<string> {
  const cacheKey = `${playerUrl}\n${signature}`;
  const cached = signatureCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const request = {
    type: JsChallengeType.SIG,
    input: { playerUrl, challenges: [signature] },
  } satisfies JsChallengeRequest;
  const response = (await getJscDirector(ydl).bulkSolve([request]))[0]?.[1];
  if (!response || response.type !== JsChallengeType.SIG) {
    throw new DownloadError(
      "YouTube signature challenge solver did not return a result",
    );
  }
  const solved = (response.output as SigChallengeOutput).results[signature];
  if (!solved) {
    throw new DownloadError(
      "YouTube signature challenge solver did not return a signature",
    );
  }
  signatureCache.set(cacheKey, solved);
  return solved;
}

async function solveNChallenge(
  challenge: string,
  playerUrl: string,
  ydl: YoutubeDL,
): Promise<string> {
  const cacheKey = `${playerUrl}\n${challenge}`;
  const cached = nCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  const request = {
    type: JsChallengeType.N,
    input: { playerUrl, challenges: [challenge] },
  } satisfies JsChallengeRequest;
  const response = (await getJscDirector(ydl).bulkSolve([request]))[0]?.[1];
  if (!response || response.type !== JsChallengeType.N) {
    throw new DownloadError(
      "YouTube n challenge solver did not return a result",
    );
  }
  const solved = (response.output as NChallengeOutput).results[challenge];
  if (!solved) {
    throw new DownloadError(
      "YouTube n challenge solver did not return a result",
    );
  }
  ydl.writeDebug(`Solved YouTube n challenge ${challenge} -> ${solved}`);
  nCache.set(cacheKey, solved);
  return solved;
}

async function loadPlayer(playerUrl: string, ydl: YoutubeDL): Promise<string> {
  const cached = playerCache.get(playerUrl);
  if (cached) {
    return cached;
  }
  const player = await (await ydl.urlopen(playerUrl)).text();
  playerCache.set(playerUrl, player);
  return player;
}

function getJscDirector(
  ydl: YoutubeDL,
): ReturnType<typeof initializeJscDirector> {
  const cached = jscDirectorCache.get(ydl);
  if (cached) {
    return cached;
  }
  const director = initializeJscDirector({
    cache: ydl.cache,
    remoteComponents: ydl.params.remote_components,
    loadPlayer: async (_videoId, playerUrl) => await loadPlayer(playerUrl, ydl),
    downloadText: async (url) => await (await ydl.urlopen(url)).text(),
    reportWarning: (message) => ydl.reportWarning(message),
    writeDebug: (message) => ydl.writeDebug(message),
  });
  jscDirectorCache.set(ydl, director);
  return director;
}

function getPotDirector(
  ydl: YoutubeDL,
): ReturnType<typeof initializePotDirector> {
  const cached = potDirectorCache.get(ydl);
  if (cached) {
    return cached;
  }
  const director = initializePotDirector({
    params: {
      verbose: ydl.params.verbose,
      extractor_args: normalizeExtractorArgs(ydl.params.extractor_args),
    },
    request: async (request) => await ydl.urlopen(request),
    reportWarning: (message) => ydl.reportWarning(message),
    reportError: (message) => ydl.reportError(message),
    writeDebug: (message) => ydl.writeDebug(message),
    toScreen: (message) => ydl.toScreen(message),
  });
  potDirectorCache.set(ydl, director);
  return director;
}

function normalizeExtractorArgs(
  args: YoutubeDL["params"]["extractor_args"],
): Record<string, readonly string[] | undefined> {
  return args ? { ...args } : {};
}

function selectFormat(
  formats: readonly ResolvedYoutubeFormat[],
): ResolvedYoutubeFormat | null {
  const progressive = formats.filter((format) => {
    const mime = format.mimeType ?? "";
    return (
      mime.includes("video/") &&
      !mime.includes("audio/mp4") &&
      Boolean(format.audioQuality)
    );
  });
  const candidates = progressive.length
    ? progressive
    : formats.filter((format) => (format.mimeType ?? "").includes("video/"));
  return (
    candidates.sort(
      (left, right) => formatScore(right) - formatScore(left),
    )[0] ?? null
  );
}

function formatScore(format: YoutubeFormat): number {
  return (format.height ?? 0) * 10_000_000 + (format.bitrate ?? 0);
}

function extractInitialPlayerResponse(webpage: string): YoutubePlayerResponse {
  const marker = "ytInitialPlayerResponse";
  const markerIndex = webpage.indexOf(marker);
  if (markerIndex === -1) {
    throw new DownloadError(
      "Could not find ytInitialPlayerResponse in YouTube webpage",
    );
  }
  const braceIndex = webpage.indexOf("{", markerIndex);
  if (braceIndex === -1) {
    throw new DownloadError("Could not parse ytInitialPlayerResponse");
  }
  return YoutubePlayerResponseSchema.parse(
    JSON.parse(readBalanced(webpage, braceIndex)),
  );
}

function extractPlayerUrl(webpage: string): string | null {
  const match =
    /"jsUrl"\s*:\s*"(?<url>[^"]+)"/.exec(webpage) ??
    /"PLAYER_JS_URL"\s*:\s*"(?<url>[^"]+)"/.exec(webpage) ??
    /<script\s+[^>]*src="(?<url>\/s\/player\/[^"]+\/base\.js)"/.exec(webpage);
  const raw = match?.groups?.url;
  return raw
    ? new URL(raw.replaceAll("\\/", "/"), "https://www.youtube.com").toString()
    : null;
}

function extractVideoId(url: string): string {
  const videoId = YoutubeIE.matchValidUrl(url)?.groups?.id;
  if (!videoId) {
    throw new DownloadError("Unable to extract YouTube video ID");
  }
  return videoId;
}

function hasQueryValue(url: string, key: string): boolean {
  try {
    return Boolean(new URL(url).searchParams.get(key));
  } catch {
    return false;
  }
}

function readBalanced(source: string, startIndex: number): string {
  const open = source[startIndex];
  const close = open === "{" ? "}" : open === "[" ? "]" : null;
  if (!close) {
    throw new DownloadError("Expected balanced JSON/object source");
  }
  let depth = 0;
  let quote: string | null = null;
  let escaping = false;
  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index]!;
    if (quote) {
      escaping = !escaping && char === "\\";
      if (!escaping && char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }
  throw new DownloadError("Could not find balanced end of YouTube object");
}

function extensionFromMime(mimeType: string | undefined): string | null {
  const match = /^(?:audio|video)\/(?<ext>[^;]+)/.exec(mimeType ?? "");
  const ext = match?.groups?.ext;
  if (!ext) {
    return null;
  }
  return ext === "x-m4a" ? "m4a" : ext;
}

function extensionFromUrl(url: string): string | null {
  const match = /\.([A-Za-z0-9]+)(?:\?|$)/.exec(new URL(url).pathname);
  return match?.[1] ?? null;
}

function defaultUserAgent(): string {
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36";
}
