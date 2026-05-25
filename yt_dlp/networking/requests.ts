// Source: yt_dlp/networking/_requests.py
// Port note: Python requests backend is not used; Bun fetch is provided by UrllibRH.

import { NotImplementedError } from "../errors.ts";
import { type Request, RequestHandler } from "./common.ts";

export class RequestsRH extends RequestHandler {
  static override readonly SUPPORTED_URL_SCHEMES = ["http", "https"];

  protected override async doSend(_request: Request): Promise<Response> {
    throw new NotImplementedError("Python requests networking backend");
  }
}
