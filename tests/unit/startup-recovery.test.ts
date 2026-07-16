import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { MaxStoichDatabase } from "../../lib/persistence/database";
import { LocalDataRepositories } from "../../lib/persistence/repositories";
import { classifyStartupError, loadStartupData, repairRecoveryRecord, StartupDataError } from "../../lib/persistence/startup-recovery";
import type { WorkspaceRecipeState } from "../../lib/workspace/adapter";

const repositories: LocalDataRepositories[] = [];
const state = (): WorkspaceRecipeState => ({ transientId: "recovery", presetId: "custom", targetFormula: "Ti2AlN", precursors: ["Ti", "Al", "N"].map((formula) => ({ id: formula, name: formula, formula, purityPercent: "100", constraintMode: "solver", fixedValue: "", minimum: "", maximum: "", ratioDenominatorId: "", numeratorRatio: "1", denominatorRatio: "1", molarMassOverride: "", molarMassOverrideSource: "" })), requestedMassGrams: "10", basis: "ideal-product-mass", expectedYieldPercent: "80", aluminumPerFormula: "1", precursorExcessId: "", precursorExcessPercent: "0", handlingLossPercent: "0", balanceIncrementGrams: "0.001", roundingMode: "nearest-half-even", practicalMinimumMassGrams: "0.001", objective: "deterministic-feasible" });
const repo = () => { const value = new LocalDataRepositories(new MaxStoichDatabase(`startup-${crypto.randomUUID()}`)); repositories.push(value); return value; };
afterEach(async () => { while (repositories.length) await repositories.pop()!.deleteDatabase(); });

describe("startup recovery reliability", () => {
  it("classifies blocked, quota, recovery, and storage failures distinctly", () => {
    expect(classifyStartupError(new Error("Upgrade blocked by another connection")).category).toBe("database-blocked");
    expect(classifyStartupError(new DOMException("Quota exceeded", "QuotaExceededError")).category).toBe("quota-exceeded");
    expect(classifyStartupError(new StartupDataError("recovery-record-corrupt", "bad recovery")).recoveryOnly).toBe(true);
    expect(classifyStartupError(new Error("IndexedDB unavailable")).category).toBe("indexeddb-unavailable");
  });

  it("performs a new open and load on every retry call", async () => {
    const repository = repo();
    await expect(loadStartupData(repository)).resolves.toBeDefined();
    repository.close();
    await expect(loadStartupData(repository)).resolves.toBeDefined();
    expect(repository.database.isOpen()).toBe(true);
  });

  it("rejects corrupt recovery without deleting saved tables and can safely skip it", async () => {
    const repository = repo(); await repository.database.open();
    await repository.database.recovery.put({ id: "current", committedRecipe: null } as never);
    await expect(loadStartupData(repository)).rejects.toMatchObject({ category: "recovery-record-corrupt" });
    expect(await repository.database.recovery.count()).toBe(1);
    const safe = await loadStartupData(repository, { skipRecovery: true });
    expect("recovery" in safe).toBe(false);
  });

  it("repairs valid scientific input while removing malformed transient state", async () => {
    const repository = repo(); await repository.database.open();
    await repository.database.recovery.put({ id: "current", committedRecipe: state(), mode: "invalid", activePanel: "broken", committedEditSequence: "bad" } as never);
    const repaired = await repairRecoveryRecord(repository);
    expect(repaired).toMatchObject({ mode: "standard", activePanel: "none", committedEditSequence: 0, committedRecipe: { targetFormula: "Ti2AlN" } });
  });

  it("resetting recovery preserves saved scientific and note tables", async () => {
    const repository = repo(); await repository.database.open();
    await repository.database.recipes.put({ id: "recipe", name: "Saved", targetFormula: "Ti2AlN" } as never);
    await repository.database.recipeNotes.put({ id: "note", recipeId: "recipe", title: "Keep" } as never);
    await repository.database.recovery.put({ id: "current", committedRecipe: null } as never);
    await repository.clearRecovery();
    expect(await repository.database.recipes.count()).toBe(1);
    expect(await repository.database.recipeNotes.count()).toBe(1);
  });
});
