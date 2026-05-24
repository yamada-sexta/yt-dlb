// Source: new TypeScript declarations for npm modules used by the vendored EJS solver.
// These packages do not ship complete local declarations in this staged migration.

declare module "meriyah" {
  export function parse(source: string, options?: Record<string, unknown>): unknown;
}

declare module "astring" {
  export function generate(node: unknown, options?: Record<string, unknown>): string;
}
