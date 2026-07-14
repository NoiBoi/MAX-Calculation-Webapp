import { describe, expect, it } from "vitest";
import { buildWorkspaceCalculation, percentDisplayToFraction, type WorkspaceRecipeState } from "../../lib/workspace/adapter";
import { getWorkspacePreset, WORKSPACE_PRESETS } from "../../lib/workspace/presets";
import { SCIENTIFIC_REFERENCE_CASES } from "../../lib/workspace/reference-cases";
import { aluminumCoefficientForTargetChange, analyzeWorkspaceAluminumFeed, migrateWorkspaceAluminumInput } from "../../lib/workspace/aluminum-feed";

function recipe(id = "ti2aln"): WorkspaceRecipeState {
  const preset = getWorkspacePreset(id);
  return { transientId: "test", presetId: id, targetFormula: preset.targetFormula, ...(preset.siteComposition ? { siteComposition: preset.siteComposition } : {}), precursors: preset.precursors, requestedMassGrams: "10", basis: "ideal-product-mass", expectedYieldPercent: "80", aluminumPerFormula: "1", precursorExcessId: "", precursorExcessPercent: "0", handlingLossPercent: "0", balanceIncrementGrams: "0.001", roundingMode: "nearest-half-even", practicalMinimumMassGrams: "0.001", objective: "deterministic-feasible" };
}

describe("workspace UI-to-engine adapter", () => {
  it.each([["5", "0.05"], ["0.05", "0.0005"], ["100", "1"], ["", ""]])("converts displayed percent %s explicitly", (display, fraction) => expect(percentDisplayToFraction(display)).toBe(fraction));
  it("passes batch mass and basis to the engine for canonical decimal output", () => { const input = { ...recipe(), requestedMassGrams: "12.500", basis: "ideal-product-mass" as const }; const result = buildWorkspaceCalculation(input); expect(input.requestedMassGrams).toBe("12.500"); expect(result.result?.batch).toMatchObject({ requestedMassGrams: "12.5", basis: "ideal-product-mass" }); });
  it("returns an associated formula error without clearing input", () => { const result = buildWorkspaceCalculation({ ...recipe(), targetFormula: "Ti(" }); expect(result).toMatchObject({ state: "invalid", errors: [expect.objectContaining({ fieldPath: "targetFormula", code: "UNMATCHED_OPENING_PARENTHESIS" })] }); });
  it("uses declared purity and lower purity increases gross mass", () => { const baseline = buildWorkspaceCalculation(recipe()); const changed = buildWorkspaceCalculation({ ...recipe(), precursors: recipe().precursors.map((item) => item.id === "al" ? { ...item, purityPercent: "95" } : item) }); expect(Number(changed.result?.precursors.find((item) => item.precursorId === "al")?.finalRoundedGrossWeighingMassGrams)).toBeGreaterThan(Number(baseline.result?.precursors.find((item) => item.precursorId === "al")?.finalRoundedGrossWeighingMassGrams)); expect(changed.result?.warnings.map((item) => item.code)).toContain("IMPURITY_COMPOSITION_UNMODELED"); });
  it("preserves explicit site composition in mixed presets", () => { const preset = getWorkspacePreset("tinbaln"); expect(preset.siteComposition?.sites.find((site) => site.id === "M")?.occupants.map((item) => [item.element, item.fraction])).toEqual([["Ti", "0.5"], ["Nb", "0.5"]]); expect(buildWorkspaceCalculation(recipe("tinbaln")).result?.idealCrystalComposition.amounts).toEqual({ Ti: "1", Nb: "1", Al: "1", N: "1" }); });
  it("uses the exact integer-scaled composition only when grouped-site normalization is enabled", () => {
    const targetFormula = "(TiVMoNbW1.2Ta0.4)4AlC3";
    const precursors = ["Ti", "V", "Mo", "Nb", "W", "Ta", "Al", "C"].map((formula) => ({ id: formula.toLowerCase(), name: formula, formula, purityPercent: "100", constraintMode: "solver" as const, fixedValue: "", minimum: "", maximum: "", ratioDenominatorId: "", numeratorRatio: "1", denominatorRatio: "1", molarMassOverride: "", molarMassOverrideSource: "" }));
    const enabled = buildWorkspaceCalculation({ ...recipe(), targetFormula, normalizeLeadingSiteRatios: true, siteComposition: undefined, precursors });
    expect(enabled.state).toBe("valid-with-warnings");
    expect(enabled.result?.idealCrystalComposition.amounts).toEqual({ Al: "7", C: "21", Mo: "5", Nb: "5", Ta: "2", Ti: "5", V: "5", W: "6" });
    const disabledInput = { ...recipe(), targetFormula, normalizeLeadingSiteRatios: false, siteComposition: undefined, precursors };
    const disabled = buildWorkspaceCalculation(disabledInput);
    expect(disabledInput.targetFormula).toBe(targetFormula);
    expect(disabled.result?.idealCrystalComposition.amounts).toEqual({ Al: "1", C: "3", Mo: "4", Nb: "4", Ta: "1.6", Ti: "4", V: "4", W: "4.8" });
  });
  it("keeps ideal C3 separate while solving the exact carbon-deficient C2.7 intended feed", () => {
    const targetFormula = "(TiVMoTa0.5W1.5)4AlC2.7";
    const precursors = ["Ti", "V", "Mo", "Ta", "W", "Al", "C"].map((formula) => ({ id: formula.toLowerCase(), name: formula, formula, purityPercent: "100", constraintMode: "solver" as const, fixedValue: "", minimum: "", maximum: "", ratioDenominatorId: "", numeratorRatio: "1", denominatorRatio: "1", molarMassOverride: "", molarMassOverrideSource: "" }));
    const calculated = buildWorkspaceCalculation({ ...recipe(), targetFormula, normalizeLeadingSiteRatios: true, siteComposition: undefined, precursors });
    expect(calculated.state).toBe("valid-with-warnings");
    expect(calculated.result?.idealCrystalComposition.amounts.C).toBe("3");
    expect(calculated.result?.intendedFeedComposition.amounts.C).toBe("2.7");
    expect(calculated.result?.adjustedFeedComposition.amounts.C).toBe("2.7");
    expect(calculated.result?.matrix?.rows.find((row) => row.element === "C")?.requirement).toBe("2.7");
  });
  it.each([["1", "1", "Stoichiometric"], ["1.2", "1.2", "excess"], ["2.2", "2.2", "excess"], ["0.9", "0.9", "deficiency"]])("uses direct aluminum coefficient %s before solving", (coefficient, expected) => {
    const calculated = buildWorkspaceCalculation({ ...recipe("ti3alc2"), aluminumPerFormula: coefficient });
    expect(calculated.result?.adjustedFeedComposition.amounts.Al).toBe(expected); expect(calculated.result?.matrix?.rows.find((row) => row.element === "Al")?.requirement).toBe(expected);
  });
  it("works when aluminum comes from coupled precursors rather than elemental Al", () => {
    const precursors = ["Ti", "AlN", "TiAl"].map((formula) => ({ ...recipe().precursors[0]!, id: formula.toLowerCase(), name: formula, formula }));
    const calculated = buildWorkspaceCalculation({ ...recipe(), targetFormula: "TiAlN", siteComposition: undefined, precursors, aluminumPerFormula: "1.2" });
    expect(calculated.result?.solver?.quantitiesByPrecursorId).toEqual({ aln: "1", ti: "0.8", tial: "0.2" });
  });
  it("rejects invalid direct coefficients and does not apply aluminum to a target without Al", () => {
    for (const value of ["0", "-1", "NaN", "Infinity", "nope"]) expect(buildWorkspaceCalculation({ ...recipe(), aluminumPerFormula: value }).state).toBe("invalid");
    const withoutAl = { ...recipe(), targetFormula: "TiN", siteComposition: undefined, precursors: recipe().precursors.filter((item) => item.formula !== "Al"), aluminumPerFormula: "2.2" };
    expect(analyzeWorkspaceAluminumFeed(withoutAl).visible).toBe(false); expect(buildWorkspaceCalculation(withoutAl).result?.adjustedFeedComposition.amounts.Al).toBeUndefined();
  });
  it("migrates legacy excess percentages without reinterpreting 120 percent", () => {
    expect(migrateWorkspaceAluminumInput({ ...recipe(), aluminumPerFormula: undefined, alExcessPercent: "20" }).aluminumPerFormula).toBe("1.2");
    expect(migrateWorkspaceAluminumInput({ ...recipe(), aluminumPerFormula: undefined, alExcessPercent: "120" }).aluminumPerFormula).toBe("2.2");
  });
  it("derives a direct coefficient from explicit target formula text", () => {
    expect(analyzeWorkspaceAluminumFeed({ ...recipe(), targetFormula: "Ti4Al1.2C3", siteComposition: undefined, aluminumPerFormula: undefined }).enteredCoefficient).toBe("1.2");
  });
  it("preserves the user-owned aluminum coefficient across compatible target edits and clears it when aluminum is removed", () => {
    const entered = { ...recipe("ti3alc2"), aluminumPerFormula: "1.2" };
    expect(aluminumCoefficientForTargetChange(entered, "Ti4AlC3")).toBe("1.2");
    expect(aluminumCoefficientForTargetChange(entered, "Ti4AlC2.7")).toBe("1.2");
    expect(aluminumCoefficientForTargetChange(entered, "TiC")).toBe("");
    expect(aluminumCoefficientForTargetChange({ ...entered, targetFormula: "TiC", aluminumPerFormula: "" }, "Ti2AlN")).toBe("1");
  });
  it("keeps every built-in example explicitly below lab-approved status", () => { expect(WORKSPACE_PRESETS).toHaveLength(6); expect(WORKSPACE_PRESETS.every((item) => item.validationStatus !== "lab-approved" && item.validationNote.length > 20)).toBe(true); });
  it("records all twenty required reference categories and review fields", () => { expect(SCIENTIFIC_REFERENCE_CASES).toHaveLength(20); expect(new Set(SCIENTIFIC_REFERENCE_CASES.map((item) => item.caseId)).size).toBe(20); for (const item of SCIENTIFIC_REFERENCE_CASES) { expect(item.reviewerStatus).toContain("Provisional"); expect(item.expectedValueSource.length).toBeGreaterThan(10); expect(item.tolerance.length).toBeGreaterThan(10); expect(item.validationClass).not.toBe("laboratory-approved"); } });
});
