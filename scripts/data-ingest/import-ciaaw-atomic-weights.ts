import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ELEMENT_SYMBOLS_BY_ATOMIC_NUMBER } from "../../packages/chemistry-engine/periodic-table";
import { ElementDataSetSchema } from "../../packages/chemistry-engine/element-data-schema";

export const CIAAW_STANDARD_URL = "https://ciaaw.org/atomic-weights.htm";
export const CIAAW_ABRIDGED_URL = "https://ciaaw.org/abridged-atomic-weights.htm";
const ACCESS_DATE = "2026-07-14T00:00:00-04:00";

type ParsedRow = Readonly<{ atomicNumber: number; symbol: string; name: string; value: string; uncertainty?: string }>;

function text(value: string): string {
  return value.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&mdash;/g, "—").replace(/&plusmn;/g, "±").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}

export function parseCiaawTable(html: string): readonly ParsedRow[] {
  const rows: ParsedRow[] = [];
  for (const match of html.matchAll(/<tr><td>(\d+)<\/td><td>([A-Z][a-z]?)<\/td><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><td>[\s\S]*?<\/td><\/tr>/g)) {
    const atomicNumber = Number(match[1]);
    const symbol = match[2]!;
    const name = text(match[3]!);
    const raw = text(match[4]!).replace(/\s/g, "");
    const [value = raw, uncertainty] = raw.split("±");
    rows.push(Object.freeze({ atomicNumber, symbol, name, value, ...(uncertainty ? { uncertainty } : {}) }));
  }
  rows.sort((a, b) => a.atomicNumber - b.atomicNumber);
  return Object.freeze(rows);
}

function pointValue(raw: string): { value: string; uncertainty?: string } {
  const compact = raw.replace(/\s/g, "");
  const match = compact.match(/^([0-9.]+)(?:\(([0-9]+)\))?$/);
  if (!match) throw new Error(`Unsupported CIAAW point value: ${raw}`);
  const value = match[1]!;
  if (!match[2]) return { value };
  const decimals = value.includes(".") ? value.length - value.indexOf(".") - 1 : 0;
  return { value, uncertainty: `${Number(match[2]) * 10 ** -decimals}` };
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function buildCiaawDataset(standardHtml: string, abridgedHtml: string) {
  const standard = parseCiaawTable(standardHtml);
  const abridged = new Map(parseCiaawTable(abridgedHtml).map((row) => [row.symbol, row]));
  if (standard.length !== 118) throw new Error(`Expected 118 standard-table rows, received ${standard.length}.`);
  const seen = new Set<string>();
  const elements = standard.map((row) => {
    const expected = ELEMENT_SYMBOLS_BY_ATOMIC_NUMBER[row.atomicNumber - 1];
    if (row.symbol !== expected || seen.has(row.symbol)) throw new Error(`Invalid or duplicate element row ${row.atomicNumber}:${row.symbol}.`);
    seen.add(row.symbol);
    const calculation = abridged.get(row.symbol);
    if (row.value === "—") return { atomicNumber: row.atomicNumber, symbol: row.symbol, name: row.name, standardAtomicWeight: { kind: "unavailable" as const, reason: "no-standard-atomic-weight" as const }, calculationValue: null, calculationValuePolicy: "unavailable" as const, sourceIds: ["ciaaw-standard-2024"], notes: "CIAAW publishes no standard atomic weight; no representative mass number is used for calculation." };
    const interval = row.value.match(/^\[([0-9.]+),([0-9.]+)\]$/);
    const standardAtomicWeight = interval ? { kind: "interval" as const, lower: interval[1]!, upper: interval[2]! } : { kind: "point" as const, ...pointValue(row.value) };
    const calculationValue = calculation?.value === "—" ? null : calculation?.value ?? (standardAtomicWeight.kind === "point" ? standardAtomicWeight.value : null);
    if (!calculationValue) throw new Error(`Missing abridged calculation value for ${row.symbol}.`);
    return { atomicNumber: row.atomicNumber, symbol: row.symbol, name: row.name, standardAtomicWeight, calculationValue, calculationValuePolicy: calculation ? "abridged-standard-value" as const : "point-value" as const, sourceIds: calculation ? ["ciaaw-standard-2024", "ciaaw-abridged-2024"] : ["ciaaw-standard-2024"] };
  });
  const content = {
    schemaVersion: "2.0.0" as const,
    dataVersion: "2024.2.0",
    title: "CIAAW 2024 standard and abridged atomic weights — complete element registry",
    effectiveDate: "2024-01-01",
    unit: "g/mol" as const,
    calculationValuePolicyDescription: "Use the explicit CIAAW 2024 abridged value when published; otherwise use the CIAAW point value. Never substitute a representative mass number.",
    sources: [
      { id: "ciaaw-standard-2024", title: "Standard Atomic Weights 2024", organization: "IUPAC Commission on Isotopic Abundances and Atomic Weights", url: CIAAW_STANDARD_URL, accessedAt: ACCESS_DATE },
      { id: "ciaaw-abridged-2024", title: "Abridged Standard Atomic Weights 2024", organization: "IUPAC Commission on Isotopic Abundances and Atomic Weights", url: CIAAW_ABRIDGED_URL, accessedAt: ACCESS_DATE },
    ],
    elements,
  };
  const digest = createHash("sha256").update(JSON.stringify(content)).digest("hex");
  return ElementDataSetSchema.parse({ ...content, digest });
}

async function loadSource(path: string | undefined, url: string): Promise<string> {
  if (path) return readFile(resolve(path), "utf8");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`CIAAW retrieval failed: ${response.status} ${response.statusText}`);
  return response.text();
}

export function buildCoverageReport(dataset: ReturnType<typeof buildCiaawDataset>) {
  const usable = dataset.elements.filter((item) => item.calculationValue !== null).map((item) => item.symbol);
  const unavailable = dataset.elements.filter((item) => item.calculationValue === null).map((item) => item.symbol);
  return { datasetVersion: dataset.dataVersion, digest: dataset.digest, registryElements: dataset.elements.length, usableCalculationValues: usable.length, unavailableCalculationValues: unavailable.length, usable, unavailable };
}

async function main() {
  const standard = await loadSource(process.env.CIAAW_STANDARD_FIXTURE, CIAAW_STANDARD_URL);
  const abridged = await loadSource(process.env.CIAAW_ABRIDGED_FIXTURE, CIAAW_ABRIDGED_URL);
  const dataset = buildCiaawDataset(standard, abridged);
  await writeFile(resolve("data/elements.json"), canonicalJson(dataset));
  await writeFile(resolve("data/atomic-weight-coverage.json"), canonicalJson(buildCoverageReport(dataset)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
