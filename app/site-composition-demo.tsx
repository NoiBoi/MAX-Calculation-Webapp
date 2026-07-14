"use client";

import { useMemo, useState } from "react";
import {
  createStandardMaxComposition,
  renderSiteComposition,
  siteCompositionToElementalComposition,
  type StandardMaxSiteInput,
  type StandardMaxTemplate,
} from "@max-stoich/chemistry-engine";

function preset(template: StandardMaxTemplate): StandardMaxSiteInput {
  if (template === "211") {
    return {
      M: { occupants: [{ element: "Ti", fraction: "0.5" }, { element: "Nb", fraction: "0.5" }] },
      A: { occupants: [{ element: "Al", fraction: "1" }] },
      X: { occupants: [{ element: "N", fraction: "1" }] },
    };
  }
  if (template === "312") {
    return {
      M: { occupants: [{ element: "Ti", fraction: "1" }] },
      A: { occupants: [{ element: "Al", fraction: "1" }] },
      X: { occupants: [{ element: "C", fraction: "0.5" }, { element: "N", fraction: "0.5" }] },
    };
  }
  return {
    M: { occupants: [{ element: "Ti", fraction: "1" }] },
    A: { occupants: [{ element: "Al", fraction: "1" }] },
    X: { occupants: [{ element: "N", fraction: "1" }] },
  };
}

const multiplicities: Record<StandardMaxTemplate, Record<"M" | "A" | "X", string>> = {
  "211": { M: "2", A: "1", X: "1" },
  "312": { M: "3", A: "1", X: "2" },
  "413": { M: "4", A: "1", X: "3" },
};

export function SiteCompositionDemo() {
  const [template, setTemplate] = useState<StandardMaxTemplate>("211");
  const [sites, setSites] = useState<StandardMaxSiteInput>(() => preset("211"));

  const analysis = useMemo(() => {
    const created = createStandardMaxComposition(template, sites);
    if (!created.success) return { ok: false as const, errors: created.errors };
    const rendered = renderSiteComposition(created.value.composition);
    const elemental = siteCompositionToElementalComposition(created.value.composition);
    if (!rendered.success) return { ok: false as const, errors: rendered.errors };
    if (!elemental.success) return { ok: false as const, errors: elemental.errors };
    return { ok: true as const, created: created.value, rendered: rendered.value, elemental: elemental.value };
  }, [sites, template]);

  const updateFraction = (role: "M" | "A" | "X", index: number, fraction: string) => {
    setSites((current) => ({
      ...current,
      [role]: {
        ...current[role],
        occupants: current[role].occupants.map((occupant, occupantIndex) =>
          occupantIndex === index ? { ...occupant, fraction } : occupant,
        ),
      },
    }));
  };

  return (
    <section aria-labelledby="site-demo-title" className="mt-10 border-t border-slate-300 pt-8">
      <h2 id="site-demo-title" className="text-xl font-semibold">Site-composition development demonstration</h2>
      <p className="mt-2 text-sm text-slate-600">
        Sites are supplied explicitly. The flat formula parser does not create these assignments.
      </p>
      <label className="mt-5 block max-w-xs font-medium" htmlFor="max-template">MAX template</label>
      <select
        className="mt-2 w-full max-w-xs rounded-md border border-slate-400 bg-white px-3 py-2 outline-none focus:ring-2 focus:ring-teal-700"
        id="max-template"
        onChange={(event) => {
          const selected = event.target.value as StandardMaxTemplate;
          setTemplate(selected);
          setSites(preset(selected));
        }}
        value={template}
      >
        <option value="211">211 — M₂AX</option>
        <option value="312">312 — M₃AX₂</option>
        <option value="413">413 — M₄AX₃</option>
      </select>

      <div className="mt-6 grid gap-5 md:grid-cols-3">
        {(["M", "A", "X"] as const).map((role) => (
          <fieldset className="rounded-md border border-slate-300 p-4" key={role}>
            <legend className="px-1 font-semibold">{role} site · multiplicity {multiplicities[template][role]}</legend>
            <div className="space-y-3">
              {sites[role].occupants.map((occupant, index) => (
                <label className="block text-sm" key={`${role}-${occupant.element}`}>
                  {occupant.element} fraction
                  <input
                    aria-label={`${role} ${occupant.element} fraction`}
                    className="mt-1 block w-full rounded border border-slate-400 px-2 py-1 font-mono"
                    inputMode="decimal"
                    onChange={(event) => updateFraction(role, index, event.target.value)}
                    value={occupant.fraction}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      {!analysis.ok ? (
        <div aria-live="polite" className="mt-5 rounded-md border border-red-400 bg-red-50 p-4 text-red-950" role="alert">
          <p className="font-semibold">{analysis.errors[0]?.code}</p>
          <p>{analysis.errors[0]?.message}</p>
        </div>
      ) : (
        <div aria-live="polite" className="mt-6 grid gap-4 md:grid-cols-2">
          <div><h3 className="font-semibold">Rendered site formula</h3><p className="mt-1 font-mono text-lg">{analysis.rendered.formula}</p></div>
          <div><h3 className="font-semibold">Elemental composition</h3><p className="mt-1 font-mono text-sm">{Object.entries(analysis.elemental.amounts).map(([element, amount]) => `${element} ${amount}`).join(" · ")}</p></div>
        </div>
      )}
    </section>
  );
}
