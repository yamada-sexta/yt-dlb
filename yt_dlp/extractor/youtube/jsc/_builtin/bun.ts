// Source: yt_dlp/extractor/youtube/jsc/_builtin/bun.py
// Port note: ytdlb runs inside Bun, so this provider evaluates the solver in-process instead of spawning `bun run -`.

import {
  EJSBaseJCP,
  EJS_WIKI_URL,
  ScriptSource,
  ScriptType,
  ScriptVariant,
} from "./ejs.ts";
import type { Script } from "./ejs.ts";
import { loadScript } from "./vendor/index.ts";
import {
  type JsChallengeProvider,
  registerPreference,
  registerProvider,
} from "../provider.ts";
import type { JsChallengeRequest } from "../provider.ts";

type EjsInput = Parameters<EJSBaseJCP["runJsRuntime"]>[2];
type SolverFunction = (input: EjsInput) => unknown;

export class BunJCP extends EJSBaseJCP {
  static override readonly providerName = "bun";

  protected override readonly jsRuntimeName = "bun";
  protected readonly bunNpmLibFilename = "yt.solver.bun.lib.js";

  protected override iterScriptSources(): Array<
    (
      scriptType: ScriptType,
    ) => Promise<Script | { component: string; runtime: string } | null>
  > {
    return [
      ...super.iterScriptSources(),
      (scriptType) => this.bunNpmSource(scriptType),
    ];
  }

  protected async bunNpmSource(
    scriptType: ScriptType,
  ): Promise<Script | { component: string; runtime: string } | null> {
    if (scriptType !== ScriptType.LIB) {
      return null;
    }
    if (!this.host.remoteComponents?.includes("ejs:npm")) {
      return this.skipComponent("ejs:npm");
    }
    const unsupportedProxy = this.checkEnvProxies(process.env);
    if (unsupportedProxy) {
      this.host.reportWarning?.(
        `Bun NPM package downloads only support HTTP/HTTPS proxies; skipping remote NPM package downloads. ` +
          `Use another distribution of the challenge solver script or another JS runtime that supports "${unsupportedProxy}" proxies. ` +
          `For more information and alternatives, refer to ${EJS_WIKI_URL}`,
      );
      return null;
    }
    const code = await loadScript(this.bunNpmLibFilename, (error) => {
      this.host.reportWarning?.(
        `Failed to read bun challenge solver lib script: ${error.message}`,
      );
    });
    return code
      ? {
          type: scriptType,
          variant: ScriptVariant.BUN_NPM,
          source: ScriptSource.BUILTIN,
          version: this.scriptVersion,
          code,
        }
      : null;
  }

  protected override async runJsRuntime(
    lib: Script,
    core: Script,
    input: EjsInput,
  ): Promise<unknown> {
    const solver = await this.compileSolver(lib, core);
    return solver(input);
  }

  private async compileSolver(
    lib: Script,
    core: Script,
  ): Promise<SolverFunction> {
    const modules = await this.loadLibModules(lib);
    const factory = new Function(
      "meriyah",
      "astring",
      `${core.code}\nreturn jsc;`,
    );
    const solver = factory(modules.meriyah, modules.astring);
    if (typeof solver !== "function") {
      throw new Error("EJS core script did not produce a solver function");
    }
    return solver as SolverFunction;
  }

  private async loadLibModules(
    _lib: Script,
  ): Promise<{ meriyah: unknown; astring: unknown }> {
    // Logic change: the TypeScript runtime imports normal JS dependencies directly. The Python
    // provider had to synthesize a script for another runtime; ytdlb is already running on Bun.
    const [meriyah, astring] = await Promise.all([
      import("meriyah"),
      import("astring"),
    ]);
    return { meriyah, astring };
  }

  private checkEnvProxies(env: NodeJS.ProcessEnv): string | null {
    for (const key of ["HTTP_PROXY", "HTTPS_PROXY"] as const) {
      const proxy = env[key];
      if (!proxy) {
        continue;
      }
      const scheme = URL.canParse(proxy)
        ? new URL(proxy).protocol.replace(/:$/, "").toLowerCase()
        : "";
      if (scheme && !["http", "https"].includes(scheme)) {
        return scheme;
      }
    }
    return null;
  }
}

registerProvider(BunJCP);
registerPreference(
  (provider: JsChallengeProvider, _requests: readonly JsChallengeRequest[]) =>
    provider instanceof BunJCP ? 800 : 0,
);
