// Source: yt_dlp/extractor/blogger.py

import { mimetype2ext, parseDuration, parseQs, strOrNone } from "../utils/index.ts";
import { ExtractorError } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import { z } from "zod";

const BloggerStreamSchema = z.object({
  play_url: z.string(),
  format_id: z.unknown().optional(),
}).passthrough();

const BloggerConfigSchema = z.object({
  iframe_id: z.string().optional(),
  thumbnail: z.string().optional(),
  streams: z.array(BloggerStreamSchema),
}).passthrough();

export class BloggerIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?:www\.)?blogger\.com/video\.g\?token=(?<id>.+)`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const tokenId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, tokenId);
    if (webpage === false) {
      throw new ExtractorError("Unable to download webpage", { videoId: tokenId });
    }
    const dataJson = this.searchRegex(/var\s+VIDEO_CONFIG\s*=\s*(\{.*)/, webpage, "JSON data");
    if (typeof dataJson !== "string") {
      throw new ExtractorError("Unable to extract JSON data", { videoId: tokenId });
    }
    const parsed = this.parseJson<unknown>(
      dataJson,
      tokenId,
      {
        // Logic note: Bun's JSON parser already resolves JSON unicode escapes; only trim the JS
        // assignment terminator that yt-dlp stripped through Python's unicode_escape pass.
        transform_source: (source) => source.trim().replace(/;\s*$/u, ""),
      },
    );
    const data = BloggerConfigSchema.parse(parsed);

    const formats = data.streams.map((stream) => {
      const query = parseQs(stream.play_url);
      return {
        ext: mimetype2ext(query.mime?.[0]),
        url: stream.play_url,
        format_id: strOrNone(stream.format_id) ?? undefined,
      };
    });
    const firstQuery = data.streams[0] ? parseQs(data.streams[0].play_url) : {};
    const id = data.iframe_id ?? tokenId;

    return {
      id,
      title: id,
      formats,
      thumbnail: data.thumbnail,
      duration: parseDuration(firstQuery.dur?.[0]),
    };
  }
}
