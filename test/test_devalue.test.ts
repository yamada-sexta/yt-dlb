// Source: test/test_devalue.py

import { describe, expect, test } from "bun:test";

import { parse } from "../yt_dlp/utils/jslib/devalue.ts";

describe("devalue.parse", () => {
  test.each([
    ["int", [-42], -42],
    ["str", ["woo!!!"], "woo!!!"],
    ["Number", [["Object", 42]], 42],
    ["String", [["Object", "yar"]], "yar"],
    ["Infinity", -4, Number.POSITIVE_INFINITY],
    ["negative Infinity", -5, Number.NEGATIVE_INFINITY],
    ["negative zero", -6, -0],
    ["Array", [[1, 2, 3], "a", "b", "c"], ["a", "b", "c"]],
    ["Array empty", [[]], []],
    ["Array sparse", [[-2, 1, -2], "b"], [null, "b", null]],
    ["Object", [{ foo: 1, "x-y": 2 }, "bar", "z"], { foo: "bar", "x-y": "z" }],
    ["BigInt", [["BigInt", "1"]], 1n],
    ["str repetition", [[1, 1], "a string"], ["a string", "a string"]],
    ["null repetition", [[1, 1], null], [null, null]],
    ["object without prototype", [["null"]], {}],
    ["cross-realm POJO", [{}], {}],
  ] as const)("%s", (_name, unparsed, expected) => {
    expect(parse(unparsed)).toEqual(expected);
  });

  test("special JS values", () => {
    expect(parse(-1)).toBeUndefined();
    expect(parse([null])).toBeNull();
    expect(Number.isNaN(parse(-3) as number)).toBe(true);
    expect(Object.is(parse(-6), -0)).toBe(true);
  });

  test("rich JS objects", () => {
    expect(parse([["Date", "2001-09-09T01:46:40.000Z"]])).toEqual(
      new Date(1_000_000_000_000),
    );
    expect(parse([["RegExp", "regexp", "gim"]])).toEqual(/regexp/gim);
    expect(parse([["Set", 1, 2, 3], 1, 2, 3])).toEqual(new Set([1, 2, 3]));
    expect(parse([["Map", 1, 2], "a", "b"])).toEqual(new Map([["a", "b"]]));
    expect(parse([["Uint8Array", "AQID"]])).toEqual(Uint8Array.from([1, 2, 3]));
    expect(
      new Uint8Array(parse([["ArrayBuffer", "AQID"]]) as ArrayBuffer),
    ).toEqual(Uint8Array.from([1, 2, 3]));
  });

  test.each([
    ["empty string", "", /expected int or list as input/],
    ["hole", -2, /invalid integer input/],
    ["string", "hello", /expected int or list as input/],
    ["number", 42, /invalid integer input/],
    ["boolean", true, /expected int or list as input/],
    ["null", null, /expected int or list as input/],
    ["object", {}, /expected int or list as input/],
    ["empty array", [], /expected a non-empty list as input/],
    [
      "negative index",
      [[1, 2, 3, 4, 5, 6, 7, -7], 1, 2, 3, 4, 5, 6, 7],
      /invalid index: -7/,
    ],
  ] as const)("%s invalid", (_name, unparsed, pattern) => {
    expect(() => parse(unparsed)).toThrow(pattern);
  });

  test("cyclical containers", () => {
    const mapResult = parse([["Map", 1, 0], "self"]) as Map<unknown, unknown>;
    expect(mapResult.get("self")).toBe(mapResult);

    const setResult = parse([["Set", 0, 1], 42]) as Set<unknown>;
    expect(setResult.has(setResult)).toBe(true);
    expect(setResult.has(42)).toBe(true);

    const arrayResult = parse([[0]]) as unknown[];
    expect(arrayResult[0]).toBe(arrayResult);

    const objectResult = parse([{ self: 0 }]) as { self: unknown };
    expect(objectResult.self).toBe(objectResult);

    const nullObjectResult = parse([["null", "self", 0]]) as { self: unknown };
    expect(nullObjectResult.self).toBe(nullObjectResult);
  });

  test("revivers", () => {
    expect(
      parse([["indirect", 1], { a: 2 }, "b"], {
        revivers: { indirect: (value) => value },
      }),
    ).toEqual({ a: "b" });
    expect(
      parse([["parse", 1], '{"a":0}'], {
        revivers: { parse: (value) => JSON.parse(String(value)) as unknown },
      }),
    ).toEqual({ a: 0 });
    expect(
      parse([{ a: 1, b: 3 }, ["EmptyRef", 2], "false", ["EmptyRef", 2]], {
        revivers: { EmptyRef: (value) => JSON.parse(String(value)) as unknown },
      }),
    ).toEqual({ a: false, b: false });
  });
});
