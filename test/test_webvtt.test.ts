// Source: yt_dlp/webvtt.py

import { describe, expect, test } from "bun:test";

import { CueBlock, Magic, ParseError, formatTs, parseFragment, parseTs } from "../yt_dlp/webvtt.ts";

describe("WebVTT parser", () => {
  test("timestamp parse/format", () => {
    const match = /(?:([0-9]{1,}):)?([0-9]{2}):([0-9]{2})\.([0-9]{3})?/.exec("01:02:03.456");
    expect(match).not.toBeNull();
    expect(parseTs(match!)).toBe(335_010_240);
    expect(formatTs(335_010_240)).toBe("01:02:03.456");
  });

  test("parse fragment with cue", () => {
    const blocks = [...parseFragment("WEBVTT\n\ncue-id\n00:00:01.000 --> 00:00:02.500 align:start\nhello\n")];
    expect(blocks[0]).toBeInstanceOf(Magic);
    expect(blocks[1]).toBeInstanceOf(CueBlock);
    const cue = blocks[1] as CueBlock;
    expect(cue.asJson).toEqual({
      id: "cue-id",
      start: 90_000,
      end: 225_000,
      settings: "align:start",
      text: "hello\n",
    });
  });

  test("CueBlock JSON roundtrip and hinges", () => {
    const first = CueBlock.fromJson({ id: undefined, start: 0, end: 90_000, settings: "line:0", text: "hello\n" });
    const second = CueBlock.fromJson({ id: undefined, start: 90_000, end: 180_000, settings: "line:0", text: "hello\n" });
    expect(first.equals(CueBlock.fromJson(first.asJson))).toBe(true);
    expect(first.hinges(second)).toBe(true);
  });

  test("invalid fragment raises ParseError", () => {
    expect(() => [...parseFragment("not webvtt")]).toThrow(ParseError);
  });
});
