// Source: test/test_InfoExtractor.py

import { describe, expect, test } from "bun:test";

import { InfoExtractor } from "../yt_dlp/extractor/common.ts";
import { RegexNotFoundError } from "../yt_dlp/utils/index.ts";

class TestInfoExtractor extends InfoExtractor {
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

  htmlExtractTitlePublic(...args: Parameters<InfoExtractor["htmlExtractTitle"]>): ReturnType<InfoExtractor["htmlExtractTitle"]> {
    return this.htmlExtractTitle(...args);
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

  extractMpdFormatsPublic(...args: Parameters<InfoExtractor["extractMpdFormats"]>): ReturnType<InfoExtractor["extractMpdFormats"]> {
    return this.extractMpdFormats(...args);
  }

  mergeSubtitlesPublic(...args: Parameters<InfoExtractor["mergeSubtitles"]>): ReturnType<InfoExtractor["mergeSubtitles"]> {
    return this.mergeSubtitles(...args);
  }

  parseHtml5MediaEntriesPublic(...args: Parameters<InfoExtractor["parseHtml5MediaEntries"]>): ReturnType<InfoExtractor["parseHtml5MediaEntries"]> {
    return this.parseHtml5MediaEntries(...args);
  }
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

  test("htmlExtractTitle uses parsed title text", () => {
    expect(ie.htmlExtractTitlePublic("<title>Foo &amp; Bar</title>")).toBe("Foo & Bar");
    expect(ie.htmlExtractTitlePublic("<html></html>")).toBeNull();
  });
});

describe("InfoExtractor common helpers", () => {
  const ie = new TestInfoExtractor();

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

describe("Python test_InfoExtractor.py inventory", () => {
  test.todo("test_ie_key", () => undefined);
  test.todo("test_get_netrc_login_info", () => undefined);
  test.todo("test_search_json_ld_realworld: Eporner VideoObject normalization", () => undefined);
  test.todo("test_search_json_ld_realworld: NewsArticle graph selection", () => undefined);
  test.todo("test_search_json_ld_realworld: TVEpisode nested VideoObject chapters", () => undefined);
  test.todo("test_search_json_ld_realworld: multiple thumbnailUrl list normalization", () => undefined);
  test.todo("test_search_json_ld_realworld: single thumbnailUrl normalization", () => undefined);
  test.todo("test_search_json_ld_realworld: protocol-relative thumbnail_url normalization", () => undefined);
  test.todo("test_download_json", () => undefined);
  test.todo("test_extract_jwplayer_data_realworld: suffolk", () => undefined);
  test.todo("test_extract_jwplayer_data_realworld: pornoxo", () => undefined);
  test.todo("test_parse_m3u8_formats", () => undefined);
  test.todo("test_parse_mpd_formats", () => undefined);
  test.todo("test_parse_ism_formats", () => undefined);
  test.todo("test_parse_f4m_formats", () => undefined);
  test.todo("test_parse_xspf", () => undefined);
  test.todo("test_response_with_expected_status_returns_content", () => undefined);
  test.todo("test_search_nuxt_json", () => undefined);
  test.todo("test_extract_m3u8_formats", () => undefined);
  test.todo("test_extract_m3u8_formats_warning", () => undefined);
});
