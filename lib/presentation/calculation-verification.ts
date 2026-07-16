import { analyzeMaxXComponent, type BatchCalculationResult, type MolarMassContribution } from "@max-stoich/chemistry-engine";
import type { WorkspaceRecipeState } from "@/lib/workspace/adapter";
import { formatAdjustedFeedFormula } from "./weighing-summary";
import { formatDescriptor, formatMassForBalance, formatMoles, formatPercent } from "./scientific-format";

export type VerificationStatus = "verified-exactly" | "within-weighing-tolerance" | "minor-rounding-differences" | "review-required" | "verification-unavailable";
export interface ScientificValue { readonly exact: string; readonly display: string; readonly unit: string }
export interface VerificationAssumption { readonly label: string; readonly value: string; readonly source: "user-entered" | "route-default" | "system-default" | "dataset-derived"; readonly classification: string }
export interface VerificationPrecursor {
  readonly id: string; readonly name: string; readonly formula: string; readonly solverMolarQuantityExact: string; readonly solverMolarQuantityDisplay: string;
  readonly finalIntendedMoles: ScientificValue; readonly batchScaledMoles: ScientificValue; readonly molarMass: ScientificValue; readonly molarMassSource: string;
  readonly atomicWeightDatasetTitle: string; readonly atomicWeightDatasetVersion: string; readonly atomicWeightCalculationValuePolicy: string; readonly molarMassOverride?: string;
  readonly contributions: readonly MolarMassContribution[]; readonly pureRequiredMass: ScientificValue; readonly purity: ScientificValue; readonly grossMassAfterPurity: ScientificValue;
  readonly handlingLossSteps: BatchCalculationResult["precursors"][number]["handlingLossSteps"]; readonly preRoundMass: ScientificValue; readonly balanceIncrement: ScientificValue;
  readonly roundingMode: string; readonly finalMass: ScientificValue; readonly roundingDelta: ScientificValue; readonly pureEquivalentFinalMass: ScientificValue;
  readonly realizedMoles: ScientificValue; readonly realizedMinusIntendedMoles: ScientificValue; readonly relativeDifference?: ScientificValue;
}
export interface VerificationElementRow { readonly element: string; readonly required: ScientificValue; readonly supplied: ScientificValue; readonly difference: ScientificValue; readonly relativeDifference?: ScientificValue; readonly status: "exact" | "within tolerance" | "excess" | "deficiency"; readonly contributors: readonly string[] }
export interface VerificationIntroducedElement { readonly element: string; readonly realized: ScientificValue; readonly contributingPrecursors: readonly string[]; readonly status: "introduced — not a target residual" }
export interface CalculationVerificationView {
  readonly title: string; readonly overallStatus: VerificationStatus; readonly overallStatusLabel: string; readonly targetFormulaMoles: ScientificValue; readonly totalRoundedMass: ScientificValue;
  readonly precursors: readonly VerificationPrecursor[]; readonly elementalReconciliation: readonly VerificationElementRow[]; readonly precursorOnlyElements: readonly VerificationIntroducedElement[];
  readonly formulas: Readonly<{ ideal: string; intended: string; adjusted: string; realized: string }>;
  readonly largestResidual?: VerificationElementRow; readonly assumptions: readonly VerificationAssumption[]; readonly limitations: readonly string[];
  readonly engineVersion: string; readonly atomicDataVersion: string; readonly stale: boolean;
}

const value = (exact: string, display: string, unit: string): ScientificValue => ({ exact, display, unit });
const concise = (exact: string, suffix = "") => formatDescriptor(exact, suffix, 6);
const statusLabel: Readonly<Record<VerificationStatus, string>> = {
  "verified-exactly": "Arithmetic verification: verified exactly", "within-weighing-tolerance": "Arithmetic verification: within weighing tolerance",
  "minor-rounding-differences": "Arithmetic verification: minor rounding differences", "review-required": "Arithmetic verification: review required", "verification-unavailable": "Arithmetic verification unavailable",
};

export function buildCalculationVerification(input: Readonly<{ title: string; inputState: WorkspaceRecipeState; result: BatchCalculationResult; stale?: boolean }>): CalculationVerificationView {
  const stale = input.stale ?? false;
  const exactResiduals = input.result.realizedElements.every((row) => row.signedResidualMoles === "0");
  const exactPrecursors = input.result.precursors.every((row) => row.realizedMinusIntendedMoles === "0");
  const allWithin = input.result.realizedElements.every((row) => row.passesTolerance);
  const materialRounding = input.result.warnings.some((warning) => warning.code === "MATERIAL_ROUNDING_SHIFT" || warning.code === "REALIZED_RESIDUAL_ABOVE_TOLERANCE");
  const overallStatus: VerificationStatus = stale ? "verification-unavailable" : !allWithin ? "review-required" : exactResiduals && exactPrecursors ? "verified-exactly" : materialRounding ? "minor-rounding-differences" : "within-weighing-tolerance";
  const inputById = new Map(input.inputState.precursors.map((precursor) => [precursor.id, precursor]));
  const defaultSource = input.inputState.routeOrigin?.kind === "loaded" ? "route-default" as const : "user-entered" as const;
  const precursors = input.result.precursors.map((row): VerificationPrecursor => {
    const definition = inputById.get(row.precursorId); const intended = row.postSolverAdjustedMoles;
    return {
      id: row.precursorId, name: row.displayName, formula: definition?.formula ?? row.displayName, solverMolarQuantityExact: row.solverMolesPerTargetFormulaMoleExact.canonical,
      solverMolarQuantityDisplay: `${concise(row.solverMolesPerTargetFormulaMoleDecimalApproximation.value)} mol/mol target`, finalIntendedMoles: value(intended, formatMoles(intended), "mol"),
      batchScaledMoles: value(row.nominalScaledMoles, formatMoles(row.nominalScaledMoles), "mol"), molarMass: value(row.molarMassGramsPerMole, `${concise(row.molarMassGramsPerMole)} g/mol`, "g/mol"),
      molarMassSource: row.molarMassSource === "override" ? "Provenance-bearing user override" : "Versioned atomic-weight dataset", atomicWeightDatasetTitle: row.atomicWeightDatasetTitle ?? "Versioned atomic-weight dataset",
      atomicWeightDatasetVersion: row.atomicWeightDatasetVersion ?? input.result.dataVersions.atomicWeights, atomicWeightCalculationValuePolicy: row.atomicWeightCalculationValuePolicy ?? "Expanded atomic-weight policy was not stored in this historical snapshot.",
      ...(row.molarMassOverride ? { molarMassOverride: `${row.molarMassOverride.value} g/mol · ${row.molarMassOverride.source}` } : {}), contributions: row.molarMassContributions ?? [],
      pureRequiredMass: value(row.pureRequiredMassGrams, `${concise(row.pureRequiredMassGrams)} g`, "g"), purity: value(row.purity, formatPercent(row.purity, 6), "fraction"),
      grossMassAfterPurity: value(row.grossMassAfterPurityGrams, `${concise(row.grossMassAfterPurityGrams)} g`, "g"), handlingLossSteps: row.handlingLossSteps,
      preRoundMass: value(row.preRoundGrossWeighingMassGrams, `${concise(row.preRoundGrossWeighingMassGrams)} g`, "g"), balanceIncrement: value(row.roundingIncrementGrams, `${row.roundingIncrementGrams} g`, "g"), roundingMode: row.roundingMode,
      finalMass: value(row.finalRoundedGrossWeighingMassGrams, `${formatMassForBalance(row.finalRoundedGrossWeighingMassGrams, row.roundingIncrementGrams)} g`, "g"), roundingDelta: value(row.roundingDeltaGrams, `${concise(row.roundingDeltaGrams)} g`, "g"),
      pureEquivalentFinalMass: value(row.pureEquivalentFinalMassGrams, `${concise(row.pureEquivalentFinalMassGrams)} g`, "g"), realizedMoles: value(row.realizedPrecursorMoles, formatMoles(row.realizedPrecursorMoles), "mol"),
      realizedMinusIntendedMoles: value(row.realizedMinusIntendedMoles, formatMoles(row.realizedMinusIntendedMoles), "mol"), ...(row.relativeRealizedMolesDifference !== undefined ? { relativeDifference: value(row.relativeRealizedMolesDifference, formatPercent(row.relativeRealizedMolesDifference, 5), "fraction") } : {}),
    };
  });
  const elementalReconciliation = input.result.realizedElements.map((row): VerificationElementRow => ({
    element: row.element, required: value(row.adjustedRequiredMoles, formatMoles(row.adjustedRequiredMoles), "mol"), supplied: value(row.finalRealizedMoles, formatMoles(row.finalRealizedMoles), "mol"),
    difference: value(row.signedResidualMoles, formatMoles(row.signedResidualMoles), "mol"), ...(row.relativeResidual ? { relativeDifference: value(row.relativeResidual, formatPercent(row.relativeResidual, 5), "fraction") } : {}),
    status: row.signedResidualMoles === "0" ? "exact" : row.signedResidualMoles.startsWith("-") ? "deficiency" : "excess", contributors: row.mainPrecursorContributors,
  }));
  const largestResidual = [...elementalReconciliation].sort((left, right) => Number(input.result.realizedElements.find((row) => row.element === right.element)?.absoluteResidualMoles ?? 0) - Number(input.result.realizedElements.find((row) => row.element === left.element)?.absoluteResidualMoles ?? 0))[0];
  const precursorOnlyElements = Object.entries(input.result.precursorOnlyRealizedElementMoles).map(([element, amount]): VerificationIntroducedElement => ({ element, realized: value(amount, formatMoles(amount), "mol"), contributingPrecursors: input.result.matrix?.columns.filter((column) => column.composition.amounts[element] !== undefined).map((column) => column.precursorId) ?? [], status: "introduced — not a target residual" }));
  const assumptions: VerificationAssumption[] = [];
  if (input.inputState.aluminumPerFormula?.trim()) assumptions.push({ label: "Aluminum per formula", value: input.inputState.aluminumPerFormula, source: defaultSource, classification: `${defaultSource} feed assumption` });
  const x = analyzeMaxXComponent(input.inputState.targetFormula); if (x.success) assumptions.push({ label: `${x.value.element === "C" ? "Carbon" : "Nitrogen"} per formula`, value: x.value.enteredCoefficientText, source: defaultSource, classification: `${defaultSource} feed assumption` });
  if (input.inputState.basis === "recovered-product-mass") assumptions.push({ label: "Expected yield", value: `${input.inputState.expectedYieldPercent}%`, source: defaultSource, classification: `${defaultSource} planning assumption; not a measured yield` });
  precursors.forEach((row) => assumptions.push({ label: `${row.name} purity`, value: row.purity.display, source: input.result.precursors.find((item) => item.precursorId === row.id)?.puritySource === "assumed-default" ? "system-default" : defaultSource, classification: "declared purity assumption" }));
  if (input.inputState.handlingLossPercent !== "0") assumptions.push({ label: "Handling loss", value: `${input.inputState.handlingLossPercent}%`, source: defaultSource, classification: "process-retention assumption" });
  if (input.inputState.precursorExcessId && input.inputState.precursorExcessPercent !== "0") assumptions.push({ label: "Precursor-specific excess", value: `${input.inputState.precursorExcessPercent}%`, source: defaultSource, classification: "post-solver feed assumption" });
  input.inputState.precursors.filter((item) => item.molarMassOverride.trim()).forEach((item) => assumptions.push({ label: `${item.name} molar-mass override`, value: `${item.molarMassOverride} g/mol`, source: "user-entered", classification: "provenance-bearing material override" }));
  assumptions.push({ label: "Balance increment", value: `${input.inputState.balanceIncrementGrams} g`, source: defaultSource, classification: "weighing assumption" }, { label: "Rounding mode", value: input.inputState.roundingMode, source: defaultSource, classification: "weighing rule" }, { label: "Atomic weights", value: input.result.dataVersions.atomicWeights, source: "dataset-derived", classification: "versioned calculation data" });
  return {
    title: input.title, overallStatus, overallStatusLabel: statusLabel[overallStatus], targetFormulaMoles: value(input.result.batch.targetFormulaMoles, formatMoles(input.result.batch.targetFormulaMoles), "mol target formula"), totalRoundedMass: value(input.result.batch.finalRoundedTotalWeighingMassGrams, `${formatMassForBalance(input.result.batch.finalRoundedTotalWeighingMassGrams, input.inputState.balanceIncrementGrams)} g`, "g"), precursors, elementalReconciliation, precursorOnlyElements,
    formulas: { ideal: formatAdjustedFeedFormula(input.result.idealCrystalComposition.amounts, input.inputState.targetFormula), intended: formatAdjustedFeedFormula(input.result.intendedFeedComposition.amounts, input.inputState.targetFormula), adjusted: formatAdjustedFeedFormula(input.result.adjustedFeedComposition.amounts, input.inputState.targetFormula), realized: formatAdjustedFeedFormula(input.result.realizedComposition.amounts, input.inputState.targetFormula) },
    ...(largestResidual ? { largestResidual } : {}), assumptions, limitations: ["This verification checks stoichiometric arithmetic, molar-mass conversion, purity correction, loss assumptions, and final rounding.", "It does not verify reaction yield, phase formation, volatilization, side products, furnace behavior, or the composition of reacted material unless measured experimental data are entered separately.", "The realized formula is reconstructed from weighed precursor amounts. It does not confirm the composition or phase of the reacted product."], engineVersion: input.result.engineVersion, atomicDataVersion: input.result.dataVersions.atomicWeights, stale,
  };
}

export function serializeCalculationVerification(view: CalculationVerificationView): string {
  const lines = [view.title, view.overallStatusLabel, `Target formula moles: ${view.targetFormulaMoles.display}`, "", "Formula reconciliation", `Ideal: ${view.formulas.ideal}`, `Intended: ${view.formulas.intended}`, `Adjusted: ${view.formulas.adjusted}`, `Normalized realized: ${view.formulas.realized}`];
  view.precursors.forEach((row) => { lines.push("", row.name, `Solver quantity: ${row.solverMolarQuantityDisplay} (exact ${row.solverMolarQuantityExact})`, `Final intended: ${row.finalIntendedMoles.display}`, `Pure mass: ${row.finalIntendedMoles.exact} mol × ${row.molarMass.exact} g/mol = ${row.pureRequiredMass.display}`, `Purity: ${row.pureRequiredMass.exact} g ÷ ${row.purity.exact} = ${row.grossMassAfterPurity.display}`, ...row.handlingLossSteps.map((step) => `${step.label}: ${step.beforeMassGrams} g ÷ ${step.retainedFraction} = ${step.afterMassGrams} g`), `Rounding: ${row.preRoundMass.display} → ${row.finalMass.display} at ${row.balanceIncrement.display}`, `Reverse: ${row.finalMass.exact} g × ${row.purity.exact} ÷ ${row.molarMass.exact} g/mol = ${row.realizedMoles.display}`, `Difference: ${row.realizedMinusIntendedMoles.display} (${row.relativeDifference?.display ?? "not stored in historical snapshot"})`); });
  lines.push("", "Elemental reconciliation", ...view.elementalReconciliation.map((row) => `${row.element}\trequired ${row.required.exact}\trealized ${row.supplied.exact}\tdifference ${row.difference.exact}\t${row.relativeDifference?.display ?? "—"}\t${row.status}`), "", "Applied assumptions", ...view.assumptions.map((item) => `${item.label}: ${item.value} · ${item.classification}`), "", ...view.limitations, "", `Engine ${view.engineVersion} · atomic weights ${view.atomicDataVersion}`);
  return lines.join("\n");
}
