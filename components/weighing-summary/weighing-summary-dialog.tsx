"use client";

import { useEffect, useRef } from "react";
import type { WeighingSummary } from "@/lib/presentation/weighing-summary";
import { serializeWeighingSummary } from "@/lib/presentation/weighing-summary";

export type WeighingSummaryEntry = Readonly<{ summary: WeighingSummary; unavailable?: never } | { summary?: never; unavailable: Readonly<{ title: string; sourceStatus: string; reason: string; validationStatus: string }> }>;

export function WeighingSummaryCard({ summary, headingLevel = 2, onCopy }: { summary: WeighingSummary; headingLevel?: 2 | 3; onCopy?: () => void }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return <section className="weighing-summary-card break-inside-avoid rounded-lg border-2 border-slate-800 bg-white p-5 text-slate-950">
    <div className="flex items-start justify-between gap-3"><div><Heading className="text-2xl font-bold">{summary.title}</Heading><p className="mt-1 text-sm font-semibold">{summary.sourceStatus}{summary.validationStatus ? ` · ${summary.validationStatus}` : ""}{summary.isHistorical ? " · Historical saved result" : ""}</p></div>{onCopy && <button className="summary-control rounded border px-3 py-2 font-semibold" onClick={onCopy}>Copy individual scenario</button>}</div>
    <div className="mt-5"><p className="text-sm font-bold uppercase tracking-wide">Adjusted intended feed</p><p aria-label={`Adjusted intended feed formula ${summary.adjustedFeedFormula}`} className="mt-1 break-all font-mono text-3xl font-bold leading-tight tabular-nums">{summary.adjustedFeedFormula}</p></div>
    <p className="mt-4 text-lg"><strong>Target batch:</strong> <span className="font-mono tabular-nums">{summary.batchMass} g</span> · {summary.batchBasis}</p>
    <table className="mt-5 w-full border-collapse text-xl tabular-nums"><caption className="sr-only">Final precursor weighing masses</caption><thead><tr className="border-b-2 border-slate-800 text-left text-sm uppercase"><th className="py-2">Precursor</th><th className="py-2">Formula</th><th className="py-2 text-right">Final mass</th></tr></thead><tbody>{summary.precursors.map((item) => <tr className="border-b border-slate-300" key={item.id}><th className="py-3 text-left font-bold">{item.displayName}</th><td className="py-3 font-mono">{item.formula}</td><td className="py-3 text-right font-mono text-2xl font-bold">{item.finalMass} {item.unit}</td></tr>)}</tbody><tfoot><tr className="border-t-4 border-slate-900"><th className="pt-4 text-left text-2xl" colSpan={2}>TOTAL</th><td className="pt-4 text-right font-mono text-3xl font-black">{summary.totalMass} {summary.unit}</td></tr></tfoot></table>
    {summary.actionRequiredMessages.length > 0 && <section className="mt-5 border-l-4 border-amber-700 bg-amber-50 p-3" aria-label="Action required"><h4 className="font-bold">Action required before weighing</h4><ul className="mt-1 list-disc pl-5">{summary.actionRequiredMessages.map((message) => <li key={message}>{message}</li>)}</ul></section>}
  </section>;
}

export function WeighingSummaryDialog({ open, title, entries, onClose, onStatus }: { open: boolean; title: string; entries: readonly WeighingSummaryEntry[]; onClose: () => void; onStatus: (message: string) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { const dialog = dialogRef.current; if (!dialog) return; if (open && !dialog.open) { dialog.showModal(); closeRef.current?.focus(); } else if (!open && dialog.open) dialog.close(); }, [open]);
  const summaries = entries.flatMap((entry) => entry.summary ? [entry.summary] : []);
  const copyText = entries.length === 1 && entries[0]?.summary ? serializeWeighingSummary(entries[0].summary) : entries.map((entry, index) => entry.summary ? `=== ${index + 1}. ${entry.summary.title} ===\n${serializeWeighingSummary(entry.summary)}` : `=== ${index + 1}. ${entry.unavailable.title} ===\n${entry.unavailable.sourceStatus}\n\nNo valid weighing result\nReason: ${entry.unavailable.reason}`).join("\n\n");
  const copy = async (text: string, message: string) => { try { await navigator.clipboard.writeText(text); onStatus(message); } catch { onStatus("Clipboard permission was denied."); } };
  return <dialog aria-labelledby="weighing-summary-dialog-title" className="weighing-summary-dialog m-auto max-h-[94vh] w-[min(96vw,110rem)] overflow-auto rounded-xl border-2 border-slate-800 bg-slate-100 p-0 backdrop:bg-slate-950/60" onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose} ref={dialogRef}>{open && <>
    <div className="summary-control sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-white p-3 shadow"><h1 className="mr-auto text-xl font-bold" id="weighing-summary-dialog-title">{title}</h1><button className="rounded border px-3 py-2 font-semibold" disabled={!entries.length} onClick={() => void copy(copyText, entries.length === 1 ? "Weighing summary copied" : "All comparison summaries copied")}>{entries.length === 1 ? "Copy summary" : "Copy all summaries"}</button><button className="rounded border px-3 py-2 font-semibold" disabled={!entries.length} onClick={() => window.print()}>Print{entries.length > 1 ? " all" : ""}</button><button className="rounded bg-slate-900 px-3 py-2 font-semibold text-white" onClick={onClose} ref={closeRef}>Close</button></div>
    <div className={`weighing-summary-print-root grid gap-5 p-5 ${entries.length === 2 ? "xl:grid-cols-2" : "grid-cols-1"}`}>{entries.map((entry, index) => entry.summary ? <WeighingSummaryCard headingLevel={2} key={`${entry.summary.title}-${index}`} onCopy={summaries.length > 1 ? () => void copy(serializeWeighingSummary(entry.summary!), `${entry.summary!.title} summary copied`) : undefined} summary={entry.summary} /> : <section className="weighing-summary-card break-inside-avoid rounded-lg border-2 border-red-700 bg-white p-5" key={`${entry.unavailable.title}-${index}`}><h2 className="text-2xl font-bold">{entry.unavailable.title}</h2><p className="mt-1 text-sm font-semibold">{entry.unavailable.sourceStatus} · {entry.unavailable.validationStatus}</p><p className="mt-6 text-2xl font-bold">No valid weighing result</p><p className="mt-2 text-lg"><strong>Reason:</strong> {entry.unavailable.reason}</p></section>)}</div>
    </>}
  </dialog>;
}
