// Source: yt_dlp/postprocessor/ffmpeg.py
// Port note: implements the ffmpeg executable, probing, and command-runner subset needed by ytdlb.

import { $ } from "bun";
import { mkdir, realpath, rename, stat } from "node:fs/promises";
import { dirname, extname } from "node:path";
import { z } from "zod";

import { what as detectImageType } from "../compat/imghdr.ts";
import { getDurationFromMetadata } from "../dependencies/mediabunny.ts";
import { NotImplementedError } from "../errors.ts";
import { PostProcessor, type PostProcessorInfo } from "./common.ts";
import {
  detectExeVersion,
  determineExt,
  dfxp2srt,
  encodeArgument,
  getExeVersionOutput,
  isOutdatedVersion,
  orderedSet,
  PostProcessingError,
  replaceExtension,
  prependExtension,
  shellQuote,
} from "../utils/utils.ts";

export const EXT_TO_OUT_FORMATS: Record<string, string> = {
  aac: "adts",
  flac: "flac",
  m4a: "ipod",
  mka: "matroska",
  mkv: "matroska",
  mpg: "mpeg",
  ogv: "ogg",
  ts: "mpegts",
  wma: "asf",
  wmv: "asf",
  weba: "webm",
  vtt: "webvtt",
};

const StringArraySchema = z.array(z.string());
const RecordSchema = z.record(z.string(), z.unknown());

export const ACODECS: Record<string, readonly [string, string | null, readonly string[]]> = {
  mp3: ["mp3", "libmp3lame", []],
  aac: ["m4a", "aac", ["-f", "adts"]],
  m4a: ["m4a", "aac", ["-bsf:a", "aac_adtstoasc"]],
  opus: ["opus", "libopus", []],
  vorbis: ["ogg", "libvorbis", []],
  flac: ["flac", "flac", []],
  alac: ["m4a", null, ["-acodec", "alac"]],
  wav: ["wav", null, ["-f", "wav"]],
};

const MEDIA_EXTENSIONS = {
  commonVideo: ["avi", "flv", "mkv", "mov", "mp4", "webm"] as const,
  commonAudio: ["aiff", "alac", "flac", "m4a", "mka", "mp3", "ogg", "opus", "wav"] as const,
};

const VIDEO_CONVERT_EXTS = [
  ...MEDIA_EXTENSIONS.commonVideo,
  "gif",
  ...MEDIA_EXTENSIONS.commonAudio,
  "aac",
  "vorbis",
] as const;

export function createMappingRe(supported: readonly string[]): RegExp {
  // Logic note: Python builds this with re.escape; ytdlb uses native RegExp.escape for literal extensions.
  const extensionPattern = supported.map((extension) => RegExp.escape(extension)).join("|");
  return new RegExp(`(?:\\s*\\w+\\s*>)?\\s*(?:${extensionPattern})\\s*(?:/(?:\\s*\\w+\\s*>)?\\s*(?:${extensionPattern})\\s*)*$`);
}

export function resolveMapping(source: string, mapping: string | null | undefined): [string | null, string | null] {
  if (!mapping) {
    return [null, "no target format configured"];
  }
  for (const pair of mapping.toLowerCase().split("/")) {
    const [left, ...right] = pair.split(">");
    const hasSource = right.length > 0;
    if (!hasSource || left?.trim() === source) {
      const target = (hasSource ? right.join(">") : left ?? "").trim();
      if (target === source) {
        return [target, `already is in target format ${source}`];
      }
      return [target, null];
    }
  }
  return [null, `could not find a mapping for ${source}`];
}

export class FFmpegPostProcessorError extends PostProcessingError {
  override name = "FFmpegPostProcessorError";
}

export class FFmpegPostProcessor extends PostProcessor {
  readonly paths: Record<"ffmpeg" | "ffprobe", string | null>;
  readonly versions: Record<string, string | false>;
  readonly features: { fdk?: boolean; setts?: boolean; needs_adtstoasc?: boolean };
  readonly basename: "ffmpeg" | null;
  readonly probeBasename: "ffprobe" | null;

  constructor(downloader: ConstructorParameters<typeof PostProcessor>[0] = null) {
    super(downloader);
    this.paths = this.determineExecutables();
    const ffmpegVersion = this.getFfmpegVersion("ffmpeg");
    const ffprobeVersion = this.getFfmpegVersion("ffprobe");
    this.basename = ffmpegVersion.version ? "ffmpeg" : null;
    this.probeBasename = ffprobeVersion.version ? "ffprobe" : null;
    this.features = ffmpegVersion.features;
    this.versions = {
      ...(ffmpegVersion.version ? { ffmpeg: ffmpegVersion.version } : {}),
      ...(ffprobeVersion.version ? { ffprobe: ffprobeVersion.version } : {}),
    };
  }

  static getVersionsAndFeatures(downloader: ConstructorParameters<typeof PostProcessor>[0] = null): [Record<string, string | false>, FFmpegPostProcessor["features"]] {
    const pp = new FFmpegPostProcessor(downloader);
    return [pp.versions, pp.features];
  }

  get available(): boolean {
    return this.basename !== null;
  }

  get executable(): string | null {
    return this.basename ? this.paths[this.basename] : null;
  }

  get probeAvailable(): boolean {
    return this.probeBasename !== null;
  }

  get probeExecutable(): string | null {
    return this.probeBasename ? this.paths[this.probeBasename] : null;
  }

  checkVersion(): void {
    if (!this.available) {
      throw new FFmpegPostProcessorError("ffmpeg not found. Please install or provide the path using --ffmpeg-location");
    }
    const version = this.versions.ffmpeg;
    if (isOutdatedVersion(version, "1.0")) {
      this.reportWarning(`Your copy of ffmpeg is outdated, update ffmpeg to version 1.0 or newer if you encounter any errors`);
    }
  }

  async realRunFfmpeg(
    inputPathOpts: Array<[string, readonly string[]]>,
    outputPathOpts: Array<[string, readonly string[]]>,
    expectedRetcodes: readonly number[] = [0],
  ): Promise<string> {
    this.checkVersion();
    const executable = this.executable;
    if (!executable) {
      throw new FFmpegPostProcessorError("ffmpeg not found");
    }
    const mtimes = await Promise.all(inputPathOpts.filter(([path]) => path).map(async ([path]) => (await stat(path)).mtimeMs / 1000));
    const oldestMtime = Math.min(...mtimes);
    const cmd = [executable, encodeArgument("-y"), encodeArgument("-loglevel"), encodeArgument("repeat+info")];
    for (const [index, [path, opts]] of inputPathOpts.entries()) {
      cmd.push(...opts.map(encodeArgument), ...this.configurationArgs("ffmpeg", [`_i${index + 1}`, "_i"]), "-i", FFmpegPostProcessor.ffmpegFilenameArgument(path));
    }
    for (const [index, [path, opts]] of outputPathOpts.entries()) {
      const outputArgs = [...opts];
      if (index === 0) {
        outputArgs.unshift("-movflags", "+faststart");
      }
      cmd.push(...outputArgs.map(encodeArgument), ...this.configurationArgs("ffmpeg", [`_o${index + 1}`, "_o", ""]), FFmpegPostProcessor.ffmpegFilenameArgument(path));
    }
    this.writeDebug(`ffmpeg command line: ${shellQuote(cmd)}`);
    const { stdout, stderr, exitCode } = await runShellCommand(cmd);
    if (!expectedRetcodes.includes(exitCode)) {
      this.writeDebug(stderr || stdout);
      throw new FFmpegPostProcessorError((stderr || stdout).trim().split(/\r?\n/).at(-1) ?? `ffmpeg exited with code ${exitCode}`);
    }
    for (const [path] of outputPathOpts) {
      if (Number.isFinite(oldestMtime)) {
        await this.tryUtime(path, oldestMtime, oldestMtime);
      }
    }
    return stderr;
  }

  async runFfmpegMultipleFiles(inputPaths: readonly string[], outPath: string, opts: readonly string[]): Promise<string> {
    return await this.realRunFfmpeg(inputPaths.map((path) => [path, []]), [[outPath, opts]]);
  }

  async runFfmpeg(path: string, outPath: string, opts: readonly string[]): Promise<string> {
    return await this.runFfmpegMultipleFiles([path], outPath, opts);
  }

  async getAudioCodec(path: string): Promise<string | null> {
    if (!this.probeAvailable && !this.available) {
      throw new PostProcessingError("ffprobe and ffmpeg not found. Please install or provide the path using --ffmpeg-location");
    }
    const executable = this.probeAvailable ? this.probeExecutable : this.executable;
    if (!executable) {
      return null;
    }
    const cmd = this.probeAvailable
      ? [executable, "-show_streams", FFmpegPostProcessor.ffmpegFilenameArgument(path)]
      : [executable, "-i", FFmpegPostProcessor.ffmpegFilenameArgument(path)];
    this.writeDebug(`${this.probeAvailable ? "ffprobe" : "ffmpeg"} command line: ${shellQuote(cmd)}`);
    const { stdout, stderr, exitCode } = await runShellCommand(cmd);
    if (exitCode !== (this.probeAvailable ? 0 : 1)) {
      return null;
    }
    const output = this.probeAvailable ? stdout : stderr;
    if (this.probeAvailable) {
      let audioCodec: string | null = null;
      for (const line of output.split(/\r?\n/)) {
        if (line.startsWith("codec_name=")) {
          audioCodec = line.slice("codec_name=".length).trim();
        } else if (line.trim() === "codec_type=audio" && audioCodec) {
          return audioCodec;
        }
      }
      return null;
    }
    return /Stream\s*#\d+:\d+(?:\[0x[0-9a-f]+\])?(?:\([a-z]{3}\))?:\s*Audio:\s*([0-9a-z]+)/i.exec(output)?.[1] ?? null;
  }

  async getMetadataObject(path: string, opts: readonly string[] = []): Promise<FfprobeMetadata> {
    if (!this.probeAvailable || !this.probeExecutable) {
      throw new PostProcessingError("ffprobe not found. Please install or provide the path using --ffmpeg-location");
    }
    this.checkVersion();
    const cmd = [
      this.probeExecutable,
      "-hide_banner",
      "-show_format",
      "-show_streams",
      "-print_format",
      "json",
      ...opts,
      FFmpegPostProcessor.ffmpegFilenameArgument(path),
    ];
    this.writeDebug(`ffprobe command line: ${shellQuote(cmd)}`);
    const { stdout, stderr, exitCode } = await runShellCommand(cmd);
    if (exitCode !== 0) {
      throw new PostProcessingError((stderr || stdout).trim().split(/\r?\n/).at(-1) ?? `ffprobe exited with code ${exitCode}`);
    }
    const parsed: unknown = JSON.parse(stdout);
    if (!isRecord(parsed)) {
      throw new PostProcessingError("ffprobe returned invalid metadata JSON");
    }
    return parsed as FfprobeMetadata;
  }

  async getStreamNumber(path: string, keys: readonly string[], value: string | number): Promise<[number | null, number]> {
    const streams = (await this.getMetadataObject(path)).streams ?? [];
    const expected = String(value).toLowerCase();
    const index = streams.findIndex((stream) => {
      const actual = getPathValue(stream, keys);
      return actual !== null && String(actual).toLowerCase() === expected;
    });
    return [index === -1 ? null : index, streams.length];
  }

  async getRealVideoDuration(filepath: string, fatal = true): Promise<number | null> {
    try {
      const duration = Number(getPathString(await this.getMetadataObject(filepath), ["format", "duration"]));
      if (!duration) {
        throw new PostProcessingError("ffprobe returned empty duration");
      }
      return duration;
    } catch (error) {
      const fallbackDuration = await this.getMusicMetadataDuration(filepath);
      if (fallbackDuration !== null) {
        return fallbackDuration;
      }
      if (fatal) {
        throw new PostProcessingError(`Unable to determine video duration: ${error instanceof Error ? error.message : String(error)}`);
      }
      return null;
    }
  }

  private async getMusicMetadataDuration(filepath: string): Promise<number | null> {
    try {
      // Logic change: the Bun port can use Mediabunny as a lightweight fallback when ffprobe
      // is unavailable or cannot parse an audio container. ffprobe remains the primary video probe.
      return await getDurationFromMetadata(filepath);
    } catch {
      return null;
    }
  }

  async fixupChapters(info: PostProcessorInfo): Promise<void> {
    const chapters = Array.isArray(info.chapters) ? info.chapters.filter(isRecord) : [];
    const lastChapter = chapters.at(-1);
    if (lastChapter && typeof lastChapter.end_time !== "number") {
      lastChapter.end_time = await this.getRealVideoDuration(requireStringInfo(info, "filepath", this.ppKey()));
    }
  }

  static *streamCopyOpts(copy = true, options: { ext?: string | null } = {}): Iterable<string> {
    yield "-map";
    yield "0";
    yield "-dn";
    yield "-ignore_unknown";
    if (copy) {
      yield "-c";
      yield "copy";
    }
    if (options.ext && ["mp4", "mov", "m4a"].includes(options.ext)) {
      yield "-c:s";
      yield "mov_text";
    }
  }

  static ffmpegFilenameArgument(filename: string): string {
    if (filename === "-" || /^https?:\/\//.test(filename)) {
      return filename;
    }
    return `file:${filename}`;
  }

  static quoteForFfmpeg(value: string): string {
    const quoted = value.replaceAll("'", "'\\''").replaceAll("'''", "'");
    return `${quoted.startsWith("'") ? "" : "'"}${quoted}${quoted.endsWith("'") ? "" : "'"}`;
  }

  async forceKeyframes(filename: string, timestamps: Iterable<number>): Promise<string> {
    const points = orderedSet(timestamps).filter((timestamp) => timestamp !== 0);
    const keyframeFile = prependExtension(filename, "keyframes.temp");
    this.toScreen(`Re-encoding "${filename}" with appropriate keyframes`);
    await this.runFfmpeg(filename, keyframeFile, [
      ...FFmpegPostProcessor.streamCopyOpts(false),
      "-force_key_frames",
      points.map((timestamp) => timestamp.toFixed(6)).join(","),
    ]);
    return keyframeFile;
  }

  async concatFiles(
    inputFiles: readonly string[],
    outFile: string,
    concatOpts: Array<Record<string, unknown>> | null = null,
  ): Promise<void> {
    const concatFile = `${outFile}.concat`;
    this.writeDebug(`Writing concat spec to ${concatFile}`);
    await Bun.write(concatFile, this.concatSpec(inputFiles, concatOpts).join(""));
    const outFlags = [...FFmpegPostProcessor.streamCopyOpts(true, { ext: determineExt(outFile) })];
    try {
      await this.realRunFfmpeg(
        [[concatFile, ["-hide_banner", "-nostdin", "-f", "concat", "-safe", "0"]]],
        [[outFile, outFlags]],
      );
    } finally {
      await this.deleteDownloadedFiles(concatFile);
    }
  }

  protected concatSpec(inputFiles: readonly string[], concatOpts: Array<Record<string, unknown>> | null = null): string[] {
    const options: Array<Record<string, unknown>> = concatOpts ?? inputFiles.map(() => ({}));
    const lines = ["ffconcat version 1.0\n"];
    for (let index = 0; index < inputFiles.length; index += 1) {
      const file = inputFiles[index];
      if (!file) {
        continue;
      }
      lines.push(`file ${FFmpegPostProcessor.quoteForFfmpeg(FFmpegPostProcessor.ffmpegFilenameArgument(file))}\n`);
      const opts = options[index] ?? {};
      for (const directive of ["inpoint", "outpoint", "duration"]) {
        const value = opts[directive];
        if (typeof value === "string" || typeof value === "number") {
          lines.push(`${directive} ${value}\n`);
        }
      }
    }
    return lines;
  }

  override async run(_information: PostProcessorInfo): Promise<[string[], PostProcessorInfo]> {
    throw new NotImplementedError("FFmpegPostProcessor base run");
  }

  private determineExecutables(): Record<"ffmpeg" | "ffprobe", string | null> {
    const location = this.getParam<string | null>("ffmpeg_location", null);
    if (!location) {
      return {
        ffmpeg: Bun.which("ffmpeg"),
        ffprobe: Bun.which("ffprobe"),
      };
    }
    const file = Bun.file(location);
    if (file.size >= 0) {
      const name = location.split(/[\\/]/).pop() ?? "";
      if (name.includes("ffprobe")) {
        return { ffmpeg: Bun.which("ffmpeg"), ffprobe: location };
      }
      return { ffmpeg: location, ffprobe: location.replace(/ffmpeg(?:\.exe)?$/i, "ffprobe") };
    }
    return { ffmpeg: Bun.which("ffmpeg"), ffprobe: Bun.which("ffprobe") };
  }

  private getFfmpegVersion(program: "ffmpeg" | "ffprobe"): { version: string | false; features: FFmpegPostProcessor["features"] } {
    const path = this.paths[program];
    const out = getExeVersionOutput(path ?? false, program === "ffmpeg" ? ["-bsfs"] : ["-version"]);
    const version = detectExeVersion(out);
    if (program !== "ffmpeg" || !out) {
      return { version, features: {} };
    }
    return {
      version,
      features: {
        fdk: out.includes("--enable-libfdk-aac"),
        setts: out.split(/\r?\n/).some((line) => line.trim() === "setts"),
        needs_adtstoasc: false,
      },
    };
  }
}

export const FFmpegPostProcessorError_ = FFmpegPostProcessorError;

export class FFmpegExtractAudioPP extends FFmpegPostProcessor {
  static readonly COMMON_AUDIO_EXTS = [...MEDIA_EXTENSIONS.commonAudio, "wma"] as const;
  static readonly SUPPORTED_EXTS = Object.keys(ACODECS);
  static readonly FORMAT_RE = createMappingRe(["best", ...Object.keys(ACODECS)]);

  private readonly mapping: string;
  private readonly preferredQuality: number | null;
  private readonly noPostOverwrites: boolean;

  constructor(
    downloader: ConstructorParameters<typeof FFmpegPostProcessor>[0] = null,
    preferredcodec: string | null = null,
    preferredquality: string | number | null = null,
    nopostoverwrites = false,
  ) {
    super(downloader);
    this.mapping = preferredcodec ?? "best";
    this.preferredQuality = preferredquality === null ? null : Number(preferredquality);
    this.noPostOverwrites = nopostoverwrites;
  }

  private qualityArgs(codec: string | null): string[] {
    if (this.preferredQuality === null || !Number.isFinite(this.preferredQuality) || !codec) {
      return [];
    }
    if (this.preferredQuality > 10) {
      return ["-b:a", `${this.preferredQuality}k`];
    }
    const limits = {
      libmp3lame: [10, 0],
      libvorbis: [0, 10],
      aac: [0.1, 4],
      libfdk_aac: [1, 5],
    }[codec] as [number, number] | undefined;
    if (!limits) {
      return [];
    }
    const quality = limits[1] + (limits[0] - limits[1]) * (this.preferredQuality / 10);
    return codec === "libfdk_aac" ? ["-vbr", String(Math.trunc(quality))] : ["-q:a", String(quality)];
  }

  private async runFfmpegAudio(path: string, outPath: string, codec: string | null, moreOpts: readonly string[]): Promise<void> {
    const acodecOpts = codec === null ? [] : ["-acodec", codec];
    try {
      await this.runFfmpeg(path, outPath, ["-vn", ...acodecOpts, ...moreOpts]);
    } catch (error) {
      throw new PostProcessingError(`audio conversion failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  override async run(information: PostProcessorInfo): Promise<[string[], PostProcessorInfo]> {
    const originalInputPath = requireStringInfo(information, "filepath", this.ppKey());
    let originalPath = originalInputPath;
    const path = originalInputPath;
    const sourceExt = requireStringInfo(information, "ext", this.ppKey()).toLowerCase();
    let [targetFormat, skipMsg] = resolveMapping(sourceExt, this.mapping);
    if (targetFormat === "best" && FFmpegExtractAudioPP.COMMON_AUDIO_EXTS.includes(sourceExt as typeof FFmpegExtractAudioPP.COMMON_AUDIO_EXTS[number])) {
      targetFormat = null;
      skipMsg = "the file is already in a common audio format";
    }
    if (!targetFormat) {
      this.toScreen(`Not converting audio ${originalPath}; ${skipMsg ?? "no target format configured"}`);
      return [[], information];
    }

    const filecodec = await this.getAudioCodec(path);
    if (filecodec === null) {
      throw new PostProcessingError("WARNING: unable to obtain file audio codec with ffprobe");
    }

    let extension: string;
    let acodec: string | null;
    let moreOpts: readonly string[];
    if (filecodec === "aac" && ["m4a", "best"].includes(targetFormat)) {
      [extension, , moreOpts] = requireAudioCodec("m4a");
      acodec = "copy";
    } else if (targetFormat === "best" || targetFormat === filecodec) {
      const codecSpec = ACODECS[filecodec];
      if (codecSpec) {
        [extension, , moreOpts] = codecSpec;
        acodec = "copy";
      } else {
        [extension, acodec, moreOpts] = requireAudioCodec("mp3");
      }
    } else {
      const codecSpec = ACODECS[targetFormat];
      if (!codecSpec) {
        throw new PostProcessingError(`Unknown audio target format: ${targetFormat}`);
      }
      [extension, acodec, moreOpts] = codecSpec;
      if (acodec === "aac" && this.features.fdk) {
        acodec = "libfdk_aac";
        moreOpts = [];
      }
    }

    if (acodec !== "copy") {
      moreOpts = this.qualityArgs(acodec);
    }

    let tempPath = replaceExtension(path, extension);
    const newPath = tempPath;
    if (newPath === path) {
      if (acodec === "copy") {
        this.toScreen(`Not converting audio ${originalPath}; file is already in target format ${targetFormat}`);
        return [[], information];
      }
      originalPath = prependExtension(path, "orig");
      tempPath = prependExtension(path, "temp");
    }
    if (this.noPostOverwrites && await pathExists(newPath) && await pathExists(originalPath)) {
      this.toScreen(`Post-process file ${newPath} exists, skipping`);
      return [[], information];
    }

    this.toScreen(`Destination: ${newPath}`);
    await this.runFfmpegAudio(path, tempPath, acodec, moreOpts);
    await rename(path, originalPath);
    await rename(tempPath, newPath);
    information.filepath = newPath;
    information.ext = extension;

    if (typeof information.filetime === "number") {
      await this.tryUtime(newPath, Date.now() / 1000, information.filetime, "Cannot update utime of audio file");
    }

    return [[originalPath], information];
  }
}

export class FFmpegVideoConvertorPP extends FFmpegPostProcessor {
  static readonly SUPPORTED_EXTS = VIDEO_CONVERT_EXTS;
  static readonly FORMAT_RE = createMappingRe(VIDEO_CONVERT_EXTS);
  protected readonly action: string = "converting";
  protected readonly mapping: string | null;

  constructor(downloader: ConstructorParameters<typeof FFmpegPostProcessor>[0] = null, preferedformat: string | null = null) {
    super(downloader);
    this.mapping = preferedformat;
  }

  protected options(targetExt: string): string[] {
    const opts = [...FFmpegPostProcessor.streamCopyOpts(false)];
    if (targetExt === "avi") {
      opts.push("-c:v", "libxvid", "-vtag", "XVID");
    }
    return opts;
  }

  override async run(info: PostProcessorInfo): Promise<[string[], PostProcessorInfo]> {
    const filename = requireStringInfo(info, "filepath", this.ppKey());
    const sourceExt = requireStringInfo(info, "ext", this.ppKey()).toLowerCase();
    const [targetExt, skipMsg] = resolveMapping(sourceExt, this.mapping);
    if (skipMsg || !targetExt) {
      this.toScreen(`Not ${this.action} media file "${filename}"; ${skipMsg ?? "no target format configured"}`);
      return [[], info];
    }

    const outpath = replaceExtension(filename, targetExt);
    this.toScreen(`${titleCase(this.action)} video from ${sourceExt} to ${targetExt}; Destination: ${outpath}`);
    await this.runFfmpeg(filename, outpath, this.options(targetExt));

    info.filepath = outpath;
    info.format = targetExt;
    info.ext = targetExt;
    return [[filename], info];
  }
}

export class FFmpegVideoRemuxerPP extends FFmpegVideoConvertorPP {
  protected override readonly action = "remuxing";

  protected override options(_targetExt: string): string[] {
    return [...FFmpegPostProcessor.streamCopyOpts()];
  }
}

export class FFmpegEmbedSubtitlePP extends FFmpegPostProcessor {
  static readonly SUPPORTED_EXTS = ["mp4", "mov", "m4a", "webm", "mkv", "mka"] as const;
  private readonly alreadyHaveSubtitle: boolean;

  constructor(downloader: ConstructorParameters<typeof FFmpegPostProcessor>[0] = null, already_have_subtitle = false) {
    super(downloader);
    this.alreadyHaveSubtitle = already_have_subtitle;
  }

  override async run(info: PostProcessorInfo): Promise<[string[], PostProcessorInfo]> {
    const ext = requireStringInfo(info, "ext", this.ppKey());
    if (!FFmpegEmbedSubtitlePP.SUPPORTED_EXTS.includes(ext as typeof FFmpegEmbedSubtitlePP.SUPPORTED_EXTS[number])) {
      this.toScreen(`Subtitles can only be embedded in ${FFmpegEmbedSubtitlePP.SUPPORTED_EXTS.join(", ")} files`);
      return [[], info];
    }
    const subtitles = recordOrNull(info.requested_subtitles);
    if (!subtitles) {
      this.toScreen("There aren't any subtitles to embed");
      return [[], info];
    }
    const filename = requireStringInfo(info, "filepath", this.ppKey());
    const subLangs: string[] = [];
    const subNames: Array<string | null> = [];
    const subFilenames: string[] = [];
    let webmVttWarn = false;
    let mp4AssWarn = false;

    for (const [lang, subInfoUnknown] of Object.entries(subtitles)) {
      const subInfo = recordOrNull(subInfoUnknown);
      const subPath = typeof subInfo?.filepath === "string" ? subInfo.filepath : "";
      if (!subInfo || !subPath || !await pathExists(subPath)) {
        this.reportWarning(`Skipping embedding ${lang} subtitle because the file is missing`);
        continue;
      }
      const subExt = typeof subInfo.ext === "string" ? subInfo.ext : "";
      if (subExt === "json") {
        this.reportWarning("JSON subtitles cannot be embedded");
      } else if (ext !== "webm" || subExt === "vtt") {
        subLangs.push(lang);
        subNames.push(typeof subInfo.name === "string" ? subInfo.name : null);
        subFilenames.push(subPath);
      } else if (!webmVttWarn) {
        webmVttWarn = true;
        this.reportWarning("Only WebVTT subtitles can be embedded in webm files");
      }
      if (!mp4AssWarn && ext === "mp4" && subExt === "ass") {
        mp4AssWarn = true;
        this.reportWarning("ASS subtitles cannot be properly embedded in mp4 files; expect issues");
      }
    }

    if (!subLangs.length) {
      return [[], info];
    }

    const inputFiles = [filename, ...subFilenames];
    const opts = [
      ...FFmpegPostProcessor.streamCopyOpts(true, { ext }),
      "-map",
      "-0:s",
    ];
    for (let index = 0; index < subLangs.length; index += 1) {
      const lang = subLangs[index] ?? "";
      const name = subNames[index];
      opts.push("-map", `${index + 1}:0`);
      opts.push(`-metadata:s:s:${index}`, `language=${normalizeFfmpegLanguage(lang)}`);
      if (name) {
        opts.push(`-metadata:s:s:${index}`, `handler_name=${name}`, `-metadata:s:s:${index}`, `title=${name}`);
      }
    }

    const tempFilename = prependExtension(filename, "temp");
    this.toScreen(`Embedding subtitles in "${filename}"`);
    await this.runFfmpegMultipleFiles(inputFiles, tempFilename, opts);
    await rename(tempFilename, filename);

    return [this.alreadyHaveSubtitle ? [] : subFilenames, info];
  }
}

export class FFmpegMetadataPP extends FFmpegPostProcessor {
  private readonly addMetadata: boolean;
  private readonly addChapters: boolean;
  private readonly addInfoJson: boolean | string;

  constructor(
    downloader: ConstructorParameters<typeof FFmpegPostProcessor>[0] = null,
    add_metadata = true,
    add_chapters = true,
    add_infojson: boolean | string = "if_exists",
  ) {
    super(downloader);
    this.addMetadata = add_metadata;
    this.addChapters = add_chapters;
    this.addInfoJson = add_infojson;
  }

  private options(targetExt: string): string[] {
    const audioOnly = targetExt === "m4a";
    return audioOnly
      ? [...FFmpegPostProcessor.streamCopyOpts(false), "-vn", "-acodec", "copy"]
      : [...FFmpegPostProcessor.streamCopyOpts(true)];
  }

  override async run(info: PostProcessorInfo): Promise<[string[], PostProcessorInfo]> {
    await this.fixupChapters(info);
    const filename = requireStringInfo(info, "filepath", this.ppKey());
    let metadataFilename: string | null = null;
    const filesToDelete: string[] = [];
    const options: string[] = [];

    const chapters = Array.isArray(info.chapters) ? info.chapters.filter(isRecord) : [];
    if (this.addChapters && chapters.length) {
      metadataFilename = replaceExtension(filename, "meta");
      options.push(...await this.getChapterOpts(chapters, metadataFilename));
      filesToDelete.push(metadataFilename);
    }
    if (this.addMetadata) {
      options.push(...this.getMetadataOpts(info));
    }
    if (this.addInfoJson) {
      const ext = typeof info.ext === "string" ? info.ext : "";
      if (["mkv", "mka"].includes(ext)) {
        const infojsonFilename = typeof info.infojson_filename === "string" ? info.infojson_filename : null;
        const infoJson = await this.getInfoJsonOpts(info, infojsonFilename);
        options.push(...infoJson.options);
        if (infoJson.fileToDelete) {
          filesToDelete.push(infoJson.fileToDelete);
        }
      } else if (this.addInfoJson === true) {
        this.toScreen("The info-json can only be attached to mkv/mka files");
      }
    }

    if (!options.length) {
      this.toScreen("There isn't any metadata to add");
      return [[], info];
    }

    const tempFilename = prependExtension(filename, "temp");
    this.toScreen(`Adding metadata to "${filename}"`);
    const inputPathOpts: Array<[string, readonly string[]]> = [[filename, []]];
    if (metadataFilename) {
      inputPathOpts.push([metadataFilename, []]);
    }
    await this.realRunFfmpeg(inputPathOpts, [[tempFilename, [...this.options(requireStringInfo(info, "ext", this.ppKey())), ...options]]]);
    await this.deleteDownloadedFiles(...filesToDelete);
    await rename(tempFilename, filename);
    return [[], info];
  }

  private async getChapterOpts(chapters: Array<Record<string, unknown>>, metadataFilename: string): Promise<string[]> {
    let content = ";FFMETADATA1\n";
    for (const chapter of chapters) {
      const startTime = typeof chapter.start_time === "number" ? chapter.start_time : 0;
      const endTime = typeof chapter.end_time === "number" ? chapter.end_time : startTime;
      content += "[CHAPTER]\nTIMEBASE=1/1000\n";
      content += `START=${Math.trunc(startTime * 1000)}\n`;
      content += `END=${Math.trunc(endTime * 1000)}\n`;
      if (typeof chapter.title === "string" && chapter.title) {
        content += `title=${ffmpegMetadataEscape(chapter.title)}\n`;
      }
    }
    await Bun.write(metadataFilename, content);
    return ["-map_metadata", "1"];
  }

  private getMetadataOpts(info: PostProcessorInfo): string[] {
    const commonMetadata: Record<string, string> = {};
    const metadata: Record<string, Record<string, string>> = { common: commonMetadata };
    const add = (metaList: string | readonly string[], infoList: string | readonly string[] | null = null): void => {
      const names = toStringArray(metaList);
      const keys = [`meta_${names[0] ?? ""}`, ...toStringArray(infoList ?? metaList)];
      const found = keys.map((key) => info[key]).find((value) => value !== undefined && value !== null);
      const value = metadataValue(found);
      if (value !== null) {
        for (const name of names) {
          commonMetadata[name] = value;
        }
      }
    };

    add("title", ["track", "title"]);
    add("date", "upload_date");
    add(["description", "synopsis"], "description");
    add(["purl", "comment"], "webpage_url");
    add("track", "track_number");
    add("artist", ["artist", "artists", "creator", "creators", "uploader", "uploader_id"]);
    add("composer", ["composer", "composers"]);
    add("genre", ["genre", "genres", "categories", "tags"]);
    add("album", ["album", "series"]);
    add("album_artist", ["album_artist", "album_artists"]);
    add("disc", "disc_number");
    add("show", "series");
    add("season_number");
    add("episode_id", ["episode", "episode_id"]);
    add("episode_sort", "episode_number");

    const metaPrefix = "meta";
    const metaRegex = new RegExp(`^${RegExp.escape(metaPrefix)}(?<index>\\d+)?_(?<key>.+)$`);
    for (const [key, rawValue] of Object.entries(info)) {
      const match = metaRegex.exec(key);
      const value = metadataValue(rawValue);
      if (!match?.groups || value === null) {
        continue;
      }
      const index = match.groups.index ?? "common";
      metadata[index] ??= {};
      metadata[index]![match.groups.key ?? ""] = value;
    }

    const opts = ["-write_id3v1", "1"];
    for (const [name, value] of Object.entries(commonMetadata)) {
      opts.push("-metadata", `${name}=${value}`);
    }

    const formats = Array.isArray(info.requested_formats) ? info.requested_formats.filter(isRecord) : [info];
    let streamIndex = 0;
    for (const format of formats) {
      const streamCount = format.vcodec !== "none" && format.acodec !== "none" ? 2 : 1;
      const language = typeof format.language === "string" ? format.language : null;
      for (let index = streamIndex; index < streamIndex + streamCount; index += 1) {
        metadata[String(index)] ??= {};
        if (language) {
          metadata[String(index)]!.language ??= normalizeFfmpegLanguage(language);
        }
        for (const [name, value] of Object.entries(metadata[String(index)]!)) {
          opts.push(`-metadata:s:${index}`, `${name}=${value}`);
        }
      }
      streamIndex += streamCount;
    }
    return opts;
  }

  private async getInfoJsonOpts(info: PostProcessorInfo, infoFilename: string | null): Promise<{ options: string[]; fileToDelete?: string }> {
    let fileToDelete: string | undefined;
    if (!infoFilename || !await pathExists(infoFilename)) {
      if (this.addInfoJson !== true) {
        return { options: [] };
      }
      throw new NotImplementedError("infojson embedding without a prepared infojson file");
    }
    const [oldStream, newStreamInitial] = await this.getStreamNumber(requireStringInfo(info, "filepath", this.ppKey()), ["tags", "mimetype"], "application/json");
    let newStream = newStreamInitial;
    const opts: string[] = [];
    if (oldStream !== null) {
      opts.push("-map", `-0:${oldStream}`);
      newStream -= 1;
    }
    opts.push(
      "-attach",
      FFmpegPostProcessor.ffmpegFilenameArgument(infoFilename),
      `-metadata:s:${newStream}`,
      "mimetype=application/json",
      `-metadata:s:${newStream}`,
      "filename=info.json",
    );
    return { options: opts, fileToDelete };
  }
}

export class FFmpegMergerPP extends FFmpegPostProcessor {
  static readonly SUPPORTED_EXTS = MEDIA_EXTENSIONS.commonVideo;

  override async run(info: PostProcessorInfo): Promise<[string[], PostProcessorInfo]> {
    const filename = requireStringInfo(info, "filepath", this.ppKey());
    const requestedFormats = requireRecordArray(info.requested_formats, "requested_formats", this.ppKey());
    const filesToMerge = requireStringArray(info.__files_to_merge, "__files_to_merge", this.ppKey());
    const tempFilename = prependExtension(filename, "temp");
    const args = ["-c", "copy"];
    let audioStreams = 0;
    for (const [index, format] of requestedFormats.entries()) {
      if (format.acodec !== "none") {
        args.push("-map", `${index}:a:0`);
        const protocol = typeof format.protocol === "string" ? format.protocol : "";
        const formatPath = typeof format.filepath === "string" ? format.filepath : null;
        const aacFixup = protocol.startsWith("m3u8") && formatPath && await this.getAudioCodec(formatPath) === "aac";
        if (aacFixup) {
          args.push(`-bsf:a:${audioStreams}`, "aac_adtstoasc");
        }
        audioStreams += 1;
      }
      if (format.vcodec !== "none") {
        args.push("-map", `${index}:v:0`);
      }
    }
    this.toScreen(`Merging formats into "${filename}"`);
    await this.runFfmpegMultipleFiles(filesToMerge, tempFilename, args);
    await rename(tempFilename, filename);
    return [filesToMerge, info];
  }

  canMerge(): boolean {
    return true;
  }
}

export class FFmpegFixupPostProcessor extends FFmpegPostProcessor {
  protected async fixup(message: string, filename: string, options: Iterable<string>): Promise<void> {
    const tempFilename = prependExtension(filename, "temp");
    this.toScreen(`${message} of "${filename}"`);
    await this.runFfmpeg(filename, tempFilename, [...options]);
    await rename(tempFilename, filename);
  }
}

export class FFmpegFixupStretchedPP extends FFmpegFixupPostProcessor {
  override async run(info: PostProcessorInfo): Promise<[string[], PostProcessorInfo]> {
    const stretchedRatio = typeof info.stretched_ratio === "number" ? info.stretched_ratio : null;
    if (stretchedRatio !== null && stretchedRatio !== 1) {
      await this.fixup("Fixing aspect ratio", requireStringInfo(info, "filepath", this.ppKey()), [
        ...FFmpegPostProcessor.streamCopyOpts(),
        "-aspect",
        stretchedRatio.toFixed(6),
      ]);
    }
    return [[], info];
  }
}

export class FFmpegFixupM4aPP extends FFmpegFixupPostProcessor {
  override async run(info: PostProcessorInfo): Promise<[string[], PostProcessorInfo]> {
    if (info.container === "m4a_dash") {
      await this.fixup("Correcting container", requireStringInfo(info, "filepath", this.ppKey()), [
        ...FFmpegPostProcessor.streamCopyOpts(),
        "-f",
        "mp4",
      ]);
    }
    return [[], info];
  }
}

export class FFmpegFixupM3u8PP extends FFmpegFixupPostProcessor {
  override async run(info: PostProcessorInfo): Promise<[string[], PostProcessorInfo]> {
    const ext = typeof info.ext === "string" ? info.ext : "";
    const protocol = typeof info.protocol === "string" ? info.protocol : "";
    if (!["mp4", "m4a"].includes(ext) || !protocol.startsWith("m3u8")) {
      return [[], info];
    }
    const filename = requireStringInfo(info, "filepath", this.ppKey());
    let needsFixup = true;
    try {
      needsFixup = getPathString(await this.getMetadataObject(filename), ["format", "format_name"])?.toLowerCase() === "mpegts";
    } catch (error) {
      this.reportWarning(`Unable to extract metadata: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (needsFixup) {
      const args = ["-f", "mp4"];
      if (await this.getAudioCodec(filename) === "aac") {
        args.push("-bsf:a", "aac_adtstoasc");
      }
      await this.fixup("Fixing MPEG-TS in MP4 container", filename, [
        ...FFmpegPostProcessor.streamCopyOpts(),
        ...args,
      ]);
    }
    return [[], info];
  }
}

export class FFmpegFixupTimestampPP extends FFmpegFixupPostProcessor {
  private readonly trim: string;

  constructor(downloader: ConstructorParameters<typeof FFmpegPostProcessor>[0] = null, trim = 0.001) {
    super(downloader);
    this.trim = String(trim);
  }

  override async run(info: PostProcessorInfo): Promise<[string[], PostProcessorInfo]> {
    const opts = this.features.setts
      ? ["-c", "copy", "-bsf", "setts=ts=TS-STARTPTS"]
      : ["-vf", "setpts=PTS-STARTPTS"];
    if (!this.features.setts) {
      this.reportWarning("A re-encode is needed to fix timestamps in older versions of ffmpeg. Please install ffmpeg 4.4 or later to fixup without re-encoding");
    }
    await this.fixup("Fixing frame timestamp", requireStringInfo(info, "filepath", this.ppKey()), [
      ...opts,
      ...FFmpegPostProcessor.streamCopyOpts(false),
      "-ss",
      this.trim,
    ]);
    return [[], info];
  }
}

export class FFmpegCopyStreamPP extends FFmpegFixupPostProcessor {
  protected readonly message: string = "Copying stream";

  override async run(info: PostProcessorInfo): Promise<[string[], PostProcessorInfo]> {
    await this.fixup(this.message, requireStringInfo(info, "filepath", this.ppKey()), FFmpegPostProcessor.streamCopyOpts());
    return [[], info];
  }
}

export class FFmpegFixupDurationPP extends FFmpegCopyStreamPP {
  protected override readonly message = "Fixing video duration";
}

export class FFmpegFixupDuplicateMoovPP extends FFmpegCopyStreamPP {
  protected override readonly message = "Fixing duplicate MOOV atoms";
}

export class FFmpegSubtitlesConvertorPP extends FFmpegPostProcessor {
  static readonly SUPPORTED_EXTS = ["srt", "vtt", "ass", "lrc"] as const;
  private readonly format: string | null;

  constructor(downloader: ConstructorParameters<typeof FFmpegPostProcessor>[0] = null, format: string | null = null) {
    super(downloader);
    this.format = format;
  }

  override async run(info: PostProcessorInfo): Promise<[string[], PostProcessorInfo]> {
    const subs = recordOrNull(info.requested_subtitles);
    const newExt = this.format;
    if (!newExt) {
      throw new PostProcessingError("FFmpegSubtitlesConvertorPP requires a target subtitle format");
    }
    const newFormat = newExt === "vtt" ? "webvtt" : newExt;
    if (!subs) {
      this.toScreen("There aren't any subtitles to convert");
      return [[], info];
    }

    this.toScreen("Converting subtitles");
    const subFilenames: string[] = [];
    const filesToMove = ensureRecord(info, "__files_to_move");
    for (const [lang, subUnknown] of Object.entries(subs)) {
      const sub = recordOrNull(subUnknown);
      const oldFileInitial = typeof sub?.filepath === "string" ? sub.filepath : "";
      if (!sub || !oldFileInitial || !await pathExists(oldFileInitial)) {
        this.reportWarning(`Skipping embedding ${lang} subtitle because the file is missing`);
        continue;
      }
      const ext = typeof sub.ext === "string" ? sub.ext : "";
      if (ext === newExt) {
        this.toScreen(`Subtitle file for ${newExt} is already in the requested format`);
        continue;
      }
      if (ext === "json") {
        this.toScreen("You have requested to convert json subtitles into another format, which is currently not possible");
        continue;
      }
      subFilenames.push(oldFileInitial);
      const newFile = replaceExtension(oldFileInitial, newExt);
      let oldFile = oldFileInitial;
      if (["dfxp", "ttml", "tt"].includes(ext)) {
        this.reportWarning("You have requested to convert dfxp (TTML) subtitles into another format, which results in style information loss");
        const srtFile = replaceExtension(oldFileInitial, "srt");
        const srtData = dfxp2srt(await Bun.file(oldFileInitial).bytes());
        await Bun.write(srtFile, srtData);
        subs[lang] = {
          ext: "srt",
          data: srtData,
          filepath: srtFile,
        };
        if (newExt === "srt") {
          const oldMoveTarget = typeof filesToMove[oldFileInitial] === "string" ? filesToMove[oldFileInitial] : oldFileInitial;
          filesToMove[srtFile] = replaceExtension(oldMoveTarget, "srt");
          continue;
        }
        subFilenames.push(srtFile);
        oldFile = srtFile;
      }
      await this.runFfmpeg(oldFile, newFile, ["-f", newFormat]);
      subs[lang] = {
        ext: newExt,
        data: await Bun.file(newFile).text(),
        filepath: newFile,
      };

      // Logic note: Python assumes __files_to_move exists; ytdlb creates it when needed to preserve subtitle move bookkeeping.
      const oldMoveTarget = typeof filesToMove[oldFileInitial] === "string" ? filesToMove[oldFileInitial] : oldFileInitial;
      filesToMove[newFile] = replaceExtension(oldMoveTarget, newExt);
    }
    return [subFilenames, info];
  }
}

export class FFmpegSplitChaptersPP extends FFmpegPostProcessor {
  private readonly forceKeyframesEnabled: boolean;

  constructor(downloader: ConstructorParameters<typeof FFmpegPostProcessor>[0] = null, force_keyframes = false) {
    super(downloader);
    this.forceKeyframesEnabled = force_keyframes;
  }

  private prepareFilename(number: number, chapter: Record<string, unknown>, info: PostProcessorInfo): string {
    return preparePostprocessorFilename(this.downloader, {
      ...info,
      section_number: number,
      section_title: chapter.title,
      section_start: chapter.start_time,
      section_end: chapter.end_time,
    }, "chapter");
  }

  private async ffmpegArgsForChapter(number: number, chapter: Record<string, unknown>, info: PostProcessorInfo): Promise<[string, string[]]> {
    const startTime = typeof chapter.start_time === "number" ? chapter.start_time : null;
    const endTime = typeof chapter.end_time === "number" ? chapter.end_time : null;
    if (startTime === null || endTime === null) {
      throw new PostProcessingError(`Chapter ${number} is missing start_time or end_time`);
    }
    const destination = this.prepareFilename(number, chapter, info);
    await mkdir(dirname(destination), { recursive: true });
    chapter.filepath = destination;
    this.toScreen(`Chapter ${String(number).padStart(3, "0")}; Destination: ${destination}`);
    return [destination, ["-ss", String(startTime), "-t", String(endTime - startTime)]];
  }

  override async run(info: PostProcessorInfo): Promise<[string[], PostProcessorInfo]> {
    await this.fixupChapters(info);
    const chapters = Array.isArray(info.chapters) ? info.chapters.filter(isRecord) : [];
    if (!chapters.length) {
      this.toScreen("Chapter information is unavailable");
      return [[], info];
    }

    const filepath = requireStringInfo(info, "filepath", this.ppKey());
    let inputFile = filepath;
    if (this.forceKeyframesEnabled && chapters.length > 1) {
      inputFile = await this.forceKeyframes(filepath, chapters.map((chapter) => Number(chapter.start_time)).filter(Number.isFinite));
    }
    this.toScreen(`Splitting video by chapters; ${chapters.length} chapters found`);
    for (const [index, chapter] of chapters.entries()) {
      const [destination, opts] = await this.ffmpegArgsForChapter(index + 1, chapter, info);
      await this.realRunFfmpeg([[inputFile, opts]], [[destination, [...FFmpegPostProcessor.streamCopyOpts()]]]);
    }
    if (inputFile !== filepath) {
      await this.deleteDownloadedFiles(inputFile);
    }
    return [[], info];
  }
}

export class FFmpegThumbnailsConvertorPP extends FFmpegPostProcessor {
  static readonly SUPPORTED_EXTS = ["jpg", "png", "webp"] as const;
  static readonly FORMAT_RE = createMappingRe(FFmpegThumbnailsConvertorPP.SUPPORTED_EXTS);
  private readonly mapping: string | null;

  constructor(downloader: ConstructorParameters<typeof FFmpegPostProcessor>[0] = null, format: string | null = null) {
    super(downloader);
    this.mapping = format;
  }

  static async isWebp(path: string): Promise<boolean> {
    return await detectImageType(path) === "webp";
  }

  async fixupWebp(info: PostProcessorInfo, index: number): Promise<void> {
    const thumbnails = Array.isArray(info.thumbnails) ? info.thumbnails : [];
    const thumbnail = recordOrNull(thumbnails[index]);
    const thumbnailFilename = typeof thumbnail?.filepath === "string" ? thumbnail.filepath : null;
    if (!thumbnail || !thumbnailFilename) {
      return;
    }
    const thumbnailExt = extname(thumbnailFilename).toLowerCase();
    if (thumbnailExt && thumbnailExt !== ".webp" && await detectImageType(thumbnailFilename) === "webp") {
      this.toScreen(`Correcting thumbnail "${thumbnailFilename}" extension to webp`);
      const webpFilename = replaceExtension(thumbnailFilename, "webp");
      await rename(thumbnailFilename, webpFilename);
      thumbnail.filepath = webpFilename;
      const filesToMove = ensureRecord(info, "__files_to_move");
      const oldTarget = typeof filesToMove[thumbnailFilename] === "string" ? filesToMove[thumbnailFilename] : thumbnailFilename;
      delete filesToMove[thumbnailFilename];
      filesToMove[webpFilename] = replaceExtension(oldTarget, "webp");
    }
  }

  private options(targetExt: string): string[] {
    return targetExt === "jpg" ? ["-update", "1", "-bsf:v", "mjpeg2jpeg"] : ["-update", "1"];
  }

  async convertThumbnail(thumbnailFilename: string, targetExt: string): Promise<string> {
    const convertedFilename = replaceExtension(thumbnailFilename, targetExt);
    this.toScreen(`Converting thumbnail "${thumbnailFilename}" to ${targetExt}`);
    const sourceExt = extname(thumbnailFilename).toLowerCase();
    await this.realRunFfmpeg(
      [[thumbnailFilename, sourceExt === ".gif" ? [] : ["-f", "image2", "-pattern_type", "none"]]],
      [[convertedFilename, this.options(targetExt)]],
    );
    return convertedFilename;
  }

  override async run(info: PostProcessorInfo): Promise<[string[], PostProcessorInfo]> {
    const filesToDelete: string[] = [];
    let hasThumbnail = false;
    const thumbnails = Array.isArray(info.thumbnails) ? info.thumbnails : [];
    const filesToMove = ensureRecord(info, "__files_to_move");

    for (const [index, thumbnailUnknown] of thumbnails.entries()) {
      const thumbnail = recordOrNull(thumbnailUnknown);
      const originalThumbnailBeforeFixup = typeof thumbnail?.filepath === "string" ? thumbnail.filepath : null;
      if (!thumbnail || !originalThumbnailBeforeFixup) {
        continue;
      }
      hasThumbnail = true;
      await this.fixupWebp(info, index);
      const originalThumbnail = typeof thumbnail.filepath === "string" ? thumbnail.filepath : originalThumbnailBeforeFixup;
      let thumbnailExt = extname(originalThumbnail).slice(1).toLowerCase();
      if (thumbnailExt === "jpeg") {
        thumbnailExt = "jpg";
      }
      const [targetExt, skipMsg] = resolveMapping(thumbnailExt, this.mapping);
      if (skipMsg || !targetExt) {
        this.toScreen(`Not converting thumbnail "${originalThumbnail}"; ${skipMsg ?? "no target format configured"}`);
        continue;
      }
      const converted = await this.convertThumbnail(originalThumbnail, targetExt);
      thumbnail.filepath = converted;
      filesToDelete.push(originalThumbnail);
      const oldTarget = typeof filesToMove[originalThumbnail] === "string" ? filesToMove[originalThumbnail] : originalThumbnail;
      filesToMove[converted] = replaceExtension(oldTarget, targetExt);
    }

    if (!hasThumbnail) {
      this.toScreen("There aren't any thumbnails to convert");
    }
    return [filesToDelete, info];
  }
}

export class FFmpegConcatPP extends FFmpegPostProcessor {
  private readonly onlyMultiVideo: boolean;

  constructor(downloader: ConstructorParameters<typeof FFmpegPostProcessor>[0] = null, only_multi_video = false) {
    super(downloader);
    this.onlyMultiVideo = only_multi_video;
  }

  private async getCodecs(file: string): Promise<string[]> {
    const metadata = await this.getMetadataObject(file);
    const codecs = (metadata.streams ?? [])
      .map((stream) => stream.codec_name)
      .filter((codec) => z.string().safeParse(codec).success) as string[];
    this.writeDebug(`Codecs = ${codecs.join(", ")}`);
    return codecs;
  }

  async concatFilesForPostprocessor(inputFiles: readonly string[], outFile: string): Promise<string[]> {
    if (inputFiles.length === 1) {
      if (await canonicalPath(inputFiles[0]!) !== await canonicalPath(outFile)) {
        this.toScreen(`Moving "${inputFiles[0]}" to "${outFile}"`);
      }
      await rename(inputFiles[0]!, outFile);
      return [];
    }

    const codecSets = await Promise.all(inputFiles.map((file) => this.getCodecs(file)));
    if (new Set(codecSets.map((codecs) => JSON.stringify(codecs))).size > 1) {
      throw new PostProcessingError("The files have different streams/codecs and cannot be concatenated. Either select different formats or --recode-video them to a common format");
    }

    this.toScreen(`Concatenating ${inputFiles.length} files; Destination: ${outFile}`);
    await this.concatFiles(inputFiles, outFile);
    return [...inputFiles];
  }

  override async run(info: PostProcessorInfo): Promise<[string[], PostProcessorInfo]> {
    const entries = Array.isArray(info.entries) ? info.entries.filter(isRecord) : [];
    if (!entries.length || (this.onlyMultiVideo && info._type !== "multi_video")) {
      return [[], info];
    }
    if (entries.some((entry) => {
      const downloads = Array.isArray(entry.requested_downloads) ? entry.requested_downloads : [];
      return downloads.length > 1;
    })) {
      throw new PostProcessingError("Concatenation is not supported when downloading multiple separate formats");
    }

    const requestedDownloads = entries.map((entry) => {
      const downloads = Array.isArray(entry.requested_downloads) ? entry.requested_downloads.filter(isRecord) : [];
      return downloads[0] ?? null;
    });
    const inFiles = requestedDownloads
      .map((download) => download?.filepath)
      .filter((filepath) => z.string().safeParse(filepath).success) as string[];
    if (inFiles.length < entries.length) {
      throw new PostProcessingError("Aborting concatenation because some downloads failed");
    }

    const exts = requestedDownloads
      .map((download, index) => typeof download?.ext === "string" ? download.ext : typeof entries[index]?.ext === "string" ? entries[index]?.ext : null)
      .filter((ext) => z.string().safeParse(ext).success) as string[];
    const outExt = exts.length && new Set(exts).size === 1 ? exts[0]! : "mkv";
    const outputInfo: PostProcessorInfo = { ...info, ext: outExt };
    const outFile = preparePostprocessorFilename(this.downloader, outputInfo, "pl_video");
    const filesToDelete = await this.concatFilesForPostprocessor(inFiles, outFile);

    info.requested_downloads = [{
      filepath: outFile,
      ext: outExt,
    }];
    return [filesToDelete, info];
  }
}

async function runShellCommand(cmd: readonly string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const output = await $`${[...cmd]}`.nothrow().quiet();
  return {
    stdout: output.stdout.toString(),
    stderr: output.stderr.toString(),
    exitCode: output.exitCode,
  };
}

interface FfprobeMetadata {
  format?: Record<string, unknown>;
  streams?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

function requireStringInfo(info: PostProcessorInfo, key: string, ppName: string): string {
  const value = info[key];
  if (typeof value !== "string" || !value) {
    throw new PostProcessingError(`${ppName} requires info.${key}`);
  }
  return value;
}

function requireStringArray(value: unknown, key: string, ppName: string): string[] {
  const parsed = StringArraySchema.safeParse(value);
  if (!parsed.success) {
    throw new PostProcessingError(`${ppName} requires info.${key} to be a string array`);
  }
  return parsed.data;
}

function requireRecordArray(value: unknown, key: string, ppName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new PostProcessingError(`${ppName} requires info.${key} to be an object array`);
  }
  return value;
}

function ensureRecord(info: PostProcessorInfo, key: string): Record<string, unknown> {
  const value = info[key];
  if (isRecord(value)) {
    return value;
  }
  const created: Record<string, unknown> = {};
  info[key] = created;
  return created;
}

function getPathString(value: unknown, path: readonly string[]): string | null {
  const found = getPathValue(value, path);
  return typeof found === "string" ? found : null;
}

function getPathValue(value: unknown, path: readonly string[]): unknown | null {
  let current = value;
  for (const key of path) {
    if (!isRecord(current)) {
      return null;
    }
    current = current[key];
  }
  return current ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return RecordSchema.safeParse(value).success;
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

function titleCase(value: string): string {
  return value ? `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}` : value;
}

function toStringArray(value: string | readonly string[]): string[] {
  return typeof value === "string" ? [value] : [...value];
}

function metadataValue(value: unknown): string | null {
  if (value === "" || value === null || value === undefined) {
    return null;
  }
  const values = Array.isArray(value) ? value : [value];
  return values.map((item) => String(item)).join(", ").replaceAll("\0", "");
}

function ffmpegMetadataEscape(value: string): string {
  return value.replaceAll(/([\\=;#\n])/g, "\\$1");
}

function normalizeFfmpegLanguage(language: string): string {
  if (/^[a-z]{2,3}$/i.test(language) || language === "und") {
    return language;
  }
  throw new NotImplementedError(`ISO639 language normalization for ${language}`);
}

function requireAudioCodec(codec: string): readonly [string, string | null, readonly string[]] {
  const spec = ACODECS[codec];
  if (!spec) {
    throw new PostProcessingError(`Unknown audio codec mapping: ${codec}`);
  }
  return spec;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function canonicalPath(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return path;
  }
}

function preparePostprocessorFilename(downloader: unknown, info: PostProcessorInfo, template: string): string {
  if (isRecord(downloader) && typeof downloader.prepareFilename === "function") {
    const prepared: unknown = downloader.prepareFilename(info, template);
    if (typeof prepared === "string" && prepared) {
      return prepared;
    }
  }
  throw new PostProcessingError(`FFmpegConcatPP requires downloader.prepareFilename for ${template}`);
}
