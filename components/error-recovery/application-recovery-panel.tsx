"use client";

import { useState } from "react";
import { APPEARANCE_BOOTSTRAP_KEY } from "@/lib/theme/theme";
import { DATABASE_VERSION } from "@/lib/persistence/database";
import { LocalDataRepositories } from "@/lib/persistence/repositories";
import { classifyStartupError, loadStartupData } from "@/lib/persistence/startup-recovery";
import { useAuth } from "@/components/auth/auth-provider";
import { databaseNameForOwner } from "@/lib/cloud/local-data-owner";
import { MaxStoichDatabase } from "@/lib/persistence/database";

async function openExistingDatabase(databaseName: string): Promise<IDBDatabase> {
  if (!("indexedDB" in window)) throw new Error("IndexedDB is unavailable in this browser context.");
  const request = indexedDB.open(databaseName);
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB could not be opened."));
    request.onblocked = () => reject(new Error("Database open is blocked by another MAXCalc tab."));
  });
}

async function deleteRecord(databaseName: string, storeName: string, key: IDBValidKey): Promise<void> {
  const database = await openExistingDatabase(databaseName);
  try {
    if (!database.objectStoreNames.contains(storeName)) return;
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error(`Could not update ${storeName}.`));
      transaction.onabort = () => reject(transaction.error ?? new Error(`Update of ${storeName} was aborted.`));
    });
  } finally { database.close(); }
}

async function emergencyExport(databaseName: string, error: Error & { digest?: string }): Promise<void> {
  const database = await openExistingDatabase(databaseName);
  try {
    const records: Record<string, unknown> = {};
    for (const storeName of Array.from(database.objectStoreNames)) {
      records[storeName] = await new Promise<unknown[]>((resolve, reject) => {
        const transaction = database.transaction(storeName, "readonly");
        const request = transaction.objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error(`Could not read ${storeName}.`));
      });
    }
    const payload = JSON.stringify({ recordType: "max-stoich-emergency-diagnostic", exportedAt: new Date().toISOString(), databaseName: database.name, databaseVersion: database.version, applicationDatabaseVersion: DATABASE_VERSION, error: { name: error.name, message: error.message, digest: error.digest }, records }, null, 2);
    const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(new Blob([payload], { type: "application/json" })); anchor.download = `max-stoich-emergency-${new Date().toISOString().slice(0, 10)}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(anchor.href), 0);
  } finally { database.close(); }
}

async function deleteLocalDatabase(databaseName: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(databaseName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Local database could not be deleted."));
    request.onblocked = () => reject(new Error("Another MAXCalc tab is blocking the reset. Close other tabs and try again."));
  });
}

export function ApplicationRecoveryPanel({ error, reset, title = "MAXCalc encountered a local application error" }: { error: Error & { digest?: string }; reset: () => void; title?: string }) {
  const { user } = useAuth();
  const databaseName = databaseNameForOwner(user?.id);
  const [pending, setPending] = useState("");
  const [actionError, setActionError] = useState("");
  const act = async (label: string, action: () => Promise<void>) => { setPending(label); setActionError(""); try { await action(); } catch (reason) { setActionError(reason instanceof Error ? reason.message : "The recovery action failed."); setPending(""); } };
  const reload = () => { reset(); window.location.assign("/workspace"); };
  const retryStartup = async () => {
    const repositories = new LocalDataRepositories(new MaxStoichDatabase(databaseName), user?.id);
    try {
      await loadStartupData(repositories);
      reload();
    } catch (reason) {
      throw new Error(classifyStartupError(reason).message);
    } finally {
      repositories.close();
    }
  };
  return <main className="min-h-screen bg-slate-100 p-6 text-slate-950"><section className="mx-auto max-w-3xl rounded-xl border bg-white p-6 shadow-sm" aria-labelledby="application-error-heading">
    <p className="text-sm font-semibold uppercase tracking-wide text-red-800">Local application recovery</p><h1 className="mt-1 text-2xl font-bold" id="application-error-heading">{title}</h1>
    <p className="mt-3">A normal refresh cannot repair a persistent malformed local record. Saved data has not been automatically deleted.</p>
    {pending && <p aria-live="polite" className="mt-3 font-semibold">{pending}…</p>}{actionError && <p aria-live="assertive" className="mt-3 rounded border border-red-400 bg-red-50 p-3 font-semibold">{actionError}</p>}
    <div className="mt-5 flex flex-wrap gap-2">
      <button className="rounded bg-teal-800 px-4 py-2 font-semibold text-white disabled:bg-slate-400" disabled={Boolean(pending)} onClick={() => void act("Retrying local workspace", retryStartup)}>Retry</button>
      <button className="rounded border px-4 py-2 font-semibold disabled:text-slate-400" disabled={Boolean(pending)} onClick={() => void act("Opening without the last workspace", async () => { await deleteRecord(databaseName, "recovery", "current"); reload(); })}>Open without restoring workspace</button>
      <button className="rounded border px-4 py-2 font-semibold disabled:text-slate-400" disabled={Boolean(pending)} onClick={() => void act("Resetting local settings", async () => { await deleteRecord(databaseName, "userSettings", "local-user-settings"); localStorage.removeItem(APPEARANCE_BOOTSTRAP_KEY); reload(); })}>Reset settings only</button>
      <button className="rounded border px-4 py-2 font-semibold disabled:text-slate-400" disabled={Boolean(pending)} onClick={() => void act("Exporting emergency backup", () => emergencyExport(databaseName, error))}>Export emergency backup</button>
      <button className="rounded border border-red-400 px-4 py-2 font-semibold text-red-900 disabled:text-slate-400" disabled={Boolean(pending)} onClick={() => { if (!window.confirm("Delete every local MAXCalc recipe, revision, snapshot, note, route, comparison, setting, and recovery record for this local account scope? Export an emergency backup first if possible.")) return; void act("Resetting all local application data", async () => { await deleteLocalDatabase(databaseName); localStorage.removeItem(APPEARANCE_BOOTSTRAP_KEY); reload(); }); }}>Reset this local data scope…</button>
    </div>
    <p className="mt-4 text-sm">Opening without restore deletes only the unsaved recovery record. Reset settings deletes only the settings record. Both preserve saved recipes and scientific snapshots.</p>
    <details className="mt-5 rounded border p-3"><summary className="cursor-pointer font-semibold">Technical error details</summary><dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="font-semibold">Name</dt><dd>{error.name || "Error"}</dd></div><div><dt className="font-semibold">Digest</dt><dd>{error.digest ?? "Unavailable"}</dd></div><div><dt className="font-semibold">Expected database version</dt><dd>{DATABASE_VERSION}</dd></div><div><dt className="font-semibold">Timestamp</dt><dd>{new Date().toISOString()}</dd></div></dl><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-100 p-3 text-xs">{error.message || "No error message was supplied."}{error.stack ? `\n\n${error.stack}` : ""}</pre></details>
  </section></main>;
}
