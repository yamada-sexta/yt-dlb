// Source: yt_dlp/extractor/youtube/jsc/_builtin/deno.py
// Port note: ytdlb solves YouTube JS challenges in-process with Bun/ejs; spawning Deno is unsupported.

import { NotImplementedError } from "../../../../errors.ts";
import { EJSBaseJCP, type Script } from "./ejs.ts";
import { JsChallengeProvider, registerPreference, registerProvider } from "../provider.ts";
import type { JsChallengeRequest } from "../provider.ts";

type EjsInput = Parameters<EJSBaseJCP["runJsRuntime"]>[2];

export class DenoJCP extends EJSBaseJCP {
  static override readonly providerName = "deno";
  protected override readonly jsRuntimeName = "deno";

  protected override async runJsRuntime(_lib: Script, _core: Script, _input: EjsInput): Promise<unknown> {
    throw new NotImplementedError("Deno JS challenge runtime; use BunJCP");
  }
}

registerProvider(DenoJCP);
registerPreference((provider: JsChallengeProvider, _requests: readonly JsChallengeRequest[]) => (
  provider instanceof DenoJCP ? -1000 : 0
));
