// Source: yt_dlp/utils/_utils.py XML helpers

import type { XmlElement } from "../compat/index.ts";

type XmlDefaultOptions<T> = {
  fatal?: boolean;
  default?: T | null;
  defaultValue?: T | null;
};

export function fixXmlAmpersands(xml: string): string {
  return xml.replaceAll(
    /&(?!amp;|lt;|gt;|apos;|quot;|#x[0-9a-fA-F]{0,4};|#[0-9]{0,4};)/g,
    "&amp;",
  );
}

export const fix_xml_ampersands = fixXmlAmpersands;

export function xpathWithNs(
  path: string,
  nsMap: Record<string, string>,
): string {
  return path
    .split("/")
    .map((component) => {
      const match = component.match(/^(?<axis>\.?\/?\/?)(?<prefix>[\w.-]+):(?<tag>[\w.-]+)$/);
      if (!match?.groups?.prefix || !match.groups.tag) {
        return component;
      }
      const namespace = nsMap[match.groups.prefix];
      if (namespace === undefined) {
        throw new Error(`Unknown XML namespace prefix ${match.groups.prefix}`);
      }
      return `${match.groups.axis ?? ""}{${namespace}}${match.groups.tag}`;
    })
    .join("/");
}

export const xpath_with_ns = xpathWithNs;

export function xpathElement(
  node: XmlElement,
  xpath: string | readonly string[],
  _name?: string | null,
  options?: { fatal?: boolean },
): XmlElement | null;
export function xpathElement<T>(
  node: XmlElement,
  xpath: string | readonly string[],
  _name: string | null | undefined,
  options: XmlDefaultOptions<T> & ({ default: T | null } | { defaultValue: T | null }),
): XmlElement | T | null;
export function xpathElement(
  node: XmlElement,
  xpath: string | readonly string[],
  _name?: string | null,
  options: XmlDefaultOptions<unknown> = {},
): XmlElement | unknown | null {
  const paths = typeof xpath === "string" ? [xpath] : xpath;
  for (const path of paths) {
    const found = findPath(node, path);
    if (found) {
      return found;
    }
  }
  if (hasDefault(options)) {
    return getDefault(options);
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
  options: XmlDefaultOptions<string> = {},
): string | null {
  const paths = typeof xpath === "string" ? [xpath] : xpath;
  let found: XmlElement | null = null;
  for (const path of paths) {
    found = findPath(node, path);
    if (found) {
      break;
    }
  }
  if (!found) {
    if (hasDefault(options)) {
      return getDefault(options);
    }
    if (options.fatal) {
      throw new Error(
        `Could not find XML element ${name ?? (typeof xpath === "string" ? xpath : xpath[0])}`,
      );
    }
    return null;
  }
  if (found.text === null) {
    if (hasDefault(options)) {
      return getDefault(options);
    }
    if (options.fatal) {
      throw new Error(
        `Could not find XML element's text ${name ?? (typeof xpath === "string" ? xpath : xpath[0])}`,
      );
    }
    return null;
  }
  return found.text;
}

export const xpath_text = xpathText;

export function xmlFindAll(node: XmlElement, tag: string): XmlElement[] {
  return node.children.filter((child) => xmlTagMatches(child, tag));
}

export function xmlFind(node: XmlElement, tag: string): XmlElement | null {
  return xmlFindAll(node, tag)[0] ?? null;
}

function findPath(node: XmlElement, path: string): XmlElement | null {
  return findPathAll(node, path)[0] ?? null;
}

export function findXmlPathAll(node: XmlElement, path: string): XmlElement[] {
  return findPathAll(node, path);
}

function findPathAll(node: XmlElement, path: string): XmlElement[] {
  let expression = path;
  let descendants = false;
  if (expression.startsWith(".//")) {
    descendants = true;
    expression = expression.slice(3);
  } else if (expression.startsWith("./")) {
    expression = expression.slice(2);
  }

  const parts = splitXmlPath(expression).filter(Boolean);
  let current = descendants ? xmlDescendants(node) : [node];
  for (const part of parts) {
    const parsed = parseXmlPathPart(part);
    const next: XmlElement[] = [];
    for (const item of current) {
      const candidates = descendants && part === parts[0] ? [item] : item.children;
      next.push(...candidates.filter((child) => xmlPathPartMatches(child, parsed)));
    }
    current = next;
    descendants = false;
    if (!current.length) {
      break;
    }
  }
  return current;
}

function splitXmlPath(path: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let namespaceDepth = 0;
  for (let index = 0; index < path.length; index += 1) {
    const char = path[index];
    if (char === "{") namespaceDepth += 1;
    if (char === "}") namespaceDepth = Math.max(0, namespaceDepth - 1);
    if (char === "/" && namespaceDepth === 0) {
      parts.push(path.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(path.slice(start));
  return parts;
}

function parseXmlPathPart(part: string): {
  tag: string;
  attr?: string;
  attrValue?: string;
} {
  const match = part.match(
    /^(?<tag>\*|(?:\{[^}]+\})?[\w.-]+)(?:\[@(?<attr>[A-Za-z_-]+)(?:=['"](?<value>[^'"]*)['"])?\])?$/,
  );
  if (!match?.groups?.tag) {
    throw new SyntaxError(`Unsupported XML xpath component ${part}`);
  }
  return {
    tag: match.groups.tag,
    attr: match.groups.attr,
    attrValue: match.groups.value,
  };
}

function xmlPathPartMatches(
  element: XmlElement,
  part: { tag: string; attr?: string; attrValue?: string },
): boolean {
  if (!xmlTagMatches(element, part.tag)) {
    return false;
  }
  if (!part.attr) {
    return true;
  }
  if (!(part.attr in element.attrib)) {
    return false;
  }
  return part.attrValue === undefined || element.attrib[part.attr] === part.attrValue;
}

function xmlDescendants(element: XmlElement): XmlElement[] {
  const out: XmlElement[] = [];
  const visit = (node: XmlElement) => {
    for (const child of node.children) {
      out.push(child);
      visit(child);
    }
  };
  visit(element);
  return out;
}

function xmlTagMatches(element: XmlElement, tag: string): boolean {
  return tag === "*" || element.tag === tag || xmlLocalName(element.tag) === tag;
}

function xmlLocalName(tag: string): string {
  const namespaceEnd = tag.lastIndexOf("}");
  return namespaceEnd >= 0 ? tag.slice(namespaceEnd + 1) : tag;
}

function hasDefault<T>(options: XmlDefaultOptions<T>): boolean {
  return "defaultValue" in options || "default" in options;
}

function getDefault<T>(options: XmlDefaultOptions<T>): T | null {
  return (options.defaultValue ?? options.default) ?? null;
}
