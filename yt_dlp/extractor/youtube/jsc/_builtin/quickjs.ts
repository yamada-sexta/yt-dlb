// Source: yt_dlp/extractor/youtube/jsc/_builtin/quickjs.py
// Port note: ytdlb solves YouTube JS challenges in-process with Bun/ejs; spawning QuickJS is unsupported.

import { NotImplementedError } from "../../../../errors.ts";
import { EJSBaseJCP, type Script } from "./ejs.ts";
import { JsChallengeProvider, registerPreference, registerProvider } from "../provider.ts";
import type { JsChallengeRequest } from "../provider.ts";

type EjsInput = Parameters<EJSBaseJCP["runJsRuntime"]>[2];

export class QuickJSJCP extends EJSBaseJCP {
  static override readonly providerName = "quickjs";
  protected override readonly jsRuntimeName = "quickjs";

  protected override async runJsRuntime(_lib: Script, _core: Script, _input: EjsInput): Promise<unknown> {
    throw new NotImplementedError("QuickJS challenge runtime; use BunJCP");
  }
}

registerProvider(QuickJSJCP);
registerPreference((provider: JsChallengeProvider, _requests: readonly JsChallengeRequest[]) => (
  provider instanceof QuickJSJCP ? -1000 : 0
));
