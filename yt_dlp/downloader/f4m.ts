// Source: yt_dlp/downloader/f4m.py
// Port note: F4M live refresh is streamed through FragmentFD's async fragment support.

import { Buffer } from "node:buffer";

import { compatEtreeFromstring, type XmlElement } from "../compat/index.ts";
import {
  fixXmlAmpersands,
  xmlFind,
  xmlFindAll,
  xpathText,
} from "../utils/xml.ts";
import { FragmentFD, type FragmentInfo } from "./fragment.ts";
import type { DownloadInfo } from "./common.ts";

interface MediaNode {
  attributes: Record<string, string>;
  metadata: Uint8Array | null;
}

interface BootstrapNode {
  url: string | null;
  text: string;
}

interface BootstrapInfo {
  segments: { segment_run: [number, number][] }[];
  fragments: { fragments: { first: number; duration: number }[] }[];
  live: boolean;
}

export class F4mFD extends FragmentFD {
  override async realDownload(
    filename: string,
    info: DownloadInfo,
  ): Promise<boolean> {
    this.toScreen("[f4m] Downloading f4m manifest");
    const manifestResponse = await this.ydl.urlopen(
      this.prepareUrl(info, info.url),
    );
    const manifestUrl = manifestResponse.url;
    const manifest = fixXmlAmpersands(await manifestResponse.text()).trim();
    const doc = parseManifest(manifest);
    const media = chooseMedia(
      doc.media,
      typeof info.tbr === "number" ? info.tbr : null,
      Boolean(this.params.allow_unplayable_formats),
    );
    const manifestBaseUrl = doc.baseUrl
      ? new URL(doc.baseUrl, manifestUrl).toString()
      : manifestUrl;
    const mediaBaseUrl = new URL(
      requiredAttr(media, "url"),
      manifestBaseUrl,
    ).toString();
    const bootstrapInfo = await this.parseBootstrap(
      doc.bootstrap,
      manifestBaseUrl,
    );
    const fragmentsList = buildFragmentsList(bootstrapInfo);
    const baseUrl = new URL(mediaBaseUrl);
    const queryParts = [
      baseUrl.search.replace(/^\?/, ""),
      doc.akamaiPv?.replace(/;$/, ""),
      typeof info.extra_param_to_segment_url === "string"
        ? info.extra_param_to_segment_url
        : "",
    ].filter(Boolean);
    const prefix = concatBytes([
      writeFlvHeader(),
      media.metadata ? writeMetadataTag(media.metadata) : new Uint8Array(),
    ]);
    let wroteHeader = false;
    const makeFragment = (
      [segment, fragment]: [number, number],
      index: number,
    ): FragmentInfo => {
      const url = new URL(baseUrl.toString());
      url.pathname += `Seg${segment}-Frag${fragment}`;
      url.search = queryParts.join("&");
      return {
        frag_index: index + 1,
        url: url.toString(),
        transformData: (data) => {
          const payload = extractMdatPayload(data, Boolean(this.params.test));
          if (wroteHeader) {
            return payload;
          }
          wroteHeader = true;
          return concatBytes([prefix, payload]);
        },
      };
    };
    const fragments =
      bootstrapInfo.live && doc.bootstrap.url && !this.params.test
        ? this.liveFragments(
            doc.bootstrap.url,
            manifestBaseUrl,
            fragmentsList,
            makeFragment,
          )
        : (this.params.test ? fragmentsList.slice(0, 1) : fragmentsList).map(
            makeFragment,
          );
    this.toScreen(
      "[f4m] Total fragments: " +
        (bootstrapInfo.live ? "unknown (live)" : fragmentsList.length),
    );
    return await this.downloadFragments(filename, info, fragments);
  }

  private async parseBootstrap(
    node: BootstrapNode,
    baseUrl: string,
  ): Promise<BootstrapInfo> {
    if (node.url) {
      const url = new URL(node.url, baseUrl).toString();
      const data = new Uint8Array(
        await (await this.ydl.urlopen(url)).arrayBuffer(),
      );
      return readBootstrapInfo(data);
    }
    return readBootstrapInfo(Buffer.from(node.text.trim(), "base64"));
  }

  private async *liveFragments(
    bootstrapUrl: string,
    manifestBaseUrl: string,
    initialFragments: [number, number][],
    makeFragment: (pair: [number, number], index: number) => FragmentInfo,
  ): AsyncIterable<FragmentInfo> {
    let queue = [...initialFragments];
    let latestFragment = queue.at(-1)?.[1] ?? 0;
    let index = 0;
    while (queue.length) {
      while (queue.length) {
        const pair = queue.shift();
        if (!pair) {
          break;
        }
        latestFragment = pair[1];
        index += 1;
        yield makeFragment(pair, index);
      }
      queue = await this.updateLiveFragments(
        new URL(bootstrapUrl, manifestBaseUrl).toString(),
        latestFragment,
      );
      const nextFragment = queue[0]?.[1];
      if (nextFragment !== undefined && nextFragment > latestFragment + 1) {
        this.ydl.reportWarning?.(
          `Missed ${nextFragment - (latestFragment + 1)} fragments`,
        );
      }
    }
  }

  private async updateLiveFragments(
    bootstrapUrl: string,
    latestFragment: number,
  ): Promise<[number, number][]> {
    for (let retries = 30; retries > 0; retries -= 1) {
      const fragments = buildFragmentsList(
        await this.parseBootstrap(
          { url: bootstrapUrl, text: "" },
          bootstrapUrl,
        ),
      ).filter((fragment) => fragment[1] > latestFragment);
      if (fragments.length) {
        return fragments;
      }
      await sleep(5000);
    }
    return [];
  }
}

function parseManifest(xml: string): {
  baseUrl: string | null;
  media: MediaNode[];
  bootstrap: BootstrapNode;
  akamaiPv: string | null;
} {
  const root = compatEtreeFromstring(xml);
  const baseUrl = xpathText(root, [addNs("baseURL"), addNs("baseURL", 2)]);
  const akamaiPv = xpathText(root, addNs("pv-2.0"));
  const bootstrapElement = xmlFind(root, addNs("bootstrapInfo"));
  if (!bootstrapElement) {
    throw new Error("F4M manifest has no bootstrapInfo");
  }
  const media = xmlFindAll(root, addNs("media")).map(
    (element): MediaNode => ({
      attributes: element.attrib,
      metadata: metadataOf(element),
    }),
  );
  if (!media.length) {
    throw new Error("F4M manifest has no media");
  }
  return {
    baseUrl: baseUrl?.trim() ?? null,
    media,
    bootstrap: {
      url: bootstrapElement.attrib.url ?? null,
      text: bootstrapElement.text ?? "",
    },
    akamaiPv: akamaiPv?.trim() ?? null,
  };
}

function metadataOf(media: XmlElement): Uint8Array | null {
  const metadata = xpathText(media, addNs("metadata"));
  return metadata ? Buffer.from(metadata.trim(), "base64") : null;
}

function addNs(prop: string, version = 1): string {
  return `{http://ns.adobe.com/f4m/${version}.0}${prop}`;
}

function chooseMedia(
  media: MediaNode[],
  requestedBitrate: number | null,
  allowUnplayable: boolean,
): MediaNode {
  const playable = allowUnplayable
    ? media
    : media.filter(
        (node) =>
          !("drmAdditionalHeaderId" in node.attributes) &&
          !("drmAdditionalHeaderSetId" in node.attributes),
      );
  if (!playable.length) {
    throw new Error("Unsupported F4M DRM");
  }
  if (requestedBitrate !== null) {
    const exact = playable.find(
      (node) => Number(node.attributes.bitrate ?? -1) === requestedBitrate,
    );
    if (exact) {
      return exact;
    }
  }
  const best = [...playable]
    .sort(
      (left, right) =>
        Number(left.attributes.bitrate ?? -1) -
        Number(right.attributes.bitrate ?? -1),
    )
    .at(-1);
  if (!best) {
    throw new Error("F4M manifest has no playable media");
  }
  return best;
}

function readBootstrapInfo(data: Uint8Array): BootstrapInfo {
  const reader = new FlvReader(data);
  const box = reader.readBoxInfo();
  if (box.type !== "abst") {
    throw new Error("F4M bootstrap did not start with abst box");
  }
  return new FlvReader(box.data).readAbst();
}

function buildFragmentsList(info: BootstrapInfo): [number, number][] {
  const out: [number, number][] = [];
  const segmentRunTable = info.segments[0];
  const fragmentRunEntryTable = info.fragments[0]?.fragments;
  if (!segmentRunTable || !fragmentRunEntryTable?.length) {
    throw new Error("F4M bootstrap has no fragments");
  }
  const firstFragment = fragmentRunEntryTable[0];
  if (!firstFragment) {
    throw new Error("F4M bootstrap has no first fragment");
  }
  let fragmentCounter = firstFragment.first;
  for (const [segment, count] of segmentRunTable.segment_run) {
    const fragmentCount = count === 0xffffffff && info.live ? 2 : count;
    for (let index = 0; index < fragmentCount; index += 1) {
      out.push([segment, fragmentCounter]);
      fragmentCounter += 1;
    }
  }
  return info.live ? out.slice(-2) : out;
}

class FlvReader {
  #offset = 0;

  constructor(readonly data: Uint8Array) {}

  readAbst(): BootstrapInfo {
    this.readUint8();
    this.readBytes(3);
    this.readUint32();
    const flags = this.readUint8();
    const live = Boolean(flags & 0x20);
    this.readUint32();
    this.readUint64();
    this.readUint64();
    this.readString();
    this.#skipStrings(this.readUint8());
    this.#skipStrings(this.readUint8());
    this.readString();
    this.readString();
    const segments: BootstrapInfo["segments"] = [];
    for (const count = this.readUint8(); segments.length < count; ) {
      const box = this.readBoxInfo();
      if (box.type !== "asrt") {
        throw new Error(`Unexpected F4M segment box ${box.type}`);
      }
      segments.push(new FlvReader(box.data).readAsrt());
    }
    const fragments: BootstrapInfo["fragments"] = [];
    for (const count = this.readUint8(); fragments.length < count; ) {
      const box = this.readBoxInfo();
      if (box.type !== "afrt") {
        throw new Error(`Unexpected F4M fragment box ${box.type}`);
      }
      fragments.push(new FlvReader(box.data).readAfrt());
    }
    return { segments, fragments, live };
  }

  readAsrt(): BootstrapInfo["segments"][number] {
    this.readUint8();
    this.readBytes(3);
    this.#skipStrings(this.readUint8());
    const segments: [number, number][] = [];
    for (const count = this.readUint32(); segments.length < count; ) {
      segments.push([this.readUint32(), this.readUint32()]);
    }
    return { segment_run: segments };
  }

  readAfrt(): BootstrapInfo["fragments"][number] {
    this.readUint8();
    this.readBytes(3);
    this.readUint32();
    this.#skipStrings(this.readUint8());
    const fragments: BootstrapInfo["fragments"][number]["fragments"] = [];
    for (const count = this.readUint32(); fragments.length < count; ) {
      const first = this.readUint32();
      this.readUint64();
      const duration = this.readUint32();
      if (duration === 0) {
        this.readUint8();
      }
      fragments.push({ first, duration });
    }
    return { fragments };
  }

  readBoxInfo(): { size: number; type: string; data: Uint8Array } {
    const size = this.readUint32();
    const type = new TextDecoder().decode(this.readBytes(4));
    const realSize = size === 1 ? Number(this.readUint64()) : size;
    const headerSize = size === 1 ? 16 : 8;
    return {
      size: realSize,
      type,
      data: this.readBytes(realSize - headerSize),
    };
  }

  readUint8(): number {
    const value = this.readBytes(1)[0];
    if (value === undefined) {
      throw new Error("FLV reader expected a byte");
    }
    return value;
  }

  readUint32(): number {
    return new DataView(this.readBytes(4).buffer).getUint32(0);
  }

  readUint64(): bigint {
    return new DataView(this.readBytes(8).buffer).getBigUint64(0);
  }

  readString(): string {
    const start = this.#offset;
    while (
      this.#offset < this.data.byteLength &&
      this.data[this.#offset] !== 0
    ) {
      this.#offset += 1;
    }
    const text = new TextDecoder().decode(this.data.slice(start, this.#offset));
    this.#offset += 1;
    return text;
  }

  readBytes(length: number): Uint8Array {
    if (this.#offset + length > this.data.byteLength) {
      throw new Error(`F4M data truncated: need ${length} bytes`);
    }
    const value = this.data.slice(this.#offset, this.#offset + length);
    this.#offset += length;
    return value;
  }

  #skipStrings(count: number): void {
    for (let index = 0; index < count; index += 1) {
      this.readString();
    }
  }
}

function extractMdatPayload(
  data: Uint8Array,
  allowTruncated: boolean,
): Uint8Array {
  const reader = new FlvReader(data);
  while (true) {
    try {
      const box = reader.readBoxInfo();
      if (box.type === "mdat") {
        return box.data;
      }
    } catch (error) {
      if (allowTruncated) {
        return data;
      }
      throw error;
    }
  }
}

function writeFlvHeader(): Uint8Array {
  return new Uint8Array([
    0x46, 0x4c, 0x56, 0x01, 0x05, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00,
    0x00,
  ]);
}

function writeMetadataTag(metadata: Uint8Array): Uint8Array {
  return concatBytes([
    new Uint8Array([0x12]),
    uint24(metadata.byteLength),
    new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    metadata,
    u32(11 + metadata.byteLength),
  ]);
}

function requiredAttr(media: MediaNode, name: string): string {
  const value = media.attributes[name];
  if (!value) {
    throw new Error(`F4M media is missing ${name}`);
  }
  return value;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(
    parts.reduce((total, part) => total + part.byteLength, 0),
  );
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

function u32(value: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value);
  return out;
}

function uint24(value: number): Uint8Array {
  return u32(value).slice(1);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
