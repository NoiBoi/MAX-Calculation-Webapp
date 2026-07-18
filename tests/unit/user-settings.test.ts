import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { createLocalBackup, restoreBackup, serializeBackup } from "../../lib/persistence/backup";
import { MaxStoichDatabase } from "../../lib/persistence/database";
import { LocalDataRepositories } from "../../lib/persistence/repositories";
import { canonicalizeWorkspaceScientificInput } from "../../lib/persistence/canonical";
import { applyFeedDefaultsToNewTemplate, createDefaultUserSettings, migrateUserSettings, validateDisplaySettings, validateUserSettings } from "../../lib/settings/user-settings";
import type { WorkspaceRecipeState } from "../../lib/workspace/adapter";
import { getWorkspacePreset } from "../../lib/workspace/presets";

const repositories: LocalDataRepositories[] = [];
const repository = () => { const value = new LocalDataRepositories(new MaxStoichDatabase(`settings-${crypto.randomUUID()}`)); repositories.push(value); return value; };
afterEach(async () => { while (repositories.length) await repositories.pop()!.deleteDatabase(); });

describe("local user settings", () => {
  it("loads documented defaults and persists independent feed, save, display, order, radius, and sort settings across reopen", async () => {
    const repo = repository(); const defaults = await repo.getSettings();
    expect(defaults.appearance).toBe("system"); expect(defaults.feedDefaults).toEqual({ aluminumPerFormula: "1", carbonPerFormula: { "211": "1", "312": "2", "413": "3" } }); expect(defaults.saveBehavior.defaultPostSaveAction).toBe("save");
    const changed = { ...defaults, appearance: "dark" as const, feedDefaults: { aluminumPerFormula: "1.2", carbonPerFormula: { "211": "0.9", "312": "1.8", "413": "2.7" } }, saveBehavior: { defaultPostSaveAction: "save-and-copy" as const }, resultDisplay: { ...defaults.resultDisplay, standard: { visibleFields: ["precursor-name", "formula", "final-mass"] as const, columnOrder: [...defaults.resultDisplay.standard.columnOrder].reverse() }, atomicRadiusDatasetId: "cordero-covalent-2008", weighingSort: "mass-desc" as const } };
    await repo.saveSettings(changed); repo.close(); await repo.database.open(); const reopened = await repo.getSettings(); expect(reopened.appearance).toBe("dark"); expect(reopened.feedDefaults.carbonPerFormula).toEqual({ "211": "0.9", "312": "1.8", "413": "2.7" }); expect(reopened.resultDisplay.standard.columnOrder).toEqual(changed.resultDisplay.standard.columnOrder); expect(reopened.resultDisplay.advanced).toEqual(defaults.resultDisplay.advanced); expect(reopened.saveBehavior.defaultPostSaveAction).toBe("save-and-copy");
  });

  it("applies user feed defaults only to new compatible carbide templates", () => {
    const settings = { ...createDefaultUserSettings(), feedDefaults: { aluminumPerFormula: "1.2", carbonPerFormula: { "211": "0.9", "312": "1.8", "413": "2.7" } } };
    const state = (targetFormula: string): WorkspaceRecipeState => ({ transientId: "new", presetId: "custom", targetFormula, precursors: [], requestedMassGrams: "10", basis: "ideal-product-mass", expectedYieldPercent: "80", aluminumPerFormula: "", precursorExcessId: "", precursorExcessPercent: "0", handlingLossPercent: "0", balanceIncrementGrams: "0.001", roundingMode: "nearest-half-even", practicalMinimumMassGrams: "0.001", objective: "deterministic-feasible", routeOrigin: { kind: "manual" } });
    expect(applyFeedDefaultsToNewTemplate(state("Ti2AlC"), settings, "211")).toMatchObject({ targetFormula: "Ti2AlC0.9", aluminumPerFormula: "1.2" });
    expect(applyFeedDefaultsToNewTemplate(state("Ti3AlC2"), settings, "312")).toMatchObject({ targetFormula: "Ti3AlC1.8", aluminumPerFormula: "1.2" });
    expect(applyFeedDefaultsToNewTemplate(state("Ti4AlC3"), settings, "413")).toMatchObject({ targetFormula: "Ti4AlC2.7", aluminumPerFormula: "1.2" });
    expect(getWorkspacePreset("ti2aln").targetFormula).toBe("Ti2AlN"); expect(getWorkspacePreset("ti3alcn").targetFormula).toBe("Ti3Al(C0.5N0.5)2");
  });

  it("does not alter existing scientific input when display or future defaults change", () => {
    const existing: WorkspaceRecipeState = { transientId: "saved", presetId: "custom", targetFormula: "Ti4AlC2.7", precursors: [], requestedMassGrams: "10", basis: "ideal-product-mass", expectedYieldPercent: "80", aluminumPerFormula: "1.2", precursorExcessId: "", precursorExcessPercent: "0", handlingLossPercent: "0", balanceIncrementGrams: "0.001", roundingMode: "nearest-half-even", practicalMinimumMassGrams: "0.001", objective: "deterministic-feasible", routeOrigin: { kind: "manual" } };
    const before = canonicalizeWorkspaceScientificInput(existing); const changed = { ...createDefaultUserSettings(), feedDefaults: { aluminumPerFormula: "1.1", carbonPerFormula: { "211": "0.8", "312": "1.7", "413": "2.6" } } };
    expect(canonicalizeWorkspaceScientificInput(existing)).toBe(before); expect(changed.feedDefaults.aluminumPerFormula).toBe("1.1");
  });

  it("protects final mass, precursor identity, and advanced diagnostic access", () => {
    const defaults = createDefaultUserSettings();
    expect(validateDisplaySettings({ ...defaults.resultDisplay.standard, visibleFields: ["formula"] }, "standard")).toContain("Final weighing mass must remain visible.");
    expect(validateDisplaySettings({ ...defaults.resultDisplay.standard, visibleFields: ["final-mass"] }, "standard")).toContain("Keep Precursor or Formula visible so every row has an identity.");
    expect(validateDisplaySettings({ ...defaults.resultDisplay.advanced, visibleFields: ["precursor-name", "final-mass"] }, "advanced")).toContain("Advanced mode must retain Status or Warning indicator.");
  });

  it("includes settings in verified backup and restores them without changing other records", async () => {
    const source = repository(); const current = await source.getSettings(); const changed = { ...current, appearance: "midnight" as const, feedDefaults: { aluminumPerFormula: "1.25", carbonPerFormula: { "211": "0.95", "312": "1.9", "413": "2.85" } }, print: { ...current.print, paperSize: "a4" as const, orientation: "landscape" as const, recipesPerPage: 6 as const } }; await source.saveSettings(changed);
    const backup = await createLocalBackup(source.database); expect(backup.records.userSettings[0]?.feedDefaults.aluminumPerFormula).toBe("1.25");
    const target = repository(); await target.getSettings(); await restoreBackup(serializeBackup(backup), target.database, "replace"); const restored = await target.getSettings(); expect(restored.appearance).toBe("midnight"); expect(restored.feedDefaults.carbonPerFormula["413"]).toBe("2.85"); expect(restored.print).toMatchObject({ paperSize: "a4", orientation: "landscape", recipesPerPage: 6 });
  });

  it("migrates schema 1 settings to recommended print defaults and protects required print fields", () => {
    const current = createDefaultUserSettings(); const legacy = { ...current, schemaVersion: "1.0.0" }; delete (legacy as { print?: unknown }).print;
    expect(migrateUserSettings(legacy).print).toEqual(current.print);
    expect(validateUserSettings({ ...current, print: { ...current.print, fields: { ...current.print.fields, finalMass: false } } })).toContain("Print settings must retain recipe identity, adjusted feed, precursor identity, final mass, and total mass.");
  });

  it("migrates schema 2 settings without appearance to the documented System default", () => {
    const legacy = { ...createDefaultUserSettings(), schemaVersion: "2.0.0" }; delete (legacy as { appearance?: unknown }).appearance;
    expect(migrateUserSettings(legacy).appearance).toBe("system");
  });

  it("keeps existing schema 3 Dark users on revised Dark and accepts Midnight", () => {
    expect(migrateUserSettings({ ...createDefaultUserSettings(), schemaVersion: "3.0.0", appearance: "dark" }).appearance).toBe("dark");
    expect(migrateUserSettings({ ...createDefaultUserSettings(), appearance: "midnight" }).appearance).toBe("midnight");
  });

  it("migrates schema 4 settings to safe automatic-sync defaults", () => {
    const legacy = { ...createDefaultUserSettings(), schemaVersion: "4.0.0" };
    delete (legacy as { cloudSync?: unknown }).cloudSync;
    expect(migrateUserSettings(legacy).cloudSync).toMatchObject({ automaticSync: true, syncAfterLocalChanges: true, syncOnReconnect: true, paused: false });
  });

  it("rejects unsupported future settings schemas and reset changes only settings", async () => {
    expect(() => migrateUserSettings({ ...createDefaultUserSettings(), schemaVersion: "99.0.0" })).toThrow(/Unsupported future/);
    const repo = repository(); const defaults = await repo.getSettings(); await repo.saveSettings({ ...defaults, saveBehavior: { defaultPostSaveAction: "save-and-blank" } }); await repo.database.layouts.put({ schemaVersion: "8.0.0", layoutSchemaVersion: "1.0.0", id: "layout-test", name: "Keep", kind: "calculator", builtIn: false, isDefault: false, density: "comfortable", inputWidthPercent: 40, visibleColumns: ["formula", "final-mass", "status"], summaryExpanded: false, tracePlacement: "below", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
    expect((await repo.resetSettings()).saveBehavior.defaultPostSaveAction).toBe("save"); expect(await repo.database.layouts.get("layout-test")).toBeDefined();
  });
});
