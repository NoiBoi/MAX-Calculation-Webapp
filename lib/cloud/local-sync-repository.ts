import type { MaxStoichDatabase } from "../persistence/database";
import { createDefaultUserSettings, stableSettingsPayload } from "../settings/user-settings";
import type {
  AnonymousLocalDataSummary,
  CloudRecordCounts,
  CloudState,
  CloudSyncRecordType,
  LocalSyncConflict,
  LocalSyncMetadata,
  LocalSyncSession,
  QuarantinedCloudRecord,
  SyncCoordinatorLease,
  SyncErrorCategory,
  SyncOutboxOperation,
  SyncSummary,
  SyncUploadCategory,
} from "./sync-types";
import { syncMetadataId } from "./sync-types";

const clone = <T>(value: T): T => structuredClone(value);
export const SYNC_OUTBOX_CHANGED_EVENT = "max-stoich:sync-outbox-changed";
const outboxId = (ownerId: string, recordType: CloudSyncRecordType, recordId: string): string => `${ownerId}:${recordType}:${recordId}`;
const notifyOutboxChanged = (ownerId: string): void => {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SYNC_OUTBOX_CHANGED_EVENT, { detail: { ownerId } }));
};

export class LocalSyncRepository {
  constructor(readonly database: MaxStoichDatabase, readonly ownerId: string, readonly installationId = "local-installation") {}

  async getMetadata(recordType: CloudSyncRecordType, recordId: string): Promise<LocalSyncMetadata | undefined> {
    return this.database.cloudSyncRecords.get(syncMetadataId(this.ownerId, recordType, recordId));
  }

  async ensureMetadata(recordType: CloudSyncRecordType, recordId: string, state: CloudState = "pending-upload", origin: LocalSyncMetadata["origin"] = "local"): Promise<LocalSyncMetadata> {
    const existing = await this.getMetadata(recordType, recordId);
    if (existing) return existing;
    const created: LocalSyncMetadata = {
      id: syncMetadataId(this.ownerId, recordType, recordId),
      ownerId: this.ownerId,
      recordType,
      recordId,
      cloudId: crypto.randomUUID(),
      cloudState: state,
      origin,
    };
    await this.database.cloudSyncRecords.add(created);
    return created;
  }

  async markPending(recordType: CloudSyncRecordType, recordId: string, origin: LocalSyncMetadata["origin"] = "local"): Promise<LocalSyncMetadata> {
    const existing = await this.getMetadata(recordType, recordId);
    if (existing?.cloudState === "conflict") return existing;
    const next: LocalSyncMetadata = {
      ...(existing ?? {
        id: syncMetadataId(this.ownerId, recordType, recordId),
        ownerId: this.ownerId,
        recordType,
        recordId,
        cloudId: crypto.randomUUID(),
        origin,
      }),
      cloudState: "pending-upload",
      syncError: undefined,
    };
    await this.database.cloudSyncRecords.put(next);
    await this.queueOutbox(recordType, recordId, next.cloudVersion === undefined ? "create" : "update", next.cloudVersion);
    return next;
  }

  async markPendingDelete(recordType: CloudSyncRecordType, recordId: string): Promise<LocalSyncMetadata> {
    const existing = await this.ensureMetadata(recordType, recordId);
    const next = { ...existing, cloudState: "pending-delete" as const, syncError: undefined };
    await this.database.cloudSyncRecords.put(next);
    await this.queueOutbox(recordType, recordId, "soft-delete", next.cloudVersion);
    return next;
  }

  async markSynced(recordType: CloudSyncRecordType, recordId: string, update: Readonly<{ cloudId?: string; cloudVersion?: number; cloudUpdatedAt?: string; localUpdatedAt?: string; contentDigest?: string; sourceDeviceId?: string }>): Promise<void> {
    const existing = await this.getMetadata(recordType, recordId);
    const now = new Date().toISOString();
    await this.database.cloudSyncRecords.put({
      ...(existing ?? {
        id: syncMetadataId(this.ownerId, recordType, recordId),
        ownerId: this.ownerId,
        recordType,
        recordId,
        cloudId: update.cloudId ?? crypto.randomUUID(),
        origin: "cloud" as const,
      }),
      ...(update.cloudId ? { cloudId: update.cloudId } : {}),
      cloudState: "synced",
      ...(update.cloudVersion !== undefined ? { cloudVersion: update.cloudVersion } : {}),
      lastSyncedAt: now,
      ...(update.cloudUpdatedAt ? { lastCloudUpdatedAt: update.cloudUpdatedAt } : {}),
      ...(update.localUpdatedAt ? { localUpdatedAtAtLastSync: update.localUpdatedAt } : {}),
      ...(update.contentDigest ? { contentDigestAtLastSync: update.contentDigest } : {}),
      ...(update.sourceDeviceId ? { sourceDeviceId: update.sourceDeviceId } : {}),
      syncError: undefined,
    });
    await this.database.cloudSyncOutbox.delete(outboxId(this.ownerId, recordType, recordId));
  }

  async markError(recordType: CloudSyncRecordType, recordId: string, message: string): Promise<void> {
    const existing = await this.ensureMetadata(recordType, recordId);
    await this.database.cloudSyncRecords.put({ ...existing, cloudState: "error", syncError: message.slice(0, 500) });
    const operation = await this.database.cloudSyncOutbox.get(outboxId(this.ownerId, recordType, recordId));
    if (operation) await this.database.cloudSyncOutbox.put({ ...operation, state: "failed", lastError: message.slice(0, 500), lastErrorCategory: "unknown", updatedAt: new Date().toISOString() });
  }

  async listPending(): Promise<readonly LocalSyncMetadata[]> {
    const records = await this.database.cloudSyncRecords.where("[ownerId+cloudState]").anyOf([
      [this.ownerId, "pending-upload"],
      [this.ownerId, "pending-delete"],
    ]).toArray();
    return records.sort((left, right) => `${left.recordType}:${left.recordId}`.localeCompare(`${right.recordType}:${right.recordId}`));
  }

  async listMetadata(recordType?: CloudSyncRecordType): Promise<readonly LocalSyncMetadata[]> {
    return recordType
      ? this.database.cloudSyncRecords.where("[ownerId+recordType]").equals([this.ownerId, recordType]).toArray()
      : this.database.cloudSyncRecords.where("ownerId").equals(this.ownerId).toArray();
  }

  async getSession(): Promise<LocalSyncSession> {
    const existing = await this.database.cloudSyncSessions.get(this.ownerId);
    if (existing) return existing;
    const created: LocalSyncSession = { ownerId: this.ownerId, cursor: "0", initialLocalDataDecision: "unreviewed", updatedAt: new Date().toISOString() };
    await this.database.cloudSyncSessions.put(created);
    return created;
  }

  async updateSession(update: Partial<Omit<LocalSyncSession, "ownerId">>): Promise<LocalSyncSession> {
    const current = await this.getSession();
    const next = { ...current, ...update, ownerId: this.ownerId, updatedAt: new Date().toISOString() };
    await this.database.cloudSyncSessions.put(next);
    return next;
  }

  async recordAttempt(at = new Date().toISOString()): Promise<void> { await this.updateSession({ lastAttemptAt: at }); }
  async recordSuccess(cursor: string, summary: SyncSummary): Promise<void> { await this.updateSession({ cursor, lastSuccessfulSyncAt: summary.completedAt, lastSummary: summary }); }

  async addConflict(conflict: Omit<LocalSyncConflict, "id" | "ownerId" | "createdAt" | "status">): Promise<LocalSyncConflict> {
    const value: LocalSyncConflict = { ...conflict, id: crypto.randomUUID(), ownerId: this.ownerId, createdAt: new Date().toISOString(), status: "open" };
    await this.database.cloudConflicts.add(value);
    const metadata = await this.ensureMetadata(value.recordType, value.recordId);
    await this.database.cloudSyncRecords.put({ ...metadata, cloudState: "conflict" });
    const operation = await this.database.cloudSyncOutbox.get(outboxId(this.ownerId, value.recordType, value.recordId));
    if (operation) await this.database.cloudSyncOutbox.put({ ...operation, state: "conflict", updatedAt: new Date().toISOString() });
    return value;
  }

  async listConflicts(includeResolved = false): Promise<readonly LocalSyncConflict[]> {
    const records = includeResolved
      ? await this.database.cloudConflicts.where("ownerId").equals(this.ownerId).toArray()
      : await this.database.cloudConflicts.where("[ownerId+status]").equals([this.ownerId, "open"]).toArray();
    return records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async resolveConflict(id: string): Promise<void> {
    const conflict = await this.database.cloudConflicts.get(id);
    if (!conflict || conflict.ownerId !== this.ownerId) throw new Error("The sync conflict is unavailable.");
    await this.database.cloudConflicts.put({ ...conflict, status: "resolved" });
  }

  async quarantine(value: Omit<QuarantinedCloudRecord, "id" | "ownerId" | "receivedAt">): Promise<void> {
    await this.database.cloudQuarantine.add({ ...value, id: crypto.randomUUID(), ownerId: this.ownerId, receivedAt: new Date().toISOString() });
  }

  async listQuarantine(): Promise<readonly QuarantinedCloudRecord[]> {
    return this.database.cloudQuarantine.where("ownerId").equals(this.ownerId).reverse().sortBy("receivedAt");
  }

  async counts(): Promise<CloudRecordCounts> {
    const records = await this.listMetadata();
    return {
      localOnly: records.filter((item) => item.cloudState === "local-only").length,
      pendingUpload: records.filter((item) => item.cloudState === "pending-upload" || item.cloudState === "pending-delete").length,
      conflicts: records.filter((item) => item.cloudState === "conflict").length,
      errors: records.filter((item) => item.cloudState === "error").length,
      cloudRecords: records.filter((item) => item.cloudVersion !== undefined).length,
    };
  }

  async queueOutbox(recordType: CloudSyncRecordType, recordId: string, operation: SyncOutboxOperation["operation"], expectedCloudVersion?: number): Promise<SyncOutboxOperation> {
    const id = outboxId(this.ownerId, recordType, recordId);
    const existing = await this.database.cloudSyncOutbox.get(id);
    const now = new Date().toISOString();
    const effectiveOperation = operation === "soft-delete"
      ? "soft-delete"
      : existing?.operation === "create" && expectedCloudVersion === undefined ? "create" : operation;
    const mutationToken = globalThis.crypto?.randomUUID?.() ?? `${now}:${Math.random().toString(16).slice(2)}`;
    const next: SyncOutboxOperation = {
      id,
      ownerId: this.ownerId,
      installationId: this.installationId,
      recordType,
      recordId,
      operation: effectiveOperation,
      idempotencyKey: `${id}:${mutationToken}`,
      payloadVersion: "1.0.0",
      ...(expectedCloudVersion !== undefined ? { expectedCloudVersion } : {}),
      state: existing?.state === "conflict" ? "conflict" : "pending",
      attemptCount: existing?.state === "conflict" ? existing.attemptCount : 0,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.database.cloudSyncOutbox.put(next);
    notifyOutboxChanged(this.ownerId);
    return next;
  }

  async removeOutbox(recordType: CloudSyncRecordType, recordId: string): Promise<void> {
    await this.database.cloudSyncOutbox.delete(outboxId(this.ownerId, recordType, recordId));
    notifyOutboxChanged(this.ownerId);
  }

  async listOutbox(states?: readonly SyncOutboxOperation["state"][]): Promise<readonly SyncOutboxOperation[]> {
    const rows = states?.length
      ? await this.database.cloudSyncOutbox.where("[ownerId+state]").anyOf(states.map((state) => [this.ownerId, state])).toArray()
      : await this.database.cloudSyncOutbox.where("ownerId").equals(this.ownerId).toArray();
    return rows.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  async markOutboxAttempt(id: string): Promise<void> {
    const operation = await this.database.cloudSyncOutbox.get(id);
    if (!operation || operation.ownerId !== this.ownerId) return;
    const now = new Date().toISOString();
    await this.database.cloudSyncOutbox.put({ ...operation, state: "processing", attemptCount: operation.attemptCount + 1, lastAttemptAt: now, updatedAt: now });
  }

  async deferOutbox(category: SyncErrorCategory, message: string, nextAttemptAt: string): Promise<void> {
    const operations = await this.listOutbox(["pending", "processing", "retry-wait", "failed"]);
    const now = new Date().toISOString();
    await this.database.cloudSyncOutbox.bulkPut(operations.map((operation) => ({ ...operation, state: "retry-wait" as const, nextAttemptAt, lastErrorCategory: category, lastError: message.slice(0, 500), updatedAt: now })));
  }

  async makeOutboxEligibleNow(): Promise<void> {
    const operations = await this.listOutbox(["retry-wait", "failed"]);
    const now = new Date().toISOString();
    await this.database.cloudSyncOutbox.bulkPut(operations.map((operation) => ({ ...operation, state: "pending" as const, nextAttemptAt: undefined, lastErrorCategory: undefined, lastError: undefined, updatedAt: now })));
    if (operations.length) notifyOutboxChanged(this.ownerId);
  }

  async reconcileOutbox(): Promise<void> {
    for (const operation of await this.listOutbox()) {
      const metadata = await this.getMetadata(operation.recordType, operation.recordId);
      if (!metadata || metadata.cloudState === "synced") await this.database.cloudSyncOutbox.delete(operation.id);
      else if (metadata.cloudState === "conflict") await this.database.cloudSyncOutbox.put({ ...operation, state: "conflict", updatedAt: new Date().toISOString() });
    }
  }

  async acquireLease(installationId: string, tabId: string, ttlMs = 20_000, now = new Date()): Promise<boolean> {
    return this.database.transaction("rw", this.database.cloudSyncLeases, async () => {
      const existing = await this.database.cloudSyncLeases.get(this.ownerId);
      if (existing && existing.tabId !== tabId && Date.parse(existing.expiresAt) > now.getTime()) return false;
      const acquiredAt = now.toISOString();
      const lease: SyncCoordinatorLease = { ownerId: this.ownerId, installationId, tabId, acquiredAt, heartbeatAt: acquiredAt, expiresAt: new Date(now.getTime() + ttlMs).toISOString() };
      await this.database.cloudSyncLeases.put(lease);
      return true;
    });
  }

  async renewLease(tabId: string, ttlMs = 20_000, now = new Date()): Promise<boolean> {
    return this.database.transaction("rw", this.database.cloudSyncLeases, async () => {
      const existing = await this.database.cloudSyncLeases.get(this.ownerId);
      if (!existing || existing.tabId !== tabId) return false;
      await this.database.cloudSyncLeases.put({ ...existing, heartbeatAt: now.toISOString(), expiresAt: new Date(now.getTime() + ttlMs).toISOString() });
      return true;
    });
  }

  async releaseLease(tabId: string): Promise<void> {
    const existing = await this.database.cloudSyncLeases.get(this.ownerId);
    if (existing?.tabId === tabId) await this.database.cloudSyncLeases.delete(this.ownerId);
  }

  async removeDownloadedCache(): Promise<Readonly<{ removed: number; preservedPending: number }>> {
    const metadata = await this.listMetadata();
    const initiallyProtected = metadata.filter((item) => item.cloudState !== "synced" || item.origin !== "cloud");
    const protectedRecipeIds = new Set(initiallyProtected.filter((item) => item.recordType === "recipe").map((item) => item.recordId));
    for (const item of initiallyProtected) {
      if (item.recordType === "recipe-revision") {
        const revision = await this.database.recipeRevisions.get(item.recordId);
        if (revision) protectedRecipeIds.add(revision.recipeId);
      } else if (item.recordType === "recipe-note") {
        const note = await this.database.recipeNotes.get(item.recordId);
        if (note) protectedRecipeIds.add(note.recipeId);
      }
    }
    const removable: LocalSyncMetadata[] = [];
    for (const item of metadata) {
      if (item.cloudState !== "synced" || item.origin !== "cloud") continue;
      if (item.recordType === "recipe" && protectedRecipeIds.has(item.recordId)) continue;
      if (item.recordType === "recipe-revision") {
        const revision = await this.database.recipeRevisions.get(item.recordId);
        if (revision && protectedRecipeIds.has(revision.recipeId)) continue;
      }
      if (item.recordType === "recipe-note") {
        const note = await this.database.recipeNotes.get(item.recordId);
        if (note && protectedRecipeIds.has(note.recipeId)) continue;
      }
      removable.push(item);
    }
    const revisionIds = new Set(removable.filter((item) => item.recordType === "recipe-revision").map((item) => item.recordId));
    const recipeIds = new Set(removable.filter((item) => item.recordType === "recipe").map((item) => item.recordId));
    await this.database.transaction("rw", [
      this.database.recipes, this.database.recipeRevisions, this.database.snapshots, this.database.recipeNotes,
      this.database.comparisons, this.database.userSettings, this.database.cloudSyncRecords, this.database.cloudSyncOutbox, this.database.recentCalculations,
    ], async () => {
      await this.database.recipeNotes.bulkDelete(removable.filter((item) => item.recordType === "recipe-note").map((item) => item.recordId));
      await this.database.comparisons.bulkDelete(removable.filter((item) => item.recordType === "comparison").map((item) => item.recordId));
      if (removable.some((item) => item.recordType === "user-settings")) await this.database.userSettings.delete("local-user-settings");
      const snapshots = await this.database.snapshots.where("recipeRevisionId").anyOf([...revisionIds]).primaryKeys();
      await this.database.snapshots.bulkDelete(snapshots);
      await this.database.recipeRevisions.bulkDelete([...revisionIds]);
      await this.database.recentCalculations.where("recipeId").anyOf([...recipeIds]).delete();
      await this.database.recipes.bulkDelete([...recipeIds]);
      await this.database.cloudSyncRecords.bulkDelete(removable.map((item) => item.id));
      await this.database.cloudSyncOutbox.bulkDelete(removable.map((item) => outboxId(this.ownerId, item.recordType, item.recordId)));
    });
    return { removed: removable.length, preservedPending: metadata.length - removable.length };
  }

  async markUntrackedRecordsLocalOnly(origin: LocalSyncMetadata["origin"] = "restored"): Promise<number> {
    const [recipes, revisions, notes, comparisons, settings] = await Promise.all([
      this.database.recipes.toArray(),
      this.database.recipeRevisions.toArray(),
      this.database.recipeNotes.toArray(),
      this.database.comparisons.toArray(),
      this.database.userSettings.toArray(),
    ]);
    const records: readonly Readonly<{ type: CloudSyncRecordType; id: string }>[] = [
      ...recipes.map((item) => ({ type: "recipe" as const, id: item.id })),
      ...revisions.map((item) => ({ type: "recipe-revision" as const, id: item.id })),
      ...notes.map((item) => ({ type: "recipe-note" as const, id: item.id })),
      ...comparisons.map((item) => ({ type: "comparison" as const, id: item.id })),
      ...settings.map((item) => ({ type: "user-settings" as const, id: item.id })),
    ];
    let marked = 0;
    for (const record of records) {
      if (!await this.getMetadata(record.type, record.id)) {
        await this.ensureMetadata(record.type, record.id, "local-only", origin);
        marked += 1;
      }
    }
    return marked;
  }

  async prepareLocalOnlyForUpload(categories: readonly SyncUploadCategory[]): Promise<number> {
    const selected = new Set(categories);
    const records = (await this.listMetadata()).filter((item) => item.cloudState === "local-only" && (
      selected.has("recipes") && (item.recordType === "recipe" || item.recordType === "recipe-revision")
      || selected.has("notes") && item.recordType === "recipe-note"
      || selected.has("comparisons") && item.recordType === "comparison"
      || selected.has("settings") && item.recordType === "user-settings"
    ));
    for (const record of records) await this.markPending(record.recordType, record.recordId, record.origin);
    return records.length;
  }
}

export async function summarizeAnonymousLocalData(database: MaxStoichDatabase): Promise<AnonymousLocalDataSummary> {
  const [recipes, revisions, notes, comparisons, settings] = await Promise.all([
    database.recipes.count(),
    database.recipeRevisions.count(),
    database.recipeNotes.count(),
    database.comparisons.count(),
    database.userSettings.get("local-user-settings"),
  ]);
  const defaults = createDefaultUserSettings(settings?.updatedAt);
  return { recipes, revisions, notes, comparisons, customSettings: Boolean(settings && JSON.stringify(stableSettingsPayload(settings)) !== JSON.stringify(stableSettingsPayload(defaults))) };
}

export async function copyAnonymousDataForUpload(
  source: MaxStoichDatabase,
  target: MaxStoichDatabase,
  ownerId: string,
  categories: readonly SyncUploadCategory[],
): Promise<Readonly<{ copied: AnonymousLocalDataSummary; failures: readonly string[] }>> {
  const selected = new Set(categories);
  const sync = new LocalSyncRepository(target, ownerId);
  const failures: string[] = [];
  const copied: AnonymousLocalDataSummary = { recipes: 0, revisions: 0, notes: 0, comparisons: 0, customSettings: false };
  await Promise.all([source.open(), target.open()]);
  if (selected.has("recipes")) {
    const recipes = await source.recipes.toArray();
    for (const recipe of recipes) {
      try {
        const revisions = await source.recipeRevisions.where("recipeId").equals(recipe.id).toArray();
        const snapshots = await source.snapshots.where("recipeId").equals(recipe.id).toArray();
        if (!revisions.some((item) => item.id === recipe.currentRevisionId)) throw new Error("current revision is missing");
        if (revisions.some((item) => !snapshots.some((snapshot) => snapshot.id === item.snapshotId))) throw new Error("an immutable snapshot is missing");
        await target.transaction("rw", [target.recipes, target.recipeRevisions, target.snapshots, target.cloudSyncRecords, target.cloudSyncOutbox], async () => {
          const existing = await target.recipes.get(recipe.id);
          if (existing && JSON.stringify(existing) !== JSON.stringify(recipe)) throw new Error("a different account-local recipe already uses this stable ID");
          await target.recipes.put(clone(recipe));
          await target.recipeRevisions.bulkPut(clone(revisions));
          await target.snapshots.bulkPut(clone(snapshots));
          await sync.markPending("recipe", recipe.id);
          for (const revision of revisions) await sync.markPending("recipe-revision", revision.id);
        });
        (copied as { recipes: number; revisions: number }).recipes += 1;
        (copied as { recipes: number; revisions: number }).revisions += revisions.length;
      } catch (error) { failures.push(`${recipe.name}: ${error instanceof Error ? error.message : "validation failed"}`); }
    }
  }
  if (selected.has("notes")) {
    for (const note of await source.recipeNotes.toArray()) {
      if (!await target.recipes.get(note.recipeId)) { failures.push(`${note.title}: linked recipe was not selected or is invalid`); continue; }
      await target.transaction("rw", [target.recipeNotes, target.cloudSyncRecords, target.cloudSyncOutbox], async () => {
        await target.recipeNotes.put(clone(note));
        await sync.markPending("recipe-note", note.id);
      });
      (copied as { notes: number }).notes += 1;
    }
  }
  if (selected.has("comparisons")) {
    for (const comparison of await source.comparisons.toArray()) {
      if (comparison.scenarios.length < 2 || comparison.scenarios.length > 4) { failures.push(`${comparison.name}: comparison scenario count is invalid`); continue; }
      await target.transaction("rw", [target.comparisons, target.cloudSyncRecords, target.cloudSyncOutbox], async () => {
        await target.comparisons.put(clone(comparison));
        await sync.markPending("comparison", comparison.id);
      });
      (copied as { comparisons: number }).comparisons += 1;
    }
  }
  if (selected.has("settings")) {
    const settings = await source.userSettings.get("local-user-settings");
    if (settings) {
      await target.transaction("rw", [target.userSettings, target.cloudSyncRecords, target.cloudSyncOutbox], async () => {
        await target.userSettings.put(clone(settings));
        await sync.markPending("user-settings", settings.id);
      });
      (copied as { customSettings: boolean }).customSettings = true;
    }
  }
  return { copied, failures };
}

export interface LocalUploadPreview {
  readonly counts: AnonymousLocalDataSummary;
  readonly failures: readonly string[];
  readonly potentialDuplicates: readonly string[];
}

export async function previewAnonymousDataForUpload(
  source: MaxStoichDatabase,
  target: MaxStoichDatabase,
  categories: readonly SyncUploadCategory[],
): Promise<LocalUploadPreview> {
  const selected = new Set(categories);
  const failures: string[] = [];
  const potentialDuplicates: string[] = [];
  const counts: AnonymousLocalDataSummary = { recipes: 0, revisions: 0, notes: 0, comparisons: 0, customSettings: false };
  await Promise.all([source.open(), target.open()]);
  if (selected.has("recipes")) {
    const targetRecipes = await target.recipes.toArray();
    const targetRevisions = await target.recipeRevisions.toArray();
    for (const recipe of await source.recipes.toArray()) {
      const revisions = await source.recipeRevisions.where("recipeId").equals(recipe.id).toArray();
      const snapshots = await source.snapshots.where("recipeId").equals(recipe.id).toArray();
      if (!revisions.some((item) => item.id === recipe.currentRevisionId)) { failures.push(`${recipe.name}: current revision is missing`); continue; }
      if (revisions.some((item) => !snapshots.some((snapshot) => snapshot.id === item.snapshotId))) { failures.push(`${recipe.name}: an immutable snapshot is missing`); continue; }
      const sameId = targetRecipes.find((item) => item.id === recipe.id);
      if (sameId && JSON.stringify(sameId) !== JSON.stringify(recipe)) failures.push(`${recipe.name}: a different account-local recipe already uses this stable ID`);
      else {
        const matchingDigest = revisions.some((revision) => targetRevisions.some((candidate) => candidate.id !== revision.id && candidate.inputDigest === revision.inputDigest));
        if (matchingDigest) potentialDuplicates.push(`${recipe.name}: scientific input matches a recipe already on this account, but stable IDs differ`);
        else if (targetRecipes.some((candidate) => candidate.id !== recipe.id && candidate.name.trim().toLowerCase() === recipe.name.trim().toLowerCase())) potentialDuplicates.push(`${recipe.name}: name matches another recipe; scientific content remains distinct`);
        (counts as { recipes: number; revisions: number }).recipes += 1;
        (counts as { recipes: number; revisions: number }).revisions += revisions.length;
      }
    }
  }
  if (selected.has("notes")) {
    const selectedRecipeIds = new Set((await source.recipes.toArray()).map((item) => item.id));
    for (const note of await source.recipeNotes.toArray()) {
      if (!selected.has("recipes") && !await target.recipes.get(note.recipeId)) failures.push(`${note.title}: linked recipe was not selected or is unavailable`);
      else if (!selectedRecipeIds.has(note.recipeId) && !await target.recipes.get(note.recipeId)) failures.push(`${note.title}: linked recipe is missing`);
      else (counts as { notes: number }).notes += 1;
    }
  }
  if (selected.has("comparisons")) {
    for (const comparison of await source.comparisons.toArray()) {
      if (comparison.scenarios.length < 2 || comparison.scenarios.length > 4) failures.push(`${comparison.name}: comparison scenario count is invalid`);
      else (counts as { comparisons: number }).comparisons += 1;
    }
  }
  if (selected.has("settings")) {
    const settings = await source.userSettings.get("local-user-settings");
    (counts as { customSettings: boolean }).customSettings = Boolean(settings);
  }
  return { counts, failures, potentialDuplicates };
}
