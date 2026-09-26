import { z } from "zod";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const provenanceSchema = z.object({
  serviceVersion: z.string(), pythonVersion: z.string(), numpyVersion: z.string(), scipyVersion: z.string(),
  pybaselinesVersion: z.string(), lmfitVersion: z.string(),
});

export const baselineConfigSchema = z.object({
  enabled: z.boolean(), algorithm: z.enum(["arpls", "asls"]), lam: z.number().positive().max(1e15),
  p: z.number().positive().lt(1), diffOrder: z.number().int().min(1).max(3), maxIter: z.number().int().positive().max(10_000), tol: z.number().positive().max(1),
});
export const smoothingConfigSchema = z.object({
  enabled: z.boolean(), method: z.literal("savitzky-golay"), windowLength: z.number().int().min(3).max(100_001), polynomialOrder: z.number().int().min(0).max(20),
}).superRefine((value, context) => {
  if (value.windowLength % 2 === 0) context.addIssue({ code: "custom", message: "Smoothing window length must be odd." });
  if (value.polynomialOrder >= value.windowLength) context.addIssue({ code: "custom", message: "Polynomial order must be less than window length." });
});
export const processingConfigSchema = z.object({ schemaVersion: z.literal("1.0.0"), baseline: baselineConfigSchema, smoothing: smoothingConfigSchema });
export type XRDProcessingConfig = z.infer<typeof processingConfigSchema>;

export const defaultProcessingConfig: XRDProcessingConfig = {
  schemaVersion: "1.0.0",
  baseline: { enabled: false, algorithm: "arpls", lam: 1_000_000, p: 0.01, diffOrder: 2, maxIter: 50, tol: 0.001 },
  smoothing: { enabled: false, method: "savitzky-golay", windowLength: 11, polynomialOrder: 3 },
};

export const processRequestSchema = z.object({
  parentMeasurementId: z.string().min(1), rawArtifactSha256: sha256,
  twoThetaDeg: z.array(z.number().finite()).min(2), intensity: z.array(z.number().finite()).min(2), processingConfig: processingConfigSchema,
}).refine((value) => value.twoThetaDeg.length === value.intensity.length, "Processing arrays must have equal lengths.");

export const processedRepresentationSchema = z.object({
  schemaVersion: z.literal("1.0.0"), processedRepresentationId: z.string(), parentMeasurementId: z.string(), rawArtifactSha256: sha256,
  createdAt: z.string(), processingConfig: processingConfigSchema, twoThetaDeg: z.array(z.number()), rawIntensity: z.array(z.number()),
  estimatedBaseline: z.array(z.number()).nullable(), baselineCorrectedIntensity: z.array(z.number()).nullable(), smoothedIntensity: z.array(z.number()).nullable(),
  analysisIntensity: z.array(z.number()), transformationOrder: z.array(z.enum(["raw", "baseline-subtraction", "savitzky-golay"])), warnings: z.array(z.string()),
  diagnostics: z.object({ baselineAlgorithm: z.string().nullable(), converged: z.boolean().nullable(), iterationCount: z.number().int().nonnegative().nullable(), finalTolerance: z.number().nullable() }),
  scientificProvenance: provenanceSchema,
}).superRefine((value, context) => {
  const length = value.twoThetaDeg.length;
  for (const [name, array] of [["rawIntensity", value.rawIntensity], ["analysisIntensity", value.analysisIntensity]] as const) if (array.length !== length) context.addIssue({ code: "custom", message: `${name} length must match twoThetaDeg.` });
});
export type ProcessedXRDRepresentation = z.infer<typeof processedRepresentationSchema>;

export const peakDetectionConfigSchema = z.object({
  schemaVersion: z.literal("1.0.0"), minimumProminence: z.number().positive(), minimumHeight: z.number().nullable(),
  minimumDistanceDeg: z.number().positive().max(180).nullable(), minimumWidthDeg: z.number().positive().max(180).nullable(), maximumWidthDeg: z.number().positive().max(180).nullable(),
}).refine((value) => value.minimumWidthDeg === null || value.maximumWidthDeg === null || value.minimumWidthDeg <= value.maximumWidthDeg, "Minimum width must not exceed maximum width.");
export type XRDPeakDetectionConfig = z.infer<typeof peakDetectionConfigSchema>;

export const peakCandidateSchema = z.object({
  candidateId: z.string(), approximateTwoThetaDeg: z.number(), approximateIntensity: z.number(), prominence: z.number().nonnegative(), estimatedWidthDeg: z.number().nonnegative().nullable(),
  sourceIndex: z.number().int().nonnegative(), detectionConfigId: z.string(), status: z.enum(["AUTO", "MANUAL_ADDED", "MANUAL_EDITED", "EXCLUDED"]),
  manualWindowMinDeg: z.number().nullable(), manualWindowMaxDeg: z.number().nullable(),
});
export type XRDPeakCandidate = z.infer<typeof peakCandidateSchema>;

export const detectionRequestSchema = z.object({
  processedRepresentationId: z.string(), twoThetaDeg: z.array(z.number()).min(3), analysisIntensity: z.array(z.number()).min(3), detectionConfig: peakDetectionConfigSchema,
}).refine((value) => value.twoThetaDeg.length === value.analysisIntensity.length, "Detection arrays must have equal lengths.");
export const peakDetectionResultSchema = z.object({
  schemaVersion: z.literal("1.0.0"), processedRepresentationId: z.string(), detectionConfig: peakDetectionConfigSchema, detectionConfigId: z.string(),
  candidates: z.array(peakCandidateSchema), warnings: z.array(z.string()), scientificProvenance: provenanceSchema,
});
export type XRDPeakDetectionResult = z.infer<typeof peakDetectionResultSchema>;

export const fittingConfigSchema = z.object({
  schemaVersion: z.literal("1.0.0"), localBackground: z.enum(["constant", "linear"]), minimumWindowDeg: z.number().positive(), maximumWindowDeg: z.number().positive(),
  widthMultiplier: z.number().min(1).max(20), maximumGroupPeaks: z.number().int().min(1).max(8), centerBoundDeg: z.number().positive(), minimumFwhmDeg: z.number().positive(), maximumFwhmDeg: z.number().positive(),
});
export type XRDPeakFittingConfig = z.infer<typeof fittingConfigSchema>;
export const defaultFittingConfig: XRDPeakFittingConfig = {
  schemaVersion: "1.0.0", localBackground: "linear", minimumWindowDeg: 0.4, maximumWindowDeg: 3, widthMultiplier: 4,
  maximumGroupPeaks: 3, centerBoundDeg: 0.3, minimumFwhmDeg: 0.01, maximumFwhmDeg: 2,
};
const fitDiagnosticsSchema = z.object({
  success: z.boolean(), message: z.string(), method: z.string().nullable(), evaluations: z.number().int().nullable(), chiSquare: z.number().nullable(), reducedChiSquare: z.number().nullable(),
  akaikeInformationCriterion: z.number().nullable(), bayesianInformationCriterion: z.number().nullable(), rSquared: z.number().nullable(),
});
const fittedPeakSchema = z.object({
  peakId: z.string(), candidateId: z.string(), fittedCenterTwoThetaDeg: z.number().nullable(), centerStderrDeg: z.number().nullable(), amplitude: z.number().nullable(), amplitudeStderr: z.number().nullable(),
  height: z.number().nullable(), fwhmDeg: z.number().nullable(), fwhmStderrDeg: z.number().nullable(), fraction: z.number().nullable(), fitWindowMinDeg: z.number(), fitWindowMaxDeg: z.number(),
  pointCount: z.number().int().nonnegative(), source: z.enum(["AUTO", "MANUAL_ADDED", "MANUAL_EDITED"]), included: z.boolean(), groupId: z.string(), diagnostics: fitDiagnosticsSchema,
});
const fitGroupSchema = z.object({
  groupId: z.string(), candidateIds: z.array(z.string()), twoThetaDeg: z.array(z.number()), observedIntensity: z.array(z.number()), bestFit: z.array(z.number()).nullable(),
  localBackground: z.array(z.number()).nullable(), componentCurves: z.record(z.string(), z.array(z.number())), residual: z.array(z.number()).nullable(), diagnostics: fitDiagnosticsSchema,
});
export const fitRequestSchema = z.object({
  parentProcessedRepresentationId: z.string(), parentMeasurementId: z.string(), rawArtifactSha256: sha256,
  twoThetaDeg: z.array(z.number()).min(3), analysisIntensity: z.array(z.number()).min(3), detectionConfig: peakDetectionConfigSchema,
  fittingConfig: fittingConfigSchema, candidates: z.array(peakCandidateSchema), manualEdits: z.array(z.string()),
});
export const peakAnalysisSchema = z.object({
  schemaVersion: z.literal("1.0.0"), peakAnalysisId: z.string(), revision: z.number().int().positive(), parentProcessedRepresentationId: z.string(), parentMeasurementId: z.string(), rawArtifactSha256: sha256,
  createdAt: z.string(), detectionConfig: peakDetectionConfigSchema, fittingConfig: fittingConfigSchema, candidatePeaks: z.array(peakCandidateSchema), fittedPeaks: z.array(fittedPeakSchema),
  fitGroups: z.array(fitGroupSchema), excludedCandidateIds: z.array(z.string()), manualEdits: z.array(z.string()), warnings: z.array(z.string()), scientificProvenance: provenanceSchema,
});
export type XRDPeakAnalysis = z.infer<typeof peakAnalysisSchema>;
