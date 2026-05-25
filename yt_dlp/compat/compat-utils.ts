// Source: yt_dlp/compat/compat_utils.py
// Port note: Python module passthrough behavior is replaced by explicit object helpers for TypeScript modules.

export interface PackageInfo {
  name: string;
  version: string | null;
}

export function getPackageInfo(
  module: Record<string, unknown> & { __name__?: string },
): PackageInfo {
  const version =
    module._yt_dlp__version ??
    module.__version__ ??
    module.version_string ??
    module.version ??
    null;
  const name = module._yt_dlp__identifier ?? module.__name__ ?? "unknown";
  return {
    name: String(name),
    version: version == null ? null : String(version),
  };
}

export function passthroughModule<T extends object>(
  parent: T,
  child: object,
  allowedAttributes: readonly string[] | null = null,
): T {
  return new Proxy(parent, {
    get(target, property, receiver) {
      if (typeof property !== "string") {
        return Reflect.get(target, property, receiver) as unknown;
      }
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver) as unknown;
      }
      if (allowedAttributes && !allowedAttributes.includes(property)) {
        return undefined;
      }
      return Reflect.get(child, property) as unknown;
    },
  });
}

export const get_package_info = getPackageInfo;
export const passthrough_module = passthroughModule;
