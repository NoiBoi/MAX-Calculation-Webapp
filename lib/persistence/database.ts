import Dexie, { type Table } from "dexie";
import type { CalculationSnapshot, ComparisonWorkspace, MigrationMetadata, RecentCalculation, RecipeNote, RecipeRevision, RouteRevision, SavedRecipe, SavedRoute, StoredAtomicRadiusDataset, WorkspaceLayout, WorkspaceRecoveryState } from "./entities";
import type { LocalUserSettings } from "../settings/user-settings";
import { createDefaultUserSettings } from "../settings/user-settings";
import { migrateEditableWorkspaceInput, migrateRecord } from "./migrations";
import type { LocalDeviceRecord, LocalSyncConflict, LocalSyncMetadata, LocalSyncSession, QuarantinedCloudRecord, SyncCoordinatorLease, SyncOutboxOperation } from "../cloud/sync-types";
import type { LabAuditEvent, LabLibraryEntry, LabLibraryVersion, LabMembership, LabPublicationNote, LabSummary, LabSyncSession } from "../labs/types";
import type { EmiProjectRecord } from "../emi/project";

export const DATABASE_VERSION = 12;

export class MaxStoichDatabase extends Dexie {
  recipes!: Table<SavedRecipe, string>;
  recipeRevisions!: Table<RecipeRevision, string>;
  snapshots!: Table<CalculationSnapshot, string>;
  routes!: Table<SavedRoute, string>;
  routeRevisions!: Table<RouteRevision, string>;
  recentCalculations!: Table<RecentCalculation, string>;
  recovery!: Table<WorkspaceRecoveryState, string>;
  migrations!: Table<MigrationMetadata, string>;
  comparisons!: Table<ComparisonWorkspace, string>;
  layouts!: Table<WorkspaceLayout, string>;
  radiusDatasets!: Table<StoredAtomicRadiusDataset, string>;
  recipeNotes!: Table<RecipeNote, string>;
  userSettings!: Table<LocalUserSettings, string>;
  cloudSyncRecords!: Table<LocalSyncMetadata, string>;
  cloudSyncSessions!: Table<LocalSyncSession, string>;
  cloudConflicts!: Table<LocalSyncConflict, string>;
  cloudQuarantine!: Table<QuarantinedCloudRecord, string>;
  cloudDevices!: Table<LocalDeviceRecord, string>;
  cloudSyncOutbox!: Table<SyncOutboxOperation, string>;
  cloudSyncLeases!: Table<SyncCoordinatorLease, string>;
  labCaches!: Table<LabSummary, string>;
  labMemberships!: Table<LabMembership, string>;
  labEntries!: Table<LabLibraryEntry, string>;
  labVersions!: Table<LabLibraryVersion, string>;
  labPublicationNotes!: Table<LabPublicationNote, string>;
  labAuditEvents!: Table<LabAuditEvent, string>;
  labSyncSessions!: Table<LabSyncSession, string>;
  emiProjects!: Table<EmiProjectRecord, string>;

  constructor(name = "max-stoich-local") {
    super(name);
    this.on("versionchange", () => this.close());
    this.version(1).stores({ recipes: "&id,name,updatedAt,archived,currentRevisionNumber", recipeRevisions: "&id,[recipeId+revisionNumber],recipeId", snapshots: "&id,recipeId,recipeRevisionId", routes: "&id,name,updatedAt,archived", routeRevisions: "&id,[routeId+revisionNumber],routeId", recentCalculations: "&snapshotId,lastOpenedAt,recipeId", recovery: "&id", migrations: "&id" });
    this.version(2).stores({ recipes: "&id,name,targetFormula,updatedAt,archived,currentRevisionNumber,validationStatus", recipeRevisions: "&id,[recipeId+revisionNumber],recipeId", snapshots: "&id,recipeId,recipeRevisionId,createdAt", routes: "&id,name,updatedAt,archived,validationStatus", routeRevisions: "&id,[routeId+revisionNumber],routeId", recentCalculations: "&snapshotId,lastOpenedAt,recipeId", recovery: "&id", migrations: "&id" }).upgrade(async (transaction) => {
      await transaction.table("recipes").toCollection().modify((record: Record<string, unknown>) => Object.assign(record, migrateRecord(record, 1, 2)));
      await transaction.table("routes").toCollection().modify((record: Record<string, unknown>) => Object.assign(record, migrateRecord(record, 1, 2)));
      await transaction.table("migrations").put({ schemaVersion: "2.0.0", id: "1-to-2", fromVersion: 1, toVersion: 2, appliedAt: new Date().toISOString(), status: "complete" });
    });
    this.version(3).stores({ recipes: "&id,name,targetFormula,updatedAt,archived,currentRevisionNumber,validationStatus", recipeRevisions: "&id,[recipeId+revisionNumber],recipeId", snapshots: "&id,recipeId,recipeRevisionId,createdAt", routes: "&id,name,updatedAt,archived,validationStatus", routeRevisions: "&id,[routeId+revisionNumber],routeId", recentCalculations: "&snapshotId,lastOpenedAt,recipeId", recovery: "&id", migrations: "&id", comparisons: "&id,name,updatedAt,validationStatus", layouts: "&id,name,kind,isDefault,builtIn,updatedAt" }).upgrade(async (transaction) => {
      for (const tableName of ["recipes", "routes", "recentCalculations", "recovery", "migrations"]) await transaction.table(tableName).toCollection().modify((record: Record<string, unknown>) => Object.assign(record, migrateRecord(record, 2, 3)));
      await transaction.table("migrations").put({ schemaVersion: "3.0.0", id: "2-to-3", fromVersion: 2, toVersion: 3, appliedAt: new Date().toISOString(), status: "complete" });
    });
    this.version(4).stores({ recipes: "&id,name,targetFormula,updatedAt,archived,currentRevisionNumber,validationStatus", recipeRevisions: "&id,[recipeId+revisionNumber],recipeId", snapshots: "&id,recipeId,recipeRevisionId,createdAt", routes: "&id,name,updatedAt,archived,validationStatus", routeRevisions: "&id,[routeId+revisionNumber],routeId", recentCalculations: "&snapshotId,lastOpenedAt,recipeId", recovery: "&id", migrations: "&id", comparisons: "&id,name,updatedAt,validationStatus", layouts: "&id,name,kind,isDefault,builtIn,updatedAt", radiusDatasets: "&id,&[datasetId+datasetVersion],datasetId,datasetVersion,localTrust,updatedAt" }).upgrade(async (transaction) => {
      for (const tableName of ["recipes", "routes", "recentCalculations", "recovery", "migrations", "comparisons", "layouts"]) await transaction.table(tableName).toCollection().modify((record: Record<string, unknown>) => Object.assign(record, migrateRecord(record, 3, 4)));
      await transaction.table("migrations").put({ schemaVersion: "4.0.0", id: "3-to-4", fromVersion: 3, toVersion: 4, appliedAt: new Date().toISOString(), status: "complete" });
    });
    this.version(5).stores({ recipes: "&id,name,targetFormula,updatedAt,archived,currentRevisionNumber,validationStatus", recipeRevisions: "&id,[recipeId+revisionNumber],recipeId", snapshots: "&id,recipeId,recipeRevisionId,createdAt", routes: "&id,name,updatedAt,archived,validationStatus", routeRevisions: "&id,[routeId+revisionNumber],routeId", recentCalculations: "&snapshotId,lastOpenedAt,recipeId", recovery: "&id", migrations: "&id", comparisons: "&id,name,updatedAt,validationStatus", layouts: "&id,name,kind,isDefault,builtIn,updatedAt", radiusDatasets: "&id,&[datasetId+datasetVersion],datasetId,datasetVersion,localTrust,updatedAt" }).upgrade(async (transaction) => {
      for (const tableName of ["recipes", "recipeRevisions", "snapshots", "routes", "routeRevisions", "recentCalculations", "recovery", "migrations", "comparisons", "layouts", "radiusDatasets"]) await transaction.table(tableName).toCollection().modify((record: Record<string, unknown>) => { Object.assign(record, migrateRecord(record, 4, 5)); if (tableName === "snapshots" && record.radiusDatasetSelections === undefined) record.radiusDatasetSelections = null; });
      await transaction.table("migrations").put({ schemaVersion: "5.0.0", id: "4-to-5", fromVersion: 4, toVersion: 5, appliedAt: new Date().toISOString(), status: "complete" });
    });
    this.version(6).stores({ recipes: "&id,name,targetFormula,updatedAt,archived,currentRevisionNumber,validationStatus", recipeRevisions: "&id,[recipeId+revisionNumber],recipeId", snapshots: "&id,recipeId,recipeRevisionId,createdAt", routes: "&id,name,updatedAt,archived,validationStatus", routeRevisions: "&id,[routeId+revisionNumber],routeId", recentCalculations: "&snapshotId,lastOpenedAt,recipeId", recovery: "&id", migrations: "&id", comparisons: "&id,name,updatedAt,validationStatus", layouts: "&id,name,kind,isDefault,builtIn,updatedAt", radiusDatasets: "&id,&[datasetId+datasetVersion],datasetId,datasetVersion,localTrust,updatedAt" }).upgrade(async (transaction) => {
      for (const tableName of ["recipes", "routes", "recentCalculations", "recovery", "migrations", "comparisons", "layouts", "radiusDatasets"]) await transaction.table(tableName).toCollection().modify((record: Record<string, unknown>) => {
        Object.assign(record, migrateRecord(record, 5, 6));
        if (tableName === "recovery" && record.committedRecipe) record.committedRecipe = migrateEditableWorkspaceInput(record.committedRecipe);
        if (tableName === "comparisons" && Array.isArray(record.scenarios)) record.scenarios = record.scenarios.map((scenario: Record<string, unknown>) => ({ ...scenario, inputState: migrateEditableWorkspaceInput(scenario.inputState) }));
      });
      await transaction.table("migrations").put({ schemaVersion: "6.0.0", id: "5-to-6-aluminum-feed-coefficient", fromVersion: 5, toVersion: 6, appliedAt: new Date().toISOString(), status: "complete" });
    });
    this.version(7).stores({ recipes: "&id,name,targetFormula,updatedAt,archived,currentRevisionNumber,validationStatus", recipeRevisions: "&id,[recipeId+revisionNumber],recipeId", snapshots: "&id,recipeId,recipeRevisionId,createdAt", routes: "&id,name,updatedAt,archived,validationStatus", routeRevisions: "&id,[routeId+revisionNumber],routeId", recentCalculations: "&snapshotId,lastOpenedAt,recipeId", recovery: "&id", migrations: "&id", comparisons: "&id,name,updatedAt,validationStatus", layouts: "&id,name,kind,isDefault,builtIn,updatedAt", radiusDatasets: "&id,&[datasetId+datasetVersion],datasetId,datasetVersion,localTrust,updatedAt", recipeNotes: "&id,recipeId,recipeRevisionId,category,updatedAt,archived,*tags" }).upgrade(async (transaction) => {
      for (const tableName of ["recipes", "routes", "recentCalculations", "recovery", "migrations", "comparisons", "layouts", "radiusDatasets"]) await transaction.table(tableName).toCollection().modify((record: Record<string, unknown>) => Object.assign(record, migrateRecord(record, 6, 7)));
      await transaction.table("migrations").put({ schemaVersion: "7.0.0", id: "6-to-7-recipe-notes", fromVersion: 6, toVersion: 7, appliedAt: new Date().toISOString(), status: "complete" });
    });
    this.version(8).stores({ recipes: "&id,name,targetFormula,updatedAt,archived,currentRevisionNumber,validationStatus", recipeRevisions: "&id,[recipeId+revisionNumber],recipeId", snapshots: "&id,recipeId,recipeRevisionId,createdAt", routes: "&id,name,updatedAt,archived,validationStatus", routeRevisions: "&id,[routeId+revisionNumber],routeId", recentCalculations: "&snapshotId,lastOpenedAt,recipeId", recovery: "&id", migrations: "&id", comparisons: "&id,name,updatedAt,validationStatus", layouts: "&id,name,kind,isDefault,builtIn,updatedAt", radiusDatasets: "&id,&[datasetId+datasetVersion],datasetId,datasetVersion,localTrust,updatedAt", recipeNotes: "&id,recipeId,recipeRevisionId,category,updatedAt,archived,*tags", userSettings: "&id,updatedAt" }).upgrade(async (transaction) => {
      for (const tableName of ["recipes", "routes", "recentCalculations", "recovery", "migrations", "comparisons", "layouts", "radiusDatasets", "recipeNotes"]) await transaction.table(tableName).toCollection().modify((record: Record<string, unknown>) => Object.assign(record, migrateRecord(record, 7, 8)));
      await transaction.table("userSettings").put(createDefaultUserSettings());
      await transaction.table("migrations").put({ schemaVersion: "8.0.0", id: "7-to-8-local-user-settings", fromVersion: 7, toVersion: 8, appliedAt: new Date().toISOString(), status: "complete" });
    });
    this.version(9).stores({
      recipes: "&id,name,targetFormula,updatedAt,archived,currentRevisionNumber,validationStatus",
      recipeRevisions: "&id,[recipeId+revisionNumber],recipeId",
      snapshots: "&id,recipeId,recipeRevisionId,createdAt",
      routes: "&id,name,updatedAt,archived,validationStatus",
      routeRevisions: "&id,[routeId+revisionNumber],routeId",
      recentCalculations: "&snapshotId,lastOpenedAt,recipeId",
      recovery: "&id",
      migrations: "&id",
      comparisons: "&id,name,updatedAt,validationStatus",
      layouts: "&id,name,kind,isDefault,builtIn,updatedAt",
      radiusDatasets: "&id,&[datasetId+datasetVersion],datasetId,datasetVersion,localTrust,updatedAt",
      recipeNotes: "&id,recipeId,recipeRevisionId,category,updatedAt,archived,*tags",
      userSettings: "&id,updatedAt",
      cloudSyncRecords: "&id,ownerId,[ownerId+cloudState],[ownerId+recordType],recordId,cloudId",
      cloudSyncSessions: "&ownerId,lastSuccessfulSyncAt",
      cloudConflicts: "&id,ownerId,[ownerId+status],[ownerId+recordType],recordId",
      cloudQuarantine: "&id,ownerId,[ownerId+recordType],receivedAt",
      cloudDevices: "&ownerId,installationId",
    }).upgrade(async (transaction) => {
      for (const tableName of ["recipes", "routes", "recentCalculations", "recovery", "migrations", "comparisons", "layouts", "radiusDatasets", "recipeNotes"]) {
        await transaction.table(tableName).toCollection().modify((record: Record<string, unknown>) => Object.assign(record, migrateRecord(record, 8, 9)));
      }
      await transaction.table("migrations").put({ schemaVersion: "9.0.0", id: "8-to-9-explicit-cloud-sync", fromVersion: 8, toVersion: 9, appliedAt: new Date().toISOString(), status: "complete" });
    });
    this.version(10).stores({
      recipes: "&id,name,targetFormula,updatedAt,archived,currentRevisionNumber,validationStatus",
      recipeRevisions: "&id,[recipeId+revisionNumber],recipeId",
      snapshots: "&id,recipeId,recipeRevisionId,createdAt",
      routes: "&id,name,updatedAt,archived,validationStatus",
      routeRevisions: "&id,[routeId+revisionNumber],routeId",
      recentCalculations: "&snapshotId,lastOpenedAt,recipeId",
      recovery: "&id",
      migrations: "&id",
      comparisons: "&id,name,updatedAt,validationStatus",
      layouts: "&id,name,kind,isDefault,builtIn,updatedAt",
      radiusDatasets: "&id,&[datasetId+datasetVersion],datasetId,datasetVersion,localTrust,updatedAt",
      recipeNotes: "&id,recipeId,recipeRevisionId,category,updatedAt,archived,*tags",
      userSettings: "&id,updatedAt",
      cloudSyncRecords: "&id,ownerId,[ownerId+cloudState],[ownerId+recordType],recordId,cloudId",
      cloudSyncSessions: "&ownerId,lastSuccessfulSyncAt",
      cloudConflicts: "&id,ownerId,[ownerId+status],[ownerId+recordType],recordId",
      cloudQuarantine: "&id,ownerId,[ownerId+recordType],receivedAt",
      cloudDevices: "&ownerId,installationId",
      cloudSyncOutbox: "&id,ownerId,[ownerId+state],[ownerId+recordType],recordId,nextAttemptAt,idempotencyKey",
      cloudSyncLeases: "&ownerId,installationId,tabId,expiresAt",
    }).upgrade(async (transaction) => {
      for (const tableName of ["recipes", "routes", "recentCalculations", "recovery", "migrations", "comparisons", "layouts", "radiusDatasets", "recipeNotes"]) {
        await transaction.table(tableName).toCollection().modify((record: Record<string, unknown>) => Object.assign(record, migrateRecord(record, 9, 10)));
      }
      await transaction.table("userSettings").toCollection().modify((record: Record<string, unknown>) => Object.assign(record, createDefaultUserSettings(String(record.updatedAt ?? new Date().toISOString())), record, { schemaVersion: "5.0.0", cloudSync: { ...createDefaultUserSettings().cloudSync, ...(record.cloudSync as object | undefined) } }));
      const metadata = await transaction.table("cloudSyncRecords").toArray() as LocalSyncMetadata[];
      const now = new Date().toISOString();
      for (const item of metadata.filter((record) => record.cloudState === "pending-upload" || record.cloudState === "pending-delete")) {
        await transaction.table("cloudSyncOutbox").put({
          id: `${item.ownerId}:${item.recordType}:${item.recordId}`,
          ownerId: item.ownerId,
          installationId: item.sourceDeviceId ?? "pre-v10-device",
          recordType: item.recordType,
          recordId: item.recordId,
          operation: item.cloudState === "pending-delete" ? "soft-delete" : item.cloudVersion === undefined ? "create" : "update",
          idempotencyKey: `${item.ownerId}:${item.recordType}:${item.recordId}:v10-migration`,
          payloadVersion: "1.0.0",
          ...(item.cloudVersion !== undefined ? { expectedCloudVersion: item.cloudVersion } : {}),
          state: "pending",
          attemptCount: 0,
          createdAt: now,
          updatedAt: now,
        } satisfies SyncOutboxOperation);
      }
      await transaction.table("migrations").put({ schemaVersion: "10.0.0", id: "9-to-10-durable-automatic-sync-outbox", fromVersion: 9, toVersion: 10, appliedAt: now, status: "complete" });
    });
    this.version(11).stores({
      recipes: "&id,name,targetFormula,updatedAt,archived,currentRevisionNumber,validationStatus",
      recipeRevisions: "&id,[recipeId+revisionNumber],recipeId",
      snapshots: "&id,recipeId,recipeRevisionId,createdAt",
      routes: "&id,name,updatedAt,archived,validationStatus",
      routeRevisions: "&id,[routeId+revisionNumber],routeId",
      recentCalculations: "&snapshotId,lastOpenedAt,recipeId",
      recovery: "&id",
      migrations: "&id",
      comparisons: "&id,name,updatedAt,validationStatus",
      layouts: "&id,name,kind,isDefault,builtIn,updatedAt",
      radiusDatasets: "&id,&[datasetId+datasetVersion],datasetId,datasetVersion,localTrust,updatedAt",
      recipeNotes: "&id,recipeId,recipeRevisionId,category,updatedAt,archived,*tags",
      userSettings: "&id,updatedAt",
      cloudSyncRecords: "&id,ownerId,[ownerId+cloudState],[ownerId+recordType],recordId,cloudId",
      cloudSyncSessions: "&ownerId,lastSuccessfulSyncAt",
      cloudConflicts: "&id,ownerId,[ownerId+status],[ownerId+recordType],recordId",
      cloudQuarantine: "&id,ownerId,[ownerId+recordType],receivedAt",
      cloudDevices: "&ownerId,installationId",
      cloudSyncOutbox: "&id,ownerId,[ownerId+state],[ownerId+recordType],recordId,nextAttemptAt,idempotencyKey",
      cloudSyncLeases: "&ownerId,installationId,tabId,expiresAt",
      labCaches: "&id,name,role,updatedAt",
      labMemberships: "&id,labId,userId,[labId+status],role",
      labEntries: "&id,labId,[labId+visibilityStatus],updatedAt,syncSequence",
      labVersions: "&id,labId,entryId,[entryId+versionNumber],syncSequence",
      labPublicationNotes: "&id,labId,entryId,publicationVersionId,syncSequence",
      labAuditEvents: "&id,labId,eventType,occurredAt,syncSequence",
      labSyncSessions: "&id,ownerId,labId,lastSuccessfulSyncAt",
    }).upgrade(async (transaction) => {
      // Version 11 adds an independently namespaced lab cache. Existing
      // personal records, especially immutable revisions and snapshots, do not
      // need rewriting merely because new object stores were introduced.
      await transaction.table("migrations").put({ schemaVersion: "11.0.0", id: "10-to-11-private-lab-library-cache", fromVersion: 10, toVersion: 11, appliedAt: new Date().toISOString(), status: "complete" });
    });
    this.version(12).stores({
      recipes: "&id,name,targetFormula,updatedAt,archived,currentRevisionNumber,validationStatus", recipeRevisions: "&id,[recipeId+revisionNumber],recipeId", snapshots: "&id,recipeId,recipeRevisionId,createdAt", routes: "&id,name,updatedAt,archived,validationStatus", routeRevisions: "&id,[routeId+revisionNumber],routeId", recentCalculations: "&snapshotId,lastOpenedAt,recipeId", recovery: "&id", migrations: "&id", comparisons: "&id,name,updatedAt,validationStatus", layouts: "&id,name,kind,isDefault,builtIn,updatedAt", radiusDatasets: "&id,&[datasetId+datasetVersion],datasetId,datasetVersion,localTrust,updatedAt", recipeNotes: "&id,recipeId,recipeRevisionId,category,updatedAt,archived,*tags", userSettings: "&id,updatedAt", cloudSyncRecords: "&id,ownerId,[ownerId+cloudState],[ownerId+recordType],recordId,cloudId", cloudSyncSessions: "&ownerId,lastSuccessfulSyncAt", cloudConflicts: "&id,ownerId,[ownerId+status],[ownerId+recordType],recordId", cloudQuarantine: "&id,ownerId,[ownerId+recordType],receivedAt", cloudDevices: "&ownerId,installationId", cloudSyncOutbox: "&id,ownerId,[ownerId+state],[ownerId+recordType],recordId,nextAttemptAt,idempotencyKey", cloudSyncLeases: "&ownerId,installationId,tabId,expiresAt", labCaches: "&id,name,role,updatedAt", labMemberships: "&id,labId,userId,[labId+status],role", labEntries: "&id,labId,[labId+visibilityStatus],updatedAt,syncSequence", labVersions: "&id,labId,entryId,[entryId+versionNumber],syncSequence", labPublicationNotes: "&id,labId,entryId,publicationVersionId,syncSequence", labAuditEvents: "&id,labId,eventType,occurredAt,syncSequence", labSyncSessions: "&id,ownerId,labId,lastSuccessfulSyncAt", emiProjects: "&id,name,updatedAt,createdAt",
    }).upgrade(async (transaction) => {
      await transaction.table("migrations").put({ schemaVersion: "12.0.0", id: "11-to-12-local-emi-projects", fromVersion: 11, toVersion: 12, appliedAt: new Date().toISOString(), status: "complete" });
    });
  }
}
