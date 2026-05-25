// Source: yt_dlp/webvtt.py

export class ParseError extends Error {
  constructor(parser: MatchParser) {
    super(
      `Parse error at position ${parser.position} (near ${JSON.stringify(parser.data.slice(parser.position, parser.position + 100))})`,
    );
  }
}

type MatchValue = RegExpMatchArray | string | number | null;

class MatchParser {
  position = 0;

  constructor(readonly data: string) {}

  match(pattern: RegExp | string): RegExpMatchArray | number | null {
    if (typeof pattern === "string") {
      const literal = new RegExp(RegExp.escape(pattern), "y");
      literal.lastIndex = this.position;
      return literal.test(this.data) ? pattern.length : null;
    }
    const match = this.data.slice(this.position).match(pattern);
    return match && match.index === 0 ? match : null;
  }

  advance(value: MatchValue): MatchValue {
    if (value === null) {
      return value;
    }
    if (typeof value === "number") {
      this.position += value;
    } else if (typeof value === "string") {
      this.position += value.length;
    } else {
      this.position += value[0].length;
    }
    return value;
  }

  consume(pattern: RegExp | string): RegExpMatchArray | number | null {
    return this.advance(this.match(pattern)) as
      | RegExpMatchArray
      | number
      | null;
  }

  child(): MatchChildParser {
    return new MatchChildParser(this);
  }

  isEof(): boolean {
    return this.position >= this.data.length;
  }
}

class MatchChildParser extends MatchParser {
  constructor(private readonly parent: MatchParser) {
    super(parent.data);
    this.position = parent.position;
  }

  commit(): MatchParser {
    this.parent.position = this.position;
    return this.parent;
  }
}

const REGEX_TS = /(?:([0-9]{1,}):)?([0-9]{2}):([0-9]{2})\.([0-9]{3})?/;
const REGEX_NL = /(?:\r\n|[\r\n]|$)/;
const REGEX_BLANK = /(?:\r\n|[\r\n])+/;
const REGEX_OPTIONAL_WHITESPACE = /[ \t]*/;

interface WritableString {
  write(text: string): void;
}

class StringWriter implements WritableString {
  #parts: string[] = [];

  write(text: string): void {
    this.#parts.push(text);
  }

  toString(): string {
    return this.#parts.join("");
  }
}

export function parseTs(match: RegExpMatchArray): number {
  const multipliers = [3600_000, 60_000, 1000, 1];
  return (
    90 *
    multipliers.reduce((total, multiplier, index) => {
      const part = Number.parseInt(match[index + 1] ?? "0", 10) || 0;
      return total + part * multiplier;
    }, 0)
  );
}

export function formatTs(timestamp: number): string {
  const millis = Math.trunc((timestamp + 45) / 90);
  const hours = Math.trunc(millis / 3_600_000);
  const minutes = Math.trunc((millis % 3_600_000) / 60_000);
  const seconds = Math.trunc((millis % 60_000) / 1000);
  const ms = millis % 1000;
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.${pad3(ms)}`;
}

export class Block {
  constructor(readonly raw = "") {}

  static readonly regex: RegExp;

  static parse(parser: MatchParser): Block | null {
    const match = parser.match(Block.regex);
    if (!match || typeof match === "number") {
      return null;
    }
    parser.advance(match);
    return new this(match[0]);
  }

  writeInto(stream: WritableString): void {
    stream.write(this.raw);
  }
}

export class HeaderBlock extends Block {}

export class Magic extends HeaderBlock {
  static override readonly regex =
    /^\uFEFF?WEBVTT([ \t][^\r\n]*)?(?:\r\n|[\r\n])/;
  static readonly regexTsmap = /^X-TIMESTAMP-MAP=/;
  static readonly regexTsmapLocal = /^LOCAL:/;
  static readonly regexTsmapMpegts = /^MPEGTS:([0-9]+)/;
  static readonly regexTsmapSep = /^[ \t]*,[ \t]*/;
  static readonly regexMeta =
    /^(?:(?!-->)[^\r\n])+:(?:(?!-->)[^\r\n])+(?:\r\n|[\r\n])/;

  constructor(
    readonly extra: string | undefined,
    readonly mpegts: number | undefined,
    readonly local: number | undefined,
    readonly meta: string,
  ) {
    super("");
  }

  static override parse(parser: MatchParser): Magic {
    const child = parser.child();
    const match = child.consume(Magic.regex);
    if (!match || typeof match === "number") {
      throw new ParseError(child);
    }

    const extra = match[1];
    let local: number | undefined;
    let mpegts: number | undefined;
    let meta = "";
    while (!child.consume(REGEX_NL)) {
      if (child.consume(Magic.regexTsmap)) {
        [local, mpegts] = Magic.parseTsmap(child);
        continue;
      }
      const metaMatch = child.consume(Magic.regexMeta);
      if (metaMatch && typeof metaMatch !== "number") {
        meta += metaMatch[0];
        continue;
      }
      throw new ParseError(child);
    }
    child.commit();
    return new Magic(extra, mpegts, local, meta);
  }

  override writeInto(stream: WritableString): void {
    stream.write("WEBVTT");
    if (this.extra !== undefined) {
      stream.write(this.extra);
    }
    stream.write("\n");
    if (this.local || this.mpegts) {
      stream.write("X-TIMESTAMP-MAP=LOCAL:");
      stream.write(formatTs(this.local ?? 0));
      stream.write(",MPEGTS:");
      stream.write(String(this.mpegts ?? 0));
      stream.write("\n");
    }
    if (this.meta) {
      stream.write(this.meta);
    }
    stream.write("\n");
  }

  private static parseTsmap(
    parser: MatchParser,
  ): [number | undefined, number | undefined] {
    const child = parser.child();
    let local: number | undefined;
    let mpegts: number | undefined;

    while (true) {
      if (child.consume(Magic.regexTsmapLocal)) {
        const match = child.consume(REGEX_TS);
        if (!match || typeof match === "number") {
          throw new ParseError(child);
        }
        local = parseTs(match);
      } else {
        const match = child.consume(Magic.regexTsmapMpegts);
        if (!match || typeof match === "number") {
          throw new ParseError(child);
        }
        mpegts = Number.parseInt(match[1] ?? "", 10);
        if (!Number.isFinite(mpegts)) {
          throw new ParseError(child);
        }
      }
      if (child.consume(Magic.regexTsmapSep)) {
        continue;
      }
      if (child.consume(REGEX_NL)) {
        break;
      }
      throw new ParseError(child);
    }

    child.commit();
    return [local, mpegts];
  }
}

export class StyleBlock extends HeaderBlock {
  static override readonly regex =
    /^STYLE[ \t]*(?:\r\n|[\r\n])((?:(?!-->)[^\r\n])+(?:\r\n|[\r\n]))*(?:\r\n|[\r\n])/;
}

export class RegionBlock extends HeaderBlock {
  static override readonly regex =
    /^REGION[ \t]*((?:(?!-->)[^\r\n])+(?:\r\n|[\r\n]))*(?:\r\n|[\r\n])/;
}

export class CommentBlock extends Block {
  static override readonly regex =
    /^NOTE(?:\r\n|[ \t\r\n])((?:(?!-->)[^\r\n])+(?:\r\n|[\r\n]))*(?:\r\n|[\r\n])/;
}

export interface CueJson {
  id: string | undefined;
  start: number;
  end: number;
  text: string;
  settings: string | undefined;
}

export class CueBlock extends Block {
  static readonly regexId = /^((?:(?!-->)[^\r\n])+)(?:\r\n|[\r\n])/;
  static readonly regexArrow = /^[ \t]+-->[ \t]+/;
  static readonly regexSettings = /^[ \t]+((?:(?!-->)[^\r\n])+)/;
  static readonly regexPayload = /^[^\r\n]+(?:\r\n|[\r\n])?/;

  constructor(
    readonly id: string | undefined,
    readonly start: number,
    readonly end: number,
    readonly settings: string | undefined,
    readonly text: string,
  ) {
    super("");
  }

  static override parse(parser: MatchParser): CueBlock | null {
    const child = parser.child();
    let id: string | undefined;
    const idMatch = child.consume(CueBlock.regexId);
    if (idMatch && typeof idMatch !== "number") {
      id = idMatch[1];
    }

    const startMatch = child.consume(REGEX_TS);
    if (
      !startMatch ||
      typeof startMatch === "number" ||
      !child.consume(CueBlock.regexArrow)
    ) {
      return null;
    }
    const endMatch = child.consume(REGEX_TS);
    if (!endMatch || typeof endMatch === "number") {
      return null;
    }
    const settingsMatch = child.consume(CueBlock.regexSettings);
    child.consume(REGEX_OPTIONAL_WHITESPACE);
    if (!child.consume(REGEX_NL)) {
      return null;
    }

    const writer = new StringWriter();
    while (true) {
      const payload = child.consume(CueBlock.regexPayload);
      if (!payload || typeof payload === "number") {
        break;
      }
      writer.write(payload[0]);
    }

    child.commit();
    return new CueBlock(
      id,
      parseTs(startMatch),
      parseTs(endMatch),
      settingsMatch && typeof settingsMatch !== "number"
        ? settingsMatch[1]
        : undefined,
      writer.toString(),
    );
  }

  override writeInto(stream: WritableString): void {
    if (this.id !== undefined) {
      stream.write(this.id);
      stream.write("\n");
    }
    stream.write(formatTs(this.start));
    stream.write(" --> ");
    stream.write(formatTs(this.end));
    if (this.settings !== undefined) {
      stream.write(" ");
      stream.write(this.settings);
    }
    stream.write("\n");
    stream.write(this.text);
    stream.write("\n");
  }

  get asJson(): CueJson {
    return {
      id: this.id,
      start: this.start,
      end: this.end,
      text: this.text,
      settings: this.settings,
    };
  }

  static fromJson(json: CueJson): CueBlock {
    return new CueBlock(
      json.id,
      json.start,
      json.end,
      json.settings,
      json.text,
    );
  }

  equals(other: CueBlock): boolean {
    return JSON.stringify(this.asJson) === JSON.stringify(other.asJson);
  }

  hinges(other: CueBlock): boolean {
    return (
      this.text === other.text &&
      this.settings === other.settings &&
      this.start <= this.end &&
      this.end === other.start &&
      other.start <= other.end
    );
  }
}

export function* parseFragment(
  fragmentContent: Uint8Array | Buffer | string,
): Generator<Block> {
  const content =
    typeof fragmentContent === "string"
      ? fragmentContent
      : Buffer.from(fragmentContent).toString();
  const parser = new MatchParser(content);

  yield Magic.parse(parser);

  while (!parser.isEof()) {
    if (parser.consume(REGEX_BLANK)) {
      continue;
    }
    const block =
      RegionBlock.parse(parser) ??
      StyleBlock.parse(parser) ??
      CommentBlock.parse(parser);
    if (block) {
      yield block;
      continue;
    }
    break;
  }

  while (!parser.isEof()) {
    if (parser.consume(REGEX_BLANK)) {
      continue;
    }
    const block = CommentBlock.parse(parser) ?? CueBlock.parse(parser);
    if (block) {
      yield block;
      continue;
    }
    throw new ParseError(parser);
  }
}

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

function pad3(value: number): string {
  return value.toString().padStart(3, "0");
}
