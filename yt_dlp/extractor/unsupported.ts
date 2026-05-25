// Source: yt_dlp/extractor/unsupported.py
// Port note: unsupported-site extractors preserve matching/errors without Python classproperty helpers.

import { ExtractorError } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

abstract class UnsupportedInfoExtractor extends InfoExtractor {
  static readonly URLS: readonly string[] = [];

  static override get IE_NAME(): string {
    return InfoExtractor.IE_NAME.startsWith("Known")
      ? InfoExtractor.IE_NAME.slice("Known".length)
      : InfoExtractor.IE_NAME;
  }

  static override get _VALID_URL(): string {
    return `https?://(?:www\\.)?(?:${UnsupportedInfoExtractor.URLS.join("|")})`;
  }
}

const LF = "\n       ";

export class KnownDRMIE extends UnsupportedInfoExtractor {
  static override readonly URLS = [
    String.raw`play\.hbomax\.com`,
    String.raw`channel(?:4|5)\.com`,
    String.raw`peacocktv\.com`,
    String.raw`(?:[\w.]+\.)?disneyplus\.com`,
    String.raw`open\.spotify\.com`,
    String.raw`tvnz\.co\.nz`,
    String.raw`oneplus\.ch`,
    String.raw`artstation\.com/learning/courses`,
    String.raw`philo\.com`,
    String.raw`(?:[\w.]+\.)?mech-plus\.com`,
    String.raw`aha\.video`,
    String.raw`mubi\.com`,
    String.raw`vootkids\.com`,
    String.raw`nowtv\.it/watch`,
    String.raw`tv\.apple\.com`,
    String.raw`primevideo\.com`,
    String.raw`hulu\.com`,
    String.raw`resource\.inkryptvideos\.com`,
    String.raw`joyn\.de`,
    String.raw`amazon\.(?:\w{2}\.)?\w+/gp/video`,
    String.raw`music\.amazon\.(?:\w{2}\.)?\w+`,
    String.raw`(?:watch|front)\.njpwworld\.com`,
    String.raw`qub\.ca/vrai`,
    String.raw`(?:beta\.)?crunchyroll\.com`,
    String.raw`viki\.com`,
    String.raw`deezer\.com`,
    String.raw`b-ch\.com`,
    String.raw`ctv\.ca`,
    String.raw`noovo\.ca`,
    String.raw`tsn\.ca`,
    String.raw`paramountplus\.com`,
    String.raw`(?:m\.)?(?:sony)?crackle\.com`,
    String.raw`cw(?:tv(?:pr)?|seed)\.com`,
    String.raw`6play\.fr`,
    String.raw`rtlplay\.be`,
    String.raw`play\.rtl\.hr`,
    String.raw`rtlmost\.hu`,
    String.raw`plus\.rtl\.de(?!/podcast/)`,
    String.raw`mediasetinfinity\.es`,
    String.raw`tv5mondeplus\.com`,
    String.raw`tv\.rakuten\.co\.jp`,
    String.raw`watch\.telusoriginals\.com`,
    String.raw`video\.unext\.jp`,
    String.raw`www\.web\.nhk`,
  ];

  protected override async realExtract(_url: string): Promise<ExtractorInfo> {
    throw new ExtractorError(
      `The requested site is known to use DRM protection. It will NOT be supported.${LF}Please DO NOT open an issue, unless you have evidence that the video is not DRM protected`,
      { expected: true },
    );
  }
}

export class KnownPiracyIE extends UnsupportedInfoExtractor {
  static override readonly URLS = [
    String.raw`dood\.(?:to|watch|so|pm|wf|re)`,
    String.raw`viewsb\.com`,
    String.raw`filemoon\.sx`,
    String.raw`hentai\.animestigma\.com`,
    String.raw`thisav\.com`,
    String.raw`gounlimited\.to`,
    String.raw`highstream\.tv`,
    String.raw`uqload\.com`,
    String.raw`vedbam\.xyz`,
    String.raw`vadbam\.net`,
    String.raw`vidlo\.us`,
    String.raw`wolfstream\.tv`,
    String.raw`xvideosharing\.com`,
    String.raw`(?:\w+\.)?viidshar\.com`,
    String.raw`sxyprn\.com`,
    String.raw`jable\.tv`,
    String.raw`91porn\.com`,
    String.raw`einthusan\.(?:tv|com|ca)`,
    String.raw`yourupload\.com`,
    String.raw`xanimu\.com`,
  ];

  protected override async realExtract(_url: string): Promise<ExtractorInfo> {
    throw new ExtractorError(
      `This website is no longer supported since it has been determined to be primarily used for piracy.${LF}DO NOT open issues for it`,
      { expected: true },
    );
  }
}
