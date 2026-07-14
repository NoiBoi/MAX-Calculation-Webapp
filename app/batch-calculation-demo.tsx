"use client";

import { useMemo, useState } from "react";
import { calculateBatchRecipe, parseFormula, type BatchMassBasis } from "@max-stoich/chemistry-engine";

function numberText(value: string, fallback: string): string {
  return value.trim() === "" ? fallback : value;
}

export function BatchCalculationDemo() {
  const [requestedMass, setRequestedMass] = useState("10");
  const [basis, setBasis] = useState<BatchMassBasis>("ideal-product-mass");
  const [expectedYield, setExpectedYield] = useState("0.8");
  const [alExcess, setAlExcess] = useState("0.05");
  const [purity, setPurity] = useState("0.995");
  const [handlingLoss, setHandlingLoss] = useState("0.02");
  const [increment, setIncrement] = useState("0.001");

  const result = useMemo(() => {
    const target = parseFormula("Ti2AlN");
    if (!target.success) return undefined;
    return calculateBatchRecipe({
      schemaVersion: "1.0.0",
      idealCrystalComposition: target.composition,
      precursors: [
        { schemaVersion: "1.0.0", id: "ti", name: "Titanium", formula: "Ti" },
        { schemaVersion: "1.0.0", id: "al", name: "Aluminum", formula: "Al", purity: numberText(purity, "1") },
        { schemaVersion: "1.0.0", id: "n", name: "Nitrogen", formula: "N" },
      ],
      batch: {
        basis,
        requestedMassGrams: numberText(requestedMass, "0"),
        ...(basis === "recovered-product-mass" ? { expectedYield: numberText(expectedYield, "0") } : {}),
      },
      adjustments: [
        { schemaVersion: "1.0.0", id: "al-excess", type: "elemental-excess", stage: "pre-solver", element: "Al", fraction: numberText(alExcess, "0"), order: 0, source: "user" },
        { schemaVersion: "1.0.0", id: "transfer-loss", type: "handling-loss", stage: "mass-domain", label: "Transfer loss", fraction: numberText(handlingLoss, "0"), scope: "all", order: 0, source: "user" },
      ],
      rounding: { adjustmentId: "balance-rounding", order: 0, incrementGrams: numberText(increment, "0"), mode: "nearest-half-even", residualToleranceMoles: "0.00001", materialityRelativeTolerance: "0.001" },
    });
  }, [alExcess, basis, expectedYield, handlingLoss, increment, purity, requestedMass]);

  return (
    <section aria-labelledby="batch-demo-title" className="mt-10 border-t border-slate-300 pt-8">
      <h2 id="batch-demo-title" className="text-xl font-semibold">Batch recipe development calculator</h2>
      <p className="mt-2 text-sm text-slate-600">A local Ti₂AlN arithmetic demonstration. Values are not saved or exported.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="font-medium">Batch basis
          <select className="mt-2 block w-full rounded border border-slate-400 bg-white px-3 py-2" onChange={(event) => setBasis(event.target.value as BatchMassBasis)} value={basis}>
            <option value="ideal-product-mass">Ideal product mass</option>
            <option value="recovered-product-mass">Recovered product mass</option>
            <option value="final-precursor-mixture-mass">Final precursor mixture mass</option>
          </select>
        </label>
        <label className="font-medium">Requested mass (g)
          <input className="mt-2 block w-full rounded border border-slate-400 px-3 py-2 font-mono" inputMode="decimal" onChange={(event) => setRequestedMass(event.target.value)} value={requestedMass} />
        </label>
        {basis === "recovered-product-mass" && <label className="font-medium">Expected yield (fraction)
          <input className="mt-2 block w-full rounded border border-slate-400 px-3 py-2 font-mono" inputMode="decimal" onChange={(event) => setExpectedYield(event.target.value)} value={expectedYield} />
        </label>}
        <label className="font-medium">Al excess (fraction)
          <input className="mt-2 block w-full rounded border border-slate-400 px-3 py-2 font-mono" inputMode="decimal" onChange={(event) => setAlExcess(event.target.value)} value={alExcess} />
        </label>
        <label className="font-medium">Al purity (fraction)
          <input className="mt-2 block w-full rounded border border-slate-400 px-3 py-2 font-mono" inputMode="decimal" onChange={(event) => setPurity(event.target.value)} value={purity} />
        </label>
        <label className="font-medium">Handling loss (fraction)
          <input className="mt-2 block w-full rounded border border-slate-400 px-3 py-2 font-mono" inputMode="decimal" onChange={(event) => setHandlingLoss(event.target.value)} value={handlingLoss} />
        </label>
        <label className="font-medium">Balance increment (g)
          <input className="mt-2 block w-full rounded border border-slate-400 px-3 py-2 font-mono" inputMode="decimal" onChange={(event) => setIncrement(event.target.value)} value={increment} />
        </label>
      </div>
      {result && result.errors.length > 0 ? (
        <div aria-live="polite" className="mt-5 rounded border border-red-400 bg-red-50 p-4 text-red-950" role="alert">
          <p className="font-semibold">Recipe input is invalid</p>
          {result.errors.map((error, index) => <p className="mt-1 text-sm" key={`${error.code}-${index}`}>{error.code}: {error.message}</p>)}
        </div>
      ) : result && (
        <div aria-live="polite" className="mt-6 space-y-5">
          <div className="grid gap-3 rounded border border-slate-300 p-4 text-sm sm:grid-cols-2">
            <p><strong>Ideal:</strong> <span className="font-mono">Ti:2, Al:1, N:1</span></p>
            <p><strong>Adjusted feed:</strong> <span className="font-mono">{Object.entries(result.adjustedFeedComposition.amounts).map(([element, amount]) => `${element}:${amount}`).join(", ")}</span></p>
            <p><strong>Realized:</strong> <span className="font-mono">{Object.entries(result.realizedComposition.amounts).map(([element, amount]) => `${element}:${amount}`).join(", ")}</span></p>
            <p><strong>Final weighing total:</strong> <span className="font-mono">{result.batch.finalRoundedTotalWeighingMassGrams} g</span></p>
          </div>
          <div className="overflow-x-auto"><table className="min-w-full border-collapse text-left text-sm">
            <caption className="mb-2 text-left font-semibold">Final precursor weighing masses</caption>
            <thead><tr><th className="border p-2">Precursor</th><th className="border p-2">Final mass (g)</th><th className="border p-2">Expected retained (g)</th></tr></thead>
            <tbody>{result.precursors.map((item) => <tr key={item.precursorId}><th className="border p-2">{item.displayName}</th><td className="border p-2 font-mono">{item.finalRoundedGrossWeighingMassGrams}</td><td className="border p-2 font-mono">{item.expectedRetainedGrossMassGrams}</td></tr>)}</tbody>
          </table></div>
          <details><summary className="cursor-pointer font-semibold">Calculation trace ({result.trace.length} steps)</summary><ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">{result.trace.map((item, index) => <li key={`${item.stepCode}-${index}`}><span className="font-mono">{item.stepCode}</span>: {item.description}</li>)}</ol></details>
          {result.warnings.length > 0 && <div><h3 className="font-semibold">Warnings</h3><ul className="mt-2 list-disc space-y-1 pl-5 text-sm">{result.warnings.map((item, index) => <li key={`${item.code}-${index}`}>{item.code}: {item.message}</li>)}</ul></div>}
        </div>
      )}
    </section>
  );
}
