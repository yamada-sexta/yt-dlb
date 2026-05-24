// Source: yt_dlp/postprocessor/metadataparser.py
// Port note: Python template parsing is delegated to downloader.evaluateOuttmpl when present;
// otherwise ytdlb supports the simple %(field)s forms used by metadata parser actions.

import { PostProcessor, type PostProcessorInfo } from "./common.ts";

type MetadataActionKind = "interpret" | "replace";
type MetadataActionSpec = readonly [MetadataActionKind, string, string] | readonly [MetadataActionKind, string, string, string];
type MetadataAction = (info: PostProcessorInfo) => void;

export class MetadataParserPP extends PostProcessor {
  static readonly Actions = {
    INTERPRET: "interpret",
    REPLACE: "replace",
  } as const;

  private readonly actions: MetadataAction[];

  constructor(downloader: ConstructorParameters<typeof PostProcessor>[0] = null, actions: readonly MetadataActionSpec[] = []) {
    super(downloader);
    this.actions = actions.map((action) => this.buildAction(action));
  }

  static validateAction(action: MetadataActionKind, ...data: readonly string[]): void {
    if (!Object.values(MetadataParserPP.Actions).includes(action)) {
      throw new Error(`${action} is not a valid action`);
    }
    if (action === MetadataParserPP.Actions.INTERPRET && data.length !== 2) {
      throw new Error("interpret metadata action requires FROM and TO");
    }
    if (action === MetadataParserPP.Actions.REPLACE && data.length !== 3) {
      throw new Error("replace metadata action requires FIELD, SEARCH, and REPLACE");
    }
  }

  static fieldToTemplate(template: string): string {
    return /^[a-zA-Z_]+$/.test(template) ? `%(${template})s` : template;
  }

  static formatToRegex(format: string): string {
    if (/^\w+$/.test(format)) {
      return `(?<${format}>.+)`;
    }
    if (!/%\(\w+\)s/.test(format)) {
      return format;
    }
    let lastPosition = 0;
    let regex = "";
    for (const match of format.matchAll(/%\((\w+)\)s/g)) {
      regex += RegExp.escape(format.slice(lastPosition, match.index));
      regex += `(?<${match[1]}>.+)`;
      lastPosition = match.index + match[0].length;
    }
    if (lastPosition < format.length) {
      regex += RegExp.escape(format.slice(lastPosition));
    }
    return regex;
  }

  override async run(info: PostProcessorInfo): Promise<[string[], PostProcessorInfo]> {
    for (const action of this.actions) {
      action(info);
    }
    return [[], info];
  }

  protected buildAction(action: MetadataActionSpec): MetadataAction {
    const [kind, ...data] = action;
    if (kind === MetadataParserPP.Actions.INTERPRET) {
      return this.interpreter(data[0] ?? "", data[1] ?? "");
    }
    return this.replacer(data[0] ?? "", data[1] ?? "", data[2] ?? "");
  }

  protected interpreter(input: string, output: string): MetadataAction {
    const template = MetadataParserPP.fieldToTemplate(input);
    const outputRegex = new RegExp(MetadataParserPP.formatToRegex(output), "s");
    return (info) => {
      const dataToParse = this.evaluateOuttmpl(template, info);
      this.writeDebug(`Searching for ${outputRegex.source} in ${template}`);
      const match = outputRegex.exec(dataToParse);
      if (!match?.groups) {
        this.toScreen(`Could not interpret ${input} as ${output}`);
        return;
      }
      for (const [attribute, value] of Object.entries(match.groups)) {
        if (value === undefined) {
          continue;
        }
        info[attribute] = value;
        this.toScreen(`Parsed ${attribute} from ${template}: ${value}`);
      }
    };
  }

  protected replacer(field: string, search: string, replace: string): MetadataAction {
    const searchRegex = new RegExp(search, "g");
    const replacement = pythonRegexReplacementToJs(replace);
    return (info) => {
      const value = info[field];
      if (value === undefined || value === null) {
        this.toScreen(`Video does not have a ${field}`);
        return;
      }
      if (typeof value !== "string") {
        this.reportWarning(`Cannot replace in field ${field} since it is a ${typeof value}`);
        return;
      }
      this.writeDebug(`Replacing all ${search} in ${field} with ${replace}`);
      const matches = [...value.matchAll(searchRegex)].length;
      info[field] = value.replace(searchRegex, replacement);
      this.toScreen(matches ? `Changed ${field} to: ${info[field]}` : `Did not find ${search} in ${field}`);
    };
  }

  private evaluateOuttmpl(template: string, info: PostProcessorInfo): string {
    const downloader = this.downloader as unknown;
    if (isRecord(downloader)) {
      const evaluator = downloader.evaluateOuttmpl ?? downloader.evaluate_outtmpl;
      if (typeof evaluator === "function") {
        const evaluated: unknown = evaluator.call(downloader, template, info);
        if (typeof evaluated === "string") {
          return evaluated;
        }
      }
    }
    // Logic note: full YoutubeDL outtmpl validation is not ported; this preserves simple metadata field interpolation.
    return template.replaceAll(/%\((\w+)\)s/g, (_match, key: string) => String(info[key] ?? ""));
  }
}

export class MetadataFromFieldPP extends MetadataParserPP {
  static toAction(format: string): MetadataActionSpec {
    const match = /(?<input>.*?)(?<!\\):(?<output>.+)$/s.exec(format);
    if (!match?.groups) {
      throw new Error(`it should be FROM:TO, not ${format}`);
    }
    const input = match.groups.input;
    const output = match.groups.output;
    if (input === undefined || output === undefined) {
      throw new Error(`it should be FROM:TO, not ${format}`);
    }
    return [
      MetadataParserPP.Actions.INTERPRET,
      input.replaceAll("\\:", ":"),
      output,
    ];
  }

  constructor(downloader: ConstructorParameters<typeof PostProcessor>[0] = null, formats: readonly string[] = []) {
    super(downloader, formats.map((format) => MetadataFromFieldPP.toAction(format)));
  }
}

export class MetadataFromTitlePP extends MetadataParserPP {
  constructor(downloader: ConstructorParameters<typeof PostProcessor>[0] = null, titleformat = "%(title)s") {
    super(downloader, [[MetadataParserPP.Actions.INTERPRET, "title", titleformat]]);
    this.reportWarning("yt_dlp.postprocessor.MetadataFromTitlePP is deprecated and may be removed in a future version. Use yt_dlp.postprocessor.MetadataFromFieldPP instead");
  }
}

function pythonRegexReplacementToJs(replacement: string): string {
  return replacement
    .replaceAll(/\\g<([^>]+)>/g, (_match, name: string) => `$<${name}>`)
    .replaceAll(/\\([1-9]\d*)/g, (_match, index: string) => `$${index}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
