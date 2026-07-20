import { parseFormula } from "@max-stoich/chemistry-engine";
import type { LocalDataRepositories } from "../persistence/repositories";
import { LOCAL_SCHEMA_VERSION, type SavedRecipe } from "../persistence/entities";
import { createDefaultUserSettings, stableSettingsPayload } from "../settings/user-settings";
import { writeAppearanceBootstrap } from "../theme/theme";
import { CloudRepositoryError, type CloudSyncRepository } from "./cloud-repositories";
import type {
  CloudChangeSet,
  CloudRecipe,
  CloudUserSettings,
  CloudWriteOperation,
  SyncCounts,
  SyncSummary,
} from "./sync-types";
import { emptySyncCounts } from "./sync-types";
import { CloudPayloadValidationError, differingFields, validateCloudTimestamps, validateComparisonForCloud, validateRecipeNoteForCloud, validateRevisionAndSnapshot, validateSettingsForCloud } from "./validation";

export interface ManualSyncOptions {
  readonly repositories: LocalDataRepositories;
  readonly cloud: CloudSyncRepository;
  readonly installationId: string;
  readonly deviceName?: string;
  readonly online?: boolean;
  readonly now?: () => string;
  /** Automatic coordinator passes exclude retry-wait operations whose due time has not arrived. */
  readonly respectOutboxSchedule?: boolean;
}

const increment = (counts: SyncCounts, key: keyof SyncCounts, amount = 1): void => { (counts as Record<keyof SyncCounts, number>)[key] += amount; };
const localUpdatedAt = (value: unknown): string | undefined => value && typeof value === "object" && "updatedAt" in value && typeof value.updatedAt === "string" ? value.updatedAt : undefined;
const clone = <T>(value: T): T => structuredClone(value);
const recipeMatchesCloud = (local: SavedRecipe, cloud: CloudRecipe): boolean => local.name === cloud.name && local.targetFormula === cloud.targetFormula && local.description === cloud.description && JSON.stringify(local.tags) === JSON.stringify(cloud.tags) && local.currentRevisionId === cloud.currentRevisionId && local.archived === Boolean(cloud.archivedAt || cloud.deletedAt);
const classifySyncError = (error: unknown): Readonly<{ errorCategory: SyncSummary["errorCategory"]; retryable: boolean }> => {
  if (error instanceof CloudRepositoryError) {
    if (error.status === 401) return { errorCategory: "auth-required", retryable: false };
    if (error.status === 403) return { errorCategory: "authorization", retryable: false };
    if (error.status === 429) return { errorCategory: "rate-limit", retryable: true };
    if (error.status >= 500) return { errorCategory: "server", retryable: true };
    return { errorCategory: "validation", retryable: error.retryable };
  }
  return { errorCategory: "network", retryable: true };
};

function emptySummary(startedAt: string, completedAt = startedAt): SyncSummary {
  return {
    status: "complete",
    startedAt,
    completedAt,
    uploaded: emptySyncCounts(),
    downloaded: emptySyncCounts(),
    conflicts: 0,
    quarantined: 0,
    errors: [],
    phases: { session: "skipped", pull: "skipped", merge: "skipped", upload: "skipped", device: "skipped", finalize: "skipped" },
  };
}

function withPhase(summary: SyncSummary, phase: keyof SyncSummary["phases"], state: SyncSummary["phases"][typeof phase]): SyncSummary {
  return { ...summary, phases: { ...summary.phases, [phase]: state } };
}

async function quarantine(repositories: LocalDataRepositories, recordType: Parameters<NonNullable<LocalDataRepositories["sync"]>["quarantine"]>[0]["recordType"], record: Readonly<{ cloudId?: string; id?: string; schemaVersion?: string }>, error: unknown): Promise<void> {
  const sync = repositories.sync!;
  const validation = error instanceof CloudPayloadValidationError ? error : new CloudPayloadValidationError("MALFORMED_CLOUD_RECORD", "The cloud record is malformed.");
  await sync.quarantine({ recordType, ...(record.cloudId ? { cloudId: record.cloudId } : {}), ...(record.id ? { recordId: record.id } : {}), code: validation.code, message: validation.message, ...(record.schemaVersion ? { schemaVersion: record.schemaVersion } : {}) });
}

async function conflictFor(
  repositories: LocalDataRepositories,
  recordType: "recipe" | "recipe-revision" | "recipe-note" | "comparison" | "user-settings",
  recordId: string,
  kind: "recipe-metadata" | "note-content" | "comparison-content" | "settings" | "scientific-integrity" | "delete",
  name: string,
  localValue: unknown,
  cloudValue: unknown,
  cloudUpdatedAt?: string,
  sourceDeviceId?: string,
): Promise<void> {
  if (process.env.NODE_ENV !== "production") console.info("[cloud-sync]", { event: "conflict_detected", recordType, kind });
  await repositories.sync!.addConflict({
    recordType,
    recordId,
    kind,
    recordName: name,
    localUpdatedAt: localUpdatedAt(localValue),
    ...(cloudUpdatedAt ? { cloudUpdatedAt } : {}),
    ...(sourceDeviceId ? { sourceDeviceId } : {}),
    localValue: clone(localValue),
    cloudValue: clone(cloudValue),
    fields: differingFields(localValue, cloudValue),
  });
}

function savedRecipeFromCloud(cloud: CloudRecipe, revisionNumber: number): SavedRecipe {
  return {
    schemaVersion: LOCAL_SCHEMA_VERSION,
    id: cloud.id,
    name: cloud.name,
    targetFormula: cloud.targetFormula,
    description: cloud.description,
    tags: [...cloud.tags],
    currentRevisionId: cloud.currentRevisionId,
    currentRevisionNumber: revisionNumber,
    archived: Boolean(cloud.archivedAt || cloud.deletedAt),
    createdAt: cloud.createdAt,
    updatedAt: cloud.updatedAt,
    validationStatus: "synthetic",
  };
}

async function mergeRevisions(changeSet: CloudChangeSet, repositories: LocalDataRepositories, downloaded: SyncCounts): Promise<Readonly<{ conflicts: number; quarantined: number }>> {
  let conflicts = 0;
  let quarantined = 0;
  for (const cloud of changeSet.revisions) {
    try {
      if (cloud.ownerId !== repositories.ownerId || !cloud.id || !cloud.recipeId) throw new CloudPayloadValidationError("OWNER_OR_LINK_MISMATCH", "The revision owner or recipe link is invalid.", cloud.id);
      await validateRevisionAndSnapshot(cloud.scientificInput, cloud.calculationSnapshot);
      const existing = await repositories.database.recipeRevisions.get(cloud.id);
      if (existing) {
        const snapshot = await repositories.database.snapshots.get(existing.snapshotId);
        if (existing.inputDigest !== cloud.contentDigest || existing.canonicalScientificInput !== cloud.scientificInput.canonicalScientificInput || snapshot?.outputDigest !== cloud.calculationSnapshot.outputDigest) {
          await conflictFor(repositories, "recipe-revision", cloud.id, "scientific-integrity", `Revision ${cloud.revisionNumber}`, { revision: existing, snapshot }, cloud, undefined, cloud.sourceDeviceId);
          conflicts += 1;
          continue;
        }
      } else {
        await repositories.database.transaction("rw", repositories.database.recipeRevisions, repositories.database.snapshots, async () => {
          await repositories.database.recipeRevisions.add(clone(cloud.scientificInput));
          await repositories.database.snapshots.add(clone(cloud.calculationSnapshot));
        });
        increment(downloaded, "revisions");
      }
      await repositories.sync!.markSynced("recipe-revision", cloud.id, { cloudId: cloud.cloudId, contentDigest: cloud.contentDigest, localUpdatedAt: cloud.createdAt, sourceDeviceId: cloud.sourceDeviceId });
    } catch (error) {
      await quarantine(repositories, "recipe-revision", cloud, error);
      quarantined += 1;
    }
  }
  return { conflicts, quarantined };
}

async function mergeRecipes(changeSet: CloudChangeSet, repositories: LocalDataRepositories, downloaded: SyncCounts): Promise<Readonly<{ conflicts: number; quarantined: number }>> {
  let conflicts = 0;
  let quarantined = 0;
  for (const cloud of changeSet.recipes) {
    try {
      if (cloud.ownerId !== repositories.ownerId || !cloud.id || !cloud.currentRevisionId || !parseFormula(cloud.targetFormula).success) throw new CloudPayloadValidationError("INVALID_CLOUD_RECIPE", "The cloud recipe owner, identity, revision pointer, or formula is invalid.", cloud.id);
      validateCloudTimestamps(cloud.createdAt, cloud.updatedAt);
      const currentRevision = await repositories.database.recipeRevisions.get(cloud.currentRevisionId);
      if (!currentRevision || currentRevision.recipeId !== cloud.id) throw new CloudPayloadValidationError("INCOMPLETE_CLOUD_BUNDLE", "The recipe's current immutable revision was not downloaded safely.", cloud.id);
      const incoming = savedRecipeFromCloud(cloud, currentRevision.revisionNumber);
      const local = await repositories.database.recipes.get(cloud.id);
      const metadata = await repositories.sync!.getMetadata("recipe", cloud.id);
      if (!local) {
        await repositories.database.recipes.add(incoming);
        increment(downloaded, "recipes");
      } else if (metadata?.cloudState === "pending-upload" || metadata?.cloudState === "pending-delete") {
        if (recipeMatchesCloud(local, cloud)) {
          await repositories.sync!.markSynced("recipe", cloud.id, { cloudId: cloud.cloudId, cloudVersion: cloud.version, cloudUpdatedAt: cloud.updatedAt, localUpdatedAt: incoming.updatedAt, sourceDeviceId: cloud.sourceDeviceId });
          continue;
        }
        if (metadata.cloudVersion === undefined || cloud.version > metadata.cloudVersion) {
          await conflictFor(repositories, "recipe", cloud.id, cloud.deletedAt ? "delete" : "recipe-metadata", local.name, local, cloud, cloud.updatedAt, cloud.sourceDeviceId);
          conflicts += 1;
        }
        continue;
      } else if (!metadata && JSON.stringify(local) !== JSON.stringify(incoming)) {
        await conflictFor(repositories, "recipe", cloud.id, "recipe-metadata", local.name, local, cloud, cloud.updatedAt, cloud.sourceDeviceId);
        conflicts += 1;
        continue;
      } else {
        await repositories.database.recipes.put(incoming);
        if (JSON.stringify(local) !== JSON.stringify(incoming)) increment(downloaded, "recipes");
      }
      await repositories.sync!.markSynced("recipe", cloud.id, { cloudId: cloud.cloudId, cloudVersion: cloud.version, cloudUpdatedAt: cloud.updatedAt, localUpdatedAt: incoming.updatedAt, sourceDeviceId: cloud.sourceDeviceId });
    } catch (error) {
      await quarantine(repositories, "recipe", cloud, error);
      quarantined += 1;
    }
  }
  return { conflicts, quarantined };
}

async function mergeNotes(changeSet: CloudChangeSet, repositories: LocalDataRepositories, downloaded: SyncCounts): Promise<Readonly<{ conflicts: number; quarantined: number }>> {
  let conflicts = 0;
  let quarantined = 0;
  for (const cloud of changeSet.notes) {
    try {
      if (cloud.ownerId !== repositories.ownerId || cloud.note.id !== cloud.id || cloud.note.recipeId !== cloud.recipeId) throw new CloudPayloadValidationError("INVALID_NOTE_OWNER_OR_LINK", "The cloud note owner or local linkage is invalid.", cloud.id);
      validateRecipeNoteForCloud(cloud.note);
      const recipe = await repositories.database.recipes.get(cloud.recipeId);
      if (!recipe) throw new CloudPayloadValidationError("MISSING_NOTE_RECIPE", "The note's recipe is unavailable.", cloud.id);
      if (cloud.revisionId && !await repositories.database.recipeRevisions.get(cloud.revisionId)) throw new CloudPayloadValidationError("MISSING_NOTE_REVISION", "The note's immutable revision is unavailable.", cloud.id);
      const local = await repositories.database.recipeNotes.get(cloud.id);
      const metadata = await repositories.sync!.getMetadata("recipe-note", cloud.id);
      if (cloud.deletedAt) {
        if (local && (metadata?.cloudState === "pending-upload" || metadata?.cloudState === "pending-delete")) {
          if (metadata.cloudVersion === undefined || cloud.version > metadata.cloudVersion) {
            await conflictFor(repositories, "recipe-note", cloud.id, "delete", local.title, local, cloud, cloud.note.updatedAt, cloud.sourceDeviceId);
            conflicts += 1;
          }
          continue;
        }
        if (local) await repositories.database.recipeNotes.delete(cloud.id);
      } else if (!local) {
        await repositories.database.recipeNotes.add(clone(cloud.note));
        increment(downloaded, "notes");
      } else if (metadata?.cloudState === "pending-upload" || metadata?.cloudState === "pending-delete") {
        if (JSON.stringify(local) === JSON.stringify(cloud.note)) {
          await repositories.sync!.markSynced("recipe-note", cloud.id, { cloudId: cloud.cloudId, cloudVersion: cloud.version, cloudUpdatedAt: cloud.note.updatedAt, localUpdatedAt: cloud.note.updatedAt, sourceDeviceId: cloud.sourceDeviceId });
          continue;
        }
        if (metadata.cloudVersion === undefined || cloud.version > metadata.cloudVersion) {
          await conflictFor(repositories, "recipe-note", cloud.id, "note-content", local.title, local, cloud, cloud.note.updatedAt, cloud.sourceDeviceId);
          conflicts += 1;
        }
        continue;
      } else if (!metadata && JSON.stringify(local) !== JSON.stringify(cloud.note)) {
        await conflictFor(repositories, "recipe-note", cloud.id, "note-content", local.title, local, cloud, cloud.note.updatedAt, cloud.sourceDeviceId);
        conflicts += 1;
        continue;
      } else {
        await repositories.database.recipeNotes.put(clone(cloud.note));
        if (JSON.stringify(local) !== JSON.stringify(cloud.note)) increment(downloaded, "notes");
      }
      await repositories.sync!.markSynced("recipe-note", cloud.id, { cloudId: cloud.cloudId, cloudVersion: cloud.version, cloudUpdatedAt: cloud.note.updatedAt, localUpdatedAt: cloud.note.updatedAt, sourceDeviceId: cloud.sourceDeviceId });
    } catch (error) {
      await quarantine(repositories, "recipe-note", cloud, error);
      quarantined += 1;
    }
  }
  return { conflicts, quarantined };
}

async function mergeComparisons(changeSet: CloudChangeSet, repositories: LocalDataRepositories, downloaded: SyncCounts): Promise<Readonly<{ conflicts: number; quarantined: number }>> {
  let conflicts = 0;
  let quarantined = 0;
  for (const cloud of changeSet.comparisons) {
    try {
      if (cloud.ownerId !== repositories.ownerId || cloud.comparison.id !== cloud.id) throw new CloudPayloadValidationError("INVALID_COMPARISON_OWNER", "The comparison owner or stable ID is invalid.", cloud.id);
      validateComparisonForCloud(cloud.comparison);
      const local = await repositories.database.comparisons.get(cloud.id);
      const metadata = await repositories.sync!.getMetadata("comparison", cloud.id);
      if (!local && metadata?.cloudState === "pending-delete") {
        if (cloud.deletedAt) {
          await repositories.sync!.markSynced("comparison", cloud.id, { cloudId: cloud.cloudId, cloudVersion: cloud.version, cloudUpdatedAt: cloud.comparison.updatedAt, sourceDeviceId: cloud.sourceDeviceId });
        } else if (metadata.cloudVersion !== undefined && cloud.version > metadata.cloudVersion) {
          await conflictFor(repositories, "comparison", cloud.id, "delete", cloud.comparison.name, { deleted: true }, cloud, cloud.comparison.updatedAt, cloud.sourceDeviceId);
          conflicts += 1;
        }
        continue;
      }
      if (cloud.deletedAt) {
        if (local && (metadata?.cloudState === "pending-upload" || metadata?.cloudState === "pending-delete")) {
          if (metadata.cloudVersion === undefined || cloud.version > metadata.cloudVersion) {
            await conflictFor(repositories, "comparison", cloud.id, "delete", local.name, local, cloud, cloud.comparison.updatedAt, cloud.sourceDeviceId);
            conflicts += 1;
          }
          continue;
        }
        if (local) await repositories.database.comparisons.delete(cloud.id);
      } else if (!local) {
        await repositories.database.comparisons.add(clone(cloud.comparison));
        increment(downloaded, "comparisons");
      } else if (metadata?.cloudState === "pending-upload" || metadata?.cloudState === "pending-delete") {
        if (JSON.stringify(local) === JSON.stringify(cloud.comparison)) {
          await repositories.sync!.markSynced("comparison", cloud.id, { cloudId: cloud.cloudId, cloudVersion: cloud.version, cloudUpdatedAt: cloud.comparison.updatedAt, localUpdatedAt: cloud.comparison.updatedAt, sourceDeviceId: cloud.sourceDeviceId });
          continue;
        }
        if (metadata.cloudVersion === undefined || cloud.version > metadata.cloudVersion) {
          await conflictFor(repositories, "comparison", cloud.id, "comparison-content", local.name, local, cloud, cloud.comparison.updatedAt, cloud.sourceDeviceId);
          conflicts += 1;
        }
        continue;
      } else if (!metadata && JSON.stringify(local) !== JSON.stringify(cloud.comparison)) {
        await conflictFor(repositories, "comparison", cloud.id, "comparison-content", local.name, local, cloud, cloud.comparison.updatedAt, cloud.sourceDeviceId);
        conflicts += 1;
        continue;
      } else {
        await repositories.database.comparisons.put(clone(cloud.comparison));
        if (JSON.stringify(local) !== JSON.stringify(cloud.comparison)) increment(downloaded, "comparisons");
      }
      await repositories.sync!.markSynced("comparison", cloud.id, { cloudId: cloud.cloudId, cloudVersion: cloud.version, cloudUpdatedAt: cloud.comparison.updatedAt, localUpdatedAt: cloud.comparison.updatedAt, sourceDeviceId: cloud.sourceDeviceId });
    } catch (error) {
      await quarantine(repositories, "comparison", cloud, error);
      quarantined += 1;
    }
  }
  return { conflicts, quarantined };
}

async function mergeSettings(cloud: CloudUserSettings | undefined, repositories: LocalDataRepositories, downloaded: SyncCounts): Promise<Readonly<{ conflicts: number; quarantined: number }>> {
  if (!cloud) return { conflicts: 0, quarantined: 0 };
  try {
    if (cloud.ownerId !== repositories.ownerId) throw new CloudPayloadValidationError("INVALID_SETTINGS_OWNER", "Cloud settings claim a different owner.");
    const incoming = validateSettingsForCloud(cloud.settings);
    const local = await repositories.database.userSettings.get("local-user-settings");
    const metadata = await repositories.sync!.getMetadata("user-settings", "local-user-settings");
    const defaultPayload = stableSettingsPayload(createDefaultUserSettings(local?.updatedAt));
    const localIsDefault = local && JSON.stringify(stableSettingsPayload(local)) === JSON.stringify(defaultPayload);
    if (local && metadata?.cloudState === "pending-upload") {
      if (JSON.stringify(stableSettingsPayload(local)) === JSON.stringify(stableSettingsPayload(incoming))) {
        await repositories.sync!.markSynced("user-settings", "local-user-settings", { cloudVersion: cloud.version, cloudUpdatedAt: incoming.updatedAt, localUpdatedAt: incoming.updatedAt, sourceDeviceId: cloud.sourceDeviceId });
        return { conflicts: 0, quarantined: 0 };
      }
      if (metadata.cloudVersion === undefined || cloud.version > metadata.cloudVersion) {
        await conflictFor(repositories, "user-settings", "local-user-settings", "settings", "User settings", local, cloud, incoming.updatedAt, cloud.sourceDeviceId);
        return { conflicts: 1, quarantined: 0 };
      }
      return { conflicts: 0, quarantined: 0 };
    }
    if (local && !metadata && !localIsDefault && JSON.stringify(stableSettingsPayload(local)) !== JSON.stringify(stableSettingsPayload(incoming))) {
      await conflictFor(repositories, "user-settings", "local-user-settings", "settings", "User settings", local, cloud, incoming.updatedAt, cloud.sourceDeviceId);
      return { conflicts: 1, quarantined: 0 };
    }
    if (!local || metadata?.cloudState !== "pending-upload") {
      await repositories.database.userSettings.put(clone(incoming));
      writeAppearanceBootstrap(incoming.appearance);
      increment(downloaded, "settings");
    }
    await repositories.sync!.markSynced("user-settings", "local-user-settings", { cloudVersion: cloud.version, cloudUpdatedAt: incoming.updatedAt, localUpdatedAt: incoming.updatedAt, sourceDeviceId: cloud.sourceDeviceId });
    return { conflicts: 0, quarantined: 0 };
  } catch (error) {
    await quarantine(repositories, "user-settings", { id: "local-user-settings", schemaVersion: cloud.settings?.schemaVersion }, error);
    return { conflicts: 0, quarantined: 1 };
  }
}

async function mergeChanges(changeSet: CloudChangeSet, repositories: LocalDataRepositories, downloaded: SyncCounts): Promise<Readonly<{ conflicts: number; quarantined: number }>> {
  const revision = await mergeRevisions(changeSet, repositories, downloaded);
  const recipe = await mergeRecipes(changeSet, repositories, downloaded);
  const note = await mergeNotes(changeSet, repositories, downloaded);
  const comparison = await mergeComparisons(changeSet, repositories, downloaded);
  const settings = await mergeSettings(changeSet.settings, repositories, downloaded);
  return {
    conflicts: revision.conflicts + recipe.conflicts + note.conflicts + comparison.conflicts + settings.conflicts,
    quarantined: revision.quarantined + recipe.quarantined + note.quarantined + comparison.quarantined + settings.quarantined,
  };
}

async function recipeOperation(repositories: LocalDataRepositories, recipeId: string, installationId: string): Promise<Extract<CloudWriteOperation, { kind: "upsert-recipe-bundle" }> | undefined> {
  const recipe = await repositories.database.recipes.get(recipeId);
  if (!recipe) return undefined;
  const revisions = await repositories.database.recipeRevisions.where("recipeId").equals(recipeId).sortBy("revisionNumber");
  const snapshots = await repositories.database.snapshots.where("recipeId").equals(recipeId).toArray();
  const recipeMetadata = await repositories.sync!.ensureMetadata("recipe", recipe.id);
  const revisionCloudIds: Record<string, string> = {};
  for (const revision of revisions) revisionCloudIds[revision.id] = (await repositories.sync!.ensureMetadata("recipe-revision", revision.id)).cloudId;
  return {
    kind: "upsert-recipe-bundle",
    bundle: { recipe, revisions, snapshots },
    mappings: { recipeCloudId: recipeMetadata.cloudId, revisionCloudIds },
    ...(recipeMetadata.cloudVersion !== undefined ? { expectedVersion: recipeMetadata.cloudVersion } : {}),
    sourceDeviceId: installationId,
  };
}

async function buildUploadOperations(repositories: LocalDataRepositories, installationId: string, respectOutboxSchedule = false): Promise<Readonly<{ operations: CloudWriteOperation[]; recipeRevisions: Map<string, readonly string[]> }>> {
  let pending = await repositories.sync!.listPending();
  if (respectOutboxSchedule) {
    const now = Date.now();
    const eligible = new Set((await repositories.sync!.listOutbox()).filter((item) => item.state === "pending" || item.state === "processing" || item.state === "retry-wait" && (!item.nextAttemptAt || Date.parse(item.nextAttemptAt) <= now)).map((item) => item.id));
    pending = pending.filter((item) => eligible.has(`${item.ownerId}:${item.recordType}:${item.recordId}`));
  }
  const operations: CloudWriteOperation[] = [];
  const recipeRevisions = new Map<string, readonly string[]>();
  const pendingRecipeIds = new Set(pending.filter((item) => item.recordType === "recipe").map((item) => item.recordId));
  for (const revisionMetadata of pending.filter((item) => item.recordType === "recipe-revision")) {
    const revision = await repositories.database.recipeRevisions.get(revisionMetadata.recordId);
    if (revision) pendingRecipeIds.add(revision.recipeId);
  }
  for (const recipeId of [...pendingRecipeIds].sort()) {
    const metadata = await repositories.sync!.getMetadata("recipe", recipeId);
    if (metadata?.cloudState === "pending-delete" && metadata.cloudVersion !== undefined) {
      operations.push({ kind: "soft-delete-recipe", id: recipeId, cloudId: metadata.cloudId, expectedVersion: metadata.cloudVersion, sourceDeviceId: installationId });
      continue;
    }
    const operation = await recipeOperation(repositories, recipeId, installationId);
    if (operation) {
      operations.push(operation);
      recipeRevisions.set(recipeId, operation.bundle.revisions.map((item) => item.id));
    }
  }
  for (const metadata of pending.filter((item) => item.recordType === "recipe-note").sort((left, right) => left.recordId.localeCompare(right.recordId))) {
    if (metadata.cloudState === "pending-delete" && metadata.cloudVersion !== undefined) {
      operations.push({ kind: "soft-delete-note", id: metadata.recordId, cloudId: metadata.cloudId, expectedVersion: metadata.cloudVersion, sourceDeviceId: installationId });
      continue;
    }
    const note = await repositories.database.recipeNotes.get(metadata.recordId);
    if (!note) continue;
    const recipe = await repositories.sync!.getMetadata("recipe", note.recipeId);
    const revision = note.recipeRevisionId ? await repositories.sync!.getMetadata("recipe-revision", note.recipeRevisionId) : undefined;
    if (!recipe) { await repositories.sync!.markError("recipe-note", note.id, "The linked recipe has no cloud identity."); continue; }
    operations.push({ kind: "upsert-note", note, cloudId: metadata.cloudId, recipeCloudId: recipe.cloudId, ...(revision ? { revisionCloudId: revision.cloudId } : {}), ...(metadata.cloudVersion !== undefined ? { expectedVersion: metadata.cloudVersion } : {}), sourceDeviceId: installationId });
  }
  for (const metadata of pending.filter((item) => item.recordType === "comparison").sort((left, right) => left.recordId.localeCompare(right.recordId))) {
    if (metadata.cloudState === "pending-delete" && metadata.cloudVersion !== undefined) {
      operations.push({ kind: "soft-delete-comparison", id: metadata.recordId, cloudId: metadata.cloudId, expectedVersion: metadata.cloudVersion, sourceDeviceId: installationId });
      continue;
    }
    const comparison = await repositories.database.comparisons.get(metadata.recordId);
    if (comparison) operations.push({ kind: "upsert-comparison", comparison, cloudId: metadata.cloudId, ...(metadata.cloudVersion !== undefined ? { expectedVersion: metadata.cloudVersion } : {}), sourceDeviceId: installationId });
  }
  const settingsMetadata = pending.find((item) => item.recordType === "user-settings");
  if (settingsMetadata) {
    const settings = await repositories.database.userSettings.get("local-user-settings");
    if (settings) operations.push({ kind: "upsert-settings", settings, ...(settingsMetadata.cloudVersion !== undefined ? { expectedVersion: settingsMetadata.cloudVersion } : {}), sourceDeviceId: installationId });
  }
  return { operations, recipeRevisions };
}

async function acceptUploadResults(
  repositories: LocalDataRepositories,
  operations: readonly CloudWriteOperation[],
  results: Awaited<ReturnType<CloudSyncRepository["write"]>>,
  uploaded: SyncCounts,
  recipeRevisions: ReadonlyMap<string, readonly string[]>,
): Promise<Readonly<{ conflicts: number; errors: string[] }>> {
  let conflicts = 0;
  const errors: string[] = [];
  for (let index = 0; index < operations.length; index += 1) {
    const operation = operations[index]!;
    const result = results[index];
    if (!result) { errors.push(`${operation.kind}: no server result`); continue; }
    const recordType = operation.kind.includes("recipe") ? "recipe" : operation.kind.includes("note") ? "recipe-note" : operation.kind.includes("comparison") ? "comparison" : operation.kind === "upsert-settings" ? "user-settings" : undefined;
    const recordId = operation.kind === "upsert-recipe-bundle" ? operation.bundle.recipe.id : operation.kind === "upsert-note" ? operation.note.id : operation.kind === "upsert-comparison" ? operation.comparison.id : operation.kind === "upsert-settings" ? operation.settings.id : "id" in operation ? operation.id : operation.installationId;
    if (result.status === "conflict" && recordType) {
      const local = recordType === "recipe" ? await repositories.database.recipes.get(recordId) : recordType === "recipe-note" ? await repositories.database.recipeNotes.get(recordId) : recordType === "comparison" ? await repositories.database.comparisons.get(recordId) : await repositories.database.userSettings.get("local-user-settings");
      await conflictFor(repositories, recordType, recordId, recordType === "recipe" ? "recipe-metadata" : recordType === "recipe-note" ? "note-content" : recordType === "comparison" ? "comparison-content" : "settings", local && "name" in local ? String(local.name) : local && "title" in local ? String(local.title) : "User settings", local, result.cloudRecord ?? { message: result.message }, result.cloudUpdatedAt);
      conflicts += 1;
      continue;
    }
    if (result.status === "error") {
      if (recordType) await repositories.sync!.markError(recordType, recordId, result.message ?? "Cloud write failed.");
      errors.push(`${recordId}: ${result.message ?? "cloud write failed"}`);
      continue;
    }
    if (operation.kind === "upsert-recipe-bundle") {
      await repositories.sync!.markSynced("recipe", recordId, { cloudId: operation.mappings.recipeCloudId, cloudVersion: result.cloudVersion, cloudUpdatedAt: result.cloudUpdatedAt, localUpdatedAt: operation.bundle.recipe.updatedAt, sourceDeviceId: operation.sourceDeviceId });
      increment(uploaded, "recipes");
      for (const revisionId of recipeRevisions.get(recordId) ?? []) {
        const revision = operation.bundle.revisions.find((item) => item.id === revisionId)!;
        await repositories.sync!.markSynced("recipe-revision", revisionId, { cloudId: operation.mappings.revisionCloudIds[revisionId], contentDigest: revision.inputDigest, localUpdatedAt: revision.createdAt, sourceDeviceId: operation.sourceDeviceId });
        increment(uploaded, "revisions");
      }
    } else if (operation.kind === "upsert-note" || operation.kind === "soft-delete-note") {
      await repositories.sync!.markSynced("recipe-note", recordId, { cloudVersion: result.cloudVersion, cloudUpdatedAt: result.cloudUpdatedAt, sourceDeviceId: operation.sourceDeviceId });
      increment(uploaded, "notes");
    } else if (operation.kind === "upsert-comparison" || operation.kind === "soft-delete-comparison") {
      await repositories.sync!.markSynced("comparison", recordId, { cloudVersion: result.cloudVersion, cloudUpdatedAt: result.cloudUpdatedAt, sourceDeviceId: operation.sourceDeviceId });
      increment(uploaded, "comparisons");
    } else if (operation.kind === "upsert-settings") {
      await repositories.sync!.markSynced("user-settings", recordId, { cloudVersion: result.cloudVersion, cloudUpdatedAt: result.cloudUpdatedAt, localUpdatedAt: operation.settings.updatedAt, sourceDeviceId: operation.sourceDeviceId });
      increment(uploaded, "settings");
    } else if (operation.kind === "soft-delete-recipe") {
      await repositories.sync!.markSynced("recipe", recordId, { cloudVersion: result.cloudVersion, cloudUpdatedAt: result.cloudUpdatedAt, sourceDeviceId: operation.sourceDeviceId });
      increment(uploaded, "recipes");
    }
  }
  return { conflicts, errors };
}

/**
 * Executes the authoritative pull, validate, merge, upload, and finalize pass.
 *
 * Local scientific records remain authoritative until validation and conflict
 * policy permit a merge. The function is account-scoped, preserves the durable
 * outbox and monotonic cursor, isolates malformed records in quarantine, and
 * returns a summary instead of erasing pending work on partial failure.
 */
export async function performManualSync(options: ManualSyncOptions): Promise<SyncSummary> {
  const now = options.now ?? (() => new Date().toISOString());
  const startedAt = now();
  let summary = emptySummary(startedAt);
  const repositories = options.repositories;
  if (!repositories.ownerId || !repositories.sync || repositories.ownerId !== options.cloud.ownerId) return { ...withPhase(summary, "session", "failed"), status: "failed", completedAt: now(), errors: ["The authenticated account does not match the local account cache."], errorCategory: "authorization", retryable: false };
  await repositories.sync.recordAttempt(startedAt);
  if (options.online === false || (typeof navigator !== "undefined" && navigator.onLine === false)) {
    summary = withPhase(summary, "session", "complete");
    summary = withPhase(summary, "pull", "skipped");
    return { ...summary, status: "offline", completedAt: now(), errors: ["You are offline. Local changes are safe and remain pending until connection returns."], errorCategory: "offline", retryable: true };
  }
  summary = withPhase(summary, "session", "complete");
  let changeSet: CloudChangeSet;
  try {
    const session = await repositories.sync.getSession();
    changeSet = await options.cloud.pull(session.cursor);
    if (process.env.NODE_ENV !== "production") console.info("[cloud-sync]", { event: "pull_completed", cursor: changeSet.cursor, records: changeSet.recipes.length + changeSet.revisions.length + changeSet.notes.length + changeSet.comparisons.length + (changeSet.settings ? 1 : 0) });
    summary = withPhase(summary, "pull", "complete");
  } catch (error) {
    return { ...withPhase(summary, "pull", "failed"), status: "failed", completedAt: now(), errors: ["Cloud changes could not be downloaded. Local data was not changed."], ...classifySyncError(error) };
  }
  try {
    const merged = await mergeChanges(changeSet, repositories, summary.downloaded);
    summary = { ...summary, conflicts: merged.conflicts, quarantined: merged.quarantined };
    summary = withPhase(summary, "merge", "complete");
  } catch {
    return { ...withPhase(summary, "merge", "failed"), status: "partial", completedAt: now(), errors: ["Cloud changes were downloaded, but the local merge did not reach a known safe state."], errorCategory: "validation", retryable: false };
  }
  let uploadErrors: string[] = [];
  let uploadClassification: ReturnType<typeof classifySyncError> | undefined;
  try {
    const built = await buildUploadOperations(repositories, options.installationId, options.respectOutboxSchedule);
    const results = await options.cloud.write(built.operations);
    const accepted = await acceptUploadResults(repositories, built.operations, results, summary.uploaded, built.recipeRevisions);
    summary = { ...summary, conflicts: summary.conflicts + accepted.conflicts };
    uploadErrors = accepted.errors;
    summary = withPhase(summary, "upload", accepted.errors.length ? "failed" : "complete");
  } catch (error) {
    uploadErrors = ["Pending local changes could not be uploaded. They remain on this device."];
    uploadClassification = classifySyncError(error);
    summary = withPhase(summary, "upload", "failed");
  }
  try {
    const existingDevice = await repositories.database.cloudDevices.get(repositories.ownerId);
    const deviceCloudId = existingDevice?.installationId === options.installationId ? undefined : crypto.randomUUID();
    await options.cloud.write([{ kind: "upsert-device", cloudId: deviceCloudId ?? crypto.randomUUID(), installationId: options.installationId, ...(options.deviceName?.trim() ? { displayName: options.deviceName.trim() } : {}), lastSyncAt: now() }]);
    await repositories.database.cloudDevices.put({ ownerId: repositories.ownerId, installationId: options.installationId, ...(options.deviceName?.trim() ? { displayName: options.deviceName.trim() } : {}), updatedAt: now() });
    summary = withPhase(summary, "device", "complete");
  } catch (error) {
    uploadErrors.push("Device sync diagnostics could not be updated.");
    uploadClassification ??= classifySyncError(error);
    summary = withPhase(summary, "device", "failed");
  }
  const completedAt = now();
  const status: SyncSummary["status"] = uploadErrors.length || summary.quarantined ? "partial" : "complete";
  if (uploadErrors.length && !uploadClassification) uploadClassification = { errorCategory: "server", retryable: true };
  summary = { ...summary, status, completedAt, errors: uploadErrors, ...(uploadClassification ? uploadClassification : {}) };
  summary = withPhase(summary, "finalize", "complete");
  if (status === "complete") await repositories.sync.recordSuccess(changeSet.cursor, summary);
  else await repositories.sync.updateSession({ cursor: changeSet.cursor, lastSummary: summary });
  if (process.env.NODE_ENV !== "production") console.info("[cloud-sync]", { event: "completed", status, uploaded: summary.uploaded, downloaded: summary.downloaded, conflicts: summary.conflicts, quarantined: summary.quarantined, durationMs: Date.parse(completedAt) - Date.parse(startedAt), schemaVersion: LOCAL_SCHEMA_VERSION });
  return summary;
}
