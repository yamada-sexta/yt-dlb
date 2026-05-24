// Source: yt_dlp/downloader/dash.py

import { NotImplementedError } from "../errors.ts";
import { FragmentFD, type FragmentInfo } from "./fragment.ts";
import type { DownloadInfo } from "./common.ts";

export class DashSegmentsFD extends FragmentFD {
  override async realDownload(filename: string, info: DownloadInfo): Promise<boolean> {
    const formats = Array.isArray(info.requested_formats) ? info.requested_formats as DownloadInfo[] : [info];
    if (formats.length !== 1) {
      throw new NotImplementedError("DASH merged multi-format downloads");
    }
    const format = formats[0]!;
    if (typeof format.fragments === "string") {
      throw new NotImplementedError("DASH fragment generator re-extraction");
    }
    if (!Array.isArray(format.fragments)) {
      throw new Error("DASH format has no fragments");
    }
    const base = typeof format.fragment_base_url === "string" ? format.fragment_base_url : format.url;
    const fragments = format.fragments.map((fragment, index): FragmentInfo => {
      const item = fragment as { url?: string; path?: string; fragment_count?: number };
      return {
        frag_index: index + 1,
        fragment_count: item.fragment_count,
        url: item.url ?? new URL(item.path ?? "", base).toString(),
      };
    });
    this.toScreen("[dashsegments] Total fragments: " + fragments.length);
    return await this.downloadFragments(filename, format, fragments);
  }
}
