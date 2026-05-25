// Source: yt_dlp/downloader/rtmp.py
// Port note: external rtmpdump execution is implemented with Bun Shell.

import { $ } from "bun";

import { FileDownloader, type DownloadInfo } from "./common.ts";

export function rtmpdumpVersion(): string | null {
  return Bun.which("rtmpdump") ? "available" : null;
}

export class RtmpFD extends FileDownloader {
  override async realDownload(
    filename: string,
    info: DownloadInfo,
  ): Promise<boolean> {
    const exe = Bun.which("rtmpdump");
    if (!exe) {
      throw new Error(
        'RTMP download detected but "rtmpdump" could not be run. Please install rtmpdump',
      );
    }
    const tmpfilename = this.tempName(filename);
    const args = this.makeArgs(tmpfilename, info);
    this.writeDebug(`rtmpdump command: ${[exe, ...args].join(" ")}`);
    const started = performance.now() / 1000;
    const { stderr, exitCode } = await runShellCommand([exe, ...args]);
    if (this.params.verbose && stderr) {
      this.toScreen(`[rtmpdump] ${stderr.trim()}`);
    }
    if (exitCode !== 0 && !(this.params.test && exitCode === 2)) {
      throw new Error(`rtmpdump exited with code ${exitCode}`);
    }
    await this.tryRename(tmpfilename, filename);
    const size = await this.filesizeOrZero(filename);
    await this.hookProgress(
      {
        status: "finished",
        filename,
        downloaded_bytes: size,
        total_bytes: size,
        elapsed: performance.now() / 1000 - started,
      },
      info,
    );
    return true;
  }

  private makeArgs(tmpfilename: string, info: DownloadInfo): string[] {
    const args = ["--verbose", "-r", info.url, "-o", tmpfilename];
    appendArg(args, "--swfVfy", info.player_url);
    appendArg(args, "--pageUrl", info.page_url);
    appendArg(args, "--app", info.app);
    appendArg(args, "--playpath", info.play_path);
    appendArg(args, "--tcUrl", info.tc_url);
    appendArg(args, "--flashVer", info.flash_version);
    appendArg(args, "--protocol", info.rtmp_protocol);
    if (this.params.test) {
      args.push("--stop", "1");
    }
    if (info.rtmp_live) {
      args.push("--live");
    }
    if (info.rtmp_real_time) {
      args.push("--realtime");
    }
    const conn = info.rtmp_conn;
    if (Array.isArray(conn)) {
      for (const entry of conn) {
        appendArg(args, "--conn", entry);
      }
    } else {
      appendArg(args, "--conn", conn);
    }
    if (
      !info.no_resume &&
      this.params.continuedl !== false &&
      !info.rtmp_live
    ) {
      args.push("--resume", "--skip", "1");
    }
    return args;
  }
}

export const rtmpdump_version = rtmpdumpVersion;

function appendArg(args: string[], flag: string, value: unknown): void {
  if (typeof value === "string" && value) {
    args.push(flag, value);
  }
}

async function runShellCommand(
  cmd: readonly string[],
): Promise<{ stderr: string; exitCode: number }> {
  const output = await $`${[...cmd]}`.nothrow().quiet();
  return {
    stderr: output.stderr.toString(),
    exitCode: output.exitCode,
  };
}
