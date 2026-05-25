// Source: test/test_postprocessors.py

import { describe, expect, test } from "bun:test";
import { $ } from "bun";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ExecPP } from "../yt_dlp/postprocessor/exec.ts";
import { FFmpegPostProcessor, FFmpegThumbnailsConvertorPP } from "../yt_dlp/postprocessor/ffmpeg.ts";
import { MetadataFromFieldPP, MetadataParserPP } from "../yt_dlp/postprocessor/metadataparser.ts";
import { ModifyChaptersPP } from "../yt_dlp/postprocessor/modify-chapters.ts";
import { SponsorBlockPP } from "../yt_dlp/postprocessor/sponsorblock.ts";

type Chapter = {
  start_time: number;
  end_time: number;
  title?: string;
  remove?: boolean;
  _categories?: Array<[string, number, number, string]>;
  [key: string]: unknown;
};

class TestModifyChaptersPP extends ModifyChaptersPP {
  arrange(chapters: Chapter[]): [Chapter[], Chapter[]] {
    return (this as unknown as {
      removeMarkedArrangeSponsors(input: Chapter[]): [Chapter[], Chapter[]];
    }).removeMarkedArrangeSponsors(chapters);
  }

  concatSpecPublic(inputFiles: readonly string[], concatOpts: Array<Record<string, unknown>>): string[] {
    return this.concatSpec(inputFiles, concatOpts);
  }
}

const fakeDownloader = {
  params: {},
  evaluateOuttmpl(template: string, info: Record<string, unknown>) {
    return template.replaceAll(/%\(([^)]+)\)([slq])/g, (_match, key: string, type: string) => {
      const value = info[key];
      if (type === "l" && Array.isArray(value)) {
        return value.join(", ");
      }
      return value == null ? "" : String(value);
    });
  },
  toScreen() {},
  reportWarning() {},
  reportError() {},
  writeDebug() {},
  async urlopen(url: string | URL | Request) {
    return await fetch(url);
  },
};

describe("metadata postprocessors", () => {
  test("test_format_to_regex", () => {
    expect(MetadataParserPP.formatToRegex("%(title)s - %(artist)s")).toBe("(?<title>.+)\\ \\-\\ (?<artist>.+)");
    expect(MetadataParserPP.formatToRegex("(?P<x>.+)")).toBe("(?P<x>.+)");
    expect(MetadataParserPP.formatToRegex("text (?P<x>.+)")).toBe("text (?P<x>.+)");
    expect(MetadataParserPP.formatToRegex("x")).toBe("(?<x>.+)");
    expect(MetadataParserPP.formatToRegex("Field_Name1")).toBe("(?<Field_Name1>.+)");
    expect(MetadataParserPP.formatToRegex("é")).toBe("(?<é>.+)");
    expect(MetadataParserPP.formatToRegex("invalid ")).toBe("invalid ");
  });

  test("test_field_to_template", () => {
    expect(MetadataParserPP.fieldToTemplate("title")).toBe("%(title)s");
    expect(MetadataParserPP.fieldToTemplate("1")).toBe("1");
    expect(MetadataParserPP.fieldToTemplate("foo bar")).toBe("foo bar");
    expect(MetadataParserPP.fieldToTemplate(" literal")).toBe(" literal");
  });

  test("test_metadatafromfield", () => {
    expect(MetadataFromFieldPP.toAction("%(title)s \\: %(artist)s:%(title)s : %(artist)s")).toEqual([
      MetadataParserPP.Actions.INTERPRET,
      "%(title)s : %(artist)s",
      "%(title)s : %(artist)s",
    ]);
  });
});

describe("ExecPP", () => {
  test("test_parse_cmd", () => {
    const pp = new ExecPP(fakeDownloader, "");
    const info = { filepath: "file name" };
    const cmd = "echo 'file name'";

    expect(pp.parseCmd("echo", info)).toBe(cmd);
    expect(pp.parseCmd("echo {}", info)).toBe(cmd);
    expect(pp.parseCmd("echo %(filepath)q", info)).toBe("echo %(filepath)q 'file name'");
  });
});

describe("FFmpegThumbnailsConvertorPP", () => {
  test("test_escaping", async () => {
    const pp = new FFmpegThumbnailsConvertorPP(fakeDownloader);
    if (!pp.available || !pp.executable) {
      return;
    }

    const root = await mkdtemp(join(tmpdir(), "ytdlb-thumbnails-"));
    try {
      const dir = join(root, "foo %d bar");
      await mkdir(dir);
      const generatedFile = join(root, "empty.webp");
      const generate = [
        pp.executable,
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=black:s=320x320",
        "-c:v",
        "libwebp",
        "-pix_fmt",
        "yuv420p",
        "-vframes",
        "1",
        generatedFile,
      ];
      await $`${generate}`.quiet();

      const file = join(dir, "foo_%d");
      const initialFile = `${file}.webp`;
      await rename(generatedFile, initialFile);

      for (const [inputExt, outputExt] of [["webp", "png"], ["png", "jpg"]] as const) {
        const outputFile = `${file}.${outputExt}`;
        await pp.convertThumbnail(`${file}.${inputExt}`, outputExt);
        expect(await Bun.file(outputFile).exists()).toBe(true);
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("ModifyChaptersPP", () => {
  const pp = new TestModifyChaptersPP(fakeDownloader);

  const chapterArrangementCases: Array<{ name: string; chapters: Chapter[]; expected: Chapter[]; removed: Chapter[] }> = [
    {
      name: "CanGetThroughUnaltered",
      chapters: [...chapters([10, 20, 30, 40], ["c1", "c2", "c3", "c4"])],
      expected: chapters([10, 20, 30, 40], ["c1", "c2", "c3", "c4"]),
      removed: [],
    },
    {
      name: "ChapterWithSponsors",
      chapters: [
        ...chapters([70], ["c"]),
        sponsorChapter(10, 20, "sponsor"),
        sponsorChapter(30, 40, "preview"),
        sponsorChapter(50, 60, "filler"),
      ],
      expected: chapters(
        [10, 20, 30, 40, 50, 60, 70],
        ["c", "[SponsorBlock]: Sponsor", "c", "[SponsorBlock]: Preview/Recap", "c", "[SponsorBlock]: Filler Tangent", "c"],
      ),
      removed: [],
    },
    {
      name: "ChapterWithCuts",
      chapters: [
        ...chapters([70], ["c"]),
        chapter(10, 20, undefined, true),
        sponsorChapter(30, 40, "sponsor", true),
        chapter(50, 60, undefined, true),
      ],
      expected: chapters([40], ["c"]),
      removed: [
        chapter(10, 20, undefined, true),
        chapter(30, 40, undefined, true),
        chapter(50, 60, undefined, true),
      ],
    },
    {
      name: "ChapterWithSponsorsAndCuts",
      chapters: [
        ...chapters([70], ["c"]),
        sponsorChapter(10, 20, "sponsor"),
        sponsorChapter(30, 40, "selfpromo", true),
        sponsorChapter(50, 60, "interaction"),
      ],
      expected: chapters([10, 20, 40, 50, 60], ["c", "[SponsorBlock]: Sponsor", "c", "[SponsorBlock]: Interaction Reminder", "c"]),
      removed: [chapter(30, 40, undefined, true)],
    },
    {
      name: "ChapterWithSponsorCutInTheMiddle",
      chapters: [
        ...chapters([70], ["c"]),
        sponsorChapter(10, 60, "sponsor"),
        sponsorChapter(20, 30, "selfpromo", true),
        chapter(40, 50, undefined, true),
      ],
      expected: chapters([10, 40, 50], ["c", "[SponsorBlock]: Sponsor", "c"]),
      removed: [chapter(20, 30, undefined, true), chapter(40, 50, undefined, true)],
    },
    {
      name: "ChapterWithCutHidingSponsor",
      chapters: [
        ...chapters([60], ["c"]),
        sponsorChapter(10, 20, "intro"),
        sponsorChapter(30, 40, "sponsor"),
        sponsorChapter(50, 60, "outro"),
        sponsorChapter(20, 50, "selfpromo", true),
      ],
      expected: chapters([10, 20, 30], ["c", "[SponsorBlock]: Intermission/Intro Animation", "[SponsorBlock]: Endcards/Credits"]),
      removed: [chapter(20, 50, undefined, true)],
    },
    {
      name: "ChapterWithAdjacentSponsors",
      chapters: [
        ...chapters([70], ["c"]),
        sponsorChapter(10, 20, "sponsor"),
        sponsorChapter(20, 30, "selfpromo"),
        sponsorChapter(30, 40, "interaction"),
      ],
      expected: chapters([10, 20, 30, 40, 70], ["c", "[SponsorBlock]: Sponsor", "[SponsorBlock]: Unpaid/Self Promotion", "[SponsorBlock]: Interaction Reminder", "c"]),
      removed: [],
    },
    {
      name: "ChapterWithAdjacentCuts",
      chapters: [
        ...chapters([70], ["c"]),
        sponsorChapter(10, 20, "sponsor"),
        sponsorChapter(20, 30, "interaction", true),
        chapter(30, 40, undefined, true),
        sponsorChapter(40, 50, "selfpromo", true),
        sponsorChapter(50, 60, "interaction"),
      ],
      expected: chapters([10, 20, 30, 40], ["c", "[SponsorBlock]: Sponsor", "[SponsorBlock]: Interaction Reminder", "c"]),
      removed: [chapter(20, 50, undefined, true)],
    },
    {
      name: "ChapterWithOverlappingSponsors",
      chapters: [
        ...chapters([70], ["c"]),
        sponsorChapter(10, 30, "sponsor"),
        sponsorChapter(20, 50, "selfpromo"),
        sponsorChapter(40, 60, "interaction"),
      ],
      expected: chapters(
        [10, 20, 30, 40, 50, 60, 70],
        ["c", "[SponsorBlock]: Sponsor", "[SponsorBlock]: Sponsor, Unpaid/Self Promotion", "[SponsorBlock]: Unpaid/Self Promotion", "[SponsorBlock]: Unpaid/Self Promotion, Interaction Reminder", "[SponsorBlock]: Interaction Reminder", "c"],
      ),
      removed: [],
    },
    {
      name: "ChapterWithOverlappingCuts",
      chapters: [
        ...chapters([70], ["c"]),
        sponsorChapter(10, 30, "sponsor", true),
        sponsorChapter(20, 50, "selfpromo", true),
        sponsorChapter(40, 60, "interaction", true),
      ],
      expected: chapters([20], ["c"]),
      removed: [chapter(10, 60, undefined, true)],
    },
    {
      name: "ChapterWithRunsOfOverlappingSponsors",
      chapters: [
        ...chapters([170], ["c"]),
        sponsorChapter(0, 30, "intro"),
        sponsorChapter(20, 50, "sponsor"),
        sponsorChapter(40, 60, "selfpromo"),
        sponsorChapter(70, 90, "sponsor"),
        sponsorChapter(80, 100, "sponsor"),
        sponsorChapter(90, 110, "sponsor"),
        sponsorChapter(120, 140, "selfpromo"),
        sponsorChapter(130, 160, "interaction"),
        sponsorChapter(150, 170, "outro"),
      ],
      expected: chapters(
        [20, 30, 40, 50, 60, 70, 110, 120, 130, 140, 150, 160, 170],
        [
          "[SponsorBlock]: Intermission/Intro Animation",
          "[SponsorBlock]: Intermission/Intro Animation, Sponsor",
          "[SponsorBlock]: Sponsor",
          "[SponsorBlock]: Sponsor, Unpaid/Self Promotion",
          "[SponsorBlock]: Unpaid/Self Promotion",
          "c",
          "[SponsorBlock]: Sponsor",
          "c",
          "[SponsorBlock]: Unpaid/Self Promotion",
          "[SponsorBlock]: Unpaid/Self Promotion, Interaction Reminder",
          "[SponsorBlock]: Interaction Reminder",
          "[SponsorBlock]: Interaction Reminder, Endcards/Credits",
          "[SponsorBlock]: Endcards/Credits",
        ],
      ),
      removed: [],
    },
    {
      name: "ChapterWithRunsOfOverlappingCuts",
      chapters: [
        ...chapters([170], ["c"]),
        chapter(0, 30, undefined, true),
        sponsorChapter(20, 50, "sponsor", true),
        chapter(40, 60, undefined, true),
        sponsorChapter(70, 90, "sponsor", true),
        chapter(80, 100, undefined, true),
        chapter(90, 110, undefined, true),
        sponsorChapter(120, 140, "sponsor", true),
        sponsorChapter(130, 160, "selfpromo", true),
        chapter(150, 170, undefined, true),
      ],
      expected: chapters([20], ["c"]),
      removed: [chapter(0, 60, undefined, true), chapter(70, 110, undefined, true), chapter(120, 170, undefined, true)],
    },
    {
      name: "OverlappingSponsorsDifferentTitlesAfterCut",
      chapters: [
        ...chapters([60], ["c"]),
        sponsorChapter(10, 60, "sponsor"),
        sponsorChapter(10, 40, "intro"),
        sponsorChapter(30, 50, "interaction"),
        sponsorChapter(30, 50, "selfpromo", true),
        sponsorChapter(40, 50, "interaction"),
        sponsorChapter(50, 60, "outro"),
      ],
      expected: chapters([10, 30, 40], ["c", "[SponsorBlock]: Sponsor, Intermission/Intro Animation", "[SponsorBlock]: Sponsor, Endcards/Credits"]),
      removed: [chapter(30, 50, undefined, true)],
    },
    {
      name: "SponsorsNoLongerOverlapAfterCut",
      chapters: [
        ...chapters([70], ["c"]),
        sponsorChapter(10, 30, "sponsor"),
        sponsorChapter(20, 50, "interaction"),
        sponsorChapter(30, 50, "selfpromo", true),
        sponsorChapter(40, 60, "sponsor"),
        sponsorChapter(50, 60, "interaction"),
      ],
      expected: chapters([10, 20, 40, 50], ["c", "[SponsorBlock]: Sponsor", "[SponsorBlock]: Sponsor, Interaction Reminder", "c"]),
      removed: [chapter(30, 50, undefined, true)],
    },
    {
      name: "SponsorsStillOverlapAfterCut",
      chapters: [
        ...chapters([70], ["c"]),
        sponsorChapter(10, 60, "sponsor"),
        sponsorChapter(20, 60, "interaction"),
        sponsorChapter(30, 50, "selfpromo", true),
      ],
      expected: chapters([10, 20, 40, 50], ["c", "[SponsorBlock]: Sponsor", "[SponsorBlock]: Sponsor, Interaction Reminder", "c"]),
      removed: [chapter(30, 50, undefined, true)],
    },
    {
      name: "ChapterWithRunsOfOverlappingSponsorsAndCuts",
      chapters: [
        ...chapters([200], ["c"]),
        sponsorChapter(10, 40, "sponsor"),
        sponsorChapter(10, 30, "intro"),
        chapter(20, 30, undefined, true),
        sponsorChapter(30, 40, "selfpromo"),
        sponsorChapter(50, 70, "sponsor"),
        sponsorChapter(60, 80, "interaction"),
        chapter(70, 80, undefined, true),
        sponsorChapter(70, 90, "sponsor"),
        sponsorChapter(80, 100, "interaction"),
        sponsorChapter(120, 170, "selfpromo"),
        sponsorChapter(130, 180, "outro"),
        chapter(140, 150, undefined, true),
        chapter(150, 160, undefined, true),
      ],
      expected: chapters(
        [10, 20, 30, 40, 50, 70, 80, 100, 110, 130, 140, 160],
        [
          "c",
          "[SponsorBlock]: Sponsor, Intermission/Intro Animation",
          "[SponsorBlock]: Sponsor, Unpaid/Self Promotion",
          "c",
          "[SponsorBlock]: Sponsor",
          "[SponsorBlock]: Sponsor, Interaction Reminder",
          "[SponsorBlock]: Interaction Reminder",
          "c",
          "[SponsorBlock]: Unpaid/Self Promotion",
          "[SponsorBlock]: Unpaid/Self Promotion, Endcards/Credits",
          "[SponsorBlock]: Endcards/Credits",
          "c",
        ],
      ),
      removed: [chapter(20, 30, undefined, true), chapter(70, 80, undefined, true), chapter(140, 160, undefined, true)],
    },
    {
      name: "SponsorOverlapsMultipleChapters",
      chapters: [
        ...chapters([20, 40, 60, 80, 100], ["c1", "c2", "c3", "c4", "c5"]),
        sponsorChapter(10, 90, "sponsor"),
      ],
      expected: chapters([10, 90, 100], ["c1", "[SponsorBlock]: Sponsor", "c5"]),
      removed: [],
    },
    {
      name: "CutOverlapsMultipleChapters",
      chapters: [
        ...chapters([20, 40, 60, 80, 100], ["c1", "c2", "c3", "c4", "c5"]),
        chapter(10, 90, undefined, true),
      ],
      expected: chapters([10, 20], ["c1", "c5"]),
      removed: [chapter(10, 90, undefined, true)],
    },
    {
      name: "SponsorsWithinSomeChaptersAndOverlappingOthers",
      chapters: [
        ...chapters([10, 40, 60, 80], ["c1", "c2", "c3", "c4"]),
        sponsorChapter(20, 30, "sponsor"),
        sponsorChapter(50, 70, "selfpromo"),
      ],
      expected: chapters([10, 20, 30, 40, 50, 70, 80], ["c1", "c2", "[SponsorBlock]: Sponsor", "c2", "c3", "[SponsorBlock]: Unpaid/Self Promotion", "c4"]),
      removed: [],
    },
    {
      name: "CutsWithinSomeChaptersAndOverlappingOthers",
      chapters: [
        ...chapters([10, 40, 60, 80], ["c1", "c2", "c3", "c4"]),
        chapter(20, 30, undefined, true),
        chapter(50, 70, undefined, true),
      ],
      expected: chapters([10, 30, 40, 50], ["c1", "c2", "c3", "c4"]),
      removed: [chapter(20, 30, undefined, true), chapter(50, 70, undefined, true)],
    },
    {
      name: "ChaptersAfterLastSponsor",
      chapters: [
        ...chapters([20, 40, 50, 60], ["c1", "c2", "c3", "c4"]),
        sponsorChapter(10, 30, "music_offtopic"),
      ],
      expected: chapters([10, 30, 40, 50, 60], ["c1", "[SponsorBlock]: Non-Music Section", "c2", "c3", "c4"]),
      removed: [],
    },
    {
      name: "ChaptersAfterLastCut",
      chapters: [
        ...chapters([20, 40, 50, 60], ["c1", "c2", "c3", "c4"]),
        chapter(10, 30, undefined, true),
      ],
      expected: chapters([10, 20, 30, 40], ["c1", "c2", "c3", "c4"]),
      removed: [chapter(10, 30, undefined, true)],
    },
    {
      name: "SponsorStartsAtChapterStart",
      chapters: [
        ...chapters([10, 20, 40], ["c1", "c2", "c3"]),
        sponsorChapter(20, 30, "sponsor"),
      ],
      expected: chapters([10, 20, 30, 40], ["c1", "c2", "[SponsorBlock]: Sponsor", "c3"]),
      removed: [],
    },
    {
      name: "CutStartsAtChapterStart",
      chapters: [
        ...chapters([10, 20, 40], ["c1", "c2", "c3"]),
        chapter(20, 30, undefined, true),
      ],
      expected: chapters([10, 20, 30], ["c1", "c2", "c3"]),
      removed: [chapter(20, 30, undefined, true)],
    },
    {
      name: "SponsorEndsAtChapterEnd",
      chapters: [
        ...chapters([10, 30, 40], ["c1", "c2", "c3"]),
        sponsorChapter(20, 30, "sponsor"),
      ],
      expected: chapters([10, 20, 30, 40], ["c1", "c2", "[SponsorBlock]: Sponsor", "c3"]),
      removed: [],
    },
    {
      name: "CutEndsAtChapterEnd",
      chapters: [
        ...chapters([10, 30, 40], ["c1", "c2", "c3"]),
        chapter(20, 30, undefined, true),
      ],
      expected: chapters([10, 20, 30], ["c1", "c2", "c3"]),
      removed: [chapter(20, 30, undefined, true)],
    },
    {
      name: "SponsorCoincidesWithChapters",
      chapters: [
        ...chapters([10, 20, 30, 40], ["c1", "c2", "c3", "c4"]),
        sponsorChapter(10, 30, "sponsor"),
      ],
      expected: chapters([10, 30, 40], ["c1", "[SponsorBlock]: Sponsor", "c4"]),
      removed: [],
    },
    {
      name: "CutCoincidesWithChapters",
      chapters: [
        ...chapters([10, 20, 30, 40], ["c1", "c2", "c3", "c4"]),
        chapter(10, 30, undefined, true),
      ],
      expected: chapters([10, 20], ["c1", "c4"]),
      removed: [chapter(10, 30, undefined, true)],
    },
    {
      name: "SponsorsAtVideoBoundaries",
      chapters: [
        ...chapters([20, 40, 60], ["c1", "c2", "c3"]),
        sponsorChapter(0, 10, "intro"),
        sponsorChapter(50, 60, "outro"),
      ],
      expected: chapters([10, 20, 40, 50, 60], ["[SponsorBlock]: Intermission/Intro Animation", "c1", "c2", "c3", "[SponsorBlock]: Endcards/Credits"]),
      removed: [],
    },
    {
      name: "CutsAtVideoBoundaries",
      chapters: [
        ...chapters([20, 40, 60], ["c1", "c2", "c3"]),
        chapter(0, 10, undefined, true),
        chapter(50, 60, undefined, true),
      ],
      expected: chapters([10, 30, 40], ["c1", "c2", "c3"]),
      removed: [chapter(0, 10, undefined, true), chapter(50, 60, undefined, true)],
    },
    {
      name: "SponsorsOverlapChaptersAtVideoBoundaries",
      chapters: [
        ...chapters([10, 40, 50], ["c1", "c2", "c3"]),
        sponsorChapter(0, 20, "intro"),
        sponsorChapter(30, 50, "outro"),
      ],
      expected: chapters([20, 30, 50], ["[SponsorBlock]: Intermission/Intro Animation", "c2", "[SponsorBlock]: Endcards/Credits"]),
      removed: [],
    },
    {
      name: "CutsOverlapChaptersAtVideoBoundaries",
      chapters: [
        ...chapters([10, 40, 50], ["c1", "c2", "c3"]),
        chapter(0, 20, undefined, true),
        chapter(30, 50, undefined, true),
      ],
      expected: chapters([10], ["c2"]),
      removed: [chapter(0, 20, undefined, true), chapter(30, 50, undefined, true)],
    },
    {
      name: "EverythingSponsored",
      chapters: [
        ...chapters([10, 20, 30, 40], ["c1", "c2", "c3", "c4"]),
        sponsorChapter(0, 20, "intro"),
        sponsorChapter(20, 40, "outro"),
      ],
      expected: chapters([20, 40], ["[SponsorBlock]: Intermission/Intro Animation", "[SponsorBlock]: Endcards/Credits"]),
      removed: [],
    },
    {
      name: "EverythingCut",
      chapters: [
        ...chapters([10, 20, 30, 40], ["c1", "c2", "c3", "c4"]),
        chapter(0, 20, undefined, true),
        chapter(20, 40, undefined, true),
      ],
      expected: [],
      removed: [chapter(0, 40, undefined, true)],
    },
    {
      name: "TinyChaptersInTheOriginalArePreserved",
      chapters: chapters([0.1, 0.2, 0.3, 0.4], ["c1", "c2", "c3", "c4"]),
      expected: chapters([0.1, 0.2, 0.3, 0.4], ["c1", "c2", "c3", "c4"]),
      removed: [],
    },
    {
      name: "TinySponsorsAreIgnored",
      chapters: [
        sponsorChapter(0, 0.1, "intro"),
        chapter(0.1, 0.2, "c1"),
        sponsorChapter(0.2, 0.3, "sponsor"),
        chapter(0.3, 0.4, "c2"),
        sponsorChapter(0.4, 0.5, "outro"),
      ],
      expected: chapters([0.3, 0.5], ["c1", "c2"]),
      removed: [],
    },
    {
      name: "TinyChaptersResultingFromCutsAreIgnored",
      chapters: [
        ...chapters([2, 3, 3.5], ["c1", "c2", "c3"]),
        chapter(1.5, 2.5, undefined, true),
      ],
      expected: chapters([2, 2.5], ["c1", "c3"]),
      removed: [chapter(1.5, 2.5, undefined, true)],
    },
    {
      name: "SingleTinyChapterIsPreserved",
      chapters: [
        ...chapters([2], ["c"]),
        chapter(0.5, 2, undefined, true),
      ],
      expected: chapters([0.5], ["c"]),
      removed: [chapter(0.5, 2, undefined, true)],
    },
    {
      name: "TinyChapterAtTheStartPrependedToTheNext",
      chapters: [
        ...chapters([2, 4], ["c1", "c2"]),
        chapter(0.5, 2, undefined, true),
      ],
      expected: chapters([2.5], ["c2"]),
      removed: [chapter(0.5, 2, undefined, true)],
    },
    {
      name: "TinyChaptersResultingFromSponsorOverlapAreIgnored",
      chapters: [
        ...chapters([1, 3, 4], ["c1", "c2", "c3"]),
        sponsorChapter(1.5, 2.5, "sponsor"),
      ],
      expected: chapters([1.5, 2.5, 4], ["c1", "[SponsorBlock]: Sponsor", "c3"]),
      removed: [],
    },
    {
      name: "TinySponsorsOverlapsAreIgnored",
      chapters: [
        ...chapters([2, 3, 5], ["c1", "c2", "c3"]),
        sponsorChapter(1, 3, "sponsor"),
        sponsorChapter(2.5, 4, "selfpromo"),
      ],
      expected: chapters([1, 3, 4, 5], ["c1", "[SponsorBlock]: Sponsor", "[SponsorBlock]: Unpaid/Self Promotion", "c3"]),
      removed: [],
    },
    {
      name: "TinySponsorsPrependedToTheNextSponsor",
      chapters: [
        ...chapters([4], ["c"]),
        sponsorChapter(1.5, 2, "sponsor"),
        sponsorChapter(2, 4, "selfpromo"),
      ],
      expected: chapters([1.5, 4], ["c", "[SponsorBlock]: Unpaid/Self Promotion"]),
      removed: [],
    },
  ];

  test.each(chapterArrangementCases)("test_remove_marked_arrange_sponsors_$name", ({ chapters: input, expected, removed }) => {
    const [actualChapters, actualRemoved] = pp.arrange(input);
    expect(normalizeChapters(actualChapters)).toEqual(expected);
    expect(normalizeRemoved(actualRemoved)).toEqual(removed);
  });

  test("test_remove_marked_arrange_sponsors_SponsorBlockChapters", () => {
    const [actualChapters, actualRemoved] = pp.arrange([
      ...chapters([70], ["c"]),
      sponsorChapter(10, 20, "chapter", false, "sb c1"),
      sponsorChapter(15, 16, "chapter", false, "sb c2"),
      sponsorChapter(30, 40, "preview"),
      sponsorChapter(50, 60, "filler"),
    ]);
    expect(normalizeChapters(actualChapters)).toEqual(chapters(
      [10, 15, 16, 20, 30, 40, 50, 60, 70],
      ["c", "[SponsorBlock]: sb c1", "[SponsorBlock]: sb c1, sb c2", "[SponsorBlock]: sb c1", "c", "[SponsorBlock]: Preview/Recap", "c", "[SponsorBlock]: Filler Tangent", "c"],
    ));
    expect(normalizeRemoved(actualRemoved)).toEqual([]);
  });

  test("test_remove_marked_arrange_sponsors_UniqueNamesForOverlappingSponsors", () => {
    const [actualChapters, actualRemoved] = pp.arrange([
      ...chapters([120], ["c"]),
      sponsorChapter(10, 45, "sponsor"),
      sponsorChapter(20, 40, "selfpromo"),
      sponsorChapter(50, 70, "sponsor"),
      sponsorChapter(60, 85, "selfpromo"),
      sponsorChapter(90, 120, "selfpromo"),
      sponsorChapter(100, 110, "sponsor"),
    ]);
    expect(normalizeChapters(actualChapters)).toEqual(chapters(
      [10, 20, 40, 45, 50, 60, 70, 85, 90, 100, 110, 120],
      [
        "c",
        "[SponsorBlock]: Sponsor",
        "[SponsorBlock]: Sponsor, Unpaid/Self Promotion",
        "[SponsorBlock]: Sponsor",
        "c",
        "[SponsorBlock]: Sponsor",
        "[SponsorBlock]: Sponsor, Unpaid/Self Promotion",
        "[SponsorBlock]: Unpaid/Self Promotion",
        "c",
        "[SponsorBlock]: Unpaid/Self Promotion",
        "[SponsorBlock]: Unpaid/Self Promotion, Sponsor",
        "[SponsorBlock]: Unpaid/Self Promotion",
      ],
    ));
    expect(normalizeRemoved(actualRemoved)).toEqual([]);
  });

  test("test_remove_marked_arrange_sponsors_SmallestSponsorInTheOverlapGetsNamed", () => {
    const namedPp = new TestModifyChaptersPP(fakeDownloader, null, null, null, { sponsorblock_chapter_title: "[SponsorBlock]: %(name)s" });
    const [actualChapters, actualRemoved] = namedPp.arrange([
      ...chapters([10], ["c"]),
      sponsorChapter(2, 8, "sponsor"),
      sponsorChapter(4, 6, "selfpromo"),
    ]);
    expect(normalizeChapters(actualChapters)).toEqual(chapters(
      [2, 4, 6, 8, 10],
      ["c", "[SponsorBlock]: Sponsor", "[SponsorBlock]: Unpaid/Self Promotion", "[SponsorBlock]: Sponsor", "c"],
    ));
    expect(normalizeRemoved(actualRemoved)).toEqual([]);
  });

  test("test_make_concat_opts common cases", () => {
    const common = ModifyChaptersPP.makeConcatOpts([chapter(1, 2, "s1"), chapter(10, 20, "s2")], 30);
    expect(pp.concatSpecPublic(["test", "test", "test"], common).join("")).toBe(
      "ffconcat version 1.0\n"
      + "file 'file:test'\n"
      + "outpoint 1.000000\n"
      + "file 'file:test'\n"
      + "inpoint 2.000000\n"
      + "outpoint 10.000000\n"
      + "file 'file:test'\n"
      + "inpoint 20.000000\n",
    );

    const start = ModifyChaptersPP.makeConcatOpts([chapter(0, 1, "s1"), chapter(10, 20, "s2")], 30);
    expect(pp.concatSpecPublic(["test", "test"], start).join("")).toBe(
      "ffconcat version 1.0\n"
      + "file 'file:test'\n"
      + "inpoint 1.000000\n"
      + "outpoint 10.000000\n"
      + "file 'file:test'\n"
      + "inpoint 20.000000\n",
    );

    const end = ModifyChaptersPP.makeConcatOpts([chapter(1, 2, "s1"), chapter(10, 20, "s2")], 20);
    expect(pp.concatSpecPublic(["test", "test"], end).join("")).toBe(
      "ffconcat version 1.0\n"
      + "file 'file:test'\n"
      + "outpoint 1.000000\n"
      + "file 'file:test'\n"
      + "inpoint 2.000000\n"
      + "outpoint 10.000000\n",
    );
  });

  test("test_quote_for_concat", () => {
    expect(FFmpegPostProcessor.quoteForFfmpeg("special ' ''characters'''galore")).toBe("'special '\\'' '\\'\\''characters'\\'\\'\\''galore'");
    expect(FFmpegPostProcessor.quoteForFfmpeg("'''special ' characters ' galore")).toBe("'\\'\\'\\''special '\\'' characters '\\'' galore'");
    expect(FFmpegPostProcessor.quoteForFfmpeg("special ' characters ' galore'''")).toBe("'special '\\'' characters '\\'' galore'\\'\\'\\''");
  });
});

function sponsorChapter(start: number, end: number, category: string, remove = false, title = SponsorBlockPP.CATEGORIES[category] ?? category): Chapter {
  return {
    start_time: start,
    end_time: end,
    _categories: [[category, start, end, title]],
    ...(remove ? { remove: true } : {}),
  };
}

function chapter(start: number, end: number, title?: string, remove = false): Chapter {
  return {
    start_time: start,
    end_time: end,
    ...(title !== undefined ? { title } : {}),
    ...(remove ? { remove: true } : {}),
  };
}

function chapters(ends: readonly number[], titles: readonly string[]): Chapter[] {
  let start = 0;
  return ends.map((end, index) => {
    const item = chapter(start, end, titles[index]);
    start = end;
    return item;
  });
}

function normalizeChapters(chapters: Chapter[]): Chapter[] {
  return chapters.map((item) => ({
    start_time: item.start_time,
    end_time: item.end_time,
    title: item.title,
  }));
}

function normalizeRemoved(chapters: Chapter[]): Chapter[] {
  return chapters.map((item) => ({
    start_time: item.start_time,
    end_time: item.end_time,
    ...(item.remove ? { remove: true } : {}),
  }));
}
