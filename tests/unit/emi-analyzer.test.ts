import { describe, expect, it } from "vitest";
import {
  calculateEmiDataset,
  type EmiDataset,
  type EmiValidationIssue,
} from "@max-stoich/chemistry-engine";
import {
  aggregateEmiIssues,
  createMetricSegments,
  createProcessedEmiCsv,
  createSummaryStatisticsCsv,
  type EmiAnalysisFile,
} from "../../lib/emi/analyzer";

function fixture(): EmiAnalysisFile {
  const dataset: EmiDataset = {
    filename: "sample, one.csv",
    headers: [],
    metadata: { comments: [] },
    parsingIssues: [],
    points: [
      { rowNumber: 3, frequencyHz: 1e9, s11: { real: 0.1, imaginary: 0 }, s21: { real: 0.5, imaginary: 0 }, s22: { real: 0.2, imaginary: 0 }, s12: { real: 0.4, imaginary: 0 } },
      { rowNumber: 4, frequencyHz: 2e9, s11: { real: 0.2, imaginary: 0 }, s21: { real: 0, imaginary: 0 }, s22: { real: 0.3, imaginary: 0 }, s12: { real: 0.3, imaginary: 0 } },
      { rowNumber: 5, frequencyHz: 3e9, s11: { real: 0.3, imaginary: 0 }, s21: { real: 0.25, imaginary: 0 }, s22: { real: 0.4, imaginary: 0 }, s12: { real: 0.2, imaginary: 0 } },
    ],
  };
  const calculation = calculateEmiDataset(dataset);
  const issues: EmiValidationIssue[] = [{ severity: "warning", code: "UNDEFINED_SET", message: "Undefined at zero transmission.", filename: dataset.filename, frequencyHz: 2e9, direction: "forward" }];
  return { id: "sample", dataset, calculation, issues };
}

describe("EMI analyzer presentation helpers", () => {
  it("preserves invalid metric values as separate plot segments", () => {
    const file = fixture();
    const segments = createMetricSegments(file.calculation.forward, "SET");
    expect(segments).toHaveLength(2);
    expect(segments.map((segment) => segment.map((point) => point.frequencyHz))).toEqual([[1e9], [3e9]]);
  });

  it("applies the frequency range to summary statistics without changing source rows", () => {
    const file = fixture();
    const csv = createSummaryStatisticsCsv([file], ["forward", "reverse"], { minimumHz: 1e9, maximumHz: 2e9 });
    expect(csv).toContain("sample, one.csv");
    expect(csv).toContain("forward,SET,1000000000,2000000000,2,1,1,50");
    expect(csv).toContain("reverse,SET,1000000000,2000000000,2,2,0,100");
    expect(file.dataset.points).toHaveLength(3);
  });

  it("exports raw directional values, calculations, validity, and codes", () => {
    const csv = createProcessedEmiCsv([fixture()], ["forward", "reverse"]);
    expect(csv.split("\r\n")[0]).toContain("Reflection real");
    expect(csv).toContain('"sample, one.csv",forward,1000000000,1,0.1,0,0.5,0');
    expect(csv).toContain('"sample, one.csv",forward,2000000000,2,0.2,0,0,0');
    expect(csv).toContain("warning,UNDEFINED_SET");
    expect(csv).toContain('"sample, one.csv",reverse');
  });

  it("aggregates warning counts, frequency ranges, and maximum violations", () => {
    const issues: EmiValidationIssue[] = [
      { severity: "warning", code: "POWER_SUM_GREATER_THAN_ONE", filename: "x.csv", message: "x", frequencyHz: 2, direction: "forward", values: { R: 0.8, T: 0.4 } },
      { severity: "warning", code: "POWER_SUM_GREATER_THAN_ONE", filename: "x.csv", message: "x", frequencyHz: 4, direction: "forward", values: { R: 0.9, T: 0.6 } },
    ];
    expect(aggregateEmiIssues(issues)[0]).toMatchObject({ count: 2, minimumFrequencyHz: 2, maximumFrequencyHz: 4, maximumViolation: 0.5 });
  });
});
