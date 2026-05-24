// Source: yt_dlp/extractor/audiodraft.py

import { intOrNone } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface AudiodraftPlayerInfo {
  entry_id?: unknown;
  entry_title?: string;
  path?: string;
  designer_name?: string;
  designer_id?: string;
  entry_url?: string;
  entry_likes?: unknown;
  entry_rating?: unknown;
}

abstract class AudiodraftBaseIE extends InfoExtractor {
  protected async audiodraftExtractFromId(playerEntryId: string): Promise<ExtractorInfo> {
    const data = await this.downloadJson<AudiodraftPlayerInfo>(
      "https://www.audiodraft.com/scripts/general/player/getPlayerInfoNew.php",
      playerEntryId,
      {
        headers: {
          "Content-type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
        },
        data: new URLSearchParams({ id: playerEntryId }),
      },
    );
    if (data === false) {
      throw new Error("Unable to download Audiodraft player metadata");
    }
    return {
      id: String(data.entry_id ?? playerEntryId),
      title: data.entry_title,
      url: data.path,
      vcodec: "none",
      ext: "mp3",
      uploader: data.designer_name,
      uploader_id: data.designer_id,
      webpage_url: data.entry_url,
      like_count: intOrNone(data.entry_likes) ?? undefined,
      average_rating: intOrNone(data.entry_rating) ?? undefined,
    };
  }
}

export class AudiodraftCustomIE extends AudiodraftBaseIE {
  static override get IE_NAME(): string {
    return "Audiodraft:custom";
  }

  static override readonly _VALID_URL = String.raw`https?://(?:[-\w]+)\.audiodraft\.com/entry/(?<id>\d+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const videoId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new Error("Unable to download Audiodraft entry page");
    }
    const playerEntryId = this.searchRegex(/playAudio\('(player_entry_\d+)'\);/, webpage, "play entry id");
    if (typeof playerEntryId !== "string") {
      throw new Error("Unable to extract Audiodraft player entry id");
    }
    return await this.audiodraftExtractFromId(playerEntryId);
  }
}

export class AudiodraftGenericIE extends AudiodraftBaseIE {
  static override get IE_NAME(): string {
    return "Audiodraft:generic";
  }

  static override readonly _VALID_URL = String.raw`https?://www\.audiodraft\.com/contests/[^/#]+#entries&eid=(?<id>\d+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    return await this.audiodraftExtractFromId(`player_entry_${this.matchId(url)}`);
  }
}
