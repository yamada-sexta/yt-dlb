// Source: yt_dlp/options.py
// Port note: Python optparse/config expansion is replaced with a Bun/Node parseArgs baseline.

import { parseArgs } from "node:util";
import { z } from "zod";

import { SUPPORTED_BROWSERS, SUPPORTED_KEYRINGS } from "./cookies.ts";
import { UPDATE_SOURCES, detectVariant, isNonUpdateable } from "./update.ts";
import { version } from "./version.ts";

const StringSchema = z.string();

export interface ParsedOptions {
  urls: string[];
  verbose: boolean;
  printHelp: boolean;
  version: boolean;
  output?: string;
  format?: string;
  quiet: boolean;
  simulate: boolean;
  skipDownload: boolean;
  updateSelf?: string | true;
  rmCacheDir: boolean;
  cookiefile?: string;
  cookiesfrombrowser?: readonly [string, string?, string?, string?];
  paths: Record<string, string>;
  headers: Record<string, string>;
  proxy?: string;
  socketTimeout?: number;
  noCheckCertificate: boolean;
  extractorArgs: Record<string, readonly string[]>;
  remoteComponents: string[];
  pluginDirs: string[];
  ignoreconfig: boolean;
}

export interface ParseOptsResult {
  parser: OptionParser;
  opts: ParsedOptions;
  args: string[];
}

export class OptionParser {
  #destroyed = false;

  constructor(readonly prog = "ytdlb") {}

  printHelp(): void {
    console.log(this.formatHelp());
  }

  error(message: string): never {
    throw new OptionParseError(`${this.prog}: error: ${message}`);
  }

  destroy(): void {
    this.#destroyed = true;
  }

  get destroyed(): boolean {
    return this.#destroyed;
  }

  formatHelp(): string {
    return [
      `${this.prog} [OPTIONS] URL [URL...]`,
      "",
      "Core options:",
      "  -h, --help                 Print this help",
      "  --version                  Print version",
      "  -o, --output TEMPLATE      Output filename/template",
      "  -f, --format FORMAT        Requested format selector",
      "  -q, --quiet                Suppress screen output",
      "  -v, --verbose              Enable debug output",
      "  -s, --simulate             Do not write media",
      "  --skip-download            Do not download media",
      "  -U, --update               Check/update ytdlb",
      "  --rm-cache-dir             Remove cache dir",
      "  --cookies FILE             Load Netscape cookies",
      "  --cookies-from-browser SPEC",
      "  --proxy URL",
      "  --socket-timeout SECONDS",
      "  --no-check-certificates",
      "  --remote-components LIST",
      "  --plugin-dirs LIST",
      "",
      `Runtime: ${detectVariant()} | non-updateable: ${isNonUpdateable() ?? "no"}`,
      `Supported browsers: ${[...SUPPORTED_BROWSERS].join(", ")}`,
      `Supported keyrings: ${SUPPORTED_KEYRINGS.join(", ")}`,
      `Update channels: ${Object.keys(UPDATE_SOURCES).join(", ")}`,
    ].join("\n");
  }
}

export class OptionParseError extends Error {}

export function parseOpts(
  overrideArguments?: readonly string[] | null,
  _ignoreConfigFiles: "if_override" | boolean = "if_override",
): [OptionParser, ParsedOptions, string[]] {
  const parser = new OptionParser();
  const args = [...(overrideArguments ?? Bun.argv.slice(2))];
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    strict: false,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
      output: { type: "string", short: "o" },
      format: { type: "string", short: "f" },
      quiet: { type: "boolean", short: "q" },
      verbose: { type: "boolean", short: "v" },
      simulate: { type: "boolean", short: "s" },
      "skip-download": { type: "boolean" },
      update: { type: "string", short: "U", default: undefined },
      "rm-cache-dir": { type: "boolean" },
      cookies: { type: "string" },
      "cookies-from-browser": { type: "string" },
      proxy: { type: "string" },
      "socket-timeout": { type: "string" },
      "no-check-certificates": { type: "boolean" },
      "add-header": { type: "string", multiple: true },
      "extractor-args": { type: "string", multiple: true },
      "remote-components": { type: "string" },
      "plugin-dirs": { type: "string" },
      "ignore-config": { type: "boolean" },
    },
  });

  const values = parsed.values;
  const updateValue = asString(values.update);
  const opts: ParsedOptions = {
    urls: parsed.positionals,
    verbose: Boolean(values.verbose),
    printHelp: Boolean(values.help),
    version: Boolean(values.version),
    output: asString(values.output),
    format: asString(values.format),
    quiet: Boolean(values.quiet),
    simulate: Boolean(values.simulate),
    skipDownload: Boolean(values["skip-download"]),
    updateSelf: updateValue === "" ? true : updateValue,
    rmCacheDir: Boolean(values["rm-cache-dir"]),
    cookiefile: asString(values.cookies),
    cookiesfrombrowser: asString(values["cookies-from-browser"])
      ? parseBrowserSpec(asString(values["cookies-from-browser"])!)
      : undefined,
    paths: {},
    headers: parseHeaders(asStringArray(values["add-header"])),
    proxy: asString(values.proxy),
    socketTimeout: asString(values["socket-timeout"])
      ? Number(asString(values["socket-timeout"]))
      : undefined,
    noCheckCertificate: Boolean(values["no-check-certificates"]),
    extractorArgs: parseExtractorArgs(asStringArray(values["extractor-args"])),
    remoteComponents: splitList(asString(values["remote-components"])),
    pluginDirs: splitList(asString(values["plugin-dirs"]), ["default"]),
    ignoreconfig: Boolean(values["ignore-config"]),
  };

  if (opts.version) {
    console.log(version);
  }
  if (opts.printHelp) {
    parser.printHelp();
  }
  return [parser, opts, parsed.positionals];
}

export const parse_options = parseOpts;

function asString(
  value: string | boolean | (string | boolean)[] | undefined,
): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  return undefined;
}

function asStringArray(
  value: string | boolean | (string | boolean)[] | undefined,
): string[] | undefined {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter(
      (item) => StringSchema.safeParse(item).success,
    ) as string[];
  }
  return undefined;
}

function parseBrowserSpec(
  spec: string,
): readonly [string, string?, string?, string?] {
  const parts = spec.split(":");
  return [parts[0] ?? "", parts[1], parts[2], parts[3]];
}

function parseHeaders(headers: string[] | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const header of headers ?? []) {
    const index = header.indexOf(":");
    if (index === -1) {
      continue;
    }
    out[header.slice(0, index).trim()] = header.slice(index + 1).trim();
  }
  return out;
}

function parseExtractorArgs(
  args: string[] | undefined,
): Record<string, readonly string[]> {
  const out: Record<string, readonly string[]> = {};
  for (const arg of args ?? []) {
    const [key, values = ""] = arg.split(":", 2);
    if (key) {
      out[key] = values.split(";").filter(Boolean);
    }
  }
  return out;
}

function splitList(
  value: string | undefined,
  defaultValue: string[] = [],
): string[] {
  return value
    ? value
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean)
    : defaultValue;
}
