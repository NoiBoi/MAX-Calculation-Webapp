import {
  EMI_PARSER_VERSION,
  ENGINE_VERSION,
  type EmiDataset,
  type EmiDirection,
  type EmiInterpolationOptions,
  type EmiMetric,
  type EmiValidationOptions,
} from "@max-stoich/chemistry-engine";
import type { EmiArealDensityUnit, EmiThicknessUnit } from "@max-stoich/chemistry-engine";
import { MaxStoichDatabase } from "../persistence/database";

export const EMI_PROJECT_SCHEMA_VERSION = "1.0.0" as const;

export interface EmiSampleMetadata {
  readonly displayName: string;
  readonly sampleId?: string;
  readonly group?: string;
  readonly replicateNumber?: number;
  readonly material?: string;
  readonly thickness?: number;
  readonly thicknessUnit?: EmiThicknessUnit;
  readonly arealDensity?: number;
  readonly arealDensityUnit?: EmiArealDensityUnit;
  readonly testDate?: string;
  readonly directionNotes?: string;
  readonly notes?: string;
}

export interface EmiProjectDataset {
  readonly id: string;
  readonly originalFilename: string;
  readonly parsedDataset: EmiDataset;
  readonly sampleMetadata: EmiSampleMetadata;
  readonly importedAt: string;
  readonly parserVersion: string;
}

export interface EmiReplicateGroupDefinition {
  readonly id: string;
  readonly name: string;
  readonly datasetIds: readonly string[];
}

export interface EmiPlotConfiguration {
  readonly preset: "screen" | "presentation" | "single-column" | "double-column";
  readonly title: string;
  readonly subtitle: string;
  readonly xAxisLabel: string;
  readonly shieldingYAxisLabel: string;
  readonly powerYAxisLabel: string;
  readonly frequencyUnit: "GHz" | "Hz";
  readonly xScale: "linear" | "logarithmic";
  readonly shieldingYMinimum?: number;
  readonly shieldingYMaximum?: number;
  readonly powerYMinimum?: number;
  readonly powerYMaximum?: number;
  readonly legendPosition: "top" | "right" | "bottom" | "none";
  readonly lineStyle: "solid" | "dashed" | "mixed";
  readonly markerVisibility: boolean;
  readonly uncertaintyBand: "none" | "standard-deviation" | "confidence-95";
  readonly medianVisibility: boolean;
  readonly gridVisibility: boolean;
  readonly fontSizePreset: "compact" | "standard" | "large";
  readonly aspectRatio: "4:3" | "16:9" | "3:2";
  readonly figureWidth: number;
  readonly figureHeight: number;
  readonly rasterScale: 1 | 2 | 3 | 4;
  readonly lightBackground: boolean;
  readonly showIndividualReplicates: boolean;
}

export interface EmiProjectRecord {
  readonly schemaVersion: typeof EMI_PROJECT_SCHEMA_VERSION;
  readonly recordType: "maxcalc-emi-project";
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly datasets: readonly EmiProjectDataset[];
  readonly groups: readonly EmiReplicateGroupDefinition[];
  readonly selectedDatasetIds: readonly string[];
  readonly selectedDirections: readonly EmiDirection[];
  readonly frequencyRangeHz: Readonly<{ minimumHz?: number; maximumHz?: number }>;
  readonly visibleMetrics: readonly EmiMetric[];
  readonly interpolation: EmiInterpolationOptions;
  readonly plot: EmiPlotConfiguration;
  readonly qualityControl: EmiValidationOptions;
  readonly notes: string;
  readonly calculationEngineVersion: string;
  readonly parserVersion: string;
}

export function defaultEmiPlotConfiguration(): EmiPlotConfiguration {
  return { preset: "screen", title: "", subtitle: "", xAxisLabel: "Frequency", shieldingYAxisLabel: "Shielding effectiveness (dB)", powerYAxisLabel: "Incident-power coefficient", frequencyUnit: "GHz", xScale: "linear", legendPosition: "top", lineStyle: "mixed", markerVisibility: false, uncertaintyBand: "standard-deviation", medianVisibility: false, gridVisibility: true, fontSizePreset: "standard", aspectRatio: "3:2", figureWidth: 1200, figureHeight: 800, rasterScale: 2, lightBackground: true, showIndividualReplicates: true };
}

export function createEmptyEmiProject(name = "Untitled EMI project", now = new Date().toISOString()): EmiProjectRecord {
  return { schemaVersion: EMI_PROJECT_SCHEMA_VERSION, recordType: "maxcalc-emi-project", id: crypto.randomUUID(), name, createdAt: now, updatedAt: now, datasets: [], groups: [], selectedDatasetIds: [], selectedDirections: ["forward"], frequencyRangeHz: {}, visibleMetrics: ["SET", "SER", "SEA", "R", "T", "A"], interpolation: { enabled: false, strategy: "reference-grid", overlapOnly: true }, plot: defaultEmiPlotConfiguration(), qualityControl: {}, notes: "", calculationEngineVersion: ENGINE_VERSION, parserVersion: EMI_PARSER_VERSION };
}

export interface EmiMetadataSuggestion {
  readonly sampleId?: string;
  readonly group?: string;
  readonly replicateNumber?: number;
  readonly material?: string;
  readonly rationale: string;
}

/** Suggestions are never applied automatically; filenames are not treated as scientific metadata. */
export function suggestEmiMetadata(filename: string): EmiMetadataSuggestion {
  const stem = filename.replace(/\.csv$/i, "");
  const replicateMatch = /^(.*?)(?:\.(\d+))$/.exec(stem);
  const base = replicateMatch?.[1] ?? stem;
  const replicateNumber = replicateMatch ? Number(replicateMatch[2]) : undefined;
  const dateRemoved = base.replace(/-\d{6}$/i, "");
  const material = dateRemoved.startsWith("(") ? dateRemoved : undefined;
  return { sampleId: base, group: dateRemoved || base, ...(replicateNumber !== undefined ? { replicateNumber } : {}), ...(material ? { material } : {}), rationale: "Suggested only from the filename stem and trailing numeric suffix; review before applying." };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class EmiProjectImportError extends Error {
  constructor(readonly code: "MALFORMED_PROJECT" | "UNSUPPORTED_PROJECT_VERSION", message: string) { super(message); }
}

export function parseEmiProjectJson(text: string): EmiProjectRecord {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new EmiProjectImportError("MALFORMED_PROJECT", "The selected file is not valid JSON."); }
  if (!isRecord(value)) throw new EmiProjectImportError("MALFORMED_PROJECT", "The project root must be a JSON object.");
  if (value.schemaVersion !== EMI_PROJECT_SCHEMA_VERSION) throw new EmiProjectImportError("UNSUPPORTED_PROJECT_VERSION", `Unsupported EMI project schema ${String(value.schemaVersion ?? "missing")}; this release requires ${EMI_PROJECT_SCHEMA_VERSION}.`);
  if (value.recordType !== "maxcalc-emi-project" || typeof value.id !== "string" || typeof value.name !== "string" || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string" || !Array.isArray(value.datasets) || !Array.isArray(value.groups)) throw new EmiProjectImportError("MALFORMED_PROJECT", "The project is missing required identity, timestamp, dataset, or group fields.");
  for (const [index, entry] of value.datasets.entries()) {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.originalFilename !== "string" || typeof entry.importedAt !== "string" || typeof entry.parserVersion !== "string" || !isRecord(entry.parsedDataset) || !Array.isArray(entry.parsedDataset.points) || !isRecord(entry.sampleMetadata) || typeof entry.sampleMetadata.displayName !== "string") throw new EmiProjectImportError("MALFORMED_PROJECT", `Dataset ${index + 1} is incomplete or malformed.`);
  }
  const datasetIds = new Set(value.datasets.map((entry) => (entry as Record<string, unknown>).id));
  for (const [index, group] of value.groups.entries()) {
    if (!isRecord(group) || typeof group.id !== "string" || typeof group.name !== "string" || !Array.isArray(group.datasetIds) || !group.datasetIds.every((id) => typeof id === "string" && datasetIds.has(id))) throw new EmiProjectImportError("MALFORMED_PROJECT", `Replicate group ${index + 1} is malformed or references an unknown dataset.`);
  }
  const validDirections = new Set(["forward", "reverse"]);
  const validMetrics = new Set(["SET", "SER", "SEA", "R", "T", "A"]);
  if (!Array.isArray(value.selectedDatasetIds) || !value.selectedDatasetIds.every((id) => typeof id === "string" && datasetIds.has(id)) || !Array.isArray(value.selectedDirections) || !value.selectedDirections.every((direction) => validDirections.has(String(direction))) || !Array.isArray(value.visibleMetrics) || !value.visibleMetrics.every((metric) => validMetrics.has(String(metric)))) throw new EmiProjectImportError("MALFORMED_PROJECT", "Project selections contain unknown datasets, directions, or metrics.");
  if (!isRecord(value.frequencyRangeHz) || !isRecord(value.interpolation) || typeof value.interpolation.enabled !== "boolean" || !["reference-grid", "frequency-interval", "point-count"].includes(String(value.interpolation.strategy)) || typeof value.interpolation.overlapOnly !== "boolean" || !isRecord(value.plot) || !isRecord(value.qualityControl) || typeof value.notes !== "string" || typeof value.calculationEngineVersion !== "string" || typeof value.parserVersion !== "string") throw new EmiProjectImportError("MALFORMED_PROJECT", "Project analysis, plot, or provenance settings are incomplete.");
  return value as unknown as EmiProjectRecord;
}

export function serializeEmiProject(project: EmiProjectRecord): string {
  return JSON.stringify(project, null, 2);
}

export function addEmiReplicateGroup(project: EmiProjectRecord, name: string, datasetIds: readonly string[], id = crypto.randomUUID()): EmiProjectRecord {
  const known = new Set(project.datasets.map((entry) => entry.id));
  const members = [...new Set(datasetIds)].filter((datasetId) => known.has(datasetId));
  return { ...project, groups: [...project.groups, { id, name: name.trim() || `Replicate group ${project.groups.length + 1}`, datasetIds: members }] };
}

export class EmiProjectRepository {
  constructor(private readonly database = new MaxStoichDatabase()) {}
  list(): Promise<EmiProjectRecord[]> { return this.database.emiProjects.orderBy("updatedAt").reverse().toArray(); }
  get(id: string): Promise<EmiProjectRecord | undefined> { return this.database.emiProjects.get(id); }
  async save(project: EmiProjectRecord): Promise<EmiProjectRecord> {
    const saved = { ...project, updatedAt: new Date().toISOString(), calculationEngineVersion: ENGINE_VERSION, parserVersion: EMI_PARSER_VERSION };
    await this.database.emiProjects.put(saved);
    return saved;
  }
  async duplicate(project: EmiProjectRecord): Promise<EmiProjectRecord> {
    const now = new Date().toISOString();
    const duplicate = { ...project, id: crypto.randomUUID(), name: `${project.name} (copy)`, createdAt: now, updatedAt: now };
    await this.database.emiProjects.put(duplicate);
    return duplicate;
  }
  delete(id: string): Promise<void> { return this.database.emiProjects.delete(id); }
}
