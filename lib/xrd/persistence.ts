import type { MaxStoichDatabase } from "@/lib/persistence/database";
import { experimentalXrdParseResponseSchema, type ExperimentalXRDMeasurement, type RawXRDArtifact } from "./schemas";
import { peakAnalysisSchema, processedRepresentationSchema, type ProcessedXRDRepresentation, type XRDPeakAnalysis } from "./stage3";
import { latticeRefinementResultSchema, matchingResultSchema, type XRDLatticeRefinementResult, type XRDReferenceMatchingResult } from "./stage4";

export interface StoredRawXRDArtifact extends RawXRDArtifact {
  readonly rawBytes: Blob;
}

export interface StoredExperimentalXRDMeasurement {
  readonly id: string;
  readonly rawArtifactId: string;
  readonly rawArtifactSha256: string;
  readonly importedAt: string;
  readonly displayName: string;
  readonly measurement: ExperimentalXRDMeasurement;
}

export interface StoredProcessedXRDRepresentation {
  readonly id: string;
  readonly parentMeasurementId: string;
  readonly rawArtifactSha256: string;
  readonly createdAt: string;
  readonly representation: ProcessedXRDRepresentation;
}

export interface StoredXRDPeakAnalysis {
  readonly id: string;
  readonly parentProcessedRepresentationId: string;
  readonly parentMeasurementId: string;
  readonly rawArtifactSha256: string;
  readonly createdAt: string;
  readonly analysis: XRDPeakAnalysis;
}

export interface StoredXRDReferenceMatchingResult {
  readonly id: string;
  readonly parentPeakAnalysisId: string;
  readonly parentProcessedRepresentationId: string;
  readonly parentMeasurementId: string;
  readonly referenceCifSha256: string;
  readonly rawArtifactSha256: string;
  readonly createdAt: string;
  readonly result: XRDReferenceMatchingResult;
}

export interface StoredXRDLatticeRefinementResult {
  readonly id: string;
  readonly parentMatchingResultId: string;
  readonly parentPeakAnalysisId: string;
  readonly parentMeasurementId: string;
  readonly referenceCifSha256: string;
  readonly rawArtifactSha256: string;
  readonly createdAt: string;
  readonly result: XRDLatticeRefinementResult;
}

export class XRDMeasurementRepository {
  constructor(private readonly database: MaxStoichDatabase) {}

  async save(rawArtifact: RawXRDArtifact, rawBytes: Blob, measurement: ExperimentalXRDMeasurement, displayName?: string): Promise<void> {
    experimentalXrdParseResponseSchema.parse({ schemaVersion: "1.0.0", rawArtifact, measurement, availableColumns: [] });
    if (rawBytes.size !== rawArtifact.byteLength) throw new Error("Raw XRD byte length does not match the parsed artifact provenance.");
    await this.database.transaction("rw", this.database.xrdRawArtifacts, this.database.xrdMeasurements, async () => {
      const existing = await this.database.xrdRawArtifacts.get(rawArtifact.artifactId);
      if (!existing) await this.database.xrdRawArtifacts.add({ ...rawArtifact, rawBytes });
      else if (existing.sha256 !== rawArtifact.sha256 || existing.byteLength !== rawArtifact.byteLength) throw new Error("Stored raw XRD artifact identity does not match the parsed result.");
      await this.database.xrdMeasurements.add({
        id: measurement.measurementId, rawArtifactId: measurement.rawArtifactId, rawArtifactSha256: measurement.rawArtifactSha256,
        importedAt: measurement.importedAt, displayName: displayName?.trim() || measurement.sampleName || measurement.sourceFilename, measurement,
      });
    });
  }

  async list(): Promise<readonly StoredExperimentalXRDMeasurement[]> { return this.database.xrdMeasurements.orderBy("importedAt").reverse().toArray(); }
  async get(id: string): Promise<StoredExperimentalXRDMeasurement | undefined> { return this.database.xrdMeasurements.get(id); }
  async findByRawHash(sha256: string): Promise<readonly StoredExperimentalXRDMeasurement[]> { return this.database.xrdMeasurements.where("rawArtifactSha256").equals(sha256).toArray(); }
  async rename(id: string, displayName: string): Promise<void> {
    const trimmed = displayName.trim();
    if (!trimmed) throw new Error("A display name is required.");
    await this.database.xrdMeasurements.update(id, { displayName: trimmed });
  }
  async delete(id: string): Promise<void> {
    await this.database.transaction("rw", this.database.xrdMeasurements, this.database.xrdRawArtifacts, this.database.xrdProcessedRepresentations, this.database.xrdReferenceMatchingResults, async () => {
      const record = await this.database.xrdMeasurements.get(id);
      if (!record) return;
      const descendants = await this.database.xrdProcessedRepresentations.where("parentMeasurementId").equals(id).count();
      const stage4Descendants = await this.database.xrdReferenceMatchingResults.where("parentMeasurementId").equals(id).count();
      if (descendants > 0 || stage4Descendants > 0) throw new Error("Delete saved processing runs, peak analyses, matching results, and refinements before deleting this measurement.");
      await this.database.xrdMeasurements.delete(id);
      const references = await this.database.xrdMeasurements.where("rawArtifactId").equals(record.rawArtifactId).count();
      if (references === 0) await this.database.xrdRawArtifacts.delete(record.rawArtifactId);
    });
  }
}

export class XRDAnalysisRepository {
  constructor(private readonly database: MaxStoichDatabase) {}

  async saveProcessed(representation: ProcessedXRDRepresentation): Promise<void> {
    processedRepresentationSchema.parse(representation);
    const parent = await this.database.xrdMeasurements.get(representation.parentMeasurementId);
    if (!parent || parent.rawArtifactSha256 !== representation.rawArtifactSha256) throw new Error("The processing run parent measurement is missing or has different raw provenance.");
    await this.database.xrdProcessedRepresentations.add({
      id: representation.processedRepresentationId, parentMeasurementId: representation.parentMeasurementId,
      rawArtifactSha256: representation.rawArtifactSha256, createdAt: representation.createdAt, representation,
    });
  }

  async listProcessed(parentMeasurementId: string): Promise<readonly StoredProcessedXRDRepresentation[]> {
    return this.database.xrdProcessedRepresentations.where("parentMeasurementId").equals(parentMeasurementId).reverse().sortBy("createdAt");
  }

  async saveAnalysis(analysis: XRDPeakAnalysis): Promise<void> {
    peakAnalysisSchema.parse(analysis);
    const parent = await this.database.xrdProcessedRepresentations.get(analysis.parentProcessedRepresentationId);
    if (!parent || parent.parentMeasurementId !== analysis.parentMeasurementId || parent.rawArtifactSha256 !== analysis.rawArtifactSha256) throw new Error("The peak analysis parent processing run is missing or has different lineage.");
    await this.database.xrdPeakAnalyses.add({
      id: analysis.peakAnalysisId, parentProcessedRepresentationId: analysis.parentProcessedRepresentationId,
      parentMeasurementId: analysis.parentMeasurementId, rawArtifactSha256: analysis.rawArtifactSha256,
      createdAt: analysis.createdAt, analysis,
    });
  }

  async listAnalyses(parentProcessedRepresentationId: string): Promise<readonly StoredXRDPeakAnalysis[]> {
    return this.database.xrdPeakAnalyses.where("parentProcessedRepresentationId").equals(parentProcessedRepresentationId).reverse().sortBy("createdAt");
  }

  async deleteAnalysis(id: string): Promise<void> {
    const descendants = await this.database.xrdReferenceMatchingResults.where("parentPeakAnalysisId").equals(id).count();
    if (descendants > 0) throw new Error("Delete saved matching and refinement results before deleting this peak analysis.");
    await this.database.xrdPeakAnalyses.delete(id);
  }

  async deleteProcessed(id: string): Promise<void> {
    await this.database.transaction("rw", this.database.xrdProcessedRepresentations, this.database.xrdPeakAnalyses, async () => {
      const descendants = await this.database.xrdPeakAnalyses.where("parentProcessedRepresentationId").equals(id).count();
      if (descendants > 0) throw new Error("Delete saved peak analyses before deleting this processing run.");
      await this.database.xrdProcessedRepresentations.delete(id);
    });
  }
}

export class XRDReferenceAnalysisRepository {
  constructor(private readonly database: MaxStoichDatabase) {}

  async saveMatching(result: XRDReferenceMatchingResult): Promise<void> {
    matchingResultSchema.parse(result);
    const parent = await this.database.xrdPeakAnalyses.get(result.parentPeakAnalysisId);
    if (!parent || parent.parentProcessedRepresentationId !== result.parentProcessedRepresentationId || parent.parentMeasurementId !== result.parentMeasurementId || parent.rawArtifactSha256 !== result.rawArtifactSha256) throw new Error("The matching result parent peak analysis is missing or has different lineage.");
    if (result.libraryReference) {
      const revision = await this.database.xrdReferenceRevisions.get(result.libraryReference.revisionId);
      if (!revision || revision.referenceId !== result.libraryReference.referenceId || revision.revisionNumber !== result.libraryReference.revisionNumber || revision.payload.kind !== "STRUCTURE" || revision.payload.cifSha256 !== result.referenceCifSha256) throw new Error("The matching result library reference revision is missing or has different scientific provenance.");
    }
    await this.database.xrdReferenceMatchingResults.add({ id: result.matchingResultId, parentPeakAnalysisId: result.parentPeakAnalysisId, parentProcessedRepresentationId: result.parentProcessedRepresentationId, parentMeasurementId: result.parentMeasurementId, referenceCifSha256: result.referenceCifSha256, rawArtifactSha256: result.rawArtifactSha256, createdAt: result.createdAt, result });
  }

  async listMatching(parentPeakAnalysisId: string): Promise<readonly StoredXRDReferenceMatchingResult[]> {
    return this.database.xrdReferenceMatchingResults.where("parentPeakAnalysisId").equals(parentPeakAnalysisId).reverse().sortBy("createdAt");
  }

  async saveRefinement(result: XRDLatticeRefinementResult): Promise<void> {
    latticeRefinementResultSchema.parse(result);
    const parent = await this.database.xrdReferenceMatchingResults.get(result.parentMatchingResultId);
    if (!parent || parent.parentPeakAnalysisId !== result.parentPeakAnalysisId || parent.parentMeasurementId !== result.parentMeasurementId || parent.rawArtifactSha256 !== result.rawArtifactSha256 || parent.referenceCifSha256 !== result.referenceCifSha256) throw new Error("The refinement parent matching result is missing or has different lineage.");
    if (JSON.stringify(parent.result.libraryReference ?? null) !== JSON.stringify(result.libraryReference ?? null)) throw new Error("The refinement library reference revision differs from its matching parent.");
    await this.database.xrdLatticeRefinementResults.add({ id: result.refinementId, parentMatchingResultId: result.parentMatchingResultId, parentPeakAnalysisId: result.parentPeakAnalysisId, parentMeasurementId: result.parentMeasurementId, referenceCifSha256: result.referenceCifSha256, rawArtifactSha256: result.rawArtifactSha256, createdAt: result.createdAt, result });
  }

  async listRefinements(parentMatchingResultId: string): Promise<readonly StoredXRDLatticeRefinementResult[]> {
    return this.database.xrdLatticeRefinementResults.where("parentMatchingResultId").equals(parentMatchingResultId).reverse().sortBy("createdAt");
  }

  async deleteRefinement(id: string): Promise<void> { await this.database.xrdLatticeRefinementResults.delete(id); }
  async deleteMatching(id: string): Promise<void> {
    const descendants = await this.database.xrdLatticeRefinementResults.where("parentMatchingResultId").equals(id).count();
    if (descendants > 0) throw new Error("Delete saved lattice refinements before deleting this matching result.");
    await this.database.xrdReferenceMatchingResults.delete(id);
  }
}
