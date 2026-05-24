// Source: yt_dlp/downloader/dash.py

import { NotImplementedError } from "../errors.ts";
import { ReExtractInfo, updateUrlQuery } from "../utils/utils.ts";
import { FragmentFD, type FragmentInfo } from "./fragment.ts";
import type { DownloadInfo } from "./common.ts";

export class DashSegmentsFD extends FragmentFD {
  override async realDownload(filename: string, info: DownloadInfo): Promise<boolean> {
    const formats = Array.isArray(info.requested_formats) ? info.requested_formats as DownloadInfo[] : [info];
    if (info.is_live) {
      throw new NotImplementedError("live DASH videos");
    }
    let result = true;
    for (const [index, format] of formats.entries()) {
      const target = formats.length === 1
        ? filename
        : typeof format.filepath === "string" ? format.filepath : null;
      if (!target) {
        throw new NotImplementedError("DASH multi-format download without per-format filepath");
      }
      result = await this.downloadFormat(target, { ...info, ...format }, index === 0) && result;
    }
    return result;
  }

  private async downloadFormat(filename: string, format: DownloadInfo, isFatal: boolean): Promise<boolean> {
    if (typeof format.fragments === "string") {
      throw new ReExtractInfo("the stream needs to be re-extracted", true);
    }
    if (!Array.isArray(format.fragments)) {
      throw new Error("DASH format has no fragments");
    }
    const base = typeof format.fragment_base_url === "string" ? format.fragment_base_url : format.url;
    const extraQuery = typeof format.extra_param_to_segment_url === "string"
      ? new URLSearchParams(format.extra_param_to_segment_url)
      : null;
    const sourceFragments = this.params.test ? format.fragments.slice(0, 1) : format.fragments;
    const fragments = sourceFragments.map((fragment, index): FragmentInfo => {
      const item = fragment as { url?: string; path?: string; fragment_count?: number };
      const rawUrl = item.url ?? new URL(item.path ?? "", base).toString();
      return {
        frag_index: index + 1,
        fragment_count: item.fragment_count,
        url: extraQuery ? updateUrlQuery(rawUrl, queryToRecord(extraQuery)) : rawUrl,
      };
    });
    this.toScreen("[dashsegments] Total fragments: " + fragments.length);
    try {
      return await this.downloadFragments(filename, format, fragments);
    } catch (error) {
      if (isFatal) {
        throw error;
      }
      this.reportSkipFragment(0, error);
      return false;
    }
  }
}

function queryToRecord(extraQuery: URLSearchParams): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const [key, value] of extraQuery) {
    out[key] ??= [];
    out[key]!.push(value);
  }
  return out;
}
