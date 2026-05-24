// Source: yt_dlp/postprocessor/ffmpeg.py
// Port note: implements the ffmpeg executable, probing, and command-runner subset needed by ytdlb.

import { $ } from "bun";
import { stat } from "node:fs/promises";

import { PostProcessor, type PostProcessorInfo } from "./common.ts";
import {
  detectExeVersion,
  encodeArgument,
  getExeVersionOutput,
  isOutdatedVersion,
  orderedSet,
  PostProcessingError,
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

  override async run(_information: PostProcessorInfo): Promise<[string[], PostProcessorInfo]> {
    throw new PostProcessingError("FFmpegPostProcessor base run is not implemented directly");
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

async function runShellCommand(cmd: readonly string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const output = await $`${[...cmd]}`.nothrow().quiet();
  return {
    stdout: output.stdout.toString(),
    stderr: output.stderr.toString(),
    exitCode: output.exitCode,
  };
}
