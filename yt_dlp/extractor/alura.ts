// Source: yt_dlp/extractor/alura.py

import { InfoExtractor, type ExtractorInfo } from "./common.ts";
import {
  ExtractorError,
  cleanHtml,
  intOrNone,
  urlencodePostdata,
  urljoin,
} from "../utils/index.ts";

export class AluraIE extends InfoExtractor {
  static override readonly _VALID_URL = String.raw`https?://(?:cursos\.)?alura\.com\.br/course/(?<course_name>[^/]+)/task/(?<id>\d+)`;
  static readonly _LOGIN_URL = "https://cursos.alura.com.br/loginForm?urlAfterLogin=/loginForm";
  static readonly _VIDEO_URL = "https://cursos.alura.com.br/course/%s/task/%s/video";
  static readonly _NETRC_MACHINE = "alura";

  static override get IE_NAME(): string {
    return "alura";
  }

  protected override async realInitialize(): Promise<void> {
    const netrcMachine = (this.constructor as typeof AluraIE)._NETRC_MACHINE;
    const [username, password] = await this.getLoginInfo(netrcMachine);
    if (username && password) {
      await this.performLogin(username, password);
    }
  }

  protected async performLogin(username: string, password: string): Promise<void> {
    const loginPage = await this.downloadWebpage(
      AluraIE._LOGIN_URL,
      null,
      { note: "Downloading login popup" }
    );
    if (loginPage === false) {
      throw new ExtractorError("Unable to download login page");
    }

    const isLogged = (webpage: string) => {
      return webpage.includes("/signout") || webpage.includes("Logout");
    };

    if (isLogged(loginPage)) {
      return;
    }

    // Extract hidden inputs using HTMLRewriter
    const loginForm: Record<string, string> = {};
    new HTMLRewriter()
      .on("input", {
        element(el) {
          if (el.getAttribute("type") === "hidden") {
            const name = el.getAttribute("name");
            if (name) {
              loginForm[name] = el.getAttribute("value") ?? "";
            }
          }
        }
      })
      .transform(loginPage);

    loginForm["username"] = username;
    loginForm["password"] = password;

    let postUrl = this.searchRegex(
      String.raw`<form[^>]+class=["']signin-form["']\s+action=["'](?<url>.+?)["']`,
      loginPage,
      "post url",
      { defaultValue: AluraIE._LOGIN_URL, group: "url" }
    ) as string;

    if (!postUrl.startsWith("http")) {
      postUrl = urljoin(AluraIE._LOGIN_URL, postUrl);
    }

    const response = await this.downloadWebpage(
      postUrl,
      null,
      {
        note: "Logging in",
        data: urlencodePostdata(loginForm),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );

    if (response === false || !isLogged(response)) {
      const error = this.htmlSearchRegex(
        String.raw`<p[^>]+class="alert-message[^"]*">(?<error>.+?)</p>`,
        response || "",
        "error message",
        { defaultValue: null, group: "error" }
      );
      if (error) {
        throw new ExtractorError(`Unable to login: ${error}`, { expected: true });
      }
      throw new ExtractorError("Unable to log in");
    }
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const match = this.matchValidUrl(url);
    const course = match?.groups?.course_name;
    const videoId = match?.groups?.id;
    if (!course || !videoId) {
      throw new ExtractorError("Invalid Alura URL", { expected: true });
    }

    const videoUrl = `https://cursos.alura.com.br/course/${course}/task/${videoId}/video`;
    const videoDict = await this.downloadJson<any[] | false>(
      videoUrl,
      videoId,
      { note: "Searching for videos" }
    );

    if (!videoDict || videoDict === false) {
      throw new ExtractorError("No video found for this task", { expected: true });
    }

    const webpage = await this.downloadWebpage(url, videoId);
    if (webpage === false) {
      throw new ExtractorError("Unable to download webpage");
    }

    const rawTitle = this.searchRegex(
      String.raw`<span[^>]+class=(["'])task-body-header-title-text\1[^>]*>(?<title>[^<]+)`,
      webpage,
      "title",
      { group: "title" }
    ) as string;
    const videoTitle = cleanHtml(rawTitle) ?? rawTitle;

    const formats: any[] = [];
    for (const videoObj of videoDict) {
      const videoUrlM3u8 = videoObj?.mp4;
      if (!videoUrlM3u8) {
        continue;
      }
      const videoFormat = this.extractM3u8Formats(
        videoUrlM3u8,
        null,
        "mp4",
        { entryProtocol: "m3u8_native", m3u8Id: "hls", fatal: false }
      ) as any[];

      for (const f of videoFormat) {
        const m = /-([^-]+)\.mp4/.exec(f.url);
        if (m) {
          if (!f.height) {
            f.height = m[1] === "hd" ? 720 : 480;
          }
        }
      }
      formats.push(...videoFormat);
    }

    return {
      id: videoId,
      title: videoTitle,
      formats,
    };
  }
}

export class AluraCourseIE extends AluraIE {
  static override readonly _VALID_URL = String.raw`https?://(?:cursos\.)?alura\.com\.br/course/(?<id>[^/]+)`;
  static override readonly _LOGIN_URL = "https://cursos.alura.com.br/loginForm?urlAfterLogin=/loginForm";
  static override readonly _NETRC_MACHINE = "aluracourse";

  static override get IE_NAME(): string {
    return "alura:course";
  }

  static override suitable(url: string): boolean {
    return AluraIE.suitable(url) ? false : super.suitable(url);
  }

  protected override async realExtract(url: string): Promise<ExtractorInfo> {
    const coursePath = this.matchId(url);
    const webpage = await this.downloadWebpage(url, coursePath);
    if (webpage === false) {
      throw new ExtractorError("Unable to download course webpage");
    }

    const courseTitle = this.searchRegex(
      String.raw`<h1.*?>(.*?)<strong>(?<course_title>.*?)</strong></h[0-9]>`,
      webpage,
      "course title",
      { defaultValue: coursePath, group: "course_title" }
    ) as string;

    const sectionPaths: string[] = [];
    new HTMLRewriter()
      .on("a", {
        element(el) {
          const className = el.getAttribute("class") ?? "";
          if (/\bcourseSectionList-section\b/.test(className)) {
            const href = el.getAttribute("href");
            if (href) {
              sectionPaths.push(href);
            }
          }
        }
      })
      .transform(webpage);

    const entries: ExtractorInfo[] = [];

    for (const path of sectionPaths) {
      const pageUrl = urljoin(url, path);
      const sectionPathHtml = await this.downloadWebpage(pageUrl, coursePath);
      if (sectionPathHtml === false) {
        continue;
      }

      let chapterTitle = "";
      let chapterNumberText = "";
      let insideChapterTitle = false;
      let insideChapterNumber = false;

      const videoPaths: Array<{ href: string; chapter: string; chapterNumber: number | null }> = [];

      new HTMLRewriter()
        .on("h3", {
          element(el) {
            const className = el.getAttribute("class") ?? "";
            if (/\btask-menu-section-title-text\b/.test(className)) {
              insideChapterTitle = true;
              chapterTitle = "";
              el.onEndTag(() => {
                insideChapterTitle = false;
              });
            }
          }
        })
        .on("span", {
          element(el) {
            const className = el.getAttribute("class") ?? "";
            if (/\btask-menu-section-title-number\b/.test(className)) {
              insideChapterNumber = true;
              chapterNumberText = "";
              el.onEndTag(() => {
                insideChapterNumber = false;
              });
            }
          }
        })
        .on("a", {
          element(el) {
            const className = el.getAttribute("class") ?? "";
            if (/\btask-menu-nav-item-link-VIDEO\b/.test(className)) {
              const href = el.getAttribute("href");
              if (href) {
                videoPaths.push({
                  href,
                  chapter: chapterTitle.trim(),
                  chapterNumber: intOrNone(chapterNumberText.trim())
                });
              }
            }
          }
        })
        .onText({
          text(text) {
            if (insideChapterTitle) {
              chapterTitle += text.text;
            }
            if (insideChapterNumber) {
              chapterNumberText += text.text;
            }
          }
        })
        .transform(sectionPathHtml);

      for (const vp of videoPaths) {
        const videoUrl = urljoin(url, vp.href);
        const entryId = this.matchId(videoUrl);
        entries.push({
          _type: "url_transparent",
          id: entryId,
          url: videoUrl,
          ie_key: "Alura",
          chapter: vp.chapter || undefined,
          chapter_number: vp.chapterNumber ?? undefined,
        });
      }
    }

    return this.playlistResult(entries, coursePath, courseTitle);
  }
}
