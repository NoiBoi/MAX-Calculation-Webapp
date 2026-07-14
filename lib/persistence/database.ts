import Dexie, { type Table } from "dexie";
import type { CalculationSnapshot, ComparisonWorkspace, MigrationMetadata, RecentCalculation, RecipeNote, RecipeRevision, RouteRevision, SavedRecipe, SavedRoute, StoredAtomicRadiusDataset, WorkspaceLayout, WorkspaceRecoveryState } from "./entities";
import { migrateEditableWorkspaceInput, migrateRecord } from "./migrations";

export const DATABASE_VERSION = 7;

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

  constructor(name = "max-stoich-local") {
    super(name);
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
  }
}
