import { calculateEmiStatistics } from "./statistics";
import type {
  EmiBandReplicateSummary,
  EmiFrequencyRange,
  EmiGridCompatibility,
  EmiInterpolationOptions,
  EmiMetric,
  EmiPointwiseMetricStatistics,
  EmiReplicateAggregationResult,
  EmiReplicateSeries,
} from "./types";

export const DEFAULT_EMI_INTERPOLATION_OPTIONS: EmiInterpolationOptions = Object.freeze({ enabled: false, strategy: "reference-grid", overlapOnly: true });
const METRICS = ["SET", "SER", "SEA", "R", "T", "A"] as const satisfies readonly EmiMetric[];

function orderedFrequencies(series: EmiReplicateSeries): readonly number[] {
  return series.points.map((point) => point.frequencyHz);
}

function bounds(series: EmiReplicateSeries): Readonly<{ minimum: number; maximum: number }> | undefined {
  const values = orderedFrequencies(series).filter(Number.isFinite);
  return values.length === 0 ? undefined : { minimum: Math.min(...values), maximum: Math.max(...values) };
}

/** Classify frequency grids without reordering or mutating source measurements. */
export function classifyEmiFrequencyGrids(series: readonly EmiReplicateSeries[]): EmiGridCompatibility {
  if (series.length <= 1) return "exact-grid-match";
  const reference = orderedFrequencies(series[0] as EmiReplicateSeries);
  if (series.every((item) => {
    const frequencies = orderedFrequencies(item);
    return frequencies.length === reference.length && frequencies.every((value, index) => value === reference[index]);
  })) return "exact-grid-match";
  const ranges = series.map(bounds);
  if (ranges.some((range) => range === undefined)) return "nonoverlap";
  const resolved = ranges as readonly Readonly<{ minimum: number; maximum: number }>[];
  const overlapMinimum = Math.max(...resolved.map((range) => range.minimum));
  const overlapMaximum = Math.min(...resolved.map((range) => range.maximum));
  if (overlapMinimum > overlapMaximum) return "nonoverlap";
  if (resolved.every((range) => range.minimum === resolved[0]?.minimum && range.maximum === resolved[0]?.maximum)) return "same-range-different-points";
  return "partial-overlap";
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2 : sorted[middle] as number;
}

function sampleStandardDeviation(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}

const T_975 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042] as const;

function confidenceInterval95(values: readonly number[], mean: number, standardDeviation: number | null): Readonly<{ lower: number; upper: number }> | null {
  if (values.length < 2 || standardDeviation === null) return null;
  const degreesOfFreedom = values.length - 1;
  const critical = degreesOfFreedom <= T_975.length ? T_975[degreesOfFreedom - 1] as number : 1.96;
  const margin = critical * standardDeviation / Math.sqrt(values.length);
  return { lower: mean - margin, upper: mean + margin };
}

function summarize(values: readonly number[]) {
  if (values.length === 0) return { mean: null, median: null, sampleStandardDeviation: null, minimum: null, maximum: null, confidenceInterval95: null };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const standardDeviation = sampleStandardDeviation(values);
  return { mean, median: median(values), sampleStandardDeviation: standardDeviation, minimum: Math.min(...values), maximum: Math.max(...values), confidenceInterval95: confidenceInterval95(values, mean, standardDeviation) };
}

function commonGrid(series: readonly EmiReplicateSeries[], options: EmiInterpolationOptions): readonly number[] {
  const ranges = series.map(bounds).filter((range): range is Readonly<{ minimum: number; maximum: number }> => range !== undefined);
  if (ranges.length !== series.length || ranges.length === 0) return [];
  const minimum = Math.max(...ranges.map((range) => range.minimum));
  const maximum = Math.min(...ranges.map((range) => range.maximum));
  if (minimum > maximum) return [];
  if (options.strategy === "reference-grid") return [...new Set(series[0]?.points.map((point) => point.frequencyHz).filter((frequency) => frequency >= minimum && frequency <= maximum) ?? [])];
  if (options.strategy === "frequency-interval") {
    const interval = options.frequencyIntervalHz;
    if (interval === undefined || !Number.isFinite(interval) || interval <= 0) return [];
    const values: number[] = [];
    for (let frequency = minimum; frequency <= maximum + interval * 1e-9; frequency += interval) values.push(Math.min(frequency, maximum));
    return [...new Set(values)];
  }
  const count = Math.max(2, Math.floor(options.pointCount ?? 0));
  if (!Number.isFinite(count)) return [];
  return Array.from({ length: count }, (_, index) => minimum + (index / (count - 1)) * (maximum - minimum));
}

/** Linear interpolation of derived scalar metrics; invalid brackets remain invalid and no extrapolation occurs. */
export function interpolateEmiMetric(series: EmiReplicateSeries, metric: EmiMetric, frequencyHz: number): number | null {
  const sorted = [...series.points].sort((left, right) => left.frequencyHz - right.frequencyHz);
  const exact = sorted.find((point) => point.frequencyHz === frequencyHz);
  if (exact) {
    const value = exact[metric];
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  const upperIndex = sorted.findIndex((point) => point.frequencyHz > frequencyHz);
  if (upperIndex <= 0) return null;
  const lower = sorted[upperIndex - 1];
  const upper = sorted[upperIndex];
  if (!lower || !upper || frequencyHz < lower.frequencyHz || frequencyHz > upper.frequencyHz) return null;
  const lowerValue = lower[metric];
  const upperValue = upper[metric];
  if (typeof lowerValue !== "number" || typeof upperValue !== "number" || !Number.isFinite(lowerValue) || !Number.isFinite(upperValue)) return null;
  return lowerValue + ((frequencyHz - lower.frequencyHz) / (upper.frequencyHz - lower.frequencyHz)) * (upperValue - lowerValue);
}

export function calculatePointwiseReplicateStatistics(
  series: readonly EmiReplicateSeries[],
  options: EmiInterpolationOptions = DEFAULT_EMI_INTERPOLATION_OPTIONS,
): EmiReplicateAggregationResult {
  const compatibility = classifyEmiFrequencyGrids(series);
  if (series.length === 0 || compatibility === "nonoverlap" || (compatibility !== "exact-grid-match" && !options.enabled)) return { compatibility, interpolationApplied: false, frequencyGridHz: [], statistics: [] };
  const interpolationApplied = compatibility !== "exact-grid-match";
  const frequencyGridHz = interpolationApplied ? commonGrid(series, options) : orderedFrequencies(series[0] as EmiReplicateSeries);
  const statistics: EmiPointwiseMetricStatistics[] = [];
  for (const frequencyHz of frequencyGridHz) {
    for (const metric of METRICS) {
      const values = series.map((item) => interpolationApplied ? interpolateEmiMetric(item, metric, frequencyHz) : item.points.find((point) => point.frequencyHz === frequencyHz)?.[metric] ?? null).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      statistics.push({ frequencyHz, metric, contributingReplicateCount: values.length, totalReplicateCount: series.length, ...summarize(values), interpolationStatus: interpolationApplied ? "interpolated-grid" : "original-grid" });
    }
  }
  return { compatibility, interpolationApplied, frequencyGridHz, statistics };
}

export function calculateSpecimenFirstBandSummary(series: readonly EmiReplicateSeries[], metric: EmiMetric, range: EmiFrequencyRange = {}): EmiBandReplicateSummary {
  const specimenStats = series.map((item) => calculateEmiStatistics(item.points, metric, range));
  const values = specimenStats.map((stat) => stat.mean).filter((value): value is number => value !== null && Number.isFinite(value));
  return { metric, specimenCount: series.length, validSpecimenCount: values.length, validPointCount: specimenStats.reduce((sum, stat) => sum + stat.validPointCount, 0), ...summarize(values), averageValidPointPercentage: series.length === 0 ? 0 : specimenStats.reduce((sum, stat) => sum + stat.validPointPercentage, 0) / series.length, approach: "specimen-first" };
}

export function calculatePooledPointBandSummary(series: readonly EmiReplicateSeries[], metric: EmiMetric, range: EmiFrequencyRange = {}): EmiBandReplicateSummary {
  const specimenStats = series.map((item) => calculateEmiStatistics(item.points, metric, range));
  const values = series.flatMap((item) => item.points.filter((point) => (range.minimumHz === undefined || point.frequencyHz >= range.minimumHz) && (range.maximumHz === undefined || point.frequencyHz <= range.maximumHz)).map((point) => point[metric]).filter((value): value is number => typeof value === "number" && Number.isFinite(value)));
  const validSpecimenCount = specimenStats.filter((stat) => stat.validPointCount > 0).length;
  return { metric, specimenCount: series.length, validSpecimenCount, validPointCount: values.length, ...summarize(values), averageValidPointPercentage: series.length === 0 ? 0 : specimenStats.reduce((sum, stat) => sum + stat.validPointPercentage, 0) / series.length, approach: "pooled-point" };
}

export type EmiThicknessUnit = "m" | "mm" | "um" | "in";
export type EmiArealDensityUnit = "kg/m2" | "g/m2" | "g/cm2";

export function convertThicknessToMillimeters(value: number, unit: EmiThicknessUnit): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return value * ({ m: 1000, mm: 1, um: 0.001, in: 25.4 } as const)[unit];
}

export function normalizeSetByThickness(setDb: number | null, thickness: number, unit: EmiThicknessUnit): number | null {
  const millimeters = convertThicknessToMillimeters(thickness, unit);
  return setDb === null || !Number.isFinite(setDb) || millimeters === null ? null : setDb / millimeters;
}

export function convertArealDensityToKilogramsPerSquareMeter(value: number, unit: EmiArealDensityUnit): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return value * ({ "kg/m2": 1, "g/m2": 0.001, "g/cm2": 10 } as const)[unit];
}

export function normalizeSetByArealDensity(setDb: number | null, arealDensity: number, unit: EmiArealDensityUnit): number | null {
  const kilogramsPerSquareMeter = convertArealDensityToKilogramsPerSquareMeter(arealDensity, unit);
  return setDb === null || !Number.isFinite(setDb) || kilogramsPerSquareMeter === null ? null : setDb / kilogramsPerSquareMeter;
}
