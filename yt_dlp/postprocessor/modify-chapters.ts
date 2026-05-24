// Source: yt_dlp/postprocessor/modify_chapters.py
// Port note: chapter cutting uses the migrated FFmpeg concat helper and Bun file operations.

import { rename, stat } from "node:fs/promises";

import { PostProcessingError, prependExtension } from "../utils/utils.ts";
import { FFmpegPostProcessor, FFmpegSubtitlesConvertorPP } from "./ffmpeg.ts";
import type { PostProcessorInfo } from "./common.ts";
import { SponsorBlockPP } from "./sponsorblock.ts";

const TINY_CHAPTER_DURATION = 1;
export const DEFAULT_SPONSORBLOCK_CHAPTER_TITLE = "[SponsorBlock]: %(category_names)l";

type CategoryTuple = [string, number, number, string];

interface Chapter {
  start_time: number;
  end_time: number;
  title?: string;
  category?: string;
  categories?: string[];
  name?: string;
  category_names?: string[];
  filepath?: string;
  remove?: boolean;
  _categories?: CategoryTuple[];
  _was_cut?: boolean;
  cut_idx?: number;
  [key: string]: unknown;
}

interface QueueItem {
  start: number;
  index: number;
  chapter: Chapter;
}

export class ModifyChaptersPP extends FFmpegPostProcessor {
  private readonly removeChapterPatterns: RegExp[];
  private readonly removeSponsorSegments: Set<string>;
  private readonly rangesToRemove: Array<[number, number]>;
  private readonly sponsorblockChapterTitle: string;
  private readonly forceKeyframesEnabled: boolean;

  constructor(
    downloader: ConstructorParameters<typeof FFmpegPostProcessor>[0] = null,
    remove_chapters_patterns: readonly RegExp[] | readonly string[] | null = null,
    remove_sponsor_segments: readonly string[] | null = null,
    remove_ranges: readonly (readonly [number, number])[] | null = null,
    options: { sponsorblock_chapter_title?: string; force_keyframes?: boolean } = {},
  ) {
    super(downloader);
    this.removeChapterPatterns = [...(remove_chapters_patterns ?? [])].map((pattern) => (
      pattern instanceof RegExp ? pattern : new RegExp(pattern)
    ));
    const nonSkippable = new Set(Object.keys(SponsorBlockPP.NON_SKIPPABLE_CATEGORIES));
    this.removeSponsorSegments = new Set((remove_sponsor_segments ?? []).filter((category) => !nonSkippable.has(category)));
    this.rangesToRemove = (remove_ranges ?? []).map(([start, end]) => [start, end]);
    this.sponsorblockChapterTitle = options.sponsorblock_chapter_title ?? DEFAULT_SPONSORBLOCK_CHAPTER_TITLE;
    this.forceKeyframesEnabled = Boolean(options.force_keyframes);
  }

  override async run(info: PostProcessorInfo): Promise<[string[], PostProcessorInfo]> {
    await this.fixupChapters(info);
    const [chaptersMarked, sponsorChaptersMarked] = this.markChaptersToRemove(
      cloneChapters(info.chapters),
      cloneChapters(info.sponsorblock_chapters),
    );
    if (!chaptersMarked.length && !sponsorChaptersMarked.length) {
      return [[], info];
    }

    const filepath = requireString(info.filepath, "ModifyChaptersPP requires info.filepath");
    const realDuration = await this.getRealVideoDuration(filepath);
    if (realDuration === null) {
      throw new PostProcessingError("Unable to determine video duration");
    }
    const chapters = chaptersMarked.length ? chaptersMarked : [{
      start_time: 0,
      end_time: typeof info.duration === "number" ? info.duration : realDuration,
      title: typeof info.title === "string" ? info.title : "",
    }];

    const [newChapters, cuts] = this.removeMarkedArrangeSponsors([...chapters, ...sponsorChaptersMarked]);
    info.chapters = newChapters;
    if (!cuts.length) {
      return [[], info];
    }
    if (!newChapters.length) {
      this.reportWarning("You have requested to remove the entire video, which is not possible");
      return [[], info];
    }

    const originalDuration = typeof info.duration === "number" ? info.duration : null;
    info.duration = newChapters.at(-1)?.end_time;
    if (durationMismatch(realDuration, originalDuration, 1)) {
      if (!durationMismatch(realDuration, typeof info.duration === "number" ? info.duration : null)) {
        this.toScreen(`Skipping ${this.ppKey()} since the video appears to be already cut`);
        return [[], info];
      }
      if (!info.__real_download) {
        throw new PostProcessingError("Cannot cut video since the real and expected durations mismatch. Different chapters may have already been removed");
      }
      this.writeDebug("Expected and actual durations mismatch");
    }

    const concatOpts = ModifyChaptersPP.makeConcatOpts(cuts, realDuration);
    this.writeDebug(`Concat spec = ${concatOpts.map((option) => `${option.inpoint ?? "0.0"}-${option.outpoint ?? "inf"}`).join(", ")}`);
    const inOutFiles: Array<[string, string]> = [[filepath, await this.removeChapters(filepath, cuts, concatOpts, this.forceKeyframesEnabled)]];
    for (const subFile of await this.getSupportedSubs(info)) {
      inOutFiles.push([subFile, await this.removeChapters(subFile, cuts, concatOpts, false)]);
    }

    const filesToRemove: string[] = [];
    for (const [inputFile, outputFile] of inOutFiles) {
      const mtime = (await stat(inputFile)).mtimeMs / 1000;
      const uncutFile = prependExtension(inputFile, "uncut");
      await rename(inputFile, uncutFile);
      await rename(outputFile, inputFile);
      await this.tryUtime(inputFile, mtime, mtime);
      filesToRemove.push(uncutFile);
    }
    return [filesToRemove, info];
  }

  private markChaptersToRemove(chapters: Chapter[], sponsorChapters: Chapter[]): [Chapter[], Chapter[]] {
    if (this.removeChapterPatterns.length) {
      let warnNoChapterToRemove = true;
      if (!chapters.length) {
        this.toScreen("Chapter information is unavailable");
        warnNoChapterToRemove = false;
      }
      for (const chapter of chapters) {
        const title = String(chapter.title ?? "");
        if (this.removeChapterPatterns.some((regex) => regex.test(title))) {
          chapter.remove = true;
          warnNoChapterToRemove = false;
        }
      }
      if (warnNoChapterToRemove) {
        this.toScreen("There are no chapters matching the regex");
      }
    }

    if (this.removeSponsorSegments.size) {
      let warnNoChapterToRemove = true;
      if (!sponsorChapters.length) {
        this.toScreen("SponsorBlock information is unavailable");
        warnNoChapterToRemove = false;
      }
      for (const chapter of sponsorChapters) {
        if (typeof chapter.category === "string" && this.removeSponsorSegments.has(chapter.category)) {
          chapter.remove = true;
          warnNoChapterToRemove = false;
        }
      }
      if (warnNoChapterToRemove) {
        this.toScreen("There are no matching SponsorBlock chapters");
      }
    }

    for (const [start, end] of this.rangesToRemove) {
      sponsorChapters.push({
        start_time: start,
        end_time: end,
        category: "manually_removed",
        _categories: [["manually_removed", start, end, "Manually removed"]],
        remove: true,
      });
    }
    return [chapters, sponsorChapters];
  }

  private async getSupportedSubs(info: PostProcessorInfo): Promise<string[]> {
    const subtitles = isRecord(info.requested_subtitles) ? Object.values(info.requested_subtitles) : [];
    const files: string[] = [];
    for (const subUnknown of subtitles) {
      if (!isRecord(subUnknown)) {
        continue;
      }
      const subFile = typeof subUnknown.filepath === "string" ? subUnknown.filepath : null;
      if (!subFile || !await pathExists(subFile)) {
        continue;
      }
      const ext = typeof subUnknown.ext === "string" ? subUnknown.ext : "";
      if (!FFmpegSubtitlesConvertorPP.SUPPORTED_EXTS.includes(ext as typeof FFmpegSubtitlesConvertorPP.SUPPORTED_EXTS[number])) {
        this.reportWarning(`Cannot remove chapters from external ${ext} subtitles; "${subFile}" is now out of sync`);
        continue;
      }
      files.push(subFile);
    }
    return files;
  }

  private removeMarkedArrangeSponsors(inputChapters: Chapter[]): [Chapter[], Chapter[]] {
    const cuts: Chapter[] = [];
    const appendCut = (chapter: Chapter): number => {
      const lastToCut = cuts.at(-1);
      if (lastToCut && lastToCut.end_time >= chapter.start_time) {
        lastToCut.end_time = Math.max(lastToCut.end_time, chapter.end_time);
      } else {
        cuts.push(chapter);
      }
      return cuts.length - 1;
    };
    const excessDuration = (chapter: Chapter): number => {
      const cutIndex = chapter.cut_idx ?? cuts.length;
      delete chapter.cut_idx;
      let excess = 0;
      for (let index = cutIndex; index < cuts.length; index += 1) {
        const cut = cuts[index]!;
        if (cut.start_time >= chapter.end_time) {
          break;
        }
        if (cut.end_time > chapter.start_time) {
          excess += Math.min(cut.end_time, chapter.end_time);
          excess -= Math.max(cut.start_time, chapter.start_time);
        }
      }
      return excess;
    };
    const newChapters: Chapter[] = [];
    const appendChapter = (chapter: Chapter): void => {
      const length = chapter.end_time - chapter.start_time - excessDuration(chapter);
      if (length <= 0) {
        return;
      }
      const start = newChapters.at(-1)?.end_time ?? 0;
      chapter.start_time = start;
      chapter.end_time = start + length;
      newChapters.push(chapter);
    };

    const queue = inputChapters
      .filter(isChapter)
      .map((chapter, index) => ({ start: chapter.start_time, index, chapter }))
      .sort(compareQueueItem);
    if (!queue.length) {
      return [[], cuts];
    }
    let { index: currentIndex, chapter: currentChapter } = queue.shift()!;
    while (queue.length) {
      const { index, chapter } = queue.shift()!;
      if (currentChapter.end_time <= chapter.start_time) {
        currentChapter.remove ? appendCut(currentChapter) : appendChapter(currentChapter);
        currentIndex = index;
        currentChapter = chapter;
        continue;
      }

      if (currentChapter.remove) {
        if (chapter.remove) {
          currentChapter.end_time = Math.max(currentChapter.end_time, chapter.end_time);
        } else if (currentChapter.end_time < chapter.end_time) {
          chapter.start_time = currentChapter.end_time;
          chapter._was_cut = true;
          queuePush(queue, { start: chapter.start_time, index, chapter });
        }
      } else if (chapter.remove) {
        currentChapter._was_cut = true;
        if (currentChapter.end_time <= chapter.end_time) {
          currentChapter.end_time = chapter.start_time;
          appendChapter(currentChapter);
          currentIndex = index;
          currentChapter = chapter;
          continue;
        }
        if (currentChapter._categories) {
          const afterChapter = cloneChapter({ ...currentChapter, start_time: chapter.end_time, _categories: [] });
          const currentCategories: CategoryTuple[] = [];
          for (const category of currentChapter._categories) {
            if (category[1] < chapter.start_time) {
              currentCategories.push(category);
            }
            if (category[2] > chapter.end_time) {
              afterChapter._categories!.push(category);
            }
          }
          currentChapter._categories = currentCategories;
          if (JSON.stringify(currentChapter._categories) !== JSON.stringify(afterChapter._categories)) {
            queuePush(queue, { start: afterChapter.start_time, index: currentIndex, chapter: afterChapter });
            currentChapter.end_time = chapter.start_time;
            appendChapter(currentChapter);
            currentIndex = index;
            currentChapter = chapter;
            continue;
          }
        }
        currentChapter.cut_idx ??= appendCut(chapter);
      } else if (currentChapter._categories && !chapter._categories) {
        if (currentChapter.end_time < chapter.end_time) {
          chapter.start_time = currentChapter.end_time;
          chapter._was_cut = true;
          queuePush(queue, { start: chapter.start_time, index, chapter });
        }
      } else {
        currentChapter._was_cut = true;
        chapter._was_cut = true;
        if (currentChapter.end_time > chapter.end_time) {
          const afterChapter = cloneChapter({ ...currentChapter, start_time: chapter.end_time });
          queuePush(queue, { start: afterChapter.start_time, index: currentIndex, chapter: afterChapter });
        } else if (chapter.end_time > currentChapter.end_time) {
          const afterCurrent = cloneChapter({ ...chapter, start_time: currentChapter.end_time });
          queuePush(queue, { start: afterCurrent.start_time, index: currentIndex, chapter: afterCurrent });
          chapter.end_time = currentChapter.end_time;
        }
        if (currentChapter._categories) {
          chapter._categories = [...currentChapter._categories, ...(chapter._categories ?? [])];
        }
        if (currentChapter.cut_idx !== undefined) {
          chapter.cut_idx = currentChapter.cut_idx;
        }
        currentChapter.end_time = chapter.start_time;
        appendChapter(currentChapter);
        currentIndex = index;
        currentChapter = chapter;
      }
    }
    currentChapter.remove ? appendCut(currentChapter) : appendChapter(currentChapter);
    return [this.removeTinyRenameSponsors(newChapters), cuts];
  }

  private removeTinyRenameSponsors(chapters: Chapter[]): Chapter[] {
    const newChapters: Chapter[] = [];
    for (const [index, chapter] of chapters.entries()) {
      if ((chapter._was_cut || chapter._categories) && chapter.end_time - chapter.start_time < TINY_CHAPTER_DURATION) {
        if (!newChapters.length) {
          if (index < chapters.length - 1) {
            chapters[index + 1]!.start_time = chapter.start_time;
            continue;
          }
        } else {
          const previous = newChapters.at(-1)!;
          if (index < chapters.length - 1) {
            const next = chapters[index + 1]!;
            const prevIsSponsor = "categories" in previous;
            const nextIsSponsor = Boolean(next._categories);
            if ((!chapter._categories && prevIsSponsor && !nextIsSponsor) || (chapter._categories && !prevIsSponsor && nextIsSponsor)) {
              next.start_time = chapter.start_time;
              continue;
            }
          }
          previous.end_time = chapter.end_time;
          continue;
        }
      }

      delete chapter._was_cut;
      const categories = chapter._categories;
      delete chapter._categories;
      if (categories?.length) {
        const [category, , , categoryName] = [...categories].sort((left, right) => (left[2] - left[1]) - (right[2] - right[1]))[0]!;
        chapter.category = category;
        chapter.categories = orderedUnique(categories.map((item) => item[0]));
        chapter.name = categoryName;
        chapter.category_names = orderedUnique(categories.map((item) => item[3]));
        chapter.title = this.evaluateChapterTitle(this.sponsorblockChapterTitle, chapter);
        if (newChapters.length && "categories" in newChapters.at(-1)! && newChapters.at(-1)!.title === chapter.title) {
          newChapters.at(-1)!.end_time = chapter.end_time;
          continue;
        }
      }
      newChapters.push(chapter);
    }
    return newChapters;
  }

  async removeChapters(filename: string, rangesToCut: readonly Chapter[], concatOpts: Array<Record<string, string>>, forceKeyframes = false): Promise<string> {
    let inputFile = filename;
    const outputFile = prependExtension(inputFile, "temp");
    if (forceKeyframes) {
      inputFile = await this.forceKeyframes(inputFile, rangesToCut.flatMap((chapter) => [chapter.start_time, chapter.end_time]));
    }
    this.toScreen(`Removing chapters from ${filename}`);
    await this.concatFiles(Array.from({ length: concatOpts.length }, () => inputFile), outputFile, concatOpts);
    if (inputFile !== filename) {
      await this.deleteDownloadedFiles(inputFile);
    }
    return outputFile;
  }

  static makeConcatOpts(chaptersToRemove: readonly Chapter[], duration: number): Array<Record<string, string>> {
    const opts: Array<Record<string, string>> = [{}];
    for (const segment of chaptersToRemove) {
      if (segment.start_time === 0) {
        opts.at(-1)!.inpoint = segment.end_time.toFixed(6);
        continue;
      }
      opts.at(-1)!.outpoint = segment.start_time.toFixed(6);
      if (segment.end_time < duration) {
        opts.push({ inpoint: segment.end_time.toFixed(6) });
      }
    }
    return opts;
  }

  private evaluateChapterTitle(template: string, chapter: Chapter): string {
    const downloader = this.downloader as unknown;
    if (isRecord(downloader)) {
      const evaluator = downloader.evaluateOuttmpl ?? downloader.evaluate_outtmpl;
      if (typeof evaluator === "function") {
        const evaluated: unknown = evaluator.call(downloader, template, { ...chapter });
        if (typeof evaluated === "string") {
          return evaluated;
        }
      }
    }
    // Logic note: full outtmpl formatting is not in this layer; support the SponsorBlock list/string fields used here.
    return template
      .replaceAll(/%\((\w+)\)l/g, (_match, key: string) => Array.isArray(chapter[key]) ? (chapter[key] as unknown[]).join(", ") : String(chapter[key] ?? ""))
      .replaceAll(/%\((\w+)\)s/g, (_match, key: string) => String(chapter[key] ?? ""));
  }
}

function durationMismatch(left: number | null, right: number | null, tolerance = 2): boolean | null {
  if (!left || !right) {
    return null;
  }
  return Math.abs(left - right) > tolerance;
}

function queuePush(queue: QueueItem[], item: QueueItem): void {
  queue.push(item);
  queue.sort(compareQueueItem);
}

function compareQueueItem(left: QueueItem, right: QueueItem): number {
  return left.start - right.start || left.index - right.index;
}

function cloneChapters(value: unknown): Chapter[] {
  return Array.isArray(value) ? value.filter(isRecord).map((item) => cloneChapter(item)).filter(isChapter) : [];
}

function cloneChapter(value: Record<string, unknown>): Chapter {
  return structuredClone(value) as Chapter;
}

function isChapter(value: unknown): value is Chapter {
  return isRecord(value) && typeof value.start_time === "number" && typeof value.end_time === "number";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value) {
    throw new PostProcessingError(message);
  }
  return value;
}

function orderedUnique<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
