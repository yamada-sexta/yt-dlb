// Source: yt_dlp/downloader/mhtml.py

import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import { detectImageType } from "../compat/imghdr.ts";
import { version } from "../version.ts";
import { FragmentFD, type FragmentInfo } from "./fragment.ts";
import type { DownloadInfo } from "./common.ts";

const STYLESHEET =
  "html,body{margin:0;padding:0;height:100vh}html{overflow-y:scroll;scroll-snap-type:y mandatory}body{scroll-snap-type:y mandatory;display:flex;flex-flow:column}body>figure{max-width:100vw;max-height:100vh;scroll-snap-align:center}body>figure>figcaption{text-align:center;height:2.5em}body>figure>img{display:block;margin:auto;max-width:100%;max-height:calc(100vh - 5em)}";

export class MhtmlFD extends FragmentFD {
  override async realDownload(
    filename: string,
    info: DownloadInfo,
  ): Promise<boolean> {
    const rawFragments = Array.isArray(info.fragments)
      ? (info.fragments as FragmentInfo[])
      : [];
    const fragments = this.params.test
      ? rawFragments.slice(0, 1)
      : rawFragments;
    if (!fragments.length) {
      throw new Error("MHTML download has no fragments");
    }
    const tmpfilename = this.tempName(filename);
    await mkdir(dirname(tmpfilename), { recursive: true });
    const writer = Bun.file(tmpfilename).writer();
    const boundary = randomUUID().replaceAll("-", "");
    const title = String(info.title ?? info.format_id ?? "slides");
    const origin = String(info.webpage_url ?? info.url);
    const started = performance.now() / 1000;
    let downloaded = 0;

    try {
      const stub = this.generateStub(fragments, boundary, title);
      writer.write(
        "MIME-Version: 1.0\r\n" +
          "From: <nowhere@yt-dlp.github.io.invalid>\r\n" +
          "To: <nowhere@yt-dlp.github.io.invalid>\r\n" +
          `Subject: ${escapeMime(title)}\r\n` +
          `Content-type: multipart/related; boundary="${boundary}"; type="text/html"\r\n` +
          `X.ytdlb.Origin: ${origin}\r\n` +
          "\r\n" +
          `--${boundary}\r\n` +
          "Content-Type: text/html; charset=utf-8\r\n" +
          `Content-Length: ${new TextEncoder().encode(stub).byteLength}\r\n` +
          "\r\n" +
          `${stub}\r\n`,
      );

      for (const [index, fragment] of fragments.entries()) {
        const fragmentUrl =
          fragment.url ??
          new URL(
            fragment.path ?? "",
            String(info.fragment_base_url ?? info.url),
          ).toString();
        const bytes = new Uint8Array(
          await (await this.ydl.urlopen(fragmentUrl)).arrayBuffer(),
        );
        downloaded += bytes.byteLength;
        writer.write(
          `--${boundary}\r\n` +
            `Content-ID: <${this.generateCid(index, boundary)}>\r\n` +
            `Content-type: image/${detectImageType(bytes) ?? "jpeg"}\r\n` +
            `Content-length: ${bytes.byteLength}\r\n` +
            `Content-location: ${fragmentUrl}\r\n` +
            (typeof fragment.duration === "number"
              ? `X.ytdlb.Duration: ${fragment.duration}\r\n`
              : "") +
            "\r\n",
        );
        writer.write(bytes);
        writer.write("\r\n");
        await this.hookProgress(
          {
            status: "downloading",
            filename,
            tmpfilename,
            downloaded_bytes: downloaded,
            elapsed: performance.now() / 1000 - started,
          },
          info,
        );
      }
      writer.write(`--${boundary}--\r\n\r\n`);
      await writer.end();
      await this.tryRename(tmpfilename, filename);
      await this.hookProgress(
        {
          status: "finished",
          filename,
          downloaded_bytes: downloaded,
          total_bytes: downloaded,
          elapsed: performance.now() / 1000 - started,
        },
        info,
      );
      return true;
    } catch (error) {
      writer.end();
      await this.hookProgress(
        {
          status: "error",
          filename,
          tmpfilename,
          downloaded_bytes: downloaded,
        },
        info,
      );
      throw error;
    }
  }

  private generateCid(index: number, boundary: string): string {
    return `${index}.${boundary}@yt-dlp.github.io.invalid`;
  }

  private generateStub(
    fragments: readonly FragmentInfo[],
    boundary: string,
    title: string,
  ): string {
    const figures = fragments
      .map((fragment, index) => {
        const duration =
          typeof fragment.duration === "number"
            ? ` (duration: ${formatDuration(fragment.duration)})`
            : "";
        return `<figure><figcaption>Slide #${index + 1}${duration}</figcaption><img src="cid:${this.generateCid(index, boundary)}"></figure>`;
      })
      .join("");
    return `<!DOCTYPE html><html><head><meta name="generator" content="ytdlb ${escapeHtml(version)}"><title>${escapeHtml(title)}</title><style>${STYLESHEET}</style><body>${figures}`;
  }
}

function escapeMime(value: string): string {
  return `=?utf-8?Q?${value
    .replaceAll(/[^\x20-\x7e]|[=?_]/g, (char) => {
      const codePoint = char.codePointAt(0);
      if (codePoint === undefined) {
        throw new Error("empty MIME character");
      }
      return `=${codePoint.toString(16).toUpperCase().padStart(2, "0")}`;
    })
    .replaceAll(" ", "_")}?=`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatDuration(seconds: number): string {
  const total = Math.trunc(seconds);
  const minutes = Math.trunc(total / 60);
  const secs = total % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}
