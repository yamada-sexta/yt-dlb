// Source: yt_dlp/extractor/zetland.py

import { mergeDicts, unifiedTimestamp, urlOrNone } from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

export class ZetlandDKArticleIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://www\.zetland\.dk/\w+/(?<id>(?<story_id>\w{8})-(?<uploader_id>\w{8})-(?:\w{5}))`;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const displayId = match?.groups?.id;
    const uploaderId = match?.groups?.uploader_id;
    if (!displayId || !uploaderId) {
      throw new Error("Invalid Zetland URL");
    }
    const webpage = await this.downloadWebpage(url, displayId);
    if (webpage === false) {
      throw new Error("Unable to download Zetland page");
    }

    const nextData = this.searchNextjsData<Record<string, unknown>>(webpage, displayId) ?? {};
    const pageProps = getRecord(getRecord(nextData.props).pageProps);
    const storyData = getRecord(getRecord(getRecord(getRecord(pageProps.initialState).consume).story).story);
    const storyContent = getRecord(storyData.story_content);
    const storyMeta = getRecord(storyContent.meta);
    const storyContentContent = getRecord(storyContent.content);
    const sharer = getRecord(storyData.sharer);

    const formats = asArray(storyMeta.audioFiles)
      .flatMap((audioUrl) => {
        const parsed = urlOrNone(audioUrl);
        return parsed ? [{ url: parsed, vcodec: "none" }] : [];
      });

    const metaInfo = getRecord(pageProps.metaInfo);
    const ld = getRecord(metaInfo.ld);
    const og = getRecord(metaInfo.og);
    const meta = getRecord(metaInfo.meta);
    const author = getRecord(ld.author);

    return mergeDicts({
      id: displayId,
      formats,
      uploader_id: uploaderId,
      title: stringValue(storyContentContent.title) ?? stringValue(storyData.title),
      uploader: stringValue(sharer.name),
      description: stringValue(storyContentContent.socialDescription),
      series_id: stringValue(storyMeta.seriesId),
      release_timestamp: unifiedTimestamp(storyData.published_at) ?? undefined,
      modified_timestamp: unifiedTimestamp(storyData.revised_at) ?? undefined,
    }, {
      title: stringValue(meta.title) ?? stringValue(ld.headline) ?? stringValue(og["og:title"]) ?? stringValue(og["twitter:title"]),
      description: stringValue(meta.description) ?? stringValue(ld.description) ?? stringValue(og["og:description"]) ?? stringValue(og["twitter:description"]),
      uploader: stringValue(meta.author) ?? stringValue(author.name),
      uploader_url: urlOrNone(author.url) ?? undefined,
      thumbnail: urlOrNone(ld.image) ?? urlOrNone(og["og:image"]) ?? urlOrNone(og["twitter:image"]) ?? undefined,
      modified_timestamp: unifiedTimestamp(ld.dateModified) ?? undefined,
      release_timestamp: unifiedTimestamp(ld.datePublished) ?? undefined,
      timestamp: unifiedTimestamp(ld.dateCreated) ?? undefined,
    }, {
      title: this.htmlSearchMeta(["title", "og:title", "twitter:title"], webpage) ?? undefined,
      description: this.htmlSearchMeta(["description", "og:description", "twitter:description"], webpage) ?? undefined,
      thumbnail: this.htmlSearchMeta(["og:image", "twitter:image"], webpage) ?? undefined,
      uploader: this.htmlSearchMeta(["author"], webpage) ?? undefined,
      release_timestamp: unifiedTimestamp(this.htmlSearchMeta(["article:published_time"], webpage)) ?? undefined,
    }, this.searchJsonLd(webpage, displayId, { defaultValue: {} })) as ExtractorInfo;
  }
}

function getRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
