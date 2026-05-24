// Source: yt_dlp/dependencies/__init__.py
// Port note: Mediabunny is the Bun/JS replacement for media metadata reads and tag-writing rewrites.

import { registerMediabunnyServer } from "@mediabunny/server";
import {
  ADTS,
  ALL_FORMATS,
  AdtsOutputFormat,
  Conversion,
  FilePathSource,
  FilePathTarget,
  FlacOutputFormat,
  Input,
  MovOutputFormat,
  MkvOutputFormat,
  Mp3OutputFormat,
  Mp4OutputFormat,
  OggOutputFormat,
  Output,
  type OutputFormat,
  WavOutputFormat,
  WebMOutputFormat,
  type MetadataTags,
} from "mediabunny";

import { NotImplementedError } from "../errors.ts";

registerMediabunnyServer();

export type { AttachedImage, MetadataTags } from "mediabunny";

export async function readMetadataTags(filepath: string): Promise<MetadataTags> {
  const input = openInput(filepath);
  try {
    return await input.getMetadataTags();
  } finally {
    input.dispose();
  }
}

export async function getDurationFromMetadata(filepath: string): Promise<number | null> {
  const input = openInput(filepath);
  try {
    return await input.getDurationFromMetadata([], { skipLiveWait: true });
  } finally {
    input.dispose();
  }
}

export async function rewriteMetadataTags(
  filepath: string,
  outPath: string,
  ext: string,
  updateTags: MetadataTags | ((inputTags: MetadataTags) => MetadataTags | Promise<MetadataTags>),
): Promise<void> {
  const input = openInput(filepath);
  const output = new Output({
    format: outputFormatForExtension(ext),
    target: new FilePathTarget(outPath),
  });
  try {
    const conversion = await Conversion.init({
      input,
      output,
      tags: updateTags,
      showWarnings: false,
    });
    if (!conversion.isValid) {
      const reasons = conversion.discardedTracks.map(({ reason }) => reason).join(", ");
      throw new Error(`Mediabunny cannot rewrite this media without discarded tracks${reasons ? `: ${reasons}` : ""}`);
    }
    await conversion.execute();
  } finally {
    input.dispose();
  }
}

export function writeTags(): never {
  throw new NotImplementedError("Use rewriteMetadataTags() so Mediabunny can rewrite the media container with new tags");
}

function openInput(filepath: string): Input {
  return new Input({
    source: new FilePathSource(filepath),
    formats: ALL_FORMATS,
  });
}

function outputFormatForExtension(ext: string): OutputFormat {
  switch (ext.toLowerCase()) {
    case "mp3":
      return new Mp3OutputFormat();
    case "mp4":
    case "m4a":
    case "m4v":
      return new Mp4OutputFormat();
    case "mov":
      return new MovOutputFormat();
    case "mkv":
    case "mka":
      return new MkvOutputFormat();
    case "webm":
    case "weba":
      return new WebMOutputFormat();
    case "ogg":
    case "opus":
      return new OggOutputFormat();
    case "flac":
      return new FlacOutputFormat();
    case "wav":
      return new WavOutputFormat();
    case "aac":
      return new AdtsOutputFormat();
    default:
      throw new NotImplementedError(`Mediabunny metadata rewrite is not implemented for .${ext}`);
  }
}
