// Source: yt_dlp/extractor/youtube/_clip.py

import { z } from "zod";

import { ExtractorError } from "../../utils/index.ts";
import { Ellipsis, traverseObj } from "../../utils/traversal.ts";
import { type ExtractorInfo } from "../common.ts";
import { YoutubeTabBaseInfoExtractor } from "./tab.ts";
import { YoutubeIE } from "./video.ts";

const ClipLoopCommandSchema = z.object({
  startTimeMs: z.union([z.string(), z.number()]).transform((value) => Number(value)),
  endTimeMs: z.union([z.string(), z.number()]).transform((value) => Number(value)),
}).passthrough();

export class YoutubeClipIE extends YoutubeTabBaseInfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?youtube\.com/clip/(?<id>[^/?#]+)`;

  static override get IE_NAME(): string {
    return "youtube:clip";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const clipId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, clipId);
    if (webpage === false) {
      throw new ExtractorError("Unable to download YouTube clip webpage");
    }
    const data = this.ytInitialData(webpage, clipId);
    const videoId = traverseObj<string>(data, ["currentVideoEndpoint", "watchEndpoint", "videoId"], {
      expected_type: isString,
      get_all: false,
    });
    if (!videoId || Array.isArray(videoId)) {
      throw new ExtractorError("Unable to find video ID");
    }

    const clipData = traverseObj<unknown>(data, [
      "engagementPanels",
      Ellipsis,
      "engagementPanelSectionListRenderer",
      "content",
      "clipSectionRenderer",
      "contents",
      Ellipsis,
      "clipAttributionRenderer",
      "onScrubExit",
      "commandExecutorCommand",
      "commands",
      Ellipsis,
      "openPopupAction",
      "popup",
      "notificationActionRenderer",
      "actionButton",
      "buttonRenderer",
      "command",
      "commandExecutorCommand",
      "commands",
      Ellipsis,
      "loopCommand",
    ], { get_all: false });
    const loopCommand = ClipLoopCommandSchema.parse(clipData);

    return this.urlResult(`https://www.youtube.com/watch?v=${videoId}`, YoutubeIE, clipId, null, {
      url_transparent: true,
      media_type: "clip",
      section_start: loopCommand.startTimeMs / 1000,
      section_end: loopCommand.endTimeMs / 1000,
      _format_sort_fields: [
        "proto:https",
        "quality",
        "res",
        "fps",
        "hdr:12",
        "source",
        "vcodec",
        "channels",
        "acodec",
        "lang",
      ],
    });
  }
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
