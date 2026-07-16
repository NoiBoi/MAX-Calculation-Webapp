import { describe, expect, it } from "vitest";
import { createPrintJob, paginatePrintableRecipes, type PrintableRecipeEntry } from "../../lib/print/print-model";
import { createRecommendedPrintSettings } from "../../lib/settings/user-settings";
import type { WeighingSummary } from "../../lib/presentation/weighing-summary";

function summary(id: number, rows = 3): WeighingSummary {
  return {
    title: `Recipe ${id}`, sourceStatus: `Revision ${id}`, adjustedFeedFormula: "Ti4AlC3", targetFormula: "Ti4AlC3", idealFormula: "Ti4AlC3", intendedFeedFormula: "Ti4AlC3", realizedFormula: "Ti4AlC3",
    batchMass: "10.000", batchBasis: "ideal-product-mass", totalMass: "10.001", unit: "g", actionRequiredMessages: [], minorAdvisoryMessages: [], engineVersion: "test", atomicWeightDataVersion: "test", radiusSites: [],
    verificationSummary: { statusLabel: "Arithmetic verification: verified exactly", targetFormulaMoles: "1", largestElementalResidual: "None", atomicDataVersion: "test" }, isHistorical: false, isStale: false,
    precursors: Array.from({ length: rows }, (_, index) => ({ id: `${id}-${index}`, displayName: `P${index}`, formula: index ? "Al" : "Ti", molarQuantity: "1", solverMolarQuantity: "1", solverMolarQuantityExact: "1", hasPostSolverAdjustment: false, finalMass: "1.000", purityPercent: "100", molarMass: "47.867", atomicRadius: index ? "N/A" : "147 pm · metallic", unit: "g", status: "OK" })),
  };
}

const entries = (count: number, rows = 3): PrintableRecipeEntry[] => Array.from({ length: count }, (_, index) => ({ id: String(index), summary: summary(index, rows) }));

describe("deterministic print pagination", () => {
  it.each([2, 4, 6] as const)("packs %i short recipes on one configured page", (count) => {
    const settings = { ...createRecommendedPrintSettings(), recipesPerPage: count, density: count === 2 ? "comfortable" as const : count === 4 ? "compact" as const : "ultra-compact" as const };
    const pages = paginatePrintableRecipes(createPrintJob({ kind: "library", title: "Test", singleRecipeDetailed: false, settings, entries: entries(count, count === 6 ? 2 : 3) }));
    expect(pages).toHaveLength(1); expect(pages[0]!.entries).toHaveLength(count);
  });

  it("gives a long recipe a full page and resumes configured packing without changing values", () => {
    const settings = { ...createRecommendedPrintSettings(), recipesPerPage: 6 as const, density: "ultra-compact" as const };
    const input = [entries(1, 14)[0]!, ...entries(6, 2)];
    const pages = paginatePrintableRecipes(createPrintJob({ kind: "library", title: "Long", singleRecipeDetailed: false, settings, entries: input }));
    expect(pages[0]).toMatchObject({ entries: [input[0]], notice: expect.stringContaining("will use a full page") });
    expect(pages[1]!.entries).toHaveLength(6); expect(pages.flatMap((page) => page.entries).map((entry) => entry.id)).toEqual(input.map((entry) => entry.id));
  });

  it("uses a detailed full page for one calculator recipe", () => {
    const job = createPrintJob({ kind: "recipe", title: "One", singleRecipeDetailed: true, settings: { ...createRecommendedPrintSettings(), recipesPerPage: 6 }, entries: entries(1) });
    expect(paginatePrintableRecipes(job)).toHaveLength(1); expect(job.settings.recipesPerPage).toBe(6);
  });
});
