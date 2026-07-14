"use client";

import { useMemo, useState } from "react";
import {
  buildElementBalanceMatrix,
  parseFormula,
  solvePrecursorBalance,
  type BalancePrecursorDefinition,
} from "@max-stoich/chemistry-engine";

function readPrecursors(text: string): BalancePrecursorDefinition[] {
  return text.split(/\r?\n/).filter((line) => line.trim() !== "").map((line) => {
    const separator = line.indexOf("=");
    const id = separator < 0 ? line.trim() : line.slice(0, separator).trim();
    const formula = separator < 0 ? "" : line.slice(separator + 1).trim();
    return { schemaVersion: "1.0.0", id, name: id, formula };
  });
}

export function BalanceMatrixDemo() {
  const [target, setTarget] = useState("Ti2AlN");
  const [precursorText, setPrecursorText] = useState("ti=Ti\nal=Al\ntin=TiN");
  const [objective, setObjective] = useState<"deterministic-feasible" | "minimize-total-quantity">("deterministic-feasible");
  const result = useMemo(() => {
    const parsed = parseFormula(target);
    if (!parsed.success) return { success: false as const, errors: parsed.errors };
    return buildElementBalanceMatrix(parsed.composition, readPrecursors(precursorText));
  }, [precursorText, target]);
  const solution = useMemo(() => result.success ? solvePrecursorBalance(result.value, [], { objectives: [{ kind: objective }] }) : undefined, [objective, result]);

  return (
    <section aria-labelledby="matrix-demo-title" className="mt-10 border-t border-slate-300 pt-8">
      <h2 id="matrix-demo-title" className="text-xl font-semibold">Balance-matrix development demonstration</h2>
      <p className="mt-2 text-sm text-slate-600">Exact structural inspection only. No precursor quantities or masses are solved.</p>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
        <label className="font-medium">Target formula
          <input className="mt-2 block w-full rounded border border-slate-400 px-3 py-2 font-mono" onChange={(event) => setTarget(event.target.value)} spellCheck={false} value={target} />
        </label>
        <label className="font-medium">Precursors, one <span className="font-mono">id=formula</span> per line
          <textarea className="mt-2 block min-h-28 w-full rounded border border-slate-400 px-3 py-2 font-mono" onChange={(event) => setPrecursorText(event.target.value)} spellCheck={false} value={precursorText} />
        </label>
      </div>
      <label className="mt-5 block max-w-sm font-medium">Solver objective
        <select className="mt-2 block w-full rounded border border-slate-400 bg-white px-3 py-2" onChange={(event) => setObjective(event.target.value as typeof objective)} value={objective}>
          <option value="deterministic-feasible">Deterministic feasible solution</option>
          <option value="minimize-total-quantity">Minimize total precursor quantity</option>
        </select>
      </label>
      {!result.success ? (
        <div aria-live="polite" className="mt-5 rounded border border-red-400 bg-red-50 p-4 text-red-950" role="alert">
          <p className="font-semibold">Matrix input is invalid</p>
          {result.errors.map((error, index) => <p className="mt-1 text-sm" key={`${error.code}-${index}`}>{error.code}: {error.message}</p>)}
        </div>
      ) : (
        <div aria-live="polite" className="mt-6 space-y-5">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-left text-sm">
              <caption className="mb-2 text-left font-semibold">Required-element matrix A and vector b</caption>
              <thead><tr><th className="border p-2">Element</th>{result.value.columns.map((column) => <th className="border p-2 font-mono" key={column.precursorId}>{column.precursorId}</th>)}<th className="border p-2 font-mono">b</th></tr></thead>
              <tbody>{result.value.rows.map((row) => <tr key={row.element}><th className="border p-2">{row.element}</th>{result.value.requiredElementMatrix[row.index]?.map((entry, index) => <td className="border p-2 font-mono" key={result.value.columns[index]?.precursorId}>{entry}</td>)}<td className="border p-2 font-mono">{row.requirement}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="text-sm"><strong>Rank:</strong> {result.value.analysis.matrixRank} · <strong>Augmented rank:</strong> {result.value.analysis.augmentedMatrixRank} · <strong>Dimensions:</strong> {result.value.dimensionClassification}</p>
          {solution && <div className="rounded border border-slate-300 p-4">
            <h3 className="font-semibold">Constrained solver: {solution.status}</h3>
            <p className="mt-1 text-xs text-slate-600">All quantities use mol precursor / mol target formula. No gram-scale masses are calculated.</p>
            {solution.quantities.length > 0 && <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">{solution.quantities.map((item) => <div className="contents" key={item.precursorId}><dt>{item.precursorId}</dt><dd className="font-mono">{item.precursorMolesPerTargetFormulaMole}</dd></div>)}</dl>}
            {solution.elementalResiduals.length > 0 && <p className="mt-3 text-sm">Residuals: <span className="font-mono">{solution.elementalResiduals.map((item) => `${item.element} ${item.residual}`).join(" · ")}</span></p>}
            {solution.errors.map((item, index) => <p className="mt-2 text-sm text-red-800" key={`${item.code}-${index}`}>{item.code}: {item.message}</p>)}
          </div>}
          {result.value.diagnostics.length > 0 && <div><h3 className="font-semibold">Structural diagnostics</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{result.value.diagnostics.map((item, index) => <li key={`${item.code}-${index}`}>{item.code}: {item.message}</li>)}</ul></div>}
        </div>
      )}
    </section>
  );
}
