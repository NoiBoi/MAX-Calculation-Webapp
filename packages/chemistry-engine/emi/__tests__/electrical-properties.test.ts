import { describe, expect, it } from "vitest";
import { calculateElectricalProperty, calculateElectricalPropertySummary, calculateEmiDataset, calculateSimonEstimate, calculateSimonSeries, FOUR_POINT_PROBE_CORRECTION_FACTOR, type EmiDataset } from "../index";

describe("four-point-probe electrical properties", () => {
  it("reproduces the authoritative 1 ohm, 10 micrometer reference case", () => {
    const result = calculateElectricalProperty({ rawResistanceOhm: 1, thicknessMicrometers: 10 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.correctionFactor).toBe(FOUR_POINT_PROBE_CORRECTION_FACTOR);
    expect(result.value.sheetResistanceOhmPerSquare).toBeCloseTo(4.532, 14);
    expect(result.value.conductivitySiemensPerMeter).toBeCloseTo(22065.31332744925, 10);
    expect(result.value.conductivitySiemensPerCentimeter).toBeCloseTo(220.6531332744925, 11);
    expect(result.value.resistivityOhmMeter).toBeCloseTo(0.00004532, 14);
    expect(result.value.resistivityOhmCentimeter).toBeCloseTo(0.004532, 14);
  });

  it("reproduces the 0.0143 mm and 1.2 ohm UI regression case after canonical conversion", () => {
    const result = calculateElectricalProperty({ rawResistanceOhm: 1.2, thicknessMicrometers: 14.3 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sheetResistanceOhmPerSquare).toBeCloseTo(5.4384, 14);
    expect(result.value.conductivitySiemensPerMeter).toBeCloseTo(12858.57420014525, 9);
    expect(result.value.conductivitySiemensPerCentimeter).toBeCloseTo(128.5857420014525, 10);
  });

  it("aggregates arithmetic mean raw resistance rather than averaging conductivity", () => {
    const result = calculateElectricalPropertySummary({ rawResistanceReadingsOhm: [1, 2, 3], thicknessMicrometers: 10 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.meanRawResistanceOhm).toBe(2);
    expect(result.value.aggregate.conductivitySiemensPerMeter).toBeCloseTo(11032.656663724625, 10);
    const meanIndividualConductivity = result.value.individualReadings.reduce((sum, row) => sum + row.conductivitySiemensPerMeter, 0) / 3;
    expect(result.value.aggregate.conductivitySiemensPerMeter).not.toBeCloseTo(meanIndividualConductivity, 8);
  });

  it.each([
    [{ rawResistanceOhm: 0, thicknessMicrometers: 10 }, "INVALID_RESISTANCE"],
    [{ rawResistanceOhm: -1, thicknessMicrometers: 10 }, "INVALID_RESISTANCE"],
    [{ rawResistanceOhm: Number.NaN, thicknessMicrometers: 10 }, "INVALID_RESISTANCE"],
    [{ rawResistanceOhm: Number.POSITIVE_INFINITY, thicknessMicrometers: 10 }, "INVALID_RESISTANCE"],
    [{ rawResistanceOhm: 1, thicknessMicrometers: 0 }, "INVALID_THICKNESS"],
    [{ rawResistanceOhm: 1, thicknessMicrometers: -1 }, "INVALID_THICKNESS"],
    [{ rawResistanceOhm: 1, thicknessMicrometers: undefined }, "MISSING_THICKNESS"],
    [{ rawResistanceOhm: undefined, thicknessMicrometers: 10 }, "MISSING_RESISTANCE"],
  ] as const)("rejects invalid inputs without nonfinite output", (input, code) => {
    const result = calculateElectricalProperty(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.code)).toContain(code);
  });

  it("supports extreme positive finite inputs without changing the equation", () => {
    const smallResistance = calculateElectricalProperty({ rawResistanceOhm: 1e-12, thicknessMicrometers: 0.001 });
    const largeResistance = calculateElectricalProperty({ rawResistanceOhm: 1e12, thicknessMicrometers: 10 });
    expect(smallResistance.ok && Number.isFinite(smallResistance.value.conductivitySiemensPerMeter)).toBe(true);
    expect(largeResistance.ok && largeResistance.value.conductivitySiemensPerMeter).toBeGreaterThan(0);
  });

  it("returns a structured error when positive finite inputs overflow the result", () => {
    const result = calculateElectricalProperty({ rawResistanceOhm: Number.MIN_VALUE, thicknessMicrometers: Number.MIN_VALUE });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]?.code).toBe("NONFINITE_RESULT");
  });

  it("reports empty and partially entered reading arrays", () => {
    const empty = calculateElectricalPropertySummary({ rawResistanceReadingsOhm: [], thicknessMicrometers: 10 });
    const partial = calculateElectricalPropertySummary({ rawResistanceReadingsOhm: [1, null], thicknessMicrometers: 10 });
    expect(!empty.ok && empty.errors[0]?.code).toBe("EMPTY_RESISTANCE_READINGS");
    expect(!partial.ok && partial.errors.some((error) => error.code === "MISSING_RESISTANCE" && error.readingIndex === 1)).toBe(true);
  });
});

describe("Simon theoretical EMI estimate", () => {
  it("reproduces the 10 GHz reference case and separated terms", () => {
    const result = calculateSimonEstimate({ conductivitySiemensPerCentimeter: 220.6531332744925, frequencyMegahertz: 10000, thicknessCentimeters: 0.001 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.reflectionTermDb).toBeCloseTo(33.4371009880864, 12);
    expect(result.value.absorptionTermDb).toBeCloseTo(2.5252476218448026, 12);
    expect(result.value.totalShieldingEffectivenessDb).toBeCloseTo(35.962348609931205, 12);
  });

  it("converts canonical Hz to MHz once and preserves exact measured ordering", () => {
    const frequencies = [10e9, 8e9, 12e9];
    const series = calculateSimonSeries({ frequencyPointsHz: frequencies, conductivitySiemensPerCentimeter: 220.6531332744925, thicknessMicrometers: 10 });
    expect(series?.map((point) => point.frequencyHz)).toEqual(frequencies);
    expect(series?.map((point) => point.frequencyGHz)).toEqual([10, 8, 12]);
    expect(series?.[0]?.theoreticalSetDb).toBeCloseTo(35.962348609931205, 12);
  });

  it("returns no series when electrical inputs or a frequency are invalid", () => {
    expect(calculateSimonSeries({ frequencyPointsHz: [1e9], conductivitySiemensPerCentimeter: null, thicknessMicrometers: 10 })).toBeNull();
    expect(calculateSimonSeries({ frequencyPointsHz: [0], conductivitySiemensPerCentimeter: 10, thicknessMicrometers: 10 })).toBeNull();
  });

  it("does not alter measured EMI calculations when electrical metadata exist separately", () => {
    const dataset: EmiDataset = { filename: "regression.csv", headers: [], metadata: { comments: [] }, parsingIssues: [], points: [{ rowNumber: 1, frequencyHz: 10e9, s11: { real: 0.1, imaginary: 0.2 }, s21: { real: 0.3, imaginary: 0.1 }, s22: { real: 0.2, imaginary: 0.1 }, s12: { real: 0.25, imaginary: 0.05 } }] };
    const before = calculateEmiDataset(dataset);
    calculateElectricalPropertySummary({ rawResistanceReadingsOhm: [1, 2], thicknessMicrometers: 10 });
    const after = calculateEmiDataset(dataset);
    expect(after).toEqual(before);
  });
});
