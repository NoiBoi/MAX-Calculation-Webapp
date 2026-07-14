import { describe, expect, it } from "vitest";
import { buildWorkspaceCalculation, type WorkspaceRecipeState } from "../../lib/workspace/adapter";
import { buildWeighingSummary, formatAdjustedFeedFormula, serializeComparisonSummaries, serializeWeighingSummary } from "../../lib/presentation/weighing-summary";

function state(patch: Partial<WorkspaceRecipeState> = {}): WorkspaceRecipeState {
  const precursor = (formula: string) => ({ id: formula.toLowerCase(), name: formula, formula, purityPercent: "100", constraintMode: "solver" as const, fixedValue: "", minimum: "", maximum: "", ratioDenominatorId: "", numeratorRatio: "1", denominatorRatio: "1", molarMassOverride: "", molarMassOverrideSource: "" });
  return { transientId: "summary", presetId: "custom", targetFormula: "Ti2AlN", precursors: ["Ti", "Al", "N"].map(precursor), requestedMassGrams: "10", basis: "ideal-product-mass", expectedYieldPercent: "80", aluminumPerFormula: "1.2", precursorExcessId: "", precursorExcessPercent: "0", handlingLossPercent: "0", balanceIncrementGrams: "0.001", roundingMode: "nearest-half-even", practicalMinimumMassGrams: "0.001", objective: "deterministic-feasible", ...patch };
}

function summary() {
  const input = state(); const calculation = buildWorkspaceCalculation(input);
  if (calculation.state !== "valid" && calculation.state !== "valid-with-warnings") throw new Error(calculation.errors[0]?.message);
  return buildWeighingSummary({ title: "Bench recipe", sourceStatus: "Unsaved", inputState: input, result: calculation.result, orderedPrecursorIds: ["n", "ti", "al"] });
}

describe("weighing summary presentation", () => {
  it("formats the actual adjusted feed and every final mass without chemistry arithmetic", () => {
    const value = summary();
    expect(value.adjustedFeedFormula).toBe("Ti2Al1.2N");
    expect(value.precursors.map((item) => item.displayName)).toEqual(["N", "Ti", "Al"]);
    expect(value.precursors.every((item) => item.finalMass && item.unit === "g")).toBe(true);
    expect(value.precursors.every((item) => item.molarQuantity && item.solverMolarQuantityExact)).toBe(true);
    expect(value.totalMass).toBeTruthy();
  });

  it("copies in visible order and separates comparison scenarios", () => {
    const value = summary(); const text = serializeWeighingSummary(value);
    expect(text.indexOf("N (N)")).toBeLessThan(text.indexOf("Ti (Ti)"));
    expect(text).toContain(`TOTAL\t${value.totalMass} g`);
    expect(text).toContain("mol/mol target");
    expect(serializeComparisonSummaries([value, { ...value, title: "Second" }])).toContain("=== 2. Second ===");
  });

  it("preserves exact rational coefficient strings in adjusted formula rendering", () => {
    expect(formatAdjustedFeedFormula({ Ti: "4/5", V: "4/5", Al: "1.2", C: "2.7" }, "TiVAlC")).toBe("Ti4/5V4/5Al1.2C2.7");
  });

});
