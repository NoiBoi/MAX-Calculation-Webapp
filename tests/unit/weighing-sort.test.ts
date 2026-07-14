import { describe, expect, it } from "vitest";
import type { BatchCalculationResult } from "@max-stoich/chemistry-engine";
import { buildLaboratoryCsv, buildLaboratoryJson, buildWeighingTableTsv, type LaboratoryExportContext } from "../../lib/export/laboratory-export";
import { sortWeighingPrecursors, type WeighingSortOption } from "../../lib/presentation/weighing-sort";
import { buildWorkspaceCalculation, type WorkspaceRecipeState } from "../../lib/workspace/adapter";
import type { WorkspacePrecursorInput } from "../../lib/workspace/presets";

const precursors = [
  { precursorId: "b", displayName: "Bravo", purity: "0.95", finalRoundedGrossWeighingMassGrams: "2" },
  { precursorId: "a", displayName: "alpha", purity: "0.8", finalRoundedGrossWeighingMassGrams: "10" },
  { precursorId: "c", displayName: "charlie", purity: "1", finalRoundedGrossWeighingMassGrams: "2" },
] as unknown as BatchCalculationResult["precursors"];

const result = {
  precursors,
  errors: [],
  warnings: [
    { code: "SUB_BALANCE_MASS", severity: "warning", blocking: false, fieldPath: "precursors.b", message: "review", precursorIds: ["b"] },
    { code: "ATOMIC_WEIGHT_INTERVAL", severity: "warning", blocking: false, fieldPath: "precursors.a", message: "information", precursorIds: ["a"], element: "Al" },
    { code: "IMPURITY_COMPOSITION_UNMODELED", severity: "warning", blocking: false, fieldPath: "precursors.c", message: "minor", precursorIds: ["c"] },
  ],
  realizedElements: [],
} as unknown as BatchCalculationResult;

const definitions = ["b", "a", "c"].map((id) => ({ id, name: id, formula: id === "a" ? "Al" : id === "b" ? "B" : "C", purityPercent: "100" })) as WorkspacePrecursorInput[];
const ids = (option: WeighingSortOption) => sortWeighingPrecursors(result, definitions, option).map((item) => item.precursorId);

describe("presentation-only weighing table sorting", () => {
  it("sorts names predictably in both directions", () => { expect(ids("name-asc")).toEqual(["a", "b", "c"]); expect(ids("name-desc")).toEqual(["c", "b", "a"]); });
  it("sorts numeric masses in both directions with route-order ties", () => { expect(ids("mass-asc")).toEqual(["b", "c", "a"]); expect(ids("mass-desc")).toEqual(["a", "b", "c"]); });
  it("sorts numeric purity in both directions", () => { expect(ids("purity-asc")).toEqual(["a", "b", "c"]); expect(ids("purity-desc")).toEqual(["c", "b", "a"]); });
  it("sorts by diagnostic hierarchy rather than code text", () => { expect(ids("status-high")).toEqual(["b", "c", "a"]); expect(ids("status-low")).toEqual(["a", "c", "b"]); });
  it("restores original route order and does not mutate scientific output", () => {
    const before = JSON.stringify(result);
    expect(ids("original")).toEqual(["b", "a", "c"]);
    for (const option of ["name-asc", "mass-desc", "purity-asc", "status-low"] as const) ids(option);
    expect(JSON.stringify(result)).toBe(before);
    expect(result.precursors.map((item) => item.precursorId)).toEqual(["b", "a", "c"]);
  });
  it("copies the visible display order", () => {
    const inputState = { precursors: definitions } as unknown as LaboratoryExportContext["inputState"];
    const context = { recipeName: "test", inputState, result, calculatedAt: "2026-07-14T00:00:00.000Z", displaySort: { selected: "name-asc", precursorIds: ["a", "b", "c"] } } as LaboratoryExportContext;
    expect(buildWeighingTableTsv(context).split("\n").slice(1).map((row) => row.split("\t")[0])).toEqual(["alpha", "Bravo", "charlie"]);
  });
  it("exports CSV in visible order while JSON scientific results retain engine order", () => {
    const inputState: WorkspaceRecipeState = { transientId: "sort", presetId: "custom", targetFormula: "Ti2AlN", precursors: ["Ti", "Al", "N"].map((formula) => ({ id: formula.toLowerCase(), name: formula, formula, purityPercent: "100", constraintMode: "solver" as const, fixedValue: "", minimum: "", maximum: "", ratioDenominatorId: "", numeratorRatio: "1", denominatorRatio: "1", molarMassOverride: "", molarMassOverrideSource: "" })), requestedMassGrams: "10", basis: "ideal-product-mass", expectedYieldPercent: "80", alExcessPercent: "0", precursorExcessId: "", precursorExcessPercent: "0", handlingLossPercent: "0", balanceIncrementGrams: "0.001", roundingMode: "nearest-half-even", practicalMinimumMassGrams: "0.001", objective: "deterministic-feasible" };
    const calculated = buildWorkspaceCalculation(inputState); if (calculated.state !== "valid" && calculated.state !== "valid-with-warnings") throw new Error();
    const engineOrder = calculated.result.precursors.map((item) => item.precursorId);
    const visibleOrder = [...engineOrder].reverse();
    const context: LaboratoryExportContext = { recipeName: "sort", inputState, result: calculated.result, calculatedAt: "2026-07-14T00:00:00.000Z", displaySort: { selected: "name-desc", precursorIds: visibleOrder } };
    expect(buildLaboratoryCsv(context).trim().split("\r\n").slice(1).map((row) => row.split(",")[10])).toEqual(visibleOrder);
    const json = JSON.parse(buildLaboratoryJson(context)) as { scientificResult: BatchCalculationResult; presentation: { visiblePrecursorOrder: string[] } };
    expect(json.scientificResult.precursors.map((item) => item.precursorId)).toEqual(engineOrder);
    expect(json.presentation.visiblePrecursorOrder).toEqual(visibleOrder);
  });
});
