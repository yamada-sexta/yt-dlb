// Source: yt_dlp/postprocessor/movefilesafterdownload.py
// Port note: file moves use Bun-compatible fs promises and copy/unlink fallback across devices.

import { copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import { PostProcessingError } from "../utils/utils.ts";
import { PostProcessor, type PostProcessorInfo } from "./common.ts";

export class MoveFilesAfterDownloadPP extends PostProcessor {
  constructor(downloader: ConstructorParameters<typeof PostProcessor>[0] = null, readonly downloaded = true) {
    super(downloader);
  }

  static override ppKey(): string {
    return "MoveFiles";
  }

  override async run(info: PostProcessorInfo): Promise<[string[], PostProcessorInfo]> {
    if (typeof info.filepath !== "string") {
      throw new PostProcessingError("MoveFilesAfterDownloadPP requires info.filepath");
    }
    const finalDir = typeof info.__finaldir === "string" ? info.__finaldir : dirname(info.filepath);
    const finalPath = join(finalDir, basename(info.filepath));
    const filesToMove = filesToMoveRecord(info.__files_to_move);
    if (this.downloaded) {
      filesToMove[info.filepath] = finalPath;
    }
    for (const [oldFile, requestedNewFile] of Object.entries(filesToMove)) {
      const newFile = requestedNewFile || join(finalDir, basename(oldFile));
      if (resolve(oldFile) === resolve(newFile)) {
        continue;
      }
      if (!await exists(oldFile)) {
        this.reportWarning(`File "${oldFile}" cannot be found`);
        continue;
      }
      if (await exists(newFile)) {
        if (this.getParam("overwrites", true)) {
          this.reportWarning(`Replacing existing file "${newFile}"`);
          await rm(newFile, { force: true });
        } else {
          this.reportWarning(`Cannot move file "${oldFile}" out of temporary directory since "${newFile}" already exists.`);
          continue;
        }
      }
      await mkdir(dirname(newFile), { recursive: true });
      this.toScreen(`Moving file "${oldFile}" to "${newFile}"`);
      await moveFile(oldFile, newFile);
    }
    info.filepath = finalPath;
    return [[], info];
  }
}

function filesToMoveRecord(value: unknown): Record<string, string> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, string> : {};
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function moveFile(oldFile: string, newFile: string): Promise<void> {
  try {
    await rename(oldFile, newFile);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "EXDEV") {
      await copyFile(oldFile, newFile);
      await rm(oldFile, { force: true });
      return;
    }
    throw error;
  }
}
