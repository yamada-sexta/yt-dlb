// Source: yt_dlp/postprocessor/sponsorblock.py
// Port note: SponsorBlock requests use Bun fetch/downloader.urlopen instead of Python urllib.

import { createHash } from "node:crypto";
import { z } from "zod";

import { PostProcessingError } from "../utils/utils.ts";
import { FFmpegPostProcessor } from "./ffmpeg.ts";
import type { PostProcessorInfo } from "./common.ts";

interface SponsorBlockSegment {
  videoID: string;
  segments: SponsorSegment[];
}

interface SponsorSegment {
  segment: [number, number];
  category: string;
  actionType: string;
  videoDuration?: number | null;
  description?: string;
}

const SponsorSegmentSchema = z.object({
  segment: z.tuple([z.number(), z.number()]),
  category: z.string(),
  actionType: z.string(),
  videoDuration: z.number().nullable().optional(),
  description: z.string().optional(),
}).passthrough();

const SponsorBlockSegmentSchema = z.object({
  videoID: z.string(),
  segments: z.array(SponsorSegmentSchema),
}).passthrough();

const RecordSchema = z.record(z.string(), z.unknown());

export class SponsorBlockPP extends FFmpegPostProcessor {
  static readonly EXTRACTORS: Record<string, string> = {
    Youtube: "YouTube",
  };

  static readonly POI_CATEGORIES: Record<string, string> = {
    poi_highlight: "Highlight",
  };

  static readonly NON_SKIPPABLE_CATEGORIES: Record<string, string> = {
    ...SponsorBlockPP.POI_CATEGORIES,
    chapter: "Chapter",
  };

  static readonly CATEGORIES: Record<string, string> = {
    sponsor: "Sponsor",
    intro: "Intermission/Intro Animation",
    outro: "Endcards/Credits",
    selfpromo: "Unpaid/Self Promotion",
    preview: "Preview/Recap",
    filler: "Filler Tangent",
    interaction: "Interaction Reminder",
    music_offtopic: "Non-Music Section",
    hook: "Hook/Greetings",
    ...SponsorBlockPP.NON_SKIPPABLE_CATEGORIES,
  };

  private readonly categories: string[];
  private readonly apiUrl: string;

  constructor(
    downloader: ConstructorParameters<typeof FFmpegPostProcessor>[0] = null,
    categories: readonly string[] | null = null,
    api = "https://sponsor.ajay.app",
  ) {
    super(downloader);
    this.categories = [...(categories ?? Object.keys(SponsorBlockPP.CATEGORIES))];
    this.apiUrl = /^https?:\/\//.test(api) ? api : `https://${api}`;
  }

  override async run(info: PostProcessorInfo): Promise<[string[], PostProcessorInfo]> {
    const extractor = typeof info.extractor_key === "string" ? info.extractor_key : "";
    if (!(extractor in SponsorBlockPP.EXTRACTORS)) {
      this.toScreen(`SponsorBlock is not supported for ${extractor}`);
      return [[], info];
    }

    this.toScreen("Fetching SponsorBlock segments");
    info.sponsorblock_chapters = await this.getSponsorChapters(info, typeof info.duration === "number" ? info.duration : null);
    return [[], info];
  }

  private async getSponsorChapters(info: PostProcessorInfo, duration: number | null): Promise<Array<Record<string, unknown>>> {
    const id = typeof info.id === "string" ? info.id : null;
    const extractor = typeof info.extractor_key === "string" ? info.extractor_key : null;
    const service = extractor ? SponsorBlockPP.EXTRACTORS[extractor] : null;
    if (!id || !service) {
      throw new PostProcessingError("SponsorBlockPP requires info.id and supported info.extractor_key");
    }
    const segments = await this.getSponsorSegments(id, service);
    const durationMatch = segments.filter((segment) => this.durationFilter(segment, duration));
    if (durationMatch.length !== segments.length) {
      this.reportWarning("Some SponsorBlock segments are from a video of different duration, maybe from an old version of this video");
    }

    const sponsorChapters = durationMatch.map((segment) => {
      const [start, end] = segment.segment;
      const category = segment.category;
      const title = category === "chapter" ? segment.description ?? SponsorBlockPP.CATEGORIES[category] ?? category : SponsorBlockPP.CATEGORIES[category] ?? category;
      return {
        start_time: start,
        end_time: end,
        category,
        title,
        type: segment.actionType,
        _categories: [[category, start, end, title]],
      };
    });
    this.toScreen(sponsorChapters.length
      ? `Found ${sponsorChapters.length} segments in the SponsorBlock database`
      : "No matching segments were found in the SponsorBlock database");
    return sponsorChapters;
  }

  private durationFilter(segment: SponsorSegment, duration: number | null): boolean {
    const [start, end] = segment.segment;
    if (start === 0 && end === 0) {
      return false;
    }
    if (start <= 1) {
      segment.segment[0] = 0;
    }
    if (segment.category in SponsorBlockPP.POI_CATEGORIES) {
      segment.segment[1] += 1;
    }
    if (duration !== null && duration - segment.segment[1] <= 1) {
      segment.segment[1] = duration;
    }
    const videoDuration = segment.videoDuration ?? 0;
    const diff = duration !== null && videoDuration ? Math.abs(duration - videoDuration) : 0;
    const segmentDuration = segment.segment[1] - segment.segment[0];
    return diff < 1 || (segmentDuration > 0 && diff < 5 && diff / segmentDuration < 0.05);
  }

  private async getSponsorSegments(videoId: string, service: string): Promise<SponsorSegment[]> {
    const videoHash = createHash("sha256").update(videoId, "ascii").digest("hex");
    const params = new URLSearchParams({
      service,
      categories: JSON.stringify(this.categories),
      actionTypes: JSON.stringify(["skip", "poi", "chapter"]),
    });
    const url = `${this.apiUrl}/api/skipSegments/${videoHash.slice(0, 4)}?${params}`;
    const response = this.downloader?.urlopen ? await this.downloader.urlopen(url) : await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      throw new PostProcessingError(`SponsorBlock API returned HTTP ${response.status}`);
    }
    const parsed: unknown = await response.json();
    const rows = Array.isArray(parsed) ? parsed.filter(isSponsorBlockSegment) : [];
    return rows.find((row) => row.videoID === videoId)?.segments ?? [];
  }
}

function isSponsorBlockSegment(value: unknown): value is SponsorBlockSegment {
  return SponsorBlockSegmentSchema.safeParse(value).success;
}

function isSponsorSegment(value: unknown): value is SponsorSegment {
  return SponsorSegmentSchema.safeParse(value).success;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return RecordSchema.safeParse(value).success;
}
