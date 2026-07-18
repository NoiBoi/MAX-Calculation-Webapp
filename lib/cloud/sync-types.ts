import type { CalculationSnapshot, ComparisonWorkspace, RecipeNote, RecipeRevision, SavedRecipe } from "../persistence/entities";
import type { LocalUserSettings } from "../settings/user-settings";

export const CLOUD_SYNC_SCHEMA_VERSION = "1.0.0" as const;
export const CLOUD_SYNC_RECORD_TYPES = ["recipe", "recipe-revision", "recipe-note", "comparison", "user-settings"] as const;
export type CloudSyncRecordType = typeof CLOUD_SYNC_RECORD_TYPES[number];
export type CloudState = "local-only" | "pending-upload" | "synced" | "pending-delete" | "conflict" | "error";
export type SyncUploadCategory = "recipes" | "notes" | "comparisons" | "settings";
export type SyncOutboxOperationKind = "create" | "update" | "soft-delete";
export type SyncOutboxState = "pending" | "processing" | "retry-wait" | "conflict" | "failed";
export type SyncErrorCategory = "offline" | "network" | "rate-limit" | "server" | "auth-required" | "authorization" | "conflict" | "validation" | "unknown";
export type AutomaticSyncTrigger = "startup" | "local-change" | "reconnect" | "focus" | "remote-change" | "manual" | "resume" | "retry";
export type AutomaticSyncState = "idle" | "scheduled" | "running" | "waiting-auth" | "waiting-network" | "paused" | "retrying" | "error";

export interface SyncOutboxOperation {
  readonly id: string;
  readonly ownerId: string;
  readonly installationId: string;
  readonly recordType: CloudSyncRecordType;
  readonly recordId: string;
  readonly operation: SyncOutboxOperationKind;
  /** Identifies one logical local mutation and remains stable for all retries. */
  readonly idempotencyKey: string;
  readonly payloadVersion: typeof CLOUD_SYNC_SCHEMA_VERSION;
  readonly expectedCloudVersion?: number;
  readonly state: SyncOutboxState;
  readonly attemptCount: number;
  readonly nextAttemptAt?: string;
  readonly lastAttemptAt?: string;
  readonly lastErrorCategory?: SyncErrorCategory;
  readonly lastError?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SyncCoordinatorLease {
  readonly ownerId: string;
  readonly installationId: string;
  readonly tabId: string;
  readonly acquiredAt: string;
  readonly heartbeatAt: string;
  readonly expiresAt: string;
}

export interface AutomaticSyncStatus {
  readonly state: AutomaticSyncState;
  readonly trigger?: AutomaticSyncTrigger;
  readonly scheduledFor?: string;
  readonly nextRetryAt?: string;
  readonly attempt: number;
  readonly lastErrorCategory?: SyncErrorCategory;
  readonly lastError?: string;
}

export interface LocalSyncMetadata {
  readonly id: string;
  readonly ownerId: string;
  readonly recordType: CloudSyncRecordType;
  readonly recordId: string;
  readonly cloudId: string;
  readonly cloudState: CloudState;
  readonly cloudVersion?: number;
  readonly lastSyncedAt?: string;
  readonly lastCloudUpdatedAt?: string;
  readonly localUpdatedAtAtLastSync?: string;
  readonly contentDigestAtLastSync?: string;
  readonly syncError?: string;
  readonly sourceDeviceId?: string;
  readonly origin: "local" | "cloud" | "restored";
}

export interface LocalSyncSession {
  readonly ownerId: string;
  readonly cursor: string;
  readonly lastAttemptAt?: string;
  readonly lastSuccessfulSyncAt?: string;
  readonly lastSummary?: SyncSummary;
  readonly initialLocalDataDecision: "unreviewed" | "keep-local" | "dismissed" | "uploaded";
  readonly updatedAt: string;
}

export type SyncConflictKind = "recipe-metadata" | "note-content" | "comparison-content" | "settings" | "scientific-integrity" | "delete";
export interface LocalSyncConflict {
  readonly id: string;
  readonly ownerId: string;
  readonly recordType: CloudSyncRecordType;
  readonly recordId: string;
  readonly kind: SyncConflictKind;
  readonly recordName: string;
  readonly localUpdatedAt?: string;
  readonly cloudUpdatedAt?: string;
  readonly sourceDeviceId?: string;
  readonly localValue: unknown;
  readonly cloudValue: unknown;
  readonly fields: readonly string[];
  readonly createdAt: string;
  readonly status: "open" | "resolved";
}

export interface QuarantinedCloudRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly recordType: CloudSyncRecordType;
  readonly cloudId?: string;
  readonly recordId?: string;
  readonly code: string;
  readonly message: string;
  readonly schemaVersion?: string;
  readonly receivedAt: string;
}

export interface LocalDeviceRecord {
  readonly ownerId: string;
  readonly installationId: string;
  readonly displayName?: string;
  readonly updatedAt: string;
}

export interface CloudRecipe {
  readonly cloudId: string;
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly targetFormula: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly currentRevisionId: string;
  readonly archivedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
  readonly deletedAt?: string;
  readonly syncSequence: string;
  readonly sourceDeviceId?: string;
}

export interface CloudRecipeRevision {
  readonly cloudId: string;
  readonly id: string;
  readonly recipeCloudId: string;
  readonly recipeId: string;
  readonly ownerId: string;
  readonly revisionNumber: number;
  readonly scientificInput: RecipeRevision;
  readonly calculationSnapshot: CalculationSnapshot;
  readonly schemaVersion: string;
  readonly engineVersion: string;
  readonly revisionNote?: string;
  readonly createdAt: string;
  readonly contentDigest: string;
  readonly syncSequence: string;
  readonly sourceDeviceId?: string;
}

export interface CloudRecipeNote {
  readonly cloudId: string;
  readonly id: string;
  readonly recipeCloudId: string;
  readonly recipeId: string;
  readonly revisionCloudId?: string;
  readonly revisionId?: string;
  readonly ownerId: string;
  readonly note: RecipeNote;
  readonly version: number;
  readonly deletedAt?: string;
  readonly syncSequence: string;
  readonly sourceDeviceId?: string;
}

export interface CloudComparison {
  readonly cloudId: string;
  readonly id: string;
  readonly ownerId: string;
  readonly comparison: ComparisonWorkspace;
  readonly version: number;
  readonly deletedAt?: string;
  readonly syncSequence: string;
  readonly sourceDeviceId?: string;
}

export interface CloudUserSettings {
  readonly ownerId: string;
  readonly settings: LocalUserSettings;
  readonly version: number;
  readonly syncSequence: string;
  readonly sourceDeviceId?: string;
}

export interface CloudDevice {
  readonly cloudId: string;
  readonly installationId: string;
  readonly displayName?: string;
  readonly lastSyncAt?: string;
  readonly updatedAt: string;
}

export interface CloudChangeSet {
  readonly ownerId: string;
  readonly cursor: string;
  readonly recipes: readonly CloudRecipe[];
  readonly revisions: readonly CloudRecipeRevision[];
  readonly notes: readonly CloudRecipeNote[];
  readonly comparisons: readonly CloudComparison[];
  readonly settings?: CloudUserSettings;
  readonly devices: readonly CloudDevice[];
}

export interface LocalRecipeBundle {
  readonly recipe: SavedRecipe;
  readonly revisions: readonly RecipeRevision[];
  readonly snapshots: readonly CalculationSnapshot[];
}

export interface CloudRecipeBundle {
  readonly recipe: CloudRecipe;
  readonly revisions: readonly CloudRecipeRevision[];
}

export type CloudWriteOperation =
  | Readonly<{ kind: "upsert-recipe-bundle"; bundle: LocalRecipeBundle; mappings: Readonly<{ recipeCloudId: string; revisionCloudIds: Readonly<Record<string, string>> }>; expectedVersion?: number; sourceDeviceId: string }>
  | Readonly<{ kind: "soft-delete-recipe"; id: string; cloudId: string; expectedVersion: number; sourceDeviceId: string }>
  | Readonly<{ kind: "upsert-note"; note: RecipeNote; cloudId: string; recipeCloudId: string; revisionCloudId?: string; expectedVersion?: number; sourceDeviceId: string }>
  | Readonly<{ kind: "soft-delete-note"; id: string; cloudId: string; expectedVersion: number; sourceDeviceId: string }>
  | Readonly<{ kind: "upsert-comparison"; comparison: ComparisonWorkspace; cloudId: string; expectedVersion?: number; sourceDeviceId: string }>
  | Readonly<{ kind: "soft-delete-comparison"; id: string; cloudId: string; expectedVersion: number; sourceDeviceId: string }>
  | Readonly<{ kind: "upsert-settings"; settings: LocalUserSettings; expectedVersion?: number; sourceDeviceId: string }>
  | Readonly<{ kind: "upsert-device"; cloudId: string; installationId: string; displayName?: string; lastSyncAt?: string }>;

export interface CloudWriteResult {
  readonly operation: CloudWriteOperation["kind"];
  readonly recordId: string;
  readonly status: "applied" | "identical" | "conflict" | "error";
  readonly cloudVersion?: number;
  readonly cloudUpdatedAt?: string;
  readonly message?: string;
  readonly cloudRecord?: CloudRecipe | CloudRecipeNote | CloudComparison | CloudUserSettings;
}

export interface SyncCounts {
  readonly recipes: number;
  readonly revisions: number;
  readonly notes: number;
  readonly comparisons: number;
  readonly settings: number;
}

export interface SyncSummary {
  readonly status: "complete" | "partial" | "offline" | "failed";
  readonly startedAt: string;
  readonly completedAt: string;
  readonly uploaded: SyncCounts;
  readonly downloaded: SyncCounts;
  readonly conflicts: number;
  readonly quarantined: number;
  readonly errors: readonly string[];
  readonly errorCategory?: SyncErrorCategory;
  readonly retryable?: boolean;
  readonly phases: Readonly<Record<"session" | "pull" | "merge" | "upload" | "device" | "finalize", "complete" | "failed" | "skipped">>;
}

export interface AnonymousLocalDataSummary {
  readonly recipes: number;
  readonly revisions: number;
  readonly notes: number;
  readonly comparisons: number;
  readonly customSettings: boolean;
}

export interface CloudRecordCounts {
  readonly localOnly: number;
  readonly pendingUpload: number;
  readonly conflicts: number;
  readonly errors: number;
  readonly cloudRecords: number;
}

export const emptySyncCounts = (): SyncCounts => ({ recipes: 0, revisions: 0, notes: 0, comparisons: 0, settings: 0 });
export const syncMetadataId = (ownerId: string, recordType: CloudSyncRecordType, recordId: string): string => `${ownerId}:${recordType}:${recordId}`;
