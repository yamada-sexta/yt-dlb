// Source: yt_dlp/utils/jslib/devalue.py

import { parseIso8601 } from "../utils.ts";

type Reviver = (value: unknown) => unknown;

const typedArrayConstructors: Record<string, { from(values: number[]): unknown }> = {
  Int8Array,
  Uint8Array,
  Uint8ClampedArray,
  Int16Array,
  Uint16Array,
  Int32Array,
  Uint32Array,
  Float32Array,
  Float64Array,
  BigInt64Array: {
    from(values: number[]): BigInt64Array {
      return BigInt64Array.from(values.map((value) => BigInt(value)));
    },
  },
  BigUint64Array: {
    from(values: number[]): BigUint64Array {
      return BigUint64Array.from(values.map((value) => BigInt(value)));
    },
  },
  ArrayBuffer: {
    from(values: number[]): ArrayBuffer {
      return Uint8Array.from(values).buffer;
    },
  },
};

const constants = new Map<number, unknown>([
  [-1, undefined],
  [-2, null],
  [-3, Number.NaN],
  [-4, Number.POSITIVE_INFINITY],
  [-5, Number.NEGATIVE_INFINITY],
  [-6, -0],
]);

export function* parseIter(
  parsed: unknown,
  options: { revivers?: Record<string, Reviver> } = {},
): Generator<Error, unknown, void> {
  try {
    return parseInternal(parsed, options.revivers ?? {});
  } catch (error) {
    yield error instanceof Error ? error : new Error(String(error));
    return null;
  }
}

export const parse_iter = parseIter;

export function parse(parsed: unknown, options: { revivers?: Record<string, Reviver> } = {}): unknown {
  const generator = parseIter(parsed, options);
  while (true) {
    const result = generator.next();
    if (result.done) {
      return result.value;
    }
    throw result.value;
  }
}

function parseInternal(parsed: unknown, revivers: Record<string, Reviver>): unknown {
  if (Number.isInteger(parsed) && typeof parsed === "number") {
    if (!constants.has(parsed) || parsed === -2) {
      throw new Error("invalid integer input");
    }
    return constants.get(parsed);
  }
  if (!Array.isArray(parsed)) {
    throw new Error("expected int or list as input");
  }
  if (parsed.length === 0) {
    throw new Error("expected a non-empty list as input");
  }

  const resolved = new Map<number, unknown>(constants);
  const resolving = new Set<number>();
  return hydrate(parsed, 0, resolved, resolving, revivers);
}

function hydrate(
  parsed: unknown[],
  source: unknown,
  resolved: Map<number, unknown>,
  resolving: Set<number>,
  revivers: Record<string, Reviver>,
): unknown {
  if (!Number.isInteger(source) || typeof source !== "number") {
    throw new TypeError(`invalid index: ${String(source)}`);
  }
  if (resolved.has(source)) {
    return resolved.get(source);
  }
  if (source < 0) {
    throw new RangeError(`invalid index: ${source}`);
  }
  if (source >= parsed.length) {
    throw new RangeError(`invalid index: ${source}`);
  }
  if (resolving.has(source)) {
    throw new RangeError(`circular reference at index: ${source}`);
  }

  resolving.add(source);
  try {
    const value = parsed[source];
    let result: unknown;
    if (Array.isArray(value)) {
      result = hydrateArrayValue(value, parsed, source, resolved, resolving, revivers);
    } else if (value && typeof value === "object") {
      result = hydrateObjectValue(value as Record<string, unknown>, parsed, source, resolved, resolving, revivers);
    } else {
      result = value;
    }
    resolved.set(source, result);
    return result;
  } finally {
    resolving.delete(source);
  }
}

function hydrateArrayValue(
  value: unknown[],
  parsed: unknown[],
  source: number,
  resolved: Map<number, unknown>,
  resolving: Set<number>,
  revivers: Record<string, Reviver>,
): unknown {
  const typeName = value[0];
  if (typeof typeName !== "string") {
    const result = new Array<unknown>(value.length);
    resolved.set(source, result);
    value.forEach((newSource, offset) => {
      result[offset] = hydrate(parsed, newSource, resolved, resolving, revivers);
    });
    return result;
  }

  const reviver = revivers[typeName];
  if (reviver) {
    if (value[1] === source) {
      throw new RangeError(`${JSON.stringify(typeName)} cannot point to itself (index: ${source})`);
    }
    return reviver(hydrate(parsed, value[1], resolved, resolving, revivers));
  }

  switch (typeName) {
    case "Date": {
      const timestamp = parseIso8601(String(value[1]));
      if (timestamp === null) {
        throw new Error(`invalid date: ${JSON.stringify(value[1])}`);
      }
      return new Date(timestamp * 1000);
    }
    case "Set": {
      const result = new Set<unknown>();
      resolved.set(source, result);
      for (const newSource of value.slice(1)) {
        result.add(hydrate(parsed, newSource, resolved, resolving, revivers));
      }
      return result;
    }
    case "Map": {
      if ((value.length - 1) % 2 !== 0) {
        throw new Error("invalid Map entry list");
      }
      const result = new Map<unknown, unknown>();
      resolved.set(source, result);
      for (let index = 1; index < value.length; index += 2) {
        result.set(
          hydrate(parsed, value[index], resolved, resolving, revivers),
          hydrate(parsed, value[index + 1], resolved, resolving, revivers),
        );
      }
      return result;
    }
    case "RegExp":
      return new RegExp(String(value[1]), typeof value[2] === "string" ? value[2] : undefined);
    case "Object":
      return value[1];
    case "BigInt":
      return BigInt(String(value[1]));
    case "null": {
      if ((value.length - 1) % 2 !== 0) {
        throw new Error("invalid null-prototype object entry list");
      }
      const result: Record<PropertyKey, unknown> = Object.create(null) as Record<PropertyKey, unknown>;
      resolved.set(source, result);
      for (let index = 1; index < value.length; index += 2) {
        const key = value[index];
        if (typeof key !== "string" && typeof key !== "number" && typeof key !== "symbol") {
          throw new TypeError(`invalid object key: ${String(key)}`);
        }
        result[key] = hydrate(parsed, value[index + 1], resolved, resolving, revivers);
      }
      return result;
    }
    default: {
      const ctor = typedArrayConstructors[typeName];
      if (!ctor) {
        throw new TypeError(`invalid type at ${source}: ${JSON.stringify(typeName)}`);
      }
      const encoded = value[1];
      if (typeof encoded !== "string") {
        throw new TypeError(`invalid ${typeName} data`);
      }
      return ctor.from([...Buffer.from(encoded, "base64")]);
    }
  }
}

function hydrateObjectValue(
  value: Record<string, unknown>,
  parsed: unknown[],
  source: number,
  resolved: Map<number, unknown>,
  resolving: Set<number>,
  revivers: Record<string, Reviver>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  resolved.set(source, result);
  for (const [key, newSource] of Object.entries(value)) {
    result[key] = hydrate(parsed, newSource, resolved, resolving, revivers);
  }
  return result;
}
