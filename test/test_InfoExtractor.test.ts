// Source: test/test_InfoExtractor.py

import { describe, expect, test } from "bun:test";

import { InfoExtractor } from "../yt_dlp/extractor/common.ts";
import { RegexNotFoundError } from "../yt_dlp/utils/index.ts";

class TestInfoExtractor extends InfoExtractor {
  constructor(private readonly responseOverride: Response | null = null) {
    super();
  }

  protected override async urlopen(request: Request): Promise<Response> {
    return this.responseOverride ?? await fetch(request);
  }

  downloadJsonPublic<T = unknown>(
    urlOrRequest: string | URL | Request,
    videoId: string,
    options: Parameters<InfoExtractor["downloadJson"]>[2] = {},
  ): Promise<T | false | null> {
    return this.downloadJson<T>(urlOrRequest, videoId, options);
  }

  downloadWebpageHandlePublic(...args: Parameters<InfoExtractor["downloadWebpageHandle"]>): ReturnType<InfoExtractor["downloadWebpageHandle"]> {
    return this.downloadWebpageHandle(...args);
  }

  searchRegexPublic(...args: Parameters<InfoExtractor["searchRegex"]>): ReturnType<InfoExtractor["searchRegex"]> {
    return this.searchRegex(...args);
  }

  htmlSearchRegexPublic(...args: Parameters<InfoExtractor["htmlSearchRegex"]>): ReturnType<InfoExtractor["htmlSearchRegex"]> {
    return this.htmlSearchRegex(...args);
  }

  searchJsonPublic<T = unknown>(
    startPattern: string,
    text: string,
    name: string,
    videoId: string,
    options: { endPattern?: string; containsPattern?: string; fatal?: boolean; defaultValue?: T | typeof import("../yt_dlp/utils/index.ts").NO_DEFAULT; transform_source?: (source: string) => string | null } = {},
  ): T | null {
    return this.searchJson<T>(startPattern, text, name, videoId, options);
  }

  parseJsonPublic<T = unknown>(
    jsonString: string,
    videoId: string,
    options: { fatal?: boolean; transform_source?: (source: string) => string | null } = {},
  ): T | null {
    return this.parseJson<T>(jsonString, videoId, options);
  }

  htmlSearchMetaPublic(...args: Parameters<InfoExtractor["htmlSearchMeta"]>): ReturnType<InfoExtractor["htmlSearchMeta"]> {
    return this.htmlSearchMeta(...args);
  }

  ogSearchPropertyPublic(...args: Parameters<InfoExtractor["ogSearchProperty"]>): ReturnType<InfoExtractor["ogSearchProperty"]> {
    return this.ogSearchProperty(...args);
  }

  ogSearchTitlePublic(...args: Parameters<InfoExtractor["ogSearchTitle"]>): ReturnType<InfoExtractor["ogSearchTitle"]> {
    return this.ogSearchTitle(...args);
  }

  ogSearchDescriptionPublic(...args: Parameters<InfoExtractor["ogSearchDescription"]>): ReturnType<InfoExtractor["ogSearchDescription"]> {
    return this.ogSearchDescription(...args);
  }

  ogSearchThumbnailPublic(...args: Parameters<InfoExtractor["ogSearchThumbnail"]>): ReturnType<InfoExtractor["ogSearchThumbnail"]> {
    return this.ogSearchThumbnail(...args);
  }

  searchJsonLdPublic(...args: Parameters<InfoExtractor["searchJsonLd"]>): ReturnType<InfoExtractor["searchJsonLd"]> {
    return this.searchJsonLd(...args);
  }

  searchNextjsDataPublic<T = unknown>(
    webpage: string,
    videoId: string,
    options: { defaultValue?: T | null; fatal?: boolean } = {},
  ): T | null {
    return this.searchNextjsData<T>(webpage, videoId, options);
  }

  searchNextjsV13DataPublic(...args: Parameters<InfoExtractor["searchNextjsV13Data"]>): ReturnType<InfoExtractor["searchNextjsV13Data"]> {
    return this.searchNextjsV13Data(...args);
  }

  searchNuxtJsonPublic<T = unknown>(
    webpage: string | null | undefined,
    videoId: string | null,
    options: { fatal?: boolean; defaultValue?: T | typeof import("../yt_dlp/utils/index.ts").NO_DEFAULT } = {},
  ): T | Record<string, unknown> {
    return this.searchNuxtJson<T>(webpage, videoId, options);
  }

  htmlExtractTitlePublic(...args: Parameters<InfoExtractor["htmlExtractTitle"]>): ReturnType<InfoExtractor["htmlExtractTitle"]> {
    return this.htmlExtractTitle(...args);
  }

  extractM3u8FormatsAndSubtitlesPublic(...args: Parameters<InfoExtractor["extractM3u8FormatsAndSubtitles"]>): ReturnType<InfoExtractor["extractM3u8FormatsAndSubtitles"]> {
    return this.extractM3u8FormatsAndSubtitles(...args);
  }

  rtaSearchPublic(...args: Parameters<InfoExtractor["rtaSearch"]>): ReturnType<InfoExtractor["rtaSearch"]> {
    return this.rtaSearch(...args);
  }

  protoRelativeUrlPublic(...args: Parameters<InfoExtractor["protoRelativeUrl"]>): ReturnType<InfoExtractor["protoRelativeUrl"]> {
    return this.protoRelativeUrl(...args);
  }

  extractM3u8FormatsPublic(...args: Parameters<InfoExtractor["extractM3u8Formats"]>): ReturnType<InfoExtractor["extractM3u8Formats"]> {
    return this.extractM3u8Formats(...args);
  }

  parseM3u8FormatsAndSubtitlesPublic(...args: Parameters<InfoExtractor["parseM3u8FormatsAndSubtitles"]>): ReturnType<InfoExtractor["parseM3u8FormatsAndSubtitles"]> {
    return this.parseM3u8FormatsAndSubtitles(...args);
  }

  extractMpdFormatsPublic(...args: Parameters<InfoExtractor["extractMpdFormats"]>): ReturnType<InfoExtractor["extractMpdFormats"]> {
    return this.extractMpdFormats(...args);
  }

  parseMpdFormatsAndSubtitlesPublic(...args: Parameters<InfoExtractor["parseMpdFormatsAndSubtitles"]>): ReturnType<InfoExtractor["parseMpdFormatsAndSubtitles"]> {
    return this.parseMpdFormatsAndSubtitles(...args);
  }

  parseIsmFormatsAndSubtitlesPublic(...args: Parameters<InfoExtractor["parseIsmFormatsAndSubtitles"]>): ReturnType<InfoExtractor["parseIsmFormatsAndSubtitles"]> {
    return this.parseIsmFormatsAndSubtitles(...args);
  }

  mergeSubtitlesPublic(...args: Parameters<InfoExtractor["mergeSubtitles"]>): ReturnType<InfoExtractor["mergeSubtitles"]> {
    return this.mergeSubtitles(...args);
  }

  parseF4mFormatsPublic(...args: Parameters<InfoExtractor["parseF4mFormats"]>): ReturnType<InfoExtractor["parseF4mFormats"]> {
    return this.parseF4mFormats(...args);
  }

  parseXspfPublic(...args: Parameters<InfoExtractor["parseXspf"]>): ReturnType<InfoExtractor["parseXspf"]> {
    return this.parseXspf(...args);
  }

  parseHtml5MediaEntriesPublic(...args: Parameters<InfoExtractor["parseHtml5MediaEntries"]>): ReturnType<InfoExtractor["parseHtml5MediaEntries"]> {
    return this.parseHtml5MediaEntries(...args);
  }

  extractJwplayerDataPublic(...args: Parameters<InfoExtractor["extractJwplayerData"]>): ReturnType<InfoExtractor["extractJwplayerData"]> {
    return this.extractJwplayerData(...args);
  }

  getNetrcLoginInfoPublic(...args: Parameters<InfoExtractor["getNetrcLoginInfo"]>): ReturnType<InfoExtractor["getNetrcLoginInfo"]> {
    return this.getNetrcLoginInfo(...args);
  }
}

function fakeDownloader(params: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    params,
    async urlopen(url: string | URL | Request) {
      return await fetch(url);
    },
    toScreen() {},
    reportWarning() {},
    writeDebug() {},
    ...overrides,
  };
}

describe("InfoExtractor HTML helpers", () => {
  const ie = new TestInfoExtractor();

  test("htmlSearchRegex mirrors Python helper behavior", () => {
    const html = '<p id="foo">Watch this <a href="http://www.youtube.com/watch?v=BaW_jenozKc">video</a></p>';
    expect(ie.htmlSearchRegexPublic(/<p id="foo">(.+?)<\/p>/, html, "foo")).toBe("Watch this <a href=\"http://www.youtube.com/watch?v=BaW_jenozKc\">video</a>");
    expect(ie.htmlSearchRegexPublic(/missing/, html, "missing", { fatal: false })).toBeNull();
    expect(() => ie.htmlSearchRegexPublic(/missing/, html, "missing")).toThrow(RegexNotFoundError);
  });

  test("htmlSearchMeta handles attribute order and quoting", () => {
    const webpage = `
      <meta name="a" content="1" />
      <meta name='b' content='2'>
      <meta name="c" content='3'>
      <meta name=d content='4'>
      <meta property="e" content='5' >
      <meta content="6" name="f">
    `;
    expect(ie.htmlSearchMetaPublic("a", webpage)).toBe("1");
    expect(ie.htmlSearchMetaPublic("b", webpage)).toBe("2");
    expect(ie.htmlSearchMetaPublic("c", webpage)).toBe("3");
    expect(ie.htmlSearchMetaPublic("d", webpage)).toBe("4");
    expect(ie.htmlSearchMetaPublic("e", webpage)).toBe("5");
    expect(ie.htmlSearchMetaPublic("f", webpage)).toBe("6");
    expect(ie.htmlSearchMetaPublic(["a", "b", "c"], webpage)).toBe("1");
    expect(ie.htmlSearchMetaPublic(["c", "b", "a"], webpage)).toBe("3");
    expect(ie.htmlSearchMetaPublic(["z", "x", "c"], webpage)).toBe("3");
    expect(() => ie.htmlSearchMetaPublic("z", webpage, "missing", true)).toThrow(RegexNotFoundError);
    expect(() => ie.htmlSearchMetaPublic(["z", "x"], webpage, "missing", true)).toThrow(RegexNotFoundError);
  });

  test("OpenGraph helpers parse HTML instead of tag regexes", () => {
    const webpage = `
      <meta name="og:title" content='Foo'/>
      <meta content="Some video&apos;s description " name="og:description"/>
      <meta property='og:image' content='http://domain.com/pic.jpg?key1=val1&amp;key2=val2'/>
      <meta content='application/x-shockwave-flash' property='og:video:type'>
      <meta content='Foo' property=og:foobar>
      <meta name="og:test1" content='foo > < bar'/>
      <meta name="og:test2" content="foo >//< bar"/>
      <meta property=og-test3 content='Ill-formatted opengraph'/>
      <meta property=og:test4 content=unquoted-value/>
    `;
    expect(ie.ogSearchTitlePublic(webpage)).toBe("Foo");
    expect(ie.ogSearchDescriptionPublic(webpage)).toBe("Some video's description ");
    expect(ie.ogSearchThumbnailPublic(webpage)).toBe("http://domain.com/pic.jpg?key1=val1&key2=val2");
    expect(ie.ogSearchPropertyPublic("video:type", webpage)).toBe("application/x-shockwave-flash");
    expect(ie.ogSearchPropertyPublic("foobar", webpage)).toBe("Foo");
    expect(ie.ogSearchPropertyPublic("test1", webpage)).toBe("foo > < bar");
    expect(ie.ogSearchPropertyPublic("test2", webpage)).toBe("foo >//< bar");
    expect(ie.ogSearchPropertyPublic("test3", webpage, false)).toBeNull();
    expect(ie.ogSearchPropertyPublic("test4", webpage)).toBe("unquoted-value");
    expect(() => ie.ogSearchPropertyPublic("test0", webpage, true)).toThrow(RegexNotFoundError);
  });

  test("parseJson and searchJson handle transforms and fatal defaults", () => {
    expect(ie.parseJsonPublic<{ foo: string }>('{"foo":"blah"}', "id")).toEqual({ foo: "blah" });
    expect(ie.parseJsonPublic<{ foo: string }>("callback({\"foo\":\"blah\"})", "id", {
      transform_source: (source) => source.slice("callback(".length, -1),
    })).toEqual({ foo: "blah" });
    expect(ie.parseJsonPublic("{bad", "id", { fatal: false })).toBeNull();
    expect(() => ie.parseJsonPublic("{bad", "id")).toThrow();

    const text = "window.__DATA__ = {\"foo\":\"bar\"};";
    expect(ie.searchJsonPublic<{ foo: string }>("window\\.__DATA__\\s*=", text, "data", "id", { endPattern: ";" })).toEqual({ foo: "bar" });
    expect(ie.searchJsonPublic<{ foo: string }>("missing\\s*=", text, "missing", "id", { fatal: false })).toBeNull();
  });

  test("downloadJson parses data URLs and handles nonfatal parse errors", async () => {
    const jsonUrl = `data:application/json,${encodeURIComponent('{"foo":"blah"}')}`;
    expect(await ie.downloadJsonPublic<{ foo: string }>(jsonUrl, "id")).toEqual({ foo: "blah" });

    const jsonpUrl = `data:application/javascript,${encodeURIComponent('callback({"foo":"blah"})')}`;
    expect(await ie.downloadJsonPublic<{ foo: string }>(jsonpUrl, "id", {
      transform_source: (source) => source.slice("callback(".length, -1),
    })).toEqual({ foo: "blah" });

    const invalidUrl = `data:application/json,${encodeURIComponent('{"foo": invalid}')}`;
    await expect(ie.downloadJsonPublic(invalidUrl, "id")).rejects.toThrow();
    expect(await ie.downloadJsonPublic(invalidUrl, "id", { fatal: false })).toBeNull();
  });

  test("searchJsonLd extracts first object candidate", () => {
    const webpage = `
      <script type="application/ld+json">
        [{"@context":"https://schema.org"}, {"name":"second"}]
      </script>
    `;
    expect(ie.searchJsonLdPublic(webpage, "id")).toEqual({ "@context": "https://schema.org" });
    expect(ie.searchJsonLdPublic(false, "id", { defaultValue: { fallback: true } })).toEqual({ fallback: true });
    expect(ie.searchJsonLdPublic('<script type="application/ld+json">null</script>', "id", { defaultValue: { fallback: true } })).toEqual({ fallback: true });
  });

  test("searchJsonLd normalizes real-world schema.org objects", () => {
    const cases: Array<[string, Record<string, unknown>, Parameters<TestInfoExtractor["searchJsonLdPublic"]>[2]?]> = [
      [`<script type="application/ld+json">{
        "@context": "http://schema.org/",
        "@type": "VideoObject",
        "name": "1 On 1 With Kleio",
        "duration": "PT0H12M23S",
        "thumbnailUrl": ["https://static-eu-cdn.eporner.com/thumbs/static4/7/78/780/780814/9_360.jpg", "https://imggen.eporner.com/780814/1920/1080/9.jpg"],
        "contentUrl": "https://gvideo.eporner.com/xN49A1cT3eB/xN49A1cT3eB.mp4",
        "width": "1920",
        "height": "1080",
        "encodingFormat": "mp4",
        "description": "Kleio Valentien",
        "uploadDate": "2015-12-05T21:24:35+01:00",
        "interactionStatistic": {
          "@type": "InteractionCounter",
          "interactionType": { "@type": "http://schema.org/WatchAction" },
          "userInteractionCount": 1120958
        }
      }</script>`, {
        title: "1 On 1 With Kleio",
        description: "Kleio Valentien",
        url: "https://gvideo.eporner.com/xN49A1cT3eB/xN49A1cT3eB.mp4",
        timestamp: 1449347075,
        duration: 743,
        view_count: 1120958,
        width: 1920,
        height: 1080,
      }],
      [`<script type="application/ld+json">{
        "@context": "https://schema.org",
        "@graph": [{
          "@type": "NewsArticle",
          "headline": "Συμμορία ανηλίκων – δικηγόρος θυμάτων: ήθελαν να τους αποτελειώσουν",
          "description": "Τα παιδιά δέχθηκαν την επίθεση επειδή αρνήθηκαν να γίνουν μέλη της συμμορίας, ανέφερε ο Γ. Ζαχαρόπουλος.",
          "datePublished": "2021-11-10T08:50:00+03:00"
        }]
      }</script>`, {
        timestamp: 1636523400,
        title: "Συμμορία ανηλίκων – δικηγόρος θυμάτων: ήθελαν να τους αποτελειώσουν",
      }, { expectedType: "NewsArticle" }],
      [`<script type="application/ld+json">{
        "@context": "https://schema.org",
        "@type": "TVEpisode",
        "name": "Het journaal 19u",
        "video": {
          "@type": "VideoObject",
          "name": "Het journaal - Aflevering 365 (Seizoen 2021)",
          "thumbnailUrl": "//images.vrt.be/width1280/2021/12/31/80d5ed00-6a64-11ec-b07d-02b7b76bf47f.jpg",
          "duration": "PT34M39.23S",
          "hasPart": [
            {"name":"Explosie Turnhout","startOffset":70,"@type":"Clip"},
            {"name":"Jaarwisseling","startOffset":440,"@type":"Clip"},
            {"name":"Natuurbranden Colorado","startOffset":1179,"@type":"Clip"},
            {"name":"Klimaatverandering","startOffset":1263,"@type":"Clip"},
            {"name":"Zacht weer","startOffset":1367,"@type":"Clip"},
            {"name":"Financiële balans","startOffset":1383,"@type":"Clip"},
            {"name":"Club Brugge","startOffset":1484,"@type":"Clip"},
            {"name":"Mentale gezondheid bij topsporters","startOffset":1575,"@type":"Clip"},
            {"name":"Olympische Winterspelen","startOffset":1728,"@type":"Clip"},
            {"name":"Sober oudjaar in Nederland","startOffset":1873,"@type":"Clip"}
          ]
        }
      }</script>`, {
        title: "Het journaal - Aflevering 365 (Seizoen 2021)",
        chapters: [
          { title: "Explosie Turnhout", start_time: 70, end_time: 440 },
          { title: "Jaarwisseling", start_time: 440, end_time: 1179 },
          { title: "Natuurbranden Colorado", start_time: 1179, end_time: 1263 },
          { title: "Klimaatverandering", start_time: 1263, end_time: 1367 },
          { title: "Zacht weer", start_time: 1367, end_time: 1383 },
          { title: "Financiële balans", start_time: 1383, end_time: 1484 },
          { title: "Club Brugge", start_time: 1484, end_time: 1575 },
          { title: "Mentale gezondheid bij topsporters", start_time: 1575, end_time: 1728 },
          { title: "Olympische Winterspelen", start_time: 1728, end_time: 1873 },
          { title: "Sober oudjaar in Nederland", start_time: 1873, end_time: 2079.23 },
        ],
      }],
      [`<script type="application/ld+json">{"@context":"https://schema.org","@type":"VideoObject","thumbnailUrl":["https://www.rainews.it/cropgd/640x360/dl/img/2021/12/30/1640886376927_GettyImages.jpg"]}</script>`, {
        thumbnails: [{ url: "https://www.rainews.it/cropgd/640x360/dl/img/2021/12/30/1640886376927_GettyImages.jpg" }],
      }],
      [`<script type="application/ld+json">{"@context":"https://schema.org","@type":"VideoObject","thumbnailUrl":"https://www.rainews.it/cropgd/640x360/dl/img/2021/12/30/1640886376927_GettyImages.jpg"}</script>`, {
        thumbnails: [{ url: "https://www.rainews.it/cropgd/640x360/dl/img/2021/12/30/1640886376927_GettyImages.jpg" }],
      }],
      [`<script type="application/ld+json">{"@context":"https://schema.org","@type":"VideoObject","thumbnail_url":"//www.nobelprize.org/images/12693-landscape-medium-gallery.jpg"}</script>`, {
        thumbnails: [{ url: "https://www.nobelprize.org/images/12693-landscape-medium-gallery.jpg" }],
      }],
    ];

    for (const [html, expected, options] of cases) {
      expect(ie.searchJsonLdPublic(html, "id", options)).toMatchObject(expected);
    }
  });

  test("searchNextjsData extracts script body by id", () => {
    const webpage = '<script id="__NEXT_DATA__" type="application/json">{"props":{}}</script>';
    expect(ie.searchNextjsDataPublic<{ props: Record<string, unknown> }>(webpage, "id")).toEqual({ props: {} });
    expect(ie.searchNextjsDataPublic<Record<string, unknown>>("<html></html>", "id", { fatal: false })).toEqual({});
    expect(ie.searchNextjsDataPublic("<html></html>", "id", { defaultValue: null })).toBeNull();
    expect(ie.searchNextjsDataPublic("<html></html>", "id", { defaultValue: {} })).toEqual({});
    expect(() => ie.searchNextjsDataPublic("<html></html>", "id")).toThrow(RegexNotFoundError);
  });

  test("searchNextjsV13Data extracts app router flight data", () => {
    const html = String.raw`
      <script>(self.__next_f=self.__next_f||[]).push([0])</script>
      <script>self.__next_f.push([2,"0:[\"$\",\"$L0\",null,{\"do_not_add_this\":\"fail\"}]\n"])</script>
      <script>self.__next_f.push([1,"1:I[46975,[],\"HTTPAccessFallbackBoundary\"]\n2:I[32630,[\"8183\",\"static/chunks/8183-768193f6a9e33cdd.js\"]]\n"])</script>
      <script nonce="abc123">self.__next_f.push([1,"e:[false,[\"$\",\"div\",null,{\"children\":[\"$\",\"$L18\",null,{\"foo\":\"bar\"}]}],false]\n    "])</script>
      <script>self.__next_f.push([1,"2a:[[\"$\",\"div\",null,{\"className\":\"flex flex-col\",\"children\":[]}],[\"$\",\"$L16\",null,{\"meta\":{\"dateCreated\":1730489700,\"uuid\":\"40cac41d-8d29-4ef5-aa11-75047b9f0907\"}}]]\n"])</script>
      <script>self.__next_f.push([1,"df:[\"$undefined\",[\"$\",\"div\",null,{\"children\":[\"$\",\"$L17\",null,{}],\"do_not_include_this_field\":\"fail\"}],[\"$\",\"div\",null,{\"children\":[[\"$\",\"$L19\",null,{\"duplicated_field_name\":{\"x\":1}}],[\"$\",\"$L20\",null,{\"duplicated_field_name\":{\"y\":2}}]]}],\"$undefined\"]\n"])</script>
      <script>self.__next_f.push([3,"MzM6WyIkIiwiJEwzMiIsbnVsbCx7ImRlY29kZWQiOiJzdWNjZXNzIn1d"])</script>
    `;
    expect(ie.searchNextjsV13DataPublic(html, null)).toEqual({
      "18": { foo: "bar" },
      "16": { meta: { dateCreated: 1730489700, uuid: "40cac41d-8d29-4ef5-aa11-75047b9f0907" } },
      "19": { duplicated_field_name: { x: 1 } },
      "20": { duplicated_field_name: { y: 2 } },
    });
    expect(ie.searchNextjsV13DataPublic("", null, false)).toEqual({});
    expect(ie.searchNextjsV13DataPublic(null, null, false)).toEqual({});
  });

  test("searchNuxtJson resolves rich payload arrays", () => {
    const htmlTemplate = (data: string) => `<script data-ssr="true" id="__NUXT_DATA__" type="application/json">[${data}]</script>`;
    const validData = `
      ["ShallowReactive",1],
      {"data":2,"state":21,"once":25,"_errors":28,"_server_errors":30},
      ["ShallowReactive",3],
      {"$abcdef123456":4},
      {"podcast":5,"activeEpisodeData":7},
      {"podcast":6,"seasons":14},
      {"title":10,"id":11},
      ["Reactive",8],
      {"episode":9,"creators":18,"empty_list":20},
      {"title":12,"id":13,"refs":34,"empty_refs":35},
      "Series Title",
      "podcast-id-01",
      "Episode Title",
      "episode-id-99",
      [15,16,17],
      1,
      2,
      3,
      [19],
      "Podcast Creator",
      [],
      {"$ssite-config":22},
      {"env":23,"name":24,"map":26,"numbers":14},
      "production",
      "podcast-website",
      ["Set"],
      ["Reactive",27],
      ["Map"],
      ["ShallowReactive",29],
      {},
      ["NuxtError",31],
      {"status":32,"message":33},
      503,
      "Service Unavailable",
      [36,37],
      [38,39],
      ["Ref",40],
      ["ShallowRef",41],
      ["EmptyRef",42],
      ["EmptyShallowRef",43],
      "ref",
      "shallow_ref",
      "{\\"ref\\":1}",
      "{\\"shallow_ref\\":2}"
    `;
    expect(ie.searchNuxtJsonPublic(htmlTemplate(validData), null)).toEqual({
      data: {
        "$abcdef123456": {
          podcast: {
            podcast: { title: "Series Title", id: "podcast-id-01" },
            seasons: [1, 2, 3],
          },
          activeEpisodeData: {
            episode: {
              title: "Episode Title",
              id: "episode-id-99",
              refs: ["ref", "shallow_ref"],
              empty_refs: [{ ref: 1 }, { shallow_ref: 2 }],
            },
            creators: ["Podcast Creator"],
            empty_list: [],
          },
        },
      },
      state: {
        "$ssite-config": {
          env: "production",
          name: "podcast-website",
          map: [],
          numbers: [1, 2, 3],
        },
      },
      once: [],
      _errors: {},
      _server_errors: { status: 503, message: "Service Unavailable" },
    });

    expect(ie.searchNuxtJsonPublic("", null, { fatal: false })).toEqual({});
    const defaultValue = { fallback: true };
    expect(ie.searchNuxtJsonPublic("", null, { defaultValue })).toBe(defaultValue);
    expect(ie.searchNuxtJsonPublic(htmlTemplate(`
      {"data":1},
      {"invalid_raw_list":2},
      [15,16,17]
    `), null, { fatal: false })).toEqual({ data: { invalid_raw_list: [null, null, null] } });
    expect(ie.searchNuxtJsonPublic(htmlTemplate(`
      {"data":1},
      ["EmptyRef",2],
      "not valid JSON"
    `), null, { fatal: false })).toEqual({ data: null });
    expect(ie.searchNuxtJsonPublic(htmlTemplate("[]"), null, { defaultValue })).toBe(defaultValue);
    expect(ie.searchNuxtJsonPublic(htmlTemplate(`
      ["unsupported",1],
      {"data":2},
      {}
    `), null, { defaultValue })).toBe(defaultValue);
  });

  test("htmlExtractTitle uses parsed title text", () => {
    expect(ie.htmlExtractTitlePublic("<title>Foo &amp; Bar</title>")).toBe("Foo & Bar");
    expect(ie.htmlExtractTitlePublic("<html></html>")).toBeNull();
  });
});

describe("InfoExtractor common helpers", () => {
  const ie = new TestInfoExtractor();

  test.todo("test_ie_key once the full extractor registry imports cleanly", () => undefined);

  test("netrc login info matches Python fixture behavior", async () => {
    for (const params of [
      { usenetrc: true, netrc_location: "./test/testdata/netrc/netrc" },
      { netrc_cmd: "cat ./test/testdata/netrc/netrc" },
    ]) {
      const netrcIe = new TestInfoExtractor();
      netrcIe.setDownloader(fakeDownloader(params));
      expect(await netrcIe.getNetrcLoginInfoPublic("normal_use")).toEqual(["user", "pass"]);
      expect(await netrcIe.getNetrcLoginInfoPublic("empty_user")).toEqual(["", "pass"]);
      expect(await netrcIe.getNetrcLoginInfoPublic("empty_pass")).toEqual(["user", ""]);
      expect(await netrcIe.getNetrcLoginInfoPublic("both_empty")).toEqual(["", ""]);
      expect(await netrcIe.getNetrcLoginInfoPublic("nonexistent")).toEqual([null, null]);
      await expect(netrcIe.getNetrcLoginInfoPublic(";echo rce")).rejects.toThrow();
    }
  });

  test("url and playlist result helpers", () => {
    expect(InfoExtractor.urlResult("https://example.com/v", "Example", "id", "title")).toEqual({
      _type: "url",
      url: "https://example.com/v",
      ie_key: "Example",
      id: "id",
      title: "title",
    });
    expect(InfoExtractor.urlResult("https://example.com/v", null, null, null, { url_transparent: true })).toEqual({
      _type: "url_transparent",
      url: "https://example.com/v",
      url_transparent: true,
    });

    const entries = [InfoExtractor.urlResult("https://example.com/1")];
    expect(InfoExtractor.playlistResult(entries, "pl", "Playlist", "Description")).toEqual({
      _type: "playlist",
      id: "pl",
      title: "Playlist",
      description: "Description",
      entries,
    });
    expect(InfoExtractor.playlistFromMatches(["/a", "/a", "/b"], {
      getter: (path) => `https://example.com${path}`,
      playlistId: "matches",
    })).toMatchObject({
      _type: "playlist",
      id: "matches",
      entries: [
        { url: "https://example.com/a" },
        { url: "https://example.com/b" },
      ],
    });
  });

  test("protocol-relative and age-limit helpers", () => {
    expect(ie.protoRelativeUrlPublic("//cdn.example.com/v.mp4")).toBe("http://cdn.example.com/v.mp4");
    expect(ie.protoRelativeUrlPublic("//cdn.example.com/v.mp4", "https:")).toBe("https://cdn.example.com/v.mp4");
    expect(ie.protoRelativeUrlPublic("https://example.com/v.mp4")).toBe("https://example.com/v.mp4");
    expect(ie.protoRelativeUrlPublic(null)).toBeNull();

    expect(ie.rtaSearchPublic('<meta name="rating" content="RTA-5042-1996-1400-1577-RTA">')).toBe(18);
    expect(ie.rtaSearchPublic("> you acknowledge you are at least 21 years old")).toBe(21);
    expect(ie.rtaSearchPublic("<html></html>")).toBeNull();
  });

  test("manifest and subtitle helpers expose ported behavior", () => {
    expect(ie.extractM3u8FormatsPublic("https://example.com/master.m3u8", "id", "mp4", { m3u8Id: "hls" })).toEqual([{
      url: "https://example.com/master.m3u8",
      ext: "mp4",
      protocol: "m3u8_native",
      format_id: "hls",
      manifest_url: "https://example.com/master.m3u8",
    }]);
    expect(ie.extractMpdFormatsPublic("https://example.com/manifest.mpd", "id", { mpdId: "dash" })).toEqual([{
      url: "https://example.com/manifest.mpd",
      protocol: "http_dash_segments",
      format_id: "dash",
      manifest_url: "https://example.com/manifest.mpd",
    }]);

    expect(ie.mergeSubtitlesPublic({ en: [{ url: "a" }], fr: [{ url: "b" }] }, { en: [{ url: "base" }] })).toEqual({
      en: [{ url: "base" }, { url: "a" }],
      fr: [{ url: "b" }],
    });
  });

  test("parse_m3u8_formats matches local Python fixture cases", async () => {
    const bipbopUrl = "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8";
    const bipbop = await Bun.file("./test/testdata/m3u8/bipbop_16x9.m3u8").text();
    const [bipbopFormats, bipbopSubs] = ie.parseM3u8FormatsAndSubtitlesPublic(bipbop, bipbopUrl, { ext: "mp4" });
    expect(bipbopFormats).toContainEqual(expect.objectContaining({
      format_id: "bipbop_audio-BipBop Audio 2",
      url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/alternate_audio_aac/prog_index.m3u8",
      language: "eng",
      vcodec: "none",
      protocol: "m3u8_native",
    }));
    expect(bipbopFormats).toContainEqual(expect.objectContaining({
      format_id: "263.851",
      url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/gear1/prog_index.m3u8",
      width: 416,
      height: 234,
      vcodec: "avc1.4d400d",
      acodec: "mp4a.40.2",
    }));
    expect(bipbopSubs.en).toEqual([
      { url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/subtitles/eng/prog_index.m3u8", ext: "vtt", protocol: "m3u8_native" },
      { url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/subtitles/eng_forced/prog_index.m3u8", ext: "vtt", protocol: "m3u8_native" },
    ]);

    const fmp4Url = "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/master.m3u8";
    const fmp4 = await Bun.file("./test/testdata/m3u8/img_bipbop_adv_example_fmp4.m3u8").text();
    const [fmp4Formats, fmp4Subs] = ie.parseM3u8FormatsAndSubtitlesPublic(fmp4, fmp4Url, { ext: "mp4" });
    expect(fmp4Formats).toContainEqual(expect.objectContaining({
      format_id: "aud1-English",
      url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/a1/prog_index.m3u8",
      language: "en",
      vcodec: "none",
      source_preference: 0,
    }));
    expect(fmp4Formats).toContainEqual(expect.objectContaining({
      format_id: "530.721",
      url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/v2/prog_index.m3u8",
      width: 480,
      height: 270,
      vcodec: "avc1.640015",
      acodec: "none",
    }));
    expect(fmp4Subs.en).toEqual([{ url: "https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_fmp4/s1/en/prog_index.m3u8", ext: "vtt", protocol: "m3u8_native" }]);
  });

  test("parse_mpd_formats matches local Python fixture cases", async () => {
    const floatDuration = await Bun.file("./test/testdata/mpd/float_duration.mpd").text();
    const [floatFormats] = ie.parseMpdFormatsAndSubtitlesPublic(floatDuration, { mpdUrl: "http://unknown/manifest.mpd" });
    expect(floatFormats).toContainEqual(expect.objectContaining({
      manifest_url: "http://unknown/manifest.mpd",
      ext: "m4a",
      format_id: "318597",
      format_note: "DASH audio",
      acodec: "mp4a.40.2",
      vcodec: "none",
      tbr: 61.587,
    }));
    expect(floatFormats).toContainEqual(expect.objectContaining({
      ext: "mp4",
      format_id: "5997485",
      vcodec: "avc1.640032",
      acodec: "none",
      width: 1920,
      height: 1080,
      tbr: 5997.485,
    }));

    const unfragmented = await Bun.file("./test/testdata/mpd/unfragmented.mpd").text();
    const [unfragmentedFormats] = ie.parseMpdFormatsAndSubtitlesPublic(unfragmented, {
      mpdUrl: "https://v.redd.it/hw1x7rcg7zl21/DASHPlaylist.mpd",
      mpdBaseUrl: "https://v.redd.it/hw1x7rcg7zl21",
    });
    expect(unfragmentedFormats).toContainEqual(expect.objectContaining({
      url: "https://v.redd.it/hw1x7rcg7zl21/audio",
      ext: "m4a",
      format_id: "AUDIO-1",
      asr: 48000,
      acodec: "mp4a.40.2",
      vcodec: "none",
    }));
    expect(unfragmentedFormats).toContainEqual(expect.objectContaining({
      url: "https://v.redd.it/hw1x7rcg7zl21/DASH_360",
      ext: "mp4",
      format_id: "VIDEO-1",
      width: 360,
      height: 360,
      fps: 30,
    }));

    const subtitles = await Bun.file("./test/testdata/mpd/subtitles.mpd").text();
    const [subtitleFormats, subtitleEntries] = ie.parseMpdFormatsAndSubtitlesPublic(subtitles, {
      mpdUrl: "https://sdn-global-streaming-cache-3qsdn.akamaized.net/stream/3144/files/17/07/672975/3144-kZT4LWMQw6Rh7Kpd.ism/manifest.mpd",
      mpdBaseUrl: "https://sdn-global-streaming-cache-3qsdn.akamaized.net/stream/3144/files/17/07/672975/3144-kZT4LWMQw6Rh7Kpd.ism/",
    });
    expect(subtitleFormats).toContainEqual(expect.objectContaining({
      format_id: "audio=128001",
      ext: "m4a",
      tbr: 128.001,
      asr: 48000,
      fragment_base_url: "https://sdn-global-streaming-cache-3qsdn.akamaized.net/stream/3144/files/17/07/672975/3144-kZT4LWMQw6Rh7Kpd.ism/dash/",
    }));
    expect(subtitleEntries.en).toEqual([expect.objectContaining({
      ext: "mp4",
      protocol: "http_dash_segments",
      fragment_base_url: "https://sdn-global-streaming-cache-3qsdn.akamaized.net/stream/3144/files/17/07/672975/3144-kZT4LWMQw6Rh7Kpd.ism/dash/",
    })]);
  });

  test("parse_f4m_formats matches local Python fixture case", async () => {
    const f4mUrl = "http://api.new.livestream.com/accounts/6115179/events/6764928/videos/144884262.f4m";
    const f4m = await Bun.file("./test/testdata/f4m/custom_base_url.f4m").text();
    expect(ie.parseF4mFormatsPublic(f4m, f4mUrl, null)).toEqual([expect.objectContaining({
      manifest_url: f4mUrl,
      ext: "flv",
      format_id: "2148",
      protocol: "f4m",
      tbr: 2148,
      width: 1280,
      height: 720,
    })]);
  });

  test("parse_xspf matches local Python fixture case", async () => {
    const xspfUrl = "https://example.org/src/foo_xspf.xspf";
    const xspf = await Bun.file("./test/testdata/xspf/foo_xspf.xspf").text();
    expect(ie.parseXspfPublic(xspf, "foo_xspf", { xspfUrl, xspfBaseUrl: xspfUrl })).toMatchObject([{
      id: "foo_xspf",
      title: "Pandemonium",
      description: "Visit http://bigbrother404.bandcamp.com",
      duration: 202.416,
      formats: [{ manifest_url: xspfUrl, url: "https://example.org/src/cd1/track%201.mp3" }],
    }, {
      id: "foo_xspf",
      title: "Final Cartridge (Nichico Twelve Remix)",
      duration: 255.857,
      formats: [{ manifest_url: xspfUrl, url: "https://example.org/%E3%83%88%E3%83%A9%E3%83%83%E3%82%AF%E3%80%80%EF%BC%92.mp3" }],
    }, {
      id: "foo_xspf",
      title: "Rebuilding Nightingale",
      duration: 287.915,
      formats: [
        { manifest_url: xspfUrl, url: "https://example.org/src/track3.mp3" },
        { manifest_url: xspfUrl, url: "https://example.com/track3.mp3" },
      ],
    }]);
  });

  test("parse_ism_formats matches local Python fixture cases", async () => {
    const sintelUrl = "https://sdn-global-streaming-cache-3qsdn.akamaized.net/stream/3144/files/17/07/672975/3144-kZT4LWMQw6Rh7Kpd.ism/Manifest";
    const sintel = await Bun.file("./test/testdata/ism/sintel.Manifest").text();
    const [sintelFormats, sintelSubs] = ie.parseIsmFormatsAndSubtitlesPublic(sintel, sintelUrl);
    expect(sintelFormats).toContainEqual(expect.objectContaining({
      format_id: "audio-128",
      url: sintelUrl,
      ext: "isma",
      tbr: 128,
      asr: 48000,
      vcodec: "none",
      acodec: "AACL",
      protocol: "ism",
      audio_channels: 2,
    }));
    expect(sintelFormats).toContainEqual(expect.objectContaining({
      format_id: "video-4482",
      url: sintelUrl,
      ext: "ismv",
      width: 1688,
      height: 720,
      tbr: 4482,
      vcodec: "AVC1",
      acodec: "none",
    }));
    expect(sintelSubs.eng).toEqual([expect.objectContaining({
      ext: "ismt",
      protocol: "ism",
      url: sintelUrl,
      manifest_url: sintelUrl,
    })]);

    const ec3Url = "https://smstr01.dmm.t-online.de/smooth24/smoothstream_m1/streaming/sony/9221438342941275747/636887760842957027/25_km_h-Trailer-9221571562372022953_deu_20_1300k_HD_H_264_ISMV.ism/Manifest";
    const ec3 = await Bun.file("./test/testdata/ism/ec-3_test.Manifest").text();
    const [ec3Formats] = ie.parseIsmFormatsAndSubtitlesPublic(ec3, ec3Url);
    expect(ec3Formats).toContainEqual(expect.objectContaining({
      format_id: "audio_deu_1-224",
      language: "deu",
      ext: "isma",
      acodec: "EC-3",
      audio_channels: 6,
    }));
    expect(ec3Formats).toContainEqual(expect.objectContaining({
      format_id: "video_deu-8079",
      language: "deu",
      ext: "ismv",
      width: 1920,
      height: 1080,
      tbr: 8079,
    }));
  });

  test("expected status returns content", async () => {
    const teapot = new TestInfoExtractor(new Response("<h1>418 I'm a teapot</h1>", {
      status: 418,
      statusText: "I'm a teapot",
      headers: { "content-type": "text/html; charset=utf-8" },
    }));
    const result = await teapot.downloadWebpageHandlePublic("https://example.com/teapot", "id", { expected_status: 418 });
    expect(result).not.toBe(false);
    expect(result && result[0]).toBe("<h1>418 I'm a teapot</h1>");
  });

  test("extractJwplayerData handles real-world setup objects", () => {
    expect(ie.extractJwplayerDataPublic(`
      <script type='text/javascript'>
        jwplayer('my-video').setup({
          file: 'rtmp://192.138.214.154/live/sjclive',
          fallback: 'true',
          width: '95%',
          aspectratio: '16:9',
          primary: 'flash',
          mediaid:'XEgvuql4'
        });
      </script>
    `, null, { requireTitle: false })).toMatchObject({
      id: "XEgvuql4",
      formats: [{
        url: "rtmp://192.138.214.154/live/sjclive",
        ext: "flv",
      }],
    });

    expect(ie.extractJwplayerDataPublic(`
      <script type="text/javascript">
        jwplayer("mediaplayer").setup({
          'videoid': "7564",
          'file': "https://cdn.pornoxo.com/key=MF+oEbaxqTKb50P-w9G3nA,end=1489689259,ip=104.199.146.27/ip=104.199.146.27/speed=6573765/buffer=3.0/2009-12/4b2157147afe5efa93ce1978e0265289c193874e02597.flv",
          'image': "https://t03.vipstreamservice.com/thumbs/pxo-full/2009-12/14/a4b2157147afe5efa93ce1978e0265289c193874e02597.flv-full-13.jpg",
          'provider': 'http'
        });
        invideo.setup({ adsUrl: "/banner-iframe/?zoneId=32" });
      </script>
    `, "dummy", { requireTitle: false })).toMatchObject({
      thumbnail: "https://t03.vipstreamservice.com/thumbs/pxo-full/2009-12/14/a4b2157147afe5efa93ce1978e0265289c193874e02597.flv-full-13.jpg",
      formats: [{
        url: "https://cdn.pornoxo.com/key=MF+oEbaxqTKb50P-w9G3nA,end=1489689259,ip=104.199.146.27/ip=104.199.146.27/speed=6573765/buffer=3.0/2009-12/4b2157147afe5efa93ce1978e0265289c193874e02597.flv",
        ext: "flv",
      }],
    });

    expect(ie.extractJwplayerDataPublic(String.raw`
      <script>
      jwplayer("mediaplayer").setup({"title":"king machine trailer 1","sources":[{"file":"http:\/\/cdn.dbolical.com\/cache\/videos\/games\/1\/50\/49678\/encode_mp4\/king-machine-trailer.mp4","label":"360p SD"},{"file":"http:\/\/cdn.dbolical.com\/cache\/videos\/games\/1\/50\/49678\/encode720p_mp4\/king-machine-trailer.mp4","label":"720p HD"}],"image":"http:\/\/media.indiedb.com\/cache\/images\/games\/1\/50\/49678\/thumb_620x2000\/king-machine-trailer.mp4.jpg","width":620,"height":349}).once("play", function(event) {});
      </script>
    `, "dummy")).toMatchObject({
      title: "king machine trailer 1",
      thumbnail: "http://media.indiedb.com/cache/images/games/1/50/49678/thumb_620x2000/king-machine-trailer.mp4.jpg",
      formats: [{
        url: "http://cdn.dbolical.com/cache/videos/games/1/50/49678/encode_mp4/king-machine-trailer.mp4",
        height: 360,
        ext: "mp4",
      }, {
        url: "http://cdn.dbolical.com/cache/videos/games/1/50/49678/encode720p_mp4/king-machine-trailer.mp4",
        height: 720,
        ext: "mp4",
      }],
    });
  });
});

describe("InfoExtractor HTML5 media entries", () => {
  const ie = new TestInfoExtractor();

  test("inline video tag", () => {
    expect(ie.parseHtml5MediaEntriesPublic("https://127.0.0.1/video.html", '<html><video src="/vid.mp4" /></html>', null)[0]).toMatchObject({
      formats: [{ url: "https://127.0.0.1/vid.mp4" }],
    });
  });

  test("source labels with kbps", () => {
    expect(ie.parseHtml5MediaEntriesPublic("https://www.r18.com/", `
      <video controls poster="//pics.r18.com/digital/amateur/mgmr105/mgmr105jp.jpg">
        <source src="https://awscc3001.r18.com/litevideo/freepv/m/mgm/mgmr105/mgmr105_sm_w.mp4" type="video/mp4" res="240" label="300kbps">
        <source src="https://awscc3001.r18.com/litevideo/freepv/m/mgm/mgmr105/mgmr105_dm_w.mp4" type="video/mp4" res="480" label="1000kbps">
        <source src="https://awscc3001.r18.com/litevideo/freepv/m/mgm/mgmr105/mgmr105_dmb_w.mp4" type="video/mp4" res="740" label="1500kbps">
      </video>
    `, null)[0]).toMatchObject({
      formats: [{
        url: "https://awscc3001.r18.com/litevideo/freepv/m/mgm/mgmr105/mgmr105_sm_w.mp4",
        ext: "mp4",
        format_id: "300kbps",
        height: 240,
        tbr: 300,
      }, {
        url: "https://awscc3001.r18.com/litevideo/freepv/m/mgm/mgmr105/mgmr105_dm_w.mp4",
        ext: "mp4",
        format_id: "1000kbps",
        height: 480,
        tbr: 1000,
      }, {
        url: "https://awscc3001.r18.com/litevideo/freepv/m/mgm/mgmr105/mgmr105_dmb_w.mp4",
        ext: "mp4",
        format_id: "1500kbps",
        height: 740,
        tbr: 1500,
      }],
      thumbnail: "//pics.r18.com/digital/amateur/mgmr105/mgmr105jp.jpg",
    });
  });

  test("width height and subtitles", () => {
    expect(ie.parseHtml5MediaEntriesPublic("https://www.csfd.cz/", `
      <video poster="https://img.csfd.cz/files/images/film/video/preview/163/344/163344118_748d20.png?h360">
        <source src="https://video.csfd.cz/files/videos/157/750/157750813/163327358_eac647.mp4" type="video/mp4" width="640" height="360">
        <source src="https://video.csfd.cz/files/videos/157/750/157750813/163327360_3d2646.mp4" type="video/mp4" width="1280" height="720">
        <source src="https://video.csfd.cz/files/videos/157/750/157750813/163327356_91f258.mp4" type="video/mp4" width="1920" height="1080">
        <source src="https://video.csfd.cz/files/videos/157/750/157750813/163327359_962b4a.webm" type="video/webm" width="640" height="360">
        <source src="https://video.csfd.cz/files/videos/157/750/157750813/163327361_6feee0.webm" type="video/webm" width="1280" height="720">
        <source src="https://video.csfd.cz/files/videos/157/750/157750813/163327357_8ab472.webm" type="video/webm" width="1920" height="1080">
        <track src="https://video.csfd.cz/files/subtitles/163/344/163344115_4c388b.srt" type="text/x-srt" kind="subtitles" srclang="cs" label="cs">
      </video>
    `, null)[0]).toMatchObject({
      formats: [
        { url: "https://video.csfd.cz/files/videos/157/750/157750813/163327358_eac647.mp4", ext: "mp4", width: 640, height: 360 },
        { url: "https://video.csfd.cz/files/videos/157/750/157750813/163327360_3d2646.mp4", ext: "mp4", width: 1280, height: 720 },
        { url: "https://video.csfd.cz/files/videos/157/750/157750813/163327356_91f258.mp4", ext: "mp4", width: 1920, height: 1080 },
        { url: "https://video.csfd.cz/files/videos/157/750/157750813/163327359_962b4a.webm", ext: "webm", width: 640, height: 360 },
        { url: "https://video.csfd.cz/files/videos/157/750/157750813/163327361_6feee0.webm", ext: "webm", width: 1280, height: 720 },
        { url: "https://video.csfd.cz/files/videos/157/750/157750813/163327357_8ab472.webm", ext: "webm", width: 1920, height: 1080 },
      ],
      subtitles: {
        cs: [{ url: "https://video.csfd.cz/files/subtitles/163/344/163344115_4c388b.srt" }],
      },
      thumbnail: "https://img.csfd.cz/files/images/film/video/preview/163/344/163344118_748d20.png?h360",
    });
  });

  test("height in label", () => {
    expect(ie.parseHtml5MediaEntriesPublic("https://tamasha.com/v/Kkdjw", `
      <video crossorigin="anonymous">
        <source src="https://s-v2.tamasha.com/statics/videos_file/19/8f/Kkdjw_198feff8577d0057536e905cce1fb61438dd64e0_n_240.mp4" type="video/mp4" label="AUTO" res="0"/>
        <source src="https://s-v2.tamasha.com/statics/videos_file/19/8f/Kkdjw_198feff8577d0057536e905cce1fb61438dd64e0_n_240.mp4" type="video/mp4" label="240p" res="240"/>
        <source src="https://s-v2.tamasha.com/statics/videos_file/20/00/Kkdjw_200041c66f657fc967db464d156eafbc1ed9fe6f_n_144.mp4" type="video/mp4" label="144p" res="144"/>
      </video>
    `, null)[0]).toMatchObject({
      formats: [
        { url: "https://s-v2.tamasha.com/statics/videos_file/19/8f/Kkdjw_198feff8577d0057536e905cce1fb61438dd64e0_n_240.mp4" },
        { url: "https://s-v2.tamasha.com/statics/videos_file/19/8f/Kkdjw_198feff8577d0057536e905cce1fb61438dd64e0_n_240.mp4", ext: "mp4", format_id: "240p", height: 240 },
        { url: "https://s-v2.tamasha.com/statics/videos_file/20/00/Kkdjw_200041c66f657fc967db464d156eafbc1ed9fe6f_n_144.mp4", ext: "mp4", format_id: "144p", height: 144 },
      ],
    });
  });

  test("data-src and data-video-src", () => {
    expect(ie.parseHtml5MediaEntriesPublic("https://www.directvnow.com", `
      <video><source data-src="https://cdn.directv.com/content/dam/dtv/prod/website_directvnow-international/videos/DTVN_hdr_HBO_v3.mp4" type="video/mp4" /></video>
    `, null)[0]).toMatchObject({
      formats: [{ ext: "mp4", url: "https://cdn.directv.com/content/dam/dtv/prod/website_directvnow-international/videos/DTVN_hdr_HBO_v3.mp4" }],
    });

    expect(ie.parseHtml5MediaEntriesPublic("https://www.directvnow.com", `
      <video><source src="" data-video-src="https://www.klarna.com/uk/wp-content/uploads/sites/11/2019/01/KL062_Smooth3_0_DogWalking_5s_920x080_.mp4" type="video/mp4" /></video>
    `, null)[0]).toMatchObject({
      formats: [{ url: "https://www.klarna.com/uk/wp-content/uploads/sites/11/2019/01/KL062_Smooth3_0_DogWalking_5s_920x080_.mp4", ext: "mp4" }],
    });
  });

  test("type attribute without extension in URL", () => {
    expect(ie.parseHtml5MediaEntriesPublic("https://0000.studio", `
      <video src="https://d1ggyt9m8pwf3g.cloudfront.net/protected/ap-northeast-1:1864af40-28d5-492b-b739-b32314b1a527/archive/clip/838db6a7-8973-4cd6-840d-8517e4093c92"
        type="video/mp4"></video>
    `, null)[0]).toMatchObject({
      formats: [{
        url: "https://d1ggyt9m8pwf3g.cloudfront.net/protected/ap-northeast-1:1864af40-28d5-492b-b739-b32314b1a527/archive/clip/838db6a7-8973-4cd6-840d-8517e4093c92",
        ext: "mp4",
      }],
    });
  });
});

describe("InfoExtractor manifest downloads", () => {
  test("test_extract_m3u8_formats", async () => {
    const manifest = await Bun.file("test/testdata/m3u8/bipbop_16x9.m3u8").text();
    const ie = new TestInfoExtractor(new Response(manifest));
    const [formats, subtitles] = await ie.extractM3u8FormatsAndSubtitlesPublic("http://127.0.0.1/bipbop.m3u8", "", "mp4", { fatal: false });
    expect(formats.length).toBeGreaterThan(0);
    expect(Object.keys(subtitles).length).toBeGreaterThan(0);
  });

  test("test_extract_m3u8_formats_warning", async () => {
    const warnings: string[] = [];
    const ie = new TestInfoExtractor(new Response(Buffer.alloc(1024)));
    ie.setDownloader(fakeDownloader({}, { reportWarning: (message: string) => warnings.push(message) }));
    const [formats, subtitles] = await ie.extractM3u8FormatsAndSubtitlesPublic("http://127.0.0.1/fake.m3u8", "", "mp4", { fatal: false });
    expect(warnings.length).toBeGreaterThan(0);
    expect(formats).toEqual([]);
    expect(subtitles).toEqual({});
  });
});
