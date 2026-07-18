"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCloudSync } from "./cloud-sync-provider";
import { useAccountRepositories } from "./use-account-repositories";
import { createLocalBackup, serializeBackup } from "@/lib/persistence/backup";
import { downloadText, safeExportFilename } from "@/lib/export/laboratory-export";
import type { SyncUploadCategory } from "@/lib/cloud/sync-types";
import type { LocalUploadPreview } from "@/lib/cloud/local-sync-repository";
import { getOrCreateInstallationId } from "@/lib/cloud/local-data-owner";
import { CLOUD_SYNC_SCHEMA_VERSION } from "@/lib/cloud/sync-types";
import { DATABASE_VERSION } from "@/lib/persistence/database";
import packageMetadata from "@/package.json";

const categoryLabels: Readonly<Record<SyncUploadCategory, string>> = { recipes: "Recipes and immutable revisions", notes: "Structured notes", comparisons: "Saved comparisons", settings: "User settings" };
const valueName = (value: unknown, fallback: string): string => {
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  if (typeof record.name === "string") return record.name;
  if (typeof record.title === "string") return record.title;
  for (const key of ["note", "comparison", "settings"]) {
    const nested = record[key];
    if (nested && typeof nested === "object" && "name" in nested && typeof nested.name === "string") return nested.name;
    if (nested && typeof nested === "object" && "title" in nested && typeof nested.title === "string") return nested.title;
  }
  return fallback;
};

export function CloudDataPanel() {
  const cloud = useCloudSync();
  const repositories = useAccountRepositories();
  const [selected, setSelected] = useState<readonly SyncUploadCategory[]>(["recipes", "notes", "comparisons", "settings"]);
  const [preview, setPreview] = useState<LocalUploadPreview>();
  const [message, setMessage] = useState("");
  const [deviceName, setDeviceName] = useState(cloud.deviceName);
  const hasAnonymous = Boolean(cloud.anonymousData && (cloud.anonymousData.recipes || cloud.anonymousData.notes || cloud.anonymousData.comparisons || cloud.anonymousData.customSettings));
  const summary = cloud.summary;
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const toggle = (category: SyncUploadCategory) => setSelected((current) => current.includes(category) ? current.filter((item) => item !== category) : [...current, category]);
  const review = async () => { setMessage(""); try { setPreview(await cloud.previewAnonymous(selected)); } catch (error) { setMessage(error instanceof Error ? error.message : "Local data review failed."); } };
  const confirmUpload = async () => {
    if (!preview || preview.failures.length) return;
    setMessage("");
    try {
      const result = await cloud.uploadAnonymous(selected);
      setPreview(undefined);
      setMessage(result.failures.length ? `Eligible records were prepared; ${result.failures.length} record(s) remain local because validation failed.` : "Selected local records are ready. Choose Sync now to upload them.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Local records could not be prepared."); }
  };
  const exportBackup = async () => {
    const backup = await createLocalBackup(repositories.database);
    downloadText(safeExportFilename(`maxcalc-account-local-backup-${backup.createdAt.slice(0, 10)}`, "json"), serializeBackup(backup), "application/json;charset=utf-8");
    setMessage("Verified local backup downloaded. Cloud synchronization does not replace this backup.");
  };
  const removeCache = async () => {
    if (!window.confirm("Remove only safely downloaded cloud-cache records from this device? Cloud records, anonymous data, and pending local changes will remain.")) return;
    const result = await cloud.removeDownloadedCache();
    setMessage(`Removed ${result.removed} downloaded record(s). Preserved ${result.preservedPending} local or pending record(s).`);
  };
  const copyDiagnostics = async () => {
    const ownerId = repositories.ownerId ?? "";
    const installationId = getOrCreateInstallationId();
    const [outbox, lease] = await Promise.all([
      repositories.sync?.listOutbox() ?? [],
      ownerId ? repositories.database.cloudSyncLeases.get(ownerId) : undefined,
    ]);
    const pendingByEntity = Object.fromEntries([...new Set(outbox.map((item) => item.recordType))].sort().map((type) => [type, outbox.filter((item) => item.recordType === type).length]));
    await navigator.clipboard.writeText(JSON.stringify({
      reportSchemaVersion: "1.0.0",
      appVersion: packageMetadata.version,
      localDatabaseVersion: DATABASE_VERSION,
      cloudContractVersion: CLOUD_SYNC_SCHEMA_VERSION,
      owner: ownerId ? `…${ownerId.slice(-6)}` : "unavailable",
      installation: `…${installationId.slice(-6)}`,
      coordinator: cloud.automaticStatus,
      automaticSyncEnabled: cloud.preferences.automaticSync,
      paused: cloud.preferences.paused,
      online: cloud.online,
      realtime: cloud.preferences.remoteChangeNotifications ? "enabled-change-hints" : "disabled",
      activeLease: lease ? { heldByThisInstallation: lease.installationId === installationId, expiresAt: lease.expiresAt } : null,
      cursor: cloud.session?.cursor,
      lastAttemptAt: cloud.session?.lastAttemptAt,
      lastSuccessfulSyncAt: cloud.session?.lastSuccessfulSyncAt,
      pendingByEntity,
      conflicts: cloud.counts.conflicts,
      quarantined: cloud.quarantine.length,
      lastSummary: cloud.summary ? { status: cloud.summary.status, errorCategory: cloud.summary.errorCategory, retryable: cloud.summary.retryable, phases: cloud.summary.phases } : undefined,
    }, null, 2));
    setMessage("Redacted synchronization diagnostics copied. Record contents, full identifiers, and credentials were excluded.");
  };
  return <main className="auth-page min-h-screen p-4">
    <div className="mx-auto w-full max-w-6xl">
      <header className="flex flex-wrap items-center gap-3"><Link className="rounded border px-3 py-2 font-semibold" href="/account">← Account</Link><Link className="rounded border px-3 py-2" href="/workspace">Calculator</Link><div className="mr-auto"><h1 className="text-2xl font-bold">Cloud data and synchronization</h1><p className="text-sm">Automatic account-scoped foreground synchronization with durable offline queuing.</p></div><button className="rounded bg-teal-800 px-4 py-2 font-semibold text-white disabled:bg-slate-400" disabled={cloud.pending || !cloud.online} onClick={() => void cloud.syncNow().then((result) => result && setMessage(result.status === "complete" ? "Sync complete." : result.errors.join(" ")))} type="button">{cloud.pending ? "Syncing…" : "Sync now"}</button></header>
      {message && <p aria-live="polite" className="mt-4 rounded border bg-white p-3 text-sm">{message}</p>}
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <section className="rounded border bg-white p-4"><h2 className="font-semibold">Status</h2><p className="mt-2 text-lg font-bold">{cloud.statusLabel}</p><dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><div><dt>Local-only</dt><dd className="font-semibold">{cloud.counts.localOnly}</dd></div><div><dt>Pending upload</dt><dd className="font-semibold">{cloud.counts.pendingUpload}</dd></div><div><dt>Known cloud records</dt><dd className="font-semibold">{cloud.counts.cloudRecords}</dd></div><div><dt>Conflicts</dt><dd className="font-semibold">{cloud.counts.conflicts}</dd></div></dl><p className="mt-3 text-xs">Last successful sync: {cloud.session?.lastSuccessfulSyncAt ? new Date(cloud.session.lastSuccessfulSyncAt).toLocaleString() : "Never on this device"}</p></section>
        <section className="rounded border bg-white p-4"><h2 className="font-semibold">This device</h2><label className="mt-3 block text-sm font-semibold">Optional device name<input className="mt-1 min-h-10 w-full rounded border px-3" maxLength={120} onChange={(event) => setDeviceName(event.target.value)} placeholder="Lab laptop" value={deviceName} /></label><button className="mt-2 rounded border px-3 py-2 text-sm font-semibold" onClick={() => void cloud.setDeviceName(deviceName).then(() => setMessage("Device name saved locally; the next sync updates cloud diagnostics."))} type="button">Save device name</button><p className="mt-2 text-xs">Device names help diagnose synchronization only. They are not used for access control.</p></section>
        <section className="rounded border bg-white p-4"><h2 className="font-semibold">Local backup</h2><p className="mt-2 text-sm">A verified backup is portable and user-controlled. Cloud storage is not a backup replacement.</p><button className="mt-3 rounded border px-3 py-2 font-semibold" onClick={() => void exportBackup()} type="button">Export local backup</button></section>
      </div>

      <section className="mt-4 rounded border bg-white p-4" aria-labelledby="automatic-sync-heading"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold" id="automatic-sync-heading">Automatic synchronization</h2><p className="mt-1 text-sm">Uses the same validated pull, merge, conflict, and upload engine as Sync now. Closing the tab never discards queued changes.</p></div><button className="rounded border px-3 py-2 font-semibold" onClick={() => void (cloud.preferences.paused ? cloud.resume() : cloud.pause())} type="button">{cloud.preferences.paused ? "Resume sync" : "Pause sync"}</button></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{([
        ["automaticSync", "Automatic sync"],
        ["syncOnStartup", "On startup"],
        ["syncAfterLocalChanges", "After local changes"],
        ["syncOnReconnect", "After reconnect"],
        ["syncOnFocus", "When returning"],
        ["remoteChangeNotifications", "Other-device change hints"],
      ] as const).map(([key, label]) => <label className="flex items-center gap-2 rounded border p-3 text-sm" key={key}><input checked={cloud.preferences[key]} onChange={(event) => void cloud.setPreferences({ ...cloud.preferences, [key]: event.target.checked })} type="checkbox" />{label}</label>)}</div><p className="mt-3 text-xs">Coordinator: {cloud.automaticStatus.state}{cloud.automaticStatus.nextRetryAt ? ` · next retry ${new Date(cloud.automaticStatus.nextRetryAt).toLocaleString()}` : ""}. Routine successful passes stay quiet.</p><button className="mt-3 rounded border px-3 py-2 text-sm font-semibold" onClick={() => void copyDiagnostics()} type="button">Copy redacted diagnostics</button></section>

      <section className="mt-4 rounded border bg-white p-4" id="pending" aria-labelledby="local-upload-heading"><h2 className="text-lg font-semibold" id="local-upload-heading">Review anonymous data for upload</h2>
        {!hasAnonymous ? <p className="mt-2 text-sm">No anonymous recipes, notes, comparisons, or custom settings are waiting for a decision on this device.</p> : <>
          <p className="mt-2 text-sm">Anonymous data stays in its original local database. Confirming creates account-scoped copies with the same stable IDs; it does not delete the originals.</p>
          <fieldset className="mt-3 grid gap-2 sm:grid-cols-2"><legend className="sr-only">Upload categories</legend>{(Object.keys(categoryLabels) as SyncUploadCategory[]).map((category) => <label className="flex items-center gap-2 rounded border p-3 text-sm" key={category}><input checked={selectedSet.has(category)} onChange={() => toggle(category)} type="checkbox" />{categoryLabels[category]}</label>)}</fieldset>
          <div className="mt-3 flex flex-wrap gap-2"><button className="rounded border px-3 py-2 font-semibold" disabled={!selected.length || cloud.pending} onClick={() => void review()} type="button">Review selected records</button>{preview && <button className="rounded bg-teal-800 px-3 py-2 font-semibold text-white disabled:bg-slate-400" disabled={Boolean(preview.failures.length) || cloud.pending} onClick={() => void confirmUpload()} type="button">Confirm and prepare upload</button>}<button className="rounded border px-3 py-2" onClick={() => void cloud.keepAnonymousLocal().then(() => setMessage("Anonymous data will remain local. You can revisit this section later."))} type="button">Keep local only</button></div>
          {preview && <div className={`mt-3 rounded border p-3 text-sm ${preview.failures.length ? "border-red-400 bg-red-50" : "border-teal-400 bg-teal-50"}`}><h3 className="font-semibold">{preview.failures.length ? "Upload blocked for invalid records" : "Ready for confirmation"}</h3><p>Recipes {preview.counts.recipes} · revisions {preview.counts.revisions} · notes {preview.counts.notes} · comparisons {preview.counts.comparisons} · settings {preview.counts.customSettings ? 1 : 0}</p>{preview.potentialDuplicates.map((item) => <p className="mt-1 text-amber-900" key={item}>Potential duplicate: {item}</p>)}{preview.failures.map((item) => <p className="mt-1 text-red-900" key={item}>{item}</p>)}<p className="mt-2 text-xs">Matching IDs and scientific digests are reviewed as the same record. Names alone never trigger a merge.</p></div>}
        </>}
      </section>
      {cloud.counts.localOnly > 0 && <section className="mt-4 rounded border bg-white p-4" aria-labelledby="restored-local-heading"><h2 className="text-lg font-semibold" id="restored-local-heading">Account-local records awaiting review</h2><p className="mt-2 text-sm">{cloud.counts.localOnly} restored or deliberately local-only record(s) are not eligible for upload yet. This prevents a backup restore from overwriting cloud data automatically.</p><button className="mt-3 rounded border px-3 py-2 font-semibold" onClick={() => { if (window.confirm("Prepare the selected categories of account-local records for synchronization? Stable-ID collisions will still be handled as conflicts.")) void cloud.prepareLocalOnly(selected).then((count) => setMessage(`${count} record(s) prepared for the next automatic or manual pass.`)); }} type="button">Prepare selected categories for upload…</button></section>}

      {summary && <section className="mt-4 rounded border bg-white p-4" aria-labelledby="summary-heading"><h2 className="text-lg font-semibold" id="summary-heading">Last sync summary · {summary.status}</h2><div className="mt-3 grid gap-3 sm:grid-cols-3"><div><h3 className="font-semibold">Uploaded</h3><p className="text-sm">{summary.uploaded.recipes} recipes · {summary.uploaded.revisions} revisions · {summary.uploaded.notes} notes · {summary.uploaded.comparisons} comparisons · {summary.uploaded.settings} settings</p></div><div><h3 className="font-semibold">Downloaded</h3><p className="text-sm">{summary.downloaded.recipes} recipes · {summary.downloaded.revisions} revisions · {summary.downloaded.notes} notes · {summary.downloaded.comparisons} comparisons · {summary.downloaded.settings} settings</p></div><div><h3 className="font-semibold">Review</h3><p className="text-sm">{summary.conflicts} conflicts · {summary.quarantined} quarantined · completed {new Date(summary.completedAt).toLocaleTimeString()}</p></div></div>{summary.errors.map((error) => <p className="mt-2 text-sm text-red-900" key={error}>{error}</p>)}</section>}

      <section className="mt-4 rounded border bg-white p-4" id="conflicts" aria-labelledby="conflicts-heading"><h2 className="text-lg font-semibold" id="conflicts-heading">Conflicts</h2>
        {!cloud.conflicts.length ? <p className="mt-2 text-sm">No unresolved conflicts.</p> : <div className="mt-3 space-y-3">{cloud.conflicts.map((conflict) => {
          const scientific = conflict.kind === "scientific-integrity";
          return <article className="rounded border-2 border-amber-500 p-4" key={conflict.id}><h3 className="font-semibold">{scientific ? "Scientific revision integrity conflict" : `${conflict.recordName} · ${conflict.kind.replaceAll("-", " ")}`}</h3><p className="mt-1 text-sm">{scientific ? "The same revision ID has different scientific contents. Neither copy was overwritten." : `This device: ${valueName(conflict.localValue, "Local value")} · Cloud: ${valueName(conflict.cloudValue, "Cloud value")}`}</p><p className="mt-1 text-xs">Changed fields: {conflict.fields.join(", ") || "content"}{conflict.sourceDeviceId ? ` · source ${conflict.sourceDeviceId}` : ""}</p><div className="mt-3 flex flex-wrap gap-2">{scientific ? <><button className="rounded border px-3 py-2" onClick={() => downloadText(safeExportFilename(`maxcalc-conflict-${conflict.recordName}`, "json"), JSON.stringify({ recordType: "maxcalc-sync-conflict-export", exportedAt: new Date().toISOString(), local: conflict.localValue, cloud: conflict.cloudValue }, null, 2), "application/json;charset=utf-8")} type="button">Export both</button><button className="rounded border px-3 py-2 font-semibold" onClick={() => void cloud.resolveConflict(conflict.id, "keep-both").catch((error) => setMessage(error instanceof Error ? error.message : "Conflict resolution failed."))} type="button">Keep both as separate revisions</button></> : <><button className="rounded border px-3 py-2" onClick={() => void cloud.resolveConflict(conflict.id, "keep-local").catch((error) => setMessage(error instanceof Error ? error.message : "Conflict resolution failed."))} type="button">{conflict.recordType === "user-settings" ? "Use this device" : "Keep this device"}</button><button className="rounded border px-3 py-2" onClick={() => void cloud.resolveConflict(conflict.id, "keep-cloud").catch((error) => setMessage(error instanceof Error ? error.message : "Conflict resolution failed."))} type="button">Keep cloud</button>{conflict.recordType !== "user-settings" && <button className="rounded border px-3 py-2" onClick={() => void cloud.resolveConflict(conflict.id, "keep-both").catch((error) => setMessage(error instanceof Error ? error.message : "Conflict resolution failed."))} type="button">Keep both</button>}</>}</div></article>;
        })}</div>}
      </section>

      <section className="mt-4 rounded border bg-white p-4"><h2 className="text-lg font-semibold">Validation quarantine</h2><p className="mt-1 text-sm">A malformed or future-schema cloud record is isolated without clearing IndexedDB or blocking unrelated valid records.</p>{cloud.quarantine.length ? <ul className="mt-3 space-y-2 text-sm">{cloud.quarantine.map((item) => <li className="rounded border p-2" key={item.id}><strong>{item.code}</strong> · {item.recordType} · {item.message}</li>)}</ul> : <p className="mt-2 text-sm">No quarantined cloud records.</p>}</section>

      <section className="mt-4 rounded border bg-white p-4"><h2 className="text-lg font-semibold">Device cache</h2><p className="mt-2 text-sm">Removing downloaded cache affects only this account on this browser. It never deletes cloud records, anonymous records, or pending local changes.</p><button className="mt-3 rounded border border-red-400 px-3 py-2 font-semibold" onClick={() => void removeCache()} type="button">Remove downloaded cloud cache from this device…</button></section>
    </div>
  </main>;
}
