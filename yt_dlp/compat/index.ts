// Source: yt_dlp/compat/__init__.py
// Port note: Python compatibility shims are reduced to Bun/Web equivalents used by the TypeScript rewrite.

import { homedir } from "node:os";
import { NotImplementedError } from "../errors.ts";

export class compat_HTMLParseError extends Error {}

export function compatOrd(value: string | number): number {
  return typeof value === "number" ? value : value.codePointAt(0) ?? 0;
}

export function compatDatetimeFromTimestamp(timestamp: number): Date {
  return new Date(timestamp * 1000);
}

export function compatExpanduser(path: string): string {
  if (path === "~") {
    return process.env.HOME ?? homedir();
  }
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return `${process.env.HOME ?? homedir()}${path.slice(1)}`;
  }
  return path;
}

export function compatEtreeFromstring(_text: string): never {
  throw new NotImplementedError("compat_etree_fromstring XML parsing");
}

export function urllibReqToReq(request: Request): Request {
  return request;
}

export const compat_ord = compatOrd;
export const compat_datetime_from_timestamp = compatDatetimeFromTimestamp;
export const compat_expanduser = compatExpanduser;
export const compat_etree_fromstring = compatEtreeFromstring;
export const urllib_req_to_req = urllibReqToReq;
