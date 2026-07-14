import { describe, expect, it } from "vitest";
import { buildWorkspaceCalculation, percentDisplayToFraction, type WorkspaceRecipeState } from "../../lib/workspace/adapter";
import { getWorkspacePreset, WORKSPACE_PRESETS } from "../../lib/workspace/presets";
import { SCIENTIFIC_REFERENCE_CASES } from "../../lib/workspace/reference-cases";

function recipe(id = "ti2aln"): WorkspaceRecipeState {
  const preset = getWorkspacePreset(id);
  return { transientId: "test", presetId: id, targetFormula: preset.targetFormula, ...(preset.siteComposition ? { siteComposition: preset.siteComposition } : {}), precursors: preset.precursors, requestedMassGrams: "10", basis: "ideal-product-mass", expectedYieldPercent: "80", alExcessPercent: "0", precursorExcessId: "", precursorExcessPercent: "0", handlingLossPercent: "0", balanceIncrementGrams: "0.001", roundingMode: "nearest-half-even", practicalMinimumMassGrams: "0.001", objective: "deterministic-feasible" };
}

describe("workspace UI-to-engine adapter", () => {
  it.each([["5", "0.05"], ["0.05", "0.0005"], ["100", "1"], ["", ""]])("converts displayed percent %s explicitly", (display, fraction) => expect(percentDisplayToFraction(display)).toBe(fraction));
  it("passes batch mass and basis to the engine for canonical decimal output", () => { const input = { ...recipe(), requestedMassGrams: "12.500", basis: "ideal-product-mass" as const }; const result = buildWorkspaceCalculation(input); expect(input.requestedMassGrams).toBe("12.500"); expect(result.result?.batch).toMatchObject({ requestedMassGrams: "12.5", basis: "ideal-product-mass" }); });
  it("returns an associated formula error without clearing input", () => { const result = buildWorkspaceCalculation({ ...recipe(), targetFormula: "Ti(" }); expect(result).toMatchObject({ state: "invalid", errors: [expect.objectContaining({ fieldPath: "targetFormula", code: "UNMATCHED_OPENING_PARENTHESIS" })] }); });
  it("uses declared purity and lower purity increases gross mass", () => { const baseline = buildWorkspaceCalculation(recipe()); const changed = buildWorkspaceCalculation({ ...recipe(), precursors: recipe().precursors.map((item) => item.id === "al" ? { ...item, purityPercent: "95" } : item) }); expect(Number(changed.result?.precursors.find((item) => item.precursorId === "al")?.finalRoundedGrossWeighingMassGrams)).toBeGreaterThan(Number(baseline.result?.precursors.find((item) => item.precursorId === "al")?.finalRoundedGrossWeighingMassGrams)); expect(changed.result?.warnings.map((item) => item.code)).toContain("IMPURITY_COMPOSITION_UNMODELED"); });
  it("preserves explicit site composition in mixed presets", () => { const preset = getWorkspacePreset("tinbaln"); expect(preset.siteComposition?.sites.find((site) => site.id === "M")?.occupants.map((item) => [item.element, item.fraction])).toEqual([["Ti", "0.5"], ["Nb", "0.5"]]); expect(buildWorkspaceCalculation(recipe("tinbaln")).result?.idealCrystalComposition.amounts).toEqual({ Ti: "1", Nb: "1", Al: "1", N: "1" }); });
  it("keeps every built-in example explicitly below lab-approved status", () => { expect(WORKSPACE_PRESETS).toHaveLength(6); expect(WORKSPACE_PRESETS.every((item) => item.validationStatus !== "lab-approved" && item.validationNote.length > 20)).toBe(true); });
  it("records all twenty required reference categories and review fields", () => { expect(SCIENTIFIC_REFERENCE_CASES).toHaveLength(20); expect(new Set(SCIENTIFIC_REFERENCE_CASES.map((item) => item.caseId)).size).toBe(20); for (const item of SCIENTIFIC_REFERENCE_CASES) { expect(item.reviewerStatus).toContain("Provisional"); expect(item.expectedValueSource.length).toBeGreaterThan(10); expect(item.tolerance.length).toBeGreaterThan(10); expect(item.validationClass).not.toBe("laboratory-approved"); } });
});
