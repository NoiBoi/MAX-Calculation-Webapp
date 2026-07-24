import { describe, expect, it } from "vitest";
import { calculateEmiDataset, type EmiDataset, type EmiFrequencyPoint } from "@max-stoich/chemistry-engine";
import { createBandSummaryCsv, createEmiAnalysisManifest, createReplicatePointwiseCsv } from "../../lib/emi/replicate-exports";
import { createEmptyEmiProject, type EmiProjectRecord } from "../../lib/emi/project";

function dataset(filename: string, scale: number): EmiDataset {
  const point = (frequencyHz: number): EmiFrequencyPoint => ({ rowNumber: 1, frequencyHz, s11: { real: 0.1, imaginary: 0 }, s21: { real: scale, imaginary: 0 }, s22: { real: 0.1, imaginary: 0 }, s12: { real: scale, imaginary: 0 } });
  return { filename, headers: [], metadata: { comments: [] }, parsingIssues: [], points: [point(1e9), point(2e9)] };
}

describe("EMI replicate exports", () => {
  it("exports versioned pointwise, band, and manifest data", () => {
    const first = dataset("first.csv", 0.5); const second = dataset("second.csv", 0.4);
    const files = [{ id: "a", dataset: first, calculation: calculateEmiDataset(first), issues: [] }, { id: "b", dataset: second, calculation: calculateEmiDataset(second), issues: [] }];
    const base = createEmptyEmiProject("Export project", "2026-07-23T00:00:00.000Z");
    const project: EmiProjectRecord = { ...base, datasets: [{ id: "a", originalFilename: "first.csv", parsedDataset: first, sampleMetadata: { displayName: "A", thickness: 2, thicknessUnit: "mm" }, importedAt: base.createdAt, parserVersion: "test" }, { id: "b", originalFilename: "second.csv", parsedDataset: second, sampleMetadata: { displayName: "B" }, importedAt: base.createdAt, parserVersion: "test" }], groups: [{ id: "g", name: "Group A", datasetIds: ["a", "b"] }] };
    const pointwise = createReplicatePointwiseCsv(project, files, ["forward"], project.interpolation);
    expect(pointwise).toContain("Contributing replicate count");
    expect(pointwise).toContain("Group A,forward,1000000000,1,SET");
    const band = createBandSummaryCsv(project, files, ["forward"], { minimumHz: 1e9, maximumHz: 2e9 });
    expect(band).toContain("specimen-first-group");
    expect(band).toContain("SET per mm");
    const manifest = JSON.parse(createEmiAnalysisManifest(project));
    expect(manifest).toMatchObject({ manifestSchemaVersion: "1.0.0", aggregationSettings: { standardDeviation: "sample-n-minus-one" } });
  });
});
