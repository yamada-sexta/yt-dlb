// Source: yt_dlp/extractor/youtube/jsc/provider.py

export enum JsChallengeType {
  N = "n",
  SIG = "sig",
}

export interface NChallengeInput {
  playerUrl: string;
  challenges: readonly string[];
}

export interface SigChallengeInput {
  playerUrl: string;
  challenges: readonly string[];
}

export interface NChallengeOutput {
  results: Record<string, string>;
}

export interface SigChallengeOutput {
  results: Record<string, string>;
}

export interface JsChallengeRequest {
  type: JsChallengeType;
  input: NChallengeInput | SigChallengeInput;
  videoId?: string;
}

export interface JsChallengeResponse {
  type: JsChallengeType;
  output: NChallengeOutput | SigChallengeOutput;
}

export interface JsChallengeProviderResponse {
  request: JsChallengeRequest;
  response?: JsChallengeResponse;
  error?: Error;
}

export class JsChallengeProviderRejectedRequest extends Error {
  readonly expected: boolean;
  readonly skippedComponents?: readonly unknown[];

  constructor(message = "JS challenge provider rejected request", expected = false, skippedComponents?: readonly unknown[]) {
    super(message);
    this.expected = expected;
    this.skippedComponents = skippedComponents;
  }
}

export class JsChallengeProviderError extends Error {
  readonly expected: boolean;

  constructor(message = "JS challenge provider error", expected = false) {
    super(message);
    this.expected = expected;
  }
}

export interface JsChallengeProviderHost {
  loadPlayer(videoId: string | undefined, playerUrl: string): Promise<string>;
}

export abstract class JsChallengeProvider {
  static readonly providerName: string;
  protected supportedTypes: readonly JsChallengeType[] | null = [];

  constructor(readonly host: JsChallengeProviderHost) {}

  get providerName(): string {
    return (this.constructor as typeof JsChallengeProvider).providerName;
  }

  abstract isAvailable(): boolean;

  async bulkSolve(requests: readonly JsChallengeRequest[]): Promise<JsChallengeProviderResponse[]> {
    const validated: JsChallengeRequest[] = [];
    const rejected: JsChallengeProviderResponse[] = [];
    for (const request of requests) {
      try {
        this.validateRequest(request);
        validated.push(request);
      } catch (error) {
        rejected.push({ request, error: error instanceof Error ? error : new Error(String(error)) });
      }
    }
    return [...rejected, ...(await this.realBulkSolve(validated))];
  }

  protected abstract realBulkSolve(requests: readonly JsChallengeRequest[]): Promise<JsChallengeProviderResponse[]>;

  protected validateRequest(request: JsChallengeRequest): void {
    if (!this.isAvailable()) {
      throw new JsChallengeProviderRejectedRequest(`${this.providerName} is not available`);
    }
    if (this.supportedTypes !== null && !this.supportedTypes.includes(request.type)) {
      throw new JsChallengeProviderRejectedRequest(`JS Challenge type "${request.type}" is not supported by ${this.providerName}`);
    }
  }

  protected async getPlayer(videoId: string | undefined, playerUrl: string): Promise<string> {
    try {
      return await this.host.loadPlayer(videoId, playerUrl);
    } catch (error) {
      throw new JsChallengeProviderError(`Failed to load player for JS challenge: ${error}`);
    }
  }
}

export type JsChallengePreference = (
  provider: JsChallengeProvider,
  requests: readonly JsChallengeRequest[],
) => number;

export const jscProviders = new Map<string, new (host: JsChallengeProviderHost) => JsChallengeProvider>();
export const jscPreferences = new Set<JsChallengePreference>();

export function registerProvider<T extends new (host: JsChallengeProviderHost) => JsChallengeProvider>(provider: T): T {
  const name = provider.providerName;
  if (jscProviders.has(name)) {
    throw new Error(`JsChallengeProvider ${name} already registered`);
  }
  jscProviders.set(name, provider);
  return provider;
}

export function registerPreference(preference: JsChallengePreference): JsChallengePreference {
  jscPreferences.add(preference);
  return preference;
}
