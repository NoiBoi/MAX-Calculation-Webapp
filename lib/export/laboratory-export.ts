import { DEFAULT_ATOMIC_RADIUS_REGISTRY, RADIUS_DESCRIPTOR_DISCLAIMER, calculateSiteRadiusDescriptor, type BatchCalculationResult } from "@max-stoich/chemistry-engine";
import type { CalculationSnapshot, RecipeRevision, SavedRecipe } from "../persistence/entities";
import type { WorkspaceRecipeState } from "../workspace/adapter";
import type { WeighingSortOption } from "../presentation/weighing-sort";
import { buildCalculationVerification } from "../presentation/calculation-verification";

export interface LaboratoryExportContext {
  readonly recipeName: string;
  readonly recipe?: SavedRecipe;
  readonly revision?: RecipeRevision;
  readonly snapshot?: CalculationSnapshot;
  readonly inputState: WorkspaceRecipeState;
  readonly result: BatchCalculationResult;
  readonly calculatedAt: string;
  readonly displaySort?: Readonly<{ selected: WeighingSortOption; precursorIds: readonly string[] }>;
}

function displayedPrecursors(context: LaboratoryExportContext): BatchCalculationResult["precursors"] {
  if (!context.displaySort) return context.result.precursors;
  const byId = new Map(context.result.precursors.map((item) => [item.precursorId, item]));
  return Object.freeze(context.displaySort.precursorIds.flatMap((id) => { const item = byId.get(id); return item ? [item] : []; }));
}

function warningsFor(result: BatchCalculationResult, precursorId: string): string {
  return result.warnings.filter((item) => item.precursorIds?.includes(precursorId)).map((item) => item.code).join("|");
}

export function buildWeighingTableTsv(context: LaboratoryExportContext): string {
  const header = ["Precursor", "Formula", "Purity", "Final weighing mass", "Unit"];
  const rows = displayedPrecursors(context).map((item) => {
    const input = context.inputState.precursors.find((candidate) => candidate.id === item.precursorId);
    return [item.displayName, input?.formula ?? "", item.purity, item.finalRoundedGrossWeighingMassGrams, "g"];
  });
  return [header, ...rows].map((row) => row.join("\t")).join("\n");
}

function csv(value: unknown): string {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function radiusExportState(input: WorkspaceRecipeState) {
  if (!input.siteComposition) return { status: "unavailable-no-site-model", selections: [], results: [] };
  const selections = (input.radiusDescriptorConfig?.siteDatasets ?? []).map((selection) => {
    const dataset = DEFAULT_ATOMIC_RADIUS_REGISTRY.datasets.find((item) => item.datasetId === selection.datasetId && item.datasetVersion === selection.datasetVersion && item.digest === selection.datasetDigest);
    return { ...selection, definition: dataset?.definition ?? null, definitionDetail: dataset?.definitionDetail ?? null, sourceVerificationStatus: dataset?.approval.status ?? "unavailable", labApprovalStatus: dataset?.approval.labApproval ?? "not-reviewed", source: dataset?.source ?? null };
  });
  const results = (input.radiusDescriptorConfig?.siteDatasets ?? []).flatMap((selection) => { const dataset = DEFAULT_ATOMIC_RADIUS_REGISTRY.datasets.find((item) => item.datasetId === selection.datasetId && item.datasetVersion === selection.datasetVersion && item.digest === selection.datasetDigest); return dataset ? [calculateSiteRadiusDescriptor(input.siteComposition!, selection.siteId, dataset, selection.overrides)] : []; });
  return { status: !selections.length ? "unavailable-no-dataset-selection" : results.every((item) => item.available) ? "available-screening-descriptors" : "unavailable-missing-radius-value", selections, results };
}

export function buildLaboratoryCsv(context: LaboratoryExportContext): string {
  const radius = radiusExportState(context.inputState);
  const verification = buildCalculationVerification({ title: context.recipeName, inputState: context.inputState, result: context.result });
  const headers = [
    "recipe_name", "recipe_id", "recipe_revision", "snapshot_id", "input_digest", "output_digest", "target_formula", "batch_mass_g", "batch_basis",
    "display_sort", "precursor_id", "precursor", "formula", "solver_quantity_exact", "solver_quantity_decimal_approximation", "approximation_precision_digits", "approximation_rounding_mode",
    "purity_fraction", "molar_mass_g_mol", "molar_mass_source", "atomic_weight_contributions_json", "pure_required_mass_g", "gross_mass_after_purity_g", "pre_round_mass_g", "final_mass_g", "realized_moles", "realized_minus_intended_moles", "relative_realized_difference", "verification_status", "elemental_reconciliation_json", "warning_codes", "engine_version", "atomic_weight_data_version", "radius_descriptor_status", "radius_site_datasets_json", "radius_descriptor_results_json", "radius_units", "radius_disclaimer", "calculation_timestamp",
  ];
  const rows = displayedPrecursors(context).map((item) => {
    const input = context.inputState.precursors.find((candidate) => candidate.id === item.precursorId);
    return [
      context.recipeName, context.recipe?.id, context.revision?.revisionNumber, context.snapshot?.id, context.snapshot?.inputDigest, context.snapshot?.outputDigest,
      context.inputState.targetFormula, context.result.batch.requestedMassGrams, context.result.batch.basis, context.displaySort?.selected ?? "canonical-engine-order", item.precursorId, item.displayName, input?.formula,
      item.solverMolesPerTargetFormulaMoleExact.canonical, item.solverMolesPerTargetFormulaMoleDecimalApproximation.value,
      item.solverMolesPerTargetFormulaMoleDecimalApproximation.calculationPrecisionSignificantDigits, item.solverMolesPerTargetFormulaMoleDecimalApproximation.roundingMode,
      item.purity, item.molarMassGramsPerMole, item.molarMassSource, JSON.stringify(item.molarMassContributions), item.pureRequiredMassGrams, item.grossMassAfterPurityGrams, item.preRoundGrossWeighingMassGrams, item.finalRoundedGrossWeighingMassGrams, item.realizedPrecursorMoles, item.realizedMinusIntendedMoles, item.relativeRealizedMolesDifference, verification.overallStatus, JSON.stringify(verification.elementalReconciliation), warningsFor(context.result, item.precursorId),
      context.result.engineVersion, context.result.dataVersions.atomicWeights, radius.status, JSON.stringify(radius.selections), JSON.stringify(radius.results), "pm", RADIUS_DESCRIPTOR_DISCLAIMER, context.calculatedAt,
    ];
  });
  return `\uFEFF${[headers, ...rows].map((row) => row.map(csv).join(",")).join("\r\n")}\r\n`;
}

export function buildLaboratoryJson(context: LaboratoryExportContext): string {
  const radius = radiusExportState(context.inputState);
  const verification = buildCalculationVerification({ title: context.recipeName, inputState: context.inputState, result: context.result });
  return JSON.stringify({
    exportSchemaVersion: "1.0.0",
    recordType: "max-stoich-laboratory-calculation",
    recipe: { id: context.recipe?.id ?? null, name: context.recipeName, revisionNumber: context.revision?.revisionNumber ?? null },
    snapshot: context.snapshot ? { id: context.snapshot.id, inputDigest: context.snapshot.inputDigest, outputDigest: context.snapshot.outputDigest } : null,
    scientificInput: context.inputState,
    scientificResult: context.result,
    calculationVerification: verification,
    presentation: context.displaySort ? { weighingTableSort: context.displaySort.selected, visiblePrecursorOrder: context.displaySort.precursorIds } : null,
    atomicRadiusDescriptors: { descriptorSchemaVersion: "2.0.0", availabilityStatus: radius.status, siteDatasetSelections: radius.selections, siteModel: context.inputState.siteComposition ?? null, aggregateResults: radius.results, disclaimerVersion: "1.0.0", disclaimer: RADIUS_DESCRIPTOR_DISCLAIMER },
    provenance: { engineVersion: context.result.engineVersion, atomicWeightDataVersion: context.result.dataVersions.atomicWeights, atomicRadiusDatasets: radius.selections.map((selection) => ({ siteId: selection.siteId, datasetId: selection.datasetId, datasetVersion: selection.datasetVersion, datasetDigest: selection.datasetDigest, sourceVerificationStatus: selection.sourceVerificationStatus, labApprovalStatus: selection.labApprovalStatus })), calculationTimestamp: context.calculatedAt },
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
