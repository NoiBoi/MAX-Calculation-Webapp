import { z } from "zod";

export const DecimalStringSchema = z
  .string()
  .trim()
  .regex(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/, "Expected a decimal number")
  .describe("Base-10 numeric text. Parsed only with decimal.js; never binary floating-point.");

export const NonNegativeDecimalStringSchema = DecimalStringSchema.refine(
  (value) => !value.startsWith("-"),
  "Expected a non-negative decimal",
);

export const PositiveDecimalStringSchema = DecimalStringSchema.refine(
  (value) => !value.startsWith("-") && !/^0*(?:\.0*)?(?:[eE][+-]?\d+)?$/.test(value),
  "Expected a positive decimal",
);

export const ElementSymbolSchema = z.string().regex(/^[A-Z][a-z]?$/, "Invalid element symbol");
export const IsoTimestampSchema = z.iso.datetime({ offset: true });
export const IdSchema = z.string().min(1).max(128);

export const SiteOccupantSchema = z.object({
  element: ElementSymbolSchema,
  fraction: NonNegativeDecimalStringSchema,
  locked: z.boolean().default(false),
});

export const CrystalSiteSchema = z.object({
  id: IdSchema,
  role: z.enum(["M", "A", "X", "custom"]),
  label: z.string().min(1).max(80).optional(),
  multiplicity: PositiveDecimalStringSchema,
  occupants: z.array(SiteOccupantSchema),
  vacancyFraction: NonNegativeDecimalStringSchema.default("0"),
});

export const SiteCompositionRoleSchema = z.enum(["ideal-crystal", "intended-feed"]);
export const NormalizationModeSchema = z.enum(["strict", "normalizeOccupants", "normalizeAll"]);

const SiteCompositionBaseSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  structure: z.enum(["211", "312", "413", "custom"]),
  compositionRole: SiteCompositionRoleSchema,
  sites: z.array(CrystalSiteSchema).min(1),
});

export const IdealCrystalCompositionSchema = SiteCompositionBaseSchema.extend({
  compositionRole: z.literal("ideal-crystal"),
});

export const IntendedFeedCompositionSchema = SiteCompositionBaseSchema.extend({
  compositionRole: z.literal("intended-feed"),
});

export const SiteCompositionSchema = z.discriminatedUnion("compositionRole", [
  IdealCrystalCompositionSchema,
  IntendedFeedCompositionSchema,
]);

export const TargetCompositionSchema = z.object({
  conventionalFormula: z.string().trim().min(1).optional(),
  idealCrystal: IdealCrystalCompositionSchema,
  intendedFeed: IntendedFeedCompositionSchema.optional(),
});

export const PrecursorConstraintSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("solver-controlled") }),
  z.object({ kind: z.literal("fixed"), moles: NonNegativeDecimalStringSchema }),
  z.object({
    kind: z.literal("bounded"),
    minimumMoles: NonNegativeDecimalStringSchema.optional(),
    maximumMoles: NonNegativeDecimalStringSchema.optional(),
  }),
  z.object({
    kind: z.literal("ratio-locked"),
    groupId: IdSchema,
    ratio: PositiveDecimalStringSchema,
  }),
]);

export const PrecursorSchema = z.object({
  id: IdSchema,
  name: z.string().min(1).max(120),
  formula: z.string().trim().min(1),
  alias: z.string().max(80).optional(),
  purityPercent: PositiveDecimalStringSchema.default("100"),
  molarMassOverrideGramsPerMole: PositiveDecimalStringSchema.optional(),
  supplier: z.string().max(120).optional(),
  lotIdentifier: z.string().max(120).optional(),
  particleSize: z.string().max(120).optional(),
  notes: z.string().max(4000).optional(),
  defaultExcessPercent: DecimalStringSchema.default("0"),
  constraint: PrecursorConstraintSchema.default({ kind: "solver-controlled" }),
});

export const SolverObjectiveSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("exact") }),
  z.object({ kind: z.literal("prefer-saved-route"), routeId: IdSchema }),
  z.object({ kind: z.literal("minimize-precursor-count") }),
  z.object({ kind: z.literal("minimize-elemental-precursors") }),
  z.object({ kind: z.literal("minimize-total-mass") }),
  z.object({ kind: z.literal("match-ratio"), groupId: IdSchema }),
  z.object({ kind: z.literal("preserve-locked-quantities") }),
]);

const AdjustmentBaseSchema = z.object({
  id: IdSchema,
  enabled: z.boolean().default(true),
  order: z.number().int().nonnegative(),
  note: z.string().max(500).optional(),
});

export const AdjustmentSchema = z.discriminatedUnion("kind", [
  AdjustmentBaseSchema.extend({
    kind: z.literal("element-percent"),
    element: ElementSymbolSchema,
    percent: DecimalStringSchema,
  }),
  AdjustmentBaseSchema.extend({
    kind: z.literal("precursor-percent"),
    precursorId: IdSchema,
    percent: DecimalStringSchema,
  }),
  AdjustmentBaseSchema.extend({
    kind: z.literal("volatilization-allowance"),
    element: ElementSymbolSchema,
    percent: NonNegativeDecimalStringSchema,
  }),
  AdjustmentBaseSchema.extend({
    kind: z.literal("purity-correction"),
    precursorId: IdSchema.optional(),
  }),
  AdjustmentBaseSchema.extend({
    kind: z.enum(["expected-yield", "milling-loss", "transfer-loss"]),
    percent: NonNegativeDecimalStringSchema,
  }),
  AdjustmentBaseSchema.extend({
    kind: z.literal("target-recovered-mass"),
    grams: PositiveDecimalStringSchema,
  }),
  AdjustmentBaseSchema.extend({
    kind: z.literal("weighing-rounding"),
    incrementGrams: PositiveDecimalStringSchema,
    mode: z.enum(["half-up", "half-even", "down", "up"]).default("half-up"),
  }),
]);

export const RecipeInputSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  recipeId: IdSchema,
  revision: z.number().int().positive(),
  name: z.string().min(1).max(160),
  target: TargetCompositionSchema,
  targetBatchMassGrams: PositiveDecimalStringSchema,
  precursors: z.array(PrecursorSchema).min(1),
  solverObjectives: z.array(SolverObjectiveSchema).min(1).default([{ kind: "exact" }]),
  adjustments: z.array(AdjustmentSchema).default([]),
  atomicWeightDataVersion: z.string().min(1),
  atomicRadiusDataVersion: z.string().min(1).optional(),
  calculationPrecisionDigits: z.number().int().min(12).max(100).default(34),
  residualToleranceMoles: PositiveDecimalStringSchema.default("1e-12"),
  metadata: z.object({
    createdAt: IsoTimestampSchema,
    modifiedAt: IsoTimestampSchema,
    sourceRecipeId: IdSchema.optional(),
    notes: z.string().max(4000).optional(),
  }),
});

export const CalculationWarningSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  severity: z.enum(["info", "warning", "error"]),
  message: z.string().min(1),
  fieldPath: z.string().optional(),
  precursorId: IdSchema.optional(),
  element: ElementSymbolSchema.optional(),
  blocksResult: z.boolean(),
  suggestedAction: z.string().optional(),
});

export const ElementAmountMapSchema = z.record(ElementSymbolSchema, DecimalStringSchema);

export const ElementalCompositionSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  amounts: z.record(ElementSymbolSchema, NonNegativeDecimalStringSchema),
});

/** Scientific precursor input for matrix construction; recipe/weighing fields belong to later phases. */
export const BalancePrecursorDefinitionSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  id: IdSchema,
  name: z.string().trim().min(1).max(120),
  formula: z.string().trim().min(1).optional(),
  composition: ElementalCompositionSchema.optional(),
  order: z.number().int().optional(),
}).refine((value) => value.formula !== undefined || value.composition !== undefined, {
  message: "A precursor formula or elemental composition is required.",
  path: ["formula"],
});

export const BalanceDiagnosticSchema = z.object({
  code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  severity: z.enum(["warning", "error"]),
  fieldPath: z.string(),
  blocking: z.boolean(),
  message: z.string().min(1),
  suggestedAction: z.string().optional(),
  element: ElementSymbolSchema.optional(),
  precursorIds: z.array(IdSchema).optional(),
});

export const BalanceTraceEntrySchema = z.object({
  stepCode: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
  description: z.string().min(1),
  entityIds: z.array(z.string()).default([]),
  inputReferences: z.array(z.string()).default([]),
  outputReferences: z.array(z.string()).default([]),
});

export const SolverPrecursorConstraintSchema = z.discriminatedUnion("mode", [
  z.object({ schemaVersion: z.literal("1.0.0"), mode: z.literal("solver"), precursorId: IdSchema }),
  z.object({ schemaVersion: z.literal("1.0.0"), mode: z.literal("fixed"), precursorId: IdSchema, value: NonNegativeDecimalStringSchema }),
  z.object({ schemaVersion: z.literal("1.0.0"), mode: z.literal("bounded"), precursorId: IdSchema, minimum: NonNegativeDecimalStringSchema.optional(), maximum: NonNegativeDecimalStringSchema.optional() }),
  z.object({
    schemaVersion: z.literal("1.0.0"),
    mode: z.literal("ratio"),
    numeratorPrecursorId: IdSchema,
    denominatorPrecursorId: IdSchema,
    numeratorRatio: PositiveDecimalStringSchema,
    denominatorRatio: PositiveDecimalStringSchema,
  }),
]);

export const PrecursorSolverObjectiveSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("deterministic-feasible") }),
  z.object({ kind: z.literal("minimize-total-quantity") }),
  z.object({ kind: z.literal("prefer-precursors"), precursorIds: z.array(IdSchema).min(1) }),
]);

export const SolverTolerancePolicySchema = z.object({
  elementalAbsolute: NonNegativeDecimalStringSchema,
  elementalRelative: NonNegativeDecimalStringSchema,
  nonnegativity: NonNegativeDecimalStringSchema,
  bound: NonNegativeDecimalStringSchema,
  ratio: NonNegativeDecimalStringSchema,
  objectiveTie: NonNegativeDecimalStringSchema,
});

const BatchAdjustmentBaseSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  id: IdSchema,
  order: z.number().int(),
  source: z.enum(["user", "route-default", "system-default"]),
});

export const BatchAdjustmentSchema = z.discriminatedUnion("type", [
  BatchAdjustmentBaseSchema.extend({ type: z.literal("elemental-excess"), stage: z.literal("pre-solver"), element: ElementSymbolSchema, fraction: NonNegativeDecimalStringSchema }),
  BatchAdjustmentBaseSchema.extend({ type: z.literal("elemental-deficiency"), stage: z.literal("pre-solver"), element: ElementSymbolSchema, fraction: NonNegativeDecimalStringSchema }),
  BatchAdjustmentBaseSchema.extend({ type: z.literal("precursor-molar-excess"), stage: z.literal("post-solver"), precursorId: IdSchema, fraction: NonNegativeDecimalStringSchema }),
  BatchAdjustmentBaseSchema.extend({ type: z.literal("precursor-molar-deficiency"), stage: z.literal("post-solver"), precursorId: IdSchema, fraction: NonNegativeDecimalStringSchema }),
  BatchAdjustmentBaseSchema.extend({ type: z.literal("handling-loss"), stage: z.literal("mass-domain"), label: z.string().min(1), fraction: NonNegativeDecimalStringSchema, scope: z.union([z.literal("all"), z.array(IdSchema).min(1)]) }),
]);

export const MolarMassOverrideSchema = z.object({
  value: PositiveDecimalStringSchema,
  units: z.literal("g/mol"),
  source: z.string().min(1),
  reason: z.string().min(1),
  provenance: z.string().min(1),
  version: z.string().min(1).optional(),
});

export const BatchPrecursorMaterialSchema = BalancePrecursorDefinitionSchema.safeExtend({
  purity: PositiveDecimalStringSchema.optional(),
  molarMassOverride: MolarMassOverrideSchema.optional(),
});

export const BatchScaleSchema = z.object({
  basis: z.enum(["ideal-product-mass", "recovered-product-mass", "final-precursor-mixture-mass"]),
  requestedMassGrams: PositiveDecimalStringSchema,
  expectedYield: PositiveDecimalStringSchema.optional(),
});

export const BatchRoundingSchema = z.object({
  adjustmentId: IdSchema,
  order: z.number().int(),
  incrementGrams: PositiveDecimalStringSchema,
  mode: z.enum(["nearest-half-even", "nearest-half-up", "floor", "ceiling"]),
  minimumPracticalMassGrams: PositiveDecimalStringSchema.optional(),
  residualToleranceMoles: NonNegativeDecimalStringSchema,
  materialityRelativeTolerance: NonNegativeDecimalStringSchema,
});

export const ChemistryErrorCodeSchema = z.enum([
  "EMPTY_FORMULA",
  "WHITESPACE_NOT_ALLOWED",
  "UNKNOWN_ELEMENT",
  "INVALID_ELEMENT_START",
  "INVALID_COEFFICIENT",
  "ZERO_COEFFICIENT",
  "NEGATIVE_COEFFICIENT",
  "UNEXPECTED_NUMBER",
  "EMPTY_GROUP",
  "UNMATCHED_OPENING_PARENTHESIS",
  "UNMATCHED_CLOSING_PARENTHESIS",
  "TRAILING_INVALID_CHARACTER",
  "UNSUPPORTED_CHARGE",
  "UNSUPPORTED_ISOTOPE",
  "UNSUPPORTED_HYDRATION_DOT",
  "UNSUPPORTED_VARIABLE",
  "UNSUPPORTED_UNCERTAINTY",
  "INVALID_COMPOSITION",
  "INVALID_SCALAR",
  "INVALID_TOLERANCE",
  "EMPTY_COMPOSITION",
  "NORMALIZATION_REFERENCE_MISSING",
  "NORMALIZATION_REFERENCE_ZERO",
  "INVALID_ELEMENT_DATA",
  "MISSING_ATOMIC_WEIGHT",
  "INVALID_SITE_STRUCTURE",
  "INVALID_SITE_ID",
  "DUPLICATE_SITE_ID",
  "INVALID_MULTIPLICITY",
  "NEGATIVE_OCCUPANCY",
  "NEGATIVE_VACANCY",
  "VACANCY_ABOVE_ONE",
  "INVALID_SITE_ELEMENT",
  "DUPLICATE_OCCUPANT",
  "EMPTY_OCCUPIED_SITE",
  "SITE_OCCUPANCY_NOT_NORMALIZED",
  "SITE_OCCUPANCY_ABOVE_ONE",
  "CANNOT_NORMALIZE_OCCUPANTS",
  "INVALID_NORMALIZATION_MODE",
  "EMPTY_BALANCE_TARGET",
  "EMPTY_PRECURSOR_LIST",
  "INVALID_PRECURSOR_ID",
  "DUPLICATE_PRECURSOR_ID",
  "INVALID_PRECURSOR_NAME",
  "INVALID_PRECURSOR_ORDER",
  "MISSING_PRECURSOR_REPRESENTATION",
  "INVALID_PRECURSOR_FORMULA",
  "PRECURSOR_FORMULA_COMPOSITION_MISMATCH",
  "ZERO_PRECURSOR_COMPOSITION",
  "INVALID_PRECURSOR_COMPOSITION",
  "INVALID_BALANCE_TARGET",
  "UNSUPPORTED_PRECURSOR_SCHEMA_VERSION",
  "UNSUPPORTED_BALANCE_ANALYSIS_MODE",
  "INVALID_SOLVER_MATRIX",
  "UNSUPPORTED_SOLVER_SCHEMA_VERSION",
  "INVALID_SOLVER_CONSTRAINT",
  "DUPLICATE_SOLVER_CONSTRAINT",
  "UNKNOWN_CONSTRAINT_PRECURSOR",
  "CONTRADICTORY_SOLVER_CONSTRAINTS",
  "INVALID_SOLVER_TOLERANCE",
  "UNSUPPORTED_SOLVER_OBJECTIVE",
  "SOLVER_CANDIDATE_LIMIT_EXCEEDED",
  "SOLVER_INTERNAL_FAILURE",
]);

export const ChemistryErrorSchema = z.object({
  code: ChemistryErrorCodeSchema,
  message: z.string().min(1),
  position: z.number().int().nonnegative().optional(),
  end: z.number().int().nonnegative().optional(),
  token: z.string().optional(),
  offendingValue: z.string().optional(),
  suggestedCorrection: z.string().optional(),
  fieldPath: z.string().optional(),
});

export const SiteWarningSchema = z.object({
  code: z.enum(["SITE_NORMALIZATION_APPLIED", "VACANCY_ANNOTATED", "CUSTOM_SITE_RENDERING"]),
  message: z.string().min(1),
  siteId: IdSchema.optional(),
});

export const SiteNormalizationTraceEntrySchema = z.object({
  operation: z.literal("site-normalization"),
  mode: NormalizationModeSchema,
  siteId: IdSchema,
  beforeOccupantTotal: NonNegativeDecimalStringSchema,
  beforeVacancyFraction: NonNegativeDecimalStringSchema,
  afterOccupantTotal: NonNegativeDecimalStringSchema,
  afterVacancyFraction: NonNegativeDecimalStringSchema,
  occupantScaleFactor: NonNegativeDecimalStringSchema,
  vacancyScaleFactor: NonNegativeDecimalStringSchema,
});

export const FormulaTokenSchema = z.object({
  kind: z.enum(["element", "number", "open-parenthesis", "close-parenthesis"]),
  value: z.string(),
  position: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});

export const FractionEntrySchema = z.object({
  element: ElementSymbolSchema,
  coefficient: PositiveDecimalStringSchema,
  fraction: NonNegativeDecimalStringSchema,
});

export const FractionResultSchema = z.object({
  kind: z.enum(["atomic", "mass"]),
  entries: z.array(FractionEntrySchema),
  sum: PositiveDecimalStringSchema,
  elementDataVersion: z.string().optional(),
});

export const ChemistryWarningSchema = z.object({
  code: z.enum(["ATOMIC_WEIGHT_INTERVAL", "USER_SPECIFIED_ATOMIC_WEIGHT"]),
  message: z.string().min(1),
  element: ElementSymbolSchema,
});

export const MolarMassContributionSchema = z.object({
  element: ElementSymbolSchema,
  coefficient: PositiveDecimalStringSchema,
  atomicWeightGramsPerMole: PositiveDecimalStringSchema,
  contributionGramsPerMole: PositiveDecimalStringSchema,
  massFraction: NonNegativeDecimalStringSchema,
  calculationValuePolicy: z.enum([
    "point-value",
    "abridged-standard-value",
    "interval-midpoint",
    "user-specified",
  ]),
  sourceIds: z.array(z.string().min(1)),
});

export const AtomicWeightTraceEntrySchema = z.object({
  operation: z.literal("atomic-weight-selection"),
  element: ElementSymbolSchema,
  valueGramsPerMole: PositiveDecimalStringSchema,
  policy: MolarMassContributionSchema.shape.calculationValuePolicy,
  sourceIds: z.array(z.string().min(1)),
});

export const MolarMassResultSchema = z.object({
  totalMolarMass: PositiveDecimalStringSchema,
  units: z.literal("g/mol"),
  elementDataVersion: z.string().min(1),
  contributions: z.array(MolarMassContributionSchema).min(1),
  warnings: z.array(ChemistryWarningSchema),
  trace: z.array(AtomicWeightTraceEntrySchema),
});

export const CalculationTraceStepSchema = z.object({
  sequence: z.number().int().nonnegative(),
  operation: z.string().min(1),
  equation: z.string().min(1),
  inputs: z.record(z.string(), z.string()),
  outputs: z.record(z.string(), z.string()),
  units: z.record(z.string(), z.string()),
  adjustmentId: IdSchema.optional(),
});

export const PrecursorResultSchema = z.object({
  precursorId: IdSchema,
  name: z.string().min(1),
  formula: z.string().min(1),
  purityPercent: PositiveDecimalStringSchema,
  requiredMoles: DecimalStringSchema,
  idealMassGrams: DecimalStringSchema,
  correctedMassGrams: DecimalStringSchema,
  finalWeighingMassGrams: DecimalStringSchema,
  warningCodes: z.array(z.string()),
});

export const CalculationResultSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  status: z.enum(["success", "success-with-warnings", "invalid"]),
  recipeId: IdSchema,
  recipeRevision: z.number().int().positive(),
  engineVersion: z.string().min(1),
  dataVersions: z.object({ atomicWeights: z.string(), atomicRadii: z.string().optional() }),
  calculatedAt: IsoTimestampSchema,
  targetCompositionFormula: z.string().min(1),
  intendedFeedFormula: z.string().min(1),
  adjustedFeedFormula: z.string().min(1),
  realizedCompositionFormula: z.string().min(1),
  targetBatchMassGrams: DecimalStringSchema,
  totalWeighedMassGrams: DecimalStringSchema,
  precursors: z.array(PrecursorResultSchema),
  residualMolesByElement: ElementAmountMapSchema,
  maximumAbsoluteResidualMoles: NonNegativeDecimalStringSchema,
  warnings: z.array(CalculationWarningSchema),
  appliedAdjustmentIds: z.array(IdSchema),
  trace: z.array(CalculationTraceStepSchema),
  deterministicInputDigest: z.string().regex(/^[a-f0-9]{64}$/),
});

export type RecipeInput = z.infer<typeof RecipeInputSchema>;
export type CalculationResult = z.infer<typeof CalculationResultSchema>;
export type Adjustment = z.infer<typeof AdjustmentSchema>;
export type CalculationWarning = z.infer<typeof CalculationWarningSchema>;
export type SiteCompositionRole = z.infer<typeof SiteCompositionRoleSchema>;
export type NormalizationMode = z.infer<typeof NormalizationModeSchema>;
export type SiteOccupant = Readonly<z.infer<typeof SiteOccupantSchema>>;
export type CrystalSite = Readonly<
  Omit<z.infer<typeof CrystalSiteSchema>, "occupants"> & { occupants: readonly SiteOccupant[] }
>;
export type SiteComposition = Readonly<
  Omit<z.infer<typeof SiteCompositionBaseSchema>, "sites"> & { sites: readonly CrystalSite[] }
>;
export type IdealCrystalComposition = SiteComposition & { readonly compositionRole: "ideal-crystal" };
export type IntendedFeedComposition = SiteComposition & { readonly compositionRole: "intended-feed" };
export type SiteWarning = Readonly<z.infer<typeof SiteWarningSchema>>;
export type SiteNormalizationTraceEntry = Readonly<z.infer<typeof SiteNormalizationTraceEntrySchema>>;
export type ElementalComposition = Readonly<{
  schemaVersion: "1.0.0";
  amounts: Readonly<Record<string, string>>;
}>;
export type BalancePrecursorDefinition = Readonly<z.input<typeof BalancePrecursorDefinitionSchema>>;
export type BalanceDiagnostic = Readonly<
  Omit<z.infer<typeof BalanceDiagnosticSchema>, "precursorIds"> & {
    precursorIds?: readonly string[];
  }
>;
export type BalanceTraceEntry = Readonly<
  Omit<z.infer<typeof BalanceTraceEntrySchema>, "entityIds" | "inputReferences" | "outputReferences"> & {
    entityIds: readonly string[];
    inputReferences: readonly string[];
    outputReferences: readonly string[];
  }
>;
export type SolverPrecursorConstraint = Readonly<z.input<typeof SolverPrecursorConstraintSchema>>;
export type PrecursorSolverObjective =
  | Readonly<{ kind: "deterministic-feasible" }>
  | Readonly<{ kind: "minimize-total-quantity" }>
  | Readonly<{ kind: "prefer-precursors"; precursorIds: readonly string[] }>;
export type SolverTolerancePolicy = Readonly<z.infer<typeof SolverTolerancePolicySchema>>;
export type FractionEntry = Readonly<z.infer<typeof FractionEntrySchema>>;
export type FractionResult = Readonly<
  Omit<z.infer<typeof FractionResultSchema>, "entries"> & { entries: readonly FractionEntry[] }
>;
export type MolarMassContribution = Readonly<
  Omit<z.infer<typeof MolarMassContributionSchema>, "sourceIds"> & { sourceIds: readonly string[] }
>;
export type AtomicWeightTraceEntry = Readonly<
  Omit<z.infer<typeof AtomicWeightTraceEntrySchema>, "sourceIds"> & { sourceIds: readonly string[] }
>;
export type MolarMassResult = Readonly<
  Omit<z.infer<typeof MolarMassResultSchema>, "contributions" | "warnings" | "trace"> & {
    contributions: readonly MolarMassContribution[];
    warnings: readonly Readonly<z.infer<typeof ChemistryWarningSchema>>[];
    trace: readonly AtomicWeightTraceEntry[];
  }
>;
