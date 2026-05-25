// Source: selected cases from test/test_update.py

import { describe, expect, test } from "bun:test";

import { UPDATE_SOURCES, makeLabel } from "../yt_dlp/update.ts";

describe("update helpers", () => {
  test("UPDATE_SOURCES matches Python fixture", () => {
    expect(UPDATE_SOURCES).toEqual({
      stable: "yt-dlp/yt-dlp",
      nightly: "yt-dlp/yt-dlp-nightly-builds",
      master: "yt-dlp/yt-dlp-master-builds",
    });
  });

  test.each([
    [UPDATE_SOURCES.stable, "2025.09.02", "2025.09.02", `stable@2025.09.02 from ${UPDATE_SOURCES.stable}`],
    [UPDATE_SOURCES.nightly, "2025.09.02.123456", "2025.09.02.123456", `nightly@2025.09.02.123456 from ${UPDATE_SOURCES.nightly}`],
    [UPDATE_SOURCES.master, "2025.09.02.987654", "2025.09.02.987654", `master@2025.09.02.987654 from ${UPDATE_SOURCES.master}`],
    ["fork/yt-dlp", "experimental", "2025.12.31.000000", "fork/yt-dlp@experimental build 2025.12.31.000000"],
    ["fork/yt-dlp", "2025.09.02", "2025.09.02", "fork/yt-dlp@2025.09.02"],
    [UPDATE_SOURCES.stable, "experimental", "2025.12.31.000000", `${UPDATE_SOURCES.stable}@experimental build 2025.12.31.000000`],
    [UPDATE_SOURCES.stable, "experimental", null, `${UPDATE_SOURCES.stable}@experimental`],
    ["fork/yt-dlp", "experimental", null, "fork/yt-dlp@experimental"],
  ] as const)("makeLabel %s %s %s", (origin, tag, buildVersion, expected) => {
    expect(makeLabel(origin, tag, buildVersion)).toBe(expected);
  });

  test.todo("test_update_spec once update spec processing is public or exposed through query fixtures", () => undefined);
  test.todo("test_query_update once release API and update-spec downloads can be injected without private fields", () => undefined);
});
