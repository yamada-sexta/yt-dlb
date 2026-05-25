// Source: yt_dlp/extractor/youtube/_video.py
// Port note: this is a focused Bun extractor for YouTube watch URLs. It covers webpage player
// responses and progressive HTTP formats; DASH/HLS merging remains a later downloader-layer port.

import { DownloadError, type YoutubeDL } from "../../YoutubeDL.ts";
import { InfoExtractor, type ExtractorInfo } from "../common.ts";
import { z } from "zod";
import { initializeJscDirector, JsChallengeType, type JsChallengeRequest, type NChallengeOutput, type SigChallengeOutput } from "./jsc/index.ts";

export class YoutubeIE extends InfoExtractor {
  static override readonly _VALID_URL = [
    String.raw`^(?:(?:https?:)?//(?:(?:(?:\w+\.)?[yY][oO][uU][tT][uU][bB][eE](?:-nocookie|kids)?\.com|(?:www\.)?deturl\.com/www\.youtube\.com|(?:www\.)?pwnyoutube\.com|(?:www\.)?hooktube\.com|(?:www\.)?yourepeat\.com|tube\.majestyc\.net|youtube\.googleapis\.com)/(?:.*?#/)?(?:(?:v|embed|e|shorts|live)/(?!videoseries|live_stream)|(?:(?:watch|movie)(?:_popup)?(?:\.php)?/?)?(?:\?|#!?)(?:.*?[&;])?v=)|(?:(?:youtu\.be|vid\.plus|zwearz\.com/watch)/)|(?:(?:www\.)?cleanvideosearch\.com/media/action/yt/watch\?videoId=)))(?<id>[0-9A-Za-z_-]{11})(?:[^\s]*)?(?:#|$)`,
    String.raw`^(?<id>[0-9A-Za-z_-]{11})(?:#|$)`,
  ] as const;

  static override suitable(url: string): boolean {
    if (hasQueryValue(url, "list")) {
      return false;
    }
    return super.suitable(url);
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    if (!isYoutubeDL(this.downloader)) {
      throw new DownloadError("YoutubeIE requires a YoutubeDL downloader host");
    }
    return { ...await extractYoutubeVideo(url, this.downloader) };
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

const YoutubeFormatSchema = z.object({
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
}).passthrough();

const YoutubePlayerResponseSchema = z.object({
  playabilityStatus: z.object({
    status: z.string().optional(),
    reason: z.string().optional(),
  }).passthrough().optional(),
  videoDetails: z.object({
    videoId: z.string().optional(),
    title: z.string().optional(),
    lengthSeconds: z.string().optional(),
  }).passthrough().optional(),
  streamingData: z.object({
    formats: z.array(YoutubeFormatSchema).optional(),
    adaptiveFormats: z.array(YoutubeFormatSchema).optional(),
  }).passthrough().optional(),
}).passthrough();

function isYoutubeDL(value: unknown): value is YoutubeDL {
  const candidate = value as Partial<YoutubeDL> | null;
  return Boolean(candidate && typeof candidate.urlopen === "function" && typeof candidate.prepareFilename === "function");
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
  const playable = resolved.filter((format): format is ResolvedYoutubeFormat => format !== null);
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
const jscDirectorCache = new WeakMap<YoutubeDL, ReturnType<typeof initializeJscDirector>>();

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
    throw new DownloadError("YouTube signature challenge solver did not return a result");
  }
  const solved = (response.output as SigChallengeOutput).results[signature];
  if (!solved) {
    throw new DownloadError("YouTube signature challenge solver did not return a signature");
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
    throw new DownloadError("YouTube n challenge solver did not return a result");
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

function getJscDirector(ydl: YoutubeDL): ReturnType<typeof initializeJscDirector> {
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
  return YoutubePlayerResponseSchema.parse(JSON.parse(readBalanced(webpage, braceIndex)));
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
