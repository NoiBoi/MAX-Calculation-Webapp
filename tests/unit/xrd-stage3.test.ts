import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { MaxStoichDatabase } from "../../lib/persistence/database";
import { XRDAnalysisRepository, XRDMeasurementRepository } from "../../lib/xrd/persistence";
import type { ExperimentalXRDMeasurement, RawXRDArtifact } from "../../lib/xrd/schemas";
import { defaultProcessingConfig, peakAnalysisSchema, processedRepresentationSchema, processingConfigSchema, type ProcessedXRDRepresentation, type XRDPeakAnalysis } from "../../lib/xrd/stage3";

const databases: MaxStoichDatabase[] = [], sha = "c".repeat(64), artifactId = `xrd-artifact-sha256-${sha}`;
const raw: RawXRDArtifact = { schemaVersion: "1.0.0", artifactId, originalFilename: "x.xy", byteLength: 7, mimeType: "text/plain", sha256: sha, importedAt: "2026-09-25T00:00:00Z", sourceMetadata: null };
const measurement: ExperimentalXRDMeasurement = {
  schemaVersion: "1.0.0", measurementId: "m1", rawArtifactId: artifactId, rawArtifactSha256: sha, sourceFilename: "x.xy", importedAt: "2026-09-25T00:00:00Z", sampleName: null, maxcalcSampleId: null,
  acquisitionMetadata: { radiationSourceName: null, wavelengthAngstrom: null, instrumentManufacturer: null, instrumentModel: null, scanDate: null, operator: null, sampleName: null, notes: null },
  parserProvenance: { schemaVersion: "1.0.0", parserId: "maxcalc.generic-delimited-text", parserVersion: "1.0.0", detectedFormat: "text", detectionConfidence: "high", textEncoding: "utf-8", delimiter: "whitespace", decimalConvention: "period", headerRows: 0, commentPrefixes: [], twoThetaColumn: { index: 0, name: null }, intensityColumn: { index: 1, name: null }, userOverrides: {}, warnings: [], serviceVersion: "0.1.0" },
  twoThetaDeg: [10, 11], intensity: [1, 2], characterization: { pointCount: 2, minTwoThetaDeg: 10, maxTwoThetaDeg: 11, minIntensity: 1, maxIntensity: 2, allValuesFinite: true, ordering: "strictly-increasing", duplicateTwoThetaCount: 0, medianSpacingDeg: 1, spacingVariationDeg: 0, rejectedNumericalRowCount: 0 }, validationStatus: "valid", validationIssues: [],
};
const provenance = { serviceVersion: "0.1.0", pythonVersion: "3.12", numpyVersion: "2.5.3", scipyVersion: "1.18.1", pybaselinesVersion: "1.2.1", lmfitVersion: "1.3.4" };
const processed: ProcessedXRDRepresentation = {
  schemaVersion: "1.0.0", processedRepresentationId: "p1", parentMeasurementId: "m1", rawArtifactSha256: sha, createdAt: "2026-09-25T00:01:00Z", processingConfig: defaultProcessingConfig,
  twoThetaDeg: [10, 11], rawIntensity: [1, 2], estimatedBaseline: null, baselineCorrectedIntensity: null, smoothedIntensity: null, analysisIntensity: [1, 2], transformationOrder: ["raw"], warnings: [],
  diagnostics: { baselineAlgorithm: null, converged: null, iterationCount: null, finalTolerance: null }, scientificProvenance: provenance,
};
const analysis: XRDPeakAnalysis = {
  schemaVersion: "1.0.0", peakAnalysisId: "a1", revision: 1, parentProcessedRepresentationId: "p1", parentMeasurementId: "m1", rawArtifactSha256: sha, createdAt: "2026-09-25T00:02:00Z",
  detectionConfig: { schemaVersion: "1.0.0", minimumProminence: 1, minimumHeight: null, minimumDistanceDeg: null, minimumWidthDeg: null, maximumWidthDeg: null },
  fittingConfig: { schemaVersion: "1.0.0", localBackground: "linear", minimumWindowDeg: .4, maximumWindowDeg: 3, widthMultiplier: 4, maximumGroupPeaks: 3, centerBoundDeg: .3, minimumFwhmDeg: .01, maximumFwhmDeg: 2 },
  candidatePeaks: [], fittedPeaks: [], fitGroups: [], excludedCandidateIds: [], manualEdits: [], warnings: [], scientificProvenance: provenance,
};

function create() { const database = new MaxStoichDatabase(`xrd-stage3-${crypto.randomUUID()}`); databases.push(database); return { database, measurements: new XRDMeasurementRepository(database), analyses: new XRDAnalysisRepository(database) }; }
afterEach(async () => { while (databases.length) { const database = databases.pop()!; database.close(); await database.delete(); } });

describe("Stage 3 contracts", () => {
  it("defaults both scientific transformations to off", () => { expect(defaultProcessingConfig.baseline.enabled).toBe(false); expect(defaultProcessingConfig.smoothing.enabled).toBe(false); });
  it("rejects even Savitzky-Golay windows", () => { expect(processingConfigSchema.safeParse({ ...defaultProcessingConfig, smoothing: { ...defaultProcessingConfig.smoothing, enabled: true, windowLength: 10 } }).success).toBe(false); });
  it("rejects processed array drift", () => { expect(processedRepresentationSchema.safeParse({ ...processed, analysisIntensity: [1] }).success).toBe(false); });
  it("requires complete fit diagnostics and lineage", () => { expect(peakAnalysisSchema.parse(analysis).parentProcessedRepresentationId).toBe("p1"); });
});

describe("Stage 3 immutable persistence", () => {
  it("persists exact measurement-processing-analysis lineage", async () => {
    const { analyses, measurements } = create(); await measurements.save(raw, new Blob(["1234567"]), measurement); await analyses.saveProcessed(processed); await analyses.saveAnalysis(analysis);
    expect((await analyses.listProcessed("m1"))[0]?.representation.analysisIntensity).toEqual([1, 2]);
    expect((await analyses.listAnalyses("p1"))[0]?.analysis.rawArtifactSha256).toBe(sha);
  });
  it("blocks measurement deletion while processing descendants exist", async () => {
    const { analyses, measurements } = create(); await measurements.save(raw, new Blob(["1234567"]), measurement); await analyses.saveProcessed(processed);
    await expect(measurements.delete("m1")).rejects.toThrow(/processing runs/);
  });
  it("blocks processing deletion while analysis descendants exist", async () => {
    const { analyses, measurements } = create(); await measurements.save(raw, new Blob(["1234567"]), measurement); await analyses.saveProcessed(processed); await analyses.saveAnalysis(analysis);
    await expect(analyses.deleteProcessed("p1")).rejects.toThrow(/peak analyses/);
    await analyses.deleteAnalysis("a1"); await analyses.deleteProcessed("p1"); expect(await analyses.listProcessed("m1")).toHaveLength(0);
  });
  it("rejects lineage with a mismatched parent hash", async () => {
    const { analyses, measurements } = create(); await measurements.save(raw, new Blob(["1234567"]), measurement);
    await expect(analyses.saveProcessed({ ...processed, rawArtifactSha256: "d".repeat(64) })).rejects.toThrow(/provenance/);
  });
});
