// Source: yt_dlp/utils/traversal.py
// Port note: this implements the traversal forms used by migrated downloader/extractor code.

import type { XmlElement } from "../compat/index.ts";
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
  | typeof ANY
  | typeof ALL
  | typeof FILTER
  | Slice
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
type TraverseOptions = {
  default?: unknown;
  expected_type?: (value: unknown) => unknown;
  get_all?: boolean;
  casesense?: boolean;
  traverse_string?: boolean;
};
type ApplyKeyResult = { branching: boolean; values: unknown[] };
type ApplyPathResult = {
  hasBranched: boolean;
  lastKeyIsRecord: boolean;
  values: unknown[];
};

export const Ellipsis = Symbol("Ellipsis");
export const ANY = Symbol("any");
export const ALL = Symbol("all");
export const FILTER = Symbol("filter");

export class Slice {
  constructor(
    readonly start: number | null = null,
    readonly stop: number | null = null,
    readonly step: number | null = null,
  ) {}
}

export function slice(
  start: number | null = null,
  stop: number | null = null,
  step: number | null = null,
): Slice {
  return new Slice(start, stop, step);
}

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
        casesense?: boolean;
        traverse_string?: boolean;
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
        casesense?: boolean;
        traverse_string?: boolean;
      })
    : {};
  const paths = pathsAndOptions as TraversePath[];
  let lastPathBranched = false;
  for (const path of paths) {
    const result = applyPathDetailed(
      obj,
      Array.isArray(path)
        ? (path as readonly TraverseKey[])
        : [path as TraverseKey],
      options,
    );
    lastPathBranched = result.hasBranched;
    const typed = result.lastKeyIsRecord
      ? result.values
      : applyExpectedType(result.values, options);
    const filtered = typed.filter(isPresentTraversalResult) as T[];
    if (filtered.length) {
      const first = filtered[0];
      if (first === undefined) {
        continue;
      }
      return options.get_all === false
        ? first
        : result.hasBranched
          ? filtered
          : filtered.length === 1
            ? first
            : filtered;
    }
    if (result.lastKeyIsRecord) {
      return {} as T;
    }
  }
  return "default" in options
    ? (options.default as T)
    : lastPathBranched
      ? []
      : null;
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

function isTraverseOptions(value: unknown): value is TraverseOptions {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    value instanceof Set
  ) {
    return false;
  }
  return "default" in value || "expected_type" in value || "get_all" in value || "casesense" in value || "traverse_string" in value;
}

function applyPath(
  obj: unknown,
  path: readonly TraverseKey[],
  options: TraverseOptions = {},
): unknown[] {
  return applyPathDetailed(obj, path, options).values;
}

function applyPathDetailed(
  obj: unknown,
  path: readonly TraverseKey[],
  options: TraverseOptions = {},
): ApplyPathResult {
  let values = [obj];
  let hasBranched = false;
  let lastKey: TraverseKey | undefined;
  for (const key of path) {
    lastKey = key;
    if (key === ANY) {
      hasBranched = false;
      const first = values.find((value) => value !== null && value !== undefined && (!isRecord(value) || Object.keys(value).length));
      values = first === undefined ? [] : [first];
      continue;
    }
    if (key === ALL) {
      hasBranched = false;
      values = [values.filter((value) => value !== null && value !== undefined && (!isRecord(value) || Object.keys(value).length))];
      continue;
    }
    if (key === FILTER) {
      values = values.filter(pythonTruthy);
      continue;
    }
    const nextValues: unknown[] = [];
    for (const value of values) {
      const result = applyKeyDetailed(value, key, options);
      hasBranched ||= result.branching;
      nextValues.push(...result.values);
    }
    values = nextValues;
    if (!values.length) {
      break;
    }
  }
  return { hasBranched, lastKeyIsRecord: isRecord(lastKey), values };
}

export function value<T>(constant: T): () => T {
  return () => constant;
}

export class _RequiredError extends ExtractorError {}

export function require(name: string, options: { expected?: boolean } = {}): (value: unknown) => unknown {
  return (input) => {
    if (input === null || input === undefined) {
      throw new _RequiredError(`Unable to extract ${name}`, { expected: options.expected });
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
    if (result !== null && (!Array.isArray(result) || result.length)) {
      return result as T;
    }
  }
  return "default" in options ? options.default as T : null;
}

export const traversal_get_first = traversalGetFirst;
export const get_first = traversalGetFirst;

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

function applyKey(
  value: unknown,
  key: TraverseKey,
  options: TraverseOptions = {},
): unknown[] {
  return applyKeyDetailed(value, key, options).values;
}

function applyKeyDetailed(
  value: unknown,
  key: TraverseKey,
  options: TraverseOptions = {},
): ApplyKeyResult {
  if (key === null) {
    return { branching: false, values: [value] };
  }
  if (key === Ellipsis) {
    if (isCookieMorselLike(value)) {
      return { branching: true, values: Object.values(value.toTraversalRecord()) };
    }
    if (isRegExpMatch(value)) {
      return { branching: true, values: value.slice(1) };
    }
    if (Array.isArray(value)) {
      return { branching: true, values: value };
    }
    if (isXmlElement(value)) {
      return { branching: true, values: value.children };
    }
    if (isIterableLike(value)) {
      return { branching: true, values: [...value] };
    }
    if (isRecord(value)) {
      return { branching: true, values: Object.values(value) };
    }
    if (options.traverse_string) {
      return { branching: false, values: [String(value)] };
    }
    return { branching: true, values: [] };
  }
  if (Array.isArray(key)) {
    return {
      branching: true,
      values: key.flatMap((branch) =>
        Array.isArray(branch)
          ? applyPath(value, branch as readonly TraverseKey[], options)
          : applyKey(value, branch as TraverseKey, options),
      ),
    };
  }
  if (key instanceof Slice) {
    if (Array.isArray(value)) {
      return { branching: true, values: applySlice(value, key) };
    }
    if (options.traverse_string) {
      return { branching: false, values: [applySlice([...String(value)], key).join("")] };
    }
    return { branching: false, values: [undefined] };
  }
  if (key instanceof Set) {
    const items = [...key];
    const item = items[0];
    if (!items.length || !item) {
      throw new Error("Set traversal key must contain a type filter or transform");
    }
    if (items.every(isConstructorFilter)) {
      return {
        branching: false,
        values: items.some((constructorFilter) => matchesConstructor(value, constructorFilter)) ? [value] : [],
      };
    }
    if (items.length > 1 || items.some(isConstructorFilter)) {
      throw new Error("Set traversal keys must be either all type filters or one transform");
    }
    const transform = item as (input: unknown) => unknown;
    try {
      return {
        branching: false,
        values: [transform(value)].filter(
          (result) => result !== null && result !== undefined,
        ),
      };
    } catch (error) {
      if (error instanceof ExtractorError) {
        throw error;
      }
      return { branching: false, values: [] };
    }
  }
  if (typeof key === "function") {
    const isStringTraversal = options.traverse_string && !isBranchIterable(value) && !isRegExpMatch(value);
    const entries = isCookieMorselLike(value)
      ? Object.entries(value.toTraversalRecord())
      : Array.isArray(value)
      ? isRegExpMatch(value)
        ? regexMatchEntries(value)
        : value.map((item, index) => [index, item] as const)
      : isXmlElement(value)
        ? value.children.map((item, index) => [index, item] as const)
      : isIterableLike(value)
        ? [...value].map((item, index) => [index, item] as const)
      : isRecord(value)
        ? Object.entries(value)
        : isStringTraversal
          ? [...String(value)].map((item, index) => [index, item] as const)
          : [];
    const filtered = entries
      .filter(([entryKey, entryValue]) => tryTraversalPredicate(key, entryKey, entryValue))
      .map(([, entryValue]) => entryValue);
    if (isStringTraversal) {
      return { branching: false, values: [filtered.join("")] };
    }
    return { branching: entries.length > 0 || !options.traverse_string, values: filtered };
  }
  if (isRecord(key)) {
    const out: Record<string, unknown> = {};
    for (const [outKey, outPath] of Object.entries(key)) {
      const result = traverseSubpathForMapping(
        value,
        Array.isArray(outPath)
          ? (outPath as readonly TraverseKey[])
          : [outPath as TraverseKey],
        options,
      );
      if (isPresentTraversalResult(result)) {
        out[outKey] = result;
      } else if ("default" in options) {
        out[outKey] = options.default;
      }
    }
    return { branching: false, values: Object.keys(out).length ? [out] : [] };
  }
  if (typeof key === "number") {
    if (Array.isArray(value)) return { branching: false, values: [value[key]] };
    if (isXmlElement(value)) return { branching: false, values: [value.children[key]] };
    if (isRecord(value)) return { branching: false, values: [value[String(key)]] };
    if (options.traverse_string) return { branching: false, values: [String(value)[key]] };
    return { branching: false, values: [undefined] };
  }
  if (typeof key === "string") {
    if (isCookieMorselLike(value)) {
      const record = value.toTraversalRecord();
      if (options.casesense === false) {
        const folded = key.toLocaleLowerCase();
        return { branching: false, values: [Object.entries(record).find(([entryKey]) => entryKey.toLocaleLowerCase() === folded)?.[1]] };
      }
      return { branching: false, values: [record[key]] };
    }
    if (isXmlElement(value)) {
      return { branching: false, values: xmlApplyString(value, key) };
    }
    if (isRegExpMatch(value)) {
      if (options.casesense === false) {
        const folded = key.toLocaleLowerCase();
        return { branching: false, values: [Object.entries(value.groups ?? {}).find(([entryKey]) => entryKey.toLocaleLowerCase() === folded)?.[1]] };
      }
      return { branching: false, values: [value.groups?.[key]] };
    }
    if (isRecord(value)) {
      if (options.casesense === false) {
        const folded = key.toLocaleLowerCase();
        return { branching: false, values: [Object.entries(value).find(([entryKey]) => entryKey.toLocaleLowerCase() === folded)?.[1]] };
      }
      return { branching: false, values: [value[key]] };
    }
    if (hasGroups(value)) {
      return { branching: false, values: [value.groups[key]] };
    }
  }
  return { branching: false, values: [undefined] };
}

function isPresentTraversalResult(value: unknown): boolean {
  return value !== null && value !== undefined && (!isRecord(value) || Object.keys(value).length > 0);
}

function pythonTruthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false || value === "") {
    return false;
  }
  if (typeof value === "number") {
    return value !== 0 && !Number.isNaN(value);
  }
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  if (isRecord(value)) {
    return Object.keys(value).length > 0;
  }
  return true;
}

function traverseSubpathForMapping(
  value: unknown,
  path: readonly TraverseKey[],
  options: TraverseOptions,
): unknown {
  const result = applyPathDetailed(value, path, options);
  const values = result.lastKeyIsRecord
    ? result.values
    : applyExpectedType(result.values, options);
  const filtered = values.filter(isPresentTraversalResult);
  if (result.hasBranched) {
    return filtered.length ? filtered : null;
  }
  if (filtered.length) {
    return filtered[0];
  }
  return result.lastKeyIsRecord ? {} : null;
}

function applyExpectedType(values: readonly unknown[], options: TraverseOptions): unknown[] {
  if (!options.expected_type) {
    return [...values];
  }
  return values.flatMap((value) => {
    try {
      const typed = options.expected_type?.(value);
      if (typed === true) {
        return [value];
      }
      if (typed === false || typed === null || typed === undefined) {
        return [];
      }
      return [typed];
    } catch {
      return [];
    }
  });
}

function tryTraversalPredicate(
  predicate: (key: string | number, value: unknown) => boolean,
  key: string | number,
  value: unknown,
): boolean {
  try {
    return Boolean(predicate(key, value));
  } catch {
    return false;
  }
}

function isRegExpMatch(value: unknown): value is RegExpMatchArray {
  if (!Array.isArray(value)) {
    return false;
  }
  const match = value as Partial<RegExpMatchArray>;
  return typeof match.index === "number" && typeof match.input === "string";
}

function isIterableLike(value: unknown): value is Iterable<unknown> {
  return Boolean(
    value !== null &&
      value !== undefined &&
      typeof value !== "string" &&
      !(value instanceof Uint8Array) &&
      !(value instanceof Map) &&
      typeof (value as { [Symbol.iterator]?: unknown })[Symbol.iterator] === "function",
  );
}

function isBranchIterable(value: unknown): boolean {
  return Array.isArray(value) || isXmlElement(value) || isIterableLike(value) || isRecord(value);
}

function regexMatchEntries(value: RegExpMatchArray): Array<readonly [string | number, unknown]> {
  return [
    ...value.map((item, index) => [index, item] as const),
    ...Object.entries(value.groups ?? {}),
  ];
}

function isCookieMorselLike(
  value: unknown,
): value is { toTraversalRecord: () => Record<string, unknown> } {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as { toTraversalRecord?: unknown }).toTraversalRecord === "function",
  );
}

function isConstructorFilter(
  item: unknown,
): item is StringConstructor | NumberConstructor | BooleanConstructor | ObjectConstructor | ArrayConstructor {
  return item === String || item === Number || item === Boolean || item === Object || item === Array;
}

function matchesConstructor(
  value: unknown,
  constructorFilter: StringConstructor | NumberConstructor | BooleanConstructor | ObjectConstructor | ArrayConstructor,
): boolean {
  if (constructorFilter === String) return typeof value === "string";
  if (constructorFilter === Number) return typeof value === "number";
  if (constructorFilter === Boolean) return typeof value === "boolean";
  if (constructorFilter === Object) return isRecord(value);
  return Array.isArray(value);
}

function applySlice<T>(values: readonly T[], sliceSpec: Slice): T[] {
  const length = values.length;
  const step = sliceSpec.step ?? 1;
  if (step === 0) {
    return [];
  }
  const normalize = (index: number | null, fallback: number) => {
    const value = index ?? fallback;
    return value < 0 ? Math.max(length + value, 0) : Math.min(value, length);
  };
  const start = normalize(sliceSpec.start, step > 0 ? 0 : length - 1);
  const stop = normalize(sliceSpec.stop, step > 0 ? length : -1);
  const out: T[] = [];
  if (step > 0) {
    for (let index = start; index < stop; index += step) out.push(values[index] as T);
  } else {
    for (let index = start; index > stop; index += step) out.push(values[index] as T);
  }
  return out;
}

function isXmlElement(value: unknown): value is XmlElement {
  return z
    .object({
      tag: z.string(),
      attrib: z.record(z.string(), z.string()),
      text: z.string().nullable(),
      children: z.array(z.unknown()),
    })
    .safeParse(value).success;
}

function xmlApplyString(element: XmlElement, key: string): unknown[] {
  const slashIndex = key.lastIndexOf("/");
  let xpath = slashIndex >= 0 ? key.slice(0, slashIndex) : "";
  let special: string | null = slashIndex >= 0 ? key.slice(slashIndex + 1) : key;

  if (!special.startsWith("@") && !special.endsWith("()")) {
    xpath = key;
    special = null;
  }

  const targets = xmlFind(element, xpath);
  const results = targets.map((target) => xmlApplySpecial(target, special));
  return xpath ? [results] : results;
}

function xmlApplySpecial(element: XmlElement, special: string | null): unknown {
  if (special === null) {
    return element;
  }
  if (special === "@") {
    return element.attrib;
  }
  if (special.startsWith("@")) {
    return element.attrib[special.slice(1)] ?? null;
  }
  if (special === "text()") {
    return element.text;
  }
  throw new SyntaxError(`Unsupported XML traversal special ${special}`);
}

function xmlFind(element: XmlElement, xpath: string): XmlElement[] {
  if (!xpath) {
    return [element];
  }
  let expression = xpath;
  if (expression.startsWith("/")) {
    expression = `.${expression}`;
  } else if (!expression.startsWith("./") && !expression.startsWith(".//")) {
    expression = `./${expression}`;
  }

  if (expression.startsWith(".//")) {
    return xmlFilterExpression(xmlDescendants(element), expression.slice(3));
  }
  if (expression.startsWith("./")) {
    return xmlFilterExpression(element.children, expression.slice(2));
  }
  throw new SyntaxError(`Unsupported XML traversal xpath ${xpath}`);
}

function xmlFilterExpression(
  elements: readonly XmlElement[],
  expression: string,
): XmlElement[] {
  const attrPredicate = expression.match(/^\*\[@(?<attr>[\w:-]+)\]$/);
  const attr = attrPredicate?.groups?.attr;
  if (attr) {
    return elements.filter((element) => attr in element.attrib);
  }
  if (!expression.includes("/") && expression !== "*") {
    return elements.filter((element) => xmlTagMatches(element, expression));
  }
  throw new SyntaxError(`Unsupported XML traversal xpath expression ${expression}`);
}

function xmlDescendants(element: XmlElement): XmlElement[] {
  const out: XmlElement[] = [];
  const visit = (node: XmlElement) => {
    for (const child of node.children) {
      out.push(child);
      visit(child);
    }
  };
  visit(element);
  return out;
}

function xmlTagMatches(element: XmlElement, tag: string): boolean {
  return tag === "*" || element.tag === tag || xmlLocalName(element.tag) === tag;
}

function xmlLocalName(tag: string): string {
  const namespaceEnd = tag.lastIndexOf("}");
  return namespaceEnd >= 0 ? tag.slice(namespaceEnd + 1) : tag;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return RecordSchema.safeParse(value).success;
}

function hasGroups(
  value: unknown,
): value is { groups: Record<string, string | undefined> } {
  return GroupsSchema.safeParse(value).success;
}
