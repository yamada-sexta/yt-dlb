// Source: yt_dlp/compat/__init__.py
// Port note: Python compatibility shims are reduced to Bun/Web equivalents used by the TypeScript rewrite.

import { homedir } from "node:os";

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

export interface XmlElement {
  tag: string;
  attrib: Record<string, string>;
  text: string | null;
  children: XmlElement[];
}

export function compatEtreeFromstring(text: string): XmlElement {
  return parseXml(text);
}

export function urllibReqToReq(request: Request): Request {
  return request;
}

export const compat_ord = compatOrd;
export const compat_datetime_from_timestamp = compatDatetimeFromTimestamp;
export const compat_expanduser = compatExpanduser;
export const compat_etree_fromstring = compatEtreeFromstring;
export const urllib_req_to_req = urllibReqToReq;

function parseXml(text: string): XmlElement {
  const cleaned = text.replaceAll(/<\?xml[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<!--[\s\S]*?-->/g, "");
  const root: XmlElement = { tag: "__root__", attrib: {}, text: null, children: [] };
  const stack: Array<{ element: XmlElement; namespaces: Record<string, string> }> = [{ element: root, namespaces: {} }];
  const tagPattern = /<(?<closing>\/)?(?<name>[^\s/>]+)(?<attrs>[^>]*?)(?<self>\/)?>/g;
  let lastIndex = 0;
  for (const match of cleaned.matchAll(tagPattern)) {
    const current = stack.at(-1);
    if (!current) {
      throw new Error("XML parser stack unexpectedly empty");
    }
    const textChunk = cleaned.slice(lastIndex, match.index);
    if (textChunk.trim()) {
      current.element.text = (current.element.text ?? "") + xmlUnescape(textChunk);
    }
    lastIndex = (match.index ?? 0) + match[0].length;
    const name = match.groups?.name;
    if (!name) {
      continue;
    }
    if (match.groups?.closing) {
      stack.pop();
      continue;
    }
    const rawAttributes = parseXmlAttributes(match.groups?.attrs ?? "");
    const namespaces = { ...current.namespaces };
    for (const [key, value] of Object.entries(rawAttributes)) {
      if (key === "xmlns") {
        namespaces[""] = value;
      } else if (key.startsWith("xmlns:")) {
        namespaces[key.slice("xmlns:".length)] = value;
      }
    }
    const attrib: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawAttributes)) {
      if (!key.startsWith("xmlns")) {
        attrib[key] = value;
      }
    }
    const element: XmlElement = { tag: qualifyName(name, namespaces), attrib, text: null, children: [] };
    current.element.children.push(element);
    if (!match.groups?.self) {
      stack.push({ element, namespaces });
    }
  }
  const first = root.children[0];
  if (!first) {
    throw new Error("XML document has no root element");
  }
  return first;
}

function parseXmlAttributes(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const pattern = /(?<key>[\w:-]+)\s*=\s*(?:"(?<double>[^"]*)"|'(?<single>[^']*)')/g;
  for (const match of text.matchAll(pattern)) {
    const key = match.groups?.key;
    if (key) {
      out[key] = xmlUnescape(match.groups?.double ?? match.groups?.single ?? "");
    }
  }
  return out;
}

function qualifyName(name: string, namespaces: Record<string, string>): string {
  const [prefix, local] = name.includes(":") ? name.split(":", 2) : ["", name];
  const namespace = namespaces[prefix ?? ""];
  return namespace ? `{${namespace}}${local}` : name;
}

function xmlUnescape(text: string): string {
  return text
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
