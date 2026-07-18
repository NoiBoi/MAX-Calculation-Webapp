import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaxStoichDatabase } from "../../lib/persistence/database";
import { LocalDataRepositories } from "../../lib/persistence/repositories";
import { AutomaticSyncCoordinator, retryDelayMs } from "../../lib/cloud/sync-coordinator";
import { createDefaultCloudSyncPreferences, createDefaultUserSettings } from "../../lib/settings/user-settings";
import type { CloudSyncRepository } from "../../lib/cloud/cloud-repositories";
import type { SyncSummary } from "../../lib/cloud/sync-types";

const repositories: LocalDataRepositories[] = [];
const ownerId = "00000000-0000-4000-8000-000000000003";
function repository(): LocalDataRepositories {
  const value = new LocalDataRepositories(new MaxStoichDatabase(`automatic-sync-${crypto.randomUUID()}`), ownerId, "installation-a");
  repositories.push(value);
  return value;
}
afterEach(async () => {
  vi.useRealTimers();
  while (repositories.length) await repositories.pop()!.deleteDatabase();
});

const completeSummary = (): SyncSummary => ({
  status: "complete",
  startedAt: "2026-07-17T12:00:00.000Z",
  completedAt: "2026-07-17T12:00:01.000Z",
  uploaded: { recipes: 0, revisions: 0, notes: 0, comparisons: 0, settings: 0 },
  downloaded: { recipes: 0, revisions: 0, notes: 0, comparisons: 0, settings: 0 },
  conflicts: 0,
  quarantined: 0,
  errors: [],
  phases: { session: "complete", pull: "complete", merge: "complete", upload: "complete", device: "complete", finalize: "complete" },
});
const cloud = { ownerId } as CloudSyncRepository;

describe("durable automatic synchronization", () => {
  it("records and compacts mutable outbox operations while preserving retry identity", async () => {
    const repo = repository();
    await repo.sync!.markPending("comparison", "comparison-a");
    const first = (await repo.sync!.listOutbox())[0]!;
    await repo.sync!.markPending("comparison", "comparison-a");
    const compacted = await repo.sync!.listOutbox();
    expect(compacted).toHaveLength(1);
    expect(compacted[0]).toMatchObject({ operation: "create", state: "pending", attemptCount: 0 });
    expect(compacted[0]!.idempotencyKey).not.toBe(first.idempotencyKey);
    await repo.sync!.markOutboxAttempt(compacted[0]!.id);
    const processing = (await repo.sync!.listOutbox())[0]!;
    expect(processing.attemptCount).toBe(1);
    expect(processing.idempotencyKey).toBe(compacted[0]!.idempotencyKey);
  });

  it("commits an entity and its outbox atomically and survives a database reopen", async () => {
    const repo = repository();
    const settings = createDefaultUserSettings();
    await repo.database.transaction("rw", [repo.database.userSettings, repo.database.cloudSyncRecords, repo.database.cloudSyncOutbox], async () => {
      await repo.database.userSettings.put(settings);
      await repo.sync!.markPending("user-settings", settings.id);
    });
    repo.close();
    await repo.database.open();
    expect(await repo.database.userSettings.get(settings.id)).toBeDefined();
    expect((await repo.sync!.listOutbox())[0]).toMatchObject({ recordType: "user-settings", recordId: settings.id, state: "pending" });

    await expect(repo.database.transaction("rw", [repo.database.userSettings, repo.database.cloudSyncRecords, repo.database.cloudSyncOutbox], async () => {
      await repo.database.userSettings.put({ ...settings, updatedAt: "2026-07-17T13:00:00.000Z" });
      await repo.sync!.markPending("comparison", "rolled-back-operation");
      throw new Error("interrupted");
    })).rejects.toThrow("interrupted");
    expect(await repo.sync!.getMetadata("comparison", "rolled-back-operation")).toBeUndefined();
    expect((await repo.sync!.listOutbox()).some((item) => item.recordId === "rolled-back-operation")).toBe(false);
  });

  it("does not rewrite an operation that is already involved in a conflict", async () => {
    const repo = repository();
    await repo.sync!.markPending("comparison", "comparison-conflict");
    await repo.sync!.addConflict({ recordType: "comparison", recordId: "comparison-conflict", kind: "comparison-content", recordName: "Conflict", localValue: { name: "local" }, cloudValue: { name: "cloud" }, fields: ["name"] });
    const conflicted = (await repo.sync!.listOutbox())[0]!;
    await repo.sync!.markPending("comparison", "comparison-conflict");
    expect((await repo.sync!.listOutbox())[0]).toEqual(conflicted);
  });

  it("converts updates to soft deletes and removes an acknowledged operation", async () => {
    const repo = repository();
    await repo.sync!.markPending("recipe-note", "note-a");
    await repo.sync!.markPendingDelete("recipe-note", "note-a");
    expect((await repo.sync!.listOutbox())[0]?.operation).toBe("soft-delete");
    await repo.sync!.markSynced("recipe-note", "note-a", { cloudVersion: 2 });
    expect(await repo.sync!.listOutbox()).toEqual([]);
  });

  it("allows only one live cross-tab lease and permits takeover after expiry", async () => {
    const repo = repository();
    const now = new Date("2026-07-17T12:00:00.000Z");
    expect(await repo.sync!.acquireLease("installation-a", "tab-a", 20_000, now)).toBe(true);
    expect(await repo.sync!.acquireLease("installation-a", "tab-b", 20_000, new Date(now.getTime() + 1_000))).toBe(false);
    expect(await repo.sync!.acquireLease("installation-a", "tab-b", 20_000, new Date(now.getTime() + 21_000))).toBe(true);
  });

  it("debounces local changes, prevents overlapping passes, and runs one follow-up", async () => {
    const repo = repository();
    let runs = 0;
    let timerId = 0;
    const timers = new Map<number, () => void>();
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const coordinator = new AutomaticSyncCoordinator({
      repositories: repo,
      cloud,
      installationId: "installation-a",
      preferences: createDefaultCloudSyncPreferences,
      isOnline: () => true,
      isAuthenticated: () => true,
      setTimer: (callback) => { const id = ++timerId; timers.set(id, callback); return id as unknown as ReturnType<typeof setTimeout>; },
      clearTimer: (timer) => { timers.delete(timer as unknown as number); },
      runSync: async () => {
        runs += 1;
        if (runs === 1) await firstGate;
        return completeSummary();
      },
    });
    coordinator.schedule("local-change");
    coordinator.schedule("local-change");
    expect(timers.size).toBe(1);
    coordinator.pause();
    expect(timers.size).toBe(0);
    const firstRun = coordinator.run("manual");
    await vi.waitFor(() => expect(runs).toBe(1));
    coordinator.schedule("local-change");
    releaseFirst();
    await firstRun;
    expect(timers.size).toBe(1);
    [...timers.values()][0]!();
    await vi.waitFor(() => expect(runs).toBe(2));
    await coordinator.dispose();
  });

  it("uses bounded jittered exponential retry delays and preserves offline work", async () => {
    expect(retryDelayMs(1, () => 0)).toBe(4_250);
    expect(retryDelayMs(3, () => 0.5)).toBe(45_000);
    expect(retryDelayMs(99, () => 1)).toBe(600_000);
    const repo = repository();
    await repo.sync!.markPending("comparison", "comparison-offline");
    const coordinator = new AutomaticSyncCoordinator({
      repositories: repo,
      cloud,
      installationId: "installation-a",
      preferences: createDefaultCloudSyncPreferences,
      isOnline: () => false,
      isAuthenticated: () => true,
    });
    expect(await coordinator.run("manual")).toBeUndefined();
    expect((await repo.sync!.listOutbox())[0]?.state).toBe("pending");
    expect(coordinator.getStatus().state).toBe("waiting-network");
    await coordinator.dispose();
  });

  it("honors disabled and paused automatic preferences while retaining manual sync", async () => {
    const repo = repository();
    let automatic = 0;
    const preferences = { ...createDefaultCloudSyncPreferences(), automaticSync: false };
    const coordinator = new AutomaticSyncCoordinator({
      repositories: repo,
      cloud,
      installationId: "installation-a",
      preferences: () => preferences,
      isOnline: () => true,
      isAuthenticated: () => true,
      runSync: async () => { automatic += 1; return completeSummary(); },
    });
    coordinator.schedule("startup");
    expect(coordinator.getStatus().state).toBe("idle");
    await coordinator.run("manual");
    expect(automatic).toBe(1);
    await coordinator.dispose();
  });

  it("attempts one secure session refresh and resumes without dropping pending work", async () => {
    const repo = repository();
    await repo.sync!.markPending("comparison", "auth-pending");
    let runs = 0;
    let refreshes = 0;
    const timers: (() => void)[] = [];
    const authFailure: SyncSummary = { ...completeSummary(), status: "failed", errors: ["Sign in again."], errorCategory: "auth-required", retryable: false };
    const coordinator = new AutomaticSyncCoordinator({
      repositories: repo,
      cloud,
      installationId: "installation-a",
      preferences: createDefaultCloudSyncPreferences,
      isOnline: () => true,
      isAuthenticated: () => true,
      refreshAuthentication: async () => { refreshes += 1; return true; },
      setTimer: (callback) => { timers.push(callback); return timers.length as unknown as ReturnType<typeof setTimeout>; },
      clearTimer: () => undefined,
      runSync: async () => { runs += 1; return runs === 1 ? authFailure : completeSummary(); },
    });
    await coordinator.run("manual");
    expect(refreshes).toBe(1);
    expect((await repo.sync!.listOutbox()).length).toBe(1);
    timers.shift()!();
    await vi.waitFor(() => expect(runs).toBe(2));
    expect(refreshes).toBe(1);
    await coordinator.dispose();
  });
});
