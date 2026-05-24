// Source: yt_dlp/update.py
// Port note: Python bundle variants are replaced with source/bun executable detection for ytdlb.

import { createHash } from "node:crypto";
import { access, chmod, realpath, rename, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname } from "node:path";
import { spawn } from "node:child_process";

import {
  CHANNEL,
  ORIGIN,
  RELEASE_GIT_HEAD,
  UPDATE_HINT,
  VARIANT,
  version,
} from "./version.ts";

export const UPDATE_SOURCES = {
  stable: "yt-dlp/yt-dlp",
  nightly: "yt-dlp/yt-dlp-nightly-builds",
  master: "yt-dlp/yt-dlp-master-builds",
} satisfies Record<string, string>;

export const REPOSITORY = UPDATE_SOURCES.stable;
export const API_BASE_URL = "https://api.github.com/repos";
export const API_URL = `${API_BASE_URL}/${REPOSITORY}/releases`;

const INVERSE_UPDATE_SOURCES = new Map(Object.entries(UPDATE_SOURCES).map(([key, value]) => [value, key]));
const VERSION_RE = /^(\d+\.)*\d+$/;
const VERSION_SEARCH_RE = /\s+(?<version>(?:\d+\.)*\d+)$/;
const HASH_RE = /^[\da-f]{40}$/;
const COMMIT_RE = /Generated from: https:\/\/(?:[^/?#]+\/){3}commit\/(?<hash>[\da-f]{40})/;

const FILE_SUFFIXES: Record<string, string> = {
  zip: "",
  win_exe: ".exe",
  win_x86_exe: "_x86.exe",
  win_arm64_exe: "_arm64.exe",
  darwin_exe: "_macos",
  linux_exe: "_linux",
  linux_aarch64_exe: "_linux_aarch64",
  musllinux_exe: "_musllinux",
  musllinux_aarch64_exe: "_musllinux_aarch64",
};

const NON_UPDATEABLE_REASONS = new Map<string, string | undefined>([
  ...Object.keys(FILE_SUFFIXES).map((key) => [key, undefined] as const),
  ["source", "You cannot update when running from source code; Use git to pull the latest changes"],
  ["bun", "Auto-update is not supported for the Bun TypeScript runtime; Use bun install or git to update"],
  ["unknown", "You installed yt-dlp from a manual build or with a package manager; Use that to update"],
  ["other", "You are using an unofficial build of yt-dlp; Build the executable again"],
]);

export interface UpdateInfoInit {
  tag: string;
  version?: string | null;
  requestedVersion?: string | null;
  commit?: string | null;
  binaryName?: string | null;
  checksum?: string | null;
}

export class UpdateInfo {
  readonly tag: string;
  readonly version: string | null;
  readonly requestedVersion: string | null;
  readonly commit: string | null;
  readonly binaryName: string | null;
  readonly checksum: string | null;

  constructor(init: UpdateInfoInit) {
    this.tag = init.tag;
    this.version = init.version ?? null;
    this.requestedVersion = init.requestedVersion ?? null;
    this.commit = init.commit ?? null;
    this.binaryName = init.binaryName ?? getBinaryName();
    this.checksum = init.checksum ?? null;
  }
}

export interface UpdateHost {
  toScreen(message: string): void;
  writeDebug(message: string): void;
  reportWarning(message: string): void;
  reportError(message: string): void;
  downloadRetcode?: number;
  formatError?(text: string, style: string): string;
}

interface GitHubReleaseInfo {
  tag_name?: string;
  name?: string;
  target_commitish?: string;
  body?: string;
}

export function detectVariant(): string {
  if (VARIANT) {
    return VARIANT;
  }
  if (Bun.argv[0]?.includes("bun")) {
    return "bun";
  }
  return "source";
}

export async function currentGitHead(): Promise<string | undefined> {
  if (detectVariant() !== "source") {
    return undefined;
  }
  try {
    const proc = spawn("git", ["rev-parse", "--short", "HEAD"], {
      cwd: dirname(new URL(import.meta.url).pathname),
      stdio: ["ignore", "pipe", "ignore"],
    });
    const stdout = await new Response(proc.stdout as unknown as ReadableStream).text();
    const code = await new Promise<number | null>((resolve) => proc.once("close", resolve));
    const hash = stdout.trim();
    return code === 0 && /^[0-9a-f]+$/.test(hash) ? hash : undefined;
  } catch {
    return undefined;
  }
}

export function isNonUpdateable(): string | undefined {
  if (UPDATE_HINT) {
    return UPDATE_HINT;
  }
  return NON_UPDATEABLE_REASONS.get(detectVariant()) ?? NON_UPDATEABLE_REASONS.get(VARIANT ? "other" : "unknown");
}

export async function sha256File(path: string): Promise<string> {
  const file = Bun.file(await realpath(path));
  const hash = createHash("sha256");
  hash.update(Buffer.from(await file.arrayBuffer()));
  return hash.digest("hex");
}

export function makeLabel(origin: string, tag: string, buildVersion?: string | null): string {
  if (tag !== buildVersion) {
    return buildVersion ? `${origin}@${tag} build ${buildVersion}` : `${origin}@${tag}`;
  }
  const channel = INVERSE_UPDATE_SOURCES.get(origin);
  return channel ? `${channel}@${tag} from ${origin}` : `${origin}@${tag}`;
}

export class Updater {
  readonly requestedChannel: string;
  readonly requestedTag: string;
  readonly requestedRepo: string | undefined;

  readonly #exact: boolean;
  readonly #identifier: string;
  readonly #origin = ORIGIN;
  readonly #channel = CHANNEL;

  constructor(readonly ydl: UpdateHost, target?: string | null) {
    const requested = target ?? this.#channel;
    const at = requested.lastIndexOf("@");
    let requestedChannel = at === -1 ? "" : requested.slice(0, at);
    let requestedTag = at === -1 ? requested : requested.slice(at + 1);

    if (!requestedChannel && (requestedTag.includes("/") || requestedTag in UPDATE_SOURCES)) {
      requestedChannel = requestedTag;
      requestedTag = "";
    } else if (!requestedChannel) {
      requestedChannel = this.#channel.split("@", 1)[0] ?? "stable";
    }

    this.#exact = Boolean(target) && target !== this.#channel && Boolean(requestedTag);
    if (!requestedTag) {
      requestedTag = "latest";
    }

    this.requestedChannel = requestedChannel;
    this.requestedTag = requestedTag;
    this.requestedRepo = requestedChannel.includes("/")
      ? requestedChannel
      : UPDATE_SOURCES[requestedChannel as keyof typeof UPDATE_SOURCES];

    if (!this.requestedRepo) {
      this.reportError(`Invalid update channel ${JSON.stringify(requestedChannel)} requested. Valid channels are ${Object.keys(UPDATE_SOURCES).join(", ")}`, true);
    }
    if (this.requestedRepo && !this.requestedRepo.startsWith("yt-dlp/") && this.requestedRepo !== this.#origin) {
      this.ydl.reportWarning(`You are switching to an unofficial executable from ${this.requestedRepo}. Run at your own risk`);
    }

    this.#identifier = `${detectVariant()} ${process.platform}_${process.arch}`;
  }

  get currentVersion(): string {
    return version;
  }

  get currentCommit(): string {
    return RELEASE_GIT_HEAD;
  }

  async queryUpdate(output = false): Promise<UpdateInfo | null> {
    if (!this.requestedRepo) {
      this.reportError("No target repository could be determined from input");
      return null;
    }

    let requestedVersion: string | null;
    let targetCommitish: string | null;
    try {
      [requestedVersion, targetCommitish] = await this.getVersionInfo(this.requestedTag);
    } catch (error) {
      this.reportNetworkError(`obtain version info (${error})`, "; Please try again later or");
      return null;
    }

    const hasUpdate = this.hasUpdate(requestedVersion, targetCommitish);
    const resolvedTag = this.requestedTag === "latest" ? requestedVersion ?? this.requestedTag : this.requestedTag;
    const currentLabel = makeLabel(this.#origin, this.#channel.split("@")[1] ?? this.currentVersion, this.currentVersion);
    const requestedLabel = makeLabel(this.requestedRepo, resolvedTag, requestedVersion);
    const latestOrRequested = `${this.requestedTag === "latest" ? "Latest" : "Requested"} version: ${requestedLabel}`;

    if (!hasUpdate) {
      if (output) {
        this.ydl.toScreen(`${latestOrRequested}\nyt-dlp is up to date (${currentLabel})`);
      }
      return null;
    }

    const updateSpec = await this.downloadUpdateSpec(requestedVersion ? ["latest", ""] : [""]);
    if (!updateSpec) {
      return null;
    }
    const resultTag = this.processUpdateSpec(updateSpec, resolvedTag);
    if (!resultTag || resultTag === this.currentVersion) {
      return null;
    }
    const resultVersion = resultTag === resolvedTag ? requestedVersion : VERSION_RE.test(resultTag) ? resultTag : null;

    const checksum = isNonUpdateable() ? null : await this.fetchChecksum(resultTag);

    if (output) {
      const updateLabel = makeLabel(this.requestedRepo, resultTag, resultVersion);
      this.ydl.toScreen(`Current version: ${currentLabel}\n${latestOrRequested}${updateLabel !== requestedLabel ? `\nUpgradable to: ${updateLabel}` : ""}`);
    }

    return new UpdateInfo({
      tag: resultTag,
      version: resultVersion,
      requestedVersion,
      commit: resultTag === resolvedTag ? targetCommitish : null,
      checksum,
    });
  }

  async update(updateInfo?: UpdateInfo | null): Promise<boolean> {
    const info = updateInfo === undefined ? await this.queryUpdate(true) : updateInfo;
    if (!info) {
      return false;
    }
    const nonUpdateable = isNonUpdateable();
    if (nonUpdateable) {
      this.reportError(nonUpdateable, true);
      return false;
    }
    if (!info.binaryName) {
      this.reportError("Unable to determine binary name", true);
      return false;
    }

    const filename = await this.filename();
    this.ydl.toScreen(`Current Build Hash: ${await sha256File(filename)}`);
    const updateLabel = makeLabel(this.requestedRepo ?? REPOSITORY, info.tag, info.version);
    this.ydl.toScreen(`Updating to ${updateLabel} ...`);

    const directory = dirname(filename);
    if (!(await canWrite(filename))) {
      this.reportPermissionError(filename);
      return false;
    }
    if (!(await canWrite(directory))) {
      this.reportPermissionError(directory);
      return false;
    }

    const newContent = await this.downloadAsset(info.binaryName, info.tag);
    if (info.checksum && createHash("sha256").update(newContent).digest("hex") !== info.checksum) {
      this.reportNetworkError("verify the new executable", ";", info.tag);
      return false;
    }
    if (!info.checksum) {
      this.ydl.reportWarning("No checksum was available for the update; writing unverified builds is disabled");
      return false;
    }

    const newFilename = `${filename}.new`;
    const oldFilename = `${filename}.old`;
    await rm(oldFilename, { force: true });
    await Bun.write(newFilename, newContent);
    await rename(filename, oldFilename);
    await rename(newFilename, filename);
    await chmod(filename, 0o755);
    await rm(oldFilename, { force: true });
    this.ydl.toScreen(`Updated yt-dlp to ${updateLabel}`);
    return true;
  }

  async restart(): Promise<number | null> {
    const cmd = Bun.argv;
    this.ydl.writeDebug(`Restarting: ${cmd.join(" ")}`);
    const proc = spawn(cmd[0] ?? "bun", cmd.slice(1), { stdio: "inherit" });
    return await new Promise<number | null>((resolve) => proc.once("close", resolve));
  }

  async filename(): Promise<string> {
    return await realpath(Bun.argv[1] ?? Bun.argv[0] ?? process.cwd());
  }

  private async downloadAsset(name: string, tag = this.requestedTag): Promise<Buffer> {
    const path = tag === "latest" ? "latest/download" : `download/${tag}`;
    const url = `https://github.com/${this.requestedRepo}/releases/${path}/${name}`;
    this.ydl.writeDebug(`Downloading ${name} from ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new HTTPError(response.status, response.statusText);
    }
    return Buffer.from(await response.arrayBuffer());
  }

  private async callApi(tag: string): Promise<GitHubReleaseInfo> {
    const apiTag = tag === "latest" ? tag : `tags/${tag}`;
    const url = `${API_BASE_URL}/${this.requestedRepo}/releases/${apiTag}`;
    this.ydl.writeDebug(`Fetching release info: ${url}`);
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "yt-dlp",
        "X-GitHub-Api-Version": "2026-03-10",
      },
    });
    if (!response.ok) {
      throw new HTTPError(response.status, response.statusText);
    }
    return await response.json() as GitHubReleaseInfo;
  }

  private async getVersionInfo(tag: string): Promise<[string | null, string | null]> {
    if (VERSION_RE.test(tag)) {
      return [tag, null];
    }

    const apiInfo = await this.callApi(tag);
    const requestedVersion = tag === "latest"
      ? apiInfo.tag_name ?? null
      : apiInfo.name?.match(VERSION_SEARCH_RE)?.groups?.version ?? null;
    const targetCommitish = apiInfo.target_commitish && HASH_RE.test(apiInfo.target_commitish)
      ? apiInfo.target_commitish
      : apiInfo.body?.match(COMMIT_RE)?.groups?.hash ?? null;

    if (!requestedVersion && !targetCommitish) {
      this.reportError("One of either version or commit hash must be available on the release", true);
    }
    return [requestedVersion, targetCommitish];
  }

  private async downloadUpdateSpec(sourceTags: readonly string[]): Promise<string | null> {
    for (const tag of sourceTags) {
      try {
        return (await this.downloadAsset("_update_spec", tag || undefined)).toString();
      } catch (error) {
        if (error instanceof HTTPError && error.status === 404) {
          continue;
        }
        this.reportNetworkError(`fetch update spec: ${error}`);
        return null;
      }
    }
    this.reportError(`The requested tag ${this.requestedTag} does not exist for ${this.requestedRepo}`, true);
    return null;
  }

  private processUpdateSpec(lockfile: string, resolvedTag: string): string | null {
    const lines = lockfile.split(/\r?\n/);
    const isVersion2 = lines.some((line) => line.startsWith("lockV2 "));
    for (const line of lines) {
      let tag: string;
      let pattern: string;
      if (isVersion2) {
        if (!line.startsWith(`lockV2 ${this.requestedRepo} `)) {
          continue;
        }
        [, , tag, pattern] = line.split(" ", 4) as [string, string, string, string];
      } else {
        if (!line.startsWith("lock ")) {
          continue;
        }
        [, tag, pattern] = line.split(" ", 3) as [string, string, string];
      }
      if (new RegExp(pattern).test(this.#identifier)) {
        if (VERSION_RE.test(tag)) {
          return !this.#exact ? tag : this.versionCompare(tag, resolvedTag) ? resolvedTag : null;
        }
        if (tag === resolvedTag) {
          this.reportError(`yt-dlp cannot be updated to ${resolvedTag} since your operating system is not compatible with the requested build`, true);
          return null;
        }
      }
    }
    return resolvedTag;
  }

  private versionCompare(a: string, b: string): boolean {
    if (VERSION_RE.test(`${a}.${b}`)) {
      return compareVersionTuple(a, b) >= 0;
    }
    return a === b;
  }

  private hasUpdate(requestedVersion: string | null, targetCommitish: string | null): boolean {
    if (this.#exact && this.#origin !== this.requestedRepo) {
      return true;
    }
    if (requestedVersion) {
      return this.#exact ? this.currentVersion !== requestedVersion : !this.versionCompare(this.currentVersion, requestedVersion);
    }
    return targetCommitish ? targetCommitish !== this.currentCommit : false;
  }

  private async fetchChecksum(resultTag: string): Promise<string | null> {
    try {
      const hashes = (await this.downloadAsset("SHA2-256SUMS", resultTag)).toString();
      const binaryName = getBinaryName();
      const line = hashes.split(/\r?\n/).find((candidate) => binaryName && candidate.endsWith(binaryName));
      if (!line) {
        this.ydl.reportWarning("The hash could not be found in the checksum file, skipping verification");
        return null;
      }
      return line.split(/\s+/)[0] ?? null;
    } catch (error) {
      if (!(error instanceof HTTPError) || error.status !== 404) {
        this.reportNetworkError(`fetch checksums: ${error}`);
        return null;
      }
      this.ydl.reportWarning("No hash information found for the release, skipping verification");
      return null;
    }
  }

  private reportError(message: string, _expected = false): void {
    this.ydl.reportError(message);
    this.ydl.downloadRetcode = 100;
  }

  private reportPermissionError(file: string): void {
    this.reportError(`Unable to write to ${file}; try running as administrator`, true);
  }

  private reportNetworkError(action: string, delim = ";", tag = this.requestedTag): void {
    const path = tag === "latest" ? tag : `tag/${tag}`;
    this.reportError(`Unable to ${action}${delim} visit https://github.com/${this.requestedRepo}/releases/${path}`, true);
  }
}

export async function runUpdate(ydl: UpdateHost): Promise<boolean> {
  ydl.reportWarning('"yt_dlp.update.run_update(ydl)" is deprecated and may be removed in a future version. Use "yt_dlp.update.Updater(ydl).update()" instead');
  return await new Updater(ydl).update();
}

export class HTTPError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function getBinaryName(): string | null {
  const suffix = FILE_SUFFIXES[detectVariant()];
  return suffix === undefined ? null : `yt-dlp${suffix}`;
}

async function canWrite(path: string): Promise<boolean> {
  try {
    await access(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

function compareVersionTuple(a: string, b: string): number {
  const left = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff) {
      return diff;
    }
  }
  return 0;
}
