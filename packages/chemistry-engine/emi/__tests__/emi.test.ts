import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { calculateEmiDataset, calculateEmiPoint } from "../calculations";
import { parseKeysightCsv } from "../parser";
import { calculateEmiStatistics } from "../statistics";
import type { EmiDataset, EmiDirectionalPointResult, EmiFrequencyPoint } from "../types";
import { validateEmiDataset } from "../validation";

const fixturePath = fileURLToPath(new URL("fixtures/keysight-three-point.csv", import.meta.url));

function point(overrides: Partial<EmiFrequencyPoint> = {}): EmiFrequencyPoint {
  return {
    rowNumber: 1,
    frequencyHz: 1e9,
    s11: { real: 0.3, imaginary: 0.4 },
    s21: { real: 0.5, imaginary: 0 },
    s22: { real: 0, imaginary: 0 },
    s12: { real: 0.25, imaginary: 0 },
    ...overrides,
  };
}

function dataset(points: readonly EmiFrequencyPoint[]): EmiDataset {
  return { filename: "synthetic.csv", metadata: { comments: [] }, headers: [], points, parsingIssues: [] };
}

describe("Keysight CSV parsing", () => {
  it("parses the actual supplied metadata, markers, headers, and Hz frequencies", () => {
    const result = parseKeysightCsv(readFileSync(fixturePath, "utf8"), "keysight-three-point.csv");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dataset.filename).toBe("keysight-three-point.csv");
    expect(result.dataset.metadata).toMatchObject({
      csvVersion: "A.01.01",
      date: "Wednesday, July 22, 2026 12:12:22",
      source: "Standard",
      channel: "CH1_DATA",
      instrument: { manufacturer: "Keysight Technologies", model: "N5247B", serialNumber: "US56070639", firmwareVersion: "A.17.30.08" },
    });
    expect(result.dataset.points).toHaveLength(3);
    expect(result.dataset.points[0]?.frequencyHz).toBe(26_500_000_000);
    expect(result.dataset.points[0]?.s21.real).toBe(-0.0047917925);
  });

  it("matches normalized headers in any order and parses scientific notation", () => {
    const csv = `BEGIN CH1_DATA\nS12(IMAG), S22(REAL),Freq(Hz),S11(IMAG),S21(REAL),S12(REAL),S21(IMAG),S22(IMAG),S11(REAL)\n8e-1,7e-1,1.25e9,2e-1,3e-1,9e-1,4e-1,6e-1,1e-1\nEND`;
    const result = parseKeysightCsv(csv, "reordered.csv");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dataset.points[0]).toMatchObject({
      frequencyHz: 1.25e9,
      s11: { real: 0.1, imaginary: 0.2 },
      s21: { real: 0.3, imaginary: 0.4 },
      s22: { real: 0.7, imaginary: 0.6 },
      s12: { real: 0.9, imaginary: 0.8 },
    });
  });

  it("returns structured missing-column and malformed-row errors", () => {
    const missing = parseKeysightCsv("BEGIN CH1_DATA\nFreq(Hz),S11(REAL)\n1,0\nEND", "missing.csv");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.issues.some((issue) => issue.code === "MISSING_REQUIRED_COLUMN")).toBe(true);

    const malformed = parseKeysightCsv(`BEGIN CH1_DATA\nFreq(Hz),S11(REAL),S11(IMAG),S21(REAL),S21(IMAG),S22(REAL),S22(IMAG),S12(REAL),S12(IMAG)\n1,0,0,nope,0,0,0,0,0\n2,0,0,0.1,0,0,0,0.1,0\nEND`, "malformed.csv");
    expect(malformed.ok).toBe(true);
    if (!malformed.ok) return;
    expect(malformed.dataset.points).toHaveLength(1);
    expect(malformed.dataset.parsingIssues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "UNPARSEABLE_NUMERIC_VALUE", rowNumber: 3 })]));
  });

  it("rejects a marked section with no parseable data rows", () => {
    const csv = `BEGIN CH1_DATA\nFreq(Hz),S11(REAL),S11(IMAG),S21(REAL),S21(IMAG),S22(REAL),S22(IMAG),S12(REAL),S12(IMAG)\nEND`;
    const result = parseKeysightCsv(csv, "empty.csv");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "MISSING_DATA_ROWS" })]));
  });
});

describe("directional EMI calculations", () => {
  it("calculates complex powers and known SET, SER, and SEA values", () => {
    const result = calculateEmiPoint(point(), "forward");
    expect(result.R).toBeCloseTo(0.25, 14);
    expect(result.T).toBeCloseTo(0.25, 14);
    expect(result.A).toBeCloseTo(0.5, 14);
    expect(result.SET).toBeCloseTo(6.020599913279624, 12);
    expect(result.SER).toBeCloseTo(1.2493873660829993, 12);
    expect(result.SEA).toBeCloseTo(4.771212547196624, 12);
    expect(result.decompositionResidual).toBeCloseTo(0, 14);
  });

  it("maps S11/S21 forward and S22/S12 reverse", () => {
    const input = point();
    const forward = calculateEmiPoint(input, "forward");
    const reverse = calculateEmiPoint(input, "reverse");
    expect(forward).toMatchObject({ reflectionParameter: "s11", transmissionParameter: "s21", R: 0.25, T: 0.25 });
    expect(reverse).toMatchObject({ reflectionParameter: "s22", transmissionParameter: "s12", R: 0, T: 0.0625 });
  });

  it("returns explicit null metrics for zero transmission and R greater than or equal to one", () => {
    const zeroTransmission = calculateEmiPoint(point({ s21: { real: 0, imaginary: 0 } }), "forward");
    expect(zeroTransmission).toMatchObject({ T: 0, SET: null, SEA: null });
    expect(zeroTransmission.SER).not.toBeNull();

    const unitReflection = calculateEmiPoint(point({ s11: { real: 1, imaginary: 0 } }), "forward");
    expect(unitReflection).toMatchObject({ R: 1, SER: null, SEA: null });
    expect(unitReflection.SET).not.toBeNull();
  });

  it("does not apply the legacy workbook absolute value to negative SET", () => {
    const result = calculateEmiPoint(point({ s21: { real: 2, imaginary: 0 } }), "forward");
    expect(result.SET).toBeCloseTo(-6.020599913279624, 12);
  });

  it("reproduces selected rows from the supplied legacy EMI master workbook", () => {
    const workbookRows = [
      { frequencyHz: 8_200_000_000, s11: { real: 0.7711524, imaginary: -0.6057178 }, s21: { real: 0.001332628, imaginary: 0.00005099915 }, expected: [57.499465456808416, 14.153304886752423, 43.346160570055986] },
      { frequencyHz: 9_565_000_000, s11: { real: 0.981225, imaginary: -0.0691562 }, s21: { real: -0.0007397259, imaginary: -0.001307696 }, expected: [56.46417791795422, 14.89255054251072, 41.5716273754435] },
      { frequencyHz: 10_909_000_000, s11: { real: -0.5629267, imaginary: 0.7958458 }, s21: { real: -0.0003447341, imaginary: -0.001491884 }, expected: [56.29938747015572, 13.032680866623544, 43.266706603532185] },
      { frequencyHz: 12_253_000_000, s11: { real: 0.4246059, imaginary: -0.8815706 }, s21: { real: 0.001015514, imaginary: -0.001290391 }, expected: [55.69219286643873, 13.711707969764158, 41.980484896674575] },
    ] as const;
    for (const row of workbookRows) {
      const result = calculateEmiPoint(point({ frequencyHz: row.frequencyHz, s11: row.s11, s21: row.s21 }), "forward");
      expect(result.SET).toBeCloseTo(row.expected[0], 10);
      expect(result.SER).toBeCloseTo(row.expected[1], 10);
      expect(result.SEA).toBeCloseTo(row.expected[2], 10);
    }
  });
});

describe("validation and statistics", () => {
  it("reports passivity, undefined metrics, ordering, reciprocity, and directional warnings", () => {
    const points = [
      point({ rowNumber: 1, frequencyHz: 2, s11: { real: 1.1, imaginary: 0 }, s21: { real: 1.1, imaginary: 0 }, s12: { real: 0, imaginary: 0 } }),
      point({ rowNumber: 2, frequencyHz: 2 }),
      point({ rowNumber: 3, frequencyHz: 1 }),
    ];
    const input = dataset(points);
    const calculation = calculateEmiDataset(input);
    const issues = validateEmiDataset(input, calculation, { reciprocityComplexTolerance: 0.01, directionalDifferenceToleranceDb: 0.1 });
    for (const code of ["DUPLICATE_FREQUENCY", "NONMONOTONIC_FREQUENCY", "REFLECTION_GREATER_THAN_ONE", "TRANSMISSION_GREATER_THAN_ONE", "POWER_SUM_GREATER_THAN_ONE", "NEGATIVE_ABSORPTION", "UNDEFINED_SER", "UNDEFINED_SEA", "S21_S12_DIFFERENCE", "FORWARD_REVERSE_DIFFERENCE"] as const) {
      expect(issues.some((issue) => issue.code === code)).toBe(true);
    }
  });

  it("reports nonfinite measurement values without replacing them", () => {
    const input = dataset([point({ s22: { real: Number.POSITIVE_INFINITY, imaginary: 0 } })]);
    const calculation = calculateEmiDataset(input);
    expect(calculation.reverse[0]?.R).toBe(Number.POSITIVE_INFINITY);
    expect(validateEmiDataset(input, calculation)).toEqual(expect.arrayContaining([expect.objectContaining({ code: "NONFINITE_VALUE" })]));
  });

  it("computes range-filtered statistics and excludes only invalid metric values", () => {
    const results: EmiDirectionalPointResult[] = [
      { ...calculateEmiPoint(point({ frequencyHz: 1 }), "forward"), SET: 1 },
      { ...calculateEmiPoint(point({ frequencyHz: 2 }), "forward"), SET: null },
      { ...calculateEmiPoint(point({ frequencyHz: 3 }), "forward"), SET: 3 },
      { ...calculateEmiPoint(point({ frequencyHz: 4 }), "forward"), SET: 100 },
    ];
    const stats = calculateEmiStatistics(results, "SET", { minimumHz: 1, maximumHz: 3 });
    expect(stats).toMatchObject({ count: 3, validPointCount: 2, excludedPointCount: 1, mean: 2, median: 2, minimum: 1, maximum: 3 });
    expect(stats.validPointPercentage).toBeCloseTo(200 / 3, 12);
    expect(stats.standardDeviation).toBe(1);
    for (const metric of ["SER", "SEA", "R", "T", "A"] as const) {
      expect(calculateEmiStatistics(results, metric, { minimumHz: 1, maximumHz: 3 })).toMatchObject({ metric, count: 3, validPointCount: 3, excludedPointCount: 0 });
    }
  });
});
