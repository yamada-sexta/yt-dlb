// Source: yt_dlp/utils/_deprecated.py

import { createHmac } from "node:crypto";

export function bytesToIntlist(
  bs: Uint8Array | Buffer | string | null | undefined,
): number[] {
  if (!bs) {
    return [];
  }
  if (typeof bs === "string") {
    return [...bs].map((char) => char.charCodeAt(0));
  }
  return [...bs];
}

export const bytes_to_intlist = bytesToIntlist;

export function intlistToBytes(
  xs: Iterable<number> | null | undefined,
): Uint8Array {
  if (!xs) {
    return new Uint8Array();
  }
  return Uint8Array.from(xs);
}

export const intlist_to_bytes = intlistToBytes;

function base64EncodeUrlUnsafe(data: string | Uint8Array): string {
  return Buffer.from(data).toString("base64");
}

export function jwtEncodeHs256(
  payloadData: Record<string, unknown>,
  key: string,
  headers: Record<string, unknown> = {},
): Uint8Array {
  const headerData = {
    alg: "HS256",
    typ: "JWT",
    ...headers,
  };
  const headerB64 = base64EncodeUrlUnsafe(JSON.stringify(headerData));
  const payloadB64 = base64EncodeUrlUnsafe(JSON.stringify(payloadData));
  const signingInput = `${headerB64}.${payloadB64}`;
  const signatureB64 = createHmac("sha256", key)
    .update(signingInput)
    .digest("base64");
  return Buffer.from(`${signingInput}.${signatureB64}`);
}

export const jwt_encode_hs256 = jwtEncodeHs256;

export const compiledRegexType = RegExp;
export const compiled_regex_type = compiledRegexType;
