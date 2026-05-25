// Source: yt_dlp/extractor/zapiks.py

import {
  cleanHtml,
  intOrNone,
  parseDuration,
  parseResolution,
  strOrNone,
  unifiedTimestamp,
  unescapeHTML,
  urlOrNone,
} from "../utils/index.ts";
import { InfoExtractor, type ExtractorInfo } from "./common.ts";

interface ZapiksPlaylist {
  mediaid?: unknown;
  title?: string;
  image?: unknown;
  sources?: Array<{ file?: unknown; label?: unknown }>;
}

export class ZapiksIE extends InfoExtractor {
  static override readonly _VALID_URL = [
    String.raw`https?://(?:www\.)?zapiks\.(?:com|fr)/(?<id>[\w-]+)\.html`,
    String.raw`https?://(?:www\.)?zapiks\.fr/index\.php\?(?:[^#]+&)?media_id=(?<id>\d+)`,
  ];
  static override readonly _EMBED_REGEX = [String.raw`<iframe\b[^>]+\bsrc=["'](?<url>(?:https?:)?//(?:www\.)?zapiks\.fr/index\.php\?(?:[^#"']+&(?:amp;)?)?media_id=\d+)`];
  private static readonly UPLOADER_ID_RE = /\/pro(?:fil)?\/(?<id>[^/?#]+)\/?/;

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const displayId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, displayId);
    if (webpage === false) {
      throw new Error("Unable to download Zapiks webpage");
    }

    const embedUrl = urlOrNone(this.protoRelativeUrl(firstAttr(webpage, ".embed-container iframe", "src")));
    if (embedUrl && !ZapiksIE.suitable(embedUrl)) {
      return this.urlResult(embedUrl);
    }

    const videoResponsive = firstAttrs(webpage, ".video-responsive");
    const dataMediaUrl = urlOrNone(videoResponsive["data-media-url"]);
    if (dataMediaUrl && new URL(url).pathname === "/index.php") {
      return this.urlResult(dataMediaUrl, ZapiksIE);
    }

    const dataPlaylist = parsePlaylist(videoResponsive["data-playlist"]);
    const formats = (dataPlaylist.sources ?? []).flatMap((source) => {
      const sourceUrl = urlOrNone(source.file);
      if (!sourceUrl) {
        return [];
      }
      const formatId = strOrNone(source.label);
      return [{
        format_id: formatId ?? undefined,
        url: sourceUrl,
        ...parseResolution(formatId),
      }];
    });

    const userAttrs = firstAttrs(webpage, ".video-content-user-link");
    const uploaderHref = strOrNone(userAttrs.href);
    return {
      display_id: displayId,
      duration: parseDuration(this.htmlSearchMeta("duration", webpage) ?? undefined) ?? undefined,
      formats,
      timestamp: unifiedTimestamp(this.htmlSearchMeta("uploadDate", webpage) ?? undefined) ?? undefined,
      description: cleanHtml(firstText(webpage, ".description-text")) ?? undefined,
      tags: allAttrs(webpage, ".bs-label").map((attrs) => cleanHtml(attrs.title)).filter((item): item is string => Boolean(item)),
      view_count: intOrNone((cleanHtml(firstText(webpage, ".video-content-view-counter")) ?? "").replaceAll(/(?:vues|views|\s+)/g, "")) ?? undefined,
      uploader: cleanHtml(firstText(webpage, ".video-content-user-link")) ?? undefined,
      uploader_id: uploaderHref ? ZapiksIE.UPLOADER_ID_RE.exec(uploaderHref)?.groups?.id : undefined,
      id: strOrNone(dataPlaylist.mediaid) ?? undefined,
      title: cleanHtml(dataPlaylist.title) ?? undefined,
      thumbnail: urlOrNone(dataPlaylist.image) ?? undefined,
    };
  }
}

function parsePlaylist(value: string | null | undefined): ZapiksPlaylist {
  if (!value) {
    return {};
  }
  for (const candidate of [value, unescapeHTML(value)]) {
    if (!candidate) {
      continue;
    }
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (Array.isArray(parsed)) {
        return parsed[0] && typeof parsed[0] === "object" ? parsed[0] as ZapiksPlaylist : {};
      }
      return parsed && typeof parsed === "object" ? parsed as ZapiksPlaylist : {};
    } catch {
      continue;
    }
  }
  return {};
}

function firstAttr(html: string, selector: string, attr: string): string | null {
  return firstAttrs(html, selector)[attr] ?? null;
}

function firstAttrs(html: string, selector: string): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  let found = false;
  new HTMLRewriter()
    .on(selector, {
      element(element) {
        if (found) {
          return;
        }
        found = true;
        for (const [name, value] of element.attributes) {
          result[name] = value;
        }
      },
    })
    .transform(html);
  return result;
}

function allAttrs(html: string, selector: string): Array<Record<string, string | null>> {
  const results: Array<Record<string, string | null>> = [];
  new HTMLRewriter()
    .on(selector, {
      element(element) {
        const attrs: Record<string, string | null> = {};
        for (const [name, value] of element.attributes) {
          attrs[name] = value;
        }
        results.push(attrs);
      },
    })
    .transform(html);
  return results;
}

function firstText(html: string, selector: string): string | null {
  let collecting = false;
  let found = false;
  let text = "";
  new HTMLRewriter()
    .on(selector, {
      element(element) {
        if (found) {
          return;
        }
        found = true;
        collecting = true;
        element.onEndTag(() => {
          collecting = false;
        });
      },
      text(chunk) {
        if (collecting) {
          text += chunk.text;
        }
      },
    })
    .transform(html);
  return found ? text : null;
}
