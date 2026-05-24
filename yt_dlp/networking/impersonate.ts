// Source: yt_dlp/networking/impersonate.py
// Port note: target validation is ported; actual browser impersonation requires a handler backend.

import { UnsupportedRequest } from "./exceptions.ts";
import { Request, RequestHandler, registerPreference } from "./common.ts";

export class ImpersonateTarget {
  constructor(
    readonly client: string | null = null,
    readonly version: string | null = null,
    readonly os: string | null = null,
    readonly osVersion: string | null = null,
  ) {
    if (version && !client) {
      throw new Error("client is required if version is set");
    }
    if (osVersion && !os) {
      throw new Error("os is required if osVersion is set");
    }
  }

  static fromString(target: string): ImpersonateTarget {
    const match = /^(?:(?<client>[^:-]+)(?:-(?<version>[^:-]+))?)?(?::(?:(?<os>[^:-]+)(?:-(?<osVersion>[^:-]+))?)?)?$/.exec(target);
    if (!match?.groups) {
      throw new Error(`Invalid impersonate target "${target}"`);
    }
    return new ImpersonateTarget(
      match.groups.client ?? null,
      match.groups.version ?? null,
      match.groups.os ?? null,
      match.groups.osVersion ?? null,
    );
  }

  contains(target: ImpersonateTarget): boolean {
    return (this.client === null || target.client === null || this.client === target.client)
      && (this.version === null || target.version === null || this.version === target.version)
      && (this.os === null || target.os === null || this.os === target.os)
      && (this.osVersion === null || target.osVersion === null || this.osVersion === target.osVersion);
  }

  toString(): string {
    const client = [this.client, this.version].filter(Boolean).join("-");
    const os = [this.os, this.osVersion].filter(Boolean).join("-");
    return `${client}${os ? `:${os}` : ""}`.replace(/:$/, "");
  }
}

export abstract class ImpersonateRequestHandler extends RequestHandler {
  static readonly SUPPORTED_IMPERSONATE_TARGETS: readonly ImpersonateTarget[] = [];

  constructor(options: ConstructorParameters<typeof RequestHandler>[0] & { impersonate?: ImpersonateTarget | null } = {}) {
    super(options);
    this.impersonate = options.impersonate ?? null;
  }

  readonly impersonate: ImpersonateTarget | null;

  override validate(request: Request): void {
    super.validate(request);
    const target = request.extensions.impersonate instanceof ImpersonateTarget
      ? request.extensions.impersonate
      : this.impersonate;
    if (target && !this.isSupportedTarget(target)) {
      throw new UnsupportedRequest(`Unsupported impersonate target: ${target}`, { handler: this });
    }
  }

  protected isSupportedTarget(target: ImpersonateTarget): boolean {
    const supported = (this.constructor as typeof ImpersonateRequestHandler).SUPPORTED_IMPERSONATE_TARGETS;
    return !supported.length || supported.some((item) => item.contains(target));
  }
}

export const impersonatePreference = registerPreference(ImpersonateRequestHandler)((handler, request) => (
  request.extensions.impersonate || handler instanceof ImpersonateRequestHandler && handler.impersonate ? 1000 : 0
));
