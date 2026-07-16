import { ChemistryDecimal, parseFormula } from "@max-stoich/chemistry-engine";
import type { ComparisonScenario } from "../persistence/entities";
import type { WorkspaceCalculationState } from "../workspace/adapter";
import { buildWorkspaceCalculation } from "../workspace/adapter";
import { compareScenarios, type ComparisonDifference } from "./difference";

export type ComparisonRepresentation = Readonly<{ kind: "original" } | { kind: "common-batch"; targetMassGrams: string }>;
export type MatrixDisplayMode = "final-mass" | "molar-ratio" | "presence" | "difference-from-baseline";

export interface ComparisonAnalysis {
  readonly scenarios: readonly ComparisonScenario[];
  readonly calculations: Readonly<Record<string, WorkspaceCalculationState>>;
  readonly difference: ComparisonDifference;
  readonly baselineId: string;
  readonly representationLabel: string;
}

export function buildComparisonAnalysis(scenarios: readonly ComparisonScenario[], baselineId: string, representation: ComparisonRepresentation): ComparisonAnalysis {
  const normalized = representation.kind === "original" ? scenarios : scenarios.map((scenario) => ({ ...scenario, inputState: { ...scenario.inputState, requestedMassGrams: representation.targetMassGrams }, historical: undefined }));
  const calculations = Object.freeze(Object.fromEntries(normalized.map((scenario) => [scenario.id, buildWorkspaceCalculation(scenario.inputState)])));
  return {
    scenarios: normalized,
    calculations,
    difference: compareScenarios(normalized, calculations),
    baselineId: normalized.some((item) => item.id === baselineId) ? baselineId : normalized[0]?.id ?? "",
    representationLabel: representation.kind === "original" ? "Original saved batch masses" : `Comparison-normalized to ${representation.targetMassGrams} g`,
  };
}

export function signedDifference(value: string | undefined, baseline: string | undefined): Readonly<{ value?: string; percent?: string }> {
  if (value === undefined || baseline === undefined) return {};
  const current = new ChemistryDecimal(value), base = new ChemistryDecimal(baseline), difference = current.minus(base);
  return { value: `${difference.isPositive() ? "+" : ""}${difference.toString()}`, ...(base.isZero() ? {} : { percent: `${difference.dividedBy(base).times(100).isPositive() ? "+" : ""}${difference.dividedBy(base).times(100).toDecimalPlaces(6).toString()}%` }) };
}

export function precursorKind(formula: string): "elemental" | "compound" | "invalid" {
  const parsed = parseFormula(formula);
  if (!parsed.success) return "invalid";
  return Object.keys(parsed.composition.amounts).length === 1 ? "elemental" : "compound";
}

export function comparisonOverviewTsv(analysis: ComparisonAnalysis): string {
  const rows = [["Scenario", "Baseline", "Target formula", "Target batch mass (g)", "Total weighing mass (g)", "Precursors", "Elemental", "Compound", "Largest residual (mol)", "Warnings", "Validation"]];
  for (const scenario of analysis.scenarios) {
    const summary = analysis.difference.summaries.find((item) => item.scenarioId === scenario.id)!;
    rows.push([scenario.name, scenario.id === analysis.baselineId ? "Yes" : "", scenario.inputState.targetFormula, scenario.inputState.requestedMassGrams, summary.totalMassGrams ?? "Unavailable", String(scenario.inputState.precursors.length), String(scenario.inputState.precursors.filter((item) => precursorKind(item.formula) === "elemental").length), String(scenario.inputState.precursors.filter((item) => precursorKind(item.formula) === "compound").length), summary.largestResidualMoles ?? "Unavailable", String(summary.warningCodes.length), scenario.validationStatus]);
  }
  return rows.map((row) => row.join("\t")).join("\n");
}

export function precursorMatrixTsv(analysis: ComparisonAnalysis, mode: MatrixDisplayMode): string {
  const baseline = analysis.baselineId;
  return [["Precursor", ...analysis.scenarios.map((item) => item.name)], ...analysis.difference.rows.map((row) => {
    const baselineCell = row.cells[baseline];
    return [Object.values(row.cells).find(Boolean)?.formula ?? row.key, ...analysis.scenarios.map((scenario) => {
      const cell = row.cells[scenario.id];
      if (!cell) return "Missing";
      if (!cell.finalMassGrams) return "Unavailable";
      if (mode === "presence") return new ChemistryDecimal(cell.finalMassGrams).isZero() ? "Zero" : "Present";
      if (mode === "molar-ratio") return cell.solverQuantityExact ?? "Unavailable";
      if (mode === "difference-from-baseline") return scenario.id === baseline ? "Baseline" : signedDifference(cell.finalMassGrams, baselineCell?.finalMassGrams).value ?? "Unavailable";
      return cell.finalMassGrams;
    })];
  })].map((row) => row.join("\t")).join("\n");
}
