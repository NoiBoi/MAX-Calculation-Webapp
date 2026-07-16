"use client";

import { useEffect, useRef } from "react";
import {
  serializeCalculationVerification,
  type CalculationVerificationView,
} from "@/lib/presentation/calculation-verification";

export type CalculationVerificationEntry =
  | Readonly<{ verification: CalculationVerificationView; unavailable?: never }>
  | Readonly<{ verification?: never; unavailable: Readonly<{ title: string; reason: string }> }>;

const entryTitle = (entry: CalculationVerificationEntry) => entry.verification ? entry.verification.title : entry.unavailable.title;

function CompactConversionTable({ view }: { view: CalculationVerificationView }) {
  return (
    <table className="verification-compact-conversion hidden w-full text-left">
      <caption>Compact precursor conversion verification</caption>
      <thead><tr><th>Precursor</th><th>Moles</th><th>Molar mass</th><th>Pure mass</th><th>Final mass</th><th>Realized moles</th></tr></thead>
      <tbody>{view.precursors.map((row) => <tr key={row.id}><th>{row.name}</th><td>{row.finalIntendedMoles.exact}</td><td>{row.molarMass.exact}</td><td>{row.pureRequiredMass.exact}</td><td>{row.finalMass.exact}</td><td>{row.realizedMoles.exact}</td></tr>)}</tbody>
    </table>
  );
}

function ConversionCard({ view }: { view: CalculationVerificationView }) {
  const requiresReview = view.overallStatus === "review-required" || view.overallStatus === "verification-unavailable";
  return (
    <article className="verification-scenario rounded-lg border-2 border-slate-800 bg-white p-5">
      <header>
        <h2 className="text-2xl font-bold">{view.title}</h2>
        <p className={`mt-1 font-bold ${requiresReview ? "text-red-800" : "text-teal-800"}`}>{view.overallStatusLabel}</p>
        <p className="text-sm">Target formula moles: <strong className="font-mono">{view.targetFormulaMoles.display}</strong></p>
      </header>
      <CompactConversionTable view={view} />

      <section className="mt-5" aria-label={`${view.title} formula reconciliation`}>
        <h3 className="text-lg font-bold">Formula reconciliation</h3>
        <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-[11rem_1fr]">
          <dt>Ideal crystal</dt><dd className="font-mono">{view.formulas.ideal}</dd>
          <dt>Intended feed</dt><dd className="font-mono">{view.formulas.intended}</dd>
          <dt>Adjusted intended feed</dt><dd className="font-mono">{view.formulas.adjusted}</dd>
          <dt>Normalized realized after weighing</dt><dd className="font-mono">{view.formulas.realized}</dd>
        </dl>
        <p className="mt-2 text-xs font-semibold">The realized formula is reconstructed from weighed precursor amounts. It does not confirm the composition or phase of the reacted product.</p>
      </section>

      <section className="mt-5" aria-label={`${view.title} conversion verification`}>
        <h3 className="text-lg font-bold">1. Conversion verification</h3>
        <div className="mt-3 space-y-4">{view.precursors.map((row) => (
          <article className="rounded border border-slate-300 p-3" key={row.id}>
            <div className="flex flex-wrap justify-between gap-2"><h4 className="text-lg font-bold">{row.name} <span className="font-mono text-sm font-normal">{row.formula}</span></h4><strong className="font-mono">{row.finalMass.display}</strong></div>
            <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[12rem_1fr]">
              <dt>Solver molar quantity</dt><dd>{row.solverMolarQuantityDisplay}</dd>
              <dt>Final intended amount</dt><dd className="font-mono">{row.finalIntendedMoles.display}</dd>
              <dt>Batch-scaled solver moles</dt><dd className="font-mono">{row.batchScaledMoles.display}</dd>
              <dt>Molar mass</dt><dd className="font-mono">{row.molarMass.display}</dd>
              <dt>Molar-mass source</dt><dd>{row.molarMassSource}{row.molarMassOverride ? ` · ${row.molarMassOverride}` : ""}</dd>
              <dt>Ideal pure mass</dt><dd className="font-mono">{row.finalIntendedMoles.display} × {row.molarMass.display} = {row.pureRequiredMass.display}</dd>
              <dt>Purity correction</dt><dd className="font-mono">{row.pureRequiredMass.display} ÷ {row.purity.exact} = {row.grossMassAfterPurity.display}</dd>
              {row.handlingLossSteps.length ? row.handlingLossSteps.map((step) => <div className="contents" key={step.adjustmentId}><dt>{step.label}</dt><dd className="font-mono">{step.beforeMassGrams} g ÷ {step.retainedFraction} = {step.afterMassGrams} g</dd></div>) : <><dt>Handling-loss correction</dt><dd>No handling-loss step applied</dd></>}
              <dt>Balance rounding</dt><dd className="font-mono">{row.preRoundMass.display} → {row.finalMass.display} at {row.balanceIncrement.display} · {row.roundingMode}</dd>
              <dt>Pure-equivalent final mass</dt><dd className="font-mono">{row.pureEquivalentFinalMass.display}</dd>
              <dt>Reverse verification</dt><dd className="font-mono">{row.finalMass.exact} g × {row.purity.exact} ÷ {row.molarMass.exact} g/mol = {row.realizedMoles.display}</dd>
              <dt>Realized − intended</dt><dd className="font-mono">{row.realizedMinusIntendedMoles.display} · {row.relativeDifference?.display ?? "not stored in historical snapshot"}</dd>
            </dl>
            <details className="mt-3">
              <summary className="cursor-pointer font-semibold">Atomic-weight contributions and exact values</summary>
              <p className="mt-2 text-sm"><strong>Dataset:</strong> {row.atomicWeightDatasetTitle} · version {row.atomicWeightDatasetVersion}</p>
              <p className="text-sm"><strong>Calculation-value policy:</strong> {row.atomicWeightCalculationValuePolicy}</p>
              {row.contributions.length ? <table className="mt-2 w-full text-left text-sm"><caption className="sr-only">{row.name} atomic-weight contributions</caption><thead><tr><th>Element</th><th>Count</th><th>Atomic weight used</th><th>Contribution</th><th>Policy</th></tr></thead><tbody>{row.contributions.map((item) => <tr key={item.element}><th>{item.element}</th><td>{item.coefficient}</td><td>{item.atomicWeightGramsPerMole} g/mol</td><td>{item.contributionGramsPerMole} g/mol</td><td>{item.calculationValuePolicy}</td></tr>)}</tbody><tfoot><tr><th colSpan={3}>{row.formula} molar mass</th><td>{row.molarMass.exact} g/mol</td><td /></tr></tfoot></table> : <p className="mt-2 text-sm">Atomic contributions are unavailable for this historical result or replaced by the documented molar-mass override.</p>}
              <dl className="mt-3 grid gap-1 font-mono text-xs sm:grid-cols-2"><div>Solver exact: {row.solverMolarQuantityExact}</div><div>Intended moles: {row.finalIntendedMoles.exact}</div><div>Pure mass: {row.pureRequiredMass.exact} g</div><div>Pre-round mass: {row.preRoundMass.exact} g</div><div>Final mass: {row.finalMass.exact} g</div><div>Realized moles: {row.realizedMoles.exact}</div></dl>
            </details>
          </article>
        ))}</div>
      </section>

      <section className="mt-5" aria-label={`${view.title} elemental reconciliation`}>
        <h3 className="text-lg font-bold">2. Elemental reconciliation</h3>
        <p className="mt-1 text-sm">Supplied amounts are reconstructed from final rounded masses and declared purities. Positive differences are excess; negative differences are deficiency.</p>
        <div className="overflow-x-auto"><table className="verification-reconciliation mt-3 w-full min-w-[650px] text-left text-sm"><caption className="sr-only">Elemental reconciliation from final rounded masses</caption><thead><tr><th>Element</th><th>Adjusted required mol</th><th>Realized supplied mol</th><th>Difference</th><th>Relative difference</th><th>Status</th></tr></thead><tbody>{view.elementalReconciliation.map((row) => <tr key={row.element}><th>{row.element}</th><td className="font-mono">{row.required.exact}</td><td className="font-mono">{row.supplied.exact}</td><td className="font-mono">{row.difference.exact}</td><td className="font-mono">{row.relativeDifference?.display ?? "—"}</td><td>{row.status}</td></tr>)}</tbody></table></div>
        {view.largestResidual && <p className="mt-2 font-semibold">Largest residual: {view.largestResidual.element} · {view.largestResidual.difference.display} · {view.largestResidual.status}</p>}
        {view.precursorOnlyElements.length > 0 && <><h4 className="mt-4 font-bold">Introduced elements not present in target</h4><table className="mt-2 w-full text-left text-sm"><thead><tr><th>Element</th><th>Realized amount</th><th>Contributing precursors</th><th>Status</th></tr></thead><tbody>{view.precursorOnlyElements.map((row) => <tr key={row.element}><th>{row.element}</th><td>{row.realized.display}</td><td>{row.contributingPrecursors.join(", ")}</td><td>{row.status}</td></tr>)}</tbody></table></>}
      </section>

      <section className="mt-5" aria-label={`${view.title} assumptions and limitations`}>
        <h3 className="text-lg font-bold">3. Assumptions and limitations</h3>
        <table className="mt-3 w-full text-left text-sm"><thead><tr><th>Applied assumption</th><th>Value</th><th>Source</th><th>Classification</th></tr></thead><tbody>{view.assumptions.map((item) => <tr key={`${item.label}-${item.value}`}><th>{item.label}</th><td>{item.value}</td><td>{item.source}</td><td>{item.classification}</td></tr>)}</tbody></table>
        <div className="mt-3 rounded bg-slate-100 p-3 text-sm">{view.limitations.map((item) => <p className="mt-1" key={item}>{item}</p>)}</div>
        <p className="mt-3 text-sm"><strong>Measured outcomes not entered.</strong> Record actual weighed mass, recovered mass, measured yield, and XRD phase results separately in structured experimental notes.</p>
      </section>
      <footer className="mt-4 border-t pt-2 text-xs">Engine {view.engineVersion} · atomic weights {view.atomicDataVersion}</footer>
    </article>
  );
}

export function CalculationVerificationDialog({ open, title, entries, onClose, onStatus, onAddMeasuredOutcomeNote }: { open: boolean; title: string; entries: readonly CalculationVerificationEntry[]; onClose: () => void; onStatus: (message: string) => void; onAddMeasuredOutcomeNote?: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { const dialog = ref.current; if (!dialog) return; if (open && !dialog.open) { dialog.showModal(); closeRef.current?.focus(); } else if (!open && dialog.open) dialog.close(); }, [open]);
  const copyText = entries.map((entry, index) => entry.verification ? `${entries.length > 1 ? `=== ${index + 1}. ${entry.verification.title} ===\n` : ""}${serializeCalculationVerification(entry.verification)}` : `${entry.unavailable.title}\nVerification unavailable: ${entry.unavailable.reason}`).join("\n\n");
  const copy = async () => { try { await navigator.clipboard.writeText(copyText); onStatus("Calculation verification copied"); } catch { onStatus("Clipboard permission was denied."); } };
  return (
    <dialog aria-labelledby="calculation-verification-title" className="calculation-verification-dialog m-auto max-h-[95vh] w-[min(97vw,100rem)] overflow-auto rounded-xl border-2 border-slate-800 bg-slate-100 p-0 backdrop:bg-slate-950/60" onCancel={(event) => { event.preventDefault(); onClose(); }} onClose={onClose} ref={ref}>
      {open && <>
        <div className="verification-control sticky top-0 z-20 flex flex-wrap items-center gap-2 border-b bg-white p-3 shadow"><h1 className="mr-auto text-xl font-bold" id="calculation-verification-title">{title}</h1>{onAddMeasuredOutcomeNote && <button className="rounded border px-3 py-2 font-semibold" onClick={onAddMeasuredOutcomeNote}>Add measured outcome note</button>}<button className="rounded border px-3 py-2 font-semibold" onClick={() => void copy()}>Copy verification</button><button className="rounded border px-3 py-2 font-semibold" onClick={() => window.print()}>Print verification</button><button className="rounded bg-slate-900 px-3 py-2 font-semibold text-white" onClick={onClose} ref={closeRef}>Close</button></div>
        {entries.length > 1 && <section className="verification-overview m-5 rounded border bg-white p-4"><h2 className="font-bold">Comparison verification overview</h2><table className="mt-2 w-full text-left text-sm"><thead><tr><th>Scenario</th><th>Arithmetic status</th><th>Largest relative residual</th><th>Total rounded mass</th><th>Action required</th></tr></thead><tbody>{entries.map((entry) => <tr key={entryTitle(entry)}><th>{entryTitle(entry)}</th><td>{entry.verification?.overallStatusLabel ?? "Verification unavailable"}</td><td>{entry.verification?.largestResidual?.relativeDifference?.display ?? "—"}</td><td>{entry.verification?.totalRoundedMass.display ?? "—"}</td><td>{!entry.verification || entry.verification.overallStatus === "review-required" || entry.verification.overallStatus === "verification-unavailable" ? "Yes" : "No"}</td></tr>)}</tbody></table></section>}
        <div className="verification-print-root grid gap-5 p-5">{entries.map((entry) => entry.verification ? <ConversionCard key={entry.verification.title} view={entry.verification} /> : <section className="verification-scenario rounded border-2 border-red-700 bg-white p-5" key={entry.unavailable.title}><h2 className="text-xl font-bold">{entry.unavailable.title}</h2><p className="mt-2 font-bold">Verification unavailable</p><p>{entry.unavailable.reason}</p></section>)}</div>
      </>}
    </dialog>
  );
}
