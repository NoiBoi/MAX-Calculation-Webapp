import { DEFAULT_ATOMIC_RADIUS_REGISTRY, assessRadiusDescriptorAvailability, type BatchCalculationResult } from "@max-stoich/chemistry-engine";
import type { CalculationSnapshot, RecipeRevision, SavedRecipe } from "../persistence/entities";
import type { WorkspaceRecipeState } from "../workspace/adapter";

export interface LaboratoryExportContext {
  readonly recipeName: string;
  readonly recipe?: SavedRecipe;
  readonly revision?: RecipeRevision;
  readonly snapshot?: CalculationSnapshot;
  readonly inputState: WorkspaceRecipeState;
  readonly result: BatchCalculationResult;
  readonly calculatedAt: string;
}

function warningsFor(result: BatchCalculationResult, precursorId: string): string {
  return result.warnings.filter((item) => item.precursorIds?.includes(precursorId)).map((item) => item.code).join("|");
}

export function buildWeighingTableTsv(context: LaboratoryExportContext): string {
  const header = ["Precursor", "Formula", "Purity", "Final weighing mass", "Unit"];
  const rows = context.result.precursors.map((item) => {
    const input = context.inputState.precursors.find((candidate) => candidate.id === item.precursorId);
    return [item.displayName, input?.formula ?? "", item.purity, item.finalRoundedGrossWeighingMassGrams, "g"];
  });
  return [header, ...rows].map((row) => row.join("\t")).join("\n");
}

function csv(value: unknown): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildLaboratoryCsv(context: LaboratoryExportContext): string {
  const radiusAvailability = assessRadiusDescriptorAvailability(context.inputState.siteComposition, DEFAULT_ATOMIC_RADIUS_REGISTRY, context.inputState.radiusDescriptorConfig?.datasetId);
  const headers = [
    "recipe_name", "recipe_id", "recipe_revision", "snapshot_id", "input_digest", "output_digest", "target_formula", "batch_mass_g", "batch_basis",
    "precursor_id", "precursor", "formula", "solver_quantity_exact", "solver_quantity_decimal_approximation", "approximation_precision_digits", "approximation_rounding_mode",
    "purity_fraction", "pre_round_mass_g", "final_mass_g", "realized_moles", "warning_codes", "engine_version", "atomic_weight_data_version", "radius_descriptor_status", "radius_dataset_id", "radius_dataset_version", "radius_dataset_digest", "radius_definition", "radius_units", "radius_disclaimer", "calculation_timestamp",
  ];
  const rows = context.result.precursors.map((item) => {
    const input = context.inputState.precursors.find((candidate) => candidate.id === item.precursorId);
    return [
      context.recipeName, context.recipe?.id, context.revision?.revisionNumber, context.snapshot?.id, context.snapshot?.inputDigest, context.snapshot?.outputDigest,
      context.inputState.targetFormula, context.result.batch.requestedMassGrams, context.result.batch.basis, item.precursorId, item.displayName, input?.formula,
      item.solverMolesPerTargetFormulaMoleExact.canonical, item.solverMolesPerTargetFormulaMoleDecimalApproximation.value,
      item.solverMolesPerTargetFormulaMoleDecimalApproximation.calculationPrecisionSignificantDigits, item.solverMolesPerTargetFormulaMoleDecimalApproximation.roundingMode,
      item.purity, item.preRoundGrossWeighingMassGrams, item.finalRoundedGrossWeighingMassGrams, item.realizedPrecursorMoles, warningsFor(context.result, item.precursorId),
      context.result.engineVersion, context.result.dataVersions.atomicWeights, radiusAvailability.status, context.inputState.radiusDescriptorConfig?.datasetId, context.inputState.radiusDescriptorConfig?.datasetVersion, context.inputState.radiusDescriptorConfig?.datasetDigest, "", "pm", "Screening descriptor only; not a direct prediction of physical stress, lattice strain, phase stability, or synthesis success.", context.calculatedAt,
    ];
  });
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csv).join(",")).join("\r\n")}\r\n`;
}

export function buildLaboratoryJson(context: LaboratoryExportContext): string {
  const radiusAvailability = assessRadiusDescriptorAvailability(context.inputState.siteComposition, DEFAULT_ATOMIC_RADIUS_REGISTRY, context.inputState.radiusDescriptorConfig?.datasetId);
  return JSON.stringify({
    exportSchemaVersion: "1.0.0",
    recordType: "max-stoich-laboratory-calculation",
    recipe: { id: context.recipe?.id ?? null, name: context.recipeName, revisionNumber: context.revision?.revisionNumber ?? null },
    snapshot: context.snapshot ? { id: context.snapshot.id, inputDigest: context.snapshot.inputDigest, outputDigest: context.snapshot.outputDigest } : null,
    scientificInput: context.inputState,
    scientificResult: context.result,
    atomicRadiusDescriptors: { descriptorSchemaVersion: radiusAvailability.descriptorSchemaVersion, availabilityStatus: radiusAvailability.status, message: radiusAvailability.message, selectedDataset: context.inputState.radiusDescriptorConfig ?? null, siteModel: context.inputState.siteComposition ?? null, aggregateResults: null, disclaimerVersion: "1.0.0", disclaimer: "Screening descriptor only. It is not a direct prediction of physical stress, lattice strain, phase stability, or synthesis success." },
    provenance: { engineVersion: context.result.engineVersion, atomicWeightDataVersion: context.result.dataVersions.atomicWeights, atomicRadiusDatasetId: context.inputState.radiusDescriptorConfig?.datasetId ?? null, atomicRadiusDatasetVersion: context.inputState.radiusDescriptorConfig?.datasetVersion ?? null, atomicRadiusDatasetDigest: context.inputState.radiusDescriptorConfig?.datasetDigest ?? null, calculationTimestamp: context.calculatedAt },
  }, null, 2);
}

export function safeExportFilename(recipeName: string, extension: "csv" | "json"): string {
  const safe = recipeName.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "max-stoich-calculation";
  return `${safe}.${extension}`;
}

export function downloadText(filename: string, content: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
