import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { MaxStoichDatabase } from "../../lib/persistence/database";
import { XRDReferenceAnalysisRepository } from "../../lib/xrd/persistence";
import { defaultLatticeRefinementConfig, defaultReferenceMatchConfig, latticeRefinementResultSchema, matchingResultSchema } from "../../lib/xrd/stage4";

const sha = "a".repeat(64), now = "2026-09-25T00:00:00Z";
const provenance = { serviceVersion: "test", pythonVersion: "3", numpyVersion: "2", scipyVersion: "1", pybaselinesVersion: "1", lmfitVersion: "1" };
const reference = { sourceType: "user-cif" as const, sourceId: "synthetic", formula: "X", phaseName: null, spaceGroup: "P 1", crystalSystem: "cubic", publication: null, doi: null, referenceStatus: "theoretical" as const, retrievedAt: now, sourceRevision: "1", cifSha256: sha, sourceUrl: null };
const match = { matchId: "match-1", experimentalPeakId: "peak-1", referenceReflectionId: "reflection-0", experimentalTwoThetaDeg: 30.02, referenceTwoThetaDeg: 30, deltaTwoThetaDeg: .02, absoluteDeltaTwoThetaDeg: .02, experimentalFwhmDeg: .1, experimentalIntensity: 100, centerStderrDeg: .005, calculatedRelativeIntensity: 80, candidateHkls: [{ h: 1, k: 1, l: 1, multiplicity: 8 }], selectedHkl: { h: 1, k: 1, l: 1, multiplicity: 8 }, alternativeCandidates: [{ referenceReflectionId: "reflection-0", referenceTwoThetaDeg: 30, deltaTwoThetaDeg: .02, absoluteDeltaTwoThetaDeg: .02, calculatedRelativeIntensity: 80, hkls: [{ h: 1, k: 1, l: 1, multiplicity: 8 }] }], provenanceState: "AUTO_PROPOSED" as const, accepted: true, includeInRefinement: true, ambiguous: false, notes: [] };
const matching = matchingResultSchema.parse({ schemaVersion: "1.0.0", matchingResultId: "matching-1", parentPeakAnalysisId: "analysis-1", parentProcessedRepresentationId: "processed-1", parentMeasurementId: "measurement-1", selectedReference: reference, referenceCifSha256: sha, rawArtifactSha256: sha, wavelengthAngstrom: 1.5406, config: defaultReferenceMatchConfig, proposedMatches: [match], unmatchedExperimentalPeakIds: [], unmatchedReferenceReflectionIds: [], ambiguousMatchIds: [], warnings: [], scientificProvenance: provenance, createdAt: now });
const refinement = latticeRefinementResultSchema.parse({ schemaVersion: "1.0.0", refinementId: "refinement-1", parentMatchingResultId: "matching-1", parentPeakAnalysisId: "analysis-1", parentProcessedRepresentationId: "processed-1", parentMeasurementId: "measurement-1", rawArtifactSha256: sha, selectedReference: reference, referenceCifSha256: sha, wavelengthAngstrom: 1.5406, crystalSystem: "cubic", config: defaultLatticeRefinementConfig, referenceLattice: { aAngstrom: 4, bAngstrom: 4, cAngstrom: 4, alphaDeg: 90, betaDeg: 90, gammaDeg: 90 }, parameters: [{ name: "a", initialValue: 4, refinedValue: 4.01, standardError: .001, unit: "angstrom" }], zeroShiftDeg: null, zeroShiftStandardErrorDeg: null, includedMatchIds: ["match-1"], excludedMatchIds: [], residuals: [{ matchId: "match-1", experimentalPeakId: "peak-1", referenceReflectionId: "reflection-0", hkl: { h: 1, k: 1, l: 1, multiplicity: 8 }, experimentalTwoThetaDeg: 30.02, predictedTwoThetaDeg: 30.01, deltaTwoThetaDeg: .01, observedDAngstrom: 2.97, predictedDAngstrom: 2.98, included: true, centerStderrDeg: .005 }], diagnostics: { optimizerSuccess: true, optimizerMessage: "ok", rank: 1, parameterCount: 1, conditionNumber: 1, degreesOfFreedom: 2, rmsDeltaTwoThetaDeg: .01, meanDeltaTwoThetaDeg: .01, maximumAbsoluteDeltaTwoThetaDeg: .01, rmsDSpacingResidualAngstrom: .01, covariance: [[1e-6]], correlation: [[1]] }, warnings: [], scientificProvenance: provenance, createdAt: now });
const databases: MaxStoichDatabase[] = [];
afterEach(async () => { while (databases.length) { const db = databases.pop()!; db.close(); await db.delete(); } });

describe("Stage 4 contracts", () => {
  it("uses physical matching controls and disables intensity by default", () => { expect(defaultReferenceMatchConfig.maximumDeltaTwoThetaDeg).toBe(.15); expect(defaultReferenceMatchConfig.intensityUsage).toBe("disabled"); });
  it("retains signed and absolute positional residuals", () => { expect(matching.proposedMatches[0]?.deltaTwoThetaDeg).toBe(.02); expect(matching.proposedMatches[0]?.absoluteDeltaTwoThetaDeg).toBe(.02); });
  it("does not fabricate zero-shift or uncertainty", () => { expect(refinement.zeroShiftDeg).toBeNull(); expect(refinement.parameters[0]?.standardError).toBe(.001); });
});

describe("Stage 4 immutable persistence", () => {
  it("persists exact matching and refinement lineage and blocks parent deletion", async () => {
    const db = new MaxStoichDatabase(`xrd-stage4-${crypto.randomUUID()}`); databases.push(db); await db.open();
    await db.xrdPeakAnalyses.add({ id: "analysis-1", parentProcessedRepresentationId: "processed-1", parentMeasurementId: "measurement-1", rawArtifactSha256: sha, createdAt: now, analysis: {} as never });
    const repository = new XRDReferenceAnalysisRepository(db); await repository.saveMatching(matching); await repository.saveRefinement(refinement);
    expect((await repository.listMatching("analysis-1"))[0]?.result.referenceCifSha256).toBe(sha);
    expect((await repository.listRefinements("matching-1"))[0]?.result.parentPeakAnalysisId).toBe("analysis-1");
    await expect(repository.deleteMatching("matching-1")).rejects.toThrow(/refinements/);
  });
  it("rejects refinement lineage drift", async () => {
    const db = new MaxStoichDatabase(`xrd-stage4-${crypto.randomUUID()}`); databases.push(db); await db.open();
    await db.xrdPeakAnalyses.add({ id: "analysis-1", parentProcessedRepresentationId: "processed-1", parentMeasurementId: "measurement-1", rawArtifactSha256: sha, createdAt: now, analysis: {} as never });
    const repository = new XRDReferenceAnalysisRepository(db); await repository.saveMatching(matching);
    await expect(repository.saveRefinement({ ...refinement, rawArtifactSha256: "b".repeat(64) })).rejects.toThrow(/lineage/);
  });
});
