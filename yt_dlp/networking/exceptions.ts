// Source: yt_dlp/networking/exceptions.py

export class RequestError extends Error {
  readonly causeValue: Error | string | null;
  readonly handler: unknown;

  constructor(message?: string | null, options: { cause?: Error | string | null; handler?: unknown } = {}) {
    super(message ?? (options.cause ? String(options.cause) : ""));
    this.name = "RequestError";
    this.causeValue = options.cause ?? null;
    this.handler = options.handler;
  }
}

export class UnsupportedRequest extends RequestError {
  override name = "UnsupportedRequest";
}

export class NoSupportingHandlers extends RequestError {
  readonly unsupportedErrors: UnsupportedRequest[];
  readonly unexpectedErrors: Error[];

  constructor(unsupportedErrors: UnsupportedRequest[] = [], unexpectedErrors: Error[] = []) {
    const messages = new Map<string, string[]>();
    for (const error of unsupportedErrors) {
      const handlerName = handlerNameOf(error.handler);
      const list = messages.get(error.message) ?? [];
      list.push(handlerName);
      messages.set(error.message, list);
    }
    const reason = [...messages].map(([message, handlers]) => `${message} (${handlers.join(", ")})`);
    if (unexpectedErrors.length) {
      reason.push(`${unexpectedErrors.length} unexpected error(s)`);
    }
    super(`Unable to handle request${reason.length ? `: ${reason.join(" + ")}` : ""}`);
    this.name = "NoSupportingHandlers";
    this.unsupportedErrors = unsupportedErrors;
    this.unexpectedErrors = unexpectedErrors;
  }
}

export class TransportError extends RequestError {
  override name = "TransportError";
}

export class HTTPError extends RequestError {
  readonly response: Response;
  readonly status: number;
  readonly reason: string;
  readonly redirectLoop: boolean;

  constructor(response: Response, redirectLoop = false) {
    const reason = response.statusText || "Unknown";
    super(`HTTP Error ${response.status}: ${reason}${redirectLoop ? " (redirect loop detected)" : ""}`);
    this.name = "HTTPError";
    this.response = response;
    this.status = response.status;
    this.reason = reason;
    this.redirectLoop = redirectLoop;
  }

  close(): void {
    void this.response.body?.cancel();
  }
}

export class IncompleteRead extends TransportError {
  readonly partial: number;
  readonly expected: number | null;

  constructor(partial: number, expected: number | null = null) {
    super(`${partial} bytes read${expected !== null ? `, ${expected} more expected` : ""}`);
    this.name = "IncompleteRead";
    this.partial = partial;
    this.expected = expected;
  }
}

export class SSLError extends TransportError {
  override name = "SSLError";
}

export class CertificateVerifyError extends SSLError {
  override name = "CertificateVerifyError";
}

export class ProxyError extends TransportError {
  override name = "ProxyError";
}

export const networkExceptions = [HTTPError, TransportError] as const;
export const network_exceptions = networkExceptions;

function handlerNameOf(handler: unknown): string {
  if (handler && typeof handler === "object" && "RH_NAME" in handler && typeof handler.RH_NAME === "string") {
    return handler.RH_NAME;
  }
  return "unknown";
}
