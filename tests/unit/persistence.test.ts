import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_ATOMIC_RADIUS_REGISTRY, calculateBatchRecipe, createStandardMaxComposition, parseFormula, type BatchCalculationResult } from "@max-stoich/chemistry-engine";
import { buildLaboratoryCsv, buildLaboratoryJson, buildWeighingTableTsv, safeExportFilename } from "../../lib/export/laboratory-export";
import { canonicalizeWorkspaceScientificInput, sha256Hex, stableCanonicalize } from "../../lib/persistence/canonical";
import { MaxStoichDatabase } from "../../lib/persistence/database";
import { LOCAL_SCHEMA_VERSION, type WorkspaceRecoveryState } from "../../lib/persistence/entities";
import { migrateRecord } from "../../lib/persistence/migrations";
import { LocalDataRepositories, PersistenceConflictError } from "../../lib/persistence/repositories";
import { buildWorkspaceCalculation, type WorkspaceRecipeState } from "../../lib/workspace/adapter";
import { RecipeCommandHistory } from "../../lib/workspace/history";

const databases: LocalDataRepositories[] = [];

function state(patch: Partial<WorkspaceRecipeState> = {}): WorkspaceRecipeState {
  return {
    transientId: "temporary-test", presetId: "custom", targetFormula: "Ti2AlN",
    precursors: ["Ti", "Al", "N"].map((formula) => ({ id: formula.toLowerCase(), name: formula, formula, purityPercent: "100", constraintMode: "solver" as const, fixedValue: "", minimum: "", maximum: "", ratioDenominatorId: "", numeratorRatio: "1", denominatorRatio: "1", molarMassOverride: "", molarMassOverrideSource: "" })),
    requestedMassGrams: "10.000", basis: "ideal-product-mass", expectedYieldPercent: "80", alExcessPercent: "0", precursorExcessId: "", precursorExcessPercent: "0", handlingLossPercent: "0", balanceIncrementGrams: "0.001", roundingMode: "nearest-half-even", practicalMinimumMassGrams: "0.001", objective: "deterministic-feasible", notes: "",
    ...patch,
  };
}

function result(input = state()): BatchCalculationResult {
  const value = buildWorkspaceCalculation(input);
  if (value.state !== "valid" && value.state !== "valid-with-warnings") throw new Error(`Fixture failed: ${value.errors[0]?.message}`);
  return value.result;
}

function repository(): LocalDataRepositories {
  const value = new LocalDataRepositories(new MaxStoichDatabase(`test-${crypto.randomUUID()}`));
  databases.push(value);
  return value;
}

afterEach(async () => { while (databases.length) await databases.pop()!.deleteDatabase(); });

describe("canonical scientific persistence", () => {
  it("orders object keys, canonicalizes decimal fields, and hashes deterministically", async () => {
    expect(stableCanonicalize({ requestedMass: "10.000", z: true, a: "x" })).toBe('{"a":"x","requestedMass":"10","z":true}');
    expect(await sha256Hex(stableCanonicalize({ b: 2, a: 1 }))).toBe(await sha256Hex(stableCanonicalize({ a: 1, b: 2 })));
  });

  it("excludes transient identities and irrelevant precursor display order", () => {
    const base = state();
    const equivalent = { ...base, transientId: "different", presetId: "anything", precursors: [...base.precursors].reverse() };
    expect(canonicalizeWorkspaceScientificInput(equivalent)).toBe(canonicalizeWorkspaceScientificInput(base));
    expect(canonicalizeWorkspaceScientificInput({ ...base, requestedMassGrams: "11" })).not.toBe(canonicalizeWorkspaceScientificInput(base));
  });

  it("applies the migration registry deterministically and idempotently", () => {
    const migrated = migrateRecord({ id: "r", currentRevisionNumber: 1 }, 1, 2) as Record<string, unknown>;
    expect(migrated).toMatchObject({ schemaVersion: LOCAL_SCHEMA_VERSION, validationStatus: "synthetic", archived: false, targetFormula: "" });
    expect(migrateRecord(migrated, 2, 2)).toEqual(migrated);
  });
});

describe("atomic local repositories", () => {
  it("snapshots immutable per-site radius provenance, resolved values, and descriptors", async () => {
    const site = createStandardMaxComposition("211", { M: { occupants: [{ element: "Ti", fraction: "0.5" }, { element: "Nb", fraction: "0.5" }] }, A: { occupants: [{ element: "Al", fraction: "1" }] }, X: { occupants: [{ element: "N", fraction: "1" }] } }); if (!site.success) throw new Error();
    const teatum = DEFAULT_ATOMIC_RADIUS_REGISTRY.datasets.find((item) => item.datasetId === "teatum-metallic-cn12")!; const cordero = DEFAULT_ATOMIC_RADIUS_REGISTRY.datasets.find((item) => item.datasetId === "cordero-covalent-2008")!;
    const input = state({ targetFormula: "(Ti0.5Nb0.5)2AlN", siteComposition: site.value.composition, precursors: ["Ti", "Nb", "Al", "N"].map((formula) => ({ id: formula.toLowerCase(), name: formula, formula, purityPercent: "100", constraintMode: "solver" as const, fixedValue: "", minimum: "", maximum: "", ratioDenominatorId: "", numeratorRatio: "1", denominatorRatio: "1", molarMassOverride: "", molarMassOverrideSource: "" })), radiusDescriptorConfig: { schemaVersion: "2.0.0", enabled: true, siteDatasets: [{ siteId: "M", datasetId: teatum.datasetId, datasetVersion: teatum.datasetVersion, datasetDigest: teatum.digest, overrides: [] }, { siteId: "A", datasetId: teatum.datasetId, datasetVersion: teatum.datasetVersion, datasetDigest: teatum.digest, overrides: [] }, { siteId: "X", datasetId: cordero.datasetId, datasetVersion: cordero.datasetVersion, datasetDigest: cordero.digest, overrides: [] }] } });
    const repo = repository(); const saved = await repo.saveCalculatedRevision({ name: "Radius snapshot", inputState: input, result: result(input) }); const snapshot = await repo.getSnapshot(saved.snapshot.id);
    expect(snapshot?.radiusDatasetSelections).toHaveLength(3); expect(snapshot?.radiusDatasetSelections?.find((item) => item.siteId === "M")?.resolvedValues).toEqual(expect.arrayContaining([expect.objectContaining({ element: "Ti", radiusPm: "146.2", missing: false }), expect.objectContaining({ element: "Nb", radiusPm: "146.8", missing: false })])); expect(snapshot?.radiusDescriptorResults?.find((item) => item.siteId === "M")?.available).toBe(true); expect(snapshot?.radiusDisclaimerVersion).toBe("1.0.0"); expect((await repo.verifySnapshot(snapshot!)).valid).toBe(true);
  });

  it("creates immutable snapshots and monotonically numbered revisions", async () => {
    const repo = repository();
    const firstState = state();
    const first = await repo.saveCalculatedRevision({ name: "Ti2AlN", inputState: firstState, result: result(firstState) });
    const changed = state({ requestedMassGrams: "12" });
    const second = await repo.saveCalculatedRevision({ recipeId: first.recipe.id, expectedCurrentRevisionNumber: 1, inputState: changed, result: result(changed) });
    expect(second.revision.revisionNumber).toBe(2);
    expect(second.revision.parentRevisionId).toBe(first.revision.id);
    expect((await repo.getRevision(first.revision.id))?.inputState.requestedMassGrams).toBe("10.000");
    expect((await repo.getSnapshot(first.snapshot.id))?.result.batch.requestedMassGrams).toBe("10");
    const integrity = await repo.checkIntegrity();
    expect(integrity.valid, JSON.stringify(integrity.diagnostics)).toBe(true);
  });

  it("preserves a normalized carbon-deficient coefficient when saving and reopening", async () => {
    const targetFormula = "(TiVMoTa0.5W1.5)4AlC2.7";
    const input = state({ targetFormula, normalizeLeadingSiteRatios: true, precursors: ["Ti", "V", "Mo", "Ta", "W", "Al", "C"].map((formula) => ({ id: formula.toLowerCase(), name: formula, formula, purityPercent: "100", constraintMode: "solver" as const, fixedValue: "", minimum: "", maximum: "", ratioDenominatorId: "", numeratorRatio: "1", denominatorRatio: "1", molarMassOverride: "", molarMassOverrideSource: "" })) });
    const repo = repository();
    const saved = await repo.saveCalculatedRevision({ name: "Carbon-deficient 413", inputState: input, result: result(input) });
    const reopened = await repo.getRevision(saved.revision.id);
    expect(reopened?.inputState.targetFormula).toBe(targetFormula);
    expect(reopened?.inputState.normalizeLeadingSiteRatios).toBe(true);
    expect((await repo.getSnapshot(saved.snapshot.id))?.result.intendedFeedComposition.amounts.C).toBe("2.7");
  });

  it("rejects invalid calculations and stale concurrent pointers", async () => {
    const repo = repository();
    const invalid = calculateBatchRecipe({ schemaVersion: "1.0.0", idealCrystalComposition: { schemaVersion: "1.0.0", amounts: {} }, precursors: [], batch: { basis: "ideal-product-mass", requestedMassGrams: "10" }, adjustments: [], rounding: { adjustmentId: "r", order: 0, incrementGrams: "0.001", mode: "nearest-half-even", residualToleranceMoles: "0.001", materialityRelativeTolerance: "0.001" } });
    await expect(repo.saveCalculatedRevision({ inputState: state(), result: invalid })).rejects.toThrow("current, feasible");
    const first = await repo.saveCalculatedRevision({ inputState: state(), result: result() });
    await expect(repo.saveCalculatedRevision({ recipeId: first.recipe.id, expectedCurrentRevisionNumber: 0, inputState: state(), result: result() })).rejects.toBeInstanceOf(PersistenceConflictError);
  });

  it("rolls back every record after an interrupted transaction", async () => {
    const repo = repository();
    await expect(repo.saveCalculatedRevision({ inputState: state(), result: result(), failAfterSnapshotWrite: true })).rejects.toThrow("Simulated");
    expect(await repo.database.recipes.count()).toBe(0);
    expect(await repo.database.recipeRevisions.count()).toBe(0);
    expect(await repo.database.snapshots.count()).toBe(0);
  });

  it("duplicates without sharing identity or mutation history and cascades explicit deletion", async () => {
    const repo = repository();
    const saved = await repo.saveCalculatedRevision({ name: "Original", inputState: state(), result: result() });
    const duplicate = await repo.duplicateRecipe(saved.recipe.id);
    expect(duplicate.inputState).toEqual(state());
    expect(duplicate.sourceRecipeId).toBe(saved.recipe.id);
    await repo.deleteRecipePermanently(saved.recipe.id);
    expect(await repo.database.recipeRevisions.count()).toBe(0);
    expect(await repo.database.snapshots.count()).toBe(0);
  });

  it("stores recovery separately and preserves valid committed input", async () => {
    const repo = repository();
    const recovery: WorkspaceRecoveryState = { schemaVersion: LOCAL_SCHEMA_VERSION, id: "current", committedRecipe: state(), invalidDraft: { fieldPath: "batch-mass", value: "-", message: "Invalid" }, mode: "advanced", activePanel: "recipes", inputPanelCollapsed: false, savedAsRecipe: false, unsavedChanges: true, committedEditSequence: 4, updatedAt: new Date().toISOString() };
    await repo.saveRecovery(recovery);
    expect(await repo.loadRecovery()).toEqual(recovery);
    repo.close();
    const reopened = new LocalDataRepositories(new MaxStoichDatabase(repo.database.name)); databases.push(reopened);
    expect((await reopened.loadRecovery())?.committedRecipe.targetFormula).toBe("Ti2AlN");
  });

  it("versions reusable routes without changing prior revisions", async () => {
    const repo = repository();
    const first = await repo.saveRouteRevision({ name: "Elemental", inputState: state() });
    const changed = state({ handlingLossPercent: "2" });
    const second = await repo.saveRouteRevision({ routeId: first.route.id, expectedCurrentRevisionNumber: 1, inputState: changed });
    const revisions = await repo.listRouteRevisions(first.route.id);
    expect(second.revision.revisionNumber).toBe(2);
    expect(revisions.find((item) => item.revisionNumber === 1)?.defaults.handlingLossPercent).toBe("0");
  });

  it("detects digest tampering without rewriting history", async () => {
    const repo = repository();
    const saved = await repo.saveCalculatedRevision({ inputState: state(), result: result() });
    await repo.database.snapshots.update(saved.snapshot.id, { canonicalScientificOutput: "{}" });
    const integrity = await repo.checkIntegrity();
    expect(integrity.valid).toBe(false);
    expect(integrity.diagnostics.some((item) => item.code === "OUTPUT_DIGEST_MISMATCH")).toBe(true);
    expect((await repo.getSnapshot(saved.snapshot.id))?.canonicalScientificOutput).toBe("{}");
  });

  it("upgrades a version-one database non-destructively and logs the migration", async () => {
    const name = `migration-${crypto.randomUUID()}`;
    const old = new Dexie(name);
    old.version(1).stores({ recipes: "&id,name,updatedAt,archived,currentRevisionNumber", recipeRevisions: "&id,[recipeId+revisionNumber],recipeId", snapshots: "&id,recipeId,recipeRevisionId", routes: "&id,name,updatedAt,archived", routeRevisions: "&id,[routeId+revisionNumber],routeId", recentCalculations: "&snapshotId,lastOpenedAt,recipeId", recovery: "&id", migrations: "&id" });
    await old.table("recipes").put({ id: "legacy", name: "Legacy", updatedAt: "2020-01-01T00:00:00.000Z", currentRevisionNumber: 0, currentRevisionId: "none" });
    old.close();
    const repo = new LocalDataRepositories(new MaxStoichDatabase(name)); databases.push(repo);
    await repo.database.open();
    expect((await repo.database.recipes.get("legacy"))?.schemaVersion).toBe(LOCAL_SCHEMA_VERSION);
    expect((await repo.database.migrations.get("1-to-2"))?.status).toBe("complete");
    expect((await repo.database.migrations.get("3-to-4"))?.status).toBe("complete");
    expect(await repo.database.radiusDatasets.count()).toBe(0);
  });

  it("records representative 100-recipe, 1,000-snapshot, and 100-route observations without a timing gate", async () => {
    const repo = repository();
    const input = state();
    const calculated = result(input);
    const started = performance.now();
    for (let recipeIndex = 0; recipeIndex < 100; recipeIndex += 1) {
      let saved = await repo.saveCalculatedRevision({ name: `Recipe ${recipeIndex}`, inputState: input, result: calculated });
      for (let revisionIndex = 2; revisionIndex <= 10; revisionIndex += 1) saved = await repo.saveCalculatedRevision({ recipeId: saved.recipe.id, expectedCurrentRevisionNumber: revisionIndex - 1, inputState: input, result: calculated });
      await repo.saveRouteRevision({ name: `Route ${recipeIndex}`, inputState: input });
    }
    const listStarted = performance.now();
    expect(await repo.listRecipes()).toHaveLength(100);
    expect(await repo.listRoutes()).toHaveLength(100);
    const listElapsed = performance.now() - listStarted;
    expect(await repo.database.snapshots.count()).toBe(1000);
    console.info(`Persistence volume observation: write=${(performance.now() - started).toFixed(1)}ms, indexed lists=${listElapsed.toFixed(1)}ms`);
  }, 30_000);
});

describe("undo and laboratory export", () => {
  it("groups rapid field edits, clears redo on branching, and bounds history", () => {
    const history = new RecipeCommandHistory(2, 500);
    const a = state(); const b = state({ requestedMassGrams: "11" }); const c = state({ requestedMassGrams: "12" });
    history.record("batch", "batch-mass", a, b, new Date(1000));
    history.record("batch", "batch-mass", b, c, new Date(1200));
    expect(history.state.undo).toHaveLength(1);
    expect(history.undo(c).requestedMassGrams).toBe("10.000");
    expect(history.redo(a).requestedMassGrams).toBe("12");
    history.undo(c); history.record("formula", "formula", a, state({ targetFormula: "Nb2AlN" }), new Date(3000));
    expect(history.canRedo).toBe(false);
  });

  it.each([["Li", "Li3", "1/3"], ["Li2", "Li3", "2/3"], ["Li", "Li7", "1/7"]])("exports exact %s/%s solver quantities beside labeled approximations", (target, precursorFormula, exact) => {
    const parsed = parseFormula(target); if (!parsed.success) throw new Error();
    const rationalResult = calculateBatchRecipe({ schemaVersion: "1.0.0", idealCrystalComposition: parsed.composition, precursors: [{ schemaVersion: "1.0.0", id: "rational", name: precursorFormula, formula: precursorFormula, purity: "0.8", molarMassOverride: { value: "30", units: "g/mol", source: "test", reason: "test", provenance: "test" } }], batch: { basis: "ideal-product-mass", requestedMassGrams: "6.94" }, adjustments: [{ schemaVersion: "1.0.0", id: "loss", type: "handling-loss", stage: "mass-domain", label: "loss", fraction: "0.1", scope: "all", order: 0, source: "user" }], rounding: { adjustmentId: "round", order: 0, incrementGrams: "0.001", mode: "nearest-half-even", residualToleranceMoles: "0.00001", materialityRelativeTolerance: "0.001" } });
    const input = state({ targetFormula: target, precursors: [{ ...state().precursors[0]!, id: "rational", name: precursorFormula, formula: precursorFormula, purityPercent: "80", molarMassOverride: "30", molarMassOverrideSource: "test" }] });
    const context = { recipeName: "Rational test", inputState: input, result: rationalResult, calculatedAt: "2026-01-01T00:00:00.000Z" };
    expect(buildLaboratoryCsv(context)).toContain(`,${exact},`);
    expect(buildLaboratoryJson(context)).toContain(`"canonical": "${exact}"`);
    expect(buildWeighingTableTsv(context).split("\n")[0]).toBe("Precursor\tFormula\tPurity\tFinal weighing mass\tUnit");
    expect(safeExportFilename("A / risky:name", "csv")).toBe("A-risky-name.csv");
  });
});
