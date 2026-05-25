// Source: yt_dlp/postprocessor/xattrpp.py
// Port note: xattrs are written through platform tools with Bun Shell instead of Python xattr bindings.

import { $ } from "bun";
import { stat } from "node:fs/promises";

import { NotImplementedError } from "../errors.ts";
import { PostProcessingError } from "../utils/utils.ts";
import { PostProcessor, type PostProcessorInfo } from "./common.ts";

const XATTR_MAPPING: Record<string, string> = {
  "user.xdg.referrer.url": "webpage_url",
  "user.dublincore.title": "title",
  "user.dublincore.date": "upload_date",
  "user.dublincore.contributor": "uploader",
  "user.dublincore.format": "format",
  "user.dublincore.description": "description",
  "com.apple.metadata:kMDItemWhereFroms": "webpage_url",
};

export class XAttrMetadataPP extends PostProcessor {
  override async run(
    info: PostProcessorInfo,
  ): Promise<[string[], PostProcessorInfo]> {
    const filepath = typeof info.filepath === "string" ? info.filepath : null;
    if (!filepath) {
      throw new PostProcessingError("XAttrMetadataPP requires info.filepath");
    }
    const mtime = (await stat(filepath)).mtimeMs / 1000;
    this.toScreen("Writing metadata to file's xattrs");
    for (const [xattrName, infoName] of Object.entries(XATTR_MAPPING)) {
      const rawValue = info[infoName];
      if (!rawValue) {
        continue;
      }
      if (
        xattrName === "com.apple.metadata:kMDItemWhereFroms" &&
        process.platform !== "darwin"
      ) {
        continue;
      }
      const value =
        xattrName === "com.apple.metadata:kMDItemWhereFroms"
          ? appleWhereFromsPlist(String(rawValue))
          : infoName === "upload_date"
            ? hyphenateDate(String(rawValue))
            : String(rawValue);
      await writeXattr(filepath, xattrName, value);
    }
    await this.tryUtime(filepath, mtime, mtime);
    return [[], info];
  }
}

async function writeXattr(
  filepath: string,
  name: string,
  value: string,
): Promise<void> {
  const cmd = xattrCommand(filepath, name, value);
  const output = await $`${cmd}`.nothrow().quiet();
  if (output.exitCode === 0) {
    return;
  }
  const stderr = output.stderr.toString().trim();
  if (/no space|quota|too large|argument list too long/i.test(stderr)) {
    throw new PostProcessingError(
      `Unable to write extended attribute "${name}": ${stderr}`,
    );
  }
  throw new PostProcessingError(
    `This filesystem doesn't support extended attributes. ${stderr}`,
  );
}

function xattrCommand(filepath: string, name: string, value: string): string[] {
  if (process.platform === "darwin") {
    const exe = Bun.which("xattr");
    if (!exe) {
      throw new NotImplementedError(
        "xattr command is required for XAttrMetadataPP on macOS",
      );
    }
    return [exe, "-w", name, value, filepath];
  }
  if (process.platform === "linux") {
    const exe = Bun.which("setfattr");
    if (!exe) {
      throw new NotImplementedError(
        "setfattr command is required for XAttrMetadataPP on Linux",
      );
    }
    return [exe, "-n", name, "-v", value, filepath];
  }
  throw new NotImplementedError(
    `XAttrMetadataPP is not implemented on ${process.platform}`,
  );
}

function hyphenateDate(value: string): string {
  return /^(\d{4})(\d{2})(\d{2})$/.test(value)
    ? value.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3")
    : value;
}

function appleWhereFromsPlist(value: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<array>
\t<string>${xmlEscape(value)}</string>
</array>
</plist>`;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}
