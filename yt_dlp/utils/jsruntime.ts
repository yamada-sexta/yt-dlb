// Source: yt_dlp/utils/_jsruntime.py
// Port note: ytdlb targets Bun, but this keeps the runtime metadata shape for migrated providers.

export interface JsRuntimeInfo {
  name: string;
  path: string;
  version: string;
  versionTuple: readonly number[];
  supported: boolean;
}

export function versionTuple(version: string): readonly number[] {
  const match = version.match(/\d+(?:\.\d+)*/);
  return (match?.[0] ?? "0").split(".").map((part) => Number.parseInt(part, 10) || 0);
}

export function isVersionAtLeast(version: readonly number[], minimum: readonly number[]): boolean {
  const length = Math.max(version.length, minimum.length);
  for (let i = 0; i < length; i += 1) {
    const left = version[i] ?? 0;
    const right = minimum[i] ?? 0;
    if (left !== right) {
      return left > right;
    }
  }
  return true;
}

export class BunJsRuntime {
  static readonly MIN_SUPPORTED_VERSION = [1, 0, 31] as const;

  constructor(readonly path = Bun.argv[0] ?? "bun") {}

  get info(): JsRuntimeInfo {
    const version = Bun.version;
    const parsed = versionTuple(version);
    return {
      name: "bun",
      path: this.path,
      version,
      versionTuple: parsed,
      supported: isVersionAtLeast(parsed, BunJsRuntime.MIN_SUPPORTED_VERSION),
    };
  }
}
