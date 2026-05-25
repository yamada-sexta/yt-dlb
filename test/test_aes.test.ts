// Source: test/test_aes.py

import { describe, expect, test } from "bun:test";

import {
  aesDecrypt,
  aesDecryptText,
  aesEncrypt,
  aesCbcDecryptBytes,
  aesCbcEncryptBytes,
  aesCtrDecrypt,
  aesCtrEncrypt,
  aesEcbDecrypt,
  aesEcbEncrypt,
  aesGcmDecryptAndVerifyBytes,
  padBlock,
  pkcs7Padding,
} from "../yt_dlp/aes.ts";

const key = Uint8Array.from([0x20, 0x15, ...Array(14).fill(0)]);
const iv = key;
const secretMsg = Buffer.from("Secret message goes here");

describe("AES helpers", () => {
  test("encrypt/decrypt compatibility wrappers", () => {
    const msg = Buffer.from("message");
    const expandedKey = Uint8Array.from(Array.from({ length: 16 }, (_, index) => index));
    const encrypted = aesEncrypt(msg, expandedKey);
    expect(aesDecrypt(encrypted, expandedKey)).toEqual(msg);
  });

  test("CBC decrypt", () => {
    const data = Uint8Array.from([0x97, 0x92, 0x2b, 0xe5, 0x0b, 0xc3, 0x18, 0x91, 0x6b, 0x79, 0x39, 0x6d, 0x26, 0xb3, 0xb5, 0x40, 0xe6, 0x27, 0xc2, 0x96, 0x2e, 0xc8, 0x75, 0x88, 0xab, 0x39, 0x2d, 0x5b, 0x9e, 0x7c, 0xf1, 0xcd]);
    expect(stripPadding(aesCbcDecryptBytes(data, key, iv))).toEqual(secretMsg);
  });

  test("CBC encrypt", () => {
    expect(aesCbcEncryptBytes(pkcs7(secretMsg), key, iv)).toEqual(Uint8Array.from([0x97, 0x92, 0x2b, 0xe5, 0x0b, 0xc3, 0x18, 0x91, 0x6b, 0x79, 0x39, 0x6d, 0x26, 0xb3, 0xb5, 0x40, 0xe6, 0x27, 0xc2, 0x96, 0x2e, 0xc8, 0x75, 0x88, 0xab, 0x39, 0x2d, 0x5b, 0x9e, 0x7c, 0xf1, 0xcd]));
  });

  test("CTR encrypt/decrypt", () => {
    const encrypted = Uint8Array.from([0x03, 0xc7, 0xdd, 0xd4, 0x8e, 0xb3, 0xbc, 0x1a, 0x2a, 0x4f, 0xdc, 0x31, 0x12, 0x2b, 0x38, 0x41, 0x69, 0x6f, 0xd1, 0x7a, 0xb5, 0x23, 0xaf, 0x08]);
    expect(aesCtrEncrypt(secretMsg, key, iv)).toEqual(encrypted);
    expect(aesCtrDecrypt(encrypted, key, iv)).toEqual(secretMsg);
  });

  test("GCM decrypt", () => {
    const data = Uint8Array.from([0x15, 0x39, 0x59, 0xcf, 0x35, 0x65, 0x75, 0x64, 0x90, 0x9c, 0x85, 0x26, 0x5d, 0x14, 0x1d, 0x0f, 0x2e, 0x08, 0xb4, 0x54, 0xe4, 0x2f, 0x17, 0xbd]);
    const tag = Uint8Array.from([0xe8, 0x26, 0x49, 0x80, 0x72, 0x49, 0x07, 0x9d, 0x7d, 0x59, 0x57, 0x75, 0x55, 0x40, 0x3a, 0x65]);
    expect(aesGcmDecryptAndVerifyBytes(data, key, tag, iv.slice(0, 12))).toEqual(secretMsg);
  });

  test("GCM aligned decrypt", () => {
    const data = Uint8Array.from([0x15, 0x39, 0x59, 0xcf, 0x35, 0x65, 0x75, 0x64, 0x90, 0x9c, 0x85, 0x26, 0x5d, 0x14, 0x1d, 0x0f]);
    const tag = Uint8Array.from([0x08, 0xb1, 0x9d, 0x21, 0x26, 0x98, 0xd0, 0xea, 0x52, 0x71, 0x90, 0xe6, 0x3b, 0xb5, 0x5d, 0xd8]);
    expect(aesGcmDecryptAndVerifyBytes(data, key, tag, iv.slice(0, 12))).toEqual(secretMsg.slice(0, 16));
  });

  test("ECB encrypt/decrypt", () => {
    const encrypted = Uint8Array.from([0xaa, 0x86, 0x5d, 0x81, 0x97, 0x3e, 0x02, 0x92, 0x9d, 0x1b, 0x52, 0x5b, 0x5b, 0x4c, 0x2f, 0x75, 0xd3, 0x26, 0xd1, 0x28, 0x68, 0xde, 0x7b, 0x81, 0x94, 0xba, 0x02, 0xae, 0xbd, 0xa6, 0xd0, 0x3a]);
    expect(aesEcbEncrypt(secretMsg, key)).toEqual(encrypted);
    expect(stripPadding(aesEcbDecrypt(encrypted, key))).toEqual(secretMsg);
  });

  test("padBlock", () => {
    const block = Uint8Array.from([0x21, 0xa0, 0x43, 0xff]);
    expect(padBlock(block, "pkcs7")).toEqual(Uint8Array.from([...block, ...Array(12).fill(0x0c)]));
    expect(padBlock(block, "iso7816")).toEqual(Uint8Array.from([...block, 0x80, ...Array(11).fill(0x00)]));
    expect(padBlock(block, "whitespace")).toEqual(Uint8Array.from([...block, ...Array(12).fill(0x20)]));
    expect(padBlock(block, "zero")).toEqual(Uint8Array.from([...block, ...Array(12).fill(0x00)]));

    const fullBlock = Uint8Array.from(Array.from({ length: 16 }, (_, index) => index));
    for (const mode of ["pkcs7", "iso7816", "whitespace", "zero"] as const) {
      expect(padBlock(fullBlock, mode)).toEqual(fullBlock);
    }
  });

  test("pkcs7Padding pads full blocks", () => {
    const fullBlock = Uint8Array.from(Array.from({ length: 16 }, (_, index) => index));
    expect(pkcs7Padding(fullBlock)).toEqual(Uint8Array.from([...fullBlock, ...Array(16).fill(0x10)]));
  });

  test("decrypt text", () => {
    const password = Buffer.from(key).toString();
    expect(aesDecryptText("IBUAAAAAAAAXFZOrjYBWzVbgCc1vwqXYa3NNDeI3Tq4=", password, 16)).toEqual(secretMsg);
    expect(aesDecryptText("IBUAAAAAAAAL5qTZeg64udDUaV+FHZmYX+WA5y6/pYM=", password, 32)).toEqual(secretMsg);
  });

  test.todo("test_key_expansion once keyExpansion compatibility is ported", () => undefined);
});

function pkcs7(data: Uint8Array): Uint8Array {
  const pad = 16 - data.length % 16;
  return Uint8Array.from([...data, ...Array(pad).fill(pad)]);
}

function stripPadding(data: Uint8Array): Uint8Array {
  return data.slice(0, data.length - (data.at(-1) ?? 0));
}
