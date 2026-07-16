"use client";

import type { StartupFailure } from "@/lib/persistence/startup-recovery";

export function StartupRecoveryScreen({ failure, pending, onRetry, onOpenBlank, onRepair, onExport, onResetRecovery, onFullReset }: {
  failure: StartupFailure; pending: boolean;
  onRetry: () => void; onOpenBlank: () => void; onRepair: () => void; onExport: () => void; onResetRecovery: () => void; onFullReset: () => void;
}) {
  return <main className="min-h-screen bg-slate-100 p-6 text-slate-950"><section className="mx-auto max-w-3xl rounded-xl border bg-white p-6 shadow-sm" aria-labelledby="startup-recovery-heading">
    <p className="text-sm font-semibold uppercase tracking-wide text-amber-800">Local workspace recovery</p>
    <h1 className="mt-1 text-2xl font-bold" id="startup-recovery-heading">MAX Stoich could not finish opening</h1>
    <p className="mt-3">{pending ? "Retrying local workspace…" : failure.message}</p>
    <div className="mt-5 flex flex-wrap gap-2">
      <button className="rounded bg-teal-800 px-4 py-2 font-semibold text-white disabled:bg-slate-400" disabled={pending} onClick={onRetry}>Retry</button>
      <button className="rounded border px-4 py-2 font-semibold disabled:text-slate-400" disabled={pending} onClick={onOpenBlank}>Open without restoring workspace</button>
      <button className="rounded border px-4 py-2 font-semibold disabled:text-slate-400" disabled={pending} onClick={onRepair}>Repair local workspace</button>
      <button className="rounded border px-4 py-2 font-semibold disabled:text-slate-400" disabled={pending} onClick={onExport}>Export diagnostic backup</button>
      <button className="rounded border px-4 py-2 font-semibold disabled:text-slate-400" disabled={pending} onClick={onResetRecovery}>Reset recoverable workspace</button>
      <button className="rounded border border-red-400 px-4 py-2 font-semibold text-red-900 disabled:text-slate-400" disabled={pending} onClick={onFullReset}>Reset local application data…</button>
    </div>
    <p className="mt-4 text-sm">Opening blank, repairing, or resetting recovery preserves saved recipes, revisions, notes, routes, comparisons, and readable settings. Full reset is the only action that deletes all local data.</p>
    <details className="mt-5 rounded border p-3"><summary className="cursor-pointer font-semibold">Technical details</summary><dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
      <div><dt className="font-semibold">Category</dt><dd>{failure.category}</dd></div><div><dt className="font-semibold">Database version</dt><dd>{failure.databaseVersion}</dd></div>
      <div><dt className="font-semibold">App / engine version</dt><dd>{failure.appVersion}</dd></div><div><dt className="font-semibold">Timestamp</dt><dd>{failure.timestamp}</dd></div>
      <div><dt className="font-semibold">Saved records</dt><dd>{failure.savedScientificRecordsAppearIntact ? "Appear intact" : "Integrity issue detected"}</dd></div><div><dt className="font-semibold">Recovery-only failure</dt><dd>{failure.recoveryOnly ? "Yes" : "No"}</dd></div>
    </dl><pre className="mt-3 overflow-auto whitespace-pre-wrap rounded bg-slate-100 p-3 text-xs">{failure.technicalMessage}</pre></details>
  </section></main>;
}
