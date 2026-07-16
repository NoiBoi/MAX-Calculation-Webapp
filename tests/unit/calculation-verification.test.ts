import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";
import { buildWorkspaceCalculation, type WorkspaceRecipeState } from "../../lib/workspace/adapter";
import { buildCalculationVerification, serializeCalculationVerification } from "../../lib/presentation/calculation-verification";
import { buildLaboratoryJson } from "../../lib/export/laboratory-export";

const precursor = (formula: string, purityPercent = "100", override = "") => ({ id: formula.toLowerCase(), name: formula, formula, purityPercent, constraintMode: "solver" as const, fixedValue: "", minimum: "", maximum: "", ratioDenominatorId: "", numeratorRatio: "1", denominatorRatio: "1", molarMassOverride: override, molarMassOverrideSource: override ? "Independent certificate" : "" });
function state(patch: Partial<WorkspaceRecipeState> = {}): WorkspaceRecipeState { return { transientId: "verify", presetId: "custom", targetFormula: "Ti2AlN", precursors: [precursor("Ti", "99.5"), precursor("Al"), precursor("N")], requestedMassGrams: "10", basis: "ideal-product-mass", expectedYieldPercent: "80", aluminumPerFormula: "1", precursorExcessId: "", precursorExcessPercent: "0", handlingLossPercent: "2", balanceIncrementGrams: "0.001", roundingMode: "nearest-half-even", practicalMinimumMassGrams: "0.001", objective: "deterministic-feasible", routeOrigin: { kind: "manual" }, ...patch }; }
function verification(input = state()) { const calculation = buildWorkspaceCalculation(input); if (calculation.state !== "valid" && calculation.state !== "valid-with-warnings") throw new Error(calculation.errors[0]?.message); return { calculation, view: buildCalculationVerification({ title: "Verification fixture", inputState: input, result: calculation.result }) }; }

describe("calculation verification presentation", () => {
  it("preserves engine conversion, correction, rounding, reverse, and exact values", () => {
    const { calculation, view } = verification(); const engine = calculation.result.precursors[0]!; const row = view.precursors[0]!;
    expect(row.finalIntendedMoles.exact).toBe(engine.postSolverAdjustedMoles); expect(row.molarMass.exact).toBe(engine.molarMassGramsPerMole); expect(row.pureRequiredMass.exact).toBe(engine.pureRequiredMassGrams);
    expect(row.grossMassAfterPurity.exact).toBe(engine.grossMassAfterPurityGrams); expect(row.handlingLossSteps).toEqual(engine.handlingLossSteps); expect(row.preRoundMass.exact).toBe(engine.preRoundGrossWeighingMassGrams); expect(row.finalMass.exact).toBe(engine.finalRoundedGrossWeighingMassGrams);
    expect(row.realizedMoles.exact).toBe(engine.realizedPrecursorMoles); expect(row.realizedMinusIntendedMoles.exact).toBe(engine.realizedMinusIntendedMoles); expect(row.relativeDifference?.exact).toBe(engine.relativeRealizedMolesDifference); expect(row.solverMolarQuantityExact).toBe(engine.solverMolesPerTargetFormulaMoleExact.canonical);
    expect(serializeCalculationVerification(view)).toContain("Reverse:"); expect(serializeCalculationVerification(view)).toContain("Handling loss");
  });

  it("uses engine elemental totals, signed residuals, and separate precursor-only elements", () => {
    const input = state({ precursors: [precursor("Ti"), precursor("Al2O3"), precursor("N")], balanceIncrementGrams: "0.1" }); const { calculation, view } = verification(input);
    for (const row of view.elementalReconciliation) { const engine = calculation.result.realizedElements.find((item) => item.element === row.element)!; expect(row.supplied.exact).toBe(engine.finalRealizedMoles); expect(row.difference.exact).toBe(engine.signedResidualMoles); if (row.difference.exact !== "0") expect(row.status).toBe(row.difference.exact.startsWith("-") ? "deficiency" : "excess"); }
    expect(view.precursorOnlyElements.map((row) => row.element)).toContain("O"); expect(view.precursorOnlyElements.find((row) => row.element === "O")?.status).toBe("introduced — not a target residual");
  });

  it("shows atomic provenance, contribution totals, overrides, assumptions, and limitations", () => {
    const { view } = verification(); const ti = view.precursors[0]!; expect(ti.atomicWeightDatasetTitle).toContain("CIAAW"); expect(ti.atomicWeightDatasetVersion).toBe(view.atomicDataVersion);
    expect(ti.contributions.reduce((sum, item) => sum.plus(item.contributionGramsPerMole), new Decimal(0)).toString()).toBe(ti.molarMass.exact); expect(view.assumptions.some((item) => item.label === "Handling loss" && item.source === "user-entered")).toBe(true); expect(view.limitations.join(" ")).toContain("does not verify reaction yield");
    const overrideView = verification(state({ precursors: [precursor("Ti", "100", "47.9"), precursor("Al"), precursor("N")] })).view.precursors[0]!; expect(overrideView.molarMassOverride).toContain("47.9"); expect(overrideView.contributions).toHaveLength(0);
  });

  it("scales unrounded moles and masses linearly from 5 g to 50 g and 500 g", () => {
    const values = ["5", "50", "500"].map((requestedMassGrams) => verification(state({ requestedMassGrams })).view.precursors[0]!);
    expect(new Decimal(values[1]!.finalIntendedMoles.exact).div(values[0]!.finalIntendedMoles.exact).toString()).toBe("10"); expect(new Decimal(values[2]!.finalIntendedMoles.exact).div(values[0]!.finalIntendedMoles.exact).toString()).toBe("100");
    expect(new Decimal(values[1]!.preRoundMass.exact).div(values[0]!.preRoundMass.exact).toString()).toBe("10"); expect(new Decimal(values[2]!.preRoundMass.exact).div(values[0]!.preRoundMass.exact).toString()).toBe("100"); expect(values.every((item) => item.solverMolarQuantityExact === values[0]!.solverMolarQuantityExact)).toBe(true);
  });

  it("marks stale verification unavailable and preserves exact verification JSON", () => {
    const input = state(); const { calculation, view } = verification(input); expect(buildCalculationVerification({ title: "Stale", inputState: input, result: calculation.result, stale: true }).overallStatus).toBe("verification-unavailable");
    const json = JSON.parse(buildLaboratoryJson({ recipeName: "Verify", inputState: input, result: calculation.result, calculatedAt: "2026-07-15T00:00:00.000Z" })); expect(json.calculationVerification.precursors[0].preRoundMass.exact).toBe(view.precursors[0]!.preRoundMass.exact); expect(json.calculationVerification.elementalReconciliation[0].difference.exact).toBe(view.elementalReconciliation[0]!.difference.exact);
  });

  it("opens historical snapshots that predate expanded verification fields", () => {
    const input = state(); const { calculation } = verification(input);
    const historical = structuredClone(calculation.result);
    for (const immutableRow of historical.precursors) { const row = immutableRow as unknown as Record<string, unknown>; delete row.atomicWeightDatasetTitle; delete row.atomicWeightDatasetVersion; delete row.atomicWeightCalculationValuePolicy; delete row.molarMassContributions; delete row.relativeRealizedMolesDifference; }
    const view = buildCalculationVerification({ title: "Historical", inputState: input, result: historical as typeof calculation.result });
    expect(view.precursors[0]?.contributions).toEqual([]); expect(view.precursors[0]?.relativeDifference).toBeUndefined(); expect(serializeCalculationVerification(view)).toContain("not stored in historical snapshot");
  });
});
