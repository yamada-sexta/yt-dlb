// Source: yt_dlp/aes.py
// Port note: low-level pure-Python AES was replaced with Bun's native node:crypto compatibility.

import { createCipheriv, createDecipheriv } from "node:crypto";
import type { DecipherGCM } from "node:crypto";

export const BLOCK_SIZE_BYTES = 16;

export type PaddingMode = "pkcs7" | "iso7816" | "whitespace" | "zero";

function toBuffer(data: Uint8Array | readonly number[]): Buffer {
  return Buffer.from(data);
}

function algorithmFor(key: Uint8Array | readonly number[], mode: "cbc" | "ctr" | "ecb" | "gcm"): string {
  const bits = key.length * 8;
  if (![128, 192, 256].includes(bits)) {
    throw new Error(`Invalid AES key length: ${key.length} bytes`);
  }
  return `aes-${bits}-${mode}`;
}

export function unpadPkcs7(data: Uint8Array): Uint8Array {
  const padding = data.at(-1);
  if (!padding) {
    return data;
  }
  return data.subarray(0, data.length - padding);
}

export function pkcs7Padding(data: Uint8Array): Uint8Array {
  const remainingLength = BLOCK_SIZE_BYTES - (data.length % BLOCK_SIZE_BYTES);
  const out = new Uint8Array(data.length + remainingLength);
  out.set(data);
  out.fill(remainingLength, data.length);
  return out;
}

export function padBlock(block: Uint8Array, paddingMode: PaddingMode): Uint8Array {
  const paddingSize = BLOCK_SIZE_BYTES - block.length;
  if (paddingSize < 0) {
    throw new Error("Block size exceeded");
  }
  const out = new Uint8Array(BLOCK_SIZE_BYTES);
  out.set(block);
  if (paddingMode === "iso7816" && paddingSize) {
    out[block.length] = 0x80;
  } else if (paddingMode === "pkcs7") {
    out.fill(paddingSize, block.length);
  } else if (paddingMode === "whitespace") {
    out.fill(0x20, block.length);
  }
  return out;
}

export function aesCbcDecryptBytes(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  const decipher = createDecipheriv(algorithmFor(key, "cbc"), toBuffer(key), toBuffer(iv));
  decipher.setAutoPadding(false);
  return new Uint8Array(Buffer.concat([decipher.update(toBuffer(data)), decipher.final()]));
}

export function aesCbcEncryptBytes(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  const cipher = createCipheriv(algorithmFor(key, "cbc"), toBuffer(key), toBuffer(iv));
  cipher.setAutoPadding(false);
  return new Uint8Array(Buffer.concat([cipher.update(toBuffer(data)), cipher.final()]));
}

export function aesCtrEncrypt(data: Uint8Array, key: Uint8Array, iv: Uint8Array): Uint8Array {
  const cipher = createCipheriv(algorithmFor(key, "ctr"), toBuffer(key), toBuffer(iv));
  return new Uint8Array(Buffer.concat([cipher.update(toBuffer(data)), cipher.final()]));
}

export const aesCtrDecrypt = aesCtrEncrypt;

export function aesEcbEncrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  const cipher = createCipheriv(algorithmFor(key, "ecb"), toBuffer(key), null);
  cipher.setAutoPadding(false);
  return new Uint8Array(Buffer.concat([cipher.update(toBuffer(pkcs7Padding(data))), cipher.final()]));
}

export function aesEcbDecrypt(data: Uint8Array, key: Uint8Array): Uint8Array {
  const decipher = createDecipheriv(algorithmFor(key, "ecb"), toBuffer(key), null);
  decipher.setAutoPadding(false);
  return new Uint8Array(Buffer.concat([decipher.update(toBuffer(data)), decipher.final()]));
}

export function aesGcmDecryptAndVerifyBytes(
  data: Uint8Array,
  key: Uint8Array,
  tag: Uint8Array,
  nonce: Uint8Array,
): Uint8Array {
  const decipher = createDecipheriv(algorithmFor(key, "gcm"), toBuffer(key), toBuffer(nonce)) as DecipherGCM;
  decipher.setAuthTag(toBuffer(tag));
  return new Uint8Array(Buffer.concat([decipher.update(toBuffer(data)), decipher.final()]));
}
