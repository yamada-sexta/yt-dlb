// Source: yt_dlp/utils/traversal.py
// Port note: this implements the traversal forms used by migrated downloader/extractor code.

import { NO_DEFAULT, variadic } from "./utils.ts";
import { z } from "zod";

export type TraverseKey =
  | string
  | number
  | null
  | typeof Ellipsis
  | Set<((value: unknown) => unknown) | StringConstructor | NumberConstructor | BooleanConstructor | ObjectConstructor | ArrayConstructor>
  | readonly unknown[]
  | ((key: string | number, value: unknown) => boolean)
  | Record<string, unknown>;

export type TraversePath = TraverseKey | readonly unknown[];

export const Ellipsis = Symbol("Ellipsis");

const RecordSchema = z.record(z.string(), z.unknown());
const GroupsSchema = z.object({
  groups: z.record(z.string(), z.string().optional()),
}).passthrough();

export function traverseObj<T = unknown>(
  obj: unknown,
  ...pathsAndOptions: Array<TraversePath | {
    default?: T;
    expected_type?: (value: unknown) => value is T;
    get_all?: boolean;
  }>
): T | T[] | null {
  const maybeOptions = pathsAndOptions.at(-1);
  const hasOptions = isTraverseOptions(maybeOptions);
  const options = hasOptions ? pathsAndOptions.pop() as { default?: T; expected_type?: (value: unknown) => value is T; get_all?: boolean } : {};
  const paths = pathsAndOptions as TraversePath[];
  for (const path of paths) {
    const values = applyPath(obj, Array.isArray(path) ? path as readonly TraverseKey[] : [path as TraverseKey]);
    const filtered = options.expected_type ? values.filter(options.expected_type) : values as T[];
    if (filtered.length) {
      return options.get_all === false ? filtered[0]! : pathHasBranch(path) ? filtered : filtered.length === 1 ? filtered[0]! : filtered;
    }
  }
  return "default" in options ? options.default! : null;
}

export const traverse_obj = traverseObj;

export function dictGet<T>(record: Record<string, T> | null | undefined, keyOrKeys: string | readonly string[], defaultValue: T | null = null, skipFalseValues = true): T | null {
  if (!record) {
    return defaultValue;
  }
  for (const key of variadic(keyOrKeys)) {
    const value = record[key];
    if (value !== undefined && value !== null && (value || !skipFalseValues)) {
      return value;
    }
  }
  return defaultValue;
}

export const dict_get = dictGet;

function isTraverseOptions(value: unknown): value is { default?: unknown; expected_type?: (value: unknown) => boolean; get_all?: boolean } {
  if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof Set) {
    return false;
  }
  return "default" in value || "expected_type" in value || "get_all" in value;
}

function pathHasBranch(path: TraversePath): boolean {
  const keys = Array.isArray(path) ? path as readonly TraverseKey[] : [path as TraverseKey];
  return keys.some((key) => key === Ellipsis || typeof key === "function" || Array.isArray(key));
}

function applyPath(obj: unknown, path: readonly TraverseKey[]): unknown[] {
  let values = [obj];
  for (const key of path) {
    values = values.flatMap((value) => applyKey(value, key));
    values = values.filter((value) => value !== null && value !== undefined);
    if (!values.length) {
      break;
    }
  }
  return values;
}

function applyKey(value: unknown, key: TraverseKey): unknown[] {
  if (key === null) {
    return [value];
  }
  if (key === Ellipsis) {
    if (Array.isArray(value)) {
      return value;
    }
    if (isRecord(value)) {
      return Object.values(value);
    }
    return [];
  }
  if (Array.isArray(key)) {
    return key.flatMap((branch) => applyKey(value, branch));
  }
  if (key instanceof Set) {
    const item = [...key][0];
    if (!item) {
      return [];
    }
    if (item === String) {
      return typeof value === "string" ? [value] : [];
    }
    if (item === Number) {
      return typeof value === "number" ? [value] : [];
    }
    if (item === Boolean) {
      return typeof value === "boolean" ? [value] : [];
    }
    if (item === Object) {
      return isRecord(value) ? [value] : [];
    }
    if (item === Array) {
      return Array.isArray(value) ? [value] : [];
    }
    const transform = item as (input: unknown) => unknown;
    return [transform(value)].filter((result) => result !== null && result !== undefined);
  }
  if (typeof key === "function") {
    const entries = Array.isArray(value)
      ? value.map((item, index) => [index, item] as const)
      : isRecord(value) ? Object.entries(value) : [];
    return entries.filter(([entryKey, entryValue]) => key(entryKey, entryValue)).map(([, entryValue]) => entryValue);
  }
  if (isRecord(key)) {
    const out: Record<string, unknown> = {};
    for (const [outKey, outPath] of Object.entries(key)) {
      const result = applyPath(value, Array.isArray(outPath) ? outPath as readonly TraverseKey[] : [outPath as TraverseKey])[0];
      if (result !== undefined && result !== null) {
        out[outKey] = result;
      }
    }
    return Object.keys(out).length ? [out] : [];
  }
  if (typeof key === "number") {
    return Array.isArray(value) ? [value[key]] : [];
  }
  if (typeof key === "string") {
    if (isRecord(value)) {
      return [value[key]];
    }
    if (hasGroups(value)) {
      return [value.groups[key]];
    }
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return RecordSchema.safeParse(value).success;
}

function hasGroups(value: unknown): value is { groups: Record<string, string | undefined> } {
  return GroupsSchema.safeParse(value).success;
}
