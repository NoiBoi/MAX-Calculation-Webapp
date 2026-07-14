import Decimal from "decimal.js";
import type { BatchCalculationResult } from "@max-stoich/chemistry-engine";
import type { WorkspacePrecursorInput } from "../workspace/presets";
import { presentDiagnostics } from "./diagnostics";

export type WeighingSortOption = "original" | "name-asc" | "name-desc" | "mass-asc" | "mass-desc" | "purity-asc" | "purity-desc" | "status-high" | "status-low";

export const WEIGHING_SORT_OPTIONS: readonly Readonly<{ value: WeighingSortOption; label: string }>[] = Object.freeze([
  { value: "original", label: "Original route order" },
  { value: "name-asc", label: "Precursor name: A → Z" },
  { value: "name-desc", label: "Precursor name: Z → A" },
  { value: "mass-asc", label: "Final weighing mass: low → high" },
  { value: "mass-desc", label: "Final weighing mass: high → low" },
  { value: "purity-asc", label: "Purity: low → high" },
  { value: "purity-desc", label: "Purity: high → low" },
  { value: "status-high", label: "Status: highest severity first" },
  { value: "status-low", label: "Status: lowest severity first" },
]);

export type WeighingPrecursorResult = BatchCalculationResult["precursors"][number];

function textCompare(left: string, right: string): number {
  const a = left.toLowerCase(); const b = right.toLowerCase();
  return a < b ? -1 : a > b ? 1 : 0;
}

function statusRanks(result: BatchCalculationResult): ReadonlyMap<string, number> {
  const presentation = presentDiagnostics(result);
  const ranks = new Map<string, number>();
  ([presentation.blocking, presentation.action, presentation.minor, presentation.information] as const).forEach((bucket, rank) => {
    bucket.forEach((diagnostic) => diagnostic.precursorIds.forEach((id) => ranks.set(id, Math.min(ranks.get(id) ?? 4, rank))));
  });
  return ranks;
}

export function sortWeighingPrecursors(result: BatchCalculationResult, definitions: readonly WorkspacePrecursorInput[], option: WeighingSortOption): readonly WeighingPrecursorResult[] {
  const originalIndex = new Map(result.precursors.map((item, index) => [item.precursorId, index]));
  const definitionById = new Map(definitions.map((item) => [item.id, item]));
  const severity = statusRanks(result);
  const direction = option.endsWith("desc") || option === "status-low" ? -1 : 1;
  return [...result.precursors].sort((left, right) => {
    let compared = 0;
    if (option.startsWith("name")) {
      const leftDefinition = definitionById.get(left.precursorId); const rightDefinition = definitionById.get(right.precursorId);
      compared = textCompare(left.displayName || leftDefinition?.formula || "", right.displayName || rightDefinition?.formula || "") * direction;
    } else if (option.startsWith("mass")) {
      compared = new Decimal(left.finalRoundedGrossWeighingMassGrams).comparedTo(right.finalRoundedGrossWeighingMassGrams) * direction;
    } else if (option.startsWith("purity")) {
      compared = new Decimal(left.purity).comparedTo(right.purity) * direction;
    } else if (option.startsWith("status")) {
      compared = ((severity.get(left.precursorId) ?? 4) - (severity.get(right.precursorId) ?? 4)) * direction;
    }
    if (compared !== 0) return compared;
    const routeOrder = (originalIndex.get(left.precursorId) ?? 0) - (originalIndex.get(right.precursorId) ?? 0);
    if (routeOrder !== 0) return routeOrder;
    return textCompare(left.precursorId, right.precursorId);
  });
}
