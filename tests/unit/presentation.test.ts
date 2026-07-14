import { describe, expect, it } from "vitest";
import { formatMassForBalance, formatMoles, formatPercent } from "../../lib/presentation/scientific-format";
import { presentDiagnostics } from "../../lib/presentation/diagnostics";
import { buildWorkspaceCalculation } from "../../lib/workspace/adapter";
import { getWorkspacePreset } from "../../lib/workspace/presets";

function stateFromPreset(id: string) {
  const preset = getWorkspacePreset(id);
  return { transientId: `test-${id}`, presetId: id, targetFormula: preset.targetFormula, ...(preset.siteComposition ? { siteComposition: preset.siteComposition } : {}), precursors: preset.precursors.map((item) => ({ ...item })), requestedMassGrams: "10.000", basis: "ideal-product-mass" as const, expectedYieldPercent: "80", aluminumPerFormula: "1", precursorExcessId: "", precursorExcessPercent: "0", handlingLossPercent: "0", balanceIncrementGrams: "0.001", roundingMode: "nearest-half-even" as const, practicalMinimumMassGrams: "0.001", objective: "deterministic-feasible" as const };
}

describe("scientific presentation", () => {
  it("aligns visible mass precision with the balance increment", () => { expect(formatMassForBalance("1.23456789", "0.001")).toBe("1.235"); expect(formatMassForBalance("1.2", "0.0001")).toBe("1.2000"); });
  it("uses human residual units and percentages", () => { expect(formatMoles("0.00001548704660404076576052658769666723")).toBe("15.49 µmol"); expect(formatPercent("0.00165")).toBe("0.165%"); });
  it("classifies atomic-weight intervals as information and excludes them from warning classes", () => { const calculation = buildWorkspaceCalculation(stateFromPreset("ti3alc2")); if (calculation.state !== "valid-with-warnings" && calculation.state !== "valid") throw new Error(); const presentation = presentDiagnostics(calculation.result); expect(presentation.information.some((item) => item.underlyingCodes.includes("ATOMIC_WEIGHT_INTERVAL"))).toBe(true); expect([...presentation.action, ...presentation.minor].some((item) => item.underlyingCodes.includes("ATOMIC_WEIGHT_INTERVAL"))).toBe(false); });
  it("merges same-element rounding and residual diagnostics while retaining exact codes", () => { const calculation = buildWorkspaceCalculation({ ...stateFromPreset("ti2aln"), balanceIncrementGrams: "0.1" }); if (calculation.state !== "valid-with-warnings" && calculation.state !== "valid") throw new Error(); const all = [...presentDiagnostics(calculation.result).action, ...presentDiagnostics(calculation.result).minor]; expect(all.some((item) => item.underlyingCodes.includes("MATERIAL_ROUNDING_SHIFT") && item.underlyingCodes.includes("REALIZED_RESIDUAL_ABOVE_TOLERANCE"))).toBe(true); });
});
