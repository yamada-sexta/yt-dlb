// Source: yt_dlp/jsinterp.py
// Port note: Bun can execute JavaScript natively, so this replaces the Python AST/string interpreter
// with a small extraction layer that compiles functions from the source code.

export class JSUndefined {
  readonly type = "undefined";
}

export const JS_Undefined = new JSUndefined();

export class JSBreak extends Error {
  constructor() {
    super("Invalid break");
  }
}

export class JSContinue extends Error {
  constructor() {
    super("Invalid continue");
  }
}

export class JSThrow extends Error {
  constructor(readonly error: unknown) {
    super(`Uncaught exception ${String(error)}`);
  }
}

export class JSInterpreterError extends Error {
  constructor(message: string, readonly expr?: string) {
    super(expr ? `${message.trimEnd()} in: ${truncateString(expr, 50, 50)}` : message);
  }
}

export function intToInt32(value: number): number {
  const unsigned = value >>> 0;
  return unsigned & 0x80000000 ? unsigned - 0x100000000 : unsigned;
}

export function jsNumberToString(value: number, radix = 10): string {
  if (Number.isNaN(value)) {
    return "NaN";
  }
  if (value === 0) {
    return "0";
  }
  if (!Number.isFinite(value)) {
    return value < 0 ? "-Infinity" : "Infinity";
  }
  if (radix < 2 || radix > 36) {
    throw new Error("radix must be an integer at least 2 and no greater than 36");
  }
  return value.toString(radix);
}

export class LocalNameSpace {
  readonly #scopes: Array<Record<string, unknown>>;

  constructor(...scopes: Array<Record<string, unknown>>) {
    this.#scopes = scopes.length ? scopes : [{}];
  }

  get(key: string, defaultValue: unknown = JS_Undefined): unknown {
    for (const scope of this.#scopes) {
      if (key in scope) {
        return scope[key];
      }
    }
    return defaultValue;
  }

  set(key: string, value: unknown): void {
    for (const scope of this.#scopes) {
      if (key in scope) {
        scope[key] = value;
        return;
      }
    }
    this.#scopes[0][key] = value;
  }

  setLocal(key: string, value: unknown): void {
    this.#scopes[0][key] = value;
  }

  getLocal(key: string): unknown {
    return key in this.#scopes[0] ? this.#scopes[0][key] : JS_Undefined;
  }

  toObject(): Record<string, unknown> {
    return Object.assign({}, ...[...this.#scopes].reverse());
  }
}

export class Debugger {
  static ENABLED = false;

  static write(...args: unknown[]): void {
    if (Debugger.ENABLED) {
      process.stderr.write(`[debug] JS: ${args.map((arg) => truncateString(String(arg), 50, 50)).join(" ")}\n`);
    }
  }
}

type JsCallable = (args: readonly unknown[], kwargs?: Record<string, unknown>, allowRecursion?: number) => unknown;

export class JSInterpreter {
  static #namedObjectCounter = 0;

  readonly #functions = new Map<string, JsCallable>();
  readonly #objects: Record<string, unknown>;

  constructor(readonly code: string, objects: Record<string, unknown> = {}) {
    this.#objects = objects;
  }

  interpretExpression(expression: string, localVars: LocalNameSpace | Record<string, unknown> = {}, _allowRecursion = 100): unknown {
    const scope = localVars instanceof LocalNameSpace ? localVars.toObject() : localVars;
    return evaluateInScope(expression, scope, this.#objects);
  }

  interpretStatement(statement: string, localVars: LocalNameSpace | Record<string, unknown> = {}, allowRecursion = 100): [unknown, boolean] {
    const trimmed = statement.trim();
    if (!trimmed) {
      return [undefined, false];
    }
    if (trimmed === "break") {
      throw new JSBreak();
    }
    if (trimmed === "continue") {
      throw new JSContinue();
    }
    if (trimmed.startsWith("throw ")) {
      throw new JSThrow(this.interpretExpression(trimmed.slice(6), localVars, allowRecursion));
    }
    if (trimmed.startsWith("return")) {
      return [this.interpretExpression(trimmed.slice(6), localVars, allowRecursion), true];
    }
    return [this.interpretExpression(trimmed, localVars, allowRecursion), false];
  }

  extractFunctionCode(functionName: string): [string[], string] {
    const escaped = RegExp.escape(functionName);
    const patterns = [
      new RegExp(`function\\s+${escaped}\\s*\\((?<args>[^)]*)\\)\\s*(?<body>\\{)`, "s"),
      new RegExp(`[{;,]\\s*${escaped}\\s*=\\s*function\\s*\\((?<args>[^)]*)\\)\\s*(?<body>\\{)`, "s"),
      new RegExp(`(?:var|const|let)\\s+${escaped}\\s*=\\s*function\\s*\\((?<args>[^)]*)\\)\\s*(?<body>\\{)`, "s"),
    ];
    for (const pattern of patterns) {
      const match = pattern.exec(this.code);
      if (!match?.groups) {
        continue;
      }
      const bodyStart = match.index + match[0].length - 1;
      const [body] = separateAtParen(this.code.slice(bodyStart));
      const args = (match.groups.args ?? "").split(",").map((arg) => arg.trim()).filter(Boolean);
      return [args, body];
    }
    throw new JSInterpreterError(`Could not find JS function "${functionName}"`);
  }

  extractFunction(functionName: string, ...globalStack: Array<Record<string, unknown>>): JsCallable {
    const existing = this.#functions.get(functionName);
    if (existing) {
      return existing;
    }
    const fn = this.extractFunctionFromCode(...this.extractFunctionCode(functionName), ...globalStack);
    this.#functions.set(functionName, fn);
    return fn;
  }

  extractFunctionFromCode(argNames: readonly string[], code: string, ...globalStack: Array<Record<string, unknown>>): JsCallable {
    return this.buildFunction(argNames, code, ...globalStack);
  }

  callFunction(functionName: string, ...args: readonly unknown[]): unknown {
    return this.extractFunction(functionName)(args);
  }

  buildFunction(argNames: readonly string[], code: string, ...globalStack: Array<Record<string, unknown>>): JsCallable {
    const globals = Object.assign({}, ...globalStack, this.#objects);
    const compiled = new Function(
      ...Object.keys(globals),
      ...argNames,
      `"use strict";\n${code}`,
    );
    return (args: readonly unknown[], kwargs: Record<string, unknown> = {}) => {
      const mergedGlobals = { ...globals, ...kwargs };
      return compiled(...Object.values(mergedGlobals), ...args);
    };
  }

  extractObject(objectName: string, ...globalStack: Array<Record<string, unknown>>): Record<string, JsCallable> {
    const escaped = RegExp.escape(objectName);
    const objectMatch = new RegExp(`(?<![a-zA-Z$0-9.])${escaped}\\s*=\\s*\\{\\s*(?<fields>[\\s\\S]*?)\\}\\s*;`).exec(this.code);
    if (!objectMatch?.groups?.fields) {
      throw new JSInterpreterError(`Could not find object ${objectName}`);
    }

    const object: Record<string, JsCallable> = {};
    const fieldPattern = /(?<key>[a-zA-Z$0-9]+|"[a-zA-Z$0-9]+"|'[a-zA-Z$0-9]+')\s*:\s*function\s*\((?<args>[^)]*)\)\s*(?<body>\{)/g;
    for (const match of objectMatch.groups.fields.matchAll(fieldPattern)) {
      if (!match.groups) {
        continue;
      }
      const bodyStart = (match.index ?? 0) + match[0].length - 1;
      const [body] = separateAtParen(objectMatch.groups.fields.slice(bodyStart));
      const name = removeQuotes(match.groups.key ?? "");
      const args = (match.groups.args ?? "").split(",").map((arg) => arg.trim()).filter(Boolean);
      object[name] = this.buildFunction(args, body, ...globalStack);
    }
    return object;
  }

  namedObject(namespace: Record<string, unknown>, object: unknown): string {
    JSInterpreter.#namedObjectCounter += 1;
    const name = `__yt_dlp_jsinterp_obj${JSInterpreter.#namedObjectCounter}`;
    namespace[name] = object;
    return name;
  }
}

export const Exception = JSInterpreterError;

function evaluateInScope(expression: string, scope: Record<string, unknown>, objects: Record<string, unknown>): unknown {
  const globals = { ...objects, ...scope };
  const compiled = new Function(...Object.keys(globals), `"use strict"; return (${expression});`);
  return compiled(...Object.values(globals));
}

function separateAtParen(expression: string, delimiter?: string): [string, string] {
  const open = expression[0];
  const close = delimiter ?? matchingParen(open);
  let depth = 0;
  let quote: string | null = null;
  let escaping = false;

  for (let index = 0; index < expression.length; index += 1) {
    const char = expression[index];
    if (char === undefined) {
      break;
    }
    if (quote) {
      escaping = !escaping && char === "\\";
      if (!escaping && char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === open) {
      depth += 1;
    } else if (char === close) {
      depth -= 1;
      if (depth === 0) {
        return [expression.slice(1, index).trim(), expression.slice(index + 1).trim()];
      }
    }
  }
  throw new JSInterpreterError(`No terminating paren ${close}`, expression);
}

function matchingParen(open: string | undefined): string {
  if (open === "(") {
    return ")";
  }
  if (open === "{") {
    return "}";
  }
  if (open === "[") {
    return "]";
  }
  throw new JSInterpreterError(`Unsupported opening paren ${open ?? ""}`);
}

function removeQuotes(value: string): string {
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function truncateString(value: string, left: number, right: number): string {
  if (value.length <= left + right + 3) {
    return value;
  }
  return `${value.slice(0, left)}...${value.slice(-right)}`;
}
