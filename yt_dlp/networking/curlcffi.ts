// Source: yt_dlp/networking/_curlcffi.py
// Port note: curl_cffi browser impersonation is not a Bun dependency; unsupported paths throw explicitly.

import { NotImplementedError } from "../errors.ts";
import { type Request, RequestHandler } from "./common.ts";

export class CurlCFFIRH extends RequestHandler {
  static override readonly SUPPORTED_URL_SCHEMES = ["http", "https"];

  protected override async doSend(_request: Request): Promise<Response> {
    throw new NotImplementedError("curl_cffi networking backend");
  }
}
