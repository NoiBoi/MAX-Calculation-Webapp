import type { ElementDataSet } from "./element-data-schema";
import { DEFAULT_ELEMENT_DATA } from "./default-element-data";
import { buildElementBalanceMatrix, type ElementBalanceMatrix } from "./balance-matrix";
import { calculateMolarMass } from "./molar-mass";
import type { MolarMassContribution } from "./schemas";
import { normalizeCompositionToTotal, type ElementalComposition } from "./composition";
import {
  RATIONAL_ONE,
  RATIONAL_ZERO,
  absRational,
  addRational,
  compareRational,
  divideRational,
  makeRational,
  multiplyRational,
  parseExactRational,
  rationalToString,
  subtractRational,
  sumRationals,
  type ExactRational,
} from "./exact-rational";
import { ChemistryDecimal, formatDecimal } from "./numeric";
import { solvePrecursorBalance, type PrecursorSolverOptions, type PrecursorSolverResult } from "./precursor-solver";
import type { BalancePrecursorDefinition, SiteComposition, SolverPrecursorConstraint } from "./schemas";
import { siteCompositionToElementalComposition } from "./site-composition";
import { ENGINE_VERSION } from "./version";
import { approximateScientificScalar, scientificScalarFromExact, type ScientificDecimalApproximation, type ScientificScalar } from "./scientific-scalar";

export const BATCH_CALCULATION_SCHEMA_VERSION = "1.0.0" as const;
export type BatchMassBasis = "ideal-product-mass" | "recovered-product-mass" | "final-precursor-mixture-mass";
export type BatchCalculationStatus = "success" | "success-with-warnings" | "invalid-input" | "solver-infeasible" | "unsupported-adjustment" | "unsupported-batch-basis" | "calculation-failure";
export type RoundingMode = "nearest-half-even" | "nearest-half-up" | "floor" | "ceiling";
export type AdjustmentSource = "user" | "route-default" | "system-default";

interface AdjustmentBase { readonly schemaVersion: "1.0.0"; readonly id: string; readonly order: number; readonly source: AdjustmentSource }
export type BatchAdjustment =
  | (AdjustmentBase & { readonly type: "elemental-feed-coefficient"; readonly stage: "pre-solver"; readonly element: string; readonly coefficient: string; readonly idealCoefficient: string; readonly calculationScaleFactor: string })
  | (AdjustmentBase & { readonly type: "elemental-excess"; readonly stage: "pre-solver"; readonly element: string; readonly fraction: string })
  | (AdjustmentBase & { readonly type: "elemental-deficiency"; readonly stage: "pre-solver"; readonly element: string; readonly fraction: string })
  | (AdjustmentBase & { readonly type: "precursor-molar-excess"; readonly stage: "post-solver"; readonly precursorId: string; readonly fraction: string })
  | (AdjustmentBase & { readonly type: "precursor-molar-deficiency"; readonly stage: "post-solver"; readonly precursorId: string; readonly fraction: string })
  | (AdjustmentBase & { readonly type: "handling-loss"; readonly stage: "mass-domain"; readonly label: string; readonly fraction: string; readonly scope: "all" | readonly string[] });

export interface MolarMassOverride { readonly value: string; readonly units: "g/mol"; readonly source: string; readonly reason: string; readonly provenance: string; readonly version?: string }
export interface BatchPrecursorMaterial extends BalancePrecursorDefinition { readonly purity?: string; readonly molarMassOverride?: MolarMassOverride }

export interface BatchRecipeInput {
  readonly schemaVersion: "1.0.0";
  readonly idealCrystalComposition: ElementalComposition | SiteComposition;
  readonly intendedFeedComposition?: ElementalComposition | SiteComposition;
  readonly precursors: readonly BatchPrecursorMaterial[];
  readonly solverConstraints?: readonly SolverPrecursorConstraint[];
  readonly solverOptions?: PrecursorSolverOptions;
  readonly batch: Readonly<{ basis: BatchMassBasis; requestedMassGrams: string; expectedYield?: string }>;
  readonly adjustments: readonly BatchAdjustment[];
  readonly rounding: Readonly<{ adjustmentId: string; order: number; incrementGrams: string; mode: RoundingMode; minimumPracticalMassGrams?: string; residualToleranceMoles: string; materialityRelativeTolerance: string }>;
  readonly elementData?: ElementDataSet;
}

export interface BatchDiagnostic { readonly code: string; readonly severity: "warning" | "error"; readonly blocking: boolean; readonly fieldPath: string; readonly message: string; readonly suggestedAction?: string; readonly precursorIds?: readonly string[]; readonly element?: string }
export interface BatchTraceEntry { readonly stepCode: string; readonly adjustmentId?: string; readonly adjustmentType?: string; readonly stage?: string; readonly resolvedOrder?: number; readonly description: string; readonly affectedEntities: readonly string[]; readonly before: Readonly<Record<string, string>>; readonly after: Readonly<Record<string, string>>; readonly equation?: string; readonly units: Readonly<Record<string, string>>; readonly parameters: Readonly<Record<string, string>>; readonly source?: AdjustmentSource; readonly warningCodes: readonly string[] }
export interface HandlingLossStepResult { readonly adjustmentId: string; readonly label: string; readonly fraction: string; readonly beforeMassGrams: string; readonly afterMassGrams: string; readonly retainedFraction: string }

export interface BatchPrecursorResult {
  readonly precursorId: string;
  readonly displayName: string;
  readonly columnIndex: number;
  readonly solverMolesPerTargetFormulaMole: string;
  readonly solverMolesPerTargetFormulaMoleExact: ScientificScalar;
  readonly solverMolesPerTargetFormulaMoleDecimalApproximation: ScientificDecimalApproximation;
  readonly nominalScaledMoles: string;
  readonly postSolverAdjustedMoles: string;
  readonly precursorAdjustmentIds: readonly string[];
  readonly molarMassGramsPerMole: string;
  readonly molarMassSource: "element-data" | "override";
  readonly molarMassOverride?: MolarMassOverride;
  readonly atomicWeightDatasetTitle: string;
  readonly atomicWeightDatasetVersion: string;
  readonly atomicWeightCalculationValuePolicy: string;
  readonly molarMassContributions: readonly MolarMassContribution[];
  readonly pureRequiredMassGrams: string;
  readonly purity: string;
  readonly puritySource: "declared" | "assumed-default";
  readonly grossMassAfterPurityGrams: string;
  readonly handlingLossSteps: readonly HandlingLossStepResult[];
  readonly totalRetainedFraction: string;
  readonly preRoundGrossWeighingMassGrams: string;
  readonly finalRoundedGrossWeighingMassGrams: string;
  readonly roundingIncrementGrams: string;
  readonly roundingMode: RoundingMode;
  readonly roundingDeltaGrams: string;
  readonly relativeRoundingDelta: string;
  readonly expectedRetainedGrossMassGrams: string;
  readonly pureEquivalentFinalMassGrams: string;
  readonly realizedPrecursorMoles: string;
  readonly realizedMinusIntendedMoles: string;
  readonly relativeRealizedMolesDifference: string;
  readonly traceStepCodes: readonly string[];
}

export interface RealizedElementResult { readonly element: string; readonly adjustedRequiredMoles: string; readonly preRoundRealizedMoles: string; readonly finalRealizedMoles: string; readonly signedResidualMoles: string; readonly absoluteResidualMoles: string; readonly relativeResidual?: string; readonly passesTolerance: boolean; readonly mainPrecursorContributors: readonly string[] }

export interface BatchCalculationResult {
  readonly schemaVersion: typeof BATCH_CALCULATION_SCHEMA_VERSION;
  readonly engineVersion: typeof ENGINE_VERSION;
  readonly status: BatchCalculationStatus;
  readonly idealCrystalComposition: ElementalComposition;
  readonly intendedFeedComposition: ElementalComposition;
  readonly adjustedFeedComposition: ElementalComposition;
  readonly realizedComposition: ElementalComposition;
  readonly rawRealizedElementMoles: Readonly<Record<string, string>>;
  readonly precursorOnlyRealizedElementMoles: Readonly<Record<string, string>>;
  readonly matrix?: ElementBalanceMatrix;
  readonly solver?: PrecursorSolverResult;
  readonly batch: Readonly<{ requestedMassGrams: string; massUnit: "g"; basis: BatchMassBasis; targetFormulaMoles: string; idealTargetMolarMassGramsPerMole: string; expectedYield?: string; nominalProductMassGrams: string; preRoundingTotalPrecursorMassGrams: string; finalRoundedTotalWeighingMassGrams: string; finalMinusRequestedMassGrams: string; relativeDifferenceFromRequested: string }>;
  readonly precursors: readonly BatchPrecursorResult[];
  readonly realizedElements: readonly RealizedElementResult[];
  readonly resolvedAdjustmentOrder: readonly Readonly<{ id: string; type: string; stage: string; order: number }>[];
  readonly appliedDefaults: readonly Readonly<{ fieldPath: string; value: string; reason: string }>[];
  readonly warnings: readonly BatchDiagnostic[];
  readonly errors: readonly BatchDiagnostic[];
  readonly trace: readonly BatchTraceEntry[];
  readonly dataVersions: Readonly<{ atomicWeights: string }>;
  readonly canonicalScientificRepresentation: string;
}

function record<T>(value: Record<string, T>): Readonly<Record<string, T>> { return Object.freeze({ ...value }); }
function array<T>(value: readonly T[]): readonly T[] { return Object.freeze([...value]); }
function diag(value: BatchDiagnostic): BatchDiagnostic { return Object.freeze({ ...value, ...(value.precursorIds ? { precursorIds: array(value.precursorIds) } : {}) }); }
function trace(value: Omit<BatchTraceEntry, "affectedEntities" | "before" | "after" | "units" | "parameters" | "warningCodes"> & { affectedEntities?: readonly string[]; before?: Record<string, string>; after?: Record<string, string>; units?: Record<string, string>; parameters?: Record<string, string>; warningCodes?: readonly string[] }): BatchTraceEntry { return Object.freeze({ ...value, affectedEntities: array(value.affectedEntities ?? []), before: record(value.before ?? {}), after: record(value.after ?? {}), units: record(value.units ?? {}), parameters: record(value.parameters ?? {}), warningCodes: array(value.warningCodes ?? []) }); }
function out(value: ExactRational): string {
  const exact = rationalToString(value);
  if (!exact.includes("/")) return exact;
  return formatDecimal(new ChemistryDecimal(value.numerator.toString()).dividedBy(value.denominator.toString()));
}
function decimal(value: unknown, path: string, errors: BatchDiagnostic[], policy: "positive" | "nonnegative" | "fraction" | "deficiency"): ExactRational | undefined {
  if (typeof value !== "string" || value.includes("/")) { errors.push(diag({ code: "INVALID_DECIMAL_INPUT", severity: "error", blocking: true, fieldPath: path, message: "A finite decimal string is required." })); return undefined; }
  try {
    const parsed = parseExactRational(value);
    const comparison = compareRational(parsed, RATIONAL_ZERO);
    const invalid = policy === "positive" ? comparison <= 0 : policy === "nonnegative" ? comparison < 0 : policy === "fraction" ? comparison <= 0 || compareRational(parsed, RATIONAL_ONE) > 0 : comparison < 0 || compareRational(parsed, RATIONAL_ONE) >= 0;
    if (invalid) throw new Error();
    return parsed;
  } catch { errors.push(diag({ code: policy === "fraction" ? "INVALID_FRACTION" : "INVALID_DECIMAL_INPUT", severity: "error", blocking: true, fieldPath: path, message: `Invalid ${policy} decimal value "${String(value)}".` })); return undefined; }
}
function elemental(input: ElementalComposition | SiteComposition): ElementalComposition | undefined {
  if ("sites" in input) { const result = siteCompositionToElementalComposition(input); return result.success ? result.value : undefined; }
  return input;
}
function compositionFrom(amounts: Readonly<Record<string, ExactRational>>): ElementalComposition { return Object.freeze({ schemaVersion: "1.0.0" as const, amounts: record(Object.fromEntries(Object.entries(amounts).filter(([, value]) => value.numerator !== 0n).map(([element, value]) => [element, out(value)]))) }); }
function exactAmounts(composition: ElementalComposition): Record<string, ExactRational> { return Object.fromEntries(Object.entries(composition.amounts).map(([element, value]) => [element, parseExactRational(value)])); }
const stageRank: Readonly<Record<string, number>> = Object.freeze({ "pre-solver": 0, "post-solver": 1, "mass-domain": 2, "final-rounding": 3 });
function expectedStage(type: BatchAdjustment["type"]): string { return type.startsWith("elemental-") ? "pre-solver" : type.startsWith("precursor-") ? "post-solver" : "mass-domain"; }
function stable(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }
function classifiedFailure(errors: readonly BatchDiagnostic[], fallback: BatchCalculationStatus): BatchCalculationStatus {
  if (errors.some((item) => item.code === "UNSUPPORTED_ADJUSTMENT")) return "unsupported-adjustment";
  if (errors.some((item) => item.code === "UNSUPPORTED_BATCH_BASIS")) return "unsupported-batch-basis";
  return fallback;
}

function rounded(value: ExactRational, increment: ExactRational, mode: RoundingMode): ExactRational {
  const quotient = divideRational(value, increment);
  let integer = quotient.numerator / quotient.denominator;
  const remainder = quotient.numerator % quotient.denominator;
  if (mode === "ceiling" && remainder !== 0n) integer += 1n;
  if (mode === "nearest-half-up" || mode === "nearest-half-even") {
    const twice = remainder * 2n;
    if (twice > quotient.denominator || (twice === quotient.denominator && (mode === "nearest-half-up" || integer % 2n !== 0n))) integer += 1n;
  }
  return multiplyRational(makeRational(integer), increment);
}

function failureResult(input: BatchRecipeInput, ideal: ElementalComposition, intended: ElementalComposition, adjusted: ElementalComposition, status: BatchCalculationStatus, errors: BatchDiagnostic[], warnings: BatchDiagnostic[], traces: BatchTraceEntry[], defaults: readonly Readonly<{ fieldPath: string; value: string; reason: string }>[], dataVersion: string, matrix?: ElementBalanceMatrix, solver?: PrecursorSolverResult): BatchCalculationResult {
  const emptyBatch = Object.freeze({ requestedMassGrams: input.batch?.requestedMassGrams ?? "", massUnit: "g" as const, basis: input.batch?.basis ?? "ideal-product-mass", targetFormulaMoles: "0", idealTargetMolarMassGramsPerMole: "0", ...(input.batch?.expectedYield ? { expectedYield: input.batch.expectedYield } : {}), nominalProductMassGrams: "0", preRoundingTotalPrecursorMassGrams: "0", finalRoundedTotalWeighingMassGrams: "0", finalMinusRequestedMassGrams: "0", relativeDifferenceFromRequested: "0" });
  const base = { schemaVersion: BATCH_CALCULATION_SCHEMA_VERSION, engineVersion: ENGINE_VERSION, status, idealCrystalComposition: ideal, intendedFeedComposition: intended, adjustedFeedComposition: adjusted, realizedComposition: Object.freeze({ schemaVersion: "1.0.0" as const, amounts: Object.freeze({}) }), rawRealizedElementMoles: Object.freeze({}), precursorOnlyRealizedElementMoles: Object.freeze({}), ...(matrix ? { matrix } : {}), ...(solver ? { solver } : {}), batch: emptyBatch, precursors: Object.freeze([]), realizedElements: Object.freeze([]), resolvedAdjustmentOrder: Object.freeze([]), appliedDefaults: array(defaults), warnings: array(warnings), errors: array(errors), trace: array(traces), dataVersions: Object.freeze({ atomicWeights: dataVersion }) };
  return Object.freeze({ ...base, canonicalScientificRepresentation: canonicalBatch(base) });
}

function canonicalBatch(result: Omit<BatchCalculationResult, "canonicalScientificRepresentation">): string {
  const precursors = result.precursors.map((item) => Object.fromEntries(Object.entries(item).filter(([key]) => key !== "displayName")));
  const diagnosticData = (item: BatchDiagnostic) => ({ code: item.code, severity: item.severity, blocking: item.blocking, fieldPath: item.fieldPath, suggestedAction: item.suggestedAction, precursorIds: item.precursorIds, element: item.element });
  return JSON.stringify({ schemaVersion: result.schemaVersion, engineVersion: result.engineVersion, status: result.status, idealCrystalComposition: result.idealCrystalComposition, intendedFeedComposition: result.intendedFeedComposition, adjustedFeedComposition: result.adjustedFeedComposition, realizedComposition: result.realizedComposition, rawRealizedElementMoles: result.rawRealizedElementMoles, precursorOnlyRealizedElementMoles: result.precursorOnlyRealizedElementMoles, matrix: result.matrix?.canonicalScientificRepresentation, solver: result.solver?.canonicalScientificRepresentation, batch: result.batch, precursors, realizedElements: result.realizedElements, resolvedAdjustmentOrder: result.resolvedAdjustmentOrder, appliedDefaults: result.appliedDefaults, warnings: result.warnings.map(diagnosticData), errors: result.errors.map(diagnosticData), trace: result.trace, dataVersions: result.dataVersions });
}

/**
 * Runs the deterministic precursor-to-batch pipeline.
 *
 * Finite inputs are decimal strings; exact solver quantities remain structured
 * scientific scalars. The returned gram and mole fields identify their units,
 * all adjustments are applied in documented stage order, and the result
 * includes an immutable canonical scientific representation. Invalid input is
 * reported as a structured result rather than thrown.
 */
export function calculateBatchRecipe(input: BatchRecipeInput): BatchCalculationResult {
  const errors: BatchDiagnostic[] = [];
  const warnings: BatchDiagnostic[] = [];
  const traces: BatchTraceEntry[] = [];
  const defaults: Array<Readonly<{ fieldPath: string; value: string; reason: string }>> = [];
  const data = input.elementData ?? DEFAULT_ELEMENT_DATA;
  if (!input.elementData) defaults.push(Object.freeze({ fieldPath: "elementData", value: data.dataVersion, reason: "Default versioned atomic-weight dataset selected." }));
  const empty = Object.freeze({ schemaVersion: "1.0.0" as const, amounts: Object.freeze({}) });
  if (input.schemaVersion !== "1.0.0") errors.push(diag({ code: "UNSUPPORTED_BATCH_SCHEMA_VERSION", severity: "error", blocking: true, fieldPath: "schemaVersion", message: "Unsupported batch-recipe schema version." }));
  const ideal = elemental(input.idealCrystalComposition) ?? empty;
  const intended = elemental(input.intendedFeedComposition ?? input.idealCrystalComposition) ?? empty;
  if (!input.intendedFeedComposition) defaults.push(Object.freeze({ fieldPath: "intendedFeedComposition", value: "idealCrystalComposition", reason: "No separate intended feed was supplied." }));
  traces.push(trace({ stepCode: "INPUT_VALIDATION", description: "Batch recipe input validation started." }), trace({ stepCode: "IDEAL_CRYSTAL_ACCEPTED", description: "Ideal crystal composition preserved immutably.", after: ideal.amounts }), trace({ stepCode: "INTENDED_FEED_ACCEPTED", description: "Intended feed composition accepted.", after: intended.amounts }));
  const requested = decimal(input.batch.requestedMassGrams, "batch.requestedMassGrams", errors, "positive");
  const increment = decimal(input.rounding.incrementGrams, "rounding.incrementGrams", errors, "positive");
  const residualTolerance = decimal(input.rounding.residualToleranceMoles, "rounding.residualToleranceMoles", errors, "nonnegative");
  const materialTolerance = decimal(input.rounding.materialityRelativeTolerance, "rounding.materialityRelativeTolerance", errors, "nonnegative");
  const minimumMass = input.rounding.minimumPracticalMassGrams === undefined ? undefined : decimal(input.rounding.minimumPracticalMassGrams, "rounding.minimumPracticalMassGrams", errors, "positive");
  let yieldFraction: ExactRational | undefined;
  if (input.batch.expectedYield !== undefined) yieldFraction = decimal(input.batch.expectedYield, "batch.expectedYield", errors, "fraction");
  if (input.batch.basis === "recovered-product-mass" && input.batch.expectedYield === undefined) errors.push(diag({ code: "MISSING_EXPECTED_YIELD", severity: "error", blocking: true, fieldPath: "batch.expectedYield", message: "Recovered-product-mass basis requires an explicit expected yield fraction." }));
  if (!(input.batch.basis === "ideal-product-mass" || input.batch.basis === "recovered-product-mass" || input.batch.basis === "final-precursor-mixture-mass")) errors.push(diag({ code: "UNSUPPORTED_BATCH_BASIS", severity: "error", blocking: true, fieldPath: "batch.basis", message: `Unsupported batch basis "${String(input.batch.basis)}".` }));
  if (!(input.rounding.mode === "nearest-half-even" || input.rounding.mode === "nearest-half-up" || input.rounding.mode === "floor" || input.rounding.mode === "ceiling")) errors.push(diag({ code: "INVALID_ROUNDING_MODE", severity: "error", blocking: true, fieldPath: "rounding.mode", message: "Unsupported weighing-rounding mode." }));

  const ids = new Set<string>();
  const stageOrders = new Map<string, string[]>();
  for (const adjustment of input.adjustments) {
    if (ids.has(adjustment.id) || adjustment.id === input.rounding.adjustmentId) errors.push(diag({ code: "DUPLICATE_ADJUSTMENT_ID", severity: "error", blocking: true, fieldPath: `adjustments.${adjustment.id}`, message: `Adjustment ID "${adjustment.id}" is duplicated.` }));
    ids.add(adjustment.id);
    if (adjustment.schemaVersion !== "1.0.0") errors.push(diag({ code: "UNSUPPORTED_ADJUSTMENT_SCHEMA_VERSION", severity: "error", blocking: true, fieldPath: `adjustments.${adjustment.id}.schemaVersion`, message: "Unsupported adjustment schema version." }));
    const supportedType = ["elemental-feed-coefficient", "elemental-excess", "elemental-deficiency", "precursor-molar-excess", "precursor-molar-deficiency", "handling-loss"].includes(String(adjustment.type));
    if (!supportedType) errors.push(diag({ code: "UNSUPPORTED_ADJUSTMENT", severity: "error", blocking: true, fieldPath: `adjustments.${adjustment.id}.type`, message: `Unsupported or nonlinear adjustment type "${String(adjustment.type)}".` }));
    else if (adjustment.stage !== expectedStage(adjustment.type)) errors.push(diag({ code: "INVALID_ADJUSTMENT_STAGE", severity: "error", blocking: true, fieldPath: `adjustments.${adjustment.id}.stage`, message: `Adjustment type "${adjustment.type}" must execute in stage "${expectedStage(adjustment.type)}".` }));
    const key = `${adjustment.stage}|${adjustment.order}`;
    stageOrders.set(key, [...(stageOrders.get(key) ?? []), adjustment.id]);
  }
  for (const [key, adjustmentIds] of stageOrders) if (adjustmentIds.length > 1) warnings.push(diag({ code: "DUPLICATE_ADJUSTMENT_ORDER", severity: "warning", blocking: false, fieldPath: "adjustments", message: `Adjustments ${adjustmentIds.join(", ")} share ${key}; stable ID resolves the tie.` }));
  const ordered = [...input.adjustments].sort((left, right) => (stageRank[left.stage] ?? 99) - (stageRank[right.stage] ?? 99) || left.order - right.order || stable(left.id, right.id));
  traces.push(trace({ stepCode: "ADJUSTMENT_ORDER_RESOLVED", description: "Adjustment order resolved by stage, explicit order, and stable ID.", after: { order: ordered.map((item) => item.id).join(",") } }));

  const adjustedAmounts = exactAmounts(intended);
  for (const adjustment of ordered.filter((item) => item.stage === "pre-solver")) {
    if (!(adjustment.element in adjustedAmounts)) { errors.push(diag({ code: "ADJUSTMENT_ELEMENT_ABSENT", severity: "error", blocking: true, fieldPath: `adjustments.${adjustment.id}.element`, message: `Element ${adjustment.element} is absent from the intended feed.`, element: adjustment.element })); continue; }
    if (adjustment.type === "elemental-feed-coefficient") {
      const coefficient = decimal(adjustment.coefficient, `adjustments.${adjustment.id}.coefficient`, errors, "positive");
      const idealCoefficient = decimal(adjustment.idealCoefficient, `adjustments.${adjustment.id}.idealCoefficient`, errors, "positive");
      const calculationScaleFactor = decimal(adjustment.calculationScaleFactor, `adjustments.${adjustment.id}.calculationScaleFactor`, errors, "positive");
      if (!coefficient || !idealCoefficient || !calculationScaleFactor) continue;
      const before = adjustedAmounts[adjustment.element]!;
      const expectedBefore = multiplyRational(idealCoefficient, calculationScaleFactor);
      if (compareRational(before, expectedBefore) !== 0) { errors.push(diag({ code: "COEFFICIENT_BASIS_MISMATCH", severity: "error", blocking: true, fieldPath: `adjustments.${adjustment.id}.idealCoefficient`, message: `The ${adjustment.element} reference coefficient and calculation scale do not reproduce the intended-feed requirement.`, element: adjustment.element })); continue; }
      const after = multiplyRational(coefficient, calculationScaleFactor);
      adjustedAmounts[adjustment.element] = after;
      traces.push(trace({ stepCode: "ELEMENTAL_FEED_COEFFICIENT_APPLIED", adjustmentId: adjustment.id, adjustmentType: adjustment.type, stage: adjustment.stage, resolvedOrder: adjustment.order, description: `${adjustment.element} feed coefficient applied directly before precursor solving.`, affectedEntities: [adjustment.element], before: { idealCoefficient: out(idealCoefficient), calculationRequirement: out(before) }, after: { enteredCoefficient: out(coefficient), adjustedRequirement: out(after) }, equation: "adjustedRequirement=enteredCoefficient*calculationScaleFactor", units: { coefficient: "mol element / mol target formula", requirement: "mol element / mol calculation formula" }, parameters: { idealCoefficient: out(idealCoefficient), enteredCoefficient: out(coefficient), scaleRelativeToIdeal: out(divideRational(coefficient, idealCoefficient)), calculationScaleFactor: out(calculationScaleFactor) }, source: adjustment.source }));
      continue;
    }
    const fraction = decimal(adjustment.fraction, `adjustments.${adjustment.id}.fraction`, errors, adjustment.type === "elemental-deficiency" ? "deficiency" : "nonnegative");
    if (!fraction) continue;
    const before = adjustedAmounts[adjustment.element]!;
    const factor = adjustment.type === "elemental-excess" ? addRational(RATIONAL_ONE, fraction) : subtractRational(RATIONAL_ONE, fraction);
    const after = multiplyRational(before, factor);
    adjustedAmounts[adjustment.element] = after;
    traces.push(trace({ stepCode: "ELEMENTAL_ADJUSTMENT_APPLIED", adjustmentId: adjustment.id, adjustmentType: adjustment.type, stage: adjustment.stage, resolvedOrder: adjustment.order, description: `${adjustment.type} applied sequentially to ${adjustment.element}.`, affectedEntities: [adjustment.element], before: { requirement: out(before) }, after: { requirement: out(after), change: out(subtractRational(after, before)) }, equation: adjustment.type === "elemental-excess" ? "b_after=b_before*(1+fraction)" : "b_after=b_before*(1-fraction)", units: { requirement: "mol element / mol target formula" }, parameters: { fraction: out(fraction) }, source: adjustment.source }));
  }
  const adjusted = compositionFrom(adjustedAmounts);
  traces.push(trace({ stepCode: "ADJUSTED_FEED_PRODUCED", description: "Adjusted feed composition produced after ordered elemental adjustments.", after: adjusted.amounts }));
  if (errors.length > 0 || !requested || !increment || !residualTolerance || !materialTolerance) return failureResult(input, ideal, intended, adjusted, classifiedFailure(errors, "invalid-input"), errors, warnings, traces, defaults, data.dataVersion);

  const balancePrecursors: BalancePrecursorDefinition[] = input.precursors.map((precursor) => ({
    schemaVersion: precursor.schemaVersion,
    id: precursor.id,
    name: precursor.name,
    ...(precursor.formula !== undefined ? { formula: precursor.formula } : {}),
    ...(precursor.composition !== undefined ? { composition: precursor.composition } : {}),
    ...(precursor.order !== undefined ? { order: precursor.order } : {}),
  }));
  const matrixResult = buildElementBalanceMatrix(adjusted, balancePrecursors);
  if (!matrixResult.success) {
    matrixResult.errors.forEach((item) => errors.push(diag({ code: item.code, severity: "error", blocking: true, fieldPath: item.fieldPath ?? "precursors", message: item.message })));
    return failureResult(input, ideal, intended, adjusted, "invalid-input", errors, warnings, traces, defaults, data.dataVersion);
  }
  const matrix = matrixResult.value;
  traces.push(trace({ stepCode: "BALANCE_MATRIX_BUILT", description: "Elemental balance matrix rebuilt from the adjusted feed.", after: { matrixRows: String(matrix.dimensions.rows), matrixColumns: String(matrix.dimensions.columns) } }));
  const solver = solvePrecursorBalance(matrix, input.solverConstraints ?? [], input.solverOptions ?? {});
  traces.push(trace({ stepCode: "PRECURSOR_SOLVER_EXECUTED", description: "Constrained precursor solver executed for the adjusted feed.", after: { status: solver.status } }));
  if (!(solver.status === "exact-unique" || solver.status === "exact-multiple")) {
    solver.errors.forEach((item) => errors.push(diag({ code: `SOLVER_${item.code}`, severity: "error", blocking: true, fieldPath: item.fieldPath, message: item.message, precursorIds: item.precursorIds, element: item.element })));
    return failureResult(input, ideal, intended, adjusted, "solver-infeasible", errors, warnings, traces, defaults, data.dataVersion, matrix, solver);
  }
  traces.push(trace({ stepCode: "SOLVER_RESULT_VERIFIED", description: "Exact solver result accepted with verified residuals.", after: { residuals: solver.elementalResiduals.map((item) => item.residual).join(",") } }));

  const idealMassResult = calculateMolarMass(ideal, data);
  if (!idealMassResult.success) { idealMassResult.errors.forEach((item) => errors.push(diag({ code: item.code, severity: "error", blocking: true, fieldPath: "idealCrystalComposition", message: item.message }))); return failureResult(input, ideal, intended, adjusted, "calculation-failure", errors, warnings, traces, defaults, data.dataVersion, matrix, solver); }
  const idealMolarMass = parseExactRational(idealMassResult.value.totalMolarMass);
  const precursorMolarMass = new Map<string, { value: ExactRational; source: "element-data" | "override"; override?: MolarMassOverride; contributions: readonly MolarMassContribution[] }>();
  const purities = new Map<string, { value: ExactRational; source: "declared" | "assumed-default" }>();
  for (const column of matrix.columns) {
    const material = input.precursors.find((item) => item.id === column.precursorId)!;
    if (material.molarMassOverride) {
      const override = material.molarMassOverride;
      const value = override.units === "g/mol" ? decimal(override.value, `precursors.${material.id}.molarMassOverride.value`, errors, "positive") : undefined;
      if (override.units !== "g/mol") errors.push(diag({ code: "INVALID_MOLAR_MASS_OVERRIDE", severity: "error", blocking: true, fieldPath: `precursors.${material.id}.molarMassOverride.units`, message: "Molar-mass overrides must use g/mol." }));
      if (value && override.source && override.reason && override.provenance) precursorMolarMass.set(material.id, { value, source: "override", override, contributions: Object.freeze([]) });
      else if (value) errors.push(diag({ code: "INVALID_MOLAR_MASS_OVERRIDE", severity: "error", blocking: true, fieldPath: `precursors.${material.id}.molarMassOverride`, message: "Override source, reason, and provenance are required." }));
      if (value && override.source && override.reason && override.provenance) warnings.push(diag({ code: "MOLAR_MASS_OVERRIDE_USED", severity: "warning", blocking: false, fieldPath: `precursors.${material.id}.molarMassOverride`, message: `Explicit molar-mass override ${out(value)} g/mol used for precursor "${material.name}" from ${override.source}.`, precursorIds: [material.id] }));
    } else {
      const calculated = calculateMolarMass(column.composition, data);
      if (!calculated.success) calculated.errors.forEach((item) => errors.push(diag({ code: item.code, severity: "error", blocking: true, fieldPath: `precursors.${material.id}`, message: item.message, precursorIds: [material.id] })));
      else { precursorMolarMass.set(material.id, { value: parseExactRational(calculated.value.totalMolarMass), source: "element-data", contributions: calculated.value.contributions }); calculated.value.warnings.forEach((item) => warnings.push(diag({ code: item.code, severity: "warning", blocking: false, fieldPath: `precursors.${material.id}.molarMass`, message: item.message, precursorIds: [material.id], element: item.element }))); }
    }
    if (material.purity === undefined) { purities.set(material.id, { value: RATIONAL_ONE, source: "assumed-default" }); defaults.push(Object.freeze({ fieldPath: `precursors.${material.id}.purity`, value: "1", reason: "No purity was supplied; chemically pure precursor assumed explicitly." })); }
    else {
      const purity = decimal(material.purity, `precursors.${material.id}.purity`, errors, "fraction");
      if (!purity && typeof material.purity === "string") { try { if (compareRational(parseExactRational(material.purity), RATIONAL_ONE) > 0) errors.push(diag({ code: "PERCENT_SCALE_SUSPICION", severity: "error", blocking: true, fieldPath: `precursors.${material.id}.purity`, message: `Purity "${material.purity}" exceeds 1; enter 95% as "0.95", not "95".`, precursorIds: [material.id] })); } catch { /* primary diagnostic already recorded */ } }
      if (purity) { purities.set(material.id, { value: purity, source: "declared" }); if (compareRational(purity, RATIONAL_ONE) < 0) warnings.push(diag({ code: "IMPURITY_COMPOSITION_UNMODELED", severity: "warning", blocking: false, fieldPath: `precursors.${material.id}.purity`, message: `Impurity chemistry for precursor "${material.name}" is not modeled.`, precursorIds: [material.id] })); }
    }
  }
  if (errors.length > 0) return failureResult(input, ideal, intended, adjusted, "invalid-input", errors, warnings, traces, defaults, data.dataVersion, matrix, solver);
  traces.push(trace({ stepCode: "PRECURSOR_MOLAR_MASSES_SELECTED", description: "Precursor molar masses selected from versioned data or explicit overrides.", after: Object.fromEntries([...precursorMolarMass].map(([id, value]) => [id, out(value.value)])), units: { molarMass: "g/mol" } }));

  const perFormulaMoles = new Map(matrix.columns.map((column, index) => [column.precursorId, parseExactRational(solver.orderedQuantityVector[index]!) ]));
  const precursorAdjustmentIds = new Map(matrix.columns.map((column) => [column.precursorId, [] as string[]]));
  for (const adjustment of ordered.filter((item) => item.stage === "post-solver")) {
    if (!perFormulaMoles.has(adjustment.precursorId)) { errors.push(diag({ code: "UNKNOWN_ADJUSTMENT_PRECURSOR", severity: "error", blocking: true, fieldPath: `adjustments.${adjustment.id}.precursorId`, message: `Unknown precursor ID "${adjustment.precursorId}".`, precursorIds: [adjustment.precursorId] })); continue; }
    const fraction = decimal(adjustment.fraction, `adjustments.${adjustment.id}.fraction`, errors, adjustment.type === "precursor-molar-deficiency" ? "deficiency" : "nonnegative");
    if (!fraction) continue;
    const before = perFormulaMoles.get(adjustment.precursorId)!;
    const factor = adjustment.type === "precursor-molar-excess" ? addRational(RATIONAL_ONE, fraction) : subtractRational(RATIONAL_ONE, fraction);
    const after = multiplyRational(before, factor);
    perFormulaMoles.set(adjustment.precursorId, after);
    precursorAdjustmentIds.get(adjustment.precursorId)!.push(adjustment.id);
    warnings.push(diag({ code: "PRECURSOR_ADJUSTMENT_CHANGES_BALANCE", severity: "warning", blocking: false, fieldPath: `adjustments.${adjustment.id}`, message: `Precursor-specific adjustment "${adjustment.id}" changes elemental balance without re-solving.`, precursorIds: [adjustment.precursorId] }));
    traces.push(trace({ stepCode: "PRECURSOR_MOLAR_ADJUSTMENT_APPLIED", adjustmentId: adjustment.id, adjustmentType: adjustment.type, stage: adjustment.stage, resolvedOrder: adjustment.order, description: `${adjustment.type} applied without re-solving.`, affectedEntities: [adjustment.precursorId], before: { molesPerTargetFormulaMole: out(before) }, after: { molesPerTargetFormulaMole: out(after), change: out(subtractRational(after, before)) }, equation: adjustment.type === "precursor-molar-excess" ? "n_after=n_before*(1+fraction)" : "n_after=n_before*(1-fraction)", units: { amount: "mol precursor / mol target formula" }, parameters: { fraction: out(fraction) }, source: adjustment.source, warningCodes: ["PRECURSOR_ADJUSTMENT_CHANGES_BALANCE"] }));
  }
  if (errors.length > 0) return failureResult(input, ideal, intended, adjusted, "invalid-input", errors, warnings, traces, defaults, data.dataVersion, matrix, solver);

  const losses = ordered.filter((item): item is Extract<BatchAdjustment, { type: "handling-loss" }> => item.type === "handling-loss");
  const lossFractions = new Map<string, Array<{ adjustment: Extract<BatchAdjustment, { type: "handling-loss" }>; fraction: ExactRational }>>(matrix.columns.map((column) => [column.precursorId, []]));
  for (const loss of losses) {
    const fraction = decimal(loss.fraction, `adjustments.${loss.id}.fraction`, errors, "deficiency");
    if (!fraction) continue;
    const affected = loss.scope === "all" ? matrix.columns.map((column) => column.precursorId) : [...loss.scope];
    for (const id of affected) {
      if (!lossFractions.has(id)) errors.push(diag({ code: "UNKNOWN_ADJUSTMENT_PRECURSOR", severity: "error", blocking: true, fieldPath: `adjustments.${loss.id}.scope`, message: `Unknown precursor ID "${id}" in handling-loss scope.`, precursorIds: [id] }));
      else lossFractions.get(id)!.push({ adjustment: loss, fraction });
    }
  }
  if (errors.length > 0) return failureResult(input, ideal, intended, adjusted, "invalid-input", errors, warnings, traces, defaults, data.dataVersion, matrix, solver);

  const grossPerFormula = new Map<string, ExactRational>();
  const retentionById = new Map<string, ExactRational>();
  for (const column of matrix.columns) {
    const id = column.precursorId;
    const pureMass = multiplyRational(perFormulaMoles.get(id)!, precursorMolarMass.get(id)!.value);
    let gross = divideRational(pureMass, purities.get(id)!.value);
    let retention = RATIONAL_ONE;
    for (const { fraction } of lossFractions.get(id)!) { const retained = subtractRational(RATIONAL_ONE, fraction); gross = divideRational(gross, retained); retention = multiplyRational(retention, retained); }
    grossPerFormula.set(id, gross);
    retentionById.set(id, retention);
  }
  const grossMixturePerFormula = sumRationals([...grossPerFormula.values()]);
  const nominalProductMass = input.batch.basis === "recovered-product-mass" ? divideRational(requested, yieldFraction!) : requested;
  const targetFormulaMoles = input.batch.basis === "final-precursor-mixture-mass" ? divideRational(requested, grossMixturePerFormula) : divideRational(nominalProductMass, idealMolarMass);
  traces.push(trace({ stepCode: "BATCH_BASIS_SELECTED", description: `Batch basis "${input.batch.basis}" selected explicitly.`, parameters: { basis: input.batch.basis, requestedMassGrams: out(requested), ...(yieldFraction ? { expectedYield: out(yieldFraction) } : {}) } }), trace({ stepCode: "TARGET_FORMULA_MOLES_CALCULATED", description: "Target formula scaling factor calculated from the selected basis.", after: { targetFormulaMoles: out(targetFormulaMoles), nominalProductMassGrams: out(nominalProductMass) }, equation: input.batch.basis === "final-precursor-mixture-mass" ? "n_target=requestedMixtureMass/grossMixtureMassPerTargetFormulaMole" : "n_target=nominalProductMass/idealTargetMolarMass", units: { targetFormulaMoles: "mol target formula" } }));

  const precursorResults: BatchPrecursorResult[] = [];
  const preRoundMoles = new Map<string, ExactRational>();
  const finalMoles = new Map<string, ExactRational>();
  const preRoundMasses = new Map<string, ExactRational>();
  const finalMasses = new Map<string, ExactRational>();
  for (const column of matrix.columns) {
    const id = column.precursorId;
    const solverPerFormula = parseExactRational(solver.orderedQuantityVector[column.index]!);
    const exactSolverQuantity = solver.exactQuantitiesByPrecursorId[id] ?? scientificScalarFromExact(solverPerFormula);
    const solverQuantityApproximation = approximateScientificScalar(exactSolverQuantity);
    const nominal = multiplyRational(solverPerFormula, targetFormulaMoles);
    const adjustedMoles = multiplyRational(perFormulaMoles.get(id)!, targetFormulaMoles);
    const molar = precursorMolarMass.get(id)!;
    const pureMass = multiplyRational(adjustedMoles, molar.value);
    const purity = purities.get(id)!;
    traces.push(trace({ stepCode: "SOLVER_SCALAR_CONVERTED_FOR_MASS_DOMAIN", description: `Exact solver quantity for "${id}" retained and converted to a labeled decimal approximation for mass-domain presentation.`, affectedEntities: [id], before: { exactCanonical: exactSolverQuantity.canonical, numerator: exactSolverQuantity.numerator, denominator: exactSolverQuantity.denominator }, after: { decimalApproximation: solverQuantityApproximation.value }, equation: "decimalApproximation=numerator/denominator", units: { exactQuantity: "mol precursor / mol target formula", decimalApproximation: "mol precursor / mol target formula" }, parameters: { calculationPrecisionSignificantDigits: String(solverQuantityApproximation.calculationPrecisionSignificantDigits), serializedPrecisionSignificantDigits: String(solverQuantityApproximation.serializedPrecisionSignificantDigits), roundingMode: solverQuantityApproximation.roundingMode } }));
    const grossPurity = divideRational(pureMass, purity.value);
    traces.push(trace({ stepCode: "PURITY_CORRECTION_APPLIED", adjustmentType: "purity-correction", stage: "mass-domain", description: `Purity correction applied to "${id}" using ${purity.source}.`, affectedEntities: [id], before: { pureRequiredMassGrams: out(pureMass) }, after: { grossRequiredMassGrams: out(grossPurity) }, equation: "grossRequiredMass=pureRequiredMass/purity", units: { mass: "g" }, parameters: { purity: out(purity.value) }, source: purity.source === "declared" ? "user" : "system-default", warningCodes: compareRational(purity.value, RATIONAL_ONE) < 0 ? ["IMPURITY_COMPOSITION_UNMODELED"] : [] }));
    let running = grossPurity;
    const lossSteps: HandlingLossStepResult[] = [];
    for (const { adjustment, fraction } of lossFractions.get(id)!) {
      const before = running;
      running = divideRational(running, subtractRational(RATIONAL_ONE, fraction));
      lossSteps.push(Object.freeze({ adjustmentId: adjustment.id, label: adjustment.label, fraction: out(fraction), beforeMassGrams: out(before), afterMassGrams: out(running), retainedFraction: out(subtractRational(RATIONAL_ONE, fraction)) }));
      traces.push(trace({ stepCode: "HANDLING_LOSS_APPLIED", adjustmentId: adjustment.id, adjustmentType: adjustment.type, stage: adjustment.stage, resolvedOrder: adjustment.order, description: `Retained-fraction handling loss applied to "${id}".`, affectedEntities: [id], before: { massGrams: out(before) }, after: { massGrams: out(running) }, equation: "mass_after=mass_before/(1-lossFraction)", units: { mass: "g" }, parameters: { lossFraction: out(fraction) }, source: adjustment.source }));
    }
    const finalMass = rounded(running, increment, input.rounding.mode);
    const delta = subtractRational(finalMass, running);
    const relativeDelta = running.numerator === 0n ? RATIONAL_ZERO : divideRational(delta, running);
    const retainedGross = multiplyRational(finalMass, retentionById.get(id)!);
    const pureEquivalent = multiplyRational(finalMass, purity.value);
    const realizedMoles = divideRational(pureEquivalent, molar.value);
    const realizedDifference = subtractRational(realizedMoles, adjustedMoles);
    const relativeRealizedDifference = adjustedMoles.numerator === 0n ? RATIONAL_ZERO : divideRational(realizedDifference, adjustedMoles);
    preRoundMoles.set(id, adjustedMoles);
    finalMoles.set(id, realizedMoles);
    preRoundMasses.set(id, running);
    finalMasses.set(id, finalMass);
    traces.push(trace({ stepCode: "FINAL_WEIGHING_ROUNDED", adjustmentId: input.rounding.adjustmentId, adjustmentType: "final-weighing-rounding", stage: "final-rounding", resolvedOrder: input.rounding.order, description: `Final gross mass rounded once for "${id}".`, affectedEntities: [id], before: { preRoundMassGrams: out(running) }, after: { finalMassGrams: out(finalMass), deltaGrams: out(delta) }, equation: "finalMass=round_mode(preRoundMass/increment)*increment", units: { mass: "g" }, parameters: { incrementGrams: out(increment), mode: input.rounding.mode }, source: "user" }));
    if (minimumMass && compareRational(finalMass, minimumMass) < 0) warnings.push(diag({ code: "SUB_BALANCE_MASS", severity: "warning", blocking: false, fieldPath: `precursors.${id}.finalRoundedGrossWeighingMassGrams`, message: `Required mass for precursor "${column.displayName}" is ${out(finalMass)} g, below the configured practical weighing threshold of ${out(minimumMass)} g.`, precursorIds: [id], suggestedAction: "Increase batch size or use a suitable microbalance." }));
    if (compareRational(purity.value, RATIONAL_ONE) < 0 && compareRational(grossPurity, pureMass) < 0) errors.push(diag({ code: "PURITY_MASS_INVARIANT_FAILED", severity: "error", blocking: true, fieldPath: `precursors.${id}.purity`, message: "Lower purity unexpectedly reduced gross mass." }));
    const traceCodes = ["SOLVER_SCALAR_CONVERTED_FOR_MASS_DOMAIN", "SOLVER_QUANTITIES_SCALED", "PURE_MASS_CALCULATED", "PURITY_CORRECTION_APPLIED", ...lossSteps.map(() => "HANDLING_LOSS_APPLIED"), "FINAL_WEIGHING_ROUNDED", "REALIZED_PRECURSOR_MOLES_RECONSTRUCTED"];
    precursorResults.push(Object.freeze({ precursorId: id, displayName: column.displayName, columnIndex: column.index, solverMolesPerTargetFormulaMole: rationalToString(solverPerFormula), solverMolesPerTargetFormulaMoleExact: exactSolverQuantity, solverMolesPerTargetFormulaMoleDecimalApproximation: solverQuantityApproximation, nominalScaledMoles: out(nominal), postSolverAdjustedMoles: out(adjustedMoles), precursorAdjustmentIds: array(precursorAdjustmentIds.get(id)!), molarMassGramsPerMole: out(molar.value), molarMassSource: molar.source, ...(molar.override ? { molarMassOverride: Object.freeze({ ...molar.override }) } : {}), atomicWeightDatasetTitle: data.title, atomicWeightDatasetVersion: data.dataVersion, atomicWeightCalculationValuePolicy: data.calculationValuePolicyDescription, molarMassContributions: array(molar.contributions), pureRequiredMassGrams: out(pureMass), purity: out(purity.value), puritySource: purity.source, grossMassAfterPurityGrams: out(grossPurity), handlingLossSteps: array(lossSteps), totalRetainedFraction: out(retentionById.get(id)!), preRoundGrossWeighingMassGrams: out(running), finalRoundedGrossWeighingMassGrams: out(finalMass), roundingIncrementGrams: out(increment), roundingMode: input.rounding.mode, roundingDeltaGrams: out(delta), relativeRoundingDelta: out(relativeDelta), expectedRetainedGrossMassGrams: out(retainedGross), pureEquivalentFinalMassGrams: out(pureEquivalent), realizedPrecursorMoles: out(realizedMoles), realizedMinusIntendedMoles: out(realizedDifference), relativeRealizedMolesDifference: out(relativeRealizedDifference), traceStepCodes: array(traceCodes) }));
  }
  if (errors.length > 0) return failureResult(input, ideal, intended, adjusted, "calculation-failure", errors, warnings, traces, defaults, data.dataVersion, matrix, solver);
  traces.push(trace({ stepCode: "SOLVER_QUANTITIES_SCALED", description: "Formula-relative solver quantities scaled by target formula moles." }), trace({ stepCode: "PURE_MASSES_CALCULATED", description: "Pure precursor masses calculated from adjusted moles and selected molar masses.", equation: "pureMass=n*M", units: { mass: "g", amount: "mol", molarMass: "g/mol" } }), trace({ stepCode: "PURITY_CORRECTIONS_APPLIED", description: "Declared or explicitly defaulted purity corrections applied.", equation: "grossMass=pureMass/purity" }), trace({ stepCode: "FINAL_WEIGHING_ROUNDING_APPLIED", adjustmentId: input.rounding.adjustmentId, adjustmentType: "final-weighing-rounding", stage: "final-rounding", resolvedOrder: input.rounding.order, description: "Final gross weighing masses rounded once to the explicit balance increment.", equation: "finalMass=round_mode(preRoundMass/increment)*increment", parameters: { incrementGrams: out(increment), mode: input.rounding.mode }, source: "user" }), trace({ stepCode: "REALIZED_PRECURSOR_MOLES_RECONSTRUCTED", description: "Realized precursor moles reconstructed from final gross masses, purity, and molar mass; expected retained gross mass remains separately reported.", equation: "n_realized=finalGrossMass*purity/molarMass" }));

  const allElements = [...new Set(matrix.columns.flatMap((column) => Object.keys(column.composition.amounts)))].sort((a, b) => (matrix.elementToRow[a] ?? 999) - (matrix.elementToRow[b] ?? 999) || stable(a, b));
  const preTotals: Record<string, ExactRational> = {};
  const finalTotals: Record<string, ExactRational> = {};
  for (const element of allElements) {
    preTotals[element] = sumRationals(matrix.columns.map((column) => multiplyRational(parseExactRational(column.composition.amounts[element] ?? "0"), preRoundMoles.get(column.precursorId)!)));
    finalTotals[element] = sumRationals(matrix.columns.map((column) => multiplyRational(parseExactRational(column.composition.amounts[element] ?? "0"), finalMoles.get(column.precursorId)!)));
  }
  const realizedRows: RealizedElementResult[] = [];
  for (const row of matrix.rows) {
    const required = multiplyRational(parseExactRational(adjusted.amounts[row.element]!), targetFormulaMoles);
    const final = finalTotals[row.element] ?? RATIONAL_ZERO;
    const residual = subtractRational(final, required);
    const absolute = absRational(residual);
    const relative = required.numerator === 0n ? undefined : divideRational(residual, required);
    const contributors = matrix.columns.filter((column) => multiplyRational(parseExactRational(column.composition.amounts[row.element] ?? "0"), finalMoles.get(column.precursorId)!).numerator !== 0n).map((column) => column.precursorId);
    const passes = compareRational(absolute, residualTolerance) <= 0;
    if (!passes) warnings.push(diag({ code: "REALIZED_RESIDUAL_ABOVE_TOLERANCE", severity: "warning", blocking: false, fieldPath: `realizedElements.${row.element}`, message: `Final realized ${row.element} residual ${out(residual)} mol exceeds tolerance ${out(residualTolerance)} mol.`, element: row.element, precursorIds: contributors, suggestedAction: "Review adjustments or use a finer balance increment." }));
    if (relative && compareRational(absRational(relative), materialTolerance) > 0) warnings.push(diag({ code: "MATERIAL_ROUNDING_SHIFT", severity: "warning", blocking: false, fieldPath: `realizedElements.${row.element}`, message: `Rounding materially shifted ${row.element}: required ${out(required)} mol, realized ${out(final)} mol, relative residual ${out(relative)}.`, element: row.element, precursorIds: contributors, suggestedAction: "Increase batch size or use finer balance precision." }));
    realizedRows.push(Object.freeze({ element: row.element, adjustedRequiredMoles: out(required), preRoundRealizedMoles: out(preTotals[row.element] ?? RATIONAL_ZERO), finalRealizedMoles: out(final), signedResidualMoles: out(residual), absoluteResidualMoles: out(absolute), ...(relative ? { relativeResidual: out(relative) } : {}), passesTolerance: passes, mainPrecursorContributors: array(contributors) }));
  }
  const rawTotals = record(Object.fromEntries(allElements.map((element) => [element, out(finalTotals[element]!)])));
  const rawComposition: ElementalComposition = Object.freeze({ schemaVersion: "1.0.0", amounts: rawTotals });
  const normalized = normalizeCompositionToTotal(rawComposition, "1");
  const realizedComposition = normalized.success ? normalized.value : empty;
  const precursorOnly = record(Object.fromEntries(allElements.filter((element) => !(element in matrix.elementToRow)).map((element) => [element, out(finalTotals[element]!)])));
  traces.push(trace({ stepCode: "REALIZED_ELEMENTAL_TOTALS_RECONSTRUCTED", description: "Raw realized elemental mole totals reconstructed from final precursor moles.", after: rawTotals, units: { amount: "mol" } }), trace({ stepCode: "ELEMENTAL_RESIDUALS_CALCULATED", description: "Signed residuals calculated as realized minus adjusted required moles.", equation: "residual=realized-adjustedRequired" }), trace({ stepCode: "WARNINGS_GENERATED", description: "Sub-balance, impurity, precursor-adjustment, and rounding-materiality warnings generated.", after: { warningCodes: warnings.map((item) => item.code).sort().join(",") } }), trace({ stepCode: "CANONICAL_RESULT_CREATED", description: "Timestamp-free canonical batch result created." }));

  warnings.sort((left, right) => stable(left.fieldPath, right.fieldPath) || stable(left.code, right.code));
  const preRoundTotal = sumRationals([...preRoundMasses.values()]);
  const finalTotal = sumRationals([...finalMasses.values()]);
  const difference = subtractRational(finalTotal, requested);
  const relativeDifference = divideRational(difference, requested);
  const resolvedOrder = array([...ordered.map((item) => Object.freeze({ id: item.id, type: item.type, stage: item.stage, order: item.order })), Object.freeze({ id: input.rounding.adjustmentId, type: "final-weighing-rounding", stage: "final-rounding", order: input.rounding.order })]);
  const batch = Object.freeze({ requestedMassGrams: out(requested), massUnit: "g" as const, basis: input.batch.basis, targetFormulaMoles: out(targetFormulaMoles), idealTargetMolarMassGramsPerMole: out(idealMolarMass), ...(yieldFraction ? { expectedYield: out(yieldFraction) } : {}), nominalProductMassGrams: out(nominalProductMass), preRoundingTotalPrecursorMassGrams: out(preRoundTotal), finalRoundedTotalWeighingMassGrams: out(finalTotal), finalMinusRequestedMassGrams: out(difference), relativeDifferenceFromRequested: out(relativeDifference) });
  const status: BatchCalculationStatus = warnings.length > 0 ? "success-with-warnings" : "success";
  const base = { schemaVersion: BATCH_CALCULATION_SCHEMA_VERSION, engineVersion: ENGINE_VERSION, status, idealCrystalComposition: ideal, intendedFeedComposition: intended, adjustedFeedComposition: adjusted, realizedComposition, rawRealizedElementMoles: rawTotals, precursorOnlyRealizedElementMoles: precursorOnly, matrix, solver, batch, precursors: array(precursorResults), realizedElements: array(realizedRows), resolvedAdjustmentOrder: resolvedOrder, appliedDefaults: array(defaults), warnings: array(warnings), errors: Object.freeze([]), trace: array(traces), dataVersions: Object.freeze({ atomicWeights: data.dataVersion }) };
  return Object.freeze({ ...base, canonicalScientificRepresentation: canonicalBatch(base) });
}

export function canonicalizeBatchCalculation(result: BatchCalculationResult): string { return canonicalBatch(result); }
export function verifyBatchCalculation(result: BatchCalculationResult): Readonly<{ valid: boolean; errors: readonly BatchDiagnostic[] }> {
  const errors: BatchDiagnostic[] = [];
  if (result.status === "success" || result.status === "success-with-warnings") {
    for (const precursor of result.precursors) {
      const increment = parseExactRational(precursor.roundingIncrementGrams);
      const mass = parseExactRational(precursor.finalRoundedGrossWeighingMassGrams);
      const quotient = divideRational(mass, increment);
      if (quotient.denominator !== 1n) errors.push(diag({ code: "ROUNDING_VERIFICATION_FAILED", severity: "error", blocking: true, fieldPath: `precursors.${precursor.precursorId}`, message: "Final mass is not an exact multiple of the balance increment." }));
    }
    if (result.realizedElements.some((item) => new ChemistryDecimal(item.finalRealizedMoles).minus(item.adjustedRequiredMoles).minus(item.signedResidualMoles).abs().greaterThan("1e-30"))) errors.push(diag({ code: "RESIDUAL_VERIFICATION_FAILED", severity: "error", blocking: true, fieldPath: "realizedElements", message: "A reported residual does not equal realized minus required amount within output serialization precision." }));
  }
  return Object.freeze({ valid: errors.length === 0, errors: array(errors) });
}
