"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useAccountRepositories } from "@/components/cloud/use-account-repositories";
import { XRDMeasurementRepository, type StoredExperimentalXRDMeasurement } from "@/lib/xrd/persistence";
import { experimentalXrdParseResponseSchema, type ExperimentalXRDMeasurement, type ExperimentalXRDParseResponse, type XRDParserOverride } from "@/lib/xrd/schemas";
import type { XRDPeakAnalysis } from "@/lib/xrd/stage3";
import { XrdPeakAnalysisWorkspace } from "./xrd-peak-analysis-workspace";

const ACCEPT = ".csv,.tsv,.txt,.xy,.xye,.dat,text/plain,text/csv";

function errorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: { message?: unknown; detail?: unknown } }).error;
    if (typeof error?.message === "string") return typeof error.detail === "string" ? `${error.message} ${error.detail}` : error.message;
  }
  return fallback;
}

function fmt(value: number, digits = 4): string { return value.toFixed(digits).replace(/\.?0+$/, ""); }
function bytes(value: number): string { return value < 1024 ? `${value} B` : value < 1024 ** 2 ? `${(value / 1024).toFixed(1)} kB` : `${(value / 1024 ** 2).toFixed(1)} MB`; }

function RawPatternPlot({ measurement }: { readonly measurement: ExperimentalXRDMeasurement }) {
  const width = 900, height = 300, left = 68, right = 22, top = 22, bottom = 48;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const { minTwoThetaDeg: minX, maxTwoThetaDeg: maxX, minIntensity: minY, maxIntensity: maxY } = measurement.characterization;
  const xSpan = maxX - minX || 1, ySpan = maxY - minY || 1;
  const x = (value: number) => left + ((value - minX) / xSpan) * plotWidth;
  const y = (value: number) => top + plotHeight - ((value - minY) / ySpan) * plotHeight;
  const limit = 12_000;
  const stride = Math.max(1, Math.ceil(measurement.twoThetaDeg.length / limit));
  const indices = Array.from({ length: Math.ceil(measurement.twoThetaDeg.length / stride) }, (_, index) => Math.min(index * stride, measurement.twoThetaDeg.length - 1));
  if (indices.at(-1) !== measurement.twoThetaDeg.length - 1) indices.push(measurement.twoThetaDeg.length - 1);
  const points = indices.map((index) => `${x(measurement.twoThetaDeg[index]!)},${y(measurement.intensity[index]!)}`).join(" ");
  const xTicks = Array.from({ length: 5 }, (_, index) => minX + (xSpan * index) / 4);
  const yTicks = Array.from({ length: 4 }, (_, index) => minY + (ySpan * index) / 3);
  return <>
    <svg aria-label={`Raw experimental XRD pattern for ${measurement.sampleName ?? measurement.sourceFilename}`} className="xrd-stick-plot" role="img" viewBox={`0 0 ${width} ${height}`}>
      <title>Raw measured intensity plotted against 2theta. No scientific transformations are applied.</title>
      <line className="xrd-axis" x1={left} x2={width - right} y1={top + plotHeight} y2={top + plotHeight} />
      <line className="xrd-axis" x1={left} x2={left} y1={top} y2={top + plotHeight} />
      {xTicks.map((tick) => <g key={tick}><line className="xrd-tick" x1={x(tick)} x2={x(tick)} y1={top + plotHeight} y2={top + plotHeight + 6} /><text className="xrd-tick-label" textAnchor="middle" x={x(tick)} y={height - 20}>{fmt(tick, 2)}</text></g>)}
      {yTicks.map((tick) => <text className="xrd-tick-label" key={tick} textAnchor="end" x={left - 8} y={y(tick) + 4}>{fmt(tick, 2)}</text>)}
      <text className="xrd-axis-label" textAnchor="middle" x={left + plotWidth / 2} y={height - 3}>2θ (degrees)</text>
      <text className="xrd-axis-label" textAnchor="middle" transform={`rotate(-90 15 ${top + plotHeight / 2})`} x={15} y={top + plotHeight / 2}>Raw intensity</text>
      <polyline className="xrd-raw-line" fill="none" points={points} />
    </svg>
    {stride > 1 && <p className="xrd-plot-note">Display preview shows every {stride}th point for browser performance. All {measurement.twoThetaDeg.length.toLocaleString()} original points remain stored unchanged.</p>}
  </>;
}

export function XrdExperimentalWorkspace({ onAnalysisChange }: { readonly onAnalysisChange?: (analysis: XRDPeakAnalysis | null) => void }) {
  const repositories = useAccountRepositories();
  const storage = useMemo(() => new XRDMeasurementRepository(repositories.database), [repositories]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState<ExperimentalXRDParseResponse>();
  const [active, setActive] = useState<StoredExperimentalXRDMeasurement>();
  const [library, setLibrary] = useState<readonly StoredExperimentalXRDMeasurement[]>([]);
  const [duplicates, setDuplicates] = useState<readonly StoredExperimentalXRDMeasurement[]>([]);
  const [settings, setSettings] = useState<XRDParserOverride>({});
  const [sampleName, setSampleName] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("Choose a supported text file. MAXCalc will preview its interpretation before anything is saved.");

  const refresh = useCallback(async () => setLibrary(await storage.list()), [storage]);
  useEffect(() => {
    queueMicrotask(() => void refresh().catch(() => setMessage("The local XRD measurement library could not be opened.")));
  }, [refresh]);

  const parse = useCallback(async (selected: File, overrides: XRDParserOverride) => {
    setPending(true); setMessage("Hashing exact file bytes and parsing a preview…"); setPreview(undefined); setDuplicates([]);
    try {
      const form = new FormData(); form.set("file", selected, selected.name); form.set("parserConfig", JSON.stringify(overrides));
      const response = await fetch("/api/xrd/data/parse", { method: "POST", body: form });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(errorMessage(body, "The XRD file could not be parsed."));
      const parsed = experimentalXrdParseResponseSchema.parse(body);
      const existing = await storage.findByRawHash(parsed.rawArtifact.sha256);
      setPreview(parsed); setDuplicates(existing); setSampleName(parsed.measurement.sourceFilename);
      setMessage(existing.length ? "This exact raw file is already stored. Open an existing measurement or import a new interpretation." : "Review the detected interpretation, provenance, and warnings before importing.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The XRD file could not be parsed."); }
    finally { setPending(false); }
  }, [storage]);

  const selectFile = (selected?: File) => { if (!selected) return; setFile(selected); setSettings({}); setActive(undefined); void parse(selected, {}); };
  const onDrop = (event: DragEvent<HTMLDivElement>) => { event.preventDefault(); selectFile(event.dataTransfer.files[0]); };
  const commit = async () => {
    if (!preview || !file) return;
    setPending(true);
    try {
      const measurement = { ...preview.measurement, sampleName: sampleName.trim() || null };
      await storage.save(preview.rawArtifact, file.slice(0, file.size, file.type), measurement, sampleName);
      const stored = await storage.get(measurement.measurementId);
      setActive(stored); setPreview(undefined); setDuplicates([]); await refresh();
      setMessage("Measurement imported locally. Raw bytes and parsed arrays are preserved separately.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The measurement could not be saved locally."); }
    finally { setPending(false); }
  };

  const reparse = () => { if (file) void parse(file, settings); };
  const rename = async (record: StoredExperimentalXRDMeasurement) => {
    const name = window.prompt("New display name (raw provenance will not change):", record.displayName);
    if (!name?.trim()) return;
    await storage.rename(record.id, name); await refresh(); if (active?.id === record.id) setActive({ ...record, displayName: name.trim() });
  };
  const remove = async (record: StoredExperimentalXRDMeasurement) => {
    if (!window.confirm(`Delete the local measurement “${record.displayName}”? Its raw artifact is retained if another measurement references it.`)) return;
    await storage.delete(record.id); if (active?.id === record.id) setActive(undefined); await refresh();
  };

  const shown = active?.measurement;
  return <div className="xrd-experimental-stack">
    <section className="xrd-panel" aria-labelledby="xrd-import-title">
      <div className="xrd-section-heading"><div><span className="xrd-step-kicker">Experimental XRD · raw ingestion</span><h2 id="xrd-import-title">Import a measurement</h2><p>Exact bytes are hashed before parsing. Previewing and plotting do not smooth, normalize, reorder, or otherwise transform measured values.</p></div></div>
      <div className="xrd-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
        <div><strong>Drop an XRD text file here</strong><span>CSV, TSV, TXT, XY, XYE, or safely readable text DAT · maximum 25 MB by default</span></div>
        <button className="ui-button" disabled={pending} onClick={() => inputRef.current?.click()} type="button">Choose file</button>
        <input accept={ACCEPT} aria-label="Choose experimental XRD file" hidden onChange={(event) => selectFile(event.target.files?.[0])} ref={inputRef} type="file" />
      </div>
      <p aria-live="polite" className="xrd-status">{message}</p>

      {preview && <div className="xrd-import-preview">
        <div className="xrd-section-heading"><div><span className="xrd-step-kicker">Import preview · not yet saved</span><h3>{preview.rawArtifact.originalFilename}</h3></div></div>
        <dl className="xrd-pattern-metadata">
          <div><dt>File</dt><dd>{bytes(preview.rawArtifact.byteLength)}</dd></div><div><dt>SHA-256</dt><dd className="xrd-hash" title={preview.rawArtifact.sha256}>{preview.rawArtifact.sha256.slice(0, 16)}…</dd></div>
          <div><dt>Detected format</dt><dd>{preview.measurement.parserProvenance.detectedFormat} · {preview.measurement.parserProvenance.detectionConfidence} confidence</dd></div>
          <div><dt>Columns</dt><dd>2θ: {preview.measurement.parserProvenance.twoThetaColumn.name ?? `Column ${preview.measurement.parserProvenance.twoThetaColumn.index + 1}`} · intensity: {preview.measurement.parserProvenance.intensityColumn.name ?? `Column ${preview.measurement.parserProvenance.intensityColumn.index + 1}`}</dd></div>
          <div><dt>Points</dt><dd>{preview.measurement.characterization.pointCount.toLocaleString()}</dd></div>
          <div><dt>Range</dt><dd>{fmt(preview.measurement.characterization.minTwoThetaDeg)}° – {fmt(preview.measurement.characterization.maxTwoThetaDeg)}°</dd></div>
          <div><dt>Typical step</dt><dd>{preview.measurement.characterization.medianSpacingDeg === null ? "Not meaningful" : `~${fmt(preview.measurement.characterization.medianSpacingDeg, 6)}°`}</dd></div>
          <div><dt>Ordering</dt><dd>{preview.measurement.characterization.ordering}</dd></div>
        </dl>
        {[...preview.measurement.parserProvenance.warnings, ...preview.measurement.validationIssues.map((issue) => issue.message)].length > 0 ? <div className="xrd-warning-list"><strong>Warnings</strong><ul>{preview.measurement.parserProvenance.warnings.map((warning) => <li key={warning}>{warning}</li>)}{preview.measurement.validationIssues.map((issue) => <li key={issue.code}>{issue.message}{issue.representativeRows.length ? ` Lines: ${issue.representativeRows.map((row) => `${row.lineNumber} (${row.reason})`).join(", ")}.` : ""}</li>)}</ul></div> : <p className="xrd-success">No parser or dataset warnings.</p>}
        {duplicates.length > 0 && <div className="xrd-duplicate"><strong>This exact raw file has already been imported.</strong>{duplicates.map((item) => <button className="ui-button" key={item.id} onClick={() => setActive(item)} type="button">Open {item.displayName}</button>)}</div>}
        <details className="xrd-parser-settings"><summary>Parser settings</summary><div className="xrd-settings-grid">
          <label>Delimiter<select value={settings.delimiter ?? ""} onChange={(event) => setSettings({ ...settings, delimiter: (event.target.value || undefined) as XRDParserOverride["delimiter"] })}><option value="">Auto-detect</option><option value="comma">Comma</option><option value="tab">Tab</option><option value="semicolon">Semicolon</option><option value="whitespace">Whitespace</option></select></label>
          <label>Header rows<input min="0" onChange={(event) => setSettings({ ...settings, headerRows: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder={String(preview.measurement.parserProvenance.headerRows)} type="number" value={settings.headerRows ?? ""} /></label>
          <label>2θ column<select value={settings.twoThetaColumn ?? preview.measurement.parserProvenance.twoThetaColumn.index} onChange={(event) => setSettings({ ...settings, twoThetaColumn: Number(event.target.value) })}>{preview.availableColumns.map((column) => <option key={column.index} value={column.index}>{column.name ?? `Column ${column.index + 1}`}</option>)}</select></label>
          <label>Intensity column<select value={settings.intensityColumn ?? preview.measurement.parserProvenance.intensityColumn.index} onChange={(event) => setSettings({ ...settings, intensityColumn: Number(event.target.value) })}>{preview.availableColumns.map((column) => <option key={column.index} value={column.index}>{column.name ?? `Column ${column.index + 1}`}</option>)}</select></label>
          <button className="ui-button" disabled={pending} onClick={reparse} type="button">Reparse preview</button>
        </div></details>
        <div className="xrd-import-actions"><label>Display / sample name<input maxLength={200} onChange={(event) => setSampleName(event.target.value)} value={sampleName} /></label><button className="ui-button ui-button-primary" disabled={pending} onClick={() => void commit()} type="button">Import measurement</button></div>
      </div>}
    </section>

    {shown && <section className="xrd-panel" aria-labelledby="xrd-raw-pattern-title">
      <div className="xrd-section-heading"><div><span className="xrd-step-kicker">Raw experimental pattern · schema {shown.schemaVersion}</span><h2 id="xrd-raw-pattern-title">{active?.displayName ?? shown.sampleName ?? shown.sourceFilename}</h2><p>{shown.characterization.pointCount.toLocaleString()} original points · SHA-256 <span className="xrd-hash">{shown.rawArtifactSha256.slice(0, 16)}…</span> · no preprocessing</p></div></div>
      <RawPatternPlot measurement={shown} />
    </section>}

    {active && <XrdPeakAnalysisWorkspace database={repositories.database} key={active.id} measurementRecord={active} onAnalysisChange={onAnalysisChange} />}

    <section className="xrd-panel" aria-labelledby="xrd-library-title">
      <div className="xrd-section-heading"><div><span className="xrd-step-kicker">This browser · IndexedDB</span><h2 id="xrd-library-title">Measurement library</h2><p>Measurements stay on this device and can be reopened after a reload.</p></div></div>
      {library.length === 0 ? <p className="xrd-status">No local experimental measurements yet.</p> : <div className="xrd-results-list">{library.map((record) => <article key={record.id}><div><h3>{record.displayName}<small>{record.measurement.sourceFilename}</small></h3><dl><div><dt>Imported</dt><dd>{new Date(record.importedAt).toLocaleString()}</dd></div><div><dt>Points</dt><dd>{record.measurement.characterization.pointCount.toLocaleString()}</dd></div><div><dt>2θ range</dt><dd>{fmt(record.measurement.characterization.minTwoThetaDeg)}° – {fmt(record.measurement.characterization.maxTwoThetaDeg)}°</dd></div><div><dt>Raw SHA-256</dt><dd className="xrd-hash">{record.rawArtifactSha256.slice(0, 16)}…</dd></div></dl></div><div className="xrd-library-actions"><button className="ui-button" onClick={() => setActive(record)} type="button">Open</button><button className="ui-button" onClick={() => void rename(record)} type="button">Rename</button><button className="ui-button" onClick={() => void remove(record)} type="button">Delete</button></div></article>)}</div>}
    </section>
  </div>;
}
