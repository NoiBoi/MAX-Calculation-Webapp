import { z } from "zod";

const publicationSchema = z.object({
  title: z.string().nullable(), authors: z.string().nullable(), journal: z.string().nullable(),
  year: z.number().int().nullable(), volume: z.string().nullable(), pages: z.string().nullable(),
});

export const latticeSchema = z.object({
  aAngstrom: z.number().positive(), bAngstrom: z.number().positive(), cAngstrom: z.number().positive(),
  alphaDeg: z.number().positive(), betaDeg: z.number().positive(), gammaDeg: z.number().positive(),
});

export const codSearchResultSchema = z.object({
  sourceType: z.literal("cod"), sourceId: z.string().regex(/^\d{7}$/), formula: z.string(),
  phaseName: z.string().nullable(), spaceGroup: z.string().nullable(), lattice: latticeSchema.nullable(),
  publication: publicationSchema.nullable(), doi: z.string().nullable(),
  referenceStatus: z.enum(["theoretical", "experimental", "unknown"]), sourceRevision: z.string().nullable(),
});

export const codSearchResponseSchema = z.object({
  schemaVersion: z.literal("1.0.0"), results: z.array(codSearchResultSchema),
});

const referenceSchema = z.object({
  sourceType: z.enum(["cod", "lmsl-cif", "lmsl-empirical", "user-cif"]), sourceId: z.string(),
  formula: z.string(), phaseName: z.string().nullable(), spaceGroup: z.string().nullable(), crystalSystem: z.string().nullable(),
  publication: publicationSchema.nullable(), doi: z.string().nullable(),
  referenceStatus: z.enum(["theoretical", "experimental", "unknown"]), retrievedAt: z.string(),
  sourceRevision: z.string().nullable(), cifSha256: z.string().regex(/^[a-f0-9]{64}$/), sourceUrl: z.string().nullable(),
});

export const calculatedPatternSchema = z.object({
  schemaVersion: z.literal("1.0.0"), reference: referenceSchema,
  radiation: z.object({ kind: z.enum(["preset", "explicit"]), label: z.string(), wavelengthAngstrom: z.number().positive() }),
  twoThetaRange: z.object({ minDeg: z.number(), maxDeg: z.number() }), lattice: latticeSchema,
  crystalSystem: z.string(), spaceGroup: z.string(),
  reflections: z.array(z.object({
    twoThetaDeg: z.number(), relativeIntensity: z.number(), dAngstrom: z.number().positive(),
    hkls: z.array(z.object({ h: z.number().int(), k: z.number().int(), l: z.number().int(), multiplicity: z.number().int().nullable() })),
  })),
  calculationProvenance: z.object({
    engine: z.literal("pymatgen.XRDCalculator"), engineVersion: z.string(), serviceVersion: z.string(),
    calculatedAt: z.string(), inputCifSha256: z.string(),
  }),
  cifContent: z.string().min(20).max(5_000_000).optional(),
});

export const codSearchRequestSchema = z.object({
  formula: z.string().trim().min(1).max(120).optional(), requiredElements: z.array(z.string().regex(/^[A-Z][a-z]?$/)).max(8).optional(),
  codId: z.string().regex(/^\d{7}$/).optional(), spaceGroup: z.string().trim().min(1).max(80).optional(),
  text: z.string().trim().min(1).max(160).optional(), statusFilter: z.enum(["any", "experimental", "theoretical"]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
}).refine((value) => value.formula || value.requiredElements?.length || value.codId || value.text, "A search term is required.");

export const patternSettingsSchema = z.object({
  radiation: z.union([
    z.object({ preset: z.enum(["CuKa", "CuKa1"]) }),
    z.object({ wavelengthAngstrom: z.number().positive().max(10) }),
  ]),
  twoThetaRange: z.object({ minDeg: z.number().min(0).max(179), maxDeg: z.number().positive().max(180) })
    .refine((value) => value.minDeg < value.maxDeg, "Minimum 2θ must be less than maximum 2θ."),
  sourceRevision: z.string().regex(/^\d+$/).optional(),
});

export const directCifRequestSchema = patternSettingsSchema.omit({ sourceRevision: true }).extend({
  cifContent: z.string().min(20).max(5_000_000),
  metadata: z.object({
    sourceType: z.enum(["lmsl-cif", "user-cif"]), sourceId: z.string().min(1).max(200),
    phaseName: z.string().max(200).optional(), doi: z.string().max(300).optional(), sourceRevision: z.string().max(100).optional(),
  }),
});

export type CODSearchResult = z.infer<typeof codSearchResultSchema>;
export type CalculatedXRDPattern = z.infer<typeof calculatedPatternSchema>;

const xrdColumnSchema = z.object({ index: z.number().int().nonnegative(), name: z.string().nullable() });
const rejectedRowSchema = z.object({ lineNumber: z.number().int().positive(), reason: z.string(), excerpt: z.string() });

export const experimentalXrdParseResponseSchema = z.object({
  schemaVersion: z.literal("1.0.0"),
  rawArtifact: z.object({
    schemaVersion: z.literal("1.0.0"), artifactId: z.string(), originalFilename: z.string(), byteLength: z.number().int().nonnegative(),
    mimeType: z.string().nullable(), sha256: z.string().regex(/^[a-f0-9]{64}$/), importedAt: z.string(), sourceMetadata: z.record(z.string(), z.string()).nullable(),
  }),
  measurement: z.object({
    schemaVersion: z.literal("1.0.0"), measurementId: z.string(), rawArtifactId: z.string(), rawArtifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sourceFilename: z.string(), importedAt: z.string(), sampleName: z.string().nullable(), maxcalcSampleId: z.string().nullable(),
    acquisitionMetadata: z.object({
      radiationSourceName: z.string().nullable(), wavelengthAngstrom: z.number().positive().nullable(), instrumentManufacturer: z.string().nullable(),
      instrumentModel: z.string().nullable(), scanDate: z.string().nullable(), operator: z.string().nullable(), sampleName: z.string().nullable(), notes: z.string().nullable(),
    }),
    parserProvenance: z.object({
      schemaVersion: z.literal("1.0.0"), parserId: z.literal("maxcalc.generic-delimited-text"), parserVersion: z.literal("1.0.0"),
      detectedFormat: z.string(), detectionConfidence: z.enum(["high", "medium", "low"]), textEncoding: z.string(),
      delimiter: z.enum(["comma", "tab", "semicolon", "whitespace"]), decimalConvention: z.enum(["period", "comma"]), headerRows: z.number().int().nonnegative(),
      commentPrefixes: z.array(z.string()), twoThetaColumn: xrdColumnSchema, intensityColumn: xrdColumnSchema,
      userOverrides: z.record(z.string(), z.unknown()), warnings: z.array(z.string()), serviceVersion: z.string(),
    }),
    twoThetaDeg: z.array(z.number()).min(2), intensity: z.array(z.number()).min(2),
    characterization: z.object({
      pointCount: z.number().int().nonnegative(), minTwoThetaDeg: z.number(), maxTwoThetaDeg: z.number(), minIntensity: z.number(), maxIntensity: z.number(),
      allValuesFinite: z.boolean(), ordering: z.enum(["strictly-increasing", "decreasing", "non-monotonic", "constant"]), duplicateTwoThetaCount: z.number().int().nonnegative(),
      medianSpacingDeg: z.number().nullable(), spacingVariationDeg: z.number().nullable(), rejectedNumericalRowCount: z.number().int().nonnegative(),
    }),
    validationStatus: z.enum(["valid", "warning"]),
    validationIssues: z.array(z.object({ code: z.string(), severity: z.enum(["warning", "error"]), message: z.string(), blocking: z.boolean(), representativeRows: z.array(rejectedRowSchema) })),
  }).superRefine((value, context) => {
    if (value.twoThetaDeg.length !== value.intensity.length || value.twoThetaDeg.length !== value.characterization.pointCount) context.addIssue({ code: "custom", message: "Experimental XRD arrays and point count must agree." });
  }),
  availableColumns: z.array(xrdColumnSchema),
}).superRefine((value, context) => {
  if (value.rawArtifact.artifactId !== value.measurement.rawArtifactId || value.rawArtifact.sha256 !== value.measurement.rawArtifactSha256) context.addIssue({ code: "custom", message: "Raw artifact provenance does not match the measurement." });
});

export const xrdParserOverrideSchema = z.object({
  delimiter: z.enum(["comma", "tab", "semicolon", "whitespace"]).optional(), headerRows: z.number().int().nonnegative().max(100_000).optional(),
  twoThetaColumn: z.number().int().nonnegative().max(999).optional(), intensityColumn: z.number().int().nonnegative().max(999).optional(),
  decimalConvention: z.enum(["period", "comma"]).optional(),
});

export type ExperimentalXRDParseResponse = z.infer<typeof experimentalXrdParseResponseSchema>;
export type ExperimentalXRDMeasurement = ExperimentalXRDParseResponse["measurement"];
export type RawXRDArtifact = ExperimentalXRDParseResponse["rawArtifact"];
export type XRDParserOverride = z.infer<typeof xrdParserOverrideSchema>;
