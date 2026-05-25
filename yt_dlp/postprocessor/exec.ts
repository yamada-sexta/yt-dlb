// Source: yt_dlp/postprocessor/exec.py
// Port note: user commands are executed with Bun Shell instead of Python subprocess.

import { $ } from "bun";

import { PostProcessingError, variadic } from "../utils/utils.ts";
import { PostProcessor, type PostProcessorInfo } from "./common.ts";

export class ExecPP extends PostProcessor {
  readonly execCmd: string[];

  constructor(
    downloader: ConstructorParameters<typeof PostProcessor>[0],
    execCmd: string | readonly string[],
  ) {
    super(downloader);
    this.execCmd = variadic(execCmd).map(String);
  }

  parseCmd(cmd: string, info: PostProcessorInfo): string {
    const filepath =
      typeof info.filepath === "string"
        ? info.filepath
        : typeof info._filename === "string"
          ? info._filename
          : null;
    if (!filepath) {
      return cmd;
    }
    const command = cmd.includes("{}") ? cmd : `${cmd} {}`;
    return command.replaceAll("{}", shellQuote(filepath));
  }

  override async run(
    info: PostProcessorInfo,
  ): Promise<[string[], PostProcessorInfo]> {
    for (const template of this.execCmd) {
      const cmd = this.parseCmd(template, info);
      this.toScreen(`Executing command: ${cmd}`);
      const output = await $`${{ raw: cmd }}`.nothrow().quiet();
      if (output.exitCode !== 0) {
        throw new PostProcessingError(
          `Command returned error code ${output.exitCode}`,
        );
      }
    }
    return [[], info];
  }
}

export class ExecAfterDownloadPP extends ExecPP {}

function shellQuote(value: string): string {
  return /^[\w./:=+-]+$/.test(value)
    ? value
    : `'${value.replaceAll("'", "'\\''")}'`;
}
