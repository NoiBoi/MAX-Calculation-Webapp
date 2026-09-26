import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import Dexie from "dexie";
import { MaxStoichDatabase } from "../../lib/persistence/database";
import { XRDMeasurementRepository } from "../../lib/xrd/persistence";
import type { ExperimentalXRDMeasurement, RawXRDArtifact } from "../../lib/xrd/schemas";

const databases: MaxStoichDatabase[] = [];

function fixture(id: string, sha = "a".repeat(64)): { raw: RawXRDArtifact; measurement: ExperimentalXRDMeasurement } {
  const artifactId = `xrd-artifact-sha256-${sha}`;
  const raw: RawXRDArtifact = { schemaVersion: "1.0.0", artifactId, originalFilename: "sample.xy", byteLength: 7, mimeType: "text/plain", sha256: sha, importedAt: "2026-09-25T00:00:00Z", sourceMetadata: null };
  const measurement: ExperimentalXRDMeasurement = {
    schemaVersion: "1.0.0", measurementId: id, rawArtifactId: artifactId, rawArtifactSha256: sha, sourceFilename: "sample.xy", importedAt: "2026-09-25T00:00:00Z", sampleName: null, maxcalcSampleId: null,
    acquisitionMetadata: { radiationSourceName: null, wavelengthAngstrom: null, instrumentManufacturer: null, instrumentModel: null, scanDate: null, operator: null, sampleName: null, notes: null },
    parserProvenance: { schemaVersion: "1.0.0", parserId: "maxcalc.generic-delimited-text", parserVersion: "1.0.0", detectedFormat: "whitespace-delimited text", detectionConfidence: "high", textEncoding: "utf-8", delimiter: "whitespace", decimalConvention: "period", headerRows: 0, commentPrefixes: ["#"], twoThetaColumn: { index: 0, name: null }, intensityColumn: { index: 1, name: null }, userOverrides: {}, warnings: [], serviceVersion: "0.1.0" },
    twoThetaDeg: [10, 11], intensity: [100, 200], characterization: { pointCount: 2, minTwoThetaDeg: 10, maxTwoThetaDeg: 11, minIntensity: 100, maxIntensity: 200, allValuesFinite: true, ordering: "strictly-increasing", duplicateTwoThetaCount: 0, medianSpacingDeg: 1, spacingVariationDeg: 0, rejectedNumericalRowCount: 0 }, validationStatus: "valid", validationIssues: [],
  };
  return { raw, measurement };
}

function createRepository() {
  const database = new MaxStoichDatabase(`xrd-persistence-${crypto.randomUUID()}`); databases.push(database);
  return { database, repository: new XRDMeasurementRepository(database) };
}

afterEach(async () => { while (databases.length) { const database = databases.pop()!; database.close(); await database.delete(); } });

describe("local experimental XRD persistence", () => {
  it("saves and reloads exact raw bytes with a parsed measurement", async () => {
    const { database, repository: first } = createRepository(), { raw, measurement } = fixture("m1");
    await first.save(raw, new Blob(["10 100\n"]), measurement, "Sample A"); database.close();
    const reopened = new MaxStoichDatabase(database.name); databases.push(reopened);
    const second = new XRDMeasurementRepository(reopened), stored = await second.get("m1");
    expect(stored?.displayName).toBe("Sample A");
    expect(stored?.measurement.twoThetaDeg).toEqual([10, 11]);
    expect((await reopened.xrdRawArtifacts.get(raw.artifactId))?.rawBytes.size).toBe(7);
  });

  it("detects duplicate bytes while allowing multiple immutable interpretations", async () => {
    const { database, repository } = createRepository(), first = fixture("m1"), second = fixture("m2");
    second.measurement.parserProvenance.userOverrides = { twoThetaColumn: 1, intensityColumn: 0 };
    await repository.save(first.raw, new Blob(["10 100\n"]), first.measurement);
    await repository.save(second.raw, new Blob(["10 100\n"]), second.measurement);
    expect(await repository.findByRawHash(first.raw.sha256)).toHaveLength(2);
    expect(await database.xrdRawArtifacts.count()).toBe(1);
  });

  it("deletes a shared raw artifact only after its final measurement", async () => {
    const { database, repository } = createRepository(), first = fixture("m1"), second = fixture("m2");
    await repository.save(first.raw, new Blob(["10 100\n"]), first.measurement);
    await repository.save(second.raw, new Blob(["10 100\n"]), second.measurement);
    await repository.delete("m1"); expect(await database.xrdRawArtifacts.count()).toBe(1);
    await repository.delete("m2"); expect(await database.xrdRawArtifacts.count()).toBe(0);
  });

  it("uses IndexedDB schema version 16 with complete XRD lineage and reference stores", async () => {
    const { database } = createRepository(); await database.open();
    expect(database.verno).toBe(16);
    expect(database.tables.map((table) => table.name)).toEqual(expect.arrayContaining(["xrdRawArtifacts", "xrdMeasurements", "xrdProcessedRepresentations", "xrdPeakAnalyses", "xrdReferenceMatchingResults", "xrdLatticeRefinementResults", "xrdReferences", "xrdReferenceRevisions"]));
  });

  it("migrates schema 15 records without rewriting existing XRD data", async () => {
    const name = `xrd-v15-migration-${crypto.randomUUID()}`, legacy = new Dexie(name);
    legacy.version(15).stores({ migrations: "&id", xrdRawArtifacts: "&artifactId,&sha256,importedAt", xrdMeasurements: "&id,rawArtifactId,rawArtifactSha256,importedAt,displayName" });
    const { measurement } = fixture("legacy-measurement");
    await legacy.table("xrdMeasurements").add({ id: measurement.measurementId, rawArtifactId: measurement.rawArtifactId, rawArtifactSha256: measurement.rawArtifactSha256, importedAt: measurement.importedAt, displayName: "Legacy sample", measurement });
    legacy.close();
    const upgraded = new MaxStoichDatabase(name); databases.push(upgraded); await upgraded.open();
    expect((await upgraded.xrdMeasurements.get("legacy-measurement"))?.displayName).toBe("Legacy sample");
    expect((await upgraded.migrations.get("15-to-16-versioned-xrd-reference-library"))?.status).toBe("complete");
    expect(await upgraded.xrdReferences.count()).toBe(0);
  });
});
