import type { WorkspaceLayout } from "../persistence/entities";

const timestamp = "2026-07-13T00:00:00.000Z";
const layout = (id: string, name: string, kind: WorkspaceLayout["kind"], density: WorkspaceLayout["density"], inputWidthPercent: WorkspaceLayout["inputWidthPercent"], visibleColumns: WorkspaceLayout["visibleColumns"]): WorkspaceLayout => Object.freeze({ schemaVersion: "3.0.0", layoutSchemaVersion: "1.0.0", id, name, kind, builtIn: true, isDefault: id === "builtin-simple-calculator", density, inputWidthPercent, visibleColumns, summaryExpanded: kind !== "calculator", tracePlacement: kind === "advanced-calculator" ? "side" : "below", createdAt: timestamp, updatedAt: timestamp });

export const BUILT_IN_LAYOUTS: readonly WorkspaceLayout[] = Object.freeze([
  layout("builtin-simple-calculator", "Simple Calculator", "calculator", "comfortable", 40, ["formula", "purity", "final-mass", "status"]),
  layout("builtin-advanced-chemistry", "Advanced Chemistry", "advanced-calculator", "comfortable", 45, ["formula", "purity", "solver-quantity", "final-mass", "status"]),
  layout("builtin-route-comparison", "Route Comparison", "route-comparison", "comfortable", 40, ["formula", "purity", "solver-quantity", "final-mass", "status"]),
  layout("builtin-compact-balance", "Compact Balance View", "calculator", "compact", 35, ["formula", "final-mass", "status"]),
]);

export function validateLayout(layoutValue: WorkspaceLayout): readonly string[] {
  const errors: string[] = [];
  if (![35, 40, 45, 50].includes(layoutValue.inputWidthPercent)) errors.push("Input width must use a tested 35%, 40%, 45%, or 50% setting.");
  if (!layoutValue.visibleColumns.includes("final-mass") || !layoutValue.visibleColumns.includes("status")) errors.push("Final mass and status must remain visible.");
  if (layoutValue.kind === "route-comparison" && layoutValue.inputWidthPercent > 45) errors.push("Comparison inputs may not exceed 45% of the available width.");
  return errors;
}
