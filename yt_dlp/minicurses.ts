// Source: yt_dlp/minicurses.py

import { NotImplementedError } from "./errors.ts";
import { z } from "zod";

export const CONTROL_SEQUENCES = {
  DOWN: "\n",
  UP: "\x1B[A",
  ERASE_LINE: "\x1B[K",
  RESET: "\x1B[0m",
} as const;

const COLORS = {
  BLACK: "0",
  RED: "1",
  GREEN: "2",
  YELLOW: "3",
  BLUE: "4",
  PURPLE: "5",
  CYAN: "6",
  WHITE: "7",
} as const;

const TEXT_STYLES = {
  NORMAL: "0",
  BOLD: "1",
  UNDERLINED: "4",
} as const;

const ColorSchema = z.enum(
  Object.keys(COLORS) as [keyof typeof COLORS, ...Array<keyof typeof COLORS>],
);
const TextStyleSchema = z.enum(
  Object.keys(TEXT_STYLES) as [
    keyof typeof TEXT_STYLES,
    ...Array<keyof typeof TEXT_STYLES>,
  ],
);

type WritableStreamLike = {
  write?(text: string): void;
  debug?(text: string): void;
};

export function formatText(text: string, format: string): string {
  const original = format.toUpperCase();
  const tokens = original.trim().split(/\s+/).filter(Boolean);

  let bgColor = "";
  const onIndex = tokens.indexOf("ON");
  if (onIndex !== -1) {
    if (tokens.at(-1) === "ON") {
      throw new SyntaxError(
        `Empty background format specified in ${JSON.stringify(original)}`,
      );
    }
    const color = tokens.at(-1);
    if (!isColor(color)) {
      throw new SyntaxError(
        `${color ?? ""} in ${JSON.stringify(original)} must be a color`,
      );
    }
    tokens.pop();
    bgColor = `4${COLORS[color]}`;
    if (tokens.at(-1) === "LIGHT") {
      bgColor = `0;10${bgColor.slice(1)}`;
      tokens.pop();
    }
    if (tokens.at(-1) !== "ON") {
      throw new SyntaxError(
        `Invalid background format in ${JSON.stringify(original)}`,
      );
    }
    tokens.pop();
    bgColor = `\x1B[${bgColor}m`;
  }

  let fgColor = "";
  if (tokens.length) {
    const color = tokens.at(-1);
    if (!isColor(color)) {
      throw new SyntaxError(
        `${color ?? ""} in ${JSON.stringify(original)} must be a color`,
      );
    }
    tokens.pop();
    fgColor = `3${COLORS[color]}`;
    if (tokens.at(-1) === "LIGHT") {
      fgColor = `9${fgColor.slice(1)}`;
      tokens.pop();
    }
    const style: keyof typeof TEXT_STYLES = isTextStyle(tokens.at(-1))
      ? (tokens.pop() as keyof typeof TEXT_STYLES)
      : "NORMAL";
    fgColor = `\x1B[${TEXT_STYLES[style]};${fgColor}m`;
    if (tokens.length) {
      throw new SyntaxError(
        `Invalid format ${JSON.stringify(tokens.join(" "))} in ${JSON.stringify(original)}`,
      );
    }
  }

  if (!fgColor && !bgColor) {
    return text;
  }
  const prefix = `${fgColor}${bgColor}`;
  return `${prefix}${text.replaceAll(CONTROL_SEQUENCES.RESET, prefix)}${CONTROL_SEQUENCES.RESET}`;
}

export class MultilinePrinterBase {
  readonly maximum: number;
  protected readonly haveFullcap: boolean;

  constructor(
    protected readonly stream: WritableStreamLike = process.stderr,
    lines = 1,
  ) {
    this.maximum = lines - 1;
    this.haveFullcap = Boolean(process.stderr.isTTY && process.env.TERM);
  }

  printAtLine(_text: string, _pos: number): void {
    throw new NotImplementedError("MultilinePrinterBase.printAtLine");
  }

  end(): void {
    throw new NotImplementedError("MultilinePrinterBase.end");
  }

  protected addLineNumber(text: string, line: number): string {
    return this.maximum ? `${line + 1}: ${text}` : text;
  }

  write(...text: string[]): void {
    const value = text.join("");
    if (this.stream.write) {
      this.stream.write(value);
    } else {
      process.stderr.write(value);
    }
  }
}

export class QuietMultilinePrinter extends MultilinePrinterBase {
  override printAtLine(_text: string, _pos: number): void {
    return;
  }

  override end(): void {
    return;
  }
}

export class MultilineLogger extends MultilinePrinterBase {
  override write(...text: string[]): void {
    this.stream.debug?.(text.join(""));
  }

  override printAtLine(text: string, pos: number): void {
    this.write(this.addLineNumber(text, pos));
  }
}

export class BreaklineStatusPrinter extends MultilinePrinterBase {
  override printAtLine(text: string, pos: number): void {
    this.write(this.addLineNumber(text, pos), "\n");
  }
}

export class MultilinePrinter extends MultilinePrinterBase {
  #lastLine = 0;
  #lastLength = 0;

  constructor(
    stream: WritableStreamLike = process.stderr,
    lines = 1,
    readonly preserveOutput = true,
  ) {
    super(stream, lines);
  }

  override printAtLine(text: string, pos: number): void {
    if (this.haveFullcap) {
      this.write(...this.moveCursor(pos), CONTROL_SEQUENCES.ERASE_LINE, text);
      return;
    }

    const printable = this.addLineNumber(text, pos);
    let output = printable;
    let prefix = "\n";
    if (this.#lastLine === pos) {
      prefix = "\r";
      if (this.#lastLength > printable.length) {
        output += " ".repeat(this.#lastLength - printable.length);
      }
    }
    this.#lastLength = printable.length;
    this.write(prefix, output);
    this.#lastLine = pos;
  }

  override end(): void {
    const text = this.haveFullcap ? this.moveCursor(this.maximum) : [];
    if (this.preserveOutput) {
      this.write(...text, "\n");
      return;
    }
    if (this.haveFullcap) {
      this.write(
        ...text,
        CONTROL_SEQUENCES.ERASE_LINE,
        `${CONTROL_SEQUENCES.UP}${CONTROL_SEQUENCES.ERASE_LINE}`.repeat(
          this.maximum,
        ),
      );
    } else {
      this.write("\r", " ".repeat(this.#lastLength), "\r");
    }
  }

  private moveCursor(dest: number): string[] {
    const current = Math.min(this.#lastLine, this.maximum);
    const output = ["\r"];
    const distance = dest - current;
    if (distance < 0) {
      output.push(CONTROL_SEQUENCES.UP.repeat(-distance));
    } else if (distance > 0) {
      output.push(CONTROL_SEQUENCES.DOWN.repeat(distance));
    }
    this.#lastLine = dest;
    return output;
  }
}

function isColor(value: string | undefined): value is keyof typeof COLORS {
  return ColorSchema.safeParse(value).success;
}

function isTextStyle(
  value: string | undefined,
): value is keyof typeof TEXT_STYLES {
  return TextStyleSchema.safeParse(value).success;
}
