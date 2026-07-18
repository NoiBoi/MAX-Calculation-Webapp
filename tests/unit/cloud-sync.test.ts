import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { MaxStoichDatabase } from "../../lib/persistence/database";
import { LocalDataRepositories } from "../../lib/persistence/repositories";
import { buildWorkspaceCalculation, type WorkspaceRecipeState } from "../../lib/workspace/adapter";
import { addComparisonScenario, createComparisonWorkspace } from "../../lib/comparison/model";
import { databaseNameForOwner } from "../../lib/cloud/local-data-owner";
import { performManualSync } from "../../lib/cloud/sync-engine";
import type { CloudChangeSet, CloudRecipe, CloudRecipeRevision, CloudWriteOperation, CloudWriteResult, LocalRecipeBundle } from "../../lib/cloud/sync-types";
import type { CloudSyncRepository } from "../../lib/cloud/cloud-repositories";
import { createDefaultUserSettings } from "../../lib/settings/user-settings";
import { copyAnonymousDataForUpload, previewAnonymousDataForUpload } from "../../lib/cloud/local-sync-repository";
import { resolveSyncConflict } from "../../lib/cloud/conflict-resolution";

const repositories: LocalDataRepositories[] = [];
function recipeState(patch: Partial<WorkspaceRecipeState> = {}): WorkspaceRecipeState {
  return {
    transientId: "sync-fixture", presetId: "custom", targetFormula: "Ti2AlN",
    precursors: ["Ti", "Al", "N"].map((formula) => ({ id: formula.toLowerCase(), name: formula, formula, purityPercent: "100", constraintMode: "solver" as const, fixedValue: "", minimum: "", maximum: "", ratioDenominatorId: "", numeratorRatio: "1", denominatorRatio: "1", molarMassOverride: "", molarMassOverrideSource: "" })),
    requestedMassGrams: "10", basis: "ideal-product-mass", expectedYieldPercent: "80", aluminumPerFormula: "1", precursorExcessId: "", precursorExcessPercent: "0", handlingLossPercent: "0", balanceIncrementGrams: "0.001", roundingMode: "nearest-half-even", practicalMinimumMassGrams: "0.001", objective: "deterministic-feasible",
    ...patch,
  };
}
function result(input: WorkspaceRecipeState) {
  const calculated = buildWorkspaceCalculation(input);
  if (calculated.state !== "valid" && calculated.state !== "valid-with-warnings") throw new Error(calculated.errors[0]?.message);
  return calculated.result;
}
function repo(ownerId = "00000000-0000-4000-8000-00000000000a"): LocalDataRepositories {
  const value = new LocalDataRepositories(new MaxStoichDatabase(`sync-${crypto.randomUUID()}`), ownerId);
  repositories.push(value);
  return value;
}
async function seed(repository: LocalDataRepositories, name = "Ti2AlN sync recipe", input = recipeState()): Promise<LocalRecipeBundle> {
  const saved = await repository.saveCalculatedRevision({ name, inputState: input, result: result(input) });
  return { recipe: saved.recipe, revisions: [saved.revision], snapshots: [saved.snapshot] };
}
function cloudSet(ownerId: string, bundle: LocalRecipeBundle, patch: Partial<CloudRecipe> = {}): CloudChangeSet {
  const recipeCloudId = crypto.randomUUID();
  const revisionCloudIds = new Map(bundle.revisions.map((item) => [item.id, crypto.randomUUID()]));
  const recipe: CloudRecipe = {
    cloudId: recipeCloudId, id: bundle.recipe.id, ownerId, name: bundle.recipe.name, targetFormula: bundle.recipe.targetFormula, description: bundle.recipe.description, tags: bundle.recipe.tags, currentRevisionId: bundle.recipe.currentRevisionId,
    createdAt: bundle.recipe.createdAt, updatedAt: bundle.recipe.updatedAt, version: 1, syncSequence: "1", ...patch,
  };
  const snapshots = new Map(bundle.snapshots.map((item) => [item.id, item]));
  const revisions: CloudRecipeRevision[] = bundle.revisions.map((item) => ({
    cloudId: revisionCloudIds.get(item.id)!, id: item.id, recipeCloudId, recipeId: bundle.recipe.id, ownerId, revisionNumber: item.revisionNumber, scientificInput: structuredClone(item), calculationSnapshot: structuredClone(snapshots.get(item.snapshotId)!), schemaVersion: item.schemaVersion, engineVersion: item.engineVersion, revisionNote: item.revisionNote, createdAt: item.createdAt, contentDigest: item.inputDigest, syncSequence: "1",
  }));
  return { ownerId, cursor: "1", recipes: [recipe], revisions, notes: [], comparisons: [], devices: [] };
}
function fakeCloud(ownerId: string, changes: CloudChangeSet, capture: CloudWriteOperation[] = []): CloudSyncRepository {
  return {
    ownerId,
    pull: async () => structuredClone(changes),
    write: async (operations: readonly CloudWriteOperation[]) => {
      capture.push(...operations);
      return operations.map((operation: CloudWriteOperation): CloudWriteResult => {
        const recordId = operation.kind === "upsert-recipe-bundle" ? operation.bundle.recipe.id : operation.kind === "upsert-note" ? operation.note.id : operation.kind === "upsert-comparison" ? operation.comparison.id : operation.kind === "upsert-settings" ? operation.settings.id : operation.kind === "upsert-device" ? operation.installationId : operation.id;
        return { operation: operation.kind, recordId, status: "applied", cloudVersion: operation.kind === "upsert-device" ? undefined : ("expectedVersion" in operation ? (operation.expectedVersion ?? 0) + 1 : 1), cloudUpdatedAt: "2026-07-17T12:00:00.000Z" };
      });
    },
  } as unknown as CloudSyncRepository;
}
afterEach(async () => { while (repositories.length) await repositories.pop()!.deleteDatabase(); });

describe("account-scoped local sync metadata", () => {
  it("uses physically separate database namespaces for anonymous data and every account", () => {
    expect(databaseNameForOwner()).toBe("max-stoich-local");
    expect(databaseNameForOwner("user-a")).not.toBe(databaseNameForOwner("user-b"));
    expect(databaseNameForOwner("user-a")).not.toBe(databaseNameForOwner());
  });

  it("marks account-local scientific saves pending without changing immutable scientific content", async () => {
    const repository = repo();
    const bundle = await seed(repository);
    expect((await repository.sync!.getMetadata("recipe", bundle.recipe.id))?.cloudState).toBe("pending-upload");
    expect((await repository.sync!.getMetadata("recipe-revision", bundle.revisions[0]!.id))?.cloudState).toBe("pending-upload");
    expect((await repository.database.snapshots.get(bundle.snapshots[0]!.id))?.outputDigest).toBe(bundle.snapshots[0]!.outputDigest);
  });

  it("previews anonymous records without writing and copies them only after explicit confirmation", async () => {
    const anonymous = new LocalDataRepositories(new MaxStoichDatabase(`anonymous-${crypto.randomUUID()}`));
    repositories.push(anonymous);
    const bundle = await seed(anonymous);
    const account = repo();
    const preview = await previewAnonymousDataForUpload(anonymous.database, account.database, ["recipes"]);
    expect(preview.counts).toMatchObject({ recipes: 1, revisions: 1 });
    expect(await account.database.recipes.count()).toBe(0);
    const copied = await copyAnonymousDataForUpload(anonymous.database, account.database, account.ownerId!, ["recipes"]);
    expect(copied.failures).toEqual([]);
    expect((await account.getRecipe(bundle.recipe.id))?.id).toBe(bundle.recipe.id);
    expect((await account.sync!.getMetadata("recipe", bundle.recipe.id))?.cloudState).toBe("pending-upload");
    expect(await anonymous.database.recipes.count()).toBe(1);
  });
});

describe("explicit manual synchronization", () => {
  it("uploads stable recipe IDs, every immutable revision, and keeps snapshots unchanged", async () => {
    const repository = repo();
    const first = await seed(repository);
    const secondInput = recipeState({ requestedMassGrams: "12" });
    const second = await repository.saveCalculatedRevision({ recipeId: first.recipe.id, expectedCurrentRevisionNumber: 1, name: first.recipe.name, inputState: secondInput, result: result(secondInput) });
    const before = await repository.database.snapshots.toArray();
    const capture: CloudWriteOperation[] = [];
    const empty: CloudChangeSet = { ownerId: repository.ownerId!, cursor: "4", recipes: [], revisions: [], notes: [], comparisons: [], devices: [] };
    const summary = await performManualSync({ repositories: repository, cloud: fakeCloud(repository.ownerId!, empty, capture), installationId: "installation-a", online: true });
    const operation = capture.find((item) => item.kind === "upsert-recipe-bundle") as Extract<CloudWriteOperation, { kind: "upsert-recipe-bundle" }>;
    expect(summary.status).toBe("complete");
    expect(operation.bundle.recipe.id).toBe(first.recipe.id);
    expect(operation.bundle.revisions.map((item) => item.id)).toEqual([first.revisions[0]!.id, second.revision.id]);
    expect(operation.bundle.revisions.every((item) => operation.mappings.revisionCloudIds[item.id])).toBe(true);
    expect(await repository.database.snapshots.toArray()).toEqual(before);
  });

  it("uploads notes with immutable links, comparisons, and stable settings without altering scientific payloads", async () => {
    const repository = repo();
    const bundle = await seed(repository);
    const note = await repository.saveRecipeNote({ recipeId: bundle.recipe.id, recipeRevisionId: bundle.revisions[0]!.id, category: "Processing", title: "Linked note", body: "Plain text only.", tags: ["linked"] });
    let comparison = createComparisonWorkspace(recipeState(), "Synced comparison");
    comparison = addComparisonScenario(comparison, recipeState(), "A", { kind: "working-recipe" }, "synthetic");
    comparison = addComparisonScenario(comparison, recipeState(), "B", { kind: "duplicate", scenarioId: comparison.scenarios[0]!.id }, "synthetic");
    await repository.saveComparison(comparison);
    await repository.saveSettings({ ...createDefaultUserSettings(), appearance: "midnight" });
    const snapshotBefore = structuredClone(bundle.snapshots[0]!);
    const capture: CloudWriteOperation[] = [];
    const empty: CloudChangeSet = { ownerId: repository.ownerId!, cursor: "0", recipes: [], revisions: [], notes: [], comparisons: [], devices: [] };
    const summary = await performManualSync({ repositories: repository, cloud: fakeCloud(repository.ownerId!, empty, capture), installationId: "upload-device", online: true });
    const recipeOperation = capture.find((item) => item.kind === "upsert-recipe-bundle");
    const noteOperation = capture.find((item) => item.kind === "upsert-note");
    expect(recipeOperation?.kind).toBe("upsert-recipe-bundle");
    expect(noteOperation?.kind).toBe("upsert-note");
    if (recipeOperation?.kind === "upsert-recipe-bundle" && noteOperation?.kind === "upsert-note") {
      expect(noteOperation.note.id).toBe(note.id);
      expect(noteOperation.recipeCloudId).toBe(recipeOperation.mappings.recipeCloudId);
      expect(noteOperation.revisionCloudId).toBe(recipeOperation.mappings.revisionCloudIds[bundle.revisions[0]!.id]);
    }
    expect(capture.some((item) => item.kind === "upsert-comparison")).toBe(true);
    expect(capture.some((item) => item.kind === "upsert-settings")).toBe(true);
    expect(summary.uploaded).toMatchObject({ recipes: 1, revisions: 1, notes: 1, comparisons: 1, settings: 1 });
    expect(await repository.database.snapshots.get(snapshotBefore.id)).toEqual(snapshotBefore);
  });

  it("reports a partial write, keeps the failed record, and synchronizes unrelated records", async () => {
    const repository = repo();
    const bundle = await seed(repository);
    const note = await repository.saveRecipeNote({ recipeId: bundle.recipe.id, category: "General", title: "Retry me", body: "This stays local.", tags: [] });
    const empty: CloudChangeSet = { ownerId: repository.ownerId!, cursor: "0", recipes: [], revisions: [], notes: [], comparisons: [], devices: [] };
    const cloud = fakeCloud(repository.ownerId!, empty);
    cloud.write = async (operations: readonly CloudWriteOperation[]) => operations.map((operation): CloudWriteResult => {
      const recordId = operation.kind === "upsert-recipe-bundle" ? operation.bundle.recipe.id : operation.kind === "upsert-note" ? operation.note.id : operation.kind === "upsert-comparison" ? operation.comparison.id : operation.kind === "upsert-settings" ? operation.settings.id : operation.kind === "upsert-device" ? operation.installationId : operation.id;
      return operation.kind === "upsert-note"
        ? { operation: operation.kind, recordId, status: "error", message: "Injected note failure." }
        : { operation: operation.kind, recordId, status: "applied", cloudVersion: operation.kind === "upsert-device" ? undefined : 1 };
    });
    const summary = await performManualSync({ repositories: repository, cloud, installationId: "partial-device", online: true });
    expect(summary.status).toBe("partial");
    expect(summary.errors.join(" ")).toContain("Injected note failure");
    expect((await repository.sync!.getMetadata("recipe", bundle.recipe.id))?.cloudState).toBe("synced");
    expect((await repository.sync!.getMetadata("recipe-note", note.id))?.cloudState).toBe("error");
    expect((await repository.database.recipeNotes.get(note.id))?.body).toBe("This stays local.");
  });

  it("downloads a complete recipe, notes, comparison, and settings to an empty account cache for offline use", async () => {
    const source = repo();
    const bundle = await seed(source);
    const note = await source.saveRecipeNote({ recipeId: bundle.recipe.id, recipeRevisionId: bundle.revisions[0]!.id, category: "Processing", title: "Argon hold", body: "Held for four hours.", tags: ["argon"] });
    let comparison = createComparisonWorkspace(recipeState(), "Routes");
    comparison = addComparisonScenario(comparison, recipeState(), "A", { kind: "working-recipe" }, "synthetic");
    comparison = addComparisonScenario(comparison, recipeState(), "B", { kind: "duplicate", scenarioId: comparison.scenarios[0]!.id }, "synthetic");
    const changes = cloudSet(source.ownerId!, bundle);
    const recipeCloudId = changes.recipes[0]!.cloudId;
    const revisionCloudId = changes.revisions[0]!.cloudId;
    const downloadChanges: CloudChangeSet = {
      ...changes,
      notes: [{ cloudId: crypto.randomUUID(), id: note.id, recipeCloudId, recipeId: bundle.recipe.id, revisionCloudId, revisionId: bundle.revisions[0]!.id, ownerId: source.ownerId!, note, version: 1, syncSequence: "2" }],
      comparisons: [{ cloudId: crypto.randomUUID(), id: comparison.id, ownerId: source.ownerId!, comparison, version: 1, syncSequence: "3" }],
      settings: { ownerId: source.ownerId!, settings: { ...createDefaultUserSettings(), appearance: "midnight" }, version: 1, syncSequence: "4" },
      cursor: "4",
    };
    const target = repo(source.ownerId!);
    const summary = await performManualSync({ repositories: target, cloud: fakeCloud(source.ownerId!, downloadChanges), installationId: "installation-b", online: true });
    expect(summary.downloaded).toMatchObject({ recipes: 1, revisions: 1, notes: 1, comparisons: 1, settings: 1 });
    expect((await target.getRecipe(bundle.recipe.id))?.currentRevisionId).toBe(bundle.recipe.currentRevisionId);
    expect((await target.listRecipeNotes(bundle.recipe.id))[0]?.body).toContain("four hours");
    expect((await target.getComparison(comparison.id))?.scenarios).toHaveLength(2);
    const databaseName = target.database.name;
    target.close();
    const reopened = new LocalDataRepositories(new MaxStoichDatabase(databaseName), target.ownerId);
    repositories.push(reopened);
    expect((await reopened.getRevision(bundle.revisions[0]!.id))?.inputDigest).toBe(bundle.revisions[0]!.inputDigest);
  });

  it("preserves offline changes as pending and performs no cloud request", async () => {
    const repository = repo();
    const bundle = await seed(repository);
    let pulls = 0;
    const cloud = fakeCloud(repository.ownerId!, { ownerId: repository.ownerId!, cursor: "0", recipes: [], revisions: [], notes: [], comparisons: [], devices: [] });
    cloud.pull = async () => { pulls += 1; throw new Error("must not run"); };
    const summary = await performManualSync({ repositories: repository, cloud, installationId: "offline-device", online: false });
    expect(summary.status).toBe("offline");
    expect(pulls).toBe(0);
    expect((await repository.sync!.getMetadata("recipe", bundle.recipe.id))?.cloudState).toBe("pending-upload");
  });

  it("detects a two-sided recipe-name edit and never overwrites the local name", async () => {
    const source = repo();
    const bundle = await seed(source, "Original");
    const changes = cloudSet(source.ownerId!, bundle, { name: "Cloud rename", version: 2, updatedAt: "2026-07-17T13:00:00.000Z" });
    const target = repo(source.ownerId!);
    await target.database.recipes.put(structuredClone(bundle.recipe));
    await target.database.recipeRevisions.bulkPut(structuredClone(bundle.revisions));
    await target.database.snapshots.bulkPut(structuredClone(bundle.snapshots));
    await target.sync!.markSynced("recipe", bundle.recipe.id, { cloudId: changes.recipes[0]!.cloudId, cloudVersion: 1, cloudUpdatedAt: bundle.recipe.updatedAt, localUpdatedAt: bundle.recipe.updatedAt });
    await target.sync!.markSynced("recipe-revision", bundle.revisions[0]!.id, { cloudId: changes.revisions[0]!.cloudId, contentDigest: bundle.revisions[0]!.inputDigest });
    await target.renameRecipe(bundle.recipe.id, "Device rename");
    const summary = await performManualSync({ repositories: target, cloud: fakeCloud(source.ownerId!, changes), installationId: "device-b", online: true });
    expect(summary.conflicts).toBe(1);
    expect((await target.getRecipe(bundle.recipe.id))?.name).toBe("Device rename");
    const conflict = (await target.sync!.listConflicts())[0]!;
    expect(conflict.kind).toBe("recipe-metadata");
    await resolveSyncConflict(target, conflict.id, "keep-both");
    expect((await target.listRecipes()).map((item) => item.name).sort()).toEqual(["Cloud rename", "Device rename (this device)"]);
    expect(await target.sync!.listConflicts()).toHaveLength(0);
  });

  it("treats a same-ID different-content revision as an integrity conflict and preserves the original", async () => {
    const source = repo();
    const original = await seed(source);
    const target = repo(source.ownerId!);
    await target.database.recipes.put(structuredClone(original.recipe));
    await target.database.recipeRevisions.bulkPut(structuredClone(original.revisions));
    await target.database.snapshots.bulkPut(structuredClone(original.snapshots));
    const originalChanges = cloudSet(source.ownerId!, original);
    await target.sync!.markSynced("recipe", original.recipe.id, { cloudId: originalChanges.recipes[0]!.cloudId, cloudVersion: 1 });
    await target.sync!.markSynced("recipe-revision", original.revisions[0]!.id, { cloudId: originalChanges.revisions[0]!.cloudId, contentDigest: original.revisions[0]!.inputDigest });
    const alternateSource = repo(source.ownerId!);
    const alternate = await seed(alternateSource, "Alternate", recipeState({ requestedMassGrams: "12" }));
    const alternateRevision = { ...alternate.revisions[0]!, id: original.revisions[0]!.id, recipeId: original.recipe.id };
    const alternateSnapshot = { ...alternate.snapshots[0]!, recipeId: original.recipe.id, recipeRevisionId: original.revisions[0]!.id };
    const conflicting: CloudChangeSet = { ownerId: source.ownerId!, cursor: "2", recipes: [], revisions: [{ ...originalChanges.revisions[0]!, scientificInput: alternateRevision, calculationSnapshot: alternateSnapshot, contentDigest: alternateRevision.inputDigest, syncSequence: "2" }], notes: [], comparisons: [], devices: [] };
    const summary = await performManualSync({ repositories: target, cloud: fakeCloud(source.ownerId!, conflicting), installationId: "device-b", online: true });
    expect(summary.conflicts).toBe(1);
    expect((await target.getRevision(original.revisions[0]!.id))?.inputDigest).toBe(original.revisions[0]!.inputDigest);
    expect((await target.sync!.listConflicts())[0]?.kind).toBe("scientific-integrity");
  });

  it("quarantines an unsupported future revision while downloading an unrelated valid comparison", async () => {
    const source = repo();
    const bundle = await seed(source);
    let comparison = createComparisonWorkspace(recipeState(), "Valid comparison");
    comparison = addComparisonScenario(comparison, recipeState(), "A", { kind: "working-recipe" }, "synthetic");
    comparison = addComparisonScenario(comparison, recipeState(), "B", { kind: "duplicate", scenarioId: comparison.scenarios[0]!.id }, "synthetic");
    const changes = cloudSet(source.ownerId!, bundle);
    const malformedChanges: CloudChangeSet = {
      ...changes,
      recipes: [],
      revisions: [{ ...changes.revisions[0]!, scientificInput: { ...changes.revisions[0]!.scientificInput, schemaVersion: "99.0.0" as "10.0.0" } }],
      comparisons: [{ cloudId: crypto.randomUUID(), id: comparison.id, ownerId: source.ownerId!, comparison, version: 1, syncSequence: "2" }],
    };
    const target = repo(source.ownerId!);
    const summary = await performManualSync({ repositories: target, cloud: fakeCloud(source.ownerId!, malformedChanges), installationId: "device-b", online: true });
    expect(summary.quarantined).toBe(1);
    expect(await target.getComparison(comparison.id)).toBeDefined();
    expect((await target.sync!.listQuarantine())[0]?.code).toBe("UNSUPPORTED_FUTURE_SCHEMA");
  });

  it("preserves an entire downloaded recipe graph when one linked note has an unsynchronized edit", async () => {
    const source = repo();
    const bundle = await seed(source);
    const note = await source.saveRecipeNote({ recipeId: bundle.recipe.id, recipeRevisionId: bundle.revisions[0]!.id, category: "General", title: "Cloud note", body: "Original.", tags: [] });
    const changes = cloudSet(source.ownerId!, bundle);
    const download: CloudChangeSet = {
      ...changes,
      notes: [{ cloudId: crypto.randomUUID(), id: note.id, recipeCloudId: changes.recipes[0]!.cloudId, recipeId: bundle.recipe.id, revisionCloudId: changes.revisions[0]!.cloudId, revisionId: bundle.revisions[0]!.id, ownerId: source.ownerId!, note, version: 1, syncSequence: "2" }],
      cursor: "2",
    };
    const target = repo(source.ownerId!);
    await performManualSync({ repositories: target, cloud: fakeCloud(source.ownerId!, download), installationId: "cache-device", online: true });
    await target.saveRecipeNote({ ...note, body: "Edited offline." });
    const removal = await target.sync!.removeDownloadedCache();
    expect(removal.preservedPending).toBeGreaterThan(0);
    expect(await target.database.recipes.get(bundle.recipe.id)).toBeDefined();
    expect(await target.database.recipeRevisions.get(bundle.revisions[0]!.id)).toBeDefined();
    expect(await target.database.snapshots.get(bundle.snapshots[0]!.id)).toBeDefined();
    expect((await target.database.recipeNotes.get(note.id))?.body).toBe("Edited offline.");
  });
});
