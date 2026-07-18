"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/auth-provider";
import { useAccountRepositories } from "./use-account-repositories";
import { ANONYMOUS_DATABASE_NAME, getOrCreateInstallationId } from "@/lib/cloud/local-data-owner";
import { HttpCloudSyncRepository } from "@/lib/cloud/cloud-repositories";
import { copyAnonymousDataForUpload, previewAnonymousDataForUpload, summarizeAnonymousLocalData, SYNC_OUTBOX_CHANGED_EVENT, type LocalUploadPreview } from "@/lib/cloud/local-sync-repository";
import { AutomaticSyncCoordinator } from "@/lib/cloud/sync-coordinator";
import { MaxStoichDatabase } from "@/lib/persistence/database";
import type { AnonymousLocalDataSummary, AutomaticSyncStatus, CloudRecordCounts, LocalSyncConflict, LocalSyncSession, QuarantinedCloudRecord, SyncSummary, SyncUploadCategory } from "@/lib/cloud/sync-types";
import { resolveSyncConflict, type ConflictResolutionChoice } from "@/lib/cloud/conflict-resolution";
import { createDefaultCloudSyncPreferences, type CloudSyncPreferences } from "@/lib/settings/user-settings";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { syncAuthorizedLabCaches } from "@/lib/labs/local-cache";

interface CloudSyncContextValue {
  readonly available: boolean;
  readonly pending: boolean;
  readonly online: boolean;
  readonly statusLabel: string;
  readonly notification?: string;
  readonly automaticStatus: AutomaticSyncStatus;
  readonly preferences: CloudSyncPreferences;
  readonly session?: LocalSyncSession;
  readonly summary?: SyncSummary;
  readonly counts: CloudRecordCounts;
  readonly conflicts: readonly LocalSyncConflict[];
  readonly quarantine: readonly QuarantinedCloudRecord[];
  readonly anonymousData?: AnonymousLocalDataSummary;
  readonly deviceName: string;
  readonly syncNow: () => Promise<SyncSummary | undefined>;
  readonly setPreferences: (preferences: CloudSyncPreferences) => Promise<void>;
  readonly pause: () => Promise<void>;
  readonly resume: () => Promise<void>;
  readonly refresh: () => Promise<void>;
  readonly uploadAnonymous: (categories: readonly SyncUploadCategory[]) => Promise<Readonly<{ failures: readonly string[] }>>;
  readonly previewAnonymous: (categories: readonly SyncUploadCategory[]) => Promise<LocalUploadPreview>;
  readonly keepAnonymousLocal: () => Promise<void>;
  readonly prepareLocalOnly: (categories: readonly SyncUploadCategory[]) => Promise<number>;
  readonly setDeviceName: (name: string) => Promise<void>;
  readonly removeDownloadedCache: () => Promise<Readonly<{ removed: number; preservedPending: number }>>;
  readonly resolveConflict: (id: string, choice: ConflictResolutionChoice) => Promise<void>;
}

const emptyCounts: CloudRecordCounts = { localOnly: 0, pendingUpload: 0, conflicts: 0, errors: 0, cloudRecords: 0 };
const CloudSyncContext = createContext<CloudSyncContextValue | undefined>(undefined);
const hasAnonymousData = (summary?: AnonymousLocalDataSummary): boolean => Boolean(summary && (summary.recipes || summary.notes || summary.comparisons || summary.customSettings));

export function CloudSyncProvider({ children }: Readonly<{ children: ReactNode }>) {
  const router = useRouter();
  const { user, configured, refreshUser } = useAuth();
  const repositories = useAccountRepositories();
  const cloud = useMemo(() => user ? new HttpCloudSyncRepository(user.id) : undefined, [user]);
  const [pending, setPending] = useState(false);
  const [online, setOnline] = useState(true);
  const [session, setSession] = useState<LocalSyncSession>();
  const [summary, setSummary] = useState<SyncSummary>();
  const [counts, setCounts] = useState<CloudRecordCounts>(emptyCounts);
  const [conflicts, setConflicts] = useState<readonly LocalSyncConflict[]>([]);
  const [quarantine, setQuarantine] = useState<readonly QuarantinedCloudRecord[]>([]);
  const [anonymousData, setAnonymousData] = useState<AnonymousLocalDataSummary>();
  const [deviceNameState, setDeviceNameState] = useState("");
  const [firstPromptDismissed, setFirstPromptDismissed] = useState(true);
  const [preferences, setPreferencesState] = useState<CloudSyncPreferences>(createDefaultCloudSyncPreferences());
  const [automaticStatus, setAutomaticStatus] = useState<AutomaticSyncStatus>({ state: "idle", attempt: 0 });
  const [notification, setNotification] = useState<string>();
  const [labSubscriptionVersion, setLabSubscriptionVersion] = useState(0);
  const coordinatorRef = useRef<AutomaticSyncCoordinator | undefined>(undefined);
  const broadcastRef = useRef<BroadcastChannel | undefined>(undefined);
  const preferencesRef = useRef(preferences);
  const onlineRef = useRef(true);
  const deviceNameRef = useRef("");
  useEffect(() => { preferencesRef.current = preferences; }, [preferences]);
  useEffect(() => { onlineRef.current = online; }, [online]);
  useEffect(() => { deviceNameRef.current = deviceNameState; }, [deviceNameState]);

  const refresh = useCallback(async () => {
    if (!user || !repositories.sync) {
      setSession(undefined); setCounts(emptyCounts); setConflicts([]); setQuarantine([]); setAnonymousData(undefined);
      return;
    }
    await repositories.database.open();
    const anonymous = new MaxStoichDatabase(ANONYMOUS_DATABASE_NAME);
    try {
      await anonymous.open();
      const [nextSession, nextCounts, nextConflicts, nextQuarantine, nextAnonymous, device, settings] = await Promise.all([
        repositories.sync.getSession(),
        repositories.sync.counts(),
        repositories.sync.listConflicts(),
        repositories.sync.listQuarantine(),
        summarizeAnonymousLocalData(anonymous),
        repositories.database.cloudDevices.get(user.id),
        repositories.getSettings(),
      ]);
      setSession(nextSession); setSummary(nextSession.lastSummary); setCounts(nextCounts); setConflicts(nextConflicts); setQuarantine(nextQuarantine); setAnonymousData(nextAnonymous); setDeviceNameState(device?.displayName ?? "");
      const dismissKey = `max-stoich-sync-prompt-dismissed:${user.id}:${getOrCreateInstallationId()}`;
      setFirstPromptDismissed(sessionStorage.getItem(dismissKey) === "1" || nextSession.initialLocalDataDecision !== "unreviewed");
      setPreferencesState(settings.cloudSync);
    } finally { anonymous.close(); }
  }, [repositories, user]);

  useEffect(() => {
    queueMicrotask(() => setOnline(navigator.onLine));
    const connected = () => { setOnline(true); coordinatorRef.current?.schedule("reconnect"); };
    const disconnected = () => setOnline(false);
    window.addEventListener("online", connected);
    window.addEventListener("offline", disconnected);
    queueMicrotask(() => void refresh());
    return () => { window.removeEventListener("online", connected); window.removeEventListener("offline", disconnected); };
  }, [refresh]);

  useEffect(() => {
    if (!user || !cloud || !repositories.sync) {
      coordinatorRef.current = undefined;
      return;
    }
    const installationId = getOrCreateInstallationId();
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(`max-stoich-sync:${user.id}`) : undefined;
    broadcastRef.current = channel;
    const coordinator = new AutomaticSyncCoordinator({
      repositories,
      cloud,
      installationId,
      preferences: () => preferencesRef.current,
      isOnline: () => onlineRef.current,
      isAuthenticated: () => Boolean(user),
      refreshAuthentication: async () => Boolean(await refreshUser()),
      deviceName: () => deviceNameRef.current || undefined,
      onStatus: (status) => {
        setAutomaticStatus(status);
        setPending(status.state === "running");
        channel?.postMessage({ kind: "state", status });
      },
      onComplete: (result) => {
        setSummary(result);
        if (result.conflicts > 0) setNotification(`${result.conflicts} synchronization conflict${result.conflicts === 1 ? "" : "s"} need review.`);
        else if (result.quarantined > 0) setNotification(`${result.quarantined} cloud record${result.quarantined === 1 ? " was" : "s were"} quarantined for review.`);
        else if (result.status === "complete" && preferencesRef.current.routineSuccessNotifications) setNotification("Cloud synchronization complete.");
        void refresh();
        void syncAuthorizedLabCaches(repositories.database).then(() => setLabSubscriptionVersion((value) => value + 1)).catch(() => undefined);
        window.dispatchEvent(new CustomEvent("max-stoich:cloud-data-changed", { detail: { ownerId: user.id, downloaded: result.downloaded } }));
      },
    });
    coordinatorRef.current = coordinator;
    const localChange = (event: Event) => {
      const ownerId = (event as CustomEvent<{ ownerId?: string }>).detail?.ownerId;
      if (!ownerId || ownerId === user.id) {
        coordinator.schedule("local-change");
        channel?.postMessage({ kind: "request-pass" });
      }
    };
    const focused = () => { if (document.visibilityState === "visible") coordinator.schedule("focus"); };
    const channelMessage = (event: MessageEvent<{ kind?: string; status?: AutomaticSyncStatus }>) => {
      if (event.data?.kind === "request-pass") coordinator.schedule("remote-change");
      if (event.data?.kind === "state" && event.data.status && coordinator.getStatus().state !== "running") setAutomaticStatus(event.data.status);
    };
    window.addEventListener(SYNC_OUTBOX_CHANGED_EVENT, localChange);
    window.addEventListener("focus", focused);
    document.addEventListener("visibilitychange", focused);
    channel?.addEventListener("message", channelMessage);
    const startupReady = () => coordinator.schedule("startup");
    const workspaceStartup = window.location.pathname === "/" || window.location.pathname === "/workspace";
    if (workspaceStartup) window.addEventListener("max-stoich:local-startup-ready", startupReady, { once: true });
    else void repositories.database.open().then(startupReady);
    return () => {
      window.removeEventListener(SYNC_OUTBOX_CHANGED_EVENT, localChange);
      window.removeEventListener("focus", focused);
      document.removeEventListener("visibilitychange", focused);
      channel?.removeEventListener("message", channelMessage);
      if (workspaceStartup) window.removeEventListener("max-stoich:local-startup-ready", startupReady);
      channel?.close();
      if (broadcastRef.current === channel) broadcastRef.current = undefined;
      void coordinator.dispose();
      if (coordinatorRef.current === coordinator) coordinatorRef.current = undefined;
    };
  }, [cloud, refresh, refreshUser, repositories, user]);

  useEffect(() => {
    if (!user || !preferences.remoteChangeNotifications) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const tableNames = ["recipes", "recipe_revisions", "recipe_notes", "comparisons", "user_settings"] as const;
    const channel = client.channel(`max-stoich-account-changes:${user.id}`);
    for (const table of tableNames) {
      channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `owner_id=eq.${user.id}` }, () => {
        if (process.env.NODE_ENV !== "production") console.info("[automatic-sync]", { event: "remote_change_hint", table });
        coordinatorRef.current?.schedule("remote-change");
      });
    }
    channel.subscribe();
    return () => { void client.removeChannel(channel); };
  }, [preferences.remoteChangeNotifications, user]);

  useEffect(() => {
    if (!user || !preferences.remoteChangeNotifications) return;
    const client = getSupabaseBrowserClient();
    if (!client) return;
    let disposed = false;
    let channel: ReturnType<typeof client.channel> | undefined;
    void repositories.database.labCaches.toArray().then((labs) => {
      if (disposed || !labs.length) return;
      channel = client.channel(`max-stoich-lab-changes:${user.id}:${labSubscriptionVersion}`);
      const tables = ["lab_members", "lab_library_entries", "lab_library_versions", "lab_publication_notes", "lab_audit_events"] as const;
      for (const lab of labs) for (const table of tables) {
        channel.on("postgres_changes", { event: "*", schema: "public", table, filter: `lab_id=eq.${lab.id}` }, () => {
          if (process.env.NODE_ENV !== "production") console.info("[lab-sync]", { event: "remote_change_hint", table, lab: lab.id.slice(0, 8) });
          coordinatorRef.current?.schedule("remote-change");
        });
      }
      channel.subscribe();
    });
    return () => { disposed = true; if (channel) void client.removeChannel(channel); };
  }, [labSubscriptionVersion, preferences.remoteChangeNotifications, repositories.database.labCaches, user]);

  const syncNow = useCallback(async () => {
    if (!user || !cloud || !repositories.sync || pending) return undefined;
    setPending(true);
    try {
      broadcastRef.current?.postMessage({ kind: "request-pass", trigger: "manual" });
      const result = await coordinatorRef.current?.run("manual");
      return result;
    } finally { setPending(false); }
  }, [cloud, pending, repositories.sync, user]);

  const uploadAnonymous = useCallback(async (categories: readonly SyncUploadCategory[]) => {
    if (!user || !repositories.sync) throw new Error("Sign in before reviewing local data.");
    setPending(true);
    const anonymous = new MaxStoichDatabase(ANONYMOUS_DATABASE_NAME);
    try {
      const result = await copyAnonymousDataForUpload(anonymous, repositories.database, user.id, categories);
      await repositories.sync.updateSession({ initialLocalDataDecision: "uploaded" });
      setFirstPromptDismissed(true);
      await refresh();
      return { failures: result.failures };
    } finally { anonymous.close(); setPending(false); }
  }, [refresh, repositories, user]);

  const previewAnonymous = useCallback(async (categories: readonly SyncUploadCategory[]) => {
    if (!user) throw new Error("Sign in before reviewing local data.");
    const anonymous = new MaxStoichDatabase(ANONYMOUS_DATABASE_NAME);
    try { return await previewAnonymousDataForUpload(anonymous, repositories.database, categories); }
    finally { anonymous.close(); }
  }, [repositories.database, user]);

  const keepAnonymousLocal = useCallback(async () => {
    if (!repositories.sync) return;
    await repositories.sync.updateSession({ initialLocalDataDecision: "keep-local" });
    setFirstPromptDismissed(true);
    await refresh();
  }, [refresh, repositories]);

  const prepareLocalOnly = useCallback(async (categories: readonly SyncUploadCategory[]) => {
    if (!repositories.sync) throw new Error("Cloud sync is unavailable.");
    const prepared = await repositories.sync.prepareLocalOnlyForUpload(categories);
    await refresh();
    return prepared;
  }, [refresh, repositories.sync]);

  const dismissPrompt = () => {
    if (!user) return;
    sessionStorage.setItem(`max-stoich-sync-prompt-dismissed:${user.id}:${getOrCreateInstallationId()}`, "1");
    setFirstPromptDismissed(true);
  };

  const setDeviceName = useCallback(async (name: string) => {
    if (!user) return;
    const trimmed = name.trim().slice(0, 120);
    await repositories.database.cloudDevices.put({ ownerId: user.id, installationId: getOrCreateInstallationId(), ...(trimmed ? { displayName: trimmed } : {}), updatedAt: new Date().toISOString() });
    setDeviceNameState(trimmed);
  }, [repositories.database.cloudDevices, user]);

  const removeDownloadedCache = useCallback(async () => {
    if (!repositories.sync) throw new Error("Cloud cache is unavailable.");
    const result = await repositories.sync.removeDownloadedCache();
    await refresh();
    router.refresh();
    return result;
  }, [refresh, repositories.sync, router]);

  const resolveConflict = useCallback(async (id: string, choice: ConflictResolutionChoice) => {
    await resolveSyncConflict(repositories, id, choice);
    await refresh();
    router.refresh();
  }, [refresh, repositories, router]);

  const setPreferences = useCallback(async (next: CloudSyncPreferences) => {
    const settings = await repositories.getSettings();
    await repositories.saveSettings({ ...settings, cloudSync: next });
    setPreferencesState(next);
    preferencesRef.current = next;
    if (next.paused || !next.automaticSync) coordinatorRef.current?.pause();
    else coordinatorRef.current?.schedule("resume");
    await refresh();
  }, [refresh, repositories]);
  const pause = useCallback(async () => setPreferences({ ...preferencesRef.current, paused: true }), [setPreferences]);
  const resume = useCallback(async () => setPreferences({ ...preferencesRef.current, automaticSync: true, paused: false }), [setPreferences]);

  const statusLabel = !configured ? "Cloud unavailable" : !user ? "Local only" : !online ? "Offline" : pending ? "Syncing…" : counts.conflicts ? `${counts.conflicts} conflict${counts.conflicts === 1 ? "" : "s"}` : counts.pendingUpload ? `${counts.pendingUpload} change${counts.pendingUpload === 1 ? "" : "s"} pending` : session?.lastSuccessfulSyncAt ? `Synced ${new Date(session.lastSuccessfulSyncAt).toLocaleString()}` : "Cloud connected · Not synced";
  useEffect(() => {
    if (!notification) return;
    const timer = window.setTimeout(() => setNotification(undefined), 5_000);
    return () => window.clearTimeout(timer);
  }, [notification]);
  const value: CloudSyncContextValue = { available: Boolean(user && configured), pending, online, statusLabel: preferences.paused ? "Sync paused" : automaticStatus.state === "waiting-auth" ? "Sign in again to sync" : automaticStatus.state === "retrying" ? "Retrying automatically" : statusLabel, ...(notification ? { notification } : {}), automaticStatus, preferences, ...(session ? { session } : {}), ...(summary ? { summary } : {}), counts, conflicts, quarantine, ...(anonymousData ? { anonymousData } : {}), deviceName: deviceNameState, syncNow, setPreferences, pause, resume, refresh, uploadAnonymous, previewAnonymous, keepAnonymousLocal, prepareLocalOnly, setDeviceName, removeDownloadedCache, resolveConflict };

  return <CloudSyncContext.Provider value={value}>
    {children}
    {user && !firstPromptDismissed && hasAnonymousData(anonymousData) && <div aria-labelledby="local-data-found-title" aria-modal="true" className="cloud-first-sync-backdrop" role="dialog">
      <section className="cloud-first-sync-dialog">
        <h2 className="text-xl font-bold" id="local-data-found-title">Local MAXCalc data found on this device</h2>
        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div><dt>Recipes</dt><dd className="font-semibold">{anonymousData!.recipes}</dd></div>
          <div><dt>Revisions</dt><dd className="font-semibold">{anonymousData!.revisions}</dd></div>
          <div><dt>Notes</dt><dd className="font-semibold">{anonymousData!.notes}</dd></div>
          <div><dt>Comparisons</dt><dd className="font-semibold">{anonymousData!.comparisons}</dd></div>
          <div><dt>Custom settings</dt><dd className="font-semibold">{anonymousData!.customSettings ? "Yes" : "No"}</dd></div>
        </dl>
        <p className="mt-4 text-sm">Nothing will be uploaded or assigned to this account until you review and confirm it.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button className="rounded bg-teal-800 px-4 py-2 font-semibold text-white" onClick={() => router.push("/account/cloud-data?review=1")} type="button">Review and upload</button>
          <button className="rounded border px-4 py-2 font-semibold" onClick={() => void keepAnonymousLocal()} type="button">Keep local only</button>
          <button className="rounded border px-4 py-2" onClick={dismissPrompt} type="button">Not now</button>
        </div>
      </section>
    </div>}
  </CloudSyncContext.Provider>;
}

export function useCloudSync(): CloudSyncContextValue {
  const value = useContext(CloudSyncContext);
  if (!value) throw new Error("useCloudSync must be used within CloudSyncProvider.");
  return value;
}
