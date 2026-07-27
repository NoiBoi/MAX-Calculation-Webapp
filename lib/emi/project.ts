import {
  EMI_PARSER_VERSION,
  EMI_ELECTRICAL_CALCULATION_VERSION,
  ENGINE_VERSION,
  FOUR_POINT_PROBE_CORRECTION_FACTOR,
  calculateElectricalPropertySummary,
  convertThicknessToMicrometers,
  normalizeEmiThickness,
  type NormalizedEmiThickness,
  type ElectricalPropertySummary,
  type EmiDataset,
  type EmiDirection,
  type EmiInterpolationOptions,
  type EmiMetric,
  type EmiValidationOptions,
} from "@max-stoich/chemistry-engine";
import type { EmiArealDensityUnit, EmiThicknessUnit } from "@max-stoich/chemistry-engine";
import { MaxStoichDatabase } from "../persistence/database";

export const EMI_PROJECT_SCHEMA_VERSION = "3.0.0" as const;
export const EMI_PROJECT_LEGACY_SCHEMA_VERSION = "1.0.0" as const;
export const EMI_PROJECT_PREVIOUS_SCHEMA_VERSION = "2.0.0" as const;

export interface EmiElectricalPropertyRecord {
  readonly rawResistanceReadingsOhm: readonly (number | null)[];
  readonly correctionFactor: number;
  readonly calculationVersion: string;
  readonly measurementNote?: string;
  /** Reproducible snapshot derived from the stored inputs; absent for invalid or partial inputs. */
  readonly derived?: ElectricalPropertySummary;
}

export interface EmiThicknessConflict {
  readonly status: "unresolved";
  readonly metadataThickness: Readonly<{ value: number; unit: EmiThicknessUnit }>;
  readonly legacyElectricalThicknessMicrometers: number;
}

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
  readonly electricalProperties?: EmiElectricalPropertyRecord;
  /** Preserves conflicting legacy values until the user explicitly resolves authority. */
  readonly thicknessConflict?: EmiThicknessConflict;
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

export function calculateEmiElectricalRecord(input: Readonly<{
  thicknessMicrometers?: number | null;
  rawResistanceReadingsOhm?: readonly (number | null)[];
  correctionFactor?: number;
  measurementNote?: string;
}>): EmiElectricalPropertyRecord {
  const thicknessMicrometers = input.thicknessMicrometers;
  const rawResistanceReadingsOhm = input.rawResistanceReadingsOhm ?? [];
  const correctionFactor = input.correctionFactor ?? FOUR_POINT_PROBE_CORRECTION_FACTOR;
  const calculated = calculateElectricalPropertySummary({ rawResistanceReadingsOhm, thicknessMicrometers, correctionFactor });
  return {
    rawResistanceReadingsOhm,
    correctionFactor,
    calculationVersion: EMI_ELECTRICAL_CALCULATION_VERSION,
    measurementNote: input.measurementNote,
    ...(calculated.ok ? { derived: calculated.value } : {}),
  };
}

export function getAuthoritativeThicknessMicrometers(dataset: EmiProjectDataset): number | null {
  return getAuthoritativeNormalizedThickness(dataset)?.micrometers ?? null;
}

export function getAuthoritativeNormalizedThickness(dataset: EmiProjectDataset): NormalizedEmiThickness | null {
  if (dataset.thicknessConflict) return null;
  const { thickness, thicknessUnit } = dataset.sampleMetadata;
  return thickness === undefined || thicknessUnit === undefined ? null : normalizeEmiThickness(thickness, thicknessUnit);
}

function equivalentThickness(left: number, right: number): boolean {
  return Math.abs(left - right) <= Number.EPSILON * 16 * Math.max(1, Math.abs(left), Math.abs(right));
}

function rebuildElectrical(electrical: Record<string, unknown>, thicknessMicrometers: number | null): EmiElectricalPropertyRecord {
  return calculateEmiElectricalRecord({
    thicknessMicrometers,
    rawResistanceReadingsOhm: Array.isArray(electrical.rawResistanceReadingsOhm) ? electrical.rawResistanceReadingsOhm.map((reading) => typeof reading === "number" ? reading : null) : [],
    correctionFactor: typeof electrical.correctionFactor === "number" ? electrical.correctionFactor : FOUR_POINT_PROBE_CORRECTION_FACTOR,
    measurementNote: typeof electrical.measurementNote === "string" ? electrical.measurementNote : undefined,
  });
}

export function resolveEmiThicknessConflict(dataset: EmiProjectDataset, source: "metadata" | "legacy-electrical"): EmiProjectDataset {
  const conflict = dataset.thicknessConflict;
  if (!conflict) return dataset;
  const sampleMetadata = source === "metadata"
    ? dataset.sampleMetadata
    : { ...dataset.sampleMetadata, thickness: conflict.legacyElectricalThicknessMicrometers, thicknessUnit: "um" as const };
  const thicknessMicrometers = convertThicknessToMicrometers(sampleMetadata.thickness!, sampleMetadata.thicknessUnit!);
  const electrical = dataset.electricalProperties as unknown as Record<string, unknown> | undefined;
  return {
    ...dataset,
    sampleMetadata,
    thicknessConflict: undefined,
    ...(electrical ? { electricalProperties: rebuildElectrical(electrical, thicknessMicrometers) } : {}),
  };
}

function migrateEmiProject(value: Record<string, unknown>): EmiProjectRecord {
  const datasets = (value.datasets as readonly Record<string, unknown>[]).map((entry) => {
    const electrical = isRecord(entry.electricalProperties) ? entry.electricalProperties : undefined;
    const rawSampleMetadata = entry.sampleMetadata as unknown as EmiSampleMetadata;
    // Historical UI displayed mm as the selected default even when it failed to persist the unit.
    const sampleMetadata = rawSampleMetadata.thickness !== undefined && rawSampleMetadata.thicknessUnit === undefined
      ? { ...rawSampleMetadata, thicknessUnit: "mm" as const }
      : rawSampleMetadata;
    const metadataMicrometers = sampleMetadata.thickness !== undefined && sampleMetadata.thicknessUnit
      ? convertThicknessToMicrometers(sampleMetadata.thickness, sampleMetadata.thicknessUnit)
      : null;
    const legacyMicrometers = electrical && typeof electrical.thicknessMicrometers === "number" && Number.isFinite(electrical.thicknessMicrometers) && electrical.thicknessMicrometers > 0
      ? electrical.thicknessMicrometers
      : null;
    const preservedConflict = isRecord(entry.thicknessConflict) ? entry.thicknessConflict as unknown as EmiThicknessConflict : undefined;
    const conflict = preservedConflict ?? (metadataMicrometers !== null && legacyMicrometers !== null && !equivalentThickness(metadataMicrometers, legacyMicrometers)
      ? { status: "unresolved" as const, metadataThickness: { value: sampleMetadata.thickness!, unit: sampleMetadata.thicknessUnit! }, legacyElectricalThicknessMicrometers: legacyMicrometers }
      : undefined);
    const migratedMetadata = metadataMicrometers === null && legacyMicrometers !== null
      ? { ...sampleMetadata, thickness: legacyMicrometers, thicknessUnit: "um" as const }
      : sampleMetadata;
    const authoritativeMicrometers = conflict ? null : (metadataMicrometers ?? legacyMicrometers);
    return {
      ...entry,
      sampleMetadata: migratedMetadata,
      ...(electrical ? { electricalProperties: rebuildElectrical(electrical, authoritativeMicrometers) } : {}),
      ...(conflict ? { thicknessConflict: conflict } : { thicknessConflict: undefined }),
    };
  });
  return { ...value, schemaVersion: EMI_PROJECT_SCHEMA_VERSION, datasets } as unknown as EmiProjectRecord;
}

export function parseEmiProjectJson(text: string): EmiProjectRecord {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new EmiProjectImportError("MALFORMED_PROJECT", "The selected file is not valid JSON."); }
  if (!isRecord(value)) throw new EmiProjectImportError("MALFORMED_PROJECT", "The project root must be a JSON object.");
  if (![EMI_PROJECT_SCHEMA_VERSION, EMI_PROJECT_PREVIOUS_SCHEMA_VERSION, EMI_PROJECT_LEGACY_SCHEMA_VERSION].includes(value.schemaVersion as typeof EMI_PROJECT_SCHEMA_VERSION)) throw new EmiProjectImportError("UNSUPPORTED_PROJECT_VERSION", `Unsupported EMI project schema ${String(value.schemaVersion ?? "missing")}; this release supports ${EMI_PROJECT_LEGACY_SCHEMA_VERSION}, ${EMI_PROJECT_PREVIOUS_SCHEMA_VERSION}, and ${EMI_PROJECT_SCHEMA_VERSION}.`);
  if (value.recordType !== "maxcalc-emi-project" || typeof value.id !== "string" || typeof value.name !== "string" || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string" || !Array.isArray(value.datasets) || !Array.isArray(value.groups)) throw new EmiProjectImportError("MALFORMED_PROJECT", "The project is missing required identity, timestamp, dataset, or group fields.");
  for (const [index, entry] of value.datasets.entries()) {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.originalFilename !== "string" || typeof entry.importedAt !== "string" || typeof entry.parserVersion !== "string" || !isRecord(entry.parsedDataset) || !Array.isArray(entry.parsedDataset.points) || !isRecord(entry.sampleMetadata) || typeof entry.sampleMetadata.displayName !== "string") throw new EmiProjectImportError("MALFORMED_PROJECT", `Dataset ${index + 1} is incomplete or malformed.`);
    if (entry.electricalProperties !== undefined) {
      const electrical = entry.electricalProperties;
      if (!isRecord(electrical) || !Array.isArray(electrical.rawResistanceReadingsOhm) || !electrical.rawResistanceReadingsOhm.every((reading) => reading === null || typeof reading === "number") || typeof electrical.correctionFactor !== "number" || typeof electrical.calculationVersion !== "string" || (electrical.thicknessMicrometers !== undefined && electrical.thicknessMicrometers !== null && typeof electrical.thicknessMicrometers !== "number")) throw new EmiProjectImportError("MALFORMED_PROJECT", `Dataset ${index + 1} has malformed electrical-property metadata.`);
    }
  }
  const datasetIds = new Set(value.datasets.map((entry) => (entry as Record<string, unknown>).id));
  for (const [index, group] of value.groups.entries()) {
    if (!isRecord(group) || typeof group.id !== "string" || typeof group.name !== "string" || !Array.isArray(group.datasetIds) || !group.datasetIds.every((id) => typeof id === "string" && datasetIds.has(id))) throw new EmiProjectImportError("MALFORMED_PROJECT", `Replicate group ${index + 1} is malformed or references an unknown dataset.`);
  }
  const validDirections = new Set(["forward", "reverse"]);
  const validMetrics = new Set(["SET", "SER", "SEA", "R", "T", "A"]);
  if (!Array.isArray(value.selectedDatasetIds) || !value.selectedDatasetIds.every((id) => typeof id === "string" && datasetIds.has(id)) || !Array.isArray(value.selectedDirections) || !value.selectedDirections.every((direction) => validDirections.has(String(direction))) || !Array.isArray(value.visibleMetrics) || !value.visibleMetrics.every((metric) => validMetrics.has(String(metric)))) throw new EmiProjectImportError("MALFORMED_PROJECT", "Project selections contain unknown datasets, directions, or metrics.");
  if (!isRecord(value.frequencyRangeHz) || !isRecord(value.interpolation) || typeof value.interpolation.enabled !== "boolean" || !["reference-grid", "frequency-interval", "point-count"].includes(String(value.interpolation.strategy)) || typeof value.interpolation.overlapOnly !== "boolean" || !isRecord(value.plot) || !isRecord(value.qualityControl) || typeof value.notes !== "string" || typeof value.calculationEngineVersion !== "string" || typeof value.parserVersion !== "string") throw new EmiProjectImportError("MALFORMED_PROJECT", "Project analysis, plot, or provenance settings are incomplete.");
  return migrateEmiProject(value);
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
  async list(): Promise<EmiProjectRecord[]> { return (await this.database.emiProjects.orderBy("updatedAt").reverse().toArray()).map((project) => migrateEmiProject(project as unknown as Record<string, unknown>)); }
  async get(id: string): Promise<EmiProjectRecord | undefined> { const project = await this.database.emiProjects.get(id); return project ? migrateEmiProject(project as unknown as Record<string, unknown>) : undefined; }
  async save(project: EmiProjectRecord): Promise<EmiProjectRecord> {
    const saved = migrateEmiProject({ ...project, schemaVersion: EMI_PROJECT_SCHEMA_VERSION, updatedAt: new Date().toISOString(), calculationEngineVersion: ENGINE_VERSION, parserVersion: EMI_PARSER_VERSION } as unknown as Record<string, unknown>);
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
