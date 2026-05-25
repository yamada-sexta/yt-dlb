// Source: test/test_socks.py

import { describe, expect, test } from "bun:test";

import {
  InvalidVersionError,
  ProxyError,
  ProxyType,
  SOCKS4_DEFAULT_DSTIP,
  SOCKS4_REPLY_VERSION,
  SOCKS4_VERSION,
  SOCKS5_USER_AUTH_SUCCESS,
  SOCKS5_USER_AUTH_VERSION,
  SOCKS5_VERSION,
  Socks4Command,
  Socks4Error,
  Socks5AddressType,
  Socks5Auth,
  Socks5Command,
  Socks5Error,
  SocksSocket,
} from "../yt_dlp/socks.ts";

describe("SOCKS constants", () => {
  test("protocol constants match Python tests", () => {
    expect(SOCKS4_VERSION).toBe(4);
    expect(SOCKS4_REPLY_VERSION).toBe(0);
    expect(SOCKS4_DEFAULT_DSTIP).toEqual(Buffer.from([0, 0, 0, 0xff]));
    expect(SOCKS5_VERSION).toBe(5);
    expect(SOCKS5_USER_AUTH_VERSION).toBe(1);
    expect(SOCKS5_USER_AUTH_SUCCESS).toBe(0);
  });

  test("enum values", () => {
    expect(Socks4Command.CMD_CONNECT).toBe(1);
    expect(Socks5Command.CMD_UDP_ASSOCIATE).toBe(3);
    expect(Socks5Auth.AUTH_USER_PASS).toBe(2);
    expect(Socks5AddressType.ATYP_DOMAINNAME).toBe(3);
    expect(ProxyType.SOCKS4A).toBe(1);
  });
});

describe("SOCKS errors and socket setup", () => {
  test("error messages", () => {
    expect(new ProxyError().message).toBe("unknown error");
    expect(new Socks4Error(91).message).toBe("request rejected or failed");
    expect(new Socks5Error(0x05).message).toBe("Connection refused");
    expect(new InvalidVersionError(5, 4).message).toContain("Expected 05 got 04");
  });

  test("setProxy validates proxy type", () => {
    const socket = new SocksSocket();
    expect(() => socket.setProxy(999 as ProxyType, "localhost", 1080)).toThrow(/Invalid proxy type/);
    socket.socket.destroy();
  });
});
