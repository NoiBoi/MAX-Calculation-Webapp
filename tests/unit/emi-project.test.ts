import { describe, expect, it } from "vitest";
import { addEmiReplicateGroup, calculateEmiElectricalRecord, createEmptyEmiProject, EMI_PROJECT_LEGACY_SCHEMA_VERSION, EMI_PROJECT_PREVIOUS_SCHEMA_VERSION, EMI_PROJECT_SCHEMA_VERSION, EmiProjectImportError, getAuthoritativeThicknessMicrometers, parseEmiProjectJson, resolveEmiThicknessConflict, serializeEmiProject, suggestEmiMetadata } from "../../lib/emi/project";

describe("versioned local EMI projects", () => {
  it("suggests but does not apply filename metadata", () => {
    expect(suggestEmiMetadata("25-4.3.csv")).toMatchObject({ sampleId: "25-4", group: "25-4", replicateNumber: 3 });
    expect(suggestEmiMetadata("(TiVNbMoTaW)4C3-050426.2.csv")).toMatchObject({ replicateNumber: 2, material: "(TiVNbMoTaW)4C3" });
  });

  it("round-trips a versioned project", () => {
    const project = createEmptyEmiProject("Publication set", "2026-07-23T00:00:00.000Z");
    expect(parseEmiProjectJson(serializeEmiProject(project))).toEqual(project);
    expect(project.schemaVersion).toBe(EMI_PROJECT_SCHEMA_VERSION);
  });

  it("opens a historical 1.0.0 project without fabricating electrical zero values", () => {
    const current = createEmptyEmiProject("Historical", "2026-07-23T00:00:00.000Z");
    const restored = parseEmiProjectJson(JSON.stringify({ ...current, schemaVersion: EMI_PROJECT_LEGACY_SCHEMA_VERSION }));
    expect(restored.schemaVersion).toBe(EMI_PROJECT_SCHEMA_VERSION);
    expect(restored.datasets).toEqual([]);
  });

  it("round-trips electrical inputs, factor, version, and derived snapshot", () => {
    const project = createEmptyEmiProject("Electrical");
    const dataset = { filename: "sample.csv", headers: [], metadata: { comments: [] }, parsingIssues: [], points: [] };
    const enriched = { ...project, datasets: [{ id: "a", originalFilename: "sample.csv", parsedDataset: dataset, sampleMetadata: { displayName: "Sample", thickness: 10, thicknessUnit: "um" as const }, importedAt: project.createdAt, parserVersion: "test", electricalProperties: calculateEmiElectricalRecord({ thicknessMicrometers: 10, rawResistanceReadingsOhm: [1, 2], measurementNote: "Ambient" }) }] };
    const restored = parseEmiProjectJson(serializeEmiProject(enriched));
    expect(restored.datasets[0]?.electricalProperties).toMatchObject({ rawResistanceReadingsOhm: [1, 2], correctionFactor: 4.532, measurementNote: "Ambient", derived: { meanRawResistanceOhm: 1.5 } });
    expect(restored.datasets[0]?.electricalProperties).not.toHaveProperty("thicknessMicrometers");
    expect(getAuthoritativeThicknessMicrometers(restored.datasets[0]!)).toBe(10);
  });

  it("migrates an electrical-only legacy thickness into authoritative sample metadata", () => {
    const project = createEmptyEmiProject("Legacy electrical");
    const dataset = { filename: "sample.csv", headers: [], metadata: { comments: [] }, parsingIssues: [], points: [] };
    const legacy = { ...project, schemaVersion: EMI_PROJECT_PREVIOUS_SCHEMA_VERSION, datasets: [{ id: "a", originalFilename: "sample.csv", parsedDataset: dataset, sampleMetadata: { displayName: "Sample" }, importedAt: project.createdAt, parserVersion: "test", electricalProperties: { thicknessMicrometers: 12, rawResistanceReadingsOhm: [1], correctionFactor: 4.532, calculationVersion: "legacy" } }] };
    const restored = parseEmiProjectJson(JSON.stringify(legacy));
    expect(restored.datasets[0]?.sampleMetadata).toMatchObject({ thickness: 12, thicknessUnit: "um" });
    expect(restored.datasets[0]?.thicknessConflict).toBeUndefined();
    expect(restored.datasets[0]?.electricalProperties?.derived).toBeDefined();
  });

  it("deduplicates equivalent legacy thickness values and pauses conflicting values until resolution", () => {
    const project = createEmptyEmiProject("Legacy conflict");
    const dataset = { filename: "sample.csv", headers: [], metadata: { comments: [] }, parsingIssues: [], points: [] };
    const make = (metadataThickness: number, legacyMicrometers: number) => ({ ...project, schemaVersion: EMI_PROJECT_PREVIOUS_SCHEMA_VERSION, datasets: [{ id: "a", originalFilename: "sample.csv", parsedDataset: dataset, sampleMetadata: { displayName: "Sample", thickness: metadataThickness, thicknessUnit: "mm" }, importedAt: project.createdAt, parserVersion: "test", electricalProperties: { thicknessMicrometers: legacyMicrometers, rawResistanceReadingsOhm: [1], correctionFactor: 4.532, calculationVersion: "legacy" } }] });
    const equivalent = parseEmiProjectJson(JSON.stringify(make(0.012, 12)));
    expect(equivalent.datasets[0]?.thicknessConflict).toBeUndefined();
    expect(getAuthoritativeThicknessMicrometers(equivalent.datasets[0]!)).toBe(12);
    const conflicting = parseEmiProjectJson(JSON.stringify(make(0.012, 15)));
    expect(conflicting.datasets[0]?.thicknessConflict).toMatchObject({ legacyElectricalThicknessMicrometers: 15 });
    expect(conflicting.datasets[0]?.electricalProperties?.derived).toBeUndefined();
    expect(getAuthoritativeThicknessMicrometers(conflicting.datasets[0]!)).toBeNull();
    const resolved = resolveEmiThicknessConflict(conflicting.datasets[0]!, "legacy-electrical");
    expect(resolved.sampleMetadata).toMatchObject({ thickness: 15, thicknessUnit: "um" });
    expect(resolved.electricalProperties?.derived).toBeDefined();
  });

  it("manually creates a replicate group without assigning unknown datasets", () => {
    const project = { ...createEmptyEmiProject(), datasets: [{ id: "known", originalFilename: "known.csv", parsedDataset: { filename: "known.csv", metadata: { comments: [] }, headers: [], points: [], parsingIssues: [] }, sampleMetadata: { displayName: "Known" }, importedAt: "2026-07-23T00:00:00.000Z", parserVersion: "test" }] };
    expect(addEmiReplicateGroup(project, "Batch A", ["known", "missing", "known"], "group-a").groups[0]).toEqual({ id: "group-a", name: "Batch A", datasetIds: ["known"] });
  });

  it("rejects malformed and unsupported project versions", () => {
    expect(() => parseEmiProjectJson("not-json")).toThrowError(EmiProjectImportError);
    expect(() => parseEmiProjectJson(JSON.stringify({ schemaVersion: "99.0.0" }))).toThrowError(/Unsupported EMI project schema/);
    expect(() => parseEmiProjectJson(JSON.stringify({ schemaVersion: EMI_PROJECT_SCHEMA_VERSION, recordType: "maxcalc-emi-project" }))).toThrowError(/missing required/);
    const project = createEmptyEmiProject("Malformed electrical");
    const dataset = { filename: "sample.csv", headers: [], metadata: { comments: [] }, parsingIssues: [], points: [] };
    const malformed = { ...project, datasets: [{ id: "a", originalFilename: "sample.csv", parsedDataset: dataset, sampleMetadata: { displayName: "Sample" }, importedAt: project.createdAt, parserVersion: "test", electricalProperties: { rawResistanceReadingsOhm: ["not numeric"], correctionFactor: 4.532, calculationVersion: "test" } }] };
    expect(() => parseEmiProjectJson(JSON.stringify(malformed))).toThrowError(/malformed electrical-property metadata/);
  });
});
