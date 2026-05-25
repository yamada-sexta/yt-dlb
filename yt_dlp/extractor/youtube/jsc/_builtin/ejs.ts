// Source: yt_dlp/extractor/youtube/jsc/_builtin/ejs.py

import { createHash } from "node:crypto";

import { z } from "zod";

import {
  JsChallengeProvider,
  JsChallengeProviderError,
  JsChallengeProviderRejectedRequest,
  JsChallengeType,
} from "../provider.ts";
import type {
  JsChallengeProviderHost,
  JsChallengeProviderResponse,
  JsChallengeRequest,
  JsChallengeResponse,
  NChallengeOutput,
  SigChallengeOutput,
  SkippedComponent,
} from "../provider.ts";
import { isVersionAtLeast, versionTuple } from "../../../../utils/jsruntime.ts";
import { HASHES, VERSION, loadScript } from "./vendor/index.ts";

export const EJS_WIKI_URL = "https://github.com/yt-dlp/yt-dlp/wiki/EJS";

export enum ScriptType {
  LIB = "lib",
  CORE = "core",
}

export enum ScriptVariant {
  UNKNOWN = "unknown",
  MINIFIED = "minified",
  UNMINIFIED = "unminified",
  DENO_NPM = "deno_npm",
  BUN_NPM = "bun_npm",
}

export enum ScriptSource {
  CACHE = "cache",
  WEB = "web",
  BUILTIN = "builtin",
}

export interface Script {
  type: ScriptType;
  variant: ScriptVariant;
  source: ScriptSource;
  version: string;
  code: string;
}

const CachedScriptSchema = z.object({
  variant: z.nativeEnum(ScriptVariant),
  version: z.string(),
  code: z.string(),
});

const EjsResponseDataSchema = z.union([
  z.object({ type: z.literal("error"), error: z.string() }),
  z.object({
    type: z.literal("result"),
    data: z.record(z.string(), z.string()),
  }),
]);

const EjsOutputSchema = z.union([
  z.object({ type: z.literal("error"), error: z.string() }),
  z.object({
    type: z.literal("result"),
    responses: z.array(EjsResponseDataSchema),
    preprocessed_player: z.string().optional(),
  }),
]);

type EjsInput =
  | {
      type: "player";
      player: string;
      requests: Array<{ type: JsChallengeType; challenges: readonly string[] }>;
      output_preprocessed: boolean;
    }
  | {
      type: "preprocessed";
      preprocessed_player: string;
      requests: Array<{ type: JsChallengeType; challenges: readonly string[] }>;
    };

type EjsOutput = z.infer<typeof EjsOutputSchema>;

export abstract class EJSBaseJCP extends JsChallengeProvider {
  static override readonly providerName: string = "ejs";

  protected readonly jsRuntimeName: string = "bun";
  protected override readonly supportedTypes = [
    JsChallengeType.N,
    JsChallengeType.SIG,
  ] as const;
  protected readonly cacheSection = "challenge-solver";
  protected readonly scriptVersion = VERSION;
  protected readonly repository = "yt-dlp/ejs";
  protected available = true;
  protected readonly isDev: boolean;

  #libScript?: Promise<Script>;
  #coreScript?: Promise<Script>;

  constructor(host: JsChallengeProviderHost) {
    super(host);
    this.isDev = this.ejsSetting("dev", ["false"])[0] === "true";
  }

  protected ejsSetting(
    key: string,
    defaultValue: readonly string[] = [],
  ): readonly string[] {
    return (
      this.host.settings?.[`youtube-ejs:${key}`] ??
      this.host.settings?.[key] ??
      defaultValue
    );
  }

  override isAvailable(): boolean {
    return this.available;
  }

  protected override async realBulkSolve(
    requests: readonly JsChallengeRequest[],
  ): Promise<JsChallengeProviderResponse[]> {
    const grouped = new Map<string, JsChallengeRequest[]>();
    for (const request of requests) {
      const bucket = grouped.get(request.input.playerUrl) ?? [];
      bucket.push(request);
      grouped.set(request.input.playerUrl, bucket);
    }

    const results: JsChallengeProviderResponse[] = [];
    for (const [playerUrl, groupedRequests] of grouped) {
      const cachedPlayer = await this.loadPreprocessedPlayer(playerUrl);
      const player =
        cachedPlayer ??
        (await this.getPlayer(
          groupedRequests.find((request) => request.videoId)?.videoId,
          playerUrl,
        ));
      const output = await this.runSolver(
        this.constructInput(player, cachedPlayer !== null, groupedRequests),
      );
      if (output.type === "error") {
        throw new JsChallengeProviderError(output.error);
      }
      if (output.preprocessed_player) {
        await this.storePreprocessedPlayer(
          playerUrl,
          output.preprocessed_player,
        );
      }
      groupedRequests.forEach((request, index) => {
        const responseData = output.responses[index];
        if (!responseData || responseData.type === "error") {
          results.push({
            request,
            error: new JsChallengeProviderError(
              responseData?.error ?? "Missing EJS response",
            ),
          });
          return;
        }
        const outputData: NChallengeOutput | SigChallengeOutput = {
          results: responseData.data,
        };
        results.push({
          request,
          response: {
            type: request.type,
            output: outputData,
          } satisfies JsChallengeResponse,
        });
      });
    }
    return results;
  }

  protected async runSolver(input: EjsInput): Promise<EjsOutput> {
    const lib = await this.libScript();
    const core = await this.coreScript();
    const rawOutput = await this.runJsRuntime(lib, core, input);
    return EjsOutputSchema.parse(rawOutput);
  }

  protected abstract runJsRuntime(
    lib: Script,
    core: Script,
    input: EjsInput,
  ): Promise<unknown>;

  protected async libScript(): Promise<Script> {
    this.#libScript ??= this.getScript(ScriptType.LIB);
    return this.#libScript;
  }

  protected async coreScript(): Promise<Script> {
    this.#coreScript ??= this.getScript(ScriptType.CORE);
    return this.#coreScript;
  }

  protected async getScript(scriptType: ScriptType): Promise<Script> {
    const skippedComponents: SkippedComponent[] = [];
    for (const fromSource of this.iterScriptSources()) {
      const script = await fromSource(scriptType);
      if (!script) {
        continue;
      }
      if ("component" in script) {
        skippedComponents.push(script);
        continue;
      }
      if (!this.isDev && !this.validateScript(script)) {
        continue;
      }
      this.host.writeDebug?.(
        `Using challenge solver ${script.type} script v${script.version} (source: ${script.source}, variant: ${script.variant})`,
      );
      return script;
    }
    this.available = false;
    throw new JsChallengeProviderRejectedRequest(
      `No usable challenge solver ${scriptType} script available`,
      false,
      skippedComponents.length ? skippedComponents : undefined,
    );
  }

  protected iterScriptSources(): Array<
    (scriptType: ScriptType) => Promise<Script | SkippedComponent | null>
  > {
    return [
      (scriptType) => this.cachedSource(scriptType),
      (scriptType) => this.builtinSource(scriptType),
      (scriptType) => this.webReleaseSource(scriptType),
    ];
  }

  protected async cachedSource(scriptType: ScriptType): Promise<Script | null> {
    const data = await this.host.cache?.load(this.cacheSection, scriptType);
    const parsed = CachedScriptSchema.safeParse(data);
    if (!parsed.success) {
      return null;
    }
    return { type: scriptType, source: ScriptSource.CACHE, ...parsed.data };
  }

  protected async builtinSource(
    scriptType: ScriptType,
  ): Promise<Script | null> {
    const filename =
      scriptType === ScriptType.CORE ? "yt.solver.core.js" : "yt.solver.lib.js";
    const code = await loadScript(filename, (error) => {
      this.host.reportWarning?.(
        `Failed to read builtin challenge solver ${scriptType} script: ${error.message}`,
      );
    });
    return code
      ? {
          type: scriptType,
          variant: ScriptVariant.UNMINIFIED,
          source: ScriptSource.BUILTIN,
          version: this.scriptVersion,
          code,
        }
      : null;
  }

  protected async webReleaseSource(
    scriptType: ScriptType,
  ): Promise<Script | SkippedComponent | null> {
    if (!this.host.remoteComponents?.includes("ejs:github")) {
      return this.skipComponent("ejs:github");
    }
    const filename =
      scriptType === ScriptType.CORE
        ? "yt.solver.core.min.js"
        : "yt.solver.lib.min.js";
    const url = `https://github.com/${this.repository}/releases/download/${this.scriptVersion}/${filename}`;
    const code = await this.host.downloadText?.(url);
    if (!code) {
      return null;
    }
    await this.host.cache?.store(this.cacheSection, scriptType, {
      version: this.scriptVersion,
      variant: ScriptVariant.MINIFIED,
      code,
    });
    return {
      type: scriptType,
      variant: ScriptVariant.MINIFIED,
      source: ScriptSource.WEB,
      version: this.scriptVersion,
      code,
    };
  }

  protected skipComponent(component: string): SkippedComponent {
    return { component, runtime: this.jsRuntimeName };
  }

  private validateScript(script: Script): boolean {
    if (
      !isVersionAtLeast(
        versionTuple(script.version).slice(0, 2),
        versionTuple(this.scriptVersion).slice(0, 2),
      )
    ) {
      this.host.reportWarning?.(
        `Challenge solver ${script.type} script version ${script.version} is not supported`,
      );
      return false;
    }
    const allowedHash = this.allowedHash(script);
    if (allowedHash && scriptHash(script) !== allowedHash) {
      this.host.reportWarning?.(
        `Hash mismatch on challenge solver ${script.type} script (source: ${script.source}, variant: ${script.variant})`,
      );
      return false;
    }
    return true;
  }

  private allowedHash(script: Script): string | undefined {
    if (
      script.type === ScriptType.CORE &&
      script.variant === ScriptVariant.UNMINIFIED
    ) {
      return HASHES["yt.solver.core.js"];
    }
    if (
      script.type === ScriptType.CORE &&
      script.variant === ScriptVariant.MINIFIED
    ) {
      return HASHES["yt.solver.core.min.js"];
    }
    if (
      script.type === ScriptType.LIB &&
      script.variant === ScriptVariant.BUN_NPM
    ) {
      return HASHES["yt.solver.bun.lib.js"];
    }
    if (
      script.type === ScriptType.LIB &&
      script.variant === ScriptVariant.UNMINIFIED
    ) {
      return HASHES["yt.solver.lib.js"];
    }
    if (
      script.type === ScriptType.LIB &&
      script.variant === ScriptVariant.MINIFIED
    ) {
      return HASHES["yt.solver.lib.min.js"];
    }
    return undefined;
  }

  private constructInput(
    player: string,
    preprocessed: boolean,
    requests: readonly JsChallengeRequest[],
  ): EjsInput {
    const jsonRequests = requests.map((request) => ({
      type: request.type,
      challenges: request.input.challenges,
    }));
    return preprocessed
      ? {
          type: "preprocessed",
          preprocessed_player: player,
          requests: jsonRequests,
        }
      : {
          type: "player",
          player,
          requests: jsonRequests,
          output_preprocessed: true,
        };
  }

  private async loadPreprocessedPlayer(
    playerUrl: string,
  ): Promise<string | null> {
    const data = await this.host.cache?.load(
      this.cacheSection,
      `player:${playerUrl}`,
    );
    return typeof data === "string" ? data : null;
  }

  private async storePreprocessedPlayer(
    playerUrl: string,
    player: string,
  ): Promise<void> {
    await this.host.cache?.store(
      this.cacheSection,
      `player:${playerUrl}`,
      player,
    );
  }
}

function scriptHash(script: Script): string {
  return createHash("sha3-512").update(script.code).digest("hex");
}
