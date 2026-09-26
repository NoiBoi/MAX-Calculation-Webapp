import { describe, expect, it } from "vitest";
import { calculatedPatternSchema, codSearchRequestSchema, codSearchResponseSchema, experimentalXrdParseResponseSchema } from "../../lib/xrd/schemas";

const result = {
  sourceType: "cod", sourceId: "7221324", formula: "Ti3AlC2", phaseName: "Ti3 Al C2", spaceGroup: "P 63/m m c",
  lattice: { aAngstrom: 3.072, bAngstrom: 3.072, cAngstrom: 18.73, alphaDeg: 90, betaDeg: 90, gammaDeg: 120 },
  publication: null, doi: null, referenceStatus: "experimental", sourceRevision: "176429",
} as const;

describe("XRD API contracts", () => {
  it("validates normalized COD search data", () => {
    expect(codSearchResponseSchema.parse({ schemaVersion: "1.0.0", results: [result] }).results[0]?.sourceId).toBe("7221324");
  });

  it("rejects unbounded or empty searches", () => {
    expect(codSearchRequestSchema.safeParse({}).success).toBe(false);
    expect(codSearchRequestSchema.safeParse({ formula: "Ti3AlC2", limit: 500 }).success).toBe(false);
  });

  it("preserves grouped hkl contributions", () => {
    const pattern = calculatedPatternSchema.parse({
      schemaVersion: "1.0.0",
      reference: { ...result, crystalSystem: "hexagonal", retrievedAt: "2026-09-25T00:00:00Z", cifSha256: "a".repeat(64), sourceUrl: "https://www.crystallography.net/cod/7221324.cif@176429" },
      radiation: { kind: "preset", label: "Cu Kα", wavelengthAngstrom: 1.54184 },
      twoThetaRange: { minDeg: 10, maxDeg: 90 }, lattice: result.lattice, crystalSystem: "hexagonal", spaceGroup: "P6_3/mmc",
      reflections: [{ twoThetaDeg: 39.1, relativeIntensity: 100, dAngstrom: 2.3, hkls: [{ h: 1, k: 0, l: 4, multiplicity: 12 }, { h: 0, k: 1, l: 4, multiplicity: 12 }] }],
      calculationProvenance: { engine: "pymatgen.XRDCalculator", engineVersion: "2026.9.24", serviceVersion: "0.1.0", calculatedAt: "2026-09-25T00:00:01Z", inputCifSha256: "a".repeat(64) },
    });
    expect(pattern.reflections[0]?.hkls).toHaveLength(2);
  });
});

describe("experimental XRD contracts", () => {
  it("validates explicit-unit arrays and linked raw provenance", () => {
    const sha = "b".repeat(64), artifactId = `xrd-artifact-sha256-${sha}`;
    const parsed = experimentalXrdParseResponseSchema.parse({
      schemaVersion: "1.0.0", rawArtifact: { schemaVersion: "1.0.0", artifactId, originalFilename: "sample.xy", byteLength: 12, mimeType: "text/plain", sha256: sha, importedAt: "2026-09-25T00:00:00Z", sourceMetadata: null },
      measurement: { schemaVersion: "1.0.0", measurementId: "m1", rawArtifactId: artifactId, rawArtifactSha256: sha, sourceFilename: "sample.xy", importedAt: "2026-09-25T00:00:00Z", sampleName: null, maxcalcSampleId: null,
        acquisitionMetadata: { radiationSourceName: null, wavelengthAngstrom: null, instrumentManufacturer: null, instrumentModel: null, scanDate: null, operator: null, sampleName: null, notes: null },
        parserProvenance: { schemaVersion: "1.0.0", parserId: "maxcalc.generic-delimited-text", parserVersion: "1.0.0", detectedFormat: "whitespace-delimited text", detectionConfidence: "high", textEncoding: "utf-8", delimiter: "whitespace", decimalConvention: "period", headerRows: 0, commentPrefixes: ["#"], twoThetaColumn: { index: 0, name: null }, intensityColumn: { index: 1, name: null }, userOverrides: {}, warnings: [], serviceVersion: "0.1.0" },
        twoThetaDeg: [10, 11], intensity: [100, 200], characterization: { pointCount: 2, minTwoThetaDeg: 10, maxTwoThetaDeg: 11, minIntensity: 100, maxIntensity: 200, allValuesFinite: true, ordering: "strictly-increasing", duplicateTwoThetaCount: 0, medianSpacingDeg: 1, spacingVariationDeg: 0, rejectedNumericalRowCount: 0 }, validationStatus: "valid", validationIssues: [] }, availableColumns: [{ index: 0, name: null }, { index: 1, name: null }],
    });
    expect(parsed.measurement.intensity).toEqual([100, 200]);
  });

  it("rejects mismatched raw hashes and array lengths", () => {
    const base = { schemaVersion: "1.0.0", rawArtifact: { schemaVersion: "1.0.0", artifactId: "a", originalFilename: "x", byteLength: 1, mimeType: null, sha256: "a".repeat(64), importedAt: "now", sourceMetadata: null }, availableColumns: [] };
    expect(experimentalXrdParseResponseSchema.safeParse({ ...base, measurement: { rawArtifactId: "b" } }).success).toBe(false);
  });
});
