import type { EmiDirectionalPointResult, EmiFrequencyRange, EmiMetric, EmiMetricStatistics } from "./types";

/** Calculate population statistics over an inclusive frequency range. */
export function calculateEmiStatistics(
  points: readonly EmiDirectionalPointResult[],
  metric: EmiMetric,
  range: EmiFrequencyRange = {},
): EmiMetricStatistics {
  const selected = points.filter((point) =>
    (range.minimumHz === undefined || point.frequencyHz >= range.minimumHz)
    && (range.maximumHz === undefined || point.frequencyHz <= range.maximumHz));
  const values = selected.map((point) => point[metric]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const count = selected.length;
  const validPointCount = values.length;
  const excludedPointCount = count - validPointCount;
  const validPointPercentage = count === 0 ? 0 : (validPointCount / count) * 100;
  const excludedPointPercentage = count === 0 ? 0 : (excludedPointCount / count) * 100;
  if (validPointCount === 0) {
    return { metric, count, validPointCount, excludedPointCount, validPointPercentage, excludedPointPercentage, mean: null, median: null, standardDeviation: null, minimum: null, maximum: null };
  }
  const sorted = [...values].sort((left, right) => left - right);
  const mean = values.reduce((sum, value) => sum + value, 0) / validPointCount;
  const middle = Math.floor(validPointCount / 2);
  const median = validPointCount % 2 === 0 ? ((sorted[middle - 1] as number) + (sorted[middle] as number)) / 2 : sorted[middle] as number;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / validPointCount;
  return {
    metric, count, validPointCount, excludedPointCount, validPointPercentage, excludedPointPercentage,
    mean, median, standardDeviation: Math.sqrt(variance), minimum: sorted[0] as number, maximum: sorted[sorted.length - 1] as number,
  };
}
