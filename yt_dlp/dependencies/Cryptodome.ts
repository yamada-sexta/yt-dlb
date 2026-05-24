// Source: yt_dlp/dependencies/Cryptodome.py
// Port note: Python Crypto/Cryptodome optional imports are replaced with Bun-compatible native crypto exports.

import * as aes from "../aes.ts";
import { NotImplementedError } from "../errors.ts";

export const __version__ = process.versions.openssl ?? "";
export const _yt_dlp__identifier = "bun:crypto";

export const AES = {
  MODE_CBC: "cbc",
  MODE_CTR: "ctr",
  MODE_ECB: "ecb",
  MODE_GCM: "gcm",
  cbcDecrypt: aes.aesCbcDecryptBytes,
  cbcEncrypt: aes.aesCbcEncryptBytes,
  ctrDecrypt: aes.aesCtrDecrypt,
  ctrEncrypt: aes.aesCtrEncrypt,
  ecbDecrypt: aes.aesEcbDecrypt,
  ecbEncrypt: aes.aesEcbEncrypt,
  gcmDecryptAndVerify: aes.aesGcmDecryptAndVerifyBytes,
} as const;

function unsupportedCryptoFeature(feature: string): never {
  throw new NotImplementedError(`Cryptodome.${feature}`);
}

export const PKCS1_v1_5 = { new: (): never => unsupportedCryptoFeature("PKCS1_v1_5") };
export const Blowfish = { new: (): never => unsupportedCryptoFeature("Blowfish") };
export const PKCS1_OAEP = { new: (): never => unsupportedCryptoFeature("PKCS1_OAEP") };
export const SHA1 = { new: (): never => unsupportedCryptoFeature("SHA1") };
export const CMAC = { new: (): never => unsupportedCryptoFeature("CMAC") };
export const RSA = { importKey: (): never => unsupportedCryptoFeature("RSA") };
