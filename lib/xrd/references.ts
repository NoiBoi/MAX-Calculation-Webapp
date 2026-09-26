import { z } from "zod";
import type { MaxStoichDatabase } from "@/lib/persistence/database";
import { calculatedPatternSchema, latticeSchema, type CalculatedXRDPattern } from "./schemas";

export const xrdReferenceSourceTypeSchema = z.enum(["COD", "LMSL_CIF", "USER_CIF", "LMSL_EMPIRICAL", "USER_EMPIRICAL"]);
export const xrdReferenceValidationStatusSchema = z.enum(["UNREVIEWED", "REVIEWED", "VALIDATED", "DEPRECATED"]);
export const xrdReferenceIdentitySchema = z.object({
  referenceId: z.string().min(1), revisionId: z.string().min(1), revisionNumber: z.number().int().positive(),
});

const structurePayloadSchema = z.object({
  kind: z.literal("STRUCTURE"), cifText: z.string().min(20).max(5_000_000), cifSha256: z.string().regex(/^[a-f0-9]{64}$/),
  codId: z.string().regex(/^\d{7}$/).nullable(), codRevision: z.string().nullable(), retrievedAt: z.string(), sourceUrl: z.string().nullable(),
  lattice: latticeSchema, spaceGroup: z.string(), crystalSystem: z.string(), theoreticalPattern: calculatedPatternSchema,
  theoreticalPatternSha256: z.string().regex(/^[a-f0-9]{64}$/),
});

const empiricalPayloadSchema = z.object({
  kind: z.literal("EMPIRICAL"), sourceMeasurementId: z.string().min(1), rawArtifactSha256: z.string().regex(/^[a-f0-9]{64}$/),
  originalFilename: z.string(), sampleId: z.string().nullable(), batchId: z.string().nullable(), recipeId: z.string().nullable(),
  acquisitionMetadata: z.record(z.string(), z.unknown()), wavelengthAngstrom: z.number().positive().max(10),
  selectedProcessedRepresentationId: z.string().nullable(), selectedPeakAnalysisId: z.string().nullable(), curatedPeakSetSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  associatedStructure: xrdReferenceIdentitySchema.nullable(),
});

export const xrdReferenceRevisionSchema = z.object({
  schemaVersion: z.literal("1.0.0"), revisionId: z.string().min(1), referenceId: z.string().min(1), revisionNumber: z.number().int().positive(),
  createdAt: z.string(), changeKind: z.enum(["CREATED", "METADATA", "SCIENTIFIC", "VALIDATION"]), changeSummary: z.string().min(1).max(500),
  displayName: z.string().min(1).max(200), phaseName: z.string().nullable(), formula: z.string().min(1).max(200), sourceType: xrdReferenceSourceTypeSchema,
  validationStatus: xrdReferenceValidationStatusSchema, validationChangedAt: z.string(), notes: z.string().max(4000), tags: z.array(z.string().min(1).max(80)).max(40),
  cifSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(), rawArtifactSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  doi: z.string().nullable(), publication: z.record(z.string(), z.unknown()).nullable(), payload: z.discriminatedUnion("kind", [structurePayloadSchema, empiricalPayloadSchema]),
});
export type XRDReferenceRevision = z.infer<typeof xrdReferenceRevisionSchema>;

export const xrdReferenceSchema = z.object({
  schemaVersion: z.literal("1.0.0"), referenceId: z.string().min(1), displayName: z.string().min(1), phaseName: z.string().nullable(), formula: z.string().min(1),
  sourceType: xrdReferenceSourceTypeSchema, validationStatus: xrdReferenceValidationStatusSchema, tags: z.array(z.string()), createdAt: z.string(), updatedAt: z.string(),
  currentRevisionId: z.string().min(1), currentRevisionNumber: z.number().int().positive(), crystalSystem: z.string().nullable(), archived: z.boolean(),
});
export type XRDReference = z.infer<typeof xrdReferenceSchema>;
const xrdReferenceBundleSchema = z.object({ schemaVersion: z.literal("1.0.0"), recordType: z.literal("maxcalc-xrd-reference-bundle"), reference: xrdReferenceSchema, revision: xrdReferenceRevisionSchema });

export interface CreateStructureReferenceInput {
  readonly pattern: CalculatedXRDPattern; readonly cifText: string; readonly displayName?: string; readonly notes?: string;
  readonly tags?: readonly string[]; readonly sourceType?: "COD" | "LMSL_CIF" | "USER_CIF";
}

export interface CreateEmpiricalReferenceInput {
  readonly measurementId: string; readonly processedRepresentationId?: string; readonly peakAnalysisId?: string;
  readonly displayName: string; readonly phaseName?: string; readonly formula: string; readonly wavelengthAngstrom: number;
  readonly sampleId?: string; readonly batchId?: string; readonly recipeId?: string; readonly notes?: string; readonly tags?: readonly string[];
  readonly sourceType?: "LMSL_EMPIRICAL" | "USER_EMPIRICAL"; readonly associatedStructure?: z.infer<typeof xrdReferenceIdentitySchema>;
}

function cleanTags(tags: readonly string[] = []): string[] { return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].slice(0, 40); }
function id(prefix: string): string { return `${prefix}-${crypto.randomUUID()}`; }
async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((item) => item.toString(16).padStart(2, "0")).join("");
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

export class XRDReferenceRepository {
  constructor(private readonly database: MaxStoichDatabase) {}

  async list(): Promise<readonly XRDReference[]> { return this.database.xrdReferences.orderBy("updatedAt").reverse().toArray(); }
  async get(referenceId: string): Promise<{ reference: XRDReference; revision: XRDReferenceRevision } | undefined> {
    const reference = await this.database.xrdReferences.get(referenceId); if (!reference) return undefined;
    const revision = await this.database.xrdReferenceRevisions.get(reference.currentRevisionId); return revision ? { reference, revision } : undefined;
  }
  async getRevision(revisionId: string): Promise<XRDReferenceRevision | undefined> { return this.database.xrdReferenceRevisions.get(revisionId); }
  async revisions(referenceId: string): Promise<readonly XRDReferenceRevision[]> { return this.database.xrdReferenceRevisions.where("referenceId").equals(referenceId).reverse().sortBy("revisionNumber"); }
  async findStructuresByCifHash(hash: string): Promise<readonly XRDReferenceRevision[]> { return this.database.xrdReferenceRevisions.where("cifSha256").equals(hash).toArray(); }

  async createStructure(input: CreateStructureReferenceInput): Promise<{ reference: XRDReference; revision: XRDReferenceRevision; duplicates: readonly XRDReferenceRevision[] }> {
    const cifSha256 = await sha256Text(input.cifText);
    if (cifSha256 !== input.pattern.reference.cifSha256) throw new Error("The CIF text does not match the calculated pattern hash.");
    const duplicates = await this.findStructuresByCifHash(cifSha256), now = new Date().toISOString(), referenceId = id("xrd-reference"), revisionId = id("xrd-reference-revision");
    const sourceType = input.sourceType ?? (input.pattern.reference.sourceType === "cod" ? "COD" : input.pattern.reference.sourceType === "lmsl-cif" ? "LMSL_CIF" : "USER_CIF");
    const revision = xrdReferenceRevisionSchema.parse({
      schemaVersion: "1.0.0", revisionId, referenceId, revisionNumber: 1, createdAt: now, changeKind: "CREATED", changeSummary: "Initial saved reference",
      displayName: input.displayName?.trim() || input.pattern.reference.phaseName || input.pattern.reference.formula, phaseName: input.pattern.reference.phaseName,
      formula: input.pattern.reference.formula, sourceType, validationStatus: "UNREVIEWED", validationChangedAt: now, notes: input.notes?.trim() ?? "", tags: cleanTags(input.tags),
      cifSha256, rawArtifactSha256: null,
      doi: input.pattern.reference.doi, publication: input.pattern.reference.publication,
      payload: { kind: "STRUCTURE", cifText: input.cifText, cifSha256, codId: sourceType === "COD" ? input.pattern.reference.sourceId : null, codRevision: sourceType === "COD" ? input.pattern.reference.sourceRevision : null,
        retrievedAt: input.pattern.reference.retrievedAt, sourceUrl: input.pattern.reference.sourceUrl, lattice: input.pattern.lattice, spaceGroup: input.pattern.spaceGroup, crystalSystem: input.pattern.crystalSystem,
        theoreticalPattern: input.pattern, theoreticalPatternSha256: await sha256Text(stable(input.pattern)), },
    });
    const reference = xrdReferenceSchema.parse({ schemaVersion: "1.0.0", referenceId, displayName: revision.displayName, phaseName: revision.phaseName, formula: revision.formula, sourceType, validationStatus: revision.validationStatus, tags: revision.tags,
      createdAt: now, updatedAt: now, currentRevisionId: revisionId, currentRevisionNumber: 1, crystalSystem: input.pattern.crystalSystem, archived: false });
    await this.database.transaction("rw", this.database.xrdReferences, this.database.xrdReferenceRevisions, async () => { await this.database.xrdReferenceRevisions.add(revision); await this.database.xrdReferences.add(reference); });
    return { reference, revision, duplicates };
  }

  async createEmpirical(input: CreateEmpiricalReferenceInput): Promise<{ reference: XRDReference; revision: XRDReferenceRevision }> {
    const measurement = await this.database.xrdMeasurements.get(input.measurementId); if (!measurement) throw new Error("The source measurement is unavailable.");
    const processed = input.processedRepresentationId ? await this.database.xrdProcessedRepresentations.get(input.processedRepresentationId) : undefined;
    if (input.processedRepresentationId && (!processed || processed.parentMeasurementId !== input.measurementId)) throw new Error("The selected processing run does not belong to this measurement.");
    const analysis = input.peakAnalysisId ? await this.database.xrdPeakAnalyses.get(input.peakAnalysisId) : undefined;
    if (input.peakAnalysisId && (!analysis || analysis.parentMeasurementId !== input.measurementId || analysis.parentProcessedRepresentationId !== input.processedRepresentationId)) throw new Error("The selected peak analysis does not match the empirical lineage.");
    if (input.associatedStructure) { const linked = await this.getRevision(input.associatedStructure.revisionId); if (!linked || linked.referenceId !== input.associatedStructure.referenceId || linked.payload.kind !== "STRUCTURE") throw new Error("The associated structure revision is unavailable."); }
    const now = new Date().toISOString(), referenceId = id("xrd-reference"), revisionId = id("xrd-reference-revision");
    const revision = xrdReferenceRevisionSchema.parse({ schemaVersion: "1.0.0", revisionId, referenceId, revisionNumber: 1, createdAt: now, changeKind: "CREATED", changeSummary: "Initial empirical reference",
      displayName: input.displayName.trim(), phaseName: input.phaseName?.trim() || null, formula: input.formula.trim(), sourceType: input.sourceType ?? "LMSL_EMPIRICAL", validationStatus: "UNREVIEWED", validationChangedAt: now,
      notes: input.notes?.trim() ?? "", tags: cleanTags(input.tags), doi: null, publication: null,
      cifSha256: null, rawArtifactSha256: measurement.rawArtifactSha256,
      payload: { kind: "EMPIRICAL", sourceMeasurementId: input.measurementId, rawArtifactSha256: measurement.rawArtifactSha256, originalFilename: measurement.measurement.sourceFilename,
        sampleId: input.sampleId?.trim() || measurement.measurement.maxcalcSampleId, batchId: input.batchId?.trim() || null, recipeId: input.recipeId?.trim() || null,
        acquisitionMetadata: measurement.measurement.acquisitionMetadata, wavelengthAngstrom: input.wavelengthAngstrom, selectedProcessedRepresentationId: input.processedRepresentationId ?? null,
        selectedPeakAnalysisId: input.peakAnalysisId ?? null, curatedPeakSetSha256: analysis ? await sha256Text(stable(analysis.analysis.fittedPeaks)) : null, associatedStructure: input.associatedStructure ?? null },
    });
    const reference = xrdReferenceSchema.parse({ schemaVersion: "1.0.0", referenceId, displayName: revision.displayName, phaseName: revision.phaseName, formula: revision.formula, sourceType: revision.sourceType,
      validationStatus: revision.validationStatus, tags: revision.tags, createdAt: now, updatedAt: now, currentRevisionId: revisionId, currentRevisionNumber: 1, crystalSystem: null, archived: false });
    await this.database.transaction("rw", this.database.xrdReferences, this.database.xrdReferenceRevisions, async () => { await this.database.xrdReferenceRevisions.add(revision); await this.database.xrdReferences.add(reference); });
    return { reference, revision };
  }

  async revise(referenceId: string, changes: Partial<Pick<XRDReferenceRevision, "displayName" | "phaseName" | "formula" | "validationStatus" | "notes" | "tags" | "payload">>, changeSummary: string, changeKind: XRDReferenceRevision["changeKind"]): Promise<XRDReferenceRevision> {
    const current = await this.get(referenceId); if (!current) throw new Error("The reference is unavailable.");
    const now = new Date().toISOString(), revision = xrdReferenceRevisionSchema.parse({ ...current.revision, ...changes, revisionId: id("xrd-reference-revision"), revisionNumber: current.revision.revisionNumber + 1,
      createdAt: now, changeKind, changeSummary: changeSummary.trim() || "Reference revised", validationChangedAt: changes.validationStatus && changes.validationStatus !== current.revision.validationStatus ? now : current.revision.validationChangedAt,
      tags: changes.tags ? cleanTags(changes.tags) : current.revision.tags });
    await this.database.transaction("rw", this.database.xrdReferences, this.database.xrdReferenceRevisions, async () => {
      await this.database.xrdReferenceRevisions.add(revision);
      await this.database.xrdReferences.update(referenceId, { displayName: revision.displayName, phaseName: revision.phaseName, formula: revision.formula, sourceType: revision.sourceType, validationStatus: revision.validationStatus,
        tags: revision.tags, updatedAt: now, currentRevisionId: revision.revisionId, currentRevisionNumber: revision.revisionNumber, crystalSystem: revision.payload.kind === "STRUCTURE" ? revision.payload.crystalSystem : null, archived: revision.validationStatus === "DEPRECATED" });
    });
    return revision;
  }

  async remove(referenceId: string): Promise<void> {
    const revisions = await this.revisions(referenceId), revisionIds = new Set(revisions.map((item) => item.revisionId));
    const used = (await this.database.xrdReferenceMatchingResults.toArray()).some((item) => item.result.libraryReference && revisionIds.has(item.result.libraryReference.revisionId));
    if (used) throw new Error("This reference has saved Stage 4 descendants. Deprecate it instead of deleting it.");
    await this.database.transaction("rw", this.database.xrdReferences, this.database.xrdReferenceRevisions, async () => { await this.database.xrdReferenceRevisions.where("referenceId").equals(referenceId).delete(); await this.database.xrdReferences.delete(referenceId); });
  }

  exportMetadata(reference: XRDReference, revision: XRDReferenceRevision): string {
    const payload = revision.payload.kind === "STRUCTURE" ? { ...revision.payload, cifText: undefined, theoreticalPattern: undefined } : revision.payload;
    return JSON.stringify({ schemaVersion: "1.0.0", reference, revision: { ...revision, payload }, exportNotice: "Large scientific arrays and CIF text are retained in the local library and referenced here by immutable hashes." }, null, 2);
  }

  exportBundle(reference: XRDReference, revision: XRDReferenceRevision): string {
    return JSON.stringify({ schemaVersion: "1.0.0", recordType: "maxcalc-xrd-reference-bundle", reference, revision }, null, 2);
  }

  async importBundle(content: string): Promise<{ reference: XRDReference; revision: XRDReferenceRevision }> {
    const imported = xrdReferenceBundleSchema.parse(JSON.parse(content) as unknown), source = imported.revision;
    if (source.referenceId !== imported.reference.referenceId) throw new Error("The imported reference and revision identities do not agree.");
    if (source.payload.kind === "STRUCTURE") {
      if (await sha256Text(source.payload.cifText) !== source.payload.cifSha256 || source.payload.cifSha256 !== source.cifSha256) throw new Error("The imported CIF hash does not match its content.");
      if (await sha256Text(stable(source.payload.theoreticalPattern)) !== source.payload.theoreticalPatternSha256) throw new Error("The imported calculated-pattern hash is invalid.");
    } else {
      const measurement = await this.database.xrdMeasurements.get(source.payload.sourceMeasurementId);
      if (!measurement || measurement.rawArtifactSha256 !== source.payload.rawArtifactSha256) throw new Error("The imported empirical reference requires its exact local source measurement.");
      if (source.payload.associatedStructure) {
        const linked = await this.getRevision(source.payload.associatedStructure.revisionId);
        if (!linked || linked.referenceId !== source.payload.associatedStructure.referenceId || linked.payload.kind !== "STRUCTURE") throw new Error("The imported empirical structure association is unavailable locally.");
      }
    }
    const now = new Date().toISOString(), referenceId = id("xrd-reference"), revisionId = id("xrd-reference-revision");
    const revision = xrdReferenceRevisionSchema.parse({ ...source, referenceId, revisionId, revisionNumber: 1, createdAt: now, changeKind: "CREATED", changeSummary: `Imported from ${source.referenceId} revision ${source.revisionNumber}` });
    const reference = xrdReferenceSchema.parse({ ...imported.reference, referenceId, createdAt: now, updatedAt: now, currentRevisionId: revisionId, currentRevisionNumber: 1, archived: revision.validationStatus === "DEPRECATED" });
    await this.database.transaction("rw", this.database.xrdReferences, this.database.xrdReferenceRevisions, async () => { await this.database.xrdReferenceRevisions.add(revision); await this.database.xrdReferences.add(reference); });
    return { reference, revision };
  }
}
