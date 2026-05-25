// Source: test/test_traversal.py

import { describe, expect, test } from "bun:test";

import {
  dictGet,
  Ellipsis,
  findElement,
  findElements,
  require,
  subsListToDict,
  traverseObj,
  trimStr,
  unpack,
} from "../yt_dlp/utils/traversal.ts";

const testData = {
  100: 100,
  "1.2": 1.2,
  str: "str",
  None: null,
  urls: [
    { index: 0, url: "https://www.example.com/0" },
    { index: 1, url: "https://www.example.com/1" },
  ],
  data: [{ index: 2 }, { index: 3 }],
  dict: {},
};

const testHtml = `<html><body>
    <div class="a">1</div>
    <div class="a" id="x" custom="z">2</div>
    <div class="b" data-id="y" custom="z">3</div>
    <p class="a">4</p>
    <p id="d" custom="e">5</p>
</body></html>`;

describe("traverseObj", () => {
  test("base path handling", () => {
    expect(traverseObj<unknown>(testData, ["str"])).toBe("str");
    expect(traverseObj<unknown>(testData, "str")).toBe("str");
    expect(traverseObj<unknown>(testData, null)).toBe(testData);
  });

  test("ellipsis selects values", () => {
    expect(traverseObj<unknown>(testData, ["urls", 0, Ellipsis])).toEqual([
      0,
      "https://www.example.com/0",
    ]);
    expect(traverseObj<unknown>(testData, [Ellipsis, Ellipsis, "url"])).toEqual(
      ["https://www.example.com/0", "https://www.example.com/1"],
    );
    expect(
      traverseObj<unknown>(testData, [Ellipsis, Ellipsis, "index"]),
    ).toEqual([0, 1, 2, 3]);
  });

  test("function filters and transformations", () => {
    expect(
      traverseObj<unknown>(testData, (_key, value) => Array.isArray(value)),
    ).toEqual([testData.urls, testData.data]);
    expect(
      traverseObj<unknown>(testData, [
        Ellipsis,
        new Set([
          (value: unknown) =>
            typeof value === "string" ? value.toUpperCase() : null,
        ]),
      ]),
    ).toEqual(["STR"]);
  });

  test("alternatives and object mapping", () => {
    expect(traverseObj<unknown>(testData, "fail", "str")).toBe("str");
    expect(
      traverseObj<unknown>(testData, {
        first: ["urls", 0, "url"],
        missing: "fail",
      }),
    ).toEqual({ first: "https://www.example.com/0" });
  });

  test("expected type and get_all", () => {
    expect(
      traverseObj(testData, [Ellipsis], {
        expected_type: (value): value is string => typeof value === "string",
      }),
    ).toEqual(["str"]);
    expect(
      traverseObj(testData, [Ellipsis], {
        expected_type: (value): value is string => typeof value === "string",
        get_all: false,
      }),
    ).toBe("str");
  });
});

describe("dictGet", () => {
  test("gets first available key", () => {
    expect(dictGet({ a: null, b: "", c: "value" }, ["a", "b", "c"])).toBe(
      "value",
    );
    expect(dictGet({ a: "" }, ["a"], "default", false)).toBe("");
  });
});

describe("traversal helper functions", () => {
  test("require passes values and rejects nullish traversal results", () => {
    expect(traverseObj<unknown>(testData, ["str", new Set([require("value")])])).toBe("str");
    expect(() => traverseObj(testData, ["None", new Set([require("value")])])).toThrow("Unable to extract value");
  });

  test("subsListToDict groups subtitles and filters incomplete entries", () => {
    const convert = subsListToDict(undefined, { lang: "en", ext: "vtt" }) as (value: Array<Record<string, unknown>> | null) => Record<string, Array<Record<string, unknown>>>;
    expect(convert([
        { name: "de", url: "https://example.com/subs/de.ass" },
        { name: "de" },
        { name: "en", content: "content" },
        { url: "https://example.com/subs/en" },
      ].map((item) => ({
        id: item.name,
        data: item.content,
        url: item.url,
      })))).toEqual({
      de: [{ url: "https://example.com/subs/de.ass", ext: "vtt" }],
      en: [{ data: "content", ext: "vtt" }, { url: "https://example.com/subs/en", ext: "vtt" }],
    });
  });

  test("trimStr and unpack", () => {
    expect(trimStr({ start: "ab" })("abc")).toBe("c");
    expect(trimStr({ end: "bc" })("abc")).toBe("a");
    expect(trimStr({ start: "a", end: "c" })("abc")).toBe("b");
    expect(unpack((...items: number[]) => items.join(""))([1, 2, 3])).toBe("123");
  });

  test("findElement and findElements", () => {
    expect(findElement({ cls: "a" })(testHtml)).toBe("1");
    expect(findElement({ cls: "a", html: true })(testHtml)).toBe('<div class="a">1</div>');
    expect(findElement({ id: "x" })(testHtml)).toBe("2");
    expect(findElement({ id: "[ex]", regex: true })(testHtml)).toBe("2");
    expect(findElement({ attr: "data-id", value: "y" })(testHtml)).toBe("3");
    expect(findElement({ attr: "data-id", value: "y(?:es)?", regex: true })(testHtml)).toBe("3");
    expect(findElements({ cls: "a" })(testHtml)).toEqual(["1", "2", "4"]);
    expect(findElements({ attr: "custom", value: "[ez]", regex: true })(testHtml)).toEqual(["2", "3", "5"]);
  });
});
