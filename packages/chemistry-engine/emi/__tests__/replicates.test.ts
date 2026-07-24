import { describe, expect, it } from "vitest";
import { calculateEmiPoint } from "../calculations";
import {
  calculatePointwiseReplicateStatistics,
  calculatePooledPointBandSummary,
  calculateSpecimenFirstBandSummary,
  classifyEmiFrequencyGrids,
  convertThicknessToMillimeters,
  interpolateEmiMetric,
  normalizeSetByThickness,
} from "../replicates";
import type { EmiDirectionalPointResult, EmiFrequencyPoint, EmiReplicateSeries } from "../types";

function result(frequencyHz: number, set: number | null): EmiDirectionalPointResult {
  const point: EmiFrequencyPoint = { rowNumber: 1, frequencyHz, s11: { real: 0.1, imaginary: 0 }, s21: { real: 0.5, imaginary: 0 }, s22: { real: 0.1, imaginary: 0 }, s12: { real: 0.5, imaginary: 0 } };
  return { ...calculateEmiPoint(point, "forward"), SET: set };
}
const series = (id: string, frequencies: readonly number[], values = frequencies): EmiReplicateSeries => ({ id, points: frequencies.map((frequency, index) => result(frequency, values[index] ?? null)) });

describe("EMI replicate analysis", () => {
  it("classifies exact, same-range, partial-overlap, and nonoverlap grids", () => {
    expect(classifyEmiFrequencyGrids([series("a", [1, 2, 3]), series("b", [1, 2, 3])])).toBe("exact-grid-match");
    expect(classifyEmiFrequencyGrids([series("a", [1, 2, 3]), series("b", [1, 1.5, 3])])).toBe("same-range-different-points");
    expect(classifyEmiFrequencyGrids([series("a", [1, 2, 3]), series("b", [2, 3, 4])])).toBe("partial-overlap");
    expect(classifyEmiFrequencyGrids([series("a", [1, 2]), series("b", [3, 4])])).toBe("nonoverlap");
  });

  it("keeps interpolation disabled by default and never extrapolates", () => {
    const inputs = [series("a", [1, 2, 3]), series("b", [1, 1.5, 3])];
    expect(calculatePointwiseReplicateStatistics(inputs)).toMatchObject({ compatibility: "same-range-different-points", interpolationApplied: false, statistics: [] });
    expect(interpolateEmiMetric(inputs[0]!, "SET", 0)).toBeNull();
    expect(interpolateEmiMetric(inputs[0]!, "SET", 4)).toBeNull();
  });

  it("preserves invalid interpolation regions", () => {
    const input = series("a", [1, 2, 3], [1, Number.NaN, 3]);
    expect(interpolateEmiMetric(input, "SET", 1.5)).toBeNull();
    expect(interpolateEmiMetric(input, "SET", 2.5)).toBeNull();
  });

  it("calculates pointwise median, sample deviation, confidence interval, and changing counts", () => {
    const inputs = [series("a", [1, 2], [1, 2]), series("b", [1, 2], [3, Number.NaN]), series("c", [1, 2], [5, 6])];
    const output = calculatePointwiseReplicateStatistics(inputs);
    const first = output.statistics.find((row) => row.frequencyHz === 1 && row.metric === "SET")!;
    expect(first).toMatchObject({ contributingReplicateCount: 3, mean: 3, median: 3, minimum: 1, maximum: 5 });
    expect(first.sampleStandardDeviation).toBe(2);
    expect(first.confidenceInterval95).not.toBeNull();
    const second = output.statistics.find((row) => row.frequencyHz === 2 && row.metric === "SET")!;
    expect(second).toMatchObject({ contributingReplicateCount: 2, mean: 4, median: 4 });
  });

  it("distinguishes specimen-first from pooled-point band summaries", () => {
    const inputs = [series("a", [1], [10]), series("b", [1, 2, 3], [0, 0, 0])];
    expect(calculateSpecimenFirstBandSummary(inputs, "SET")).toMatchObject({ approach: "specimen-first", mean: 5, specimenCount: 2, validSpecimenCount: 2 });
    expect(calculatePooledPointBandSummary(inputs, "SET")).toMatchObject({ approach: "pooled-point", mean: 2.5, validPointCount: 4 });
  });

  it("converts supported thickness units and rejects invalid thickness", () => {
    expect(convertThicknessToMillimeters(1, "m")).toBe(1000);
    expect(convertThicknessToMillimeters(1000, "um")).toBe(1);
    expect(convertThicknessToMillimeters(1, "in")).toBe(25.4);
    expect(normalizeSetByThickness(30, 2, "mm")).toBe(15);
    expect(normalizeSetByThickness(30, 0, "mm")).toBeNull();
    expect(normalizeSetByThickness(30, -1, "mm")).toBeNull();
  });
});
