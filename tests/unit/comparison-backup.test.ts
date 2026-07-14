import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { buildLaboratoryJson } from "../../lib/export/laboratory-export";
import { compareScenarios } from "../../lib/comparison/difference";
import { calculateComparison, createComparisonWorkspace, duplicateScenario, removeScenario, updateScenario, updateSharedTarget } from "../../lib/comparison/model";
import { createLocalBackup, createOwnedRecordExport, importApplicationCalculation, importOwnedRecord, previewApplicationCalculation, previewBackup, previewOwnedRecord, restoreBackup, serializeBackup } from "../../lib/persistence/backup";
import { MaxStoichDatabase } from "../../lib/persistence/database";
import { LocalDataRepositories } from "../../lib/persistence/repositories";
import type { WorkspaceRecipeState } from "../../lib/workspace/adapter";
import { buildWorkspaceCalculation } from "../../lib/workspace/adapter";
import { BUILT_IN_LAYOUTS } from "../../lib/layouts/layouts";
import { canonicalRadiusDatasetContent, type AtomicRadiusDataset } from "../../packages/chemistry-engine/radius-data";
import { sha256Hex, stableCanonicalize } from "../../lib/persistence/canonical";

const repositories: LocalDataRepositories[] = [];
function state(patch: Partial<WorkspaceRecipeState> = {}): WorkspaceRecipeState { return { transientId: "compare-test", presetId: "custom", targetFormula: "Ti2AlN", precursors: ["Ti", "Al", "N"].map((formula) => ({ id: formula.toLowerCase(), name: formula, formula, purityPercent: "100", constraintMode: "solver" as const, fixedValue: "", minimum: "", maximum: "", ratioDenominatorId: "", numeratorRatio: "1", denominatorRatio: "1", molarMassOverride: "", molarMassOverrideSource: "" })), requestedMassGrams: "10", basis: "ideal-product-mass", expectedYieldPercent: "80", aluminumPerFormula: "1", precursorExcessId: "", precursorExcessPercent: "0", handlingLossPercent: "0", balanceIncrementGrams: "0.001", roundingMode: "nearest-half-even", practicalMinimumMassGrams: "0.001", objective: "deterministic-feasible", ...patch }; }
function repo(): LocalDataRepositories { const value = new LocalDataRepositories(new MaxStoichDatabase(`milestone-${crypto.randomUUID()}`)); repositories.push(value); return value; }
function result(input = state()) { const calculation = buildWorkspaceCalculation(input); if (calculation.state !== "valid" && calculation.state !== "valid-with-warnings") throw new Error(calculation.errors[0]?.message); return calculation.result; }
afterEach(async () => { while (repositories.length) await repositories.pop()!.deleteDatabase(); });

describe("route comparison model and deterministic differences", () => {
  it("locks the shared target while keeping scenario routes independent", () => {
    let workspace = createComparisonWorkspace(state());
    const [first, second] = workspace.scenarios;
    workspace = updateScenario(workspace, second!.id, (input) => ({ ...input, requestedMassGrams: "20", precursors: input.precursors.map((item) => item.id === "al" ? { ...item, purityPercent: "90" } : item) }));
    expect(workspace.scenarios.find((item) => item.id === first!.id)?.inputState.requestedMassGrams).toBe("10");
    expect(workspace.scenarios.find((item) => item.id === first!.id)?.inputState.precursors.find((item) => item.id === "al")?.purityPercent).toBe("100");
    workspace = updateSharedTarget(workspace, { targetFormula: "Ti3AlC2" });
    expect(workspace.scenarios.every((item) => item.inputState.targetFormula === "Ti3AlC2")).toBe(true);
  });

  it("duplicates, enforces limits, and makes scenario removal reversible by immutable state", () => {
    const original = createComparisonWorkspace(state());
    let workspace = duplicateScenario(original, original.scenarios[0]!.id);
    workspace = duplicateScenario(workspace, workspace.scenarios[0]!.id);
    expect(workspace.scenarios).toHaveLength(4);
    expect(() => duplicateScenario(workspace, workspace.scenarios[0]!.id)).toThrow("at most 4");
    const beforeRemove = workspace;
    workspace = removeScenario(workspace, workspace.scenarios[3]!.id);
    expect(workspace.scenarios).toHaveLength(3);
    expect(beforeRemove.scenarios).toHaveLength(4);
  });

  it("aligns canonical precursor compositions, says missing rows are absent structurally, and never merges by display name", () => {
    let workspace = createComparisonWorkspace(state());
    const second = workspace.scenarios[1]!;
    workspace = updateScenario(workspace, second.id, (input) => ({ ...input, precursors: [{ ...input.precursors[0]!, id: "different-ti", name: "same display", formula: "Ti" }, { ...input.precursors[1]!, id: "tin", name: "same display", formula: "TiN" }] }));
    const difference = compareScenarios(workspace.scenarios, calculateComparison(workspace));
    const tiRow = difference.rows.find((row) => row.cells[workspace.scenarios[0]!.id]?.formula === "Ti");
    expect(tiRow?.cells[second.id]?.formula).toBe("Ti");
    expect(difference.rows.some((row) => row.cells[second.id]?.formula === "TiN" && row.cells[workspace.scenarios[0]!.id] === undefined)).toBe(true);
  });

  it("keeps one infeasible scenario isolated and reports warning/status differences", () => {
    let workspace = createComparisonWorkspace(state()); const second = workspace.scenarios[1]!;
    workspace = updateScenario(workspace, second.id, (input) => ({ ...input, precursors: input.precursors.filter((item) => item.id !== "n") }));
    const calculations = calculateComparison(workspace); const difference = compareScenarios(workspace.scenarios, calculations);
    expect(calculations[workspace.scenarios[0]!.id]?.state).toMatch(/^valid/);
    expect(calculations[second.id]?.state).toBe("solver-infeasible");
    expect(difference.summaries.find((item) => item.scenarioId === second.id)?.status).toBe("solver-infeasible");
  });

  it("persists historical comparison results without recalculation", async () => {
    const repository = repo(); const workspace = createComparisonWorkspace(state());
    await repository.saveComparison(workspace);
    const opened = await repository.getComparison(workspace.id);
    expect(opened).toEqual({ ...workspace, schemaVersion: "6.0.0", updatedAt: opened?.updatedAt });
    expect((await repository.checkIntegrity()).valid).toBe(true);
  });

  it("observes deterministic two- and four-scenario recalculation without a CI timing gate", () => {
    const two = createComparisonWorkspace(state()); let four = duplicateScenario(two, two.scenarios[0]!.id); four = duplicateScenario(four, four.scenarios[0]!.id);
    const twoStart = performance.now(); calculateComparison(two); const twoMs = performance.now() - twoStart; const fourStart = performance.now(); calculateComparison(four); const fourMs = performance.now() - fourStart;
    console.log(`Comparison performance observation: two=${twoMs.toFixed(1)}ms, four=${fourMs.toFixed(1)}ms`); expect(Object.keys(calculateComparison(four))).toHaveLength(4);
  });
});

describe("workspace layouts", () => {
  it("provides tested presets, blocks built-in mutation, and validates required output", async () => {
    const repository = repo(); expect(BUILT_IN_LAYOUTS.map((item) => item.name)).toEqual(["Simple Calculator", "Advanced Chemistry", "Route Comparison", "Compact Balance View"]);
    await expect(repository.saveLayout(BUILT_IN_LAYOUTS[0]!)).rejects.toThrow("cannot be overwritten");
    const now = new Date().toISOString();
    await expect(repository.saveLayout({ ...BUILT_IN_LAYOUTS[0]!, id: "bad", name: "Bad", builtIn: false, visibleColumns: ["formula"], createdAt: now, updatedAt: now })).rejects.toThrow("Final mass and status");
    await repository.saveLayout({ ...BUILT_IN_LAYOUTS[0]!, id: "user-layout", name: "Bench", builtIn: false, isDefault: true, createdAt: now, updatedAt: now });
    expect((await repository.listLayouts()).some((item) => item.name === "Bench")).toBe(true);
  });
});

describe("verified backup, restore, and owned JSON import", () => {
  async function populated() { const repository = repo(); const saved = await repository.saveCalculatedRevision({ name: "Backup recipe", inputState: state(), result: result() }); await repository.saveRouteRevision({ name: "Backup route", inputState: state() }); await repository.saveComparison(createComparisonWorkspace(state())); return { repository, saved }; }

  it("creates a full deterministic manifest and validates empty and populated backups", async () => {
    const empty = repo(); const emptyBackup = await createLocalBackup(empty.database); expect((await previewBackup(serializeBackup(emptyBackup))).valid).toBe(true);
    const { repository } = await populated(); const backup = await createLocalBackup(repository.database); const preview = await previewBackup(serializeBackup(backup));
    expect(preview.valid, JSON.stringify(preview.diagnostics)).toBe(true); expect(backup.manifest.counts).toMatchObject({ recipes: 1, recipeRevisions: 1, snapshots: 1, routes: 1, routeRevisions: 1, comparisons: 1 });
    expect(backup.manifest.manifestDigest).toMatch(/^[a-f0-9]{64}$/); expect(backup.manifest.datasetVersions).toContain("atomic-weights:2024.2.0"); expect(backup.manifest.counts.radiusDatasets).toBe(0);
  });

  it("previews without writes, replaces transactionally, and preserves exact rational data", async () => {
    const { repository: source } = await populated(); const text = serializeBackup(await createLocalBackup(source.database)); const target = repo();
    const preview = await previewBackup(text, target.database); expect(preview.valid).toBe(true); expect(await target.database.recipes.count()).toBe(0);
    const outcome = await restoreBackup(text, target.database, "replace"); expect(outcome.safetyBackup).toBeDefined(); expect(await target.database.recipes.count()).toBe(1);
    const snapshot = await target.database.snapshots.toCollection().first(); expect(snapshot?.result.precursors[0]?.solverMolesPerTargetFormulaMoleExact.denominator).toBe("1");
  });

  it("detects conflicts, keeps local, or imports a connected immutable graph under new identities", async () => {
    const { repository: source } = await populated(); const text = serializeBackup(await createLocalBackup(source.database)); const target = repo(); await restoreBackup(text, target.database, "replace");
    const recipe = (await target.listRecipes())[0]!; await target.renameRecipe(recipe.id, "Local changed name");
    const preview = await previewBackup(text, target.database); expect(preview.conflicts.some((item) => item.table === "recipes" && item.kind === "divergent")).toBe(true);
    await restoreBackup(text, target.database, "merge", "keep-local"); expect(await target.database.recipes.count()).toBe(1); expect((await target.listRecipes())[0]?.name).toBe("Local changed name");
    await restoreBackup(text, target.database, "merge", "import-as-new"); expect(await target.database.recipes.count()).toBe(2); expect(await target.database.recipeRevisions.count()).toBe(2); expect(await target.database.snapshots.count()).toBe(2);
  });

  it("rejects tampered, future, missing-reference, and oversized backups", async () => {
    const { repository } = await populated(); const backup = await createLocalBackup(repository.database);
    const tampered = structuredClone(backup); (tampered.records.snapshots[0]!.result.batch as { finalRoundedTotalWeighingMassGrams: string }).finalRoundedTotalWeighingMassGrams = "999";
    expect((await previewBackup(JSON.stringify(tampered))).diagnostics.some((item) => item.code.includes("DIGEST") || item.code.includes("TAMPERED"))).toBe(true);
    expect((await previewBackup(JSON.stringify({ ...backup, backupSchemaVersion: "99.0.0" }))).valid).toBe(false);
    const missing = structuredClone(backup) as unknown as { records: { snapshots: unknown[] } }; missing.records.snapshots = []; expect((await previewBackup(JSON.stringify(missing))).valid).toBe(false);
    expect((await previewBackup(`{"recordType":"max-stoich-local-backup","padding":"${"x".repeat(10 * 1024 * 1024)}"}`)).diagnostics[0]?.code).toBe("IMPORT_TOO_LARGE");
  });

  it("rolls back an interrupted replace restore", async () => {
    const { repository: source } = await populated(); const text = serializeBackup(await createLocalBackup(source.database)); const target = repo(); await target.saveCalculatedRevision({ name: "Keep me", inputState: state({ requestedMassGrams: "20" }), result: result(state({ requestedMassGrams: "20" })) });
    await expect(restoreBackup(text, target.database, "replace", "keep-local", "recipes")).rejects.toThrow("Simulated");
    expect((await target.listRecipes())[0]?.name).toBe("Keep me"); expect(await target.database.snapshots.count()).toBe(1);
  });

  it("previews and imports a complete saved calculation without silently recalculating", async () => {
    const { repository, saved } = await populated(); const json = buildLaboratoryJson({ recipeName: saved.recipe.name, recipe: saved.recipe, revision: saved.revision, snapshot: saved.snapshot, inputState: saved.revision.inputState, result: saved.snapshot.result, calculatedAt: saved.snapshot.createdAt });
    const preview = await previewApplicationCalculation(json); expect(preview.valid).toBe(true); expect(preview.engineVersion).toBe(saved.snapshot.engineVersion);
    const target = repo(); expect(await target.database.recipes.count()).toBe(0); await importApplicationCalculation(json, target); const imported = (await target.listRecipes())[0]!; const snapshot = await target.getSnapshot((await target.getRevision(imported.currentRevisionId))!.snapshotId); expect(snapshot?.result.canonicalScientificRepresentation).toBe(saved.snapshot.result.canonicalScientificRepresentation);
    expect(await repository.database.recipes.count()).toBe(1);
  });

  it("blocks malformed, unknown, tampered, invalid rational, and incomplete owned imports", async () => {
    expect((await previewApplicationCalculation("not json")).diagnostics[0]?.code).toBe("INVALID_JSON");
    expect((await previewApplicationCalculation('{"recordType":"third-party"}')).valid).toBe(false);
    const { saved } = await populated(); const value = JSON.parse(buildLaboratoryJson({ recipeName: saved.recipe.name, recipe: saved.recipe, revision: saved.revision, snapshot: saved.snapshot, inputState: saved.revision.inputState, result: saved.snapshot.result, calculatedAt: saved.snapshot.createdAt })) as { scientificResult: { batch: { finalRoundedTotalWeighingMassGrams: string }; precursors: Array<{ solverMolesPerTargetFormulaMoleExact: { denominator: string } }> }; snapshot: unknown };
    value.scientificResult.batch.finalRoundedTotalWeighingMassGrams = "999"; expect((await previewApplicationCalculation(JSON.stringify(value))).diagnostics.some((item) => item.code === "TAMPERED_SNAPSHOT_OUTPUT")).toBe(true);
    value.scientificResult.precursors[0]!.solverMolesPerTargetFormulaMoleExact.denominator = "0"; expect((await previewApplicationCalculation(JSON.stringify(value))).valid).toBe(false);
    value.snapshot = null; expect((await previewApplicationCalculation(JSON.stringify(value))).valid).toBe(false);
  });

  it("previews and imports application-owned recipe, route, and comparison records under new identities", async () => {
    const { repository, saved } = await populated(); const target = repo();
    const recipeText = JSON.stringify(await createOwnedRecordExport("max-stoich-saved-recipe", { recipe: saved.recipe, revisions: [saved.revision], snapshots: [saved.snapshot] }));
    expect((await previewOwnedRecord(recipeText, target.database)).proposedAction).toBe("import-new"); await importOwnedRecord(recipeText, target); expect(await target.database.snapshots.count()).toBe(1);
    const route = (await repository.listRoutes())[0]!; const routeText = JSON.stringify(await createOwnedRecordExport("max-stoich-saved-route", { route, revisions: await repository.listRouteRevisions(route.id) }));
    expect((await previewOwnedRecord(routeText, target.database)).valid).toBe(true); await importOwnedRecord(routeText, target); expect(await target.database.routes.count()).toBe(1);
    const comparison = (await repository.listComparisons())[0]!; const comparisonText = JSON.stringify(await createOwnedRecordExport("max-stoich-comparison-workspace", { comparison }));
    expect((await previewOwnedRecord(comparisonText, target.database)).targetFormula).toBe("Ti2AlN"); await importOwnedRecord(comparisonText, target); expect(await target.database.comparisons.count()).toBe(1);
  });

  it("blocks a tampered application-owned record before writing", async () => {
    const { saved } = await populated(); const target = repo(); const envelope = await createOwnedRecordExport("max-stoich-saved-recipe", { recipe: saved.recipe, revisions: [saved.revision], snapshots: [saved.snapshot] });
    (envelope.payload as { recipe: { name: string } }).recipe.name = "tampered";
    const text = JSON.stringify(envelope); expect((await previewOwnedRecord(text, target.database)).diagnostics.some((item) => item.code === "IMPORT_DIGEST_MISMATCH")).toBe(true); await expect(importOwnedRecord(text, target)).rejects.toThrow(); expect(await target.database.recipes.count()).toBe(0);
  });

  it("backs up radius datasets, verifies their digest, and distrusts imported approval", async () => {
    const source = repo(); const base = { schemaVersion: "2.0.0" as const, datasetId: "synthetic-persistence-fixture", datasetVersion: "2026.1.0", name: "Synthetic persistence fixture", definition: "metallic" as const, definitionDetail: "Synthetic unconditional fixture", source: { sourceId: "fixture", title: "Test fixture", primarySource: "Test-only", editionOrVersion: "1" }, units: "pm" as const, coordinationPolicy: "unconditional fixture", oxidationStatePolicy: "not represented", spinStatePolicy: "not represented", missingValuePolicy: "block-site-descriptor" as const, approval: { status: "lab-reviewed" as const, sourceVerified: true, labApproval: "lab-reviewed" as const, reviewer: "Test reviewer", reviewDate: "2026-07-13" }, digest: "0".repeat(64), coverage: { elements: ["Ti"], missingElements: [], recordCount: 1 }, parsingWarnings: [], values: [{ element: "Ti", radiusPm: "100", selectionKey: "default", defaultForPolicy: true, estimated: false, sourceLocation: "test row" }] };
    const digest = await sha256Hex(stableCanonicalize(canonicalRadiusDatasetContent(base as AtomicRadiusDataset))); const approved = { ...base, digest } as AtomicRadiusDataset;
    await source.installRadiusDataset(approved, "locally-reviewed"); const backup = await createLocalBackup(source.database); expect(backup.manifest.counts.radiusDatasets).toBe(1); expect(backup.manifest.datasetVersions).toContain("atomic-radii:synthetic-persistence-fixture@2026.1.0");
    const target = repo(); await restoreBackup(serializeBackup(backup), target.database, "replace"); const imported = (await target.listRadiusDatasets())[0]!; expect(imported.localTrust).toBe("imported-unverified"); expect(imported.dataset.approval.status).toBe("unverified-import"); expect(imported.dataset.approval.sourceVerified).toBe(false); expect(imported.digest).toBe(digest);
    const tampered = structuredClone(backup); (tampered.records.radiusDatasets[0]!.dataset.values[0] as { radiusPm: string }).radiusPm = "101"; expect((await previewBackup(JSON.stringify(tampered))).valid).toBe(false);
  });
});
