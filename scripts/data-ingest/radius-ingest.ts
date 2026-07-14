import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ELEMENT_SYMBOLS_BY_ATOMIC_NUMBER } from "../../packages/chemistry-engine/periodic-table";
import { ApprovedAtomicRadiusDatasetSchema, type RadiusDefinition } from "../../packages/chemistry-engine/radius-data";
import { ChemistryDecimal } from "../../packages/chemistry-engine/numeric";

export interface RadiusImportMetadata {
  readonly datasetId: string; readonly datasetVersion: string; readonly name: string; readonly definition: RadiusDefinition; readonly definitionDetail: string;
  readonly source: { readonly sourceId: string; readonly title: string; readonly primarySource: string; readonly editionOrVersion: string; readonly publicationYear: string; readonly url: string; readonly doi: string; readonly reportIdentifier?: string; readonly accessedAt: string; readonly sourceDigest?: string };
  readonly coordinationPolicy: string; readonly oxidationStatePolicy: string; readonly spinStatePolicy: string;
  readonly approval: { readonly status: "source-verified" | "provisional"; readonly sourceVerified: boolean; readonly labApproval: "not-reviewed" };
  readonly parsingWarnings: readonly string[];
}

export function parseRadiusTsv(tsv: string) {
  const lines = tsv.trim().split(/\r?\n/);
  const expected = "element\tradiusAngstrom\tselectionKey\tdefaultForPolicy\testimated\tsourceLocation\tnotes";
  if (lines.shift() !== expected) throw new Error("Unexpected reviewed radius fixture header.");
  return lines.map((line, index) => {
    const [element, radiusAngstrom, selectionKey, defaultForPolicy, estimated, sourceLocation, notes] = line.split("\t");
    if (!element || !radiusAngstrom || !selectionKey || !sourceLocation || notes === undefined) throw new Error(`Malformed radius fixture row ${index + 2}.`);
    if (!ELEMENT_SYMBOLS_BY_ATOMIC_NUMBER.includes(element as never)) throw new Error(`Unknown element ${element}.`);
    return { element, radiusPm: new ChemistryDecimal(radiusAngstrom).times(100).toFixed(), selectionKey, defaultForPolicy: defaultForPolicy === "true", estimated: estimated === "true", sourceLocation, notes };
  });
}

export async function buildRadiusDataset(fixturePath: string, metadata: RadiusImportMetadata) {
  const fixture = await readFile(resolve(fixturePath), "utf8");
  const values = parseRadiusTsv(fixture);
  const unique = [...new Set(values.map((item) => item.element))].sort((a, b) => ELEMENT_SYMBOLS_BY_ATOMIC_NUMBER.indexOf(a as never) - ELEMENT_SYMBOLS_BY_ATOMIC_NUMBER.indexOf(b as never));
  const missing = ELEMENT_SYMBOLS_BY_ATOMIC_NUMBER.filter((symbol) => !unique.includes(symbol));
  const scientificContent = {
    schemaVersion: "2.0.0" as const, datasetId: metadata.datasetId, datasetVersion: metadata.datasetVersion, name: metadata.name,
    definition: metadata.definition, definitionDetail: metadata.definitionDetail, source: metadata.source, units: "pm" as const,
    coordinationPolicy: metadata.coordinationPolicy, oxidationStatePolicy: metadata.oxidationStatePolicy, spinStatePolicy: metadata.spinStatePolicy,
    missingValuePolicy: "block-site-descriptor" as const, coverage: { elements: unique, missingElements: missing, recordCount: values.length },
    parsingWarnings: [...metadata.parsingWarnings], values,
  };
  const digest = createHash("sha256").update(JSON.stringify(scientificContent)).digest("hex");
  return ApprovedAtomicRadiusDatasetSchema.parse({ ...scientificContent, approval: metadata.approval, digest });
}

export async function writeRadiusDataset(fixturePath: string, outputPath: string, metadata: RadiusImportMetadata) {
  const dataset = await buildRadiusDataset(fixturePath, metadata);
  await writeFile(resolve(outputPath), `${JSON.stringify(dataset, null, 2)}\n`);
  return dataset;
}
