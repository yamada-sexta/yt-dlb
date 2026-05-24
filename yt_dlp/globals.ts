// Source: yt_dlp/globals.py

export class Indirect<T> {
  constructor(public value: T) {}

  toString(): string {
    return `${this.constructor.name}(${JSON.stringify(this.value)})`;
  }
}

export const postprocessors = new Indirect<Record<string, unknown>>({});
export const extractors = new Indirect<Record<string, unknown>>({});

export const allPluginsLoaded = new Indirect(false);
export const pluginSpecs = new Indirect<Record<string, unknown>>({});
export const pluginDirs = new Indirect(["default"]);

export const pluginIes = new Indirect<Record<string, unknown>>({});
export const pluginPps = new Indirect<Record<string, unknown>>({});
export const pluginIesOverrides = new Indirect(new Map<string, unknown[]>());

export const IN_CLI = new Indirect(false);
export const LAZY_EXTRACTORS = new Indirect<boolean | null>(null);
export const WINDOWS_VT_MODE = new Indirect<boolean | null>(process.platform === "win32" ? false : null);

export const supportedJsRuntimes = new Indirect<Record<string, unknown>>({});
export const supportedRemoteComponents = new Indirect<string[]>([]);
