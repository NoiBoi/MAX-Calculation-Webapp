import { z } from "zod";
import { latticeSchema, calculatedPatternSchema } from "./schemas";
import { peakAnalysisSchema } from "./stage3";
import { xrdReferenceIdentitySchema } from "./references";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const hklSchema = z.object({ h: z.number().int(), k: z.number().int(), l: z.number().int(), multiplicity: z.number().int().positive().nullable() });
const referenceSchema = calculatedPatternSchema.shape.reference;
const provenanceSchema = peakAnalysisSchema.shape.scientificProvenance;

export const referenceMatchConfigSchema = z.object({
  schemaVersion: z.literal("1.0.0"), maximumDeltaTwoThetaDeg: z.number().positive().max(5),
  ignoreExcludedStage3Peaks: z.boolean(), intensityUsage: z.enum(["disabled", "tie-breaker"]),
  intensityTieBreakWeight: z.number().min(0).max(.01), ambiguityThresholdDeg: z.number().min(0).max(1),
  wavelengthBehavior: z.literal("require-compatible"),
});
export type XRDReferenceMatchConfig = z.infer<typeof referenceMatchConfigSchema>;
export const defaultReferenceMatchConfig: XRDReferenceMatchConfig = { schemaVersion: "1.0.0", maximumDeltaTwoThetaDeg: .15, ignoreExcludedStage3Peaks: true, intensityUsage: "disabled", intensityTieBreakWeight: .001, ambiguityThresholdDeg: .03, wavelengthBehavior: "require-compatible" };

const matchCandidateSchema = z.object({ referenceReflectionId: z.string(), referenceTwoThetaDeg: z.number(), deltaTwoThetaDeg: z.number(), absoluteDeltaTwoThetaDeg: z.number().nonnegative(), calculatedRelativeIntensity: z.number(), hkls: z.array(hklSchema).min(1) });
export const peakMatchSchema = z.object({
  matchId: z.string(), experimentalPeakId: z.string(), referenceReflectionId: z.string(), experimentalTwoThetaDeg: z.number(), referenceTwoThetaDeg: z.number(),
  deltaTwoThetaDeg: z.number(), absoluteDeltaTwoThetaDeg: z.number().nonnegative(), experimentalFwhmDeg: z.number().nullable(), experimentalIntensity: z.number().nullable(), centerStderrDeg: z.number().nullable(),
  calculatedRelativeIntensity: z.number(), candidateHkls: z.array(hklSchema).min(1), selectedHkl: hklSchema.nullable(), alternativeCandidates: z.array(matchCandidateSchema),
  provenanceState: z.enum(["AUTO_PROPOSED", "AUTO_ACCEPTED", "MANUAL_ASSIGNED", "MANUAL_CHANGED", "REJECTED"]), accepted: z.boolean(), includeInRefinement: z.boolean(), ambiguous: z.boolean(), notes: z.array(z.string()),
});
export type XRDPeakMatch = z.infer<typeof peakMatchSchema>;

export const matchingRequestSchema = z.object({ peakAnalysis: peakAnalysisSchema, referencePattern: calculatedPatternSchema, experimentalWavelengthAngstrom: z.number().positive().max(10), config: referenceMatchConfigSchema });
export const matchingResultSchema = z.object({
  schemaVersion: z.literal("1.0.0"), matchingResultId: z.string(), parentPeakAnalysisId: z.string(), parentProcessedRepresentationId: z.string(), parentMeasurementId: z.string(), selectedReference: referenceSchema,
  referenceCifSha256: sha256, rawArtifactSha256: sha256, wavelengthAngstrom: z.number().positive(), config: referenceMatchConfigSchema, proposedMatches: z.array(peakMatchSchema),
  unmatchedExperimentalPeakIds: z.array(z.string()), unmatchedReferenceReflectionIds: z.array(z.string()), ambiguousMatchIds: z.array(z.string()), warnings: z.array(z.string()), scientificProvenance: provenanceSchema, createdAt: z.string(),
  libraryReference: xrdReferenceIdentitySchema.nullable().optional(),
});
export type XRDReferenceMatchingResult = z.infer<typeof matchingResultSchema>;

export const latticeRefinementConfigSchema = z.object({ schemaVersion: z.literal("1.0.0"), residualSpace: z.literal("two-theta"), weighting: z.literal("unweighted"), refineZeroShift: z.boolean(), maximumAbsoluteZeroShiftDeg: z.number().positive().max(1) });
export type XRDLatticeRefinementConfig = z.infer<typeof latticeRefinementConfigSchema>;
export const defaultLatticeRefinementConfig: XRDLatticeRefinementConfig = { schemaVersion: "1.0.0", residualSpace: "two-theta", weighting: "unweighted", refineZeroShift: false, maximumAbsoluteZeroShiftDeg: .2 };
export const latticeRefinementRequestSchema = z.object({ matchingResult: matchingResultSchema, referenceLattice: latticeSchema, crystalSystem: z.string(), config: latticeRefinementConfigSchema });
const refinedParameterSchema = z.object({ name: z.string(), initialValue: z.number(), refinedValue: z.number(), standardError: z.number().nullable(), unit: z.string() });
const residualSchema = z.object({ matchId: z.string(), experimentalPeakId: z.string(), referenceReflectionId: z.string(), hkl: hklSchema, experimentalTwoThetaDeg: z.number(), predictedTwoThetaDeg: z.number(), deltaTwoThetaDeg: z.number(), observedDAngstrom: z.number().positive(), predictedDAngstrom: z.number().positive(), included: z.boolean(), centerStderrDeg: z.number().nullable() });
export const latticeRefinementResultSchema = z.object({
  schemaVersion: z.literal("1.0.0"), refinementId: z.string(), parentMatchingResultId: z.string(), parentPeakAnalysisId: z.string(), parentProcessedRepresentationId: z.string(), parentMeasurementId: z.string(), rawArtifactSha256: sha256,
  selectedReference: referenceSchema, referenceCifSha256: sha256, wavelengthAngstrom: z.number().positive(), crystalSystem: z.enum(["cubic", "tetragonal", "hexagonal", "orthorhombic"]), config: latticeRefinementConfigSchema,
  referenceLattice: latticeSchema, parameters: z.array(refinedParameterSchema), zeroShiftDeg: z.number().nullable(), zeroShiftStandardErrorDeg: z.number().nullable(), includedMatchIds: z.array(z.string()), excludedMatchIds: z.array(z.string()), residuals: z.array(residualSchema),
  diagnostics: z.object({ optimizerSuccess: z.boolean(), optimizerMessage: z.string(), rank: z.number().int().nonnegative(), parameterCount: z.number().int().positive(), conditionNumber: z.number().nullable(), degreesOfFreedom: z.number().int().nullable(), rmsDeltaTwoThetaDeg: z.number().nonnegative(), meanDeltaTwoThetaDeg: z.number(), maximumAbsoluteDeltaTwoThetaDeg: z.number().nonnegative(), rmsDSpacingResidualAngstrom: z.number().nonnegative(), covariance: z.array(z.array(z.number())).nullable(), correlation: z.array(z.array(z.number())).nullable() }),
  warnings: z.array(z.string()), scientificProvenance: provenanceSchema, createdAt: z.string(),
  libraryReference: xrdReferenceIdentitySchema.nullable().optional(),
});
export type XRDLatticeRefinementResult = z.infer<typeof latticeRefinementResultSchema>;
