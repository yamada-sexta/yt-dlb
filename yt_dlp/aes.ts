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

export function aesEncrypt(data: Uint8Array | readonly number[], expandedKey: Uint8Array | readonly number[]): Uint8Array {
  const key = keyFromExpandedKey(expandedKey);
  if (!key) {
    return xorBytes(data, expandedKey);
  }
  const cipher = createCipheriv(algorithmFor(key, "ecb"), toBuffer(key), null);
  cipher.setAutoPadding(false);
  return new Uint8Array(Buffer.concat([cipher.update(toBuffer(data)), cipher.final()]));
}

export function aesDecrypt(data: Uint8Array | readonly number[], expandedKey: Uint8Array | readonly number[]): Uint8Array {
  const key = keyFromExpandedKey(expandedKey);
  if (!key) {
    return xorBytes(data, expandedKey);
  }
  const decipher = createDecipheriv(algorithmFor(key, "ecb"), toBuffer(key), null);
  decipher.setAutoPadding(false);
  return new Uint8Array(Buffer.concat([decipher.update(toBuffer(data)), decipher.final()]));
}

export function aesDecryptText(data: string, password: string, keySizeBytes: 16 | 24 | 32): Uint8Array {
  const nonceLengthBytes = 8;
  const decoded = Buffer.from(data, "base64");
  const passwordBytes = Buffer.from(password, "utf-8");
  const keyMaterial = new Uint8Array(keySizeBytes);
  keyMaterial.set(passwordBytes.subarray(0, keySizeBytes));

  const derivedBlock = aesEncrypt(keyMaterial.subarray(0, BLOCK_SIZE_BYTES), keyExpansionKeyMaterial(keyMaterial));
  const key = new Uint8Array(keySizeBytes);
  for (let offset = 0; offset < key.length; offset += BLOCK_SIZE_BYTES) {
    key.set(derivedBlock.subarray(0, Math.min(BLOCK_SIZE_BYTES, key.length - offset)), offset);
  }

  const nonce = decoded.subarray(0, nonceLengthBytes);
  const cipher = decoded.subarray(nonceLengthBytes);
  const iv = new Uint8Array(BLOCK_SIZE_BYTES);
  iv.set(nonce);
  return aesCtrDecrypt(cipher, key, iv);
}

function keyFromExpandedKey(expandedKey: Uint8Array | readonly number[]): Uint8Array | null {
  const keyLength = expandedKey.length === 176 ? 16 : expandedKey.length === 208 ? 24 : expandedKey.length === 240 ? 32 : null;
  return keyLength ? Uint8Array.from(expandedKey.slice(0, keyLength)) : null;
}

function keyExpansionKeyMaterial(key: Uint8Array): Uint8Array {
  return key.length === 16 ? Uint8Array.from([...key, ...Array(160).fill(0)]) : key.length === 24 ? Uint8Array.from([...key, ...Array(184).fill(0)]) : Uint8Array.from([...key, ...Array(208).fill(0)]);
}

function xorBytes(data: Uint8Array | readonly number[], key: Uint8Array | readonly number[]): Uint8Array {
  const length = Math.min(data.length, key.length);
  const out = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    const dataByte = data[index];
    const keyByte = key[index];
    if (dataByte === undefined || keyByte === undefined) {
      throw new Error("xor byte input ended unexpectedly");
    }
    out[index] = dataByte ^ keyByte;
  }
  return out;
}
