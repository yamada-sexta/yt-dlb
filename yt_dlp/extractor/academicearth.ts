// Source: yt_dlp/extractor/academicearth.py

import { InfoExtractor, type ExtractorInfo } from "./common.ts";

export class AcademicEarthCourseIE extends InfoExtractor {
  static override readonly _VALID_URL =
    String.raw`https?://(?:www\.)?academicearth\.org/playlists/(?<id>[^?#/]+)`;

  static override get IE_NAME(): string {
    return "AcademicEarth:Course";
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const playlistId = this.matchId(url);
    const webpage = await this.downloadWebpage(url, playlistId);
    if (webpage === false) {
      throw new Error("Unable to download AcademicEarth playlist page");
    }
    const title = this.htmlSearchRegex(
      /<h1 class="playlist-name"[^>]*?>(.*?)<\/h1>/,
      webpage,
      "title",
    );
    const description = this.htmlSearchRegex(
      /<p class="excerpt"[^>]*?>(.*?)<\/p>/,
      webpage,
      "description",
      { fatal: false },
    );
    const entries = [
      ...webpage.matchAll(
        /<li class="lecture-preview">\s*?<a target="_blank" href="([^"]+)">/g,
      ),
    ].map((match) => this.urlResult(match[1] ?? ""));
    return this.playlistResult(
      entries,
      playlistId,
      typeof title === "string" ? title : null,
      typeof description === "string" ? description : null,
    );
  }
}
