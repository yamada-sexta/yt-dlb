// Source: yt_dlp/extractor/youtube/_mistakes.py

import { ExtractorError } from "../../utils/index.ts";
import type { ExtractorInfo } from "../common.ts";
import { YoutubeBaseInfoExtractor } from "./base.ts";

export class YoutubeTruncatedURLIE extends YoutubeBaseInfoExtractor {
  static override readonly _VALID_URL =
    String.raw`(?:https?://)?(?:\w+\.)?[yY][oO][uU][tT][uU][bB][eE](?:-nocookie)?\.com/(?:watch\?(?:feature=[a-z_]+|annotation_id=annotation_[^&]+|x-yt-cl=[0-9]+|hl=[^&]*|t=[0-9]+)?|attribution_link\?a=[^&]+)$`;

  static override get IE_NAME(): string {
    return "youtube:truncated_url";
  }

  static readonly IE_DESC = false;

  protected override async realExtract(
    _url: string,
  ): Promise<ExtractorInfo | null> {
    throw new ExtractorError(
      'Did you forget to quote the URL? Remember that & is a meta character in most shells, so you want to put the URL in quotes, like yt-dlp "https://www.youtube.com/watch?feature=foo&v=BaW_jenozKc" or simply yt-dlp BaW_jenozKc .',
      { expected: true },
    );
  }
}

export class YoutubeTruncatedIDIE extends YoutubeBaseInfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?youtube\.com/watch\?v=(?<id>[0-9A-Za-z_-]{1,10})$`;

  static override get IE_NAME(): string {
    return "youtube:truncated_id";
  }

  static readonly IE_DESC = false;

  protected override async realExtract(
    url: string,
  ): Promise<ExtractorInfo | null> {
    const videoId = this.matchId(url);
    throw new ExtractorError(
      `Incomplete YouTube ID ${videoId}. URL ${url} looks truncated.`,
      { expected: true },
    );
  }
}
