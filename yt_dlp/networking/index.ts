// Source: yt_dlp/networking/__init__.py
// Port note: Bun's Web Request/Response are the canonical networking primitives for ytdlb.

export { HTTPError, IncompleteRead, RequestError, TransportError, networkExceptions, network_exceptions } from "./exceptions.ts";

export const Request = globalThis.Request;
export const Response = globalThis.Response;
export const Headers = globalThis.Headers;

type RequestInput = string | URL | globalThis.Request;

export class HEADRequest extends globalThis.Request {
  constructor(input: RequestInput, init: RequestInit = {}) {
    super(toRequest(input, init, "HEAD"));
  }
}

export class PUTRequest extends globalThis.Request {
  constructor(input: RequestInput, init: RequestInit = {}) {
    super(toRequest(input, init, "PUT"));
  }
}

export class PATCHRequest extends globalThis.Request {
  constructor(input: RequestInput, init: RequestInit = {}) {
    super(toRequest(input, init, "PATCH"));
  }
}

function toRequest(input: RequestInput, init: RequestInit, method: string): globalThis.Request {
  if (input instanceof globalThis.Request) {
    return new globalThis.Request(input, { ...init, method });
  }
  return new globalThis.Request(input.toString(), { ...init, method });
}
