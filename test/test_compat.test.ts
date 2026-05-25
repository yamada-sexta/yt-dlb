// Source: test/test_compat.py

import { describe, expect, test } from "bun:test";

import {
  compatDatetimeFromTimestamp,
  compatEtreeFromstring,
  compatExpanduser,
} from "../yt_dlp/compat/index.ts";
import { compat_basestring } from "../yt_dlp/compat/legacy.ts";
import { getproxies } from "../yt_dlp/compat/urllib/request.ts";
import { getproxies as namespacedGetproxies } from "../yt_dlp/compat/urllib/index.ts";

describe("compat helpers", () => {
  test("compat passthrough exports match Python fixture behavior", () => {
    expect(compat_basestring).toBe(String);
    expect(namespacedGetproxies).toBe(getproxies);
  });

  test.todo("test_compat_passthrough compat_pycrypto_AES once PyCrypto compatibility is ported", () => undefined);

  test("compatExpanduser uses HOME", () => {
    const oldHome = process.env.HOME;
    const testHome = String.raw`C:\Documents and Settings\test\Application Data`;
    try {
      process.env.HOME = testHome;
      expect(compatExpanduser("~")).toBe(testHome);
      expect(compatExpanduser("~/file")).toBe(`${testHome}/file`);
    } finally {
      if (oldHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = oldHome;
      }
    }
  });

  test("compatEtreeFromstring parses attributes, text, children, and doctype", () => {
    const doc = compatEtreeFromstring(`
      <root foo="bar" spam="中文">
        <normal>foo</normal>
        <chinese>中文</chinese>
        <foo><bar>spam</bar></foo>
      </root>
    `);

    expect(doc.attrib.foo).toBe("bar");
    expect(doc.attrib.spam).toBe("中文");
    expect(doc.children.find((child) => child.tag === "normal")?.text).toBe("foo");
    expect(doc.children.find((child) => child.tag === "chinese")?.text).toBe("中文");
    expect(doc.children.find((child) => child.tag === "foo")?.children[0]?.text).toBe("spam");

    expect(compatEtreeFromstring(`<?xml version="1.0"?>
<!DOCTYPE smil PUBLIC "-//W3C//DTD SMIL 2.0//EN" "http://www.w3.org/2001/SMIL20/SMIL20.dtd">
<smil xmlns="http://www.w3.org/2001/SMIL20/Language"></smil>`).tag).toBe("{http://www.w3.org/2001/SMIL20/Language}smil");
  });

  test.each([
    [0, "1970-01-01T00:00:00.000Z"],
    [1, "1970-01-01T00:00:01.000Z"],
    [3600, "1970-01-01T01:00:00.000Z"],
    [-1, "1969-12-31T23:59:59.000Z"],
    [-86400, "1969-12-31T00:00:00.000Z"],
    [0.5, "1970-01-01T00:00:00.500Z"],
    [1.000001, "1970-01-01T00:00:01.000Z"],
    [-1.25, "1969-12-31T23:59:58.750Z"],
    [-1577923200, "1920-01-01T00:00:00.000Z"],
    [4102444800, "2100-01-01T00:00:00.000Z"],
    [173568960000, "7470-03-08T00:00:00.000Z"],
  ] as const)("compatDatetimeFromTimestamp %s", (timestamp, expected) => {
    expect(compatDatetimeFromTimestamp(timestamp).toISOString()).toBe(expected);
  });

  test("struct unpack unsigned byte equivalent", () => {
    expect(Buffer.from([0x00]).readUInt8(0)).toBe(0);
  });
});
