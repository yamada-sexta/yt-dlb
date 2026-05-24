// Source: yt_dlp/extractor/commonmistakes.py
// Port note: direct extractor error cases are synchronous; extraction still returns async through InfoExtractor.

import { ExtractorError } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

export class CommonMistakesIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`(?:url|URL|yt-dlp)$`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    let message = `You've asked yt-dlp to download the URL "${url}". That doesn't make any sense. Simply remove the parameter in your command or configuration.`;
    if (!this.getParam("verbose", false)) {
      message += " Add -v to the command line to see what arguments and configuration yt-dlp has";
    }
    throw new ExtractorError(message, { expected: true });
  }
}

export class UnicodeBOMIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`(?<bom>\ufeff)(?<id>.*)$`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const realUrl = this.matchId(url);
    this.reportWarning(`Your URL starts with a Byte Order Mark (BOM). Removing the BOM and looking for "${realUrl}" ...`);
    return this.urlResult(realUrl);
  }
}

export class BlobIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`blob:`;

  protected override async realExtract(_url: string): Promise<ExtractorInfo> {
    throw new ExtractorError("You've asked yt-dlp to download a blob URL. A blob URL exists only locally in your browser. It is not possible for yt-dlp to access it.", { expected: true });
  }
}
