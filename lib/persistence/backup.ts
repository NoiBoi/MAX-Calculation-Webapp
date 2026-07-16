import { ENGINE_VERSION, canonicalRadiusDatasetContent, parseFormula, validateAtomicRadiusDataset, type BatchCalculationResult } from "@max-stoich/chemistry-engine";
import type { WorkspaceRecipeState } from "../workspace/adapter";
import { canonicalizeWorkspaceScientificInput, hasValidRationals, hasValidScientificNumbers, invalidScientificNumberPath, sha256Hex, stableCanonicalize } from "./canonical";
import { DATABASE_VERSION, type MaxStoichDatabase } from "./database";
import type { CalculationSnapshot, ComparisonWorkspace, MigrationMetadata, RecentCalculation, RecipeNote, RecipeRevision, RouteRevision, SavedRecipe, SavedRoute, StoredAtomicRadiusDataset, WorkspaceLayout } from "./entities";
import { createDefaultUserSettings, migrateUserSettings, type LocalUserSettings } from "../settings/user-settings";
import type { LocalDataRepositories } from "./repositories";

export const BACKUP_SCHEMA_VERSION = "1.0.0" as const;
export const MAX_IMPORT_BYTES = 10 * 1024 * 1024;
export const MAX_IMPORT_RECORDS = 5_000;
export const MAX_IMPORT_DEPTH = 40;
export const MAX_IMPORT_STRING_LENGTH = 100_000;
type TableName = "recipes" | "recipeRevisions" | "snapshots" | "routes" | "routeRevisions" | "recentCalculations" | "comparisons" | "layouts" | "radiusDatasets" | "recipeNotes" | "userSettings" | "migrations";
type LegacyTableName = Exclude<TableName, "radiusDatasets" | "recipeNotes" | "userSettings">;
type PreNotesTableName = Exclude<TableName, "recipeNotes" | "userSettings">;
type PreSettingsTableName = Exclude<TableName, "userSettings">;

export interface BackupRecords { readonly recipes: readonly SavedRecipe[]; readonly recipeRevisions: readonly RecipeRevision[]; readonly snapshots: readonly CalculationSnapshot[]; readonly routes: readonly SavedRoute[]; readonly routeRevisions: readonly RouteRevision[]; readonly recentCalculations: readonly RecentCalculation[]; readonly comparisons: readonly ComparisonWorkspace[]; readonly layouts: readonly WorkspaceLayout[]; readonly radiusDatasets: readonly StoredAtomicRadiusDataset[]; readonly recipeNotes: readonly RecipeNote[]; readonly userSettings: readonly LocalUserSettings[]; readonly migrations: readonly MigrationMetadata[] }
export interface BackupManifest { readonly counts: Readonly<Record<TableName, number>>; readonly recordDigests: Readonly<Record<TableName, Readonly<Record<string, string>>>>; readonly datasetVersions: readonly string[]; readonly manifestDigest: string }
export interface MaxStoichBackup { readonly backupSchemaVersion: typeof BACKUP_SCHEMA_VERSION; readonly recordType: "max-stoich-local-backup"; readonly applicationVersion: string; readonly databaseVersion: typeof DATABASE_VERSION; readonly createdAt: string; readonly records: BackupRecords; readonly manifest: BackupManifest }
export interface ImportDiagnostic { readonly code: string; readonly severity: "error" | "warning"; readonly path: string; readonly message: string; readonly blocking: boolean }
export interface RestoreConflict { readonly table: TableName; readonly id: string; readonly kind: "identical" | "divergent"; readonly proposedAction: "skip" | "resolve" }
export interface BackupPreview { readonly valid: boolean; readonly diagnostics: readonly ImportDiagnostic[]; readonly counts: Partial<Record<TableName, number>>; readonly conflicts: readonly RestoreConflict[]; readonly backup?: MaxStoichBackup }
export type RestoreMode = "preview" | "merge" | "replace";
export type ConflictResolution = "keep-local" | "import-as-new";

const tableNames: readonly TableName[] = ["recipes", "recipeRevisions", "snapshots", "routes", "routeRevisions", "recentCalculations", "comparisons", "layouts", "radiusDatasets", "recipeNotes", "userSettings", "migrations"];
const legacyTableNames: readonly LegacyTableName[] = ["recipes", "recipeRevisions", "snapshots", "routes", "routeRevisions", "recentCalculations", "comparisons", "layouts", "migrations"];
const preNotesTableNames: readonly PreNotesTableName[] = ["recipes", "recipeRevisions", "snapshots", "routes", "routeRevisions", "recentCalculations", "comparisons", "layouts", "radiusDatasets", "migrations"];
const preSettingsTableNames: readonly PreSettingsTableName[] = ["recipes", "recipeRevisions", "snapshots", "routes", "routeRevisions", "recentCalculations", "comparisons", "layouts", "radiusDatasets", "recipeNotes", "migrations"];
const idFor = (table: TableName, value: unknown): string => table === "recentCalculations" ? String((value as RecentCalculation).snapshotId) : String((value as { id: string }).id);

function resultMatchesCanonical(result: BatchCalculationResult, canonical: string): boolean {
  try {
    const parsed = JSON.parse(canonical) as Record<string, unknown>;
    const precursors = result.precursors.map((item) => Object.fromEntries(Object.entries(item).filter(([key]) => key !== "displayName")));
    return stableCanonicalize(parsed.batch) === stableCanonicalize(result.batch) && stableCanonicalize(parsed.precursors) === stableCanonicalize(precursors) && stableCanonicalize(parsed.realizedComposition) === stableCanonicalize(result.realizedComposition) && parsed.engineVersion === result.engineVersion && parsed.status === result.status;
  } catch { return false; }
}
function sameCanonical(left: string, right: string): boolean { try { return stableCanonicalize(JSON.parse(left)) === stableCanonicalize(JSON.parse(right)); } catch { return false; } }

function inspectLimits(value: unknown, diagnostics: ImportDiagnostic[], path = "$", depth = 0): void {
  if (depth > MAX_IMPORT_DEPTH) { diagnostics.push({ code: "IMPORT_DEPTH_EXCEEDED", severity: "error", path, message: `Nested input exceeds ${MAX_IMPORT_DEPTH} levels.`, blocking: true }); return; }
  if (typeof value === "string" && value.length > MAX_IMPORT_STRING_LENGTH) diagnostics.push({ code: "IMPORT_STRING_TOO_LONG", severity: "error", path, message: "Imported text exceeds the permitted length.", blocking: true });
  if (typeof value === "number" && !Number.isFinite(value)) diagnostics.push({ code: "IMPORT_NON_FINITE_NUMBER", severity: "error", path, message: "NaN and infinity are not permitted.", blocking: true });
  if (Array.isArray(value)) value.forEach((item, index) => inspectLimits(item, diagnostics, `${path}[${index}]`, depth + 1));
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => inspectLimits(item, diagnostics, `${path}.${key}`, depth + 1));
}

async function readRecords(database: MaxStoichDatabase): Promise<BackupRecords> {
  const [recipes, recipeRevisions, snapshots, routes, routeRevisions, recentCalculations, comparisons, layouts, radiusDatasets, recipeNotes, userSettings, migrations] = await Promise.all([database.recipes.toArray(), database.recipeRevisions.toArray(), database.snapshots.toArray(), database.routes.toArray(), database.routeRevisions.toArray(), database.recentCalculations.toArray(), database.comparisons.toArray(), database.layouts.toArray(), database.radiusDatasets.toArray(), database.recipeNotes.toArray(), database.userSettings.toArray(), database.migrations.toArray()]);
  return { recipes, recipeRevisions, snapshots, routes, routeRevisions, recentCalculations, comparisons, layouts, radiusDatasets, recipeNotes, userSettings, migrations };
}

async function manifestFor(records: BackupRecords, versions: Readonly<{ applicationVersion: string; databaseVersion: number }> = { applicationVersion: ENGINE_VERSION, databaseVersion: DATABASE_VERSION }): Promise<BackupManifest> {
  const counts = Object.fromEntries(tableNames.map((table) => [table, records[table].length])) as Record<TableName, number>;
  const recordDigests = {} as Record<TableName, Record<string, string>>;
  for (const table of tableNames) recordDigests[table] = Object.fromEntries(await Promise.all(records[table].map(async (record) => [idFor(table, record), await sha256Hex(stableCanonicalize(record))])));
  const datasetVersions = [...new Set([...records.snapshots.map((item) => `atomic-weights:${item.atomicWeightDataVersion}`), ...records.radiusDatasets.map((item) => `atomic-radii:${item.datasetId}@${item.datasetVersion}`)])].sort();
  const manifestDigest = await sha256Hex(stableCanonicalize({ counts, recordDigests, datasetVersions, backupSchemaVersion: BACKUP_SCHEMA_VERSION, databaseVersion: versions.databaseVersion, applicationVersion: versions.applicationVersion }));
  return { counts, recordDigests, datasetVersions, manifestDigest };
}

async function legacyManifestFor(records: Omit<BackupRecords, "radiusDatasets" | "recipeNotes" | "userSettings">, versions: Readonly<{ applicationVersion: string; databaseVersion: number }>): Promise<Readonly<{ counts: Record<LegacyTableName, number>; recordDigests: Record<LegacyTableName, Record<string, string>>; datasetVersions: readonly string[]; manifestDigest: string }>> {
  const counts = Object.fromEntries(legacyTableNames.map((table) => [table, records[table].length])) as Record<LegacyTableName, number>;
  const recordDigests = {} as Record<LegacyTableName, Record<string, string>>;
  for (const table of legacyTableNames) recordDigests[table] = Object.fromEntries(await Promise.all(records[table].map(async (record) => [idFor(table, record), await sha256Hex(stableCanonicalize(record))])));
  const datasetVersions = [...new Set(records.snapshots.map((item) => item.atomicWeightDataVersion))].sort();
  const manifestDigest = await sha256Hex(stableCanonicalize({ counts, recordDigests, datasetVersions, backupSchemaVersion: BACKUP_SCHEMA_VERSION, databaseVersion: versions.databaseVersion, applicationVersion: versions.applicationVersion }));
  return { counts, recordDigests, datasetVersions, manifestDigest };
}

async function preNotesManifestFor(records: Omit<BackupRecords, "recipeNotes" | "userSettings">, versions: Readonly<{ applicationVersion: string; databaseVersion: number }>): Promise<Readonly<{ counts: Record<PreNotesTableName, number>; recordDigests: Record<PreNotesTableName, Record<string, string>>; datasetVersions: readonly string[]; manifestDigest: string }>> {
  const counts = Object.fromEntries(preNotesTableNames.map((table) => [table, records[table].length])) as Record<PreNotesTableName, number>;
  const recordDigests = {} as Record<PreNotesTableName, Record<string, string>>;
  for (const table of preNotesTableNames) recordDigests[table] = Object.fromEntries(await Promise.all(records[table].map(async (record) => [idFor(table, record), await sha256Hex(stableCanonicalize(record))])));
  const datasetVersions = [...new Set([...records.snapshots.map((item) => `atomic-weights:${item.atomicWeightDataVersion}`), ...records.radiusDatasets.map((item) => `atomic-radii:${item.datasetId}@${item.datasetVersion}`)])].sort();
  const manifestDigest = await sha256Hex(stableCanonicalize({ counts, recordDigests, datasetVersions, backupSchemaVersion: BACKUP_SCHEMA_VERSION, databaseVersion: versions.databaseVersion, applicationVersion: versions.applicationVersion }));
  return { counts, recordDigests, datasetVersions, manifestDigest };
}

async function preSettingsManifestFor(records: Omit<BackupRecords, "userSettings">, versions: Readonly<{ applicationVersion: string; databaseVersion: number }>): Promise<Readonly<{ counts: Record<PreSettingsTableName, number>; recordDigests: Record<PreSettingsTableName, Record<string, string>>; datasetVersions: readonly string[]; manifestDigest: string }>> {
  const counts = Object.fromEntries(preSettingsTableNames.map((table) => [table, records[table].length])) as Record<PreSettingsTableName, number>;
  const recordDigests = {} as Record<PreSettingsTableName, Record<string, string>>;
  for (const table of preSettingsTableNames) recordDigests[table] = Object.fromEntries(await Promise.all(records[table].map(async (record) => [idFor(table, record), await sha256Hex(stableCanonicalize(record))])));
  const datasetVersions = [...new Set([...records.snapshots.map((item) => `atomic-weights:${item.atomicWeightDataVersion}`), ...records.radiusDatasets.map((item) => `atomic-radii:${item.datasetId}@${item.datasetVersion}`)])].sort();
  const manifestDigest = await sha256Hex(stableCanonicalize({ counts, recordDigests, datasetVersions, backupSchemaVersion: BACKUP_SCHEMA_VERSION, databaseVersion: versions.databaseVersion, applicationVersion: versions.applicationVersion }));
  return { counts, recordDigests, datasetVersions, manifestDigest };
}

export async function createLocalBackup(database: MaxStoichDatabase): Promise<MaxStoichBackup> {
  const records = await readRecords(database);
  return { backupSchemaVersion: BACKUP_SCHEMA_VERSION, recordType: "max-stoich-local-backup", applicationVersion: ENGINE_VERSION, databaseVersion: DATABASE_VERSION, createdAt: new Date().toISOString(), records, manifest: await manifestFor(records) };
}

export function serializeBackup(backup: MaxStoichBackup): string { return JSON.stringify(backup, null, 2); }

async function parseBackupText(text: string): Promise<Readonly<{ backup?: MaxStoichBackup; diagnostics: ImportDiagnostic[] }>> {
  const diagnostics: ImportDiagnostic[] = [];
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) return { diagnostics: [{ code: "IMPORT_TOO_LARGE", severity: "error", path: "$", message: `Files may not exceed ${MAX_IMPORT_BYTES} bytes.`, blocking: true }] };
  let value: unknown;
  try { value = JSON.parse(text); } catch { return { diagnostics: [{ code: "INVALID_JSON", severity: "error", path: "$", message: "The file is not valid JSON.", blocking: true }] }; }
  inspectLimits(value, diagnostics);
  if (!value || typeof value !== "object" || (value as Record<string, unknown>).recordType !== "max-stoich-local-backup") diagnostics.push({ code: "UNKNOWN_RECORD_TYPE", severity: "error", path: "$.recordType", message: "Only MAX Stoich backup files are accepted here.", blocking: true });
  let backup = value as MaxStoichBackup;
  if (backup?.backupSchemaVersion !== BACKUP_SCHEMA_VERSION) diagnostics.push({ code: "UNSUPPORTED_BACKUP_VERSION", severity: "error", path: "$.backupSchemaVersion", message: "This backup schema is unsupported or from a future release.", blocking: true });
  if (backup?.databaseVersion > DATABASE_VERSION) diagnostics.push({ code: "UNSUPPORTED_DATABASE_VERSION", severity: "error", path: "$.databaseVersion", message: "This backup requires a newer database version.", blocking: true });
  if (!backup?.records || !backup?.manifest) diagnostics.push({ code: "MISSING_BACKUP_CONTENT", severity: "error", path: "$", message: "Backup records or manifest are missing.", blocking: true });
  if (diagnostics.some((item) => item.blocking)) return { diagnostics };
  const missingRadiusData = !Array.isArray((backup.records as Partial<BackupRecords>).radiusDatasets);
  const missingNotes = !Array.isArray((backup.records as Partial<BackupRecords>).recipeNotes);
  const missingSettings = !Array.isArray((backup.records as Partial<BackupRecords>).userSettings);
  let legacyVerified = false;
  if (missingRadiusData) {
    const legacyRecords = backup.records as unknown as Omit<BackupRecords, "radiusDatasets" | "recipeNotes" | "userSettings">;
    const expected = await legacyManifestFor(legacyRecords, { applicationVersion: backup.applicationVersion, databaseVersion: backup.databaseVersion });
    if (stableCanonicalize(expected.counts) !== stableCanonicalize(backup.manifest.counts) || expected.manifestDigest !== backup.manifest.manifestDigest || stableCanonicalize(expected.recordDigests) !== stableCanonicalize(backup.manifest.recordDigests)) diagnostics.push({ code: "BACKUP_DIGEST_MISMATCH", severity: "error", path: "$.manifest", message: "Legacy backup manifest or record digest verification failed.", blocking: true });
    backup = { ...backup, records: { ...legacyRecords, radiusDatasets: [], recipeNotes: [], userSettings: [createDefaultUserSettings(backup.createdAt)] } };
    legacyVerified = true;
  } else if (missingNotes) {
    const legacyRecords = backup.records as unknown as Omit<BackupRecords, "recipeNotes" | "userSettings">;
    const expected = await preNotesManifestFor(legacyRecords, { applicationVersion: backup.applicationVersion, databaseVersion: backup.databaseVersion });
    if (stableCanonicalize(expected.counts) !== stableCanonicalize(backup.manifest.counts) || expected.manifestDigest !== backup.manifest.manifestDigest || stableCanonicalize(expected.recordDigests) !== stableCanonicalize(backup.manifest.recordDigests)) diagnostics.push({ code: "BACKUP_DIGEST_MISMATCH", severity: "error", path: "$.manifest", message: "Pre-notes backup manifest or record digest verification failed.", blocking: true });
    backup = { ...backup, records: { ...legacyRecords, recipeNotes: [], userSettings: [createDefaultUserSettings(backup.createdAt)] } };
    legacyVerified = true;
  } else if (missingSettings) {
    const legacyRecords = backup.records as unknown as Omit<BackupRecords, "userSettings">;
    const expected = await preSettingsManifestFor(legacyRecords, { applicationVersion: backup.applicationVersion, databaseVersion: backup.databaseVersion });
    if (stableCanonicalize(expected.counts) !== stableCanonicalize(backup.manifest.counts) || expected.manifestDigest !== backup.manifest.manifestDigest || stableCanonicalize(expected.recordDigests) !== stableCanonicalize(backup.manifest.recordDigests)) diagnostics.push({ code: "BACKUP_DIGEST_MISMATCH", severity: "error", path: "$.manifest", message: "Pre-settings backup manifest or record digest verification failed.", blocking: true });
    backup = { ...backup, records: { ...legacyRecords, userSettings: [createDefaultUserSettings(backup.createdAt)] } };
    legacyVerified = true;
  }
  const count = tableNames.reduce((sum, table) => sum + (backup.records[table]?.length ?? 0), 0);
  if (count > MAX_IMPORT_RECORDS) diagnostics.push({ code: "IMPORT_RECORD_LIMIT", severity: "error", path: "$.records", message: `Backups may contain at most ${MAX_IMPORT_RECORDS} records.`, blocking: true });
  if (!hasValidRationals(backup.records) || !hasValidScientificNumbers(backup.records)) diagnostics.push({ code: "INVALID_SCIENTIFIC_VALUE", severity: "error", path: "$.records", message: `Backup contains an invalid rational, decimal, NaN, or infinity value at ${invalidScientificNumberPath(backup.records) ?? "an exact scalar"}.`, blocking: true });
  if (!diagnostics.some((item) => item.blocking)) {
    if (!legacyVerified) {
      const expected = await manifestFor(backup.records, { applicationVersion: backup.applicationVersion, databaseVersion: backup.databaseVersion });
      if (stableCanonicalize(expected.counts) !== stableCanonicalize(backup.manifest.counts) || expected.manifestDigest !== backup.manifest.manifestDigest || stableCanonicalize(expected.recordDigests) !== stableCanonicalize(backup.manifest.recordDigests)) diagnostics.push({ code: "BACKUP_DIGEST_MISMATCH", severity: "error", path: "$.manifest", message: "Backup manifest or record digest verification failed.", blocking: true });
    }
    const revisions = new Set(backup.records.recipeRevisions.map((item) => item.id)); const snapshots = new Set(backup.records.snapshots.map((item) => item.id)); const routeRevisions = new Set(backup.records.routeRevisions.map((item) => item.id));
    for (const item of backup.records.recipes) if (!revisions.has(item.currentRevisionId)) diagnostics.push({ code: "MISSING_REFERENCE", severity: "error", path: `$.records.recipes.${item.id}`, message: "Recipe current revision is missing.", blocking: true });
    for (const item of backup.records.recipeRevisions) if (!snapshots.has(item.snapshotId)) diagnostics.push({ code: "MISSING_REFERENCE", severity: "error", path: `$.records.recipeRevisions.${item.id}`, message: "Recipe snapshot is missing.", blocking: true });
    for (const item of backup.records.routes) if (!routeRevisions.has(item.currentRevisionId)) diagnostics.push({ code: "MISSING_REFERENCE", severity: "error", path: `$.records.routes.${item.id}`, message: "Route current revision is missing.", blocking: true });
    const recipeIds = new Set(backup.records.recipes.map((item) => item.id));
    for (const note of backup.records.recipeNotes) if (!recipeIds.has(note.recipeId) || (note.recipeRevisionId && !revisions.has(note.recipeRevisionId))) diagnostics.push({ code: "MISSING_REFERENCE", severity: "error", path: `$.records.recipeNotes.${note.id}`, message: "Recipe note linkage is incomplete.", blocking: true });
    for (const revision of backup.records.recipeRevisions) {
      if (!parseFormula(revision.inputState.targetFormula).success) diagnostics.push({ code: "FORMULA_COMPOSITION_MISMATCH", severity: "error", path: `$.records.recipeRevisions.${revision.id}.inputState.targetFormula`, message: "Stored target formula is invalid.", blocking: true });
      const canonicalInput = canonicalizeWorkspaceScientificInput(revision.inputState);
      if (canonicalInput !== revision.canonicalScientificInput || await sha256Hex(canonicalInput) !== revision.inputDigest) diagnostics.push({ code: "INPUT_DIGEST_MISMATCH", severity: "error", path: `$.records.recipeRevisions.${revision.id}`, message: "Recipe input canonical form or digest does not match.", blocking: true });
    }
    for (const snapshot of backup.records.snapshots) {
      const [inputDigest, outputDigest] = await Promise.all([sha256Hex(snapshot.canonicalScientificInput), sha256Hex(snapshot.canonicalScientificOutput)]);
      if (inputDigest !== snapshot.inputDigest || outputDigest !== snapshot.outputDigest) diagnostics.push({ code: "SNAPSHOT_DIGEST_MISMATCH", severity: "error", path: `$.records.snapshots.${snapshot.id}`, message: "An immutable snapshot digest is invalid.", blocking: true });
      if (!sameCanonical(snapshot.canonicalScientificOutput, snapshot.result.canonicalScientificRepresentation) || !resultMatchesCanonical(snapshot.result, snapshot.canonicalScientificOutput)) diagnostics.push({ code: "TAMPERED_SNAPSHOT_OUTPUT", severity: "error", path: `$.records.snapshots.${snapshot.id}`, message: "Structured snapshot output differs from its canonical scientific output.", blocking: true });
      if (!snapshot.engineVersion || !snapshot.atomicWeightDataVersion || !snapshot.atomicWeightDataDigest) diagnostics.push({ code: "MISSING_DATASET_METADATA", severity: "error", path: `$.records.snapshots.${snapshot.id}`, message: "Snapshot engine or dataset metadata is missing.", blocking: true });
      if (snapshot.radiusDescriptorConfig?.schemaVersion === "2.0.0" && (!snapshot.radiusDescriptorSchemaVersion || !snapshot.radiusSiteModel || !snapshot.radiusDatasetSelections || !snapshot.radiusDescriptorResults || !snapshot.radiusDisclaimerVersion)) diagnostics.push({ code: "INCOMPLETE_RADIUS_PROVENANCE", severity: "error", path: `$.records.snapshots.${snapshot.id}`, message: "A radius-enabled snapshot is missing immutable per-site datasets, resolved values, descriptors, disclaimer, or explicit-site provenance.", blocking: true });
    }
    for (const record of backup.records.radiusDatasets) {
      const digest = await sha256Hex(stableCanonicalize(canonicalRadiusDatasetContent(record.dataset)));
      const validation = validateAtomicRadiusDataset(record.dataset, digest);
      if (digest !== record.digest || validation.diagnostics.some((item) => item.code === "RADIUS_DATASET_DIGEST_MISMATCH")) diagnostics.push({ code: "RADIUS_DATASET_DIGEST_MISMATCH", severity: "error", path: `$.records.radiusDatasets.${record.id}`, message: "An atomic-radius dataset digest is invalid.", blocking: true });
      if (record.datasetId !== record.dataset.datasetId || record.datasetVersion !== record.dataset.datasetVersion) diagnostics.push({ code: "RADIUS_DATASET_IDENTITY_MISMATCH", severity: "error", path: `$.records.radiusDatasets.${record.id}`, message: "Stored radius-dataset identity does not match its payload.", blocking: true });
    }
    for (const settings of backup.records.userSettings) { try { migrateUserSettings(settings); } catch (error) { diagnostics.push({ code: "INVALID_USER_SETTINGS", severity: "error", path: `$.records.userSettings.${settings.id}`, message: error instanceof Error ? error.message : "User settings are invalid.", blocking: true }); } }
  }
  return { backup, diagnostics };
}

export async function previewBackup(text: string, database?: MaxStoichDatabase): Promise<BackupPreview> {
  const parsed = await parseBackupText(text);
  if (!parsed.backup) return { valid: false, diagnostics: parsed.diagnostics, counts: {}, conflicts: [] };
  const conflicts: RestoreConflict[] = [];
  if (database) for (const table of tableNames) {
    const existing = new Map((await database.table(table).toArray()).map((item) => [idFor(table, item), stableCanonicalize(item)]));
    for (const item of parsed.backup.records[table]) { const id = idFor(table, item); const local = existing.get(id); if (local !== undefined) conflicts.push({ table, id, kind: local === stableCanonicalize(item) ? "identical" : "divergent", proposedAction: local === stableCanonicalize(item) ? "skip" : "resolve" }); }
  }
  return { valid: !parsed.diagnostics.some((item) => item.blocking), diagnostics: parsed.diagnostics, counts: parsed.backup.manifest.counts, conflicts, backup: parsed.backup };
}

function remapConflicts(backup: MaxStoichBackup, conflicts: readonly RestoreConflict[], resolution: ConflictResolution): BackupRecords {
  if (resolution === "keep-local") {
    const skipRecipes = new Set(conflicts.filter((item) => item.kind === "divergent" && item.table === "recipes").map((item) => item.id));
    const skipRoutes = new Set(conflicts.filter((item) => item.kind === "divergent" && item.table === "routes").map((item) => item.id));
    return { ...backup.records, recipes: backup.records.recipes.filter((item) => !skipRecipes.has(item.id)), recipeRevisions: backup.records.recipeRevisions.filter((item) => !skipRecipes.has(item.recipeId)), snapshots: backup.records.snapshots.filter((item) => !skipRecipes.has(item.recipeId)), recipeNotes: backup.records.recipeNotes.filter((item) => !skipRecipes.has(item.recipeId)), routes: backup.records.routes.filter((item) => !skipRoutes.has(item.id)), routeRevisions: backup.records.routeRevisions.filter((item) => !skipRoutes.has(item.routeId)) };
  }
  const divergent = new Set(conflicts.filter((item) => item.kind === "divergent").map((item) => `${item.table}:${item.id}`));
  const remap = new Map<string, string>();
  const divergentRecipeIds = new Set<string>();
  const divergentRouteIds = new Set<string>();
  for (const conflict of conflicts.filter((item) => item.kind === "divergent")) {
    if (conflict.table === "recipes") divergentRecipeIds.add(conflict.id);
    if (conflict.table === "recipeRevisions") { const revision = backup.records.recipeRevisions.find((item) => item.id === conflict.id); if (revision) divergentRecipeIds.add(revision.recipeId); }
    if (conflict.table === "snapshots") { const snapshot = backup.records.snapshots.find((item) => item.id === conflict.id); if (snapshot) divergentRecipeIds.add(snapshot.recipeId); }
    if (conflict.table === "routes") divergentRouteIds.add(conflict.id);
    if (conflict.table === "routeRevisions") { const revision = backup.records.routeRevisions.find((item) => item.id === conflict.id); if (revision) divergentRouteIds.add(revision.routeId); }
  }
  for (const recipeId of divergentRecipeIds) {
    remap.set(`recipes:${recipeId}`, `${recipeId}-imported-${crypto.randomUUID()}`);
    for (const revision of backup.records.recipeRevisions.filter((item) => item.recipeId === recipeId)) { remap.set(`recipeRevisions:${revision.id}`, `${revision.id}-imported-${crypto.randomUUID()}`); remap.set(`snapshots:${revision.snapshotId}`, `${revision.snapshotId}-imported-${crypto.randomUUID()}`); }
    for (const note of backup.records.recipeNotes.filter((item) => item.recipeId === recipeId)) remap.set(`recipeNotes:${note.id}`, `${note.id}-imported-${crypto.randomUUID()}`);
  }
  for (const routeId of divergentRouteIds) { remap.set(`routes:${routeId}`, `${routeId}-imported-${crypto.randomUUID()}`); for (const revision of backup.records.routeRevisions.filter((item) => item.routeId === routeId)) remap.set(`routeRevisions:${revision.id}`, `${revision.id}-imported-${crypto.randomUUID()}`); }
  const mapped = (table: TableName, id: string) => { const key = `${table}:${id}`; if (!divergent.has(key) && !remap.has(key)) return id; if (!remap.has(key)) remap.set(key, `${id}-imported-${crypto.randomUUID()}`); return remap.get(key)!; };
  return {
    ...backup.records,
    recipes: backup.records.recipes.map((item) => ({ ...item, id: mapped("recipes", item.id), currentRevisionId: mapped("recipeRevisions", item.currentRevisionId), name: divergent.has(`recipes:${item.id}`) ? `${item.name} (imported)` : item.name })),
    recipeRevisions: backup.records.recipeRevisions.map((item) => ({ ...item, id: mapped("recipeRevisions", item.id), recipeId: mapped("recipes", item.recipeId), snapshotId: mapped("snapshots", item.snapshotId), ...(item.parentRevisionId ? { parentRevisionId: mapped("recipeRevisions", item.parentRevisionId) } : {}) })),
    snapshots: backup.records.snapshots.map((item) => ({ ...item, id: mapped("snapshots", item.id), recipeId: mapped("recipes", item.recipeId), recipeRevisionId: mapped("recipeRevisions", item.recipeRevisionId) })),
    recipeNotes: backup.records.recipeNotes.map((item) => ({ ...item, id: mapped("recipeNotes", item.id), recipeId: mapped("recipes", item.recipeId), ...(item.recipeRevisionId ? { recipeRevisionId: mapped("recipeRevisions", item.recipeRevisionId) } : {}) })),
    routes: backup.records.routes.map((item) => ({ ...item, id: mapped("routes", item.id), currentRevisionId: mapped("routeRevisions", item.currentRevisionId), name: divergent.has(`routes:${item.id}`) ? `${item.name} (imported)` : item.name })),
    routeRevisions: backup.records.routeRevisions.map((item) => ({ ...item, id: mapped("routeRevisions", item.id), routeId: mapped("routes", item.routeId), ...(item.parentRevisionId ? { parentRevisionId: mapped("routeRevisions", item.parentRevisionId) } : {}) })),
    comparisons: backup.records.comparisons.map((item) => ({ ...item, id: mapped("comparisons", item.id), name: divergent.has(`comparisons:${item.id}`) ? `${item.name} (imported)` : item.name })),
    layouts: backup.records.layouts.map((item) => ({ ...item, id: mapped("layouts", item.id), name: divergent.has(`layouts:${item.id}`) ? `${item.name} (imported)` : item.name })),
    radiusDatasets: backup.records.radiusDatasets.map((item) => { const conflicted = divergent.has(`radiusDatasets:${item.id}`); const datasetId = conflicted ? `${item.datasetId}-imported-${crypto.randomUUID()}` : item.datasetId; return { ...item, id: mapped("radiusDatasets", item.id), datasetId, localTrust: "imported-unverified" as const, dataset: { ...item.dataset, datasetId, approval: { ...item.dataset.approval, status: "unverified-import" as const, sourceVerified: false, labApproval: "not-reviewed" as const, reviewer: undefined, reviewDate: undefined } } }; }),
  };
}

export async function restoreBackup(text: string, database: MaxStoichDatabase, mode: RestoreMode, resolution: ConflictResolution = "keep-local", failAfterTable?: TableName): Promise<Readonly<{ preview: BackupPreview; safetyBackup?: MaxStoichBackup }>> {
  const preview = await previewBackup(text, database);
  if (mode === "preview" || !preview.valid || !preview.backup) return { preview };
  if (preview.conflicts.some((item) => item.kind === "divergent") && !resolution) throw new Error("Divergent conflicts require an explicit resolution.");
  const safetyBackup = await createLocalBackup(database);
  const importedRecords = { ...preview.backup.records, radiusDatasets: preview.backup.records.radiusDatasets.map((item) => ({ ...item, localTrust: "imported-unverified" as const, dataset: { ...item.dataset, approval: { ...item.dataset.approval, status: "unverified-import" as const, sourceVerified: false, labApproval: "not-reviewed" as const, reviewer: undefined, reviewDate: undefined } } })) };
  const records = mode === "merge" ? remapConflicts({ ...preview.backup, records: importedRecords }, preview.conflicts, resolution) : importedRecords;
  const tables = [...tableNames.map((name) => database.table(name)), database.recovery];
  await database.transaction("rw", tables, async () => {
    if (mode === "replace") for (const table of tables) await table.clear();
    for (const name of tableNames) {
      const conflicts = new Set(preview.conflicts.filter((item) => item.table === name && (item.kind === "identical" || resolution === "keep-local")).map((item) => item.id));
      const values = mode === "merge" ? records[name].filter((item) => !conflicts.has(idFor(name, item))) : records[name];
      if (values.length) await database.table(name).bulkPut(values);
      if (failAfterTable === name) throw new Error("Simulated interrupted restore");
    }
    if (mode === "replace") await database.recovery.clear();
  });
  return { preview: await previewBackup(text), safetyBackup };
}

export interface CalculationImportPreview { readonly valid: boolean; readonly diagnostics: readonly ImportDiagnostic[]; readonly recordType?: string; readonly name?: string; readonly targetFormula?: string; readonly engineVersion?: string; readonly datasetVersion?: string; readonly warningCount?: number; readonly input?: WorkspaceRecipeState; readonly result?: BatchCalculationResult }

export async function previewApplicationCalculation(text: string): Promise<CalculationImportPreview> {
  const diagnostics: ImportDiagnostic[] = [];
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) return { valid: false, diagnostics: [{ code: "IMPORT_TOO_LARGE", severity: "error", path: "$", message: "Import exceeds the size limit.", blocking: true }] };
  let value: Record<string, unknown>; try { value = JSON.parse(text) as Record<string, unknown>; } catch { return { valid: false, diagnostics: [{ code: "INVALID_JSON", severity: "error", path: "$", message: "The file is not valid JSON.", blocking: true }] }; }
  inspectLimits(value, diagnostics);
  if (value.recordType !== "max-stoich-laboratory-calculation" || value.exportSchemaVersion !== "1.0.0") diagnostics.push({ code: "UNKNOWN_RECORD_TYPE", severity: "error", path: "$.recordType", message: "Only complete MAX Stoich calculation exports are accepted.", blocking: true });
  const input = value.scientificInput as WorkspaceRecipeState; const result = value.scientificResult as BatchCalculationResult; const snapshot = value.snapshot as { inputDigest?: string; outputDigest?: string } | null; const recipe = value.recipe as { name?: string } | undefined;
  if (!input?.targetFormula || !result?.canonicalScientificRepresentation || !result.engineVersion || !result.dataVersions?.atomicWeights || !snapshot?.inputDigest || !snapshot.outputDigest) diagnostics.push({ code: "INCOMPLETE_CALCULATION_EXPORT", severity: "error", path: "$", message: "A complete saved snapshot, input, engine version, and dataset version are required.", blocking: true });
  if (input?.targetFormula && !parseFormula(input.targetFormula).success) diagnostics.push({ code: "FORMULA_COMPOSITION_MISMATCH", severity: "error", path: "$.scientificInput.targetFormula", message: "Imported target formula is invalid.", blocking: true });
  if (result && (!hasValidRationals(result) || !hasValidScientificNumbers(result))) diagnostics.push({ code: "INVALID_SCIENTIFIC_VALUE", severity: "error", path: "$.scientificResult", message: "Invalid exact rational or numeric value.", blocking: true });
  if (result?.canonicalScientificRepresentation && !resultMatchesCanonical(result, result.canonicalScientificRepresentation)) diagnostics.push({ code: "TAMPERED_SNAPSHOT_OUTPUT", severity: "error", path: "$.scientificResult", message: "Structured result differs from its canonical scientific representation.", blocking: true });
  if (!diagnostics.some((item) => item.blocking)) {
    const [inputDigest, outputDigest] = await Promise.all([sha256Hex(canonicalizeWorkspaceScientificInput(input)), sha256Hex(stableCanonicalize(JSON.parse(result.canonicalScientificRepresentation)))]);
    if (inputDigest !== snapshot!.inputDigest || outputDigest !== snapshot!.outputDigest) diagnostics.push({ code: "IMPORT_DIGEST_MISMATCH", severity: "error", path: "$.snapshot", message: "Scientific input or output digest does not match; the file may be tampered.", blocking: true });
  }
  return { valid: !diagnostics.some((item) => item.blocking), diagnostics, recordType: String(value.recordType ?? ""), name: recipe?.name, targetFormula: input?.targetFormula, engineVersion: result?.engineVersion, datasetVersion: result?.dataVersions?.atomicWeights, warningCount: result?.warnings?.length, input, result };
}

export async function importApplicationCalculation(text: string, repositories: LocalDataRepositories): Promise<void> {
  const preview = await previewApplicationCalculation(text);
  if (!preview.valid || !preview.input || !preview.result) throw new Error(preview.diagnostics[0]?.message ?? "Import validation failed.");
  await repositories.saveCalculatedRevision({ name: preview.name ? `${preview.name} (imported)` : `${preview.targetFormula} imported recipe`, inputState: preview.input, result: preview.result, revisionNote: `Imported historical output from engine ${preview.engineVersion}` });
}

export type OwnedRecordType = "max-stoich-saved-recipe" | "max-stoich-saved-route" | "max-stoich-comparison-workspace";
export interface OwnedRecordExport {
  readonly exportSchemaVersion: "1.0.0";
  readonly recordType: OwnedRecordType;
  readonly createdAt: string;
  readonly payload: unknown;
  readonly payloadDigest: string;
}
export interface OwnedRecordImportPreview {
  readonly valid: boolean;
  readonly diagnostics: readonly ImportDiagnostic[];
  readonly recordType?: OwnedRecordType;
  readonly name?: string;
  readonly targetFormula?: string;
  readonly revision?: number;
  readonly engineVersion?: string;
  readonly datasetVersion?: string;
  readonly validationStatus?: string;
  readonly warningCount?: number;
  readonly conflictStatus: "none" | "identical" | "divergent" | "not-checked";
  readonly proposedAction: "import-new" | "skip" | "resolve" | "blocked";
  readonly envelope?: OwnedRecordExport;
}

export async function createOwnedRecordExport(recordType: OwnedRecordType, payload: unknown): Promise<OwnedRecordExport> {
  return { exportSchemaVersion: "1.0.0", recordType, createdAt: new Date().toISOString(), payload, payloadDigest: await sha256Hex(stableCanonicalize(payload)) };
}

export async function previewOwnedRecord(text: string, database?: MaxStoichDatabase): Promise<OwnedRecordImportPreview> {
  const diagnostics: ImportDiagnostic[] = [];
  if (new TextEncoder().encode(text).byteLength > MAX_IMPORT_BYTES) return { valid: false, diagnostics: [{ code: "IMPORT_TOO_LARGE", severity: "error", path: "$", message: "Import exceeds the size limit.", blocking: true }], conflictStatus: "not-checked", proposedAction: "blocked" };
  let envelope: OwnedRecordExport;
  try { envelope = JSON.parse(text) as OwnedRecordExport; } catch { return { valid: false, diagnostics: [{ code: "INVALID_JSON", severity: "error", path: "$", message: "The file is not valid JSON.", blocking: true }], conflictStatus: "not-checked", proposedAction: "blocked" }; }
  inspectLimits(envelope, diagnostics);
  const supported: readonly OwnedRecordType[] = ["max-stoich-saved-recipe", "max-stoich-saved-route", "max-stoich-comparison-workspace"];
  if (!supported.includes(envelope.recordType) || envelope.exportSchemaVersion !== "1.0.0") diagnostics.push({ code: "UNKNOWN_RECORD_TYPE", severity: "error", path: "$.recordType", message: "The file is not a supported MAX Stoich recipe, route, or comparison export.", blocking: true });
  if (!envelope.payload || !envelope.payloadDigest) diagnostics.push({ code: "INCOMPLETE_RECORD_EXPORT", severity: "error", path: "$", message: "The application record or its digest is missing.", blocking: true });
  if (!hasValidRationals(envelope.payload) || !hasValidScientificNumbers(envelope.payload)) diagnostics.push({ code: "INVALID_SCIENTIFIC_VALUE", severity: "error", path: "$.payload", message: "Invalid exact rational or numeric value.", blocking: true });
  if (!diagnostics.some((item) => item.blocking) && await sha256Hex(stableCanonicalize(envelope.payload)) !== envelope.payloadDigest) diagnostics.push({ code: "IMPORT_DIGEST_MISMATCH", severity: "error", path: "$.payloadDigest", message: "The record digest does not match; the file may be tampered.", blocking: true });
  const payload = envelope.payload as Record<string, unknown>;
  const recipe = payload.recipe as SavedRecipe | undefined; const route = payload.route as SavedRoute | undefined; const comparison = payload.comparison as ComparisonWorkspace | undefined;
  const revisions = payload.revisions as readonly RecipeRevision[] | undefined; const snapshots = payload.snapshots as readonly CalculationSnapshot[] | undefined; const routeRevisions = payload.revisions as readonly RouteRevision[] | undefined;
  if (envelope.recordType === "max-stoich-saved-recipe" && (!recipe || !revisions?.length || !snapshots?.length || !revisions.some((item) => item.id === recipe.currentRevisionId))) diagnostics.push({ code: "MISSING_REFERENCE", severity: "error", path: "$.payload", message: "Recipe export must include its revisions and immutable snapshots.", blocking: true });
  if (envelope.recordType === "max-stoich-saved-route" && (!route || !routeRevisions?.length || !routeRevisions.some((item) => item.id === route.currentRevisionId))) diagnostics.push({ code: "MISSING_REFERENCE", severity: "error", path: "$.payload", message: "Route export must include its revisions.", blocking: true });
  if (envelope.recordType === "max-stoich-comparison-workspace" && (!comparison || comparison.scenarios?.length < 2 || comparison.scenarios?.length > 4)) diagnostics.push({ code: "INVALID_COMPARISON", severity: "error", path: "$.payload.comparison", message: "Comparison exports require two to four scenarios sharing one target.", blocking: true });
  for (const item of snapshots ?? []) {
    if (!item.engineVersion || !item.atomicWeightDataVersion || !item.atomicWeightDataDigest) diagnostics.push({ code: "MISSING_DATASET_METADATA", severity: "error", path: `$.payload.snapshots.${item.id}`, message: "Snapshot engine or dataset metadata is missing.", blocking: true });
    if (!sameCanonical(item.canonicalScientificOutput, item.result.canonicalScientificRepresentation) || !resultMatchesCanonical(item.result, item.canonicalScientificOutput)) diagnostics.push({ code: "TAMPERED_SNAPSHOT_OUTPUT", severity: "error", path: `$.payload.snapshots.${item.id}`, message: "Structured snapshot output differs from its canonical output.", blocking: true });
  }
  const identity = recipe?.id ?? route?.id ?? comparison?.id; const table = recipe ? database?.recipes : route ? database?.routes : comparison ? database?.comparisons : undefined; const local = identity && table ? await table.get(identity) : undefined;
  const conflictStatus = !database ? "not-checked" : !local ? "none" : stableCanonicalize(local) === stableCanonicalize(recipe ?? route ?? comparison) ? "identical" : "divergent";
  const valid = !diagnostics.some((item) => item.blocking);
  const latestSnapshot = snapshots?.find((item) => item.id === revisions?.find((item) => item.id === recipe?.currentRevisionId)?.snapshotId);
  return { valid, diagnostics, recordType: envelope.recordType, name: recipe?.name ?? route?.name ?? comparison?.name, targetFormula: recipe?.targetFormula ?? comparison?.sharedTarget.targetFormula, revision: recipe?.currentRevisionNumber ?? route?.currentRevisionNumber, engineVersion: latestSnapshot?.engineVersion ?? comparison?.scenarios.find((item) => item.historical)?.historical?.engineVersion, datasetVersion: latestSnapshot?.atomicWeightDataVersion ?? comparison?.scenarios.find((item) => item.historical)?.historical?.atomicWeightDataVersion, validationStatus: recipe?.validationStatus ?? route?.validationStatus ?? comparison?.validationStatus, warningCount: latestSnapshot?.result.warnings.length, conflictStatus, proposedAction: valid ? conflictStatus === "identical" ? "skip" : conflictStatus === "divergent" ? "resolve" : "import-new" : "blocked", envelope };
}

export async function importOwnedRecord(text: string, repositories: LocalDataRepositories): Promise<void> {
  const preview = await previewOwnedRecord(text, repositories.database);
  if (!preview.valid || !preview.envelope) throw new Error(preview.diagnostics[0]?.message ?? "Import validation failed.");
  const payload = preview.envelope.payload as { recipe?: SavedRecipe; route?: SavedRoute; comparison?: ComparisonWorkspace; revisions?: readonly (RecipeRevision | RouteRevision)[]; snapshots?: readonly CalculationSnapshot[] };
  const suffix = crypto.randomUUID();
  if (payload.recipe) {
    const recipeId = `${payload.recipe.id}-imported-${suffix}`; const revisionMap = new Map((payload.revisions as readonly RecipeRevision[]).map((item) => [item.id, `${item.id}-imported-${suffix}`])); const snapshotMap = new Map((payload.snapshots ?? []).map((item) => [item.id, `${item.id}-imported-${suffix}`]));
    const recipe = { ...payload.recipe, id: recipeId, name: `${payload.recipe.name} (imported)`, currentRevisionId: revisionMap.get(payload.recipe.currentRevisionId)! };
    const revisions = (payload.revisions as readonly RecipeRevision[]).map((item) => ({ ...item, id: revisionMap.get(item.id)!, recipeId, snapshotId: snapshotMap.get(item.snapshotId)!, ...(item.parentRevisionId ? { parentRevisionId: revisionMap.get(item.parentRevisionId) } : {}) }));
    const snapshots = (payload.snapshots ?? []).map((item) => ({ ...item, id: snapshotMap.get(item.id)!, recipeId, recipeRevisionId: revisionMap.get(item.recipeRevisionId)! }));
    await repositories.database.transaction("rw", [repositories.database.recipes, repositories.database.recipeRevisions, repositories.database.snapshots], async () => { await repositories.database.recipes.add(recipe); await repositories.database.recipeRevisions.bulkAdd(revisions); await repositories.database.snapshots.bulkAdd(snapshots); });
  } else if (payload.route) {
    const routeId = `${payload.route.id}-imported-${suffix}`; const revisionMap = new Map((payload.revisions as readonly RouteRevision[]).map((item) => [item.id, `${item.id}-imported-${suffix}`])); const route = { ...payload.route, id: routeId, name: `${payload.route.name} (imported)`, currentRevisionId: revisionMap.get(payload.route.currentRevisionId)! }; const revisions = (payload.revisions as readonly RouteRevision[]).map((item) => ({ ...item, id: revisionMap.get(item.id)!, routeId, ...(item.parentRevisionId ? { parentRevisionId: revisionMap.get(item.parentRevisionId) } : {}) })); await repositories.database.transaction("rw", [repositories.database.routes, repositories.database.routeRevisions], async () => { await repositories.database.routes.add(route); await repositories.database.routeRevisions.bulkAdd(revisions); });
  } else if (payload.comparison) await repositories.saveComparison({ ...payload.comparison, id: `${payload.comparison.id}-imported-${suffix}`, name: `${payload.comparison.name} (imported)`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
}
