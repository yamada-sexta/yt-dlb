// Source: yt_dlp/utils/_utils.py XML helpers

import type { XmlElement } from "../compat/index.ts";

export function fixXmlAmpersands(xml: string): string {
  return xml.replaceAll(/&(?!amp;|lt;|gt;|apos;|quot;|#x[0-9a-fA-F]{0,4};|#[0-9]{0,4};)/g, "&amp;");
}

export const fix_xml_ampersands = fixXmlAmpersands;

export function xpathWithNs(path: string, nsMap: Record<string, string>): string {
  return path.split("/").map((component) => {
    const [prefix, tag] = component.split(":", 2);
    return tag ? `{${nsMap[prefix!]}}${tag}` : component;
  }).join("/");
}

export const xpath_with_ns = xpathWithNs;

export function xpathElement(
  node: XmlElement,
  xpath: string | readonly string[],
  _name?: string | null,
  options: { fatal?: boolean; defaultValue?: XmlElement | null } = {},
): XmlElement | null {
  const paths = typeof xpath === "string" ? [xpath] : xpath;
  for (const path of paths) {
    const found = findPath(node, path);
    if (found) {
      return found;
    }
  }
  if ("defaultValue" in options) {
    return options.defaultValue ?? null;
  }
  if (options.fatal) {
    throw new Error(`Could not find XML element ${_name ?? paths[0]}`);
  }
  return null;
}

export const xpath_element = xpathElement;

export function xpathText(
  node: XmlElement,
  xpath: string | readonly string[],
  name?: string | null,
  options: { fatal?: boolean; defaultValue?: string | null } = {},
): string | null {
  const found = xpathElement(node, xpath, name, { fatal: options.fatal });
  if (!found?.text) {
    if ("defaultValue" in options) {
      return options.defaultValue ?? null;
    }
    if (options.fatal) {
      throw new Error(`Could not find XML element's text ${name ?? (typeof xpath === "string" ? xpath : xpath[0])}`);
    }
    return null;
  }
  return found.text;
}

export const xpath_text = xpathText;

export function xmlFindAll(node: XmlElement, tag: string): XmlElement[] {
  return node.children.filter((child) => child.tag === tag);
}

export function xmlFind(node: XmlElement, tag: string): XmlElement | null {
  return node.children.find((child) => child.tag === tag) ?? null;
}

function findPath(node: XmlElement, path: string): XmlElement | null {
  let current: XmlElement | null = node;
  for (const part of path.split("/")) {
    if (!current) {
      return null;
    }
    current = xmlFind(current, part);
  }
  return current;
}
