// Source: yt_dlp/extractor/blerp.py

import { stripOrNone } from "../utils/index.ts";
import { ExtractorError } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import { z } from "zod";

const BlerpBiteSchema = z
  .object({
    _id: z.string(),
    title: z.string(),
    userKeywords: z.array(z.unknown()).optional(),
    ownerObject: z
      .object({
        _id: z.string().optional(),
        username: z.string().optional(),
      })
      .passthrough()
      .nullable()
      .optional(),
    audio: z
      .object({
        mp3: z
          .object({
            url: z.string(),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

const BlerpResponseSchema = z
  .object({
    data: z
      .object({
        web: z
          .object({
            biteById: BlerpBiteSchema,
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

export class BlerpIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?blerp\.com/soundbites/(?<id>[0-9a-zA-Z]+)`;
  private static readonly GRAPHQL_OPERATION_NAME = "webBitePageGetBite";
  private static readonly GRAPHQL_QUERY =
    `query webBitePageGetBite($_id: MongoID!) {
    web {
      biteById(_id: $_id) {
        _id
        title
        userKeywords
        ownerObject { _id username }
        audio { mp3 { url } }
      }
    }
  }`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const audioId = this.matchId(url);
    const jsonResult = await this.downloadJson<unknown>(
      "https://api.blerp.com/graphql",
      audioId,
      {
        data: JSON.stringify({
          operationName: BlerpIE.GRAPHQL_OPERATION_NAME,
          query: BlerpIE.GRAPHQL_QUERY,
          variables: { _id: audioId },
        }),
        headers: { "Content-Type": "application/json" },
      },
    );
    if (jsonResult === false) {
      throw new ExtractorError("Unable to download Blerp metadata", {
        videoId: audioId,
      });
    }
    const bite = BlerpResponseSchema.parse(jsonResult).data.web.biteById;
    const tags = bite.userKeywords
      ?.map((item) => stripOrNone(item))
      .filter((item): item is string => Boolean(item));

    return {
      id: bite._id,
      url: bite.audio.mp3.url,
      title: bite.title,
      uploader: stripOrNone(bite.ownerObject?.username) ?? undefined,
      uploader_id: stripOrNone(bite.ownerObject?._id) ?? undefined,
      ext: "mp3",
      tags: tags?.length ? tags : undefined,
    };
  }
}
