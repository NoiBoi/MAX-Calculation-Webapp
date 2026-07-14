import {
  ChemistryDecimal,
  calculateBatchRecipe,
  normalizeLeadingSiteRatioGroup,
  parseFormula,
  type BatchCalculationResult,
  type BatchMassBasis,
  type RoundingMode,
  type RadiusDescriptorConfig,
  type SiteComposition,
  type SolverPrecursorConstraint,
} from "@max-stoich/chemistry-engine";
import type { WorkspacePrecursorInput } from "./presets";
import { analyzeWorkspaceAluminumFeed } from "./aluminum-feed";

export interface WorkspaceRecipeState {
  readonly transientId: string;
  readonly presetId: string;
  readonly targetFormula: string;
  readonly normalizeLeadingSiteRatios?: boolean;
  readonly siteComposition?: SiteComposition;
  readonly precursors: readonly WorkspacePrecursorInput[];
  readonly requestedMassGrams: string;
  readonly basis: BatchMassBasis;
  readonly expectedYieldPercent: string;
  readonly aluminumPerFormula?: string;
  readonly alExcessPercent?: string;
  readonly precursorExcessId: string;
  readonly precursorExcessPercent: string;
  readonly handlingLossPercent: string;
  readonly balanceIncrementGrams: string;
  readonly roundingMode: RoundingMode;
  readonly practicalMinimumMassGrams: string;
  readonly objective: "deterministic-feasible" | "minimize-total-quantity";
  readonly notes?: string;
  readonly routeSource?: Readonly<{ routeId: string; routeRevisionId: string }>;
  readonly routeOrigin?: Readonly<{ kind: "manual" | "loaded" | "suggestion-generated"; candidateId?: string; sourceRouteId?: string; sourceRouteRevisionId?: string; validationStatus?: string }>;
  readonly radiusDescriptorConfig?: RadiusDescriptorConfig;
}

export interface WorkspaceAdapterError { readonly code: string; readonly message: string; readonly fieldPath: string }
export type WorkspaceCalculationState =
  | Readonly<{ state: "valid" | "valid-with-warnings"; result: BatchCalculationResult; errors: readonly WorkspaceAdapterError[] }>
  | Readonly<{ state: "invalid" | "solver-infeasible" | "internal-error"; errors: readonly WorkspaceAdapterError[]; result?: BatchCalculationResult }>;

export function percentDisplayToFraction(value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") return "";
  try { return new ChemistryDecimal(trimmed).dividedBy(100).toFixed(); }
  catch { return trimmed; }
}

export function resolveWorkspaceTarget(recipe: WorkspaceRecipeState) {
  const normalized = recipe.normalizeLeadingSiteRatios ? normalizeLeadingSiteRatioGroup(recipe.targetFormula, { enabled: true, expectedSite: "M" }) : undefined;
  if (normalized?.success) return normalized.value.calculationComposition;
  if (recipe.siteComposition) return recipe.siteComposition;
  const parsed = parseFormula(recipe.targetFormula);
  return parsed.success ? parsed.composition : undefined;
}

export function buildWorkspaceCalculation(recipe: WorkspaceRecipeState): WorkspaceCalculationState {
  const normalized = recipe.normalizeLeadingSiteRatios ? normalizeLeadingSiteRatioGroup(recipe.targetFormula, { enabled: true, expectedSite: "M" }) : undefined;
  if (normalized && !normalized.success) return { state: "invalid", errors: normalized.errors.map((error) => ({ code: error.code, message: error.message, fieldPath: "targetFormula" })) };
  const parsed = normalized?.success ? undefined : parseFormula(recipe.targetFormula);
  if (parsed && !parsed.success) return { state: "invalid", errors: parsed.errors.map((error) => ({ code: error.code, message: error.message, fieldPath: "targetFormula" })) };
  const constraints: SolverPrecursorConstraint[] = [];
  for (const item of recipe.precursors) {
    if (item.constraintMode === "fixed") constraints.push({ schemaVersion: "1.0.0", mode: "fixed", precursorId: item.id, value: item.fixedValue });
    if (item.constraintMode === "bounded") constraints.push({ schemaVersion: "1.0.0", mode: "bounded", precursorId: item.id, ...(item.minimum.trim() ? { minimum: item.minimum } : {}), ...(item.maximum.trim() ? { maximum: item.maximum } : {}) });
    if (item.constraintMode === "ratio") constraints.push({ schemaVersion: "1.0.0", mode: "ratio", numeratorPrecursorId: item.id, denominatorPrecursorId: item.ratioDenominatorId, numeratorRatio: item.numeratorRatio, denominatorRatio: item.denominatorRatio });
  }
  const aluminum = analyzeWorkspaceAluminumFeed(recipe);
  const precursorExcess = percentDisplayToFraction(recipe.precursorExcessPercent);
  const loss = percentDisplayToFraction(recipe.handlingLossPercent);
  const adjustments = [
    ...(aluminum.visible ? [{ schemaVersion: "1.0.0" as const, id: "ui-aluminum-feed", type: "elemental-feed-coefficient" as const, stage: "pre-solver" as const, element: "Al", coefficient: aluminum.enteredCoefficient ?? recipe.aluminumPerFormula ?? "", idealCoefficient: aluminum.idealCoefficient ?? "", calculationScaleFactor: aluminum.calculationScaleFactor ?? "1", order: 0, source: "user" as const }] : []),
    ...(recipe.precursorExcessId && precursorExcess !== "" && precursorExcess !== "0" ? [{ schemaVersion: "1.0.0" as const, id: "ui-precursor-excess", type: "precursor-molar-excess" as const, stage: "post-solver" as const, precursorId: recipe.precursorExcessId, fraction: precursorExcess, order: 0, source: "user" as const }] : []),
    ...(loss !== "" && loss !== "0" ? [{ schemaVersion: "1.0.0" as const, id: "ui-handling-loss", type: "handling-loss" as const, stage: "mass-domain" as const, label: "Handling loss", fraction: loss, scope: "all" as const, order: 0, source: "user" as const }] : []),
  ];
  try {
    const result = calculateBatchRecipe({
      schemaVersion: "1.0.0",
      idealCrystalComposition: normalized?.success ? normalized.value.idealCalculationComposition : recipe.siteComposition ?? parsed!.composition,
      ...(normalized?.success ? { intendedFeedComposition: normalized.value.calculationComposition } : {}),
      precursors: recipe.precursors.map((item, order) => ({ schemaVersion: "1.0.0", id: item.id, name: item.name, formula: item.formula, order, ...(item.purityPercent.trim() ? { purity: percentDisplayToFraction(item.purityPercent) } : {}), ...(item.molarMassOverride.trim() ? { molarMassOverride: { value: item.molarMassOverride, units: "g/mol" as const, source: item.molarMassOverrideSource, reason: "Explicit workspace material override", provenance: "User-entered advanced workspace value" } } : {}) })),
      solverConstraints: constraints,
      solverOptions: { objectives: [{ kind: recipe.objective }] },
      batch: { basis: recipe.basis, requestedMassGrams: recipe.requestedMassGrams, ...(recipe.basis === "recovered-product-mass" ? { expectedYield: percentDisplayToFraction(recipe.expectedYieldPercent) } : {}) },
      adjustments,
      rounding: { adjustmentId: "ui-rounding", order: 0, incrementGrams: recipe.balanceIncrementGrams, mode: recipe.roundingMode, ...(recipe.practicalMinimumMassGrams.trim() ? { minimumPracticalMassGrams: recipe.practicalMinimumMassGrams } : {}), residualToleranceMoles: "0.00001", materialityRelativeTolerance: "0.001" },
    });
    const errors = [
      ...result.errors.map((error) => ({ code: error.code, message: error.message, fieldPath: error.fieldPath })),
      ...(result.matrix?.diagnostics.filter((item) => item.blocking).map((item) => ({ code: item.code, message: item.message, fieldPath: item.fieldPath })) ?? []),
    ].filter((item, index, values) => values.findIndex((candidate) => candidate.code === item.code && candidate.fieldPath === item.fieldPath) === index);
    if (result.status === "success") return { state: "valid", result, errors };
    if (result.status === "success-with-warnings") return { state: "valid-with-warnings", result, errors };
    if (result.status === "solver-infeasible") return { state: "solver-infeasible", result, errors };
    return { state: result.status === "calculation-failure" ? "internal-error" : "invalid", result, errors };
  } catch (error) {
    return { state: "internal-error", errors: [{ code: "WORKSPACE_ADAPTER_FAILURE", message: error instanceof Error ? error.message : "Unexpected calculation failure.", fieldPath: "workspace" }] };
  }
}

export function formatComposition(amounts: Readonly<Record<string, string>>): string {
  return Object.entries(amounts).map(([element, amount]) => `${element}:${amount}`).join(" · ");
}
