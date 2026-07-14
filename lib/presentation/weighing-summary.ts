import type { BatchCalculationResult } from "@max-stoich/chemistry-engine";
import type { WorkspaceRecipeState } from "../workspace/adapter";
import { presentDiagnostics, precursorStatus } from "./diagnostics";
import { formatMassForBalance } from "./scientific-format";

export interface WeighingSummaryPrecursor {
  readonly id: string;
  readonly displayName: string;
  readonly formula: string;
  readonly finalMass: string;
  readonly unit: "g";
  readonly status: string;
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
  readonly validationStatus?: string;
  readonly isHistorical: boolean;
  readonly isStale: boolean;
}

export function coefficientSuffix(value: string): string { return value === "1" ? "" : value; }

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
  return {
    title: input.title,
    sourceStatus: input.sourceStatus,
    adjustedFeedFormula: formatAdjustedFeedFormula(input.result.adjustedFeedComposition.amounts, input.inputState.targetFormula),
    batchMass: formatMassForBalance(input.result.batch.requestedMassGrams, input.inputState.balanceIncrementGrams),
    batchBasis: input.result.batch.basis,
    precursors: order.flatMap((id) => {
      const result = resultById.get(id); if (!result) return [];
      const definition = definitionById.get(id);
      return [{ id, displayName: result.displayName, formula: definition?.formula ?? result.displayName, finalMass: formatMassForBalance(result.finalRoundedGrossWeighingMassGrams, input.inputState.balanceIncrementGrams), unit: "g" as const, status: precursorStatus(input.result, id) }];
    }),
    totalMass: formatMassForBalance(input.result.batch.finalRoundedTotalWeighingMassGrams, input.inputState.balanceIncrementGrams),
    unit: "g",
    actionRequiredMessages: [...diagnostics.blocking, ...diagnostics.action].map((item) => item.message),
    ...(input.validationStatus ? { validationStatus: input.validationStatus } : {}),
    isHistorical: input.isHistorical ?? false,
    isStale: input.isStale ?? false,
  };
}

export function serializeWeighingSummary(summary: WeighingSummary): string {
  const lines = [summary.title, summary.sourceStatus, "", "Adjusted intended feed", summary.adjustedFeedFormula, "", `Target batch: ${summary.batchMass} g · ${summary.batchBasis}`, ""];
  summary.precursors.forEach((item) => lines.push(`${item.displayName} (${item.formula})\t${item.finalMass} ${item.unit}`));
  lines.push("", `TOTAL\t${summary.totalMass} ${summary.unit}`);
  if (summary.actionRequiredMessages.length) lines.push("", "Action required", ...summary.actionRequiredMessages.map((message) => `- ${message}`));
  if (summary.isHistorical) lines.push("", "Historical saved result");
  return lines.join("\n");
}

export function serializeComparisonSummaries(summaries: readonly WeighingSummary[]): string {
  return summaries.map((summary, index) => `=== ${index + 1}. ${summary.title} ===\n${serializeWeighingSummary(summary)}`).join("\n\n");
}
