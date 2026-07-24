export type EmiDirection = "forward" | "reverse";
export type SParameter = "s11" | "s21" | "s22" | "s12";
export type EmiMetric = "SET" | "SER" | "SEA" | "R" | "T" | "A";
export type EmiIssueSeverity = "error" | "warning";

export type EmiIssueCode =
  | "DATA_SECTION_NOT_FOUND"
  | "DATA_SECTION_END_NOT_FOUND"
  | "HEADER_NOT_FOUND"
  | "MISSING_REQUIRED_COLUMN"
  | "UNPARSEABLE_NUMERIC_VALUE"
  | "MISSING_DATA_ROWS"
  | "DUPLICATE_FREQUENCY"
  | "NONMONOTONIC_FREQUENCY"
  | "NONFINITE_VALUE"
  | "REFLECTION_GREATER_THAN_ONE"
  | "TRANSMISSION_GREATER_THAN_ONE"
  | "POWER_SUM_GREATER_THAN_ONE"
  | "NEGATIVE_ABSORPTION"
  | "UNDEFINED_SET"
  | "UNDEFINED_SER"
  | "UNDEFINED_SEA"
  | "DECOMPOSITION_RESIDUAL_EXCEEDED"
  | "S21_S12_DIFFERENCE"
  | "FORWARD_REVERSE_DIFFERENCE";

export interface EmiComplexValue {
  readonly real: number;
  readonly imaginary: number;
}

export interface EmiFrequencyPoint {
  readonly rowNumber: number;
  readonly frequencyHz: number;
  readonly s11: EmiComplexValue;
  readonly s21: EmiComplexValue;
  readonly s22: EmiComplexValue;
  readonly s12: EmiComplexValue;
}

export interface KeysightInstrumentMetadata {
  readonly manufacturer?: string;
  readonly model?: string;
  readonly serialNumber?: string;
  readonly firmwareVersion?: string;
}

export interface EmiDatasetMetadata {
  readonly csvVersion?: string;
  readonly date?: string;
  readonly source?: string;
  readonly channel?: string;
  readonly instrument?: KeysightInstrumentMetadata;
  readonly comments: readonly string[];
}

export interface EmiValidationIssue {
  readonly severity: EmiIssueSeverity;
  readonly code: EmiIssueCode;
  readonly message: string;
  readonly filename: string;
  readonly rowNumber?: number;
  readonly frequencyHz?: number;
  readonly direction?: EmiDirection;
  readonly values?: Readonly<Record<string, number | null>>;
}

export interface EmiDataset {
  readonly filename: string;
  readonly metadata: EmiDatasetMetadata;
  readonly headers: readonly string[];
  readonly points: readonly EmiFrequencyPoint[];
  readonly parsingIssues: readonly EmiValidationIssue[];
}

export type EmiParseResult =
  | Readonly<{ ok: true; dataset: EmiDataset }>
  | Readonly<{ ok: false; filename: string; issues: readonly EmiValidationIssue[] }>;

export interface EmiDirectionalPointResult {
  readonly direction: EmiDirection;
  readonly frequencyHz: number;
  readonly reflectionParameter: "s11" | "s22";
  readonly transmissionParameter: "s21" | "s12";
  readonly R: number;
  readonly T: number;
  readonly A: number;
  readonly SET: number | null;
  readonly SER: number | null;
  readonly SEA: number | null;
  readonly decompositionResidual: number | null;
}

export interface EmiCalculationResult {
  readonly filename: string;
  readonly forward: readonly EmiDirectionalPointResult[];
  readonly reverse: readonly EmiDirectionalPointResult[];
}

export interface EmiValidationOptions {
  /** Numerical identity tolerance in dB, not a measurement-quality threshold. */
  readonly decompositionToleranceDb?: number;
  /** Configurable screening threshold for the complex magnitude |S21 - S12|. */
  readonly reciprocityComplexTolerance?: number;
  /** Configurable screening threshold for directional shielding differences. */
  readonly directionalDifferenceToleranceDb?: number;
}

export interface EmiFrequencyRange {
  readonly minimumHz?: number;
  readonly maximumHz?: number;
}

export interface EmiMetricStatistics {
  readonly metric: EmiMetric;
  readonly count: number;
  readonly validPointCount: number;
  readonly excludedPointCount: number;
  readonly validPointPercentage: number;
  readonly excludedPointPercentage: number;
  readonly mean: number | null;
  readonly median: number | null;
  /** Population standard deviation over valid points in the selected range. */
  readonly standardDeviation: number | null;
  readonly minimum: number | null;
  readonly maximum: number | null;
}

export type EmiGridCompatibility = "exact-grid-match" | "same-range-different-points" | "partial-overlap" | "nonoverlap";
export type EmiCommonGridStrategy = "reference-grid" | "frequency-interval" | "point-count";

export interface EmiInterpolationOptions {
  readonly enabled: boolean;
  readonly strategy: EmiCommonGridStrategy;
  readonly frequencyIntervalHz?: number;
  readonly pointCount?: number;
  /** This milestone supports overlap-only interpolation and never extrapolates. */
  readonly overlapOnly: true;
}

export interface EmiReplicateSeries {
  readonly id: string;
  readonly points: readonly EmiDirectionalPointResult[];
}

export interface EmiPointwiseMetricStatistics {
  readonly frequencyHz: number;
  readonly metric: EmiMetric;
  readonly contributingReplicateCount: number;
  readonly totalReplicateCount: number;
  readonly mean: number | null;
  readonly median: number | null;
  /** Sample standard deviation across independent specimen values (n - 1). */
  readonly sampleStandardDeviation: number | null;
  readonly minimum: number | null;
  readonly maximum: number | null;
  readonly confidenceInterval95: Readonly<{ lower: number; upper: number }> | null;
  readonly interpolationStatus: "original-grid" | "interpolated-grid";
}

export interface EmiReplicateAggregationResult {
  readonly compatibility: EmiGridCompatibility;
  readonly interpolationApplied: boolean;
  readonly frequencyGridHz: readonly number[];
  readonly statistics: readonly EmiPointwiseMetricStatistics[];
}

export interface EmiBandReplicateSummary {
  readonly metric: EmiMetric;
  readonly specimenCount: number;
  readonly validSpecimenCount: number;
  readonly validPointCount: number;
  readonly mean: number | null;
  readonly median: number | null;
  readonly sampleStandardDeviation: number | null;
  readonly minimum: number | null;
  readonly maximum: number | null;
  readonly confidenceInterval95: Readonly<{ lower: number; upper: number }> | null;
  readonly averageValidPointPercentage: number;
  readonly approach: "specimen-first" | "pooled-point";
}
