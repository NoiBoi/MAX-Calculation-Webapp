"use client";

import { useState, type FormEvent } from "react";
import {
  calculatedPatternSchema,
  codSearchResponseSchema,
  type CalculatedXRDPattern,
  type CODSearchResult,
} from "@/lib/xrd/schemas";
import { XRD_RADIATION_PRESETS, type XRDRadiationPreset } from "@/lib/xrd/conventions";

type RequestState = "idle" | "searching" | "calculating";

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: { message?: unknown } }).error;
    if (typeof error?.message === "string") return error.message;
  }
  return fallback;
}

function fmt(value: number, digits = 4): string {
  return Number.isFinite(value) ? value.toFixed(digits).replace(/\.?0+$/, "") : "Not available";
}

function hklLabel(reflection: CalculatedXRDPattern["reflections"][number]): string {
  return reflection.hkls.map(({ h, k, l, multiplicity }) => `(${h} ${k} ${l})${multiplicity ? ` ×${multiplicity}` : ""}`).join(", ");
}

function LatticeSummary({ lattice }: { readonly lattice: CODSearchResult["lattice"] | CalculatedXRDPattern["lattice"] }) {
  if (!lattice) return <>Not reported</>;
  return <>{fmt(lattice.aAngstrom)} × {fmt(lattice.bAngstrom)} × {fmt(lattice.cAngstrom)} Å</>;
}

function StickPlot({ pattern }: { readonly pattern: CalculatedXRDPattern }) {
  const width = 900;
  const height = 250;
  const left = 58;
  const right = 18;
  const top = 20;
  const bottom = 42;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const { minDeg, maxDeg } = pattern.twoThetaRange;
  const x = (value: number) => left + ((value - minDeg) / (maxDeg - minDeg)) * plotWidth;
  const ticks = Array.from({ length: 5 }, (_, index) => minDeg + ((maxDeg - minDeg) * index) / 4);
  return <svg aria-label={`Theoretical powder XRD stick pattern for ${pattern.reference.formula}`} className="xrd-stick-plot" role="img" viewBox={`0 0 ${width} ${height}`}>
    <title>Theoretical powder XRD pattern. Relative intensity is normalized to 100.</title>
    <line className="xrd-axis" x1={left} x2={width - right} y1={top + plotHeight} y2={top + plotHeight} />
    <line className="xrd-axis" x1={left} x2={left} y1={top} y2={top + plotHeight} />
    {ticks.map((tick) => <g key={tick}><line className="xrd-tick" x1={x(tick)} x2={x(tick)} y1={top + plotHeight} y2={top + plotHeight + 6} /><text className="xrd-tick-label" textAnchor="middle" x={x(tick)} y={height - 18}>{fmt(tick, 1)}</text></g>)}
    <text className="xrd-axis-label" textAnchor="middle" x={left + plotWidth / 2} y={height - 2}>2θ (degrees)</text>
    <text className="xrd-axis-label" textAnchor="middle" transform={`rotate(-90 14 ${top + plotHeight / 2})`} x={14} y={top + plotHeight / 2}>Relative intensity</text>
    {pattern.reflections.map((peak, index) => <line className="xrd-stick" key={`${peak.twoThetaDeg}-${index}`} x1={x(peak.twoThetaDeg)} x2={x(peak.twoThetaDeg)} y1={top + plotHeight} y2={top + plotHeight - (peak.relativeIntensity / 100) * plotHeight} />)}
  </svg>;
}

export function XrdReferenceWorkspace({ onPatternChange }: { readonly onPatternChange?: (pattern: CalculatedXRDPattern | null) => void }) {
  const [query, setQuery] = useState("Ti3AlC2");
  const [results, setResults] = useState<readonly CODSearchResult[]>([]);
  const [pattern, setPattern] = useState<CalculatedXRDPattern | null>(null);
  const [state, setState] = useState<RequestState>("idle");
  const [radiationPreset, setRadiationPreset] = useState<XRDRadiationPreset>("CuKa");
  const [message, setMessage] = useState("Search COD by formula or enter a seven-digit COD ID.");

  const search = async (event: FormEvent) => {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    setState("searching");
    setPattern(null);
    setMessage("Searching the Crystallography Open Database…");
    try {
      const request = /^\d{7}$/.test(term) ? { codId: term, limit: 20 } : { formula: term, limit: 20 };
      const response = await fetch("/api/xrd/references/search", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(body, "COD search failed."));
      const parsed = codSearchResponseSchema.parse(body);
      setResults(parsed.results);
      setMessage(parsed.results.length ? `${parsed.results.length} matching structure${parsed.results.length === 1 ? "" : "s"}. Select one to calculate its pattern.` : "No matching COD structures were found.");
    } catch (error) {
      setResults([]);
      setMessage(error instanceof Error ? error.message : "COD search failed.");
    } finally {
      setState("idle");
    }
  };

  const calculateReference = async (result: CODSearchResult) => {
    setState("calculating");
    setMessage(`Retrieving COD ${result.sourceId} and calculating its theoretical pattern…`);
    try {
      const response = await fetch(`/api/xrd/references/cod/${result.sourceId}/pattern`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ radiation: { preset: radiationPreset }, twoThetaRange: { minDeg: 10, maxDeg: 90 }, ...(result.sourceRevision ? { sourceRevision: result.sourceRevision } : {}) }),
      });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(body, "Pattern calculation failed."));
      const parsed = calculatedPatternSchema.parse(body);
      setPattern(parsed);
      onPatternChange?.(parsed);
      setMessage(`Calculated ${parsed.reflections.length} peaks from the revision-pinned CIF.`);
    } catch (error) {
      setPattern(null);
      onPatternChange?.(null);
      setMessage(error instanceof Error ? error.message : "Pattern calculation failed.");
    } finally {
      setState("idle");
    }
  };

  return <div className="xrd-workspace">
    <section className="xrd-panel" aria-labelledby="xrd-search-title">
      <div className="xrd-section-heading"><div><h2 id="xrd-search-title">Find a crystal structure</h2><p>Search COD by exact composition. Results are normalized before they reach this workspace.</p></div></div>
      <form className="xrd-search-form" onSubmit={search}>
        <label><span>Formula or COD ID</span><input aria-label="Formula or COD ID" maxLength={120} onChange={(event) => setQuery(event.target.value)} placeholder="Ti3AlC2" value={query} /></label>
        <label><span>Radiation convention</span><select aria-label="Radiation convention" onChange={(event) => { setRadiationPreset(event.target.value as XRDRadiationPreset); setPattern(null); onPatternChange?.(null); }} value={radiationPreset}>{Object.entries(XRD_RADIATION_PRESETS).map(([value, item]) => <option key={value} value={value}>{item.label} · {item.wavelengthAngstrom} Å</option>)}</select></label>
        <button className="ui-button ui-button-primary" disabled={state !== "idle"} type="submit">{state === "searching" ? "Searching…" : "Search COD"}</button>
      </form>
      <p aria-live="polite" className="xrd-status">{message}</p>
    </section>

    {results.length > 0 && <section className="xrd-panel" aria-labelledby="xrd-results-title">
      <div className="xrd-section-heading"><div><h2 id="xrd-results-title">Search results</h2></div></div>
      <div className="xrd-results-list">{results.map((result) => <article key={result.sourceId}>
        <div><h3>{result.formula}{result.phaseName && result.phaseName !== result.formula ? <small>{result.phaseName}</small> : null}</h3><dl><div><dt>COD ID</dt><dd>{result.sourceId}</dd></div><div><dt>Space group</dt><dd>{result.spaceGroup ?? "Not reported"}</dd></div><div><dt>Cell a × b × c</dt><dd><LatticeSummary lattice={result.lattice} /></dd></div><div><dt>Reference</dt><dd>{result.doi ?? result.publication?.title ?? "Not reported"}</dd></div><div><dt>Revision</dt><dd>{result.sourceRevision ?? "Latest available"}</dd></div></dl></div>
        <button className="ui-button" disabled={state !== "idle"} onClick={() => void calculateReference(result)} type="button">{state === "calculating" ? "Calculating…" : "Use reference"}</button>
      </article>)}</div>
    </section>}

    {pattern && <section className="xrd-panel" aria-labelledby="xrd-pattern-title">
      <div className="xrd-section-heading"><div><h2 id="xrd-pattern-title">{pattern.reference.formula} theoretical powder pattern</h2><p>Calculated by {pattern.calculationProvenance.engine} {pattern.calculationProvenance.engineVersion}; intensities normalized to the strongest calculated reflection.</p></div></div>
      <dl className="xrd-pattern-metadata"><div><dt>Source</dt><dd>COD {pattern.reference.sourceId} · revision {pattern.reference.sourceRevision ?? "unreported"}</dd></div><div><dt>Crystal system</dt><dd>{pattern.crystalSystem}</dd></div><div><dt>Space group</dt><dd>{pattern.spaceGroup}</dd></div><div><dt>Lattice a × b × c</dt><dd><LatticeSummary lattice={pattern.lattice} /></dd></div><div><dt>Angles α / β / γ</dt><dd>{fmt(pattern.lattice.alphaDeg)}° / {fmt(pattern.lattice.betaDeg)}° / {fmt(pattern.lattice.gammaDeg)}°</dd></div><div><dt>Radiation</dt><dd>{pattern.radiation.label} · λ {fmt(pattern.radiation.wavelengthAngstrom, 5)} Å</dd></div><div><dt>CIF SHA-256</dt><dd className="xrd-hash">{pattern.reference.cifSha256}</dd></div><div><dt>Retrieved</dt><dd>{new Date(pattern.reference.retrievedAt).toLocaleString()}</dd></div></dl>
      <StickPlot pattern={pattern} />
      <div className="xrd-reflection-table"><table><caption>Calculated reflections</caption><thead><tr><th>2θ (°)</th><th>Relative intensity</th><th>d (Å)</th><th>hkl · multiplicity</th></tr></thead><tbody>{pattern.reflections.map((peak, index) => <tr key={`${peak.twoThetaDeg}-${index}`}><td>{fmt(peak.twoThetaDeg)}</td><td>{fmt(peak.relativeIntensity, 2)}</td><td>{fmt(peak.dAngstrom, 5)}</td><td>{hklLabel(peak)}</td></tr>)}</tbody></table></div>
    </section>}
  </div>;
}
