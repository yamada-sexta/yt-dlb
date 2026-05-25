// Source: yt_dlp/utils/traversal.py
// Port note: this implements the traversal forms used by migrated downloader/extractor code.

import {
  ExtractorError,
  getElementByAttribute,
  getElementByClass,
  getElementById,
  getElementHtmlByAttribute,
  getElementHtmlByClass,
  getElementHtmlById,
  getElementsByAttribute,
  getElementsByClass,
  getElementsHtmlByAttribute,
  getElementsHtmlByClass,
  getElementTextAndHtmlByTag,
  urlOrNone,
  variadic,
} from "./utils.ts";
import { z } from "zod";

export type TraverseKey =
  | string
  | number
  | null
  | typeof Ellipsis
  | Set<
      | ((value: unknown) => unknown)
      | StringConstructor
      | NumberConstructor
      | BooleanConstructor
      | ObjectConstructor
      | ArrayConstructor
    >
  | readonly unknown[]
  | ((key: string | number, value: unknown) => boolean)
  | Record<string, unknown>;

export type TraversePath = TraverseKey | readonly unknown[];

export const Ellipsis = Symbol("Ellipsis");
export const ANY = Symbol("any");
export const ALL = Symbol("all");
export const FILTER = Symbol("filter");

const RecordSchema = z.record(z.string(), z.unknown());
const GroupsSchema = z
  .object({
    groups: z.record(z.string(), z.string().optional()),
  })
  .passthrough();

export function traverseObj<T = unknown>(
  obj: unknown,
  ...pathsAndOptions: Array<
    | TraversePath
    | {
        default?: T;
        expected_type?: (value: unknown) => value is T;
        get_all?: boolean;
      }
  >
): T | T[] | null {
  const maybeOptions = pathsAndOptions.at(-1);
  const hasOptions = isTraverseOptions(maybeOptions);
  const options = hasOptions
    ? (pathsAndOptions.pop() as {
        default?: T;
        expected_type?: (value: unknown) => value is T;
        get_all?: boolean;
      })
    : {};
  const paths = pathsAndOptions as TraversePath[];
  for (const path of paths) {
    const values = applyPath(
      obj,
      Array.isArray(path)
        ? (path as readonly TraverseKey[])
        : [path as TraverseKey],
    );
    const filtered = options.expected_type
      ? values.filter(options.expected_type)
      : (values as T[]);
    if (filtered.length) {
      const first = filtered[0];
      if (first === undefined) {
        continue;
      }
      return options.get_all === false
        ? first
        : pathHasBranch(path)
          ? filtered
          : filtered.length === 1
            ? first
            : filtered;
    }
  }
  return "default" in options ? (options.default as T) : null;
}

export const traverse_obj = traverseObj;

export function dictGet<T>(
  record: Record<string, T> | null | undefined,
  keyOrKeys: string | readonly string[],
  defaultValue: T | null = null,
  skipFalseValues = true,
): T | null {
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

function isTraverseOptions(value: unknown): value is {
  default?: unknown;
  expected_type?: (value: unknown) => boolean;
  get_all?: boolean;
} {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value instanceof Set
  ) {
    return false;
  }
  return "default" in value || "expected_type" in value || "get_all" in value;
}

function pathHasBranch(path: TraversePath): boolean {
  const keys = Array.isArray(path)
    ? (path as readonly TraverseKey[])
    : [path as TraverseKey];
  return keys.some(
    (key) =>
      key === Ellipsis || typeof key === "function" || Array.isArray(key),
  );
}

function applyPath(obj: unknown, path: readonly TraverseKey[]): unknown[] {
  let values = [obj];
  for (const [index, key] of path.entries()) {
    values = values.flatMap((value) => applyKey(value, key));
    if (!(path[index + 1] instanceof Set)) {
      values = values.filter((value) => value !== null && value !== undefined);
    }
    if (!values.length) {
      break;
    }
  }
  return values;
}

export function value<T>(constant: T): () => T {
  return () => constant;
}

class RequiredError extends ExtractorError {}

export function require(name: string, options: { expected?: boolean } = {}): (value: unknown) => unknown {
  return (input) => {
    if (input === null || input === undefined) {
      throw new RequiredError(`Unable to extract ${name}`, { expected: options.expected });
    }
    return input;
  };
}

export function subsListToDict(
  subs?: Array<Record<string, unknown>> | null,
  options: { lang?: string | null; ext?: string | null } = {},
): Record<string, Array<Record<string, unknown>>> | ((input: Array<Record<string, unknown>> | null) => Record<string, Array<Record<string, unknown>>>) {
  const lang = options.lang === undefined ? "und" : options.lang;
  const ext = options.ext ?? null;
  if (subs === undefined) {
    return (input) => subsListToDict(input, { lang, ext }) as Record<string, Array<Record<string, unknown>>>;
  }
  const out: Record<string, Array<Record<string, unknown>>> = {};
  for (const original of subs ?? []) {
    const sub = { ...original };
    if (!urlOrNone(sub.url) && !sub.data) {
      continue;
    }
    let subId: string | null = typeof sub.id === "string" ? sub.id : null;
    delete sub.id;
    if (subId === null) {
      if (!lang) {
        continue;
      }
      subId = lang;
    }
    if (typeof sub.ext !== "string") {
      if (ext) {
        sub.ext = ext;
      } else {
        delete sub.ext;
      }
    }
    for (const [key, value] of Object.entries(sub)) {
      if (value === undefined || value === null) {
        delete sub[key];
      }
    }
    const list = out[subId] ?? [];
    list.push(sub);
    out[subId] = list;
  }
  for (const list of Object.values(out)) {
    list.sort((left, right) => Number(left.quality ?? 0) - Number(right.quality ?? 0));
    for (const item of list) {
      delete item.quality;
    }
  }
  return out;
}

export const subs_list_to_dict = subsListToDict;

export function trimStr(options: { start?: string | null; end?: string | null } = {}): (value: string | null | undefined) => string | null | undefined {
  return (input) => {
    if (input === null || input === undefined) {
      return input;
    }
    let startIndex = 0;
    if (options.start && input.startsWith(options.start)) {
      startIndex = options.start.length;
    }
    if (options.end && input.endsWith(options.end)) {
      return input.slice(startIndex, -options.end.length);
    }
    return input.slice(startIndex);
  };
}

export const trim_str = trimStr;

export function unpack<T extends readonly unknown[], R>(func: (...args: T) => R, kwargs?: Record<string, unknown>): (items: T) => R {
  if (typeof func !== "function") {
    throw new TypeError("unpack requires a function");
  }
  if (kwargs && Object.keys(kwargs).length) {
    throw new TypeError("keyword argument unpacking is not representable in JavaScript callbacks");
  }
  return (items) => func(...items);
}

export function traversalGetFirst<T = unknown>(obj: unknown, ...pathsAndOptions: Array<TraversePath | { default?: T; expected_type?: (value: unknown) => value is T }>): T | null {
  const maybeOptions = pathsAndOptions.at(-1);
  const options = isTraverseOptions(maybeOptions) ? pathsAndOptions.pop() as { default?: T; expected_type?: (value: unknown) => value is T } : {};
  for (const keys of pathsAndOptions as TraversePath[]) {
    const path = [Ellipsis, ...variadic(keys as TraverseKey | readonly TraverseKey[])];
    const result = traverseObj<T>(obj, path, { ...options, get_all: false });
    if (result !== null) {
      return result as T;
    }
  }
  return "default" in options ? options.default as T : null;
}

export const traversal_get_first = traversalGetFirst;

export function findElement(options: {
  tag?: string;
  id?: string;
  cls?: string;
  attr?: string;
  value?: string;
  html?: boolean;
  regex?: boolean;
}): (html: string) => string | null {
  const { tag, id, cls, attr, value: attrValue, html = false, regex = false } = options;
  if (!(tag || id || cls || (attr && attrValue))) {
    throw new Error("One of tag, id, cls or (attr AND value) is required");
  }
  if (attr && attrValue) {
    if (cls) throw new Error("Cannot match both attr and cls");
    if (id) throw new Error("Cannot match both attr and id");
    return (input) => html
      ? getElementHtmlByAttribute(attr, attrValue, input, { tag, escape_value: !regex })
      : getElementByAttribute(attr, attrValue, input, { tag, escape_value: !regex });
  }
  if (cls) {
    if (id) throw new Error("Cannot match both cls and id");
    if (tag) throw new Error("Cannot match both cls and tag");
    if (regex) throw new Error("Cannot use regex with cls");
    return (input) => html ? getElementHtmlByClass(cls, input) : getElementByClass(cls, input);
  }
  if (id) {
    return (input) => html
      ? getElementHtmlById(id, input, { tag, escape_value: !regex })
      : regex ? getElementByAttribute("id", id, input, { tag, escape_value: false }) : getElementById(id, input);
  }
  return (input) => getElementTextAndHtmlByTag(tag ?? String.raw`[\w:.-]+`, input)[html ? 1 : 0];
}

export const find_element = findElement;

export function findElements(options: {
  tag?: string;
  cls?: string;
  attr?: string;
  value?: string;
  html?: boolean;
  regex?: boolean;
}): (html: string) => string[] {
  const { tag, cls, attr, value: attrValue, html = false, regex = false } = options;
  if (!(cls || (attr && attrValue))) {
    throw new Error("One of cls or (attr AND value) is required");
  }
  if (attr && attrValue) {
    if (cls) throw new Error("Cannot match both attr and cls");
    return (input) => html
      ? getElementsHtmlByAttribute(attr, attrValue, input, { tag, escape_value: !regex })
      : getElementsByAttribute(attr, attrValue, input, { tag, escape_value: !regex });
  }
  if (tag) throw new Error("Cannot match both cls and tag");
  if (regex) throw new Error("Cannot use regex with cls");
  const className = cls ?? "";
  return (input) => html ? getElementsHtmlByClass(className, input) : getElementsByClass(className, input);
}

export const find_elements = findElements;

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
    return [transform(value)].filter(
      (result) => result !== null && result !== undefined,
    );
  }
  if (typeof key === "function") {
    const entries = Array.isArray(value)
      ? value.map((item, index) => [index, item] as const)
      : isRecord(value)
        ? Object.entries(value)
        : [];
    return entries
      .filter(([entryKey, entryValue]) => key(entryKey, entryValue))
      .map(([, entryValue]) => entryValue);
  }
  if (isRecord(key)) {
    const out: Record<string, unknown> = {};
    for (const [outKey, outPath] of Object.entries(key)) {
      const result = applyPath(
        value,
        Array.isArray(outPath)
          ? (outPath as readonly TraverseKey[])
          : [outPath as TraverseKey],
      )[0];
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

function hasGroups(
  value: unknown,
): value is { groups: Record<string, string | undefined> } {
  return GroupsSchema.safeParse(value).success;
}
