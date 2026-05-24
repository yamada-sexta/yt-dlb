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
    const extraQuery = typeof info.extra_param_to_segment_url === "string"
      ? new URLSearchParams(info.extra_param_to_segment_url)
      : null;
    const sourceFragments = this.params.test ? format.fragments.slice(0, 1) : format.fragments;
    const fragments = sourceFragments.map((fragment, index): FragmentInfo => {
      const item = fragment as { url?: string; path?: string; fragment_count?: number };
      const rawUrl = item.url ?? new URL(item.path ?? "", base).toString();
      return {
        frag_index: index + 1,
        fragment_count: item.fragment_count,
        url: extraQuery ? updateUrlQuery(rawUrl, extraQuery) : rawUrl,
      };
    });
    this.toScreen("[dashsegments] Total fragments: " + fragments.length);
    return await this.downloadFragments(filename, format, fragments);
  }
}

function updateUrlQuery(url: string, extraQuery: URLSearchParams): string {
  const parsed = new URL(url);
  for (const [key, value] of extraQuery) {
    parsed.searchParams.append(key, value);
  }
  return parsed.toString();
}
