// Source: yt_dlp/extractor/commonprotocols.py
// Port note: direct protocol results are pure transforms; no network access is needed.

import { InfoExtractor, type ExtractorInfo } from "./common.ts";

export class RtmpIE extends InfoExtractor {
  static override readonly _VALID_URL = /^rtmp[est]?:\/\/.+/i;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    return {
      id: this.genericId(url),
      title: this.genericTitle(url),
      formats: [
        {
          url,
          ext: "flv",
          format_id: new URL(url).protocol.replace(/:$/, ""),
        },
      ],
    };
  }
}

export class MmsIE extends InfoExtractor {
  static override readonly _VALID_URL = /^mms:\/\/.+/i;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    return {
      id: this.genericId(url),
      title: this.genericTitle(url),
      url,
    };
  }
}

export class ViewSourceIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`view-source:(?<url>.+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const target = this.matchValidUrl(url)?.groups?.url;
    if (!target) {
      throw new Error("Unable to extract view-source URL");
    }
    return this.urlResult(target);
  }
}
