"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_ELEMENT_DATA,
  calculateAtomicFractions,
  calculateMassFractions,
  calculateMolarMass,
  parseFormula,
} from "@max-stoich/chemistry-engine";

export function FormulaDemo() {
  const [formula, setFormula] = useState("Ti3AlC2");
  const result = useMemo(() => {
    const parsed = parseFormula(formula);
    if (!parsed.success) return { ok: false as const, parsed };
    return {
      ok: true as const,
      parsed,
      molarMass: calculateMolarMass(parsed.composition, DEFAULT_ELEMENT_DATA),
      atomicFractions: calculateAtomicFractions(parsed.composition),
      massFractions: calculateMassFractions(parsed.composition, DEFAULT_ELEMENT_DATA),
    } as const;
  }, [formula]);

  return (
    <section aria-labelledby="demo-title" className="mt-10 border-t border-slate-300 pt-8">
      <h2 id="demo-title" className="text-xl font-semibold">Formula-engine demonstration</h2>
      <p className="mt-2 text-sm text-slate-600">
        Flat elemental parsing only; this does not assign crystallographic sites.
      </p>
      <label className="mt-5 block max-w-sm font-medium" htmlFor="formula">
        Chemical formula
      </label>
      <input
        aria-describedby="formula-help"
        className="mt-2 w-full max-w-sm rounded-md border border-slate-400 bg-white px-3 py-2 font-mono text-lg outline-none focus:ring-2 focus:ring-teal-700"
        id="formula"
        onChange={(event) => setFormula(event.target.value)}
        spellCheck={false}
        value={formula}
      />
      <p className="mt-1 text-xs text-slate-500" id="formula-help">
        Try Ti4AlN3 or (Ti0.5Nb0.5)2AlN.
      </p>

      {!result.ok ? (
        <div aria-live="polite" className="mt-5 rounded-md border border-red-400 bg-red-50 p-4 text-red-950" role="alert">
          <p className="font-semibold">{result.parsed.errors[0]?.code}</p>
          <p>{result.parsed.errors[0]?.message}</p>
        </div>
      ) : (
        <div aria-live="polite" className="mt-6 grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="font-semibold">Parsed composition</h3>
            <p className="mt-1 font-mono">{result.parsed.normalizedFormula}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {Object.entries(result.parsed.composition.amounts).map(([element, amount]) => (
                <div className="contents" key={element}><dt>{element}</dt><dd className="font-mono">{amount}</dd></div>
              ))}
            </dl>
          </div>
          <div>
            <h3 className="font-semibold">Molar mass</h3>
            {result.molarMass.success ? (
              <p className="mt-1 font-mono text-2xl">
                {result.molarMass.value.totalMolarMass} <span className="text-base">g/mol</span>
              </p>
            ) : (
              <p className="mt-1 text-red-800">{result.molarMass.errors[0]?.message}</p>
            )}
          </div>
          {result.atomicFractions.success && (
            <div>
              <h3 className="font-semibold">Atomic fractions</h3>
              <p className="mt-1 font-mono text-sm">
                {result.atomicFractions.value.entries.map((entry) => `${entry.element} ${entry.fraction}`).join(" · ")}
              </p>
            </div>
          )}
          {result.massFractions.success && (
            <div>
              <h3 className="font-semibold">Mass fractions</h3>
              <p className="mt-1 font-mono text-sm">
                {result.massFractions.value.entries.map((entry) => `${entry.element} ${entry.fraction}`).join(" · ")}
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
