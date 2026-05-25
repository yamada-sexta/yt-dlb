// Source: yt_dlp/extractor/bokecc.py

import { ExtractorError } from "../utils/index.ts";
import { xmlFind, xmlFindAll } from "../utils/xml.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

abstract class BokeCCBaseIE extends InfoExtractor {
  protected async extractBokeccFormats(
    webpage: string,
    videoId: string,
    formatId: string | null = null,
  ): Promise<Array<Record<string, unknown>>> {
    const playerParamsString = this.htmlSearchRegex(
      /<(?:script|embed)[^>]+src=(?<q>["'])(?:https?:)?\/\/p\.bokecc\.com\/(?:player|flash\/player\.swf)\?(?<query>.+?)\k<q>/,
      webpage,
      "player params",
      { group: "query" },
    );
    if (typeof playerParamsString !== "string") {
      throw new Error("Unable to extract BokeCC player params");
    }
    const playerParams = new URLSearchParams(playerParamsString);
    const siteId = playerParams.get("siteid");
    const vid = playerParams.get("vid");
    if (!siteId || !vid) {
      throw new ExtractorError("Invalid BokeCC player parameters", {
        expected: true,
        videoId,
      });
    }
    const infoXml = await this.downloadXml(
      `http://p.bokecc.com/servlet/playinfo?uid=${encodeURIComponent(siteId)}&vid=${encodeURIComponent(vid)}&m=1`,
      videoId,
    );
    if (infoXml === false) {
      throw new Error("Unable to download BokeCC playinfo XML");
    }
    const videoNode = xmlFind(infoXml, "video");
    return xmlFindAll(videoNode ?? infoXml, "quality").flatMap((quality) => {
      const copy = xmlFind(quality, "copy");
      const playUrl = copy?.attrib.playurl;
      if (!playUrl) {
        return [];
      }
      return [
        {
          format_id: formatId ?? undefined,
          url: playUrl,
          quality: Number(quality.attrib.value),
        },
      ];
    });
  }
}

export class BokeCCIE extends BokeCCBaseIE {
  static override readonly _VALID_URL =
    String.raw`https?://union\.bokecc\.com/playvideo\.bo\?(?<query>.*)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const query = this.matchValidUrl(url)?.groups?.query;
    if (!query) {
      throw new ExtractorError("Invalid URL", { expected: true });
    }
    const params = new URLSearchParams(query);
    const vid = params.get("vid");
    const uid = params.get("uid");
    if (!vid || !uid) {
      throw new ExtractorError("Invalid URL", { expected: true });
    }
    const videoId = `${uid}_${vid}`;
    const webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new Error("Unable to download BokeCC webpage");
    }
    return {
      id: videoId,
      title: "BokeCC Video",
      formats: await this.extractBokeccFormats(webpage, videoId),
    };
  }
}
