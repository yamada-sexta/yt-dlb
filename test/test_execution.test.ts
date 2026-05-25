// Source: test/test_execution.py

import { describe, expect, test } from "bun:test";

import { main } from "../ytdlb.ts";

describe("Bun CLI execution", () => {
  test("test_main_exec version path", async () => {
    expect(await runQuietly(["--version"])).toBe(0);
  });

  test("test_import", async () => {
    expect(await import("../yt_dlp/index.ts")).toBeDefined();
  });

  test("test_cmdline_umlauts version path", async () => {
    expect(await runQuietly(["ä", "--version"])).toBe(0);
  });

  test.todo("TestExecution.test_module_exec once package module execution is defined for Bun", () =>
    undefined);
  test.todo("TestExecution.test_lazy_extractors once lazy extractor generation has a TypeScript equivalent", () =>
    undefined);
});

async function runQuietly(argv: readonly string[]): Promise<number> {
  const oldLog = console.log;
  try {
    console.log = () => undefined;
    return await main({ argv });
  } finally {
    console.log = oldLog;
  }
}
