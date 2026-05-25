// Source: yt_dlp/plugins.py
// Port note: Python importlib namespace packages are replaced with Bun Glob discovery and ESM dynamic import.

import { Glob } from "bun";
import { readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  type Indirect,
  allPluginsLoaded,
  pluginDirs,
  pluginSpecs,
} from "./globals.ts";

export const PACKAGE_NAME = "yt_dlp_plugins";
export const COMPAT_PACKAGE_NAME = "ytdlp_plugins";

export interface PluginSpec {
  moduleName: string;
  suffix: string;
  destination: Indirect<Record<string, unknown>>;
  pluginDestination: Indirect<Record<string, unknown>>;
}

type PluginModule = Record<string, unknown> & {
  default?: unknown;
  __all__?: readonly string[];
};

export async function directories(): Promise<string[]> {
  const dirs: string[] = [];
  for await (const base of defaultPluginPaths()) {
    const candidate = join(base, PACKAGE_NAME);
    if (await isDirectory(candidate)) {
      dirs.push(candidate);
    }
  }
  return dirs;
}

export async function loadAllPlugins(): Promise<void> {
  for (const pluginSpec of Object.values(pluginSpecs.value) as PluginSpec[]) {
    await loadPlugins(pluginSpec);
  }
  allPluginsLoaded.value = true;
}

export async function loadPlugins(pluginSpec: PluginSpec): Promise<Record<string, unknown>> {
  const regularClasses: Record<string, unknown> = {};
  if (process.env.YTDLP_NO_PLUGINS || !pluginDirs.value.length) {
    return regularClasses;
  }

  for await (const moduleFile of iterModules(pluginSpec.moduleName)) {
    const moduleName = moduleFileToName(moduleFile);
    if (moduleName.split(".").some((part) => part.startsWith("_"))) {
      continue;
    }
    try {
      const module = await import(pathToFileURL(moduleFile).href) as PluginModule;
      Object.assign(regularClasses, getRegularClasses(module, moduleName, pluginSpec.suffix));
    } catch (error) {
      process.stderr.write(`Error while importing module ${JSON.stringify(moduleName)}\n${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    }
  }

  pluginSpec.pluginDestination.value = regularClasses;
  pluginSpec.destination.value = { ...regularClasses, ...pluginSpec.destination.value };
  return regularClasses;
}

export function registerPluginSpec(pluginSpec: PluginSpec): void {
  if (!(pluginSpec.moduleName in pluginSpecs.value)) {
    pluginSpecs.value[pluginSpec.moduleName] = pluginSpec;
  }
}

export async function* defaultPluginPaths(): AsyncGenerator<string> {
  const home = process.env.HOME;
  const xdgConfigHome = process.env.XDG_CONFIG_HOME ?? (home ? join(home, ".config") : undefined);

  if (xdgConfigHome) {
    yield join(xdgConfigHome, "yt-dlp", "plugins");
    yield join(xdgConfigHome, "yt-dlp-plugins");
  }
  if (home) {
    yield join(home, ".yt-dlp", "plugins");
  }
  yield process.cwd();
}

export async function* candidatePluginPaths(candidate: string): AsyncGenerator<string> {
  if (!(await isDirectory(candidate))) {
    throw new Error(`Invalid plugin directory: ${candidate}`);
  }
  for (const entry of await readdir(candidate)) {
    yield join(candidate, entry);
  }
}

export async function* iterModules(subpackage: string): AsyncGenerator<string> {
  const seen = new Set<string>();
  for await (const root of configuredPluginRoots()) {
    const packageDir = join(root, PACKAGE_NAME, subpackage);
    if (!(await isDirectory(packageDir))) {
      continue;
    }
    for await (const moduleFile of globModuleFiles(packageDir)) {
      const resolved = resolve(moduleFile);
      if (seen.has(resolved)) {
        continue;
      }
      seen.add(resolved);
      yield resolved;
    }
  }
}

export function getRegularClasses(module: PluginModule, moduleName: string, suffix: string): Record<string, unknown> {
  const allowed = module.__all__;
  const regularClasses: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(module)) {
    if (name === "default" || name === "__all__") {
      continue;
    }
    if (!name.endsWith(suffix) || name.startsWith("_")) {
      continue;
    }
    if (allowed && !allowed.includes(name)) {
      continue;
    }
    if (!isClassLike(value)) {
      continue;
    }
    const ctor = value as { PLUGIN_NAME?: string };
    if (ctor.PLUGIN_NAME != null) {
      continue;
    }
    regularClasses[name] = value;
  }

  // Logic change: ESM does not expose Python's obj.__module__; moduleName is retained for diagnostics,
  // but class origin filtering is handled by loading only files from the requested plugin package.
  void moduleName;
  return regularClasses;
}

async function* configuredPluginRoots(): AsyncGenerator<string> {
  for (const candidate of pluginDirs.value) {
    if (candidate === "default") {
      for await (const path of defaultPluginPaths()) {
        yield path;
      }
    } else {
      for await (const path of candidatePluginPaths(candidate)) {
        yield path;
      }
    }
  }
}

async function* globModuleFiles(dir: string): AsyncGenerator<string> {
  const glob = new Glob("**/*.{mjs,js,ts}");
  for await (const file of glob.scan({ cwd: dir, absolute: true, onlyFiles: true })) {
    const relativeParts = file.slice(dir.length + 1).split(/[\\/]/);
    if (relativeParts.some((part) => part.startsWith("_"))) {
      continue;
    }
    yield file;
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function moduleFileToName(file: string): string {
  const normalized = file.split(/[\\/]/);
  const packageIndex = normalized.lastIndexOf(PACKAGE_NAME);
  const parts = packageIndex === -1 ? [file] : normalized.slice(packageIndex);
  const last = parts.at(-1);
  if (last) {
    parts[parts.length - 1] = last.replace(/\.(?:mjs|js|ts)$/, "");
  }
  return parts.join(".");
}

function isClassLike(value: unknown): boolean {
  if (typeof value !== "function") {
    return false;
  }
  const source = Function.prototype.toString.call(value);
  return source.startsWith("class ");
}
