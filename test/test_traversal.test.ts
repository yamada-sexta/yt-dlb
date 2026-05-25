// Source: test/test_traversal.py

import { describe, expect, test } from "bun:test";

import { compatEtreeFromstring } from "../yt_dlp/compat/index.ts";
import { CookieMorsel } from "../yt_dlp/cookies.ts";
import {
  ALL,
  ANY,
  dictGet,
  Ellipsis,
  FILTER,
  findElement,
  findElements,
  require,
  slice,
  subsListToDict,
  traverseObj,
  trimStr,
  unpack,
} from "../yt_dlp/utils/traversal.ts";
import { intOrNone } from "../yt_dlp/utils/utils.ts";

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
    expect(traverseObj<unknown>(testData, 100)).toBe(100);
    expect(traverseObj<unknown>(testData, 1.2)).toBe(1.2);
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
      traverseObj<unknown>(testData, (_key, value) => typeof (value as string[])[0] === "string"),
    ).toEqual(["str"]);
    expect(
      traverseObj<unknown>(new Set([0, 1, 2, 3]), (_key, value) => Number(value) % 2 === 0),
    ).toEqual([0, 2]);
    expect(
      traverseObj<unknown>(testData, [
        Ellipsis,
        new Set([
          (value: unknown) =>
            typeof value === "string" ? value.toUpperCase() : null,
        ]),
      ]),
    ).toEqual(["STR"]);
    expect(traverseObj<unknown>(testData, [Ellipsis, new Set([String])])).toEqual(["str"]);
    expect(traverseObj<unknown>(testData, [Ellipsis, new Set([String, Number])])).toEqual([100, 1.2, "str"]);
    expect(traverseObj<unknown>(testData, ["fail", new Set([() => "const"])]))
      .toBe("const");
    expect(() => traverseObj<unknown>(testData, new Set())).toThrow("Set traversal key");
    expect(() => traverseObj<unknown>(testData, new Set([String, () => "x"]))).toThrow("Set traversal keys");
  });

  test("branch reset helpers", () => {
    expect(traverseObj<unknown>(testData, [Ellipsis, Ellipsis, "url", ANY])).toBe("https://www.example.com/0");
    expect(traverseObj<unknown>(testData, [Ellipsis, Ellipsis, "url", ALL])).toEqual(["https://www.example.com/0", "https://www.example.com/1"]);
    expect(traverseObj<unknown>({ items: [0, 1, false, 2] }, ["items", Ellipsis, FILTER])).toEqual([1, 2]);
    expect(traverseObj<unknown>(testData, [[100, "1.2"], ALL])).toEqual([100, 1.2]);
    expect(traverseObj<unknown>(testData, [[100, "1.2"], ANY])).toBe(100);
    expect(traverseObj<unknown>(testData, [[100], ALL])).toEqual([100]);
    expect(traverseObj<unknown>(testData, [["dict", "None", 100], ALL])).toEqual([100]);
    expect(traverseObj<unknown>(testData, [["dict", "None", 100], ANY])).toBe(100);
    expect(traverseObj<unknown>(testData, [["dict", "None", 100, "1.2"], ALL, new Set([(value: unknown) => typeof value === "number" && !Number.isInteger(value) ? value : null])])).toBeNull();
    expect(traverseObj<unknown>(testData, [["dict", "None", 100, "1.2"], ALL, Ellipsis, new Set([(value: unknown) => typeof value === "number" && !Number.isInteger(value) ? value : null])])).toEqual([1.2]);
    expect(traverseObj<unknown>(testData, [["dict", "None", "urls", "data"], ANY, Ellipsis, "index"])).toEqual([0, 1]);
  });

  test("cookie morsel traversal", () => {
    const morsel = new CookieMorsel();
    const values = Object.fromEntries(
      [...morsel].map((key, index) => [key, String.fromCharCode(97 + index)]),
    );
    morsel.set("item_key", "item_value", "coded_value");
    morsel.update(values);

    const expected = { ...values, key: "item_key", value: "item_value" };
    for (const [key, value] of Object.entries(expected)) {
      expect(traverseObj<unknown>(morsel, key)).toBe(value);
    }
    expect(traverseObj<unknown>(morsel, Ellipsis)).toEqual(Object.values(expected));
    expect(traverseObj<unknown>(morsel, (_key, _value) => true)).toEqual(Object.values(expected));
    expect(traverseObj<unknown>(morsel, [[null], ANY])).toBe(morsel);
  });

  test("slice and string traversal options", () => {
    expect(traverseObj<unknown>(testData, ["dict", slice(1)])).toBeNull();
    expect(traverseObj<unknown>([0, 1, 2, 3, 4], slice(1, 4, 2))).toEqual([1, 3]);
    expect(traverseObj<unknown>({ Key: "value" }, "key", { casesense: false })).toBe("value");
    expect(traverseObj<unknown>(123, slice(1, 3), { traverse_string: true })).toBe("23");
    expect(traverseObj<unknown>(123, Ellipsis, { traverse_string: true })).toBe("123");
    expect(traverseObj<unknown>("str", (_index, value) => value === "s" || value === "r", { traverse_string: true })).toBe("sr");
    expect(traverseObj<unknown>({ str: "str", 1.2: 1.2 }, ["str", 0])).toBeNull();
    expect(traverseObj<unknown>({ str: "str", 1.2: 1.2 }, ["str", 0], { traverse_string: true })).toBe("s");
    expect(traverseObj<unknown>({ str: "str", 1.2: 1.2 }, [1.2, 1], { traverse_string: true })).toBe(".");
    expect(traverseObj<unknown>({ str: "str" }, ["str", slice(0, null, 2)], { traverse_string: true })).toBe("sr");
    expect(traverseObj<unknown>({ str: "str" }, ["str", [0, 2]], { traverse_string: true })).toEqual(["s", "r"]);
  });

  test("RegExp match traversal", () => {
    const match = /^0(12)(?<group>3)(4)?$/.exec("0123");
    expect(match).not.toBeNull();
    expect(traverseObj<unknown>(match, Ellipsis)).toEqual(["12", "3"]);
    expect(traverseObj<unknown>(match, (_key, _value) => _key === 0 || _key === 2)).toEqual(["0123", "3"]);
    expect(traverseObj<unknown>(match, "group")).toBe("3");
    expect(traverseObj<unknown>(match, 2)).toBe("3");
    expect(traverseObj<unknown>(match, "gRoUp", { casesense: false })).toBe("3");
    expect(traverseObj<unknown>(match, "fail")).toBeNull();
    expect(traverseObj<unknown>(match, 8)).toBeNull();
    expect(traverseObj<unknown>(match, (_key, _value) => _key === 0 || _key === "group")).toEqual(["0123", "3"]);
  });

  test("alternatives and object mapping", () => {
    expect(traverseObj<unknown>(testData, "fail", "str")).toBe("str");
    expect(traverseObj<unknown>(testData, ["urls", [3, 0], "url"])).toEqual([
      "https://www.example.com/0",
    ]);
    expect(traverseObj<unknown>(testData, ["urls", [[1, "fail"], [0, "url"]]])).toEqual([
      "https://www.example.com/0",
    ]);
    expect(traverseObj<unknown>(testData, ["urls", [[0, ["fail", "url"]], [1, "url"]]])).toEqual([
      "https://www.example.com/0",
      "https://www.example.com/1",
    ]);
    expect(traverseObj<unknown>(["0", [1, 2]], [[0, 1], 0])).toEqual([1]);
    expect(
      traverseObj<unknown>(testData, {
        first: ["urls", 0, "url"],
        missing: "fail",
      }),
    ).toEqual({ first: "https://www.example.com/0" });
    expect(
      traverseObj<unknown>(testData, {
        first: ["urls", [[1, "fail"], [0, "url"]]],
      }),
    ).toEqual({ first: ["https://www.example.com/0"] });
    expect(traverseObj<unknown>(testData, { first: "fail" })).toEqual({});
    expect(
      traverseObj<unknown>(testData, { first: "fail" }, { default: "default" }),
    ).toEqual({ first: "default" });
    expect(traverseObj<unknown>(testData, { first: "dict" })).toEqual({});
    expect(
      traverseObj<unknown>(testData, { first: "dict" }, { default: "default" }),
    ).toEqual({ first: "default" });
    expect(traverseObj<unknown>(testData, { first: { nested: "fail" } })).toEqual({});
    expect(
      traverseObj<unknown>(
        testData,
        { first: { nested: "fail" } },
        { default: "default" },
      ),
    ).toEqual({ first: { nested: "default" } });
    expect(
      traverseObj<unknown>(testData, {
        all: [["dict", "None", 100, 1.2], ALL],
        any: [["dict", "None", 100, 1.2], ANY],
      }),
    ).toEqual({ all: [100, 1.2], any: 100 });
    expect(
      traverseObj<unknown>(testData, {
        all: [["dict", "None", 100, 1.2], ALL],
        any: [["dict", "None", 100, 1.2], ANY],
      }, { get_all: false }),
    ).toEqual({ all: [100, 1.2], any: 100 });
  });

  test("expected type and get_all", () => {
    const expectedTypeData = { str: "str", int: 0 };
    expect(
      traverseObj<unknown>(expectedTypeData, "int", {
        expected_type: (value) => String(value),
      }),
    ).toBe("0");
    expect(
      traverseObj<unknown>(expectedTypeData, "str", {
        expected_type: () => {
          throw new Error("boom");
        },
      }),
    ).toBeNull();
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
    expect(
      traverseObj<unknown>(testData, { int: 100, fractional: "1.2" }, {
        expected_type: (value) => Number.isInteger(value) ? value : null,
      }),
    ).toEqual({ int: 100 });
    expect(
      traverseObj<unknown>(testData, { outer: { int: 100, str: "str" } }, {
        expected_type: (value) => typeof value === "number" ? value : null,
      }),
    ).toEqual({ outer: { int: 100 } });
    const caseData = { KeY: "value0", 0: { KeY: "value1", 0: { KeY: "value2" } } };
    expect(traverseObj<unknown>(caseData, "key")).toBeNull();
    expect(traverseObj<unknown>(caseData, "keY", { casesense: false })).toBe("value0");
    expect(traverseObj<unknown>(caseData, [0, ["keY"]], { casesense: false })).toEqual(["value1"]);
    expect(traverseObj<unknown>(caseData, [0, [[0, "keY"]]], { casesense: false })).toEqual(["value2"]);
    expect(traverseObj<unknown>({ key: [0, 1, 2] }, ["key", Ellipsis], { get_all: false })).toBe(0);
    expect(traverseObj<unknown>({ key: [0, 1, 2] }, Ellipsis, { get_all: false })).toEqual([0, 1, 2]);
  });

  test("branched defaults", () => {
    expect(traverseObj<unknown>({ None: null, int: 0, list: [] }, "fail")).toBeNull();
    expect(traverseObj<unknown>({ None: null, int: 0, list: [] }, "fail", { default: 1 })).toBe(1);
    expect(traverseObj<unknown>({ None: null, int: 0, list: [] }, ["None"], { default: 1 })).toBe(1);
    expect(traverseObj<unknown>({ None: null, int: 0, list: [] }, [Ellipsis, "fail"], { default: 1 })).toBe(1);
    expect(traverseObj<unknown>({ None: null, int: 0, list: [] }, [Ellipsis, "fail"])).toEqual([]);
    expect(traverseObj<unknown>({ None: null, int: 0, list: [] }, ["list", Ellipsis])).toEqual([]);
    expect(traverseObj<unknown>(null, Ellipsis)).toEqual([]);
    expect(traverseObj<unknown>({ 0: null }, [0, Ellipsis])).toEqual([]);
    expect(traverseObj<unknown>({}, "fail", [Ellipsis])).toEqual([]);
    expect(traverseObj<unknown>({}, [Ellipsis], "fail")).toBeNull();
    for (const path of [
      ["fail", Ellipsis],
      [Ellipsis, "fail"],
      [...Array(10).fill("fail"), Ellipsis],
      [Ellipsis, ...Array(10).fill("fail")],
    ]) {
      expect(traverseObj<unknown>({}, path)).toEqual([]);
      expect(traverseObj<unknown>({}, "fail", path)).toEqual([]);
      expect(traverseObj<unknown>({ 0: "x" }, 0, path)).toBe("x");
      expect(traverseObj<unknown>({ 0: "x" }, path, 0)).toBe("x");
      expect(traverseObj<unknown>({}, path, "fail")).toBeNull();
    }
  });

  test("filter helper uses Python truthiness", () => {
    const data = [null, false, true, 0, 1, 0.0, 1.1, "", "str", {}, { 0: 0 }, [], [1]];
    expect(traverseObj<unknown>(data, [Ellipsis, FILTER])).toEqual([
      true,
      1,
      1.1,
      "str",
      { 0: 0 },
      [1],
    ]);
  });

  test("XML ElementTree traversal", () => {
    const etree = compatEtreeFromstring(`<?xml version="1.0"?>
        <data>
            <country name="Liechtenstein">
                <rank>1</rank>
                <year>2008</year>
                <gdppc>141100</gdppc>
                <neighbor name="Austria" direction="E"/>
                <neighbor name="Switzerland" direction="W"/>
            </country>
            <country name="Singapore">
                <rank>4</rank>
                <year>2011</year>
                <gdppc>59900</gdppc>
                <neighbor name="Malaysia" direction="N"/>
            </country>
            <country name="Panama">
                <rank>68</rank>
                <year>2011</year>
                <gdppc>13600</gdppc>
                <neighbor name="Costa Rica" direction="W"/>
                <neighbor name="Colombia" direction="E"/>
            </country>
        </data>`);

    expect(traverseObj<unknown>(etree, "")).toBe(etree);
    expect(traverseObj<unknown>(etree, "country")).toEqual(etree.children);
    expect(traverseObj<unknown>(etree, Ellipsis)).toEqual(etree.children);
    expect(traverseObj<unknown>(etree, (_index, child) => {
      const element = child as { children?: Array<{ text: string | null }> };
      return element.children?.[0]?.text === "4";
    })).toEqual([etree.children[1]]);
    expect(traverseObj<unknown>(etree, (index) => index === 1)).toEqual([
      etree.children[1],
    ]);
    expect(traverseObj<unknown>(etree, 0)).toBe(etree.children[0]);
    expect(traverseObj<unknown>(etree, ".//neighbor/@name")).toEqual([
      "Austria",
      "Switzerland",
      "Malaysia",
      "Costa Rica",
      "Colombia",
    ]);
    expect(traverseObj<unknown>(etree, "//neighbor/@fail")).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(traverseObj<unknown>(etree, ["//neighbor/@", 2])).toEqual({
      name: "Malaysia",
      direction: "N",
    });
    expect(traverseObj<unknown>(etree, "//year/text()")).toEqual([
      "2008",
      "2011",
      "2011",
    ]);
    expect(traverseObj<unknown>(etree, "//*[@direction]/@direction")).toEqual([
      "E",
      "W",
      "N",
      "W",
      "E",
    ]);
    expect(traverseObj<unknown>(etree, [0, "@name"])).toBe("Liechtenstein");
    expect(
      traverseObj<unknown>(etree, [
        "country",
        0,
        Ellipsis,
        "text()",
        new Set([intOrNone]),
      ]),
    ).toEqual([1, 2008, 141100]);
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
