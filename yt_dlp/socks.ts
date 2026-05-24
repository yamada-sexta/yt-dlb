// Source: yt_dlp/socks.py
// Port note: TypeScript cannot subclass Python sockets, so this exposes an async wrapper around node:net.Socket.

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Socket } from "node:net";

export const SOCKS4_VERSION = 4;
export const SOCKS4_REPLY_VERSION = 0x00;
export const SOCKS4_DEFAULT_DSTIP = Buffer.from([0, 0, 0, 0xff]);

export const SOCKS5_VERSION = 5;
export const SOCKS5_USER_AUTH_VERSION = 0x01;
export const SOCKS5_USER_AUTH_SUCCESS = 0x00;

export enum Socks4Command {
  CMD_CONNECT = 0x01,
  CMD_BIND = 0x02,
}

export enum Socks5Command {
  CMD_CONNECT = 0x01,
  CMD_BIND = 0x02,
  CMD_UDP_ASSOCIATE = 0x03,
}

export enum Socks5Auth {
  AUTH_NONE = 0x00,
  AUTH_GSSAPI = 0x01,
  AUTH_USER_PASS = 0x02,
  AUTH_NO_ACCEPTABLE = 0xff,
}

export enum Socks5AddressType {
  ATYP_IPV4 = 0x01,
  ATYP_DOMAINNAME = 0x03,
  ATYP_IPV6 = 0x04,
}

export enum ProxyType {
  SOCKS4 = 0,
  SOCKS4A = 1,
  SOCKS5 = 2,
}

export interface Proxy {
  type: ProxyType;
  host: string;
  port: number;
  username?: string;
  password?: string;
  remoteDns: boolean;
}

export class ProxyError extends Error {
  static readonly ERR_SUCCESS: number = 0x00;
  static readonly CODES = new Map<number, string>();

  constructor(readonly code?: number, message?: string) {
    super(message ?? (code === undefined ? "unknown error" : ProxyError.CODES.get(code) ?? "unknown error"));
  }
}

export class InvalidVersionError extends ProxyError {
  constructor(expectedVersion: number, gotVersion: number) {
    super(0, `Invalid response version from server. Expected ${expectedVersion.toString(16).padStart(2, "0")} got ${gotVersion.toString(16).padStart(2, "0")}`);
  }
}

export class Socks4Error extends ProxyError {
  static override readonly ERR_SUCCESS: number = 90;
  static override readonly CODES = new Map([
    [91, "request rejected or failed"],
    [92, "request rejected because SOCKS server cannot connect to identd on the client"],
    [93, "request rejected because the client program and identd report different user-ids"],
  ]);

  constructor(code?: number, message?: string) {
    super(code, message ?? (code === undefined ? undefined : Socks4Error.CODES.get(code)));
  }
}

export class Socks5Error extends ProxyError {
  static readonly ERR_GENERAL_FAILURE = 0x01;
  static override readonly CODES = new Map([
    [0x01, "general SOCKS server failure"],
    [0x02, "connection not allowed by ruleset"],
    [0x03, "Network unreachable"],
    [0x04, "Host unreachable"],
    [0x05, "Connection refused"],
    [0x06, "TTL expired"],
    [0x07, "Command not supported"],
    [0x08, "Address type not supported"],
    [0xfe, "unknown username or invalid password"],
    [0xff, "all offered authentication methods were rejected"],
  ]);

  constructor(code?: number, message?: string) {
    super(code, message ?? (code === undefined ? undefined : Socks5Error.CODES.get(code)));
  }
}

type Address = [host: string, port: number];

export class SocksSocket {
  readonly socket: Socket;
  #proxy: Proxy | null = null;
  #readBuffer = Buffer.alloc(0);
  #readWaiters: Array<() => void> = [];

  constructor(socket = new Socket()) {
    this.socket = socket;
    this.socket.on("data", (chunk: Buffer) => {
      this.#readBuffer = Buffer.concat([this.#readBuffer, chunk]);
      this.#flushWaiters();
    });
    this.socket.on("end", () => this.#flushWaiters());
    this.socket.on("close", () => this.#flushWaiters());
    this.socket.on("error", () => this.#flushWaiters());
  }

  setProxy(proxyType: ProxyType, host: string, port: number, remoteDns = true, username?: string, password?: string): void {
    if (![ProxyType.SOCKS4, ProxyType.SOCKS4A, ProxyType.SOCKS5].includes(proxyType)) {
      throw new Error(`Invalid proxy type: ${proxyType}`);
    }
    this.#proxy = { type: proxyType, host, port, username, password, remoteDns };
  }

  async connect(address: Address): Promise<void> {
    if (!this.#proxy) {
      await this.connectRaw(address);
      return;
    }
    await this.connectRaw([this.#proxy.host, this.#proxy.port]);
    await this.setupProxy(address);
  }

  async connectEx(address: Address): Promise<number | null> {
    try {
      await this.connect(address);
      return null;
    } catch {
      return 1;
    }
  }

  async recvAll(count: number): Promise<Buffer> {
    while (this.#readBuffer.length < count) {
      if (this.socket.destroyed) {
        throw new EOFError(`${count - this.#readBuffer.length} bytes missing`);
      }
      await new Promise<void>((resolve) => this.#readWaiters.push(resolve));
    }
    const data = this.#readBuffer.subarray(0, count);
    this.#readBuffer = this.#readBuffer.subarray(count);
    return data;
  }

  private async setupProxy(address: Address): Promise<void> {
    if (!this.#proxy) {
      return;
    }
    switch (this.#proxy.type) {
      case ProxyType.SOCKS4:
        await this.setupSocks4(address, false);
        break;
      case ProxyType.SOCKS4A:
        await this.setupSocks4(address, true);
        break;
      case ProxyType.SOCKS5:
        await this.setupSocks5(address);
        break;
    }
  }

  private async connectRaw([host, port]: Address): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        cleanup();
        reject(error);
      };
      const onConnect = (): void => {
        cleanup();
        resolve();
      };
      const cleanup = (): void => {
        this.socket.off("error", onError);
        this.socket.off("connect", onConnect);
      };
      this.socket.once("error", onError);
      this.socket.once("connect", onConnect);
      this.socket.connect(port, host);
    });
  }

  private async setupSocks4([destHost, port]: Address, is4a: boolean): Promise<[number, number]> {
    const ipaddr = await this.resolveAddress(destHost, SOCKS4_DEFAULT_DSTIP, is4a, 4);
    const packetParts = [
      Buffer.from([SOCKS4_VERSION, Socks4Command.CMD_CONNECT, (port >> 8) & 0xff, port & 0xff]),
      ipaddr,
      Buffer.from(this.#proxy?.username ?? "", "utf8"),
      Buffer.from([0]),
    ];
    if (is4a && this.#proxy?.remoteDns && ipaddr.equals(SOCKS4_DEFAULT_DSTIP)) {
      packetParts.push(Buffer.from(destHost, "utf8"), Buffer.from([0]));
    }
    this.socket.write(Buffer.concat(packetParts));

    const response = await this.recvAll(8);
    const version = response[0] ?? 0;
    const responseCode = response[1] ?? 0;
    const dstPort = response.readUInt16BE(2);
    const dstHost = response.readUInt32BE(4);
    this.checkResponseVersion(SOCKS4_REPLY_VERSION, version);
    if (responseCode !== Socks4Error.ERR_SUCCESS) {
      this.socket.destroy();
      throw new Socks4Error(responseCode);
    }
    return [dstHost, dstPort];
  }

  private async socks5Auth(): Promise<void> {
    const authMethods = [Socks5Auth.AUTH_NONE];
    if (this.#proxy?.username && this.#proxy.password) {
      authMethods.push(Socks5Auth.AUTH_USER_PASS);
    }
    this.socket.write(Buffer.from([SOCKS5_VERSION, authMethods.length, ...authMethods]));

    const response = await this.recvAll(2);
    const version = response[0] ?? 0;
    const method = response[1] ?? Socks5Auth.AUTH_NO_ACCEPTABLE;
    this.checkResponseVersion(SOCKS5_VERSION, version);

    if (method === Socks5Auth.AUTH_NO_ACCEPTABLE || (method === Socks5Auth.AUTH_USER_PASS && (!this.#proxy?.username || !this.#proxy.password))) {
      this.socket.destroy();
      throw new Socks5Error(Socks5Auth.AUTH_NO_ACCEPTABLE);
    }

    if (method === Socks5Auth.AUTH_USER_PASS) {
      const username = Buffer.from(this.#proxy?.username ?? "", "utf8");
      const password = Buffer.from(this.#proxy?.password ?? "", "utf8");
      this.socket.write(Buffer.concat([
        Buffer.from([SOCKS5_USER_AUTH_VERSION]),
        lenAndData(username),
        lenAndData(password),
      ]));
      const authResponse = await this.recvAll(2);
      this.checkResponseVersion(SOCKS5_USER_AUTH_VERSION, authResponse[0] ?? 0);
      if ((authResponse[1] ?? 0xff) !== SOCKS5_USER_AUTH_SUCCESS) {
        this.socket.destroy();
        throw new Socks5Error(Socks5Error.ERR_GENERAL_FAILURE);
      }
    }
  }

  private async setupSocks5([destHost, port]: Address): Promise<[Buffer, number]> {
    const { family, ipaddr } = await this.resolveSocks5Address(destHost);
    await this.socks5Auth();

    const packetParts: Buffer[] = [Buffer.from([SOCKS5_VERSION, Socks5Command.CMD_CONNECT, 0])];
    if (!ipaddr) {
      packetParts.push(Buffer.from([Socks5AddressType.ATYP_DOMAINNAME]), lenAndData(Buffer.from(destHost, "utf8")));
    } else if (family === 4) {
      packetParts.push(Buffer.from([Socks5AddressType.ATYP_IPV4]), ipaddr);
    } else {
      packetParts.push(Buffer.from([Socks5AddressType.ATYP_IPV6]), ipaddr);
    }
    packetParts.push(Buffer.from([(port >> 8) & 0xff, port & 0xff]));
    this.socket.write(Buffer.concat(packetParts));

    const header = await this.recvAll(4);
    const version = header[0] ?? 0;
    const status = header[1] ?? Socks5Error.ERR_GENERAL_FAILURE;
    const addressType = header[3] ?? 0;
    this.checkResponseVersion(SOCKS5_VERSION, version);
    if (status !== Socks5Error.ERR_SUCCESS) {
      this.socket.destroy();
      throw new Socks5Error(status);
    }

    let boundAddress: Buffer;
    if (addressType === Socks5AddressType.ATYP_IPV4) {
      boundAddress = await this.recvAll(4);
    } else if (addressType === Socks5AddressType.ATYP_DOMAINNAME) {
      const length = (await this.recvAll(1))[0] ?? 0;
      boundAddress = await this.recvAll(length);
    } else if (addressType === Socks5AddressType.ATYP_IPV6) {
      boundAddress = await this.recvAll(16);
    } else {
      throw new Socks5Error(Socks5Error.ERR_GENERAL_FAILURE, `unknown address type ${addressType}`);
    }
    const boundPort = (await this.recvAll(2)).readUInt16BE(0);
    return [boundAddress, boundPort];
  }

  private async resolveAddress(destHost: string, remoteDefault: Buffer, useRemoteDns: boolean, family: 4 | 6): Promise<Buffer> {
    const literal = ipToBuffer(destHost, family);
    if (literal) {
      return literal;
    }
    if (useRemoteDns && this.#proxy?.remoteDns) {
      return remoteDefault;
    }
    const result = await lookup(destHost, { family });
    const resolved = ipToBuffer(result.address, family);
    if (!resolved) {
      throw new Error(`Could not resolve ${destHost}`);
    }
    return resolved;
  }

  private async resolveSocks5Address(destHost: string): Promise<{ family: 4 | 6 | 0; ipaddr: Buffer | null }> {
    const literalFamily = isIP(destHost);
    if (literalFamily === 4 || literalFamily === 6) {
      return { family: literalFamily, ipaddr: ipToBuffer(destHost, literalFamily) };
    }
    if (this.#proxy?.remoteDns) {
      return { family: 0, ipaddr: null };
    }
    const result = await lookup(destHost);
    const family = result.family === 6 ? 6 : 4;
    return { family, ipaddr: ipToBuffer(result.address, family) };
  }

  private checkResponseVersion(expectedVersion: number, gotVersion: number): void {
    if (gotVersion !== expectedVersion) {
      this.socket.destroy();
      throw new InvalidVersionError(expectedVersion, gotVersion);
    }
  }

  #flushWaiters(): void {
    const waiters = this.#readWaiters.splice(0);
    for (const waiter of waiters) {
      waiter();
    }
  }
}

export class EOFError extends Error {}

export const sockssocket = SocksSocket;

function lenAndData(data: Buffer): Buffer {
  if (data.length > 255) {
    throw new Error("SOCKS field too long");
  }
  return Buffer.concat([Buffer.from([data.length]), data]);
}

function ipToBuffer(address: string, family: 4 | 6): Buffer | null {
  if (family === 4 && isIP(address) === 4) {
    return Buffer.from(address.split(".").map((part) => Number.parseInt(part, 10)));
  }
  if (family === 6 && isIP(address) === 6) {
    const sections = expandIpv6(address);
    return Buffer.from(sections.flatMap((section) => [(section >> 8) & 0xff, section & 0xff]));
  }
  return null;
}

function expandIpv6(address: string): number[] {
  const [headRaw = "", tailRaw = ""] = address.split("::");
  const head = headRaw ? headRaw.split(":") : [];
  const tail = tailRaw ? tailRaw.split(":") : [];
  const missing = 8 - head.length - tail.length;
  const parts = [...head, ...Array(Math.max(0, missing)).fill("0"), ...tail];
  return parts.map((part) => Number.parseInt(part || "0", 16));
}
