import { ChemistryDecimal, DEFAULT_ATOMIC_RADIUS_REGISTRY, RADIUS_DESCRIPTOR_DISCLAIMER, calculateSiteRadiusDescriptor, type BatchCalculationResult } from "@max-stoich/chemistry-engine";
import type { WorkspaceRecipeState } from "../workspace/adapter";
import { presentDiagnostics, precursorStatus } from "./diagnostics";
import { formatMassForBalance } from "./scientific-format";

export interface WeighingSummaryPrecursor {
  readonly id: string;
  readonly displayName: string;
  readonly formula: string;
  readonly molarQuantity: string;
  readonly molarQuantityExact?: string;
  readonly solverMolarQuantity: string;
  readonly solverMolarQuantityExact: string;
  readonly hasPostSolverAdjustment: boolean;
  readonly finalMass: string;
  readonly purityPercent: string;
  readonly unit: "g";
  readonly status: string;
}

export interface WeighingSummaryRadiusOccupant {
  readonly element: string; readonly siteId: string; readonly occupancy: string; readonly radiusPm?: string;
  readonly definition: string; readonly datasetName: string; readonly overridden: boolean; readonly missing: boolean;
}
export interface WeighingSummaryRadiusSite {
  readonly siteId: string; readonly siteLabel: string; readonly datasetName: string; readonly datasetDefinition: string; readonly datasetVersion: string;
  readonly vacancyFraction: string; readonly available: boolean; readonly meanRadiusPm?: string; readonly minimumRadiusPm?: string; readonly maximumRadiusPm?: string;
  readonly rangeRadiusPm?: string; readonly standardDeviationPm?: string; readonly mismatchPercent?: string; readonly missingElements: readonly string[];
  readonly occupants: readonly WeighingSummaryRadiusOccupant[];
}

export interface WeighingSummary {
  readonly title: string;
  readonly sourceStatus: string;
  readonly adjustedFeedFormula: string;
  readonly batchMass: string;
  readonly batchBasis: string;
  readonly precursors: readonly WeighingSummaryPrecursor[];
  readonly totalMass: string;
  readonly unit: "g";
  readonly actionRequiredMessages: readonly string[];
  readonly engineVersion: string;
  readonly atomicWeightDataVersion: string;
  readonly radiusSites: readonly WeighingSummaryRadiusSite[];
  readonly radiusDisclaimer?: string;
  readonly validationStatus?: string;
  readonly isHistorical: boolean;
  readonly isStale: boolean;
}

export function coefficientSuffix(value: string): string { return value === "1" ? "" : value; }
function conciseMolar(value: string): string { try { return new ChemistryDecimal(value).toDecimalPlaces(6).toString(); } catch { return value; } }

export function formatAdjustedFeedFormula(amounts: Readonly<Record<string, string>>, preferredOrderFormula = ""): string {
  const preferred = [...preferredOrderFormula.matchAll(/[A-Z][a-z]?/g)].map((match) => match[0]!);
  const ordered = [...new Set([...preferred, ...Object.keys(amounts)])].filter((element) => amounts[element] !== undefined);
  return ordered.map((element) => `${element}${coefficientSuffix(amounts[element]!)}`).join("");
}

export function buildWeighingSummary(input: Readonly<{
  title: string;
  sourceStatus: string;
  inputState: WorkspaceRecipeState;
  result: BatchCalculationResult;
  orderedPrecursorIds?: readonly string[];
  validationStatus?: string;
  isHistorical?: boolean;
  isStale?: boolean;
}>): WeighingSummary {
  const definitionById = new Map(input.inputState.precursors.map((item) => [item.id, item]));
  const resultById = new Map(input.result.precursors.map((item) => [item.precursorId, item]));
  const order = input.orderedPrecursorIds ?? input.result.precursors.map((item) => item.precursorId);
  const diagnostics = presentDiagnostics(input.result);
  const radiusSites = input.inputState.siteComposition && input.inputState.radiusDescriptorConfig?.enabled ? input.inputState.radiusDescriptorConfig.siteDatasets.flatMap((selection) => {
    const site = input.inputState.siteComposition!.sites.find((item) => item.id === selection.siteId);
    const dataset = DEFAULT_ATOMIC_RADIUS_REGISTRY.usableDatasets.find((item) => item.datasetId === selection.datasetId && item.datasetVersion === selection.datasetVersion && item.digest === selection.datasetDigest);
    if (!site || !dataset) return [];
    const descriptor = calculateSiteRadiusDescriptor(input.inputState.siteComposition!, site.id, dataset, selection.overrides);
    return [{
      siteId: site.id, siteLabel: site.label ?? `${site.id} site`, datasetName: dataset.name, datasetDefinition: dataset.definitionDetail, datasetVersion: dataset.datasetVersion,
      vacancyFraction: descriptor.vacancyFraction, available: descriptor.available,
      ...(descriptor.meanRadiusPm ? { meanRadiusPm: descriptor.meanRadiusPm } : {}), ...(descriptor.minimumRadiusPm ? { minimumRadiusPm: descriptor.minimumRadiusPm } : {}),
      ...(descriptor.maximumRadiusPm ? { maximumRadiusPm: descriptor.maximumRadiusPm } : {}), ...(descriptor.rangeRadiusPm ? { rangeRadiusPm: descriptor.rangeRadiusPm } : {}),
      ...(descriptor.standardDeviationPm ? { standardDeviationPm: descriptor.standardDeviationPm } : {}), ...(descriptor.mismatchPercent ? { mismatchPercent: descriptor.mismatchPercent } : {}),
      missingElements: descriptor.missingElements,
      occupants: descriptor.occupants.map((occupant) => ({ element: occupant.element, siteId: site.id, occupancy: occupant.occupiedFraction, ...(occupant.radiusPm ? { radiusPm: occupant.radiusPm } : {}), definition: dataset.definition, datasetName: dataset.name, overridden: selection.overrides.some((override) => override.element === occupant.element && override.definition === dataset.definition), missing: occupant.missing })),
    } satisfies WeighingSummaryRadiusSite];
  }) : [];
  return {
    title: input.title,
    sourceStatus: input.sourceStatus,
    adjustedFeedFormula: formatAdjustedFeedFormula(input.result.adjustedFeedComposition.amounts, input.inputState.targetFormula),
    batchMass: formatMassForBalance(input.result.batch.requestedMassGrams, input.inputState.balanceIncrementGrams),
    batchBasis: input.result.batch.basis,
    precursors: order.flatMap((id) => {
      const result = resultById.get(id); if (!result) return [];
      const definition = definitionById.get(id);
      const adjusted = result.precursorAdjustmentIds.length > 0;
      const solverMolarQuantity = conciseMolar(result.solverMolesPerTargetFormulaMoleDecimalApproximation.value);
      const finalMolarQuantity = adjusted ? conciseMolar(new ChemistryDecimal(result.postSolverAdjustedMoles).dividedBy(input.result.batch.targetFormulaMoles).toString()) : solverMolarQuantity;
      return [{ id, displayName: result.displayName, formula: definition?.formula ?? result.displayName, molarQuantity: finalMolarQuantity, ...(!adjusted ? { molarQuantityExact: result.solverMolesPerTargetFormulaMoleExact.canonical } : {}), solverMolarQuantity, solverMolarQuantityExact: result.solverMolesPerTargetFormulaMoleExact.canonical, hasPostSolverAdjustment: adjusted, finalMass: formatMassForBalance(result.finalRoundedGrossWeighingMassGrams, input.inputState.balanceIncrementGrams), purityPercent: new ChemistryDecimal(result.purity).times(100).toString(), unit: "g" as const, status: precursorStatus(input.result, id) }];
    }),
    totalMass: formatMassForBalance(input.result.batch.finalRoundedTotalWeighingMassGrams, input.inputState.balanceIncrementGrams),
    unit: "g",
    actionRequiredMessages: [...diagnostics.blocking, ...diagnostics.action].map((item) => item.message),
    engineVersion: input.result.engineVersion,
    atomicWeightDataVersion: input.result.dataVersions.atomicWeights,
    radiusSites,
    ...(radiusSites.length ? { radiusDisclaimer: RADIUS_DESCRIPTOR_DISCLAIMER } : {}),
    ...(input.validationStatus ? { validationStatus: input.validationStatus } : {}),
    isHistorical: input.isHistorical ?? false,
    isStale: input.isStale ?? false,
  };
}

export function serializeWeighingSummary(summary: WeighingSummary, options: Readonly<{ includeAdvanced?: boolean }> = {}): string {
  const lines = [summary.title, summary.sourceStatus, "", "Adjusted intended feed", summary.adjustedFeedFormula, "", `Target batch: ${summary.batchMass} g · ${summary.batchBasis}`, ""];
  summary.precursors.forEach((item) => lines.push(`${item.displayName} (${item.formula})\t${item.molarQuantity} mol/mol target${item.molarQuantityExact ? ` (exact ${item.molarQuantityExact})` : ""}${item.hasPostSolverAdjustment ? ` · solver ${item.solverMolarQuantity} (exact ${item.solverMolarQuantityExact})` : ""}\t${item.purityPercent}% purity\t${item.finalMass} ${item.unit}\t${item.status}`));
  lines.push("", `TOTAL\t${summary.totalMass} ${summary.unit}`);
  if (summary.actionRequiredMessages.length) lines.push("", "Action required", ...summary.actionRequiredMessages.map((message) => `- ${message}`));
  if (summary.isHistorical) lines.push("", "Historical saved result");
  lines.push("", `Engine ${summary.engineVersion} · atomic weights ${summary.atomicWeightDataVersion}`);
  if (options.includeAdvanced && summary.radiusSites.length) {
    lines.push("", "Site-radius screening descriptors");
    summary.radiusSites.forEach((site) => {
      lines.push(`${site.siteLabel} · ${site.datasetName} · ${site.datasetDefinition} · version ${site.datasetVersion} · vacancy ${site.vacancyFraction}`);
      lines.push(site.available ? `mean ${site.meanRadiusPm} pm · min ${site.minimumRadiusPm} pm · max ${site.maximumRadiusPm} pm · range ${site.rangeRadiusPm} pm · standard deviation ${site.standardDeviationPm} pm · mismatch delta ${site.mismatchPercent}%` : `Aggregate unavailable; missing ${site.missingElements.join(", ")}. No occupants were dropped or renormalized.`);
      site.occupants.forEach((item) => lines.push(`  ${item.element} · site ${item.siteId} · occupancy ${item.occupancy} · ${item.radiusPm ? `${item.radiusPm} pm` : "missing"} · ${item.definition} · ${item.datasetName}${item.overridden ? " · override" : ""}`));
    });
    lines.push(summary.radiusDisclaimer!);
  }
  return lines.join("\n");
}

export function serializeComparisonSummaries(summaries: readonly WeighingSummary[]): string {
  return summaries.map((summary, index) => `=== ${index + 1}. ${summary.title} ===\n${serializeWeighingSummary(summary)}`).join("\n\n");
}
