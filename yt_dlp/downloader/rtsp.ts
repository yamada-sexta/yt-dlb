// Source: yt_dlp/downloader/rtsp.py
// Port note: mplayer/mpv/ffmpeg subprocess execution is implemented with Bun.spawn.

import { FileDownloader, type DownloadInfo } from "./common.ts";

export class RtspFD extends FileDownloader {
  override async realDownload(filename: string, info: DownloadInfo): Promise<boolean> {
    const tmpfilename = this.tempName(filename);
    const command = this.command(tmpfilename, info.url);
    if (!command) {
      throw new Error('MMS or RTSP download detected but neither "mplayer", "mpv", nor "ffmpeg" could be run. Please install one');
    }
    this.writeDebug(`RTSP command: ${command.join(" ")}`);
    const started = performance.now() / 1000;
    const proc = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
    const [stderr, exitCode] = await Promise.all([
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (exitCode !== 0) {
      throw new Error(`${command[0]} exited with code ${exitCode}${stderr ? `: ${stderr.trim()}` : ""}`);
    }
    await this.tryRename(tmpfilename, filename);
    const size = await this.filesizeOrZero(filename);
    await this.hookProgress({
      status: "finished",
      filename,
      downloaded_bytes: size,
      total_bytes: size,
      elapsed: performance.now() / 1000 - started,
    }, info);
    return true;
  }

  private command(tmpfilename: string, url: string): string[] | null {
    const mplayer = Bun.which("mplayer");
    if (mplayer) {
      return [mplayer, "-really-quiet", "-vo", "null", "-vc", "dummy", "-dumpstream", "-dumpfile", tmpfilename, url];
    }
    const mpv = Bun.which("mpv");
    if (mpv) {
      return [mpv, "-really-quiet", "--vo=null", `--stream-dump=${tmpfilename}`, url];
    }
    const ffmpeg = Bun.which("ffmpeg");
    if (ffmpeg) {
      return [ffmpeg, "-hide_banner", "-nostdin", "-y", "-i", url, "-c", "copy", tmpfilename];
    }
    return null;
  }
}
