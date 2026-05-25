// Source: yt_dlp/extractor/youtube/jsc/_director.py

import {
  type JsChallengeProvider,
  JsChallengeProviderError,
  JsChallengeProviderRejectedRequest,
  JsChallengeType,
  jscPreferences,
  jscProviders,
} from "./provider.ts";
import type {
  JsChallengeProviderHost,
  JsChallengeRequest,
  JsChallengeResponse,
  NChallengeInput,
  NChallengeOutput,
  SigChallengeInput,
  SigChallengeOutput,
} from "./provider.ts";

export interface JscLogger {
  trace(message: string): void;
  warning(message: string): void;
  error(message: string, cause?: Error): void;
}

export class ConsoleJscLogger implements JscLogger {
  trace(message: string): void {
    if (process.env.YTDLB_TRACE) {
      console.debug(message);
    }
  }

  warning(message: string): void {
    console.warn(message);
  }

  error(message: string, cause?: Error): void {
    console.error(message);
    if (cause) {
      console.error(cause);
    }
  }
}

export class JsChallengeRequestDirector {
  readonly providers = new Map<string, JsChallengeProvider>();

  constructor(readonly logger: JscLogger = new ConsoleJscLogger()) {}

  registerProvider(provider: JsChallengeProvider): void {
    this.providers.set(provider.providerName, provider);
  }

  getProviders(requests: readonly JsChallengeRequest[]): JsChallengeProvider[] {
    return [...this.providers.values()]
      .sort(
        (left, right) =>
          preferenceFor(right, requests) - preferenceFor(left, requests),
      )
      .filter((provider) => provider.isAvailable());
  }

  async bulkSolve(
    requests: readonly JsChallengeRequest[],
  ): Promise<Array<[JsChallengeRequest, JsChallengeResponse]>> {
    const results: Array<[JsChallengeRequest, JsChallengeResponse]> = [];
    const nextRequests = [...requests];

    for (const provider of this.getProviders(nextRequests)) {
      if (!nextRequests.length) {
        break;
      }
      this.logger.trace(
        `Attempting to solve ${nextRequests.length} challenges using "${provider.providerName}" provider`,
      );
      try {
        const responses = await provider.bulkSolve(
          nextRequests.map((request) => ({ ...request })),
        );
        for (const response of responses) {
          if (response.error) {
            this.handleError(response.error, provider, [response.request]);
            continue;
          }
          if (!response.response) {
            continue;
          }
          const validation = validateResponse(
            response.response,
            response.request,
          );
          if (validation !== true) {
            this.logger.warning(
              `Invalid JS Challenge response received from "${provider.providerName}" provider: ${validation}`,
            );
            continue;
          }
          const index = nextRequests.indexOf(response.request);
          if (index === -1) {
            continue;
          }
          nextRequests.splice(index, 1);
          results.push([response.request, response.response]);
        }
      } catch (error) {
        this.handleError(
          error instanceof Error ? error : new Error(String(error)),
          provider,
          nextRequests,
        );
      }
    }

    if (results.length !== requests.length) {
      this.logger.trace(
        `Not all JS Challenges were solved, expected ${requests.length} responses, got ${results.length}`,
      );
    }
    return results;
  }

  private handleError(
    error: Error,
    provider: JsChallengeProvider,
    requests: readonly JsChallengeRequest[],
  ): void {
    if (error instanceof JsChallengeProviderRejectedRequest) {
      this.logger.trace(
        `JS Challenge Provider "${provider.providerName}" rejected ${requests.length} request(s): ${error.message}`,
      );
    } else if (error instanceof JsChallengeProviderError) {
      this.logger.warning(
        `Error solving ${requests.length} challenge request(s) using "${provider.providerName}" provider: ${error.message}`,
      );
    } else {
      this.logger.error(
        `Unexpected error solving ${requests.length} challenge request(s) using "${provider.providerName}" provider`,
        error,
      );
    }
  }
}

export function initializeJscDirector(
  host: JsChallengeProviderHost,
  logger?: JscLogger,
): JsChallengeRequestDirector {
  const director = new JsChallengeRequestDirector(logger);
  for (const Provider of jscProviders.values()) {
    director.registerProvider(new Provider(host));
  }
  return director;
}

export function validateResponse(
  response: JsChallengeResponse,
  request: JsChallengeRequest,
): true | string {
  return request.type === JsChallengeType.N
    ? validateNsigChallengeOutput(
        response.output as NChallengeOutput,
        request.input as NChallengeInput,
      )
    : validateSigChallengeOutput(
        response.output as SigChallengeOutput,
        request.input as SigChallengeInput,
      );
}

export function validateNsigChallengeOutput(
  output: NChallengeOutput,
  input: NChallengeInput,
): true | string {
  const keys = Object.keys(output.results);
  if (
    keys.length !== input.challenges.length ||
    !input.challenges.every((challenge) => challenge in output.results)
  ) {
    return "Invalid NChallengeOutput";
  }
  for (const [challenge, result] of Object.entries(output.results)) {
    if (result.endsWith(challenge)) {
      return `n result is invalid for ${JSON.stringify(challenge)}: ${JSON.stringify(result)}`;
    }
  }
  return true;
}

export function validateSigChallengeOutput(
  output: SigChallengeOutput,
  input: SigChallengeInput,
): true | string {
  const keys = Object.keys(output.results);
  return keys.length === input.challenges.length &&
    input.challenges.every((challenge) => challenge in output.results)
    ? true
    : "Invalid SigChallengeOutput";
}

function preferenceFor(
  provider: JsChallengeProvider,
  requests: readonly JsChallengeRequest[],
): number {
  let total = 0;
  for (const preference of jscPreferences) {
    total += preference(provider, requests);
  }
  return total;
}
