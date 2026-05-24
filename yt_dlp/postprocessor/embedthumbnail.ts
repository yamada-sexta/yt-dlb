// Source: yt_dlp/postprocessor/embedthumbnail.py
// Port note: Python mutagen/AtomicParsley paths are replaced with ffmpeg paths where supported.

import { rename, stat } from "node:fs/promises";
import { extname } from "node:path";

import { what as detectImageType } from "../compat/imghdr.ts";
import { PostProcessingError } from "../utils/utils.ts";
import { FFmpegPostProcessor, FFmpegThumbnailsConvertorPP } from "./ffmpeg.ts";
import type { PostProcessorInfo } from "./common.ts";

export class EmbedThumbnailPPError extends PostProcessingError {}

export class EmbedThumbnailPP extends FFmpegPostProcessor {
  private readonly alreadyHaveThumbnail: boolean;

  constructor(downloader: ConstructorParameters<typeof FFmpegPostProcessor>[0] = null, already_have_thumbnail = false) {
    super(downloader);
    this.alreadyHaveThumbnail = already_have_thumbnail;
  }

  override async run(info: PostProcessorInfo): Promise<[string[], PostProcessorInfo]> {
    const filename = requireString(info.filepath, "EmbedThumbnailPP requires info.filepath");
    const ext = requireString(info.ext, "EmbedThumbnailPP requires info.ext");
    let tempFilename = `${filename.slice(0, -extname(filename).length)}.temp${extname(filename)}`;

    const thumbnails = Array.isArray(info.thumbnails) ? info.thumbnails.filter(isRecord) : [];
    if (!thumbnails.length) {
      this.toScreen("There aren't any thumbnails to embed");
      return [[], info];
    }
    const thumbnailIndex = findLastThumbnailIndex(thumbnails);
    if (thumbnailIndex === -1) {
      this.toScreen("There are no thumbnails on disk");
      return [[], info];
    }
    let thumbnailFilename = requireString(thumbnails[thumbnailIndex]?.filepath, "thumbnail filepath is missing");
    if (!await pathExists(thumbnailFilename)) {
      this.reportWarning("Skipping embedding the thumbnail because the file is missing.");
      return [[], info];
    }

    const converter = new FFmpegThumbnailsConvertorPP(this.downloader);
    await converter.fixupWebp(info, thumbnailIndex);
    const originalThumbnail = thumbnailFilename = requireString(thumbnails[thumbnailIndex]?.filepath, "thumbnail filepath is missing");

    let thumbnailExt = extname(thumbnailFilename).slice(1).toLowerCase();
    if (!["mkv", "mka"].includes(ext) && !["jpg", "jpeg", "png"].includes(thumbnailExt)) {
      // Logic note: Python prefers PNG for unsupported thumbnails; this keeps that behavior through ffmpeg.
      thumbnailFilename = await converter.convertThumbnail(thumbnailFilename, "png");
      thumbnailExt = "png";
    }

    const mtime = (await stat(filename)).mtimeMs / 1000;
    if (ext === "mp3") {
      this.reportRun("ffmpeg", filename);
      await this.runFfmpegMultipleFiles([filename, thumbnailFilename], tempFilename, [
        "-c", "copy",
        "-map", "0:0",
        "-map", "1:0",
        "-write_id3v1", "1",
        "-id3v2_version", "3",
        "-metadata:s:v", "title=Album cover",
        "-metadata:s:v", "comment=Cover (front)",
      ]);
    } else if (["mkv", "mka"].includes(ext)) {
      const options = [...FFmpegPostProcessor.streamCopyOpts()];
      const mimetype = `image/${thumbnailExt.replace("jpg", "jpeg")}`;
      const [oldStream, newStreamInitial] = await this.getStreamNumber(filename, ["tags", "mimetype"], mimetype);
      let newStream = newStreamInitial;
      if (oldStream !== null) {
        options.push("-map", `-0:${oldStream}`);
        newStream -= 1;
      }
      options.push(
        "-attach", FFmpegPostProcessor.ffmpegFilenameArgument(thumbnailFilename),
        `-metadata:s:${newStream}`, `mimetype=${mimetype}`,
        `-metadata:s:${newStream}`, `filename=cover.${thumbnailExt}`,
      );
      this.reportRun("ffmpeg", filename);
      await this.runFfmpeg(filename, tempFilename, options);
    } else if (["m4a", "mp4", "m4v", "mov"].includes(ext)) {
      const options = [...FFmpegPostProcessor.streamCopyOpts(), "-map", "1"];
      const [oldStream, newStreamInitial] = await this.getStreamNumber(filename, ["disposition", "attached_pic"], "1");
      let newStream = newStreamInitial;
      if (oldStream !== null) {
        options.push("-map", `-0:${oldStream}`);
        newStream -= 1;
      }
      options.push(`-disposition:${newStream}`, "attached_pic");
      this.reportRun("ffmpeg", filename);
      await this.runFfmpegMultipleFiles([filename, thumbnailFilename], tempFilename, options);
    } else if (ext === "flac") {
      this.reportRun("ffmpeg", filename);
      await this.runFfmpegMultipleFiles([filename, thumbnailFilename], tempFilename, [
        ...FFmpegPostProcessor.streamCopyOpts(),
        "-map", "1",
        "-disposition:v", "attached_pic",
      ]);
    } else if (["ogg", "opus"].includes(ext)) {
      const picture = await metadataBlockPicture(thumbnailFilename, thumbnails[thumbnailIndex] ?? {});
      this.reportRun("ffmpeg", filename);
      await this.runFfmpeg(filename, tempFilename, [
        ...FFmpegPostProcessor.streamCopyOpts(),
        "-metadata",
        `METADATA_BLOCK_PICTURE=${picture}`,
      ]);
    } else {
      throw new EmbedThumbnailPPError("Supported filetypes for thumbnail embedding are: mp3, mkv/mka, flac, ogg/opus, m4a/mp4/m4v/mov");
    }

    if (tempFilename !== filename) {
      await rename(tempFilename, filename);
    }
    await this.tryUtime(filename, mtime, mtime);
    const converted = originalThumbnail !== thumbnailFilename;
    await this.deleteDownloadedFiles(
      converted || !this.alreadyHaveThumbnail ? thumbnailFilename : null,
      converted && !this.alreadyHaveThumbnail ? originalThumbnail : null,
    );
    return [[], info];
  }

  private reportRun(exe: string, filename: string): void {
    this.toScreen(`${exe}: Adding thumbnail to "${filename}"`);
  }
}

function findLastThumbnailIndex(thumbnails: Array<Record<string, unknown>>): number {
  for (let index = thumbnails.length - 1; index >= 0; index -= 1) {
    if (typeof thumbnails[index]?.filepath === "string") {
      return index;
    }
  }
  return -1;
}

function requireString(value: unknown, message: string): string {
  if (typeof value !== "string" || !value) {
    throw new PostProcessingError(message);
  }
  return value;
}

async function metadataBlockPicture(thumbnailFilename: string, thumbnail: Record<string, unknown>): Promise<string> {
  const data = await Bun.file(thumbnailFilename).bytes();
  const imageType = await detectImageType(null, data.subarray(0, 12));
  const mimeType = `image/${(imageType ?? extname(thumbnailFilename).slice(1).toLowerCase()).replace("jpg", "jpeg")}`;
  const mimeBytes = new TextEncoder().encode(mimeType);
  const descriptionBytes = new Uint8Array();
  const width = typeof thumbnail.width === "number" ? thumbnail.width : 0;
  const height = typeof thumbnail.height === "number" ? thumbnail.height : 0;
  const chunks = [
    uint32be(3),
    uint32be(mimeBytes.length),
    mimeBytes,
    uint32be(descriptionBytes.length),
    descriptionBytes,
    uint32be(width),
    uint32be(height),
    uint32be(0),
    uint32be(0),
    uint32be(data.length),
    data,
  ];
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return Buffer.from(out).toString("base64");
}

function uint32be(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value);
  return out;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
