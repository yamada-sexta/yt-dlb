// Source: test/test_traversal.py

import { describe, expect, test } from "bun:test";

import { dictGet, Ellipsis, traverseObj } from "../yt_dlp/utils/traversal.ts";

const testData = {
  100: 100,
  "1.2": 1.2,
  str: "str",
  None: null,
  urls: [
    { index: 0, url: "https://www.example.com/0" },
    { index: 1, url: "https://www.example.com/1" },
  ],
  data: [
    { index: 2 },
    { index: 3 },
  ],
  dict: {},
};

describe("traverseObj", () => {
  test("base path handling", () => {
    expect(traverseObj<unknown>(testData, ["str"])).toBe("str");
    expect(traverseObj<unknown>(testData, "str")).toBe("str");
    expect(traverseObj<unknown>(testData, null)).toBe(testData);
  });

  test("ellipsis selects values", () => {
    expect(traverseObj<unknown>(testData, ["urls", 0, Ellipsis])).toEqual([0, "https://www.example.com/0"]);
    expect(traverseObj<unknown>(testData, [Ellipsis, Ellipsis, "url"])).toEqual(["https://www.example.com/0", "https://www.example.com/1"]);
    expect(traverseObj<unknown>(testData, [Ellipsis, Ellipsis, "index"])).toEqual([0, 1, 2, 3]);
  });

  test("function filters and transformations", () => {
    expect(traverseObj<unknown>(testData, (_key, value) => Array.isArray(value))).toEqual([testData.urls, testData.data]);
    expect(traverseObj<unknown>(testData, [Ellipsis, new Set([(value: unknown) => typeof value === "string" ? value.toUpperCase() : null])])).toEqual(["STR"]);
  });

  test("alternatives and object mapping", () => {
    expect(traverseObj<unknown>(testData, "fail", "str")).toBe("str");
    expect(traverseObj<unknown>(testData, { first: ["urls", 0, "url"], missing: "fail" })).toEqual({ first: "https://www.example.com/0" });
  });

  test("expected type and get_all", () => {
    expect(traverseObj(testData, [Ellipsis], { expected_type: (value): value is string => typeof value === "string" })).toBe("str");
    expect(traverseObj(testData, [Ellipsis], { expected_type: (value): value is string => typeof value === "string", get_all: false })).toBe("str");
  });
});

describe("dictGet", () => {
  test("gets first available key", () => {
    expect(dictGet({ a: null, b: "", c: "value" }, ["a", "b", "c"])).toBe("value");
    expect(dictGet({ a: "" }, ["a"], "default", false)).toBe("");
  });
});
