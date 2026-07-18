import type { CloudSyncRepository } from "./cloud-repositories";
import type { LocalDataRepositories } from "../persistence/repositories";
import type { AutomaticSyncStatus, AutomaticSyncTrigger, SyncErrorCategory, SyncSummary } from "./sync-types";
import type { CloudSyncPreferences } from "../settings/user-settings";
import { performManualSync } from "./sync-engine";

export interface SyncCoordinatorOptions {
  readonly repositories: LocalDataRepositories;
  readonly cloud: CloudSyncRepository;
  readonly installationId: string;
  readonly tabId?: string;
  readonly deviceName?: () => string | undefined;
  readonly preferences: () => CloudSyncPreferences;
  readonly isOnline?: () => boolean;
  readonly isAuthenticated?: () => boolean;
  readonly refreshAuthentication?: () => Promise<boolean>;
  readonly now?: () => number;
  readonly random?: () => number;
  readonly setTimer?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  readonly clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
  readonly runSync?: typeof performManualSync;
  readonly onStatus?: (status: AutomaticSyncStatus) => void;
  readonly onComplete?: (summary: SyncSummary) => void;
}

const BASE_RETRY_DELAYS = [5_000, 15_000, 45_000, 120_000, 300_000, 600_000] as const;
const triggerDelay = (trigger: AutomaticSyncTrigger): number => {
  if (trigger === "manual" || trigger === "resume" || trigger === "retry") return 0;
  if (trigger === "reconnect") return 1_000;
  if (trigger === "local-change" || trigger === "remote-change") return 2_000;
  return 250;
};

export function retryDelayMs(attempt: number, random = Math.random): number {
  const base = BASE_RETRY_DELAYS[Math.min(Math.max(attempt - 1, 0), BASE_RETRY_DELAYS.length - 1)]!;
  return Math.min(600_000, Math.round(base * (0.85 + Math.min(Math.max(random(), 0), 1) * 0.3)));
}

export class AutomaticSyncCoordinator {
  private readonly tabId: string;
  private timer?: ReturnType<typeof setTimeout>;
  private leaseHeartbeat?: ReturnType<typeof setInterval>;
  private running = false;
  private disposed = false;
  private followUp = false;
  private retryAttempt = 0;
  private lastFocusAt = 0;
  private authRefreshAttempted = false;
  private status: AutomaticSyncStatus = { state: "idle", attempt: 0 };

  constructor(private readonly options: SyncCoordinatorOptions) {
    this.tabId = options.tabId ?? globalThis.crypto?.randomUUID?.() ?? `tab-${Date.now()}`;
  }

  getStatus(): AutomaticSyncStatus { return this.status; }

  schedule(trigger: AutomaticSyncTrigger): void {
    if (this.disposed) return;
    const preferences = this.options.preferences();
    if (trigger !== "manual" && (!preferences.automaticSync || preferences.paused)) {
      this.publish({ state: preferences.paused ? "paused" : "idle", trigger, attempt: this.retryAttempt });
      return;
    }
    if (trigger === "startup" && !preferences.syncOnStartup) return;
    if (trigger === "local-change" && !preferences.syncAfterLocalChanges) return;
    if (trigger === "reconnect" && !preferences.syncOnReconnect) return;
    if (trigger === "focus") {
      if (!preferences.syncOnFocus || this.now() - this.lastFocusAt < 45_000) return;
      this.lastFocusAt = this.now();
    }
    if (trigger === "remote-change" && !preferences.remoteChangeNotifications) return;
    if (this.running) { this.followUp = true; return; }
    if (this.timer) this.clearTimer(this.timer);
    const delay = triggerDelay(trigger);
    const scheduledFor = new Date(this.now() + delay).toISOString();
    this.publish({ state: this.retryAttempt ? "retrying" : "scheduled", trigger, scheduledFor, attempt: this.retryAttempt });
    this.observe("scheduled", { trigger, delayMs: delay, attempt: this.retryAttempt });
    this.timer = this.setTimer(() => { this.timer = undefined; void this.run(trigger); }, delay);
  }

  async run(trigger: AutomaticSyncTrigger = "manual"): Promise<SyncSummary | undefined> {
    if (this.disposed || this.running) { this.followUp = true; return undefined; }
    const sync = this.options.repositories.sync;
    if (!sync) return undefined;
    const preferences = this.options.preferences();
    if (trigger !== "manual" && (!preferences.automaticSync || preferences.paused)) {
      this.publish({ state: preferences.paused ? "paused" : "idle", trigger, attempt: this.retryAttempt });
      return undefined;
    }
    if (this.options.isAuthenticated && !this.options.isAuthenticated()) {
      this.publish({ state: "waiting-auth", trigger, attempt: this.retryAttempt, lastErrorCategory: "auth-required", lastError: "Sign in again to continue synchronization." });
      return undefined;
    }
    if ((this.options.isOnline?.() ?? true) === false) {
      this.publish({ state: "waiting-network", trigger, attempt: this.retryAttempt, lastErrorCategory: "offline", lastError: "Changes are safe on this device and will sync after reconnecting." });
      return undefined;
    }
    const lease = await sync.acquireLease(this.options.installationId, this.tabId);
    if (!lease) {
      this.publish({ state: "scheduled", trigger, scheduledFor: new Date(this.now() + 2_000).toISOString(), attempt: this.retryAttempt });
      this.timer = this.setTimer(() => { this.timer = undefined; void this.run(trigger); }, 2_000);
      return undefined;
    }
    this.running = true;
    this.leaseHeartbeat = setInterval(() => { void sync.renewLease(this.tabId); }, 7_000);
    this.publish({ state: "running", trigger, attempt: this.retryAttempt });
    this.observe("started", { trigger, attempt: this.retryAttempt });
    try {
      if (trigger === "manual" || trigger === "resume" || trigger === "retry") await sync.makeOutboxEligibleNow();
      const now = this.now();
      let attempted = 0;
      for (const operation of await sync.listOutbox(["pending", "retry-wait"])) {
        if (operation.state === "pending" || !operation.nextAttemptAt || Date.parse(operation.nextAttemptAt) <= now) {
          await sync.markOutboxAttempt(operation.id);
          attempted += 1;
        }
      }
      this.observe("outbox_batch", { trigger, recordCount: attempted });
      const summary = await (this.options.runSync ?? performManualSync)({
        repositories: this.options.repositories,
        cloud: this.options.cloud,
        installationId: this.options.installationId,
        ...(this.options.deviceName?.() ? { deviceName: this.options.deviceName!() } : {}),
        online: true,
        respectOutboxSchedule: true,
      });
      await sync.reconcileOutbox();
      this.options.onComplete?.(summary);
      this.observe("completed", { trigger, result: summary.status, conflicts: summary.conflicts, quarantined: summary.quarantined });
      if (summary.retryable) {
        await this.scheduleRetry(summary.errorCategory ?? "unknown", summary.errors[0] ?? "Synchronization will be retried.");
      } else {
        this.retryAttempt = 0;
        if (summary.errorCategory === "auth-required" && !this.authRefreshAttempted && this.options.refreshAuthentication) {
          this.authRefreshAttempted = true;
          this.observe("session_refresh_required", { trigger });
          if (await this.options.refreshAuthentication()) {
            this.timer = this.setTimer(() => { this.timer = undefined; void this.run("retry"); }, 0);
            this.publish({ state: "retrying", trigger: "retry", scheduledFor: new Date(this.now()).toISOString(), attempt: 0 });
            return summary;
          }
        }
        if (summary.status === "complete") this.authRefreshAttempted = false;
        this.publish(summary.errorCategory === "auth-required"
          ? { state: "waiting-auth", trigger, attempt: 0, lastErrorCategory: summary.errorCategory, lastError: summary.errors[0] }
          : summary.status === "failed"
            ? { state: "error", trigger, attempt: 0, lastErrorCategory: summary.errorCategory ?? "unknown", lastError: summary.errors[0] }
            : { state: "idle", trigger, attempt: 0 });
      }
      return summary;
    } catch (error) {
      await this.scheduleRetry("network", error instanceof Error ? error.message : "Synchronization failed.");
      return undefined;
    } finally {
      this.running = false;
      if (this.leaseHeartbeat) { clearInterval(this.leaseHeartbeat); this.leaseHeartbeat = undefined; }
      await sync.releaseLease(this.tabId);
      if (this.followUp && !this.timer && !this.disposed) {
        this.followUp = false;
        this.schedule("local-change");
      }
    }
  }

  pause(): void {
    if (this.timer) { this.clearTimer(this.timer); this.timer = undefined; }
    this.publish({ state: "paused", attempt: this.retryAttempt });
    this.observe("paused", { attempt: this.retryAttempt });
  }

  resume(): void { this.observe("resumed", { attempt: this.retryAttempt }); this.schedule("resume"); }

  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.timer) this.clearTimer(this.timer);
    if (this.leaseHeartbeat) clearInterval(this.leaseHeartbeat);
    await this.options.repositories.sync?.releaseLease(this.tabId);
  }

  private async scheduleRetry(category: SyncErrorCategory, message: string): Promise<void> {
    this.retryAttempt += 1;
    const delay = retryDelayMs(this.retryAttempt, this.options.random);
    const nextRetryAt = new Date(this.now() + delay).toISOString();
    await this.options.repositories.sync?.deferOutbox(category, message, nextRetryAt);
    this.publish({ state: category === "offline" ? "waiting-network" : category === "auth-required" ? "waiting-auth" : "retrying", trigger: "retry", nextRetryAt, attempt: this.retryAttempt, lastErrorCategory: category, lastError: message });
    this.observe("retry_scheduled", { category, attempt: this.retryAttempt, delayMs: delay });
    if (category !== "offline" && category !== "auth-required") {
      this.timer = this.setTimer(() => { this.timer = undefined; void this.run("retry"); }, delay);
    }
  }

  private publish(status: AutomaticSyncStatus): void {
    this.status = status;
    this.options.onStatus?.(status);
  }

  private observe(event: string, fields: Readonly<Record<string, unknown>>): void {
    if (process.env.NODE_ENV !== "production") console.info("[automatic-sync]", { event, ...fields, schemaVersion: "1.0.0" });
  }

  private now(): number { return (this.options.now ?? Date.now)(); }
  private setTimer(callback: () => void, delay: number): ReturnType<typeof setTimeout> { return (this.options.setTimer ?? setTimeout)(callback, delay); }
  private clearTimer(timer: ReturnType<typeof setTimeout>): void { (this.options.clearTimer ?? clearTimeout)(timer); }
}
