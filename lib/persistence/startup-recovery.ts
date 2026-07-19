import { ENGINE_VERSION } from "@max-stoich/chemistry-engine";
import { DATABASE_VERSION } from "./database";
import type { WorkspaceRecoveryState } from "./entities";
import type { LocalDataRepositories } from "./repositories";
import { createDefaultUserSettings, type LocalUserSettings } from "../settings/user-settings";
import { migrateEditableWorkspaceInput } from "./migrations";
import { buildWorkspaceCalculation } from "../workspace/adapter";
import type { WorkspaceRecipeState } from "../workspace/adapter";

export type StartupErrorCategory = "indexeddb-unavailable" | "quota-exceeded" | "database-blocked" | "migration-failed" | "recovery-record-corrupt" | "settings-record-corrupt" | "scientific-record-corrupt" | "unknown";

export interface StartupFailure {
  readonly category: StartupErrorCategory;
  readonly message: string;
  readonly technicalMessage: string;
  readonly databaseVersion: number;
  readonly appVersion: string;
  readonly timestamp: string;
  readonly savedScientificRecordsAppearIntact: boolean;
  readonly recoveryOnly: boolean;
}

export class StartupDataError extends Error {
  constructor(readonly category: StartupErrorCategory, message: string, readonly savedScientificRecordsAppearIntact = true) {
    super(message);
    this.name = "StartupDataError";
  }
}

export function classifyStartupError(error: unknown): StartupFailure {
  const technicalMessage = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const text = technicalMessage.toLowerCase();
  const explicit = error instanceof StartupDataError ? error.category : undefined;
  const category: StartupErrorCategory = explicit
    ?? (text.includes("quota") ? "quota-exceeded"
      : text.includes("blocked") || text.includes("versionchange") ? "database-blocked"
        : text.includes("indexeddb") || text.includes("idb") || text.includes("databaseclosed") ? "indexeddb-unavailable"
          : text.includes("migration") || text.includes("upgrade") || text.includes("versionerror") ? "migration-failed"
            : "unknown");
  const messages: Record<StartupErrorCategory, string> = {
    "indexeddb-unavailable": "Local browser storage is unavailable. Check private-browsing or storage restrictions, then retry.",
    "quota-exceeded": "Local storage is full. Export a diagnostic backup if possible, free browser storage, and retry.",
    "database-blocked": "Another MAXCalc tab is preventing a local database upgrade. Close other tabs and retry.",
    "migration-failed": "The local database could not finish its version upgrade. Saved records were not reset.",
    "recovery-record-corrupt": "The last unsaved workspace cannot be restored, but saved scientific records appear intact.",
    "settings-record-corrupt": "Local settings could not be read. Saved recipes were not deleted.",
    "scientific-record-corrupt": "A saved scientific record failed its startup integrity check. No records were changed.",
    unknown: "The local workspace could not be opened. No automatic reset was performed.",
  };
  return {
    category,
    message: messages[category],
    technicalMessage,
    databaseVersion: DATABASE_VERSION,
    appVersion: ENGINE_VERSION,
    timestamp: new Date().toISOString(),
    savedScientificRecordsAppearIntact: error instanceof StartupDataError ? error.savedScientificRecordsAppearIntact : category !== "scientific-record-corrupt",
    recoveryOnly: category === "recovery-record-corrupt",
  };
}

function validRecovery(value: unknown): value is WorkspaceRecoveryState {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<WorkspaceRecoveryState>;
  return record.id === "current"
    && Boolean(record.committedRecipe && typeof record.committedRecipe === "object")
    && (record.mode === "standard" || record.mode === "advanced")
    && typeof record.unsavedChanges === "boolean"
    && typeof record.committedEditSequence === "number";
}

export async function loadStartupData(repositories: LocalDataRepositories, options: Readonly<{ skipRecovery?: boolean }> = {}): Promise<Readonly<{ settings: LocalUserSettings; recovery?: WorkspaceRecoveryState; settingsWarning?: string }>> {
  repositories.close();
  await repositories.database.open();
  let settings: LocalUserSettings;
  let settingsWarning: string | undefined;
  try {
    settings = await repositories.getSettings();
  } catch (error) {
    settings = createDefaultUserSettings();
    settingsWarning = `Settings record was unreadable and defaults are being used for this session: ${error instanceof Error ? error.message : "invalid settings"}`;
  }
  const integrity = await repositories.checkStartupIntegrity();
  const scientificFailure = integrity.diagnostics.find((item) => item.blocking);
  if (scientificFailure) throw new StartupDataError("scientific-record-corrupt", scientificFailure.message, false);
  if (options.skipRecovery) return { settings, ...(settingsWarning ? { settingsWarning } : {}) };
  const raw = await repositories.database.recovery.get("current") as unknown;
  if (raw !== undefined && !validRecovery(raw)) throw new StartupDataError("recovery-record-corrupt", "The recovery record is missing required workspace fields.");
  return { settings, ...(raw ? { recovery: raw } : {}), ...(settingsWarning ? { settingsWarning } : {}) };
}

export async function repairRecoveryRecord(repositories: LocalDataRepositories): Promise<WorkspaceRecoveryState | undefined> {
  const raw = await repositories.database.recovery.get("current") as unknown;
  if (!raw || typeof raw !== "object") { await repositories.clearRecovery(); return undefined; }
  const source = raw as Partial<WorkspaceRecoveryState> & { committedRecipe?: unknown };
  if (!source.committedRecipe || typeof source.committedRecipe !== "object") { await repositories.clearRecovery(); return undefined; }
  const committedRecipe = migrateEditableWorkspaceInput(source.committedRecipe) as WorkspaceRecipeState;
  const calculation = buildWorkspaceCalculation(committedRecipe);
  if (calculation.state !== "valid" && calculation.state !== "valid-with-warnings") {
    await repositories.clearRecovery();
    return undefined;
  }
  const repaired: WorkspaceRecoveryState = {
    schemaVersion: "8.0.0", id: "current", committedRecipe,
    mode: source.mode === "advanced" ? "advanced" : "standard",
    activePanel: "none", inputPanelCollapsed: false,
    ...(typeof source.baseRecipeId === "string" ? { baseRecipeId: source.baseRecipeId } : {}),
    ...(typeof source.baseRevisionId === "string" ? { baseRevisionId: source.baseRevisionId } : {}),
    savedAsRecipe: Boolean(source.savedAsRecipe), unsavedChanges: Boolean(source.unsavedChanges),
    committedEditSequence: Number.isSafeInteger(source.committedEditSequence) ? source.committedEditSequence! : 0,
    updatedAt: new Date().toISOString(),
  };
  await repositories.saveRecovery(repaired);
  return repaired;
}
