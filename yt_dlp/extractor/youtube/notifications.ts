// Source: yt_dlp/extractor/youtube/_notifications.py
// Port note: URL routing is migrated; authenticated notification menu pagination is pending.

import { NotImplementedError } from "../../errors.ts";
import { type ExtractorInfo } from "../common.ts";
import { YoutubeTabBaseInfoExtractor } from "./tab.ts";

export class YoutubeNotificationsIE extends YoutubeTabBaseInfoExtractor {
  static override readonly _VALID_URL = String.raw`:ytnotif(?:ication)?s?`;
  static readonly _LOGIN_REQUIRED = true;
  static readonly IE_DESC = 'YouTube notifications; ":ytnotif" keyword (requires cookies)';

  static override get IE_NAME(): string {
    return "youtube:notif";
  }

  protected override async realExtract(_url: string): Promise<ExtractorInfo | null> {
    throw new NotImplementedError("YouTube notification menu pagination");
  }
}
