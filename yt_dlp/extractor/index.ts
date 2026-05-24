// Source: yt_dlp/extractor/__init__.py
// Port note: extractor registration is async because Bun Glob and ESM imports are async.

import { extractors, pluginIes } from "../globals.ts";
import { registerPluginSpec } from "../plugins.ts";
import { InfoExtractor } from "./common.ts";
import { importExtractors, type InfoExtractorConstructor } from "./internal-extractors.ts";

registerPluginSpec({
  moduleName: "extractor",
  suffix: "IE",
  destination: extractors,
  pluginDestination: pluginIes,
});

export { InfoExtractor };
export * from "./common.ts";
export * from "./internal-extractors.ts";

export async function genExtractorClasses(): Promise<InfoExtractorConstructor[]> {
  return Object.values(await importExtractors());
}

export async function genExtractors(): Promise<InfoExtractor[]> {
  return (await genExtractorClasses()).map((Extractor) => new Extractor());
}

export async function listExtractorClasses(_ageLimit: number | null = null): Promise<InfoExtractorConstructor[]> {
  return (await genExtractorClasses())
    .sort((left, right) => left.IE_NAME.localeCompare(right.IE_NAME));
}

export async function listExtractors(ageLimit: number | null = null): Promise<InfoExtractor[]> {
  return (await listExtractorClasses(ageLimit)).map((Extractor) => new Extractor());
}

export async function getInfoExtractor(ieName: string): Promise<InfoExtractorConstructor> {
  const registry = await importExtractors();
  const key = `${ieName}IE`;
  const Extractor = registry[key];
  if (!Extractor) {
    throw new Error(`Unknown info extractor: ${ieName}`);
  }
  return Extractor;
}

export const gen_extractor_classes = genExtractorClasses;
export const gen_extractors = genExtractors;
export const list_extractor_classes = listExtractorClasses;
export const list_extractors = listExtractors;
export const get_info_extractor = getInfoExtractor;
export const import_extractors = importExtractors;
