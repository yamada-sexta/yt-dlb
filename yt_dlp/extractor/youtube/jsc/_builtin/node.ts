// Source: yt_dlp/extractor/youtube/jsc/_builtin/node.py
// Port note: ytdlb solves YouTube JS challenges in-process with Bun/ejs; spawning Node is unsupported.

import { NotImplementedError } from "../../../../errors.ts";
import { EJSBaseJCP, type Script } from "./ejs.ts";
import { JsChallengeProvider, registerPreference, registerProvider } from "../provider.ts";
import type { JsChallengeRequest } from "../provider.ts";

type EjsInput = Parameters<EJSBaseJCP["runJsRuntime"]>[2];

export class NodeJCP extends EJSBaseJCP {
  static override readonly providerName = "node";
  protected override readonly jsRuntimeName = "node";

  protected override async runJsRuntime(_lib: Script, _core: Script, _input: EjsInput): Promise<unknown> {
    throw new NotImplementedError("Node JS challenge runtime; use BunJCP");
  }
}

registerProvider(NodeJCP);
registerPreference((provider: JsChallengeProvider, _requests: readonly JsChallengeRequest[]) => (
  provider instanceof NodeJCP ? -1000 : 0
));
