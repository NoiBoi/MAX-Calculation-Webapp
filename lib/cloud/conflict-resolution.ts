import type { LocalDataRepositories } from "../persistence/repositories";
import { LOCAL_SCHEMA_VERSION, type CalculationSnapshot, type RecipeRevision, type SavedRecipe } from "../persistence/entities";
import type { CloudComparison, CloudRecipe, CloudRecipeNote, CloudRecipeRevision, CloudUserSettings, LocalSyncConflict } from "./sync-types";

export type ConflictResolutionChoice = "keep-local" | "keep-cloud" | "keep-both";

const object = (value: unknown): Record<string, unknown> | undefined => value && typeof value === "object" ? value as Record<string, unknown> : undefined;
const cloudVersion = (value: unknown): number | undefined => typeof object(value)?.version === "number" ? object(value)!.version as number : undefined;
const cloudId = (value: unknown): string | undefined => typeof object(value)?.cloudId === "string" ? object(value)!.cloudId as string : undefined;
const cloudUpdatedAt = (value: unknown): string | undefined => {
  const record = object(value);
  if (typeof record?.updatedAt === "string") return record.updatedAt;
  const nested = object(record?.note) ?? object(record?.comparison) ?? object(record?.settings);
  return typeof nested?.updatedAt === "string" ? nested.updatedAt : undefined;
};

async function markKeepLocal(repositories: LocalDataRepositories, conflict: LocalSyncConflict): Promise<void> {
  const metadata = await repositories.sync!.ensureMetadata(conflict.recordType, conflict.recordId);
  await repositories.database.cloudSyncRecords.put({
    ...metadata,
    ...(cloudId(conflict.cloudValue) ? { cloudId: cloudId(conflict.cloudValue)! } : {}),
    ...(cloudVersion(conflict.cloudValue) !== undefined ? { cloudVersion: cloudVersion(conflict.cloudValue) } : {}),
    ...(cloudUpdatedAt(conflict.cloudValue) ? { lastCloudUpdatedAt: cloudUpdatedAt(conflict.cloudValue) } : {}),
    cloudState: "pending-upload",
    syncError: undefined,
  });
  await repositories.sync!.removeOutbox(conflict.recordType, conflict.recordId);
  await repositories.sync!.markPending(conflict.recordType, conflict.recordId);
}

async function applyCloudValue(repositories: LocalDataRepositories, conflict: LocalSyncConflict): Promise<void> {
  if (conflict.recordType === "recipe") {
    const cloud = conflict.cloudValue as CloudRecipe;
    if (!cloud.cloudId || !cloud.currentRevisionId) throw new Error("The current cloud recipe value is unavailable. Run Sync now and reopen this conflict.");
    const revision = await repositories.database.recipeRevisions.get(cloud.currentRevisionId);
    if (!revision) throw new Error("The cloud recipe revision is unavailable on this device.");
    const local: SavedRecipe = {
      schemaVersion: LOCAL_SCHEMA_VERSION,
      id: cloud.id,
      name: cloud.name,
      targetFormula: cloud.targetFormula,
      description: cloud.description,
      tags: [...cloud.tags],
      currentRevisionId: cloud.currentRevisionId,
      currentRevisionNumber: revision.revisionNumber,
      archived: Boolean(cloud.archivedAt || cloud.deletedAt),
      createdAt: cloud.createdAt,
      updatedAt: cloud.updatedAt,
      validationStatus: "synthetic",
    };
    await repositories.database.recipes.put(local);
    await repositories.sync!.markSynced("recipe", cloud.id, { cloudId: cloud.cloudId, cloudVersion: cloud.version, cloudUpdatedAt: cloud.updatedAt, localUpdatedAt: local.updatedAt, sourceDeviceId: cloud.sourceDeviceId });
  } else if (conflict.recordType === "recipe-note") {
    const cloud = conflict.cloudValue as CloudRecipeNote;
    if (!cloud.cloudId || !cloud.note) throw new Error("The current cloud note value is unavailable. Run Sync now and reopen this conflict.");
    if (cloud.deletedAt) await repositories.database.recipeNotes.delete(cloud.id);
    else await repositories.database.recipeNotes.put(structuredClone(cloud.note));
    await repositories.sync!.markSynced("recipe-note", cloud.id, { cloudId: cloud.cloudId, cloudVersion: cloud.version, cloudUpdatedAt: cloud.note.updatedAt, localUpdatedAt: cloud.note.updatedAt, sourceDeviceId: cloud.sourceDeviceId });
  } else if (conflict.recordType === "comparison") {
    const cloud = conflict.cloudValue as CloudComparison;
    if (!cloud.cloudId || !cloud.comparison) throw new Error("The current cloud comparison value is unavailable. Run Sync now and reopen this conflict.");
    if (cloud.deletedAt) await repositories.database.comparisons.delete(cloud.id);
    else await repositories.database.comparisons.put(structuredClone(cloud.comparison));
    await repositories.sync!.markSynced("comparison", cloud.id, { cloudId: cloud.cloudId, cloudVersion: cloud.version, cloudUpdatedAt: cloud.comparison.updatedAt, localUpdatedAt: cloud.comparison.updatedAt, sourceDeviceId: cloud.sourceDeviceId });
  } else if (conflict.recordType === "user-settings") {
    const cloud = conflict.cloudValue as CloudUserSettings;
    if (!cloud.settings) throw new Error("The current cloud settings value is unavailable. Run Sync now and reopen this conflict.");
    await repositories.database.userSettings.put(structuredClone(cloud.settings));
    await repositories.sync!.markSynced("user-settings", "local-user-settings", { cloudVersion: cloud.version, cloudUpdatedAt: cloud.settings.updatedAt, localUpdatedAt: cloud.settings.updatedAt, sourceDeviceId: cloud.sourceDeviceId });
  } else {
    throw new Error("Scientific revision conflicts require the dedicated keep-both resolution.");
  }
}

async function duplicateRecipe(repositories: LocalDataRepositories, conflict: LocalSyncConflict): Promise<void> {
  const local = conflict.localValue as SavedRecipe;
  const revisions = await repositories.database.recipeRevisions.where("recipeId").equals(local.id).sortBy("revisionNumber");
  const snapshots = await repositories.database.snapshots.where("recipeId").equals(local.id).toArray();
  const notes = await repositories.database.recipeNotes.where("recipeId").equals(local.id).toArray();
  const recipeId = `recipe-${crypto.randomUUID()}`;
  const revisionIds = new Map(revisions.map((item) => [item.id, `revision-${crypto.randomUUID()}`]));
  const snapshotIds = new Map(snapshots.map((item) => [item.id, `snapshot-${crypto.randomUUID()}`]));
  const recipe: SavedRecipe = { ...local, id: recipeId, name: `${local.name} (this device)`, currentRevisionId: revisionIds.get(local.currentRevisionId)!, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const copiedRevisions = revisions.map((item): RecipeRevision => ({ ...item, id: revisionIds.get(item.id)!, recipeId, snapshotId: snapshotIds.get(item.snapshotId)!, ...(item.parentRevisionId ? { parentRevisionId: revisionIds.get(item.parentRevisionId) } : { parentRevisionId: undefined }) }));
  const copiedSnapshots = snapshots.map((item): CalculationSnapshot => ({ ...item, id: snapshotIds.get(item.id)!, recipeId, recipeRevisionId: revisionIds.get(item.recipeRevisionId)! }));
  const copiedNotes = notes.map((item) => ({ ...item, id: `note-${crypto.randomUUID()}`, recipeId, ...(item.recipeRevisionId ? { recipeRevisionId: revisionIds.get(item.recipeRevisionId) } : {}) }));
  await repositories.database.transaction("rw", [repositories.database.recipes, repositories.database.recipeRevisions, repositories.database.snapshots, repositories.database.recipeNotes, repositories.database.cloudSyncRecords, repositories.database.cloudSyncOutbox], async () => {
    await repositories.database.recipes.add(recipe);
    await repositories.database.recipeRevisions.bulkAdd(copiedRevisions);
    await repositories.database.snapshots.bulkAdd(copiedSnapshots);
    await repositories.database.recipeNotes.bulkAdd(copiedNotes);
    await repositories.sync!.markPending("recipe", recipe.id);
    for (const revision of copiedRevisions) await repositories.sync!.markPending("recipe-revision", revision.id);
    for (const note of copiedNotes) await repositories.sync!.markPending("recipe-note", note.id);
  });
}

async function keepBothScientific(repositories: LocalDataRepositories, conflict: LocalSyncConflict): Promise<void> {
  const localEnvelope = conflict.localValue as { revision?: RecipeRevision; snapshot?: CalculationSnapshot };
  const cloud = conflict.cloudValue as CloudRecipeRevision;
  const localRevision = localEnvelope.revision;
  const localSnapshot = localEnvelope.snapshot;
  if (!localRevision || !localSnapshot || !cloud.scientificInput || !cloud.calculationSnapshot) throw new Error("Both immutable revision copies are not available.");
  const recipe = await repositories.database.recipes.get(localRevision.recipeId);
  if (!recipe) throw new Error("The linked recipe is unavailable.");
  const existingRevisions = await repositories.database.recipeRevisions.where("recipeId").equals(recipe.id).toArray();
  const movedRevisionId = `revision-${crypto.randomUUID()}`;
  const movedSnapshotId = `snapshot-${crypto.randomUUID()}`;
  const movedRevisionNumber = Math.max(...existingRevisions.map((item) => item.revisionNumber), 0) + 1;
  const movedRevision: RecipeRevision = { ...localRevision, id: movedRevisionId, revisionNumber: movedRevisionNumber, snapshotId: movedSnapshotId, parentRevisionId: localRevision.parentRevisionId };
  const movedSnapshot: CalculationSnapshot = { ...localSnapshot, id: movedSnapshotId, recipeRevisionId: movedRevisionId };
  await repositories.database.transaction("rw", [repositories.database.recipes, repositories.database.recipeRevisions, repositories.database.snapshots, repositories.database.recipeNotes, repositories.database.cloudSyncRecords, repositories.database.cloudSyncOutbox], async () => {
    await repositories.database.recipeRevisions.delete(localRevision.id);
    await repositories.database.snapshots.delete(localSnapshot.id);
    await repositories.database.recipeRevisions.add(movedRevision);
    await repositories.database.snapshots.add(movedSnapshot);
    await repositories.database.recipeNotes.where("recipeRevisionId").equals(localRevision.id).modify({ recipeRevisionId: movedRevisionId });
    if (recipe.currentRevisionId === localRevision.id) await repositories.database.recipes.put({ ...recipe, currentRevisionId: movedRevisionId, currentRevisionNumber: movedRevisionNumber, updatedAt: new Date().toISOString() });
    await repositories.database.recipeRevisions.add(structuredClone(cloud.scientificInput));
    await repositories.database.snapshots.add(structuredClone(cloud.calculationSnapshot));
    const oldMetadata = await repositories.sync!.getMetadata("recipe-revision", localRevision.id);
    if (oldMetadata) await repositories.database.cloudSyncRecords.delete(oldMetadata.id);
    await repositories.sync!.markPending("recipe-revision", movedRevisionId);
    await repositories.sync!.markPending("recipe", recipe.id);
    await repositories.sync!.markSynced("recipe-revision", cloud.id, { cloudId: cloud.cloudId, contentDigest: cloud.contentDigest, localUpdatedAt: cloud.createdAt, sourceDeviceId: cloud.sourceDeviceId });
  });
}

export async function resolveSyncConflict(repositories: LocalDataRepositories, conflictId: string, choice: ConflictResolutionChoice): Promise<void> {
  if (!repositories.sync) throw new Error("Cloud sync is unavailable for anonymous local data.");
  const conflict = await repositories.database.cloudConflicts.get(conflictId);
  if (!conflict || conflict.ownerId !== repositories.ownerId || conflict.status !== "open") throw new Error("The sync conflict is unavailable.");
  if (conflict.kind === "scientific-integrity") {
    if (choice !== "keep-both") throw new Error("Scientific conflicts cannot discard either copy. Export both or keep both as separate revisions.");
    await keepBothScientific(repositories, conflict);
  } else if (choice === "keep-local") {
    await markKeepLocal(repositories, conflict);
  } else if (choice === "keep-cloud") {
    await applyCloudValue(repositories, conflict);
  } else if (conflict.recordType === "recipe") {
    await duplicateRecipe(repositories, conflict);
    await applyCloudValue(repositories, conflict);
  } else if (conflict.recordType === "recipe-note") {
    const local = conflict.localValue as CloudRecipeNote["note"];
    const copy = { ...local, id: `note-${crypto.randomUUID()}`, title: `${local.title} (this device)`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await repositories.database.recipeNotes.add(copy);
    await repositories.sync.markPending("recipe-note", copy.id);
    await applyCloudValue(repositories, conflict);
  } else if (conflict.recordType === "comparison") {
    const local = conflict.localValue as CloudComparison["comparison"];
    const copy = { ...local, id: `comparison-${crypto.randomUUID()}`, name: `${local.name} (this device)`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await repositories.database.comparisons.add(copy);
    await repositories.sync.markPending("comparison", copy.id);
    await applyCloudValue(repositories, conflict);
  } else {
    throw new Error("Settings conflicts support Use this device or Use cloud.");
  }
  await repositories.sync.resolveConflict(conflictId);
}
