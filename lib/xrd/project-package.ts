import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { z } from "zod";
import type { MaxStoichDatabase } from "../persistence/database";
import { experimentalXrdParseResponseSchema } from "./schemas";
import { peakAnalysisSchema, processedRepresentationSchema } from "./stage3";
import { latticeRefinementResultSchema, matchingResultSchema } from "./stage4";
import { xrdReferenceRevisionSchema, xrdReferenceSchema } from "./references";

export const XRD_PROJECT_SCHEMA_VERSION = "1.0.0" as const;

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const entrySchema = z.object({ path: z.string().min(1), sha256: hashSchema, byteLength: z.number().int().nonnegative(), mediaType: z.string().min(1) });
export const xrdProjectManifestSchema = z.object({
  schemaVersion: z.literal(XRD_PROJECT_SCHEMA_VERSION), recordType: z.literal("maxcalc-xrd-project"), projectName: z.string().min(1).max(200), exportedAt: z.string(),
  applicationVersion: z.string(), sourceIds: z.object({ peakAnalysisId: z.string(), measurementId: z.string(), processedRepresentationId: z.string(), matchingResultIds: z.array(z.string()), refinementIds: z.array(z.string()), referenceRevisionIds: z.array(z.string()) }),
  softwareVersions: z.record(z.string(), z.string()), entries: z.array(entrySchema).min(4),
});
export type XRDProjectManifest = z.infer<typeof xrdProjectManifestSchema>;

export interface XRDProjectImportResult { readonly projectName: string; readonly measurementId: string; readonly processedRepresentationId: string; readonly peakAnalysisId: string; readonly matchingResultIds: readonly string[]; readonly refinementIds: readonly string[]; readonly figureSpecs: readonly unknown[]; readonly importedFrom: XRDProjectManifest["sourceIds"]; }

async function sha256(bytes: Uint8Array): Promise<string> {
  const input = new Uint8Array(bytes.byteLength); input.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", input.buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}
function json(value: unknown): Uint8Array { return strToU8(`${JSON.stringify(value, null, 2)}\n`); }
function parseJson(bytes: Uint8Array, path: string): unknown { try { return JSON.parse(strFromU8(bytes)); } catch { throw new Error(`${path} is not valid JSON.`); } }
function safeFilename(value: string): string { return value.replace(/[^a-z0-9._-]+/gi, "_").replace(/^\.+/, "") || "measurement.txt"; }
function newId(prefix: string): string { return `${prefix}-${crypto.randomUUID()}`; }

export async function exportXrdProjectPackage(database: MaxStoichDatabase, input: Readonly<{ peakAnalysisId: string; projectName: string; applicationVersion: string; figureSpecs?: readonly unknown[] }>): Promise<Uint8Array> {
  const peak = await database.xrdPeakAnalyses.get(input.peakAnalysisId); if (!peak) throw new Error("The selected peak analysis no longer exists.");
  const processed = await database.xrdProcessedRepresentations.get(peak.parentProcessedRepresentationId); if (!processed) throw new Error("The parent processing run is missing.");
  const measurement = await database.xrdMeasurements.get(peak.parentMeasurementId); if (!measurement) throw new Error("The parent measurement is missing.");
  const raw = await database.xrdRawArtifacts.get(measurement.rawArtifactId); if (!raw) throw new Error("The exact raw artifact is missing.");
  const matching = await database.xrdReferenceMatchingResults.where("parentPeakAnalysisId").equals(peak.id).toArray();
  if (matching.some((item) => !item.result.libraryReference)) throw new Error("Save the exact structure as a versioned reference and create a matching result from that revision before exporting a complete project.");
  const refinements = (await Promise.all(matching.map((item) => database.xrdLatticeRefinementResults.where("parentMatchingResultId").equals(item.id).toArray()))).flat();
  const revisionIds = [...new Set(matching.map((item) => item.result.libraryReference?.revisionId).filter((value): value is string => Boolean(value)))];
  const revisions = (await Promise.all(revisionIds.map((id) => database.xrdReferenceRevisions.get(id)))).filter((value) => value !== undefined);
  if (revisions.length !== revisionIds.length) throw new Error("An exact reference revision used by the analysis is missing.");
  const referenceIds = [...new Set(revisions.map((item) => item.referenceId))];
  const references = (await Promise.all(referenceIds.map((id) => database.xrdReferences.get(id)))).filter((value) => value !== undefined);

  const files: Record<string, Uint8Array> = {
    "records/raw-artifact.json": json({ schemaVersion: raw.schemaVersion, artifactId: raw.artifactId, originalFilename: raw.originalFilename, byteLength: raw.byteLength, mimeType: raw.mimeType, sha256: raw.sha256, importedAt: raw.importedAt, sourceMetadata: raw.sourceMetadata }), "records/measurement.json": json(measurement), "records/processing.json": json(processed), "records/peaks.json": json(peak),
    "records/matching.json": json(matching), "records/refinements.json": json(refinements), "records/references.json": json(references), "records/reference-revisions.json": json(revisions),
    "figures/specs.json": json(input.figureSpecs ?? []), [`raw/${safeFilename(raw.originalFilename)}`]: new Uint8Array(await raw.rawBytes.arrayBuffer()),
  };
  if (await sha256(files[`raw/${safeFilename(raw.originalFilename)}`]!) !== raw.sha256) throw new Error("The stored raw artifact bytes no longer match their immutable SHA-256 provenance.");
  for (const revision of revisions) if (revision.payload.kind === "STRUCTURE") files[`cif/${revision.revisionId}.cif`] = strToU8(revision.payload.cifText);
  const entries = await Promise.all(Object.entries(files).map(async ([path, bytes]) => ({ path, sha256: await sha256(bytes), byteLength: bytes.byteLength, mediaType: path.endsWith(".json") ? "application/json" : path.endsWith(".cif") ? "chemical/x-cif" : raw.mimeType ?? "application/octet-stream" })));
  const provenance = peak.analysis.scientificProvenance;
  const manifest: XRDProjectManifest = {
    schemaVersion: XRD_PROJECT_SCHEMA_VERSION, recordType: "maxcalc-xrd-project", projectName: input.projectName.trim() || measurement.displayName, exportedAt: new Date().toISOString(), applicationVersion: input.applicationVersion,
    sourceIds: { peakAnalysisId: peak.id, measurementId: measurement.id, processedRepresentationId: processed.id, matchingResultIds: matching.map((item) => item.id), refinementIds: refinements.map((item) => item.id), referenceRevisionIds: revisionIds },
    softwareVersions: { service: provenance.serviceVersion, python: provenance.pythonVersion, numpy: provenance.numpyVersion, scipy: provenance.scipyVersion, pybaselines: provenance.pybaselinesVersion, lmfit: provenance.lmfitVersion }, entries,
  };
  files["manifest.json"] = json(manifest);
  return zipSync(files, { level: 6 });
}

export async function importXrdProjectPackage(database: MaxStoichDatabase, archive: Uint8Array): Promise<XRDProjectImportResult> {
  let files: Record<string, Uint8Array>; try { files = unzipSync(archive); } catch { throw new Error("The selected file is not a readable MAXCalc XRD ZIP project."); }
  const manifestBytes = files["manifest.json"]; if (!manifestBytes) throw new Error("The project manifest is missing.");
  const manifest = xrdProjectManifestSchema.parse(parseJson(manifestBytes, "manifest.json"));
  for (const entry of manifest.entries) {
    const bytes = files[entry.path]; if (!bytes) throw new Error(`Package entry ${entry.path} is missing.`);
    if (bytes.byteLength !== entry.byteLength || await sha256(bytes) !== entry.sha256) throw new Error(`Package integrity check failed for ${entry.path}.`);
  }
  for (const path of ["records/raw-artifact.json", "records/measurement.json", "records/processing.json", "records/peaks.json", "records/matching.json", "records/refinements.json", "records/references.json", "records/reference-revisions.json", "figures/specs.json"]) if (!files[path] || !manifest.entries.some((entry) => entry.path === path)) throw new Error(`Required package entry ${path} is missing from the verified manifest.`);
  const rawSource = experimentalXrdParseResponseSchema.shape.rawArtifact.parse(parseJson(files["records/raw-artifact.json"]!, "records/raw-artifact.json"));
  const measurementSource = parseJson(files["records/measurement.json"]!, "records/measurement.json") as Record<string, unknown>;
  const processedSource = parseJson(files["records/processing.json"]!, "records/processing.json") as Record<string, unknown>;
  const peakSource = parseJson(files["records/peaks.json"]!, "records/peaks.json") as Record<string, unknown>;
  const matchingSources = z.array(z.record(z.string(), z.unknown())).parse(parseJson(files["records/matching.json"]!, "records/matching.json"));
  const refinementSources = z.array(z.record(z.string(), z.unknown())).parse(parseJson(files["records/refinements.json"]!, "records/refinements.json"));
  const references = z.array(xrdReferenceSchema).parse(parseJson(files["records/references.json"]!, "records/references.json"));
  const revisions = z.array(xrdReferenceRevisionSchema).parse(parseJson(files["records/reference-revisions.json"]!, "records/reference-revisions.json"));
  const figureSpecs = z.array(z.unknown()).parse(parseJson(files["figures/specs.json"]!, "figures/specs.json"));

  const oldMeasurement = experimentalXrdParseResponseSchema.shape.measurement.parse(measurementSource.measurement);
  const oldProcessed = processedRepresentationSchema.parse(processedSource.representation);
  const oldPeak = peakAnalysisSchema.parse(peakSource.analysis);
  const rawEntry = manifest.entries.find((entry) => entry.path.startsWith("raw/")); if (!rawEntry) throw new Error("The raw scientific artifact is missing from the package.");
  if (oldMeasurement.rawArtifactSha256 !== rawEntry.sha256) throw new Error("The raw artifact hash does not match the measurement provenance.");

  const existingRaw = await database.xrdRawArtifacts.where("sha256").equals(rawEntry.sha256).first();
  const rawArtifactId = existingRaw?.artifactId ?? newId("xrd-artifact-imported");
  const measurementId = newId("xrd-measurement-imported"), processedId = newId("xrd-processed-imported"), peakId = newId("xrd-peaks-imported");
  const referenceIdMap = new Map(references.map((item) => [item.referenceId, newId("xrd-reference-imported")]));
  const revisionIdMap = new Map(revisions.map((item) => [item.revisionId, newId("xrd-reference-revision-imported")]));
  const matchingIdMap = new Map(matchingSources.map((item) => [String(item.id), newId("xrd-matching-imported")]));
  const refinementIdMap = new Map(refinementSources.map((item) => [String(item.id), newId("xrd-refinement-imported")]));
  const importedAt = new Date().toISOString();

  const measurement = { ...oldMeasurement, measurementId, rawArtifactId, importedAt, parserProvenance: { ...oldMeasurement.parserProvenance, userOverrides: { ...oldMeasurement.parserProvenance.userOverrides, importedProjectSourceId: oldMeasurement.measurementId } } };
  const processed = processedRepresentationSchema.parse({ ...oldProcessed, processedRepresentationId: processedId, parentMeasurementId: measurementId });
  const peak = peakAnalysisSchema.parse({ ...oldPeak, peakAnalysisId: peakId, parentProcessedRepresentationId: processedId, parentMeasurementId: measurementId });
  const remapLibrary = (value: unknown) => {
    if (!value || typeof value !== "object") return value;
    const item = value as { referenceId: string; revisionId: string; revisionNumber: number };
    return { ...item, referenceId: referenceIdMap.get(item.referenceId)!, revisionId: revisionIdMap.get(item.revisionId)! };
  };
  const matching = matchingSources.map((stored) => {
    const result = matchingResultSchema.parse(stored.result);
    const id = matchingIdMap.get(String(stored.id))!;
    return { id, parentPeakAnalysisId: peakId, parentProcessedRepresentationId: processedId, parentMeasurementId: measurementId, referenceCifSha256: result.referenceCifSha256, rawArtifactSha256: result.rawArtifactSha256, createdAt: result.createdAt, result: matchingResultSchema.parse({ ...result, matchingResultId: id, parentPeakAnalysisId: peakId, parentProcessedRepresentationId: processedId, parentMeasurementId: measurementId, libraryReference: remapLibrary(result.libraryReference) }) };
  });
  const refinements = refinementSources.map((stored) => {
    const result = latticeRefinementResultSchema.parse(stored.result); const id = refinementIdMap.get(String(stored.id))!; const parent = matchingIdMap.get(result.parentMatchingResultId); if (!parent) throw new Error("A refinement points to a matching result outside the package.");
    return { id, parentMatchingResultId: parent, parentPeakAnalysisId: peakId, parentMeasurementId: measurementId, referenceCifSha256: result.referenceCifSha256, rawArtifactSha256: result.rawArtifactSha256, createdAt: result.createdAt, result: latticeRefinementResultSchema.parse({ ...result, refinementId: id, parentMatchingResultId: parent, parentPeakAnalysisId: peakId, parentProcessedRepresentationId: processedId, parentMeasurementId: measurementId, libraryReference: remapLibrary(result.libraryReference) }) };
  });
  const remappedRevisions = revisions.map((item) => xrdReferenceRevisionSchema.parse({ ...item, revisionId: revisionIdMap.get(item.revisionId), referenceId: referenceIdMap.get(item.referenceId), changeSummary: `${item.changeSummary} Imported from project revision ${item.revisionId}.` }));
  const remappedReferences = references.map((item) => {
    const owned = remappedRevisions.filter((revision) => revision.referenceId === referenceIdMap.get(item.referenceId)).sort((a, b) => b.revisionNumber - a.revisionNumber); const current = owned[0]; if (!current) throw new Error("A packaged reference has no included revision.");
    return xrdReferenceSchema.parse({ ...item, referenceId: referenceIdMap.get(item.referenceId), currentRevisionId: current.revisionId, currentRevisionNumber: current.revisionNumber, createdAt: importedAt, updatedAt: importedAt });
  });
  const remappedFigureSpecs = figureSpecs.map((value) => {
    if (!value || typeof value !== "object" || !("sources" in value) || !value.sources || typeof value.sources !== "object") return value;
    const source = value.sources as Record<string, unknown>;
    return { ...value, sources: { ...source, measurementId, processedRepresentationId: processedId, peakAnalysisId: peakId, referenceRevisionId: typeof source.referenceRevisionId === "string" ? revisionIdMap.get(source.referenceRevisionId) ?? null : null, matchingResultId: typeof source.matchingResultId === "string" ? matchingIdMap.get(source.matchingResultId) ?? null : null, refinementId: typeof source.refinementId === "string" ? refinementIdMap.get(source.refinementId) ?? null : null } };
  });

  await database.transaction("rw", [database.xrdRawArtifacts, database.xrdMeasurements, database.xrdProcessedRepresentations, database.xrdPeakAnalyses, database.xrdReferences, database.xrdReferenceRevisions, database.xrdReferenceMatchingResults, database.xrdLatticeRefinementResults], async () => {
    if (!existingRaw) await database.xrdRawArtifacts.add({ ...rawSource, artifactId: rawArtifactId, importedAt, sourceMetadata: { ...(rawSource.sourceMetadata ?? {}), importedProjectName: manifest.projectName, importedProjectSourceArtifactId: rawSource.artifactId }, rawBytes: new Blob([new Uint8Array(files[rawEntry.path]!)], { type: rawSource.mimeType ?? rawEntry.mediaType }) });
    await database.xrdMeasurements.add({ id: measurementId, rawArtifactId, rawArtifactSha256: measurement.rawArtifactSha256, importedAt, displayName: `${manifest.projectName} (imported)`, measurement });
    await database.xrdProcessedRepresentations.add({ id: processedId, parentMeasurementId: measurementId, rawArtifactSha256: processed.rawArtifactSha256, createdAt: processed.createdAt, representation: processed });
    await database.xrdPeakAnalyses.add({ id: peakId, parentProcessedRepresentationId: processedId, parentMeasurementId: measurementId, rawArtifactSha256: peak.rawArtifactSha256, createdAt: peak.createdAt, analysis: peak });
    await database.xrdReferences.bulkAdd(remappedReferences); await database.xrdReferenceRevisions.bulkAdd(remappedRevisions); await database.xrdReferenceMatchingResults.bulkAdd(matching); await database.xrdLatticeRefinementResults.bulkAdd(refinements);
  });
  return { projectName: manifest.projectName, measurementId, processedRepresentationId: processedId, peakAnalysisId: peakId, matchingResultIds: matching.map((item) => item.id), refinementIds: refinements.map((item) => item.id), figureSpecs: remappedFigureSpecs, importedFrom: manifest.sourceIds };
}
