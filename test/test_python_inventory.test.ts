// Source: new Bun test inventory for unported Python tests.

import { describe, expect, test } from "bun:test";

type PythonTest = {
  readonly path: string;
  readonly suite: string | null;
  readonly name: string;
};

const ignoredPythonTests = new Set([
  "test/__init__.py",
  "test/conftest.py",
  "test/helper.py",
  "test/test_jsc/conftest.py",
  "test/test_pot/conftest.py",
]);

const pythonTestPaths = await discoverPythonTestPaths();
const tsTestPaths = new Set(await discoverTsTestPaths());
const unportedPythonTests = new Map<string, PythonTest[]>();

for (const path of pythonTestPaths) {
  if (tsTestPaths.has(tsPathForPythonTest(path))) {
    continue;
  }
  const source = await Bun.file(path).text();
  const tests = collectPythonTests(path, source);
  if (tests.length) {
    unportedPythonTests.set(path, tests);
  }
}

describe("Python test migration inventory", () => {
  test("every Python test module is either ported or tracked as TODOs", () => {
    expect(pythonTestPaths.length).toBeGreaterThan(0);
  });

  for (const [path, tests] of unportedPythonTests) {
    describe(path, () => {
      for (const item of tests) {
        test.todo(`${item.suite ? `${item.suite}.` : ""}${item.name}`, () => undefined);
      }
    });
  }
});

async function discoverPythonTestPaths(): Promise<string[]> {
  const glob = new Bun.Glob("test/**/*.py");
  const paths: string[] = [];
  for await (const path of glob.scan(".")) {
    if (ignoredPythonTests.has(path) || path.includes("/testdata/")) {
      continue;
    }
    const basename = path.split("/").at(-1) ?? "";
    if (!basename.startsWith("test_")) {
      continue;
    }
    paths.push(path);
  }
  return paths.sort();
}

async function discoverTsTestPaths(): Promise<string[]> {
  const glob = new Bun.Glob("test/**/*.test.ts");
  const paths: string[] = [];
  for await (const path of glob.scan(".")) {
    paths.push(path);
  }
  return paths.sort();
}

function tsPathForPythonTest(path: string): string {
  return path.replace(/\.py$/, ".test.ts");
}

function collectPythonTests(path: string, source: string): PythonTest[] {
  const tests: PythonTest[] = [];
  let suite: string | null = null;
  let suiteIndent = -1;

  for (const line of source.split(/\r?\n/)) {
    const classMatch = /^(?<indent>\s*)class\s+(?<name>Test\w*)\b/.exec(line);
    const className = classMatch?.groups?.name;
    const classIndent = classMatch?.groups?.indent;
    if (className !== undefined && classIndent !== undefined) {
      suite = className;
      suiteIndent = classIndent.length;
      continue;
    }

    const defMatch = /^(?<indent>\s*)(?:async\s+)?def\s+(?<name>test_\w*)\s*\(/.exec(line);
    const defName = defMatch?.groups?.name;
    const defIndent = defMatch?.groups?.indent;
    if (defName === undefined || defIndent === undefined) {
      continue;
    }
    const indent = defIndent.length;
    if (suite !== null && indent <= suiteIndent) {
      suite = null;
      suiteIndent = -1;
    }
    tests.push({ path, suite, name: defName });
  }
  return tests;
}
