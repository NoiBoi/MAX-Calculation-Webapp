"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  EMI_PARSER_VERSION,
  ENGINE_VERSION,
  calculateEmiDataset,
  calculatePointwiseReplicateStatistics,
  calculatePooledPointBandSummary,
  calculateSpecimenFirstBandSummary,
  calculateEmiStatistics,
  normalizeSetByArealDensity,
  normalizeSetByThickness,
  parseKeysightCsv,
  validateEmiDataset,
  type EmiDirection,
  type EmiFrequencyRange,
  type EmiInterpolationOptions,
  type EmiMetric,
  type EmiValidationIssue,
} from "@max-stoich/chemistry-engine";
import {
  aggregateEmiIssues,
  buildProcessedRows,
  createProcessedEmiCsv,
  createSummaryStatisticsCsv,
  EMI_METRICS,
  type EmiAnalysisFile,
} from "@/lib/emi/analyzer";
import {
  createEmptyEmiProject,
  EmiProjectRepository,
  parseEmiProjectJson,
  serializeEmiProject,
  suggestEmiMetadata,
  type EmiPlotConfiguration,
  type EmiProjectRecord,
  type EmiSampleMetadata,
} from "@/lib/emi/project";
import { createBandSummaryCsv, createEmiAnalysisManifest, createEmiAnalysisSummaryHtml, createReplicatePointwiseCsv } from "@/lib/emi/replicate-exports";
import { EmiPlot, type EmiPlotBand, type EmiPlotTrace } from "./emi-plot";

type ImportedFile =
  | Readonly<{ id: string; filename: string; status: "loading" }>
  | Readonly<{ id: string; filename: string; status: "error"; issues: readonly EmiValidationIssue[] }>
  | (EmiAnalysisFile & Readonly<{ filename: string; status: "ready" }>);

type DirectionMode = EmiDirection | "both";
type FrequencyUnit = "GHz" | "Hz";

const METRIC_LABELS: Readonly<Record<EmiMetric, string>> = {
  SET: "Total shielding effectiveness, SET",
  SER: "Reflection contribution, SER",
  SEA: "Effective absorption contribution, SEA",
  R: "Reflectance, R",
  T: "Transmittance, T",
  A: "Absorptance, A",
};
const COLORS = ["#0f766e", "#2563eb", "#c2410c", "#7c3aed", "#be123c", "#15803d", "#0369a1", "#a16207", "#9333ea", "#4d7c0f", "#b91c1c", "#0891b2"];

function formatNumber(value: number | null | undefined, digits = 6): string {
  if (value === null || value === undefined) return "—";
  if (!Number.isFinite(value)) return String(value);
  return value.toLocaleString(undefined, { maximumSignificantDigits: digits });
}

function formatFrequency(value: number | undefined, unit: FrequencyUnit): string {
  if (value === undefined) return "—";
  return `${formatNumber(value / (unit === "GHz" ? 1e9 : 1), 8)} ${unit}`;
}

function directionLabel(direction: EmiDirection): string {
  return direction === "forward" ? "Forward (S11 / S21)" : "Reverse (S22 / S12)";
}

function directionsFor(mode: DirectionMode): readonly EmiDirection[] {
  return mode === "both" ? ["forward", "reverse"] : [mode];
}

function downloadCsv(filename: string, content: string): void {
  downloadContent(filename, content, "text/csv;charset=utf-8");
}

function downloadContent(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function EmiAnalyzerShell() {
  const [files, setFiles] = useState<readonly ImportedFile[]>([]);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [directionMode, setDirectionMode] = useState<DirectionMode>("forward");
  const [unit, setUnit] = useState<FrequencyUnit>("GHz");
  const [range, setRange] = useState<EmiFrequencyRange>({});
  const [metrics, setMetrics] = useState<ReadonlySet<EmiMetric>>(new Set(EMI_METRICS));
  const [tableFileId, setTableFileId] = useState("");
  const [tableDirection, setTableDirection] = useState<EmiDirection>("forward");
  const [project, setProject] = useState<EmiProjectRecord>(() => createEmptyEmiProject());
  const [savedProjects, setSavedProjects] = useState<readonly EmiProjectRecord[]>([]);
  const [projectStatus, setProjectStatus] = useState("New unsaved local project");
  const [bulkGroup, setBulkGroup] = useState("");
  const [bulkMaterial, setBulkMaterial] = useState("");
  const [comparisonSort, setComparisonSort] = useState<"name" | "group" | EmiMetric | "thickness" | "arealDensity" | "warnings" | "validity">("name");
  const [excludedComparisonIds, setExcludedComparisonIds] = useState<ReadonlySet<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const repositoryRef = useRef<EmiProjectRepository | null>(null);
  const rangeEditedRef = useRef(false);

  const ready = useMemo(() => files.filter((file): file is Extract<ImportedFile, { status: "ready" }> => file.status === "ready"), [files]);
  const selected = useMemo(() => ready.filter((file) => selectedIds.has(file.id)), [ready, selectedIds]);
  const selectedWarningFrequencies = useMemo(() => selected.flatMap((file) => file.issues.flatMap((issue) => issue.frequencyHz === undefined ? [] : [issue.frequencyHz])), [selected]);
  const directions = directionsFor(directionMode);
  const tableFile = selected.find((file) => file.id === tableFileId) ?? selected[0];
  const tableRows = tableFile ? buildProcessedRows(tableFile.dataset, tableFile.calculation, tableDirection, tableFile.issues).filter((row) => (range.minimumHz === undefined || row.frequencyHz >= range.minimumHz) && (range.maximumHz === undefined || row.frequencyHz <= range.maximumHz)) : [];
  const factor = unit === "GHz" ? 1e9 : 1;
  const interpolation = project.interpolation;
  const groupAggregations = useMemo(() => project.groups.flatMap((group) => directions.map((direction) => {
    const members = group.datasetIds.flatMap((id) => { const file = ready.find((entry) => entry.id === id); return file ? [{ id, points: file.calculation[direction] }] : []; });
    return { group, direction, members, result: calculatePointwiseReplicateStatistics(members, interpolation) };
  })), [directions, interpolation, project.groups, ready]);

  useEffect(() => {
    const repository = new EmiProjectRepository();
    repositoryRef.current = repository;
    void repository.list().then(setSavedProjects).catch((error) => setProjectStatus(`Local project library unavailable: ${error instanceof Error ? error.message : "unknown error"}`));
  }, []);

  const refreshProjects = async () => { if (repositoryRef.current) setSavedProjects(await repositoryRef.current.list()); };
  const projectSnapshot = (): EmiProjectRecord => ({
    ...project,
    updatedAt: new Date().toISOString(),
    datasets: project.datasets.filter((entry) => ready.some((file) => file.id === entry.id)),
    selectedDatasetIds: selected.map((file) => file.id),
    selectedDirections: directions,
    frequencyRangeHz: range,
    visibleMetrics: [...metrics],
    interpolation,
    plot: { ...project.plot, frequencyUnit: unit },
    calculationEngineVersion: ENGINE_VERSION,
    parserVersion: EMI_PARSER_VERSION,
  });

  const restoreProject = (restored: EmiProjectRecord) => {
    const restoredFiles = restored.datasets.map((entry) => {
      const calculation = calculateEmiDataset(entry.parsedDataset);
      return { id: entry.id, filename: entry.originalFilename, status: "ready" as const, dataset: entry.parsedDataset, calculation, issues: validateEmiDataset(entry.parsedDataset, calculation, restored.qualityControl) };
    });
    setProject(restored); setFiles(restoredFiles); setSelectedIds(new Set(restored.selectedDatasetIds)); setRange(restored.frequencyRangeHz); setMetrics(new Set(restored.visibleMetrics)); setUnit(restored.plot.frequencyUnit); setDirectionMode(restored.selectedDirections.length > 1 ? "both" : restored.selectedDirections[0] ?? "forward"); setTableFileId(restored.selectedDatasetIds[0] ?? restored.datasets[0]?.id ?? ""); rangeEditedRef.current = true; setProjectStatus(`Restored ${restored.name} from local storage.`);
  };

  const updateMetadata = (id: string, update: Partial<EmiSampleMetadata>) => setProject((current) => ({ ...current, datasets: current.datasets.map((entry) => entry.id === id ? { ...entry, sampleMetadata: { ...entry.sampleMetadata, ...update } } : entry) }));
  const updateQualityControl = (update: Partial<EmiProjectRecord["qualityControl"]>) => {
    const qualityControl = { ...project.qualityControl, ...update };
    setProject((current) => ({ ...current, qualityControl }));
    setFiles((current) => current.map((file) => file.status === "ready" ? { ...file, issues: validateEmiDataset(file.dataset, file.calculation, qualityControl) } : file));
  };

  const importFiles = async (incoming: readonly File[]) => {
    const entries = incoming.filter((file) => file.name.toLowerCase().endsWith(".csv")).map((file) => ({ file, id: `${Date.now()}-${crypto.randomUUID()}` }));
    if (entries.length === 0) return;
    setFiles((current) => [...current, ...entries.map(({ file, id }) => ({ id, filename: file.name, status: "loading" as const }))]);
    await Promise.all(entries.map(async ({ file, id }) => {
      try {
        const parsed = parseKeysightCsv(await file.text(), file.name);
        if (!parsed.ok) {
          setFiles((current) => current.map((entry) => entry.id === id ? { id, filename: file.name, status: "error", issues: parsed.issues } : entry));
          return;
        }
        const calculation = calculateEmiDataset(parsed.dataset);
        const issues = validateEmiDataset(parsed.dataset, calculation);
        const loaded: Extract<ImportedFile, { status: "ready" }> = { id, filename: file.name, status: "ready", dataset: parsed.dataset, calculation, issues };
        setFiles((current) => current.map((entry) => entry.id === id ? loaded : entry));
        setProject((current) => ({ ...current, datasets: [...current.datasets, { id, originalFilename: file.name, parsedDataset: parsed.dataset, sampleMetadata: { displayName: file.name }, importedAt: new Date().toISOString(), parserVersion: EMI_PARSER_VERSION }] }));
        setSelectedIds((current) => new Set(current).add(id));
        setTableFileId((current) => current || id);
        const frequencies = parsed.dataset.points.map((point) => point.frequencyHz).filter(Number.isFinite);
        if (frequencies.length > 0 && !rangeEditedRef.current) setRange((current) => ({
          minimumHz: current.minimumHz === undefined ? Math.min(...frequencies) : Math.min(current.minimumHz, ...frequencies),
          maximumHz: current.maximumHz === undefined ? Math.max(...frequencies) : Math.max(current.maximumHz, ...frequencies),
        }));
      } catch (error) {
        const issue: EmiValidationIssue = { severity: "error", code: "MISSING_DATA_ROWS", filename: file.name, message: error instanceof Error ? error.message : "The file could not be read." };
        setFiles((current) => current.map((entry) => entry.id === id ? { id, filename: file.name, status: "error", issues: [issue] } : entry));
      }
    }));
  };

  const removeFile = (id: string) => {
    setFiles((current) => current.filter((file) => file.id !== id));
    setSelectedIds((current) => { const next = new Set(current); next.delete(id); return next; });
    if (tableFileId === id) setTableFileId("");
    setProject((current) => ({ ...current, datasets: current.datasets.filter((entry) => entry.id !== id), groups: current.groups.map((group) => ({ ...group, datasetIds: group.datasetIds.filter((datasetId) => datasetId !== id) })) }));
  };
  const clearFiles = () => { setFiles([]); setSelectedIds(new Set()); setTableFileId(""); setRange({}); setProject((current) => ({ ...current, datasets: [], groups: [], selectedDatasetIds: [] })); rangeEditedRef.current = false; };
  const traces = (plotMetrics: readonly EmiMetric[]): EmiPlotTrace[] => {
    const individual = project.plot.showIndividualReplicates ? selected.flatMap((file, fileIndex) => directions.flatMap((direction, directionIndex) => plotMetrics.filter((metric) => metrics.has(metric)).map((metric, metricIndex) => ({
    id: `${file.id}-${direction}-${metric}`,
    label: `${project.datasets.find((entry) => entry.id === file.id)?.sampleMetadata.displayName ?? file.filename} · ${direction === "forward" ? "Forward" : "Reverse"} · ${metric}`,
    color: COLORS[(fileIndex * 6 + directionIndex * 3 + metricIndex) % COLORS.length] as string,
    metric,
    points: file.calculation[direction],
    lineStyle: "solid" as const,
  })))) : [];
    const groups = groupAggregations.flatMap((aggregation, groupIndex) => plotMetrics.filter((metric) => metrics.has(metric)).flatMap((metric, metricIndex) => (project.plot.medianVisibility ? ["mean", "median"] as const : ["mean"] as const).map((statistic) => ({
      id: `group-${aggregation.group.id}-${aggregation.direction}-${metric}`,
      label: `${aggregation.group.name} ${statistic} · ${aggregation.direction === "forward" ? "Forward" : "Reverse"} · ${metric}${aggregation.result.interpolationApplied ? " · interpolated" : ""}`,
      color: COLORS[(groupIndex * 3 + metricIndex + 4) % COLORS.length] as string,
      metric,
      lineStyle: "dashed" as const,
      points: aggregation.result.frequencyGridHz.map((frequencyHz) => {
        const values = Object.fromEntries(EMI_METRICS.map((candidate) => [candidate, aggregation.result.statistics.find((row) => row.frequencyHz === frequencyHz && row.metric === candidate)?.[statistic] ?? null])) as Record<EmiMetric, number | null>;
        return { direction: aggregation.direction, frequencyHz, reflectionParameter: aggregation.direction === "forward" ? "s11" as const : "s22" as const, transmissionParameter: aggregation.direction === "forward" ? "s21" as const : "s12" as const, R: values.R ?? Number.NaN, T: values.T ?? Number.NaN, A: values.A ?? Number.NaN, SET: values.SET, SER: values.SER, SEA: values.SEA, decompositionResidual: null };
      }),
    }))));
    return [...individual, ...groups];
  };
  const bands = (plotMetrics: readonly EmiMetric[]): EmiPlotBand[] => project.plot.uncertaintyBand === "none" ? [] : groupAggregations.flatMap((aggregation, groupIndex) => plotMetrics.filter((metric) => metrics.has(metric)).flatMap((metric, metricIndex) => {
    const points = aggregation.result.statistics.filter((row) => row.metric === metric).flatMap((row) => {
      if (project.plot.uncertaintyBand === "confidence-95") return row.confidenceInterval95 ? [{ frequencyHz: row.frequencyHz, lower: row.confidenceInterval95.lower, upper: row.confidenceInterval95.upper, contributingCount: row.contributingReplicateCount }] : [];
      return row.mean !== null && row.sampleStandardDeviation !== null ? [{ frequencyHz: row.frequencyHz, lower: row.mean - row.sampleStandardDeviation, upper: row.mean + row.sampleStandardDeviation, contributingCount: row.contributingReplicateCount }] : [];
    });
    return points.length > 1 ? [{ id: `band-${aggregation.group.id}-${aggregation.direction}-${metric}`, label: `${aggregation.group.name} ${project.plot.uncertaintyBand === "confidence-95" ? "95% CI" : "sample SD"} · ${metric}`, color: COLORS[(groupIndex * 3 + metricIndex + 4) % COLORS.length] as string, points }] : [];
  }));
  const setRangeBoundary = (boundary: "minimumHz" | "maximumHz", value: string) => {
    rangeEditedRef.current = true;
    setRange((current) => ({ ...current, [boundary]: value === "" ? undefined : Number(value) * factor }));
  };
  const status = files.some((file) => file.status === "loading") ? "Reading files locally…" : files.length === 0 ? "No files loaded" : `${ready.length} of ${files.length} files ready`;
  const comparisonEntries = useMemo(() => {
    const individual = ready.flatMap((file) => directions.map((direction) => {
      const metadata = project.datasets.find((entry) => entry.id === file.id)?.sampleMetadata;
      const statistics = Object.fromEntries(EMI_METRICS.map((metric) => [metric, calculateEmiStatistics(file.calculation[direction], metric, range)])) as Record<EmiMetric, ReturnType<typeof calculateEmiStatistics>>;
      const values = Object.fromEntries(EMI_METRICS.map((metric) => [metric, { mean: statistics[metric].mean, standardDeviation: statistics[metric].standardDeviation }])) as Record<EmiMetric, Readonly<{ mean: number | null; standardDeviation: number | null }>>;
      const normalizedThickness = metadata?.thickness !== undefined && metadata.thicknessUnit ? normalizeSetByThickness(values.SET.mean, metadata.thickness, metadata.thicknessUnit) : null;
      const normalizedAreal = metadata?.arealDensity !== undefined && metadata.arealDensityUnit ? normalizeSetByArealDensity(values.SET.mean, metadata.arealDensity, metadata.arealDensityUnit) : null;
      return { id: `${file.id}-${direction}`, name: metadata?.displayName ?? file.filename, group: metadata?.group ?? "Ungrouped", direction, aggregateType: "Dataset", values, replicateCount: 1, thickness: metadata?.thickness, thicknessUnit: metadata?.thicknessUnit, arealDensity: metadata?.arealDensity, arealDensityUnit: metadata?.arealDensityUnit, normalizedThickness, normalizedAreal, warningCount: file.issues.length, validity: statistics.SET.validPointPercentage };
    }));
    const groups = project.groups.flatMap((group) => directions.map((direction) => {
      const members = group.datasetIds.flatMap((id) => { const file = ready.find((entry) => entry.id === id); return file ? [{ id, points: file.calculation[direction] }] : []; });
      const summaries = Object.fromEntries(EMI_METRICS.map((metric) => [metric, calculateSpecimenFirstBandSummary(members, metric, range)])) as Record<EmiMetric, ReturnType<typeof calculateSpecimenFirstBandSummary>>;
      const values = Object.fromEntries(EMI_METRICS.map((metric) => [metric, { mean: summaries[metric].mean, standardDeviation: summaries[metric].sampleStandardDeviation }])) as Record<EmiMetric, Readonly<{ mean: number | null; standardDeviation: number | null }>>;
      return { id: `${group.id}-${direction}`, name: group.name, group: group.name, direction, aggregateType: "Replicate mean", values, replicateCount: members.length, thickness: undefined, thicknessUnit: undefined, arealDensity: undefined, arealDensityUnit: undefined, normalizedThickness: null, normalizedAreal: null, warningCount: group.datasetIds.reduce((sum, id) => sum + (ready.find((entry) => entry.id === id)?.issues.length ?? 0), 0), validity: summaries.SET.averageValidPointPercentage };
    }));
    const all = [...individual, ...groups];
    return all.sort((left, right) => {
      if ((EMI_METRICS as readonly string[]).includes(comparisonSort)) { const metric = comparisonSort as EmiMetric; return (right.values[metric].mean ?? Number.NEGATIVE_INFINITY) - (left.values[metric].mean ?? Number.NEGATIVE_INFINITY); }
      if (comparisonSort === "warnings") return left.warningCount - right.warningCount;
      if (comparisonSort === "validity") return right.validity - left.validity;
      if (comparisonSort === "thickness" || comparisonSort === "arealDensity") return (left[comparisonSort] ?? Number.POSITIVE_INFINITY) - (right[comparisonSort] ?? Number.POSITIVE_INFINITY);
      if (comparisonSort === "name" || comparisonSort === "group") return left[comparisonSort].localeCompare(right[comparisonSort]);
      return 0;
    });
  }, [comparisonSort, directions, project.datasets, project.groups, range, ready]);

  return <div className="emi-analyzer" data-testid="emi-analyzer">
    <section className="emi-panel" aria-label="EMI project controls">
      <div className="emi-section-heading"><div><h2>Local EMI project</h2><p>Projects preserve parsed S-parameters, provenance, metadata, groups, analysis settings, and notes in this browser.</p></div><span className="emi-project-badge">Schema {project.schemaVersion} · Engine {project.calculationEngineVersion}</span></div>
      <div className="emi-project-toolbar">
        <label>Project name<input aria-label="Project name" onChange={(event) => setProject((current) => ({ ...current, name: event.target.value }))} value={project.name} /></label>
        <label>Open saved project<select className="ui-select" onChange={(event) => { const restored = savedProjects.find((entry) => entry.id === event.target.value); if (restored) restoreProject(restored); }} value=""><option value="">Choose saved project…</option>{savedProjects.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {new Date(entry.updatedAt).toLocaleString()}</option>)}</select></label>
      </div>
      <label className="emi-project-description">Description<textarea onChange={(event) => setProject((current) => ({ ...current, description: event.target.value }))} rows={2} value={project.description ?? ""} /></label>
      <div className="emi-export-actions">
        <button className="ui-button" onClick={() => { const fresh = createEmptyEmiProject(); setProject(fresh); clearFiles(); setProject(fresh); setProjectStatus("Created a new blank EMI project."); }} type="button">New project</button>
        <button className="ui-button ui-button-primary" onClick={() => void (async () => { const saved = await repositoryRef.current?.save(projectSnapshot()); if (saved) { setProject(saved); await refreshProjects(); setProjectStatus(`Saved ${saved.name} locally.`); } })()} type="button">Save project</button>
        <button className="ui-button" onClick={() => void (async () => { const duplicate = await repositoryRef.current?.duplicate(projectSnapshot()); if (duplicate) { restoreProject(duplicate); await refreshProjects(); setProjectStatus(`Duplicated as ${duplicate.name}.`); } })()} type="button">Duplicate</button>
        <button className="ui-button ui-button-destructive" disabled={!savedProjects.some((entry) => entry.id === project.id)} onClick={() => { if (!window.confirm(`Delete the local EMI project “${project.name}”?`)) return; void repositoryRef.current?.delete(project.id).then(() => { const fresh = createEmptyEmiProject(); restoreProject(fresh); return refreshProjects(); }); }} type="button">Delete</button>
        <button className="ui-button" onClick={() => downloadContent(`${project.name.replace(/[^a-z0-9]+/gi, "-") || "emi-project"}.json`, serializeEmiProject(projectSnapshot()), "application/json;charset=utf-8")} type="button">Export project JSON</button>
        <button className="ui-button" onClick={() => projectInputRef.current?.click()} type="button">Import project JSON</button>
        <input accept="application/json,.json" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void file.text().then((text) => { const imported = parseEmiProjectJson(text); restoreProject({ ...imported, id: crypto.randomUUID(), name: `${imported.name} (imported)`, updatedAt: new Date().toISOString() }); setProjectStatus("Validated and loaded the imported project as an unsaved copy."); }).catch((error) => setProjectStatus(`Project import failed: ${error instanceof Error ? error.message : "invalid project"}`)); event.currentTarget.value = ""; }} ref={projectInputRef} type="file" />
      </div>
      <p aria-live="polite" className="emi-status">{projectStatus}</p>
    </section>
    <section className="emi-panel">
      <div className="emi-section-heading"><div><h2>1. Import measurement CSV files</h2><p>Keysight complex S-parameter CSV files are parsed in this browser and are never uploaded.</p></div>{files.length > 0 && <button className="ui-button ui-button-compact" onClick={clearFiles} type="button">Clear all</button>}</div>
      <div className="emi-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void importFiles([...event.dataTransfer.files]); }}>
        <strong>Drop one or more CSV files here</strong><span>or</span>
        <button className="ui-button ui-button-primary" onClick={() => fileInputRef.current?.click()} type="button">Choose CSV files</button>
        <input accept=".csv,text/csv" className="sr-only" multiple onChange={(event) => { void importFiles([...(event.target.files ?? [])]); event.currentTarget.value = ""; }} ref={fileInputRef} type="file" />
      </div>
      <p className="emi-status" aria-live="polite">{status}</p>
      {files.length > 0 && <div className="emi-file-grid">
        {files.map((file) => { const projectDataset = project.datasets.find((entry) => entry.id === file.id); const metadata = projectDataset?.sampleMetadata; const suggestion = suggestEmiMetadata(file.filename); return <article className={`emi-file-card emi-file-${file.status}${file.status === "ready" && file.issues.length > 0 ? " emi-file-warning" : ""}`} data-testid="emi-file-card" key={file.id}>
          <div className="emi-file-title"><label><input checked={file.status === "ready" && selectedIds.has(file.id)} disabled={file.status !== "ready"} onChange={() => setSelectedIds((current) => { const next = new Set(current); if (next.has(file.id)) next.delete(file.id); else next.add(file.id); return next; })} type="checkbox" /><strong>{file.filename}</strong></label><button aria-label={`Remove ${file.filename}`} className="ui-button ui-button-compact ui-button-destructive" onClick={() => removeFile(file.id)} type="button">Remove</button></div>
          {file.status === "loading" && <p>Reading and validating…</p>}
          {file.status === "error" && <><p className="emi-error-text">Parse failed</p><ul>{file.issues.map((issue, index) => <li key={`${issue.code}-${index}`}>{issue.message}</li>)}</ul></>}
          {file.status === "ready" && <><dl className="emi-file-details">
            <div><dt>Status</dt><dd>{file.issues.length > 0 ? "Ready with validation issues" : "Ready"}</dd></div>
            <div><dt>Points</dt><dd>{file.dataset.points.length}</dd></div>
            <div><dt>Frequency</dt><dd>{formatFrequency(Math.min(...file.dataset.points.map((point) => point.frequencyHz)), unit)} – {formatFrequency(Math.max(...file.dataset.points.map((point) => point.frequencyHz)), unit)}</dd></div>
            <div><dt>Warnings</dt><dd>{file.issues.filter((issue) => issue.severity === "warning").length}</dd></div>
            {file.dataset.metadata.instrument?.model && <div><dt>Instrument</dt><dd>{[file.dataset.metadata.instrument.manufacturer, file.dataset.metadata.instrument.model, file.dataset.metadata.instrument.serialNumber].filter(Boolean).join(" · ")}</dd></div>}
            {file.dataset.metadata.date && <div><dt>Recorded</dt><dd>{file.dataset.metadata.date}</dd></div>}
          </dl><details className="emi-metadata-editor"><summary>Edit sample metadata</summary>
            <p className="emi-suggestion"><strong>Filename suggestion:</strong> sample {suggestion.sampleId ?? "—"}, group {suggestion.group ?? "—"}, replicate {suggestion.replicateNumber ?? "—"}. {suggestion.rationale} <button className="ui-button ui-button-compact" onClick={() => updateMetadata(file.id, { sampleId: suggestion.sampleId, group: suggestion.group, replicateNumber: suggestion.replicateNumber, material: suggestion.material })} type="button">Apply suggestion</button></p>
            <div className="emi-metadata-grid">
              <label>Display name<input aria-label={`Display name for ${file.filename}`} onChange={(event) => updateMetadata(file.id, { displayName: event.target.value })} value={metadata?.displayName ?? file.filename} /></label>
              <label>Sample ID<input onChange={(event) => updateMetadata(file.id, { sampleId: event.target.value || undefined })} value={metadata?.sampleId ?? ""} /></label>
              <label>Group<input onChange={(event) => updateMetadata(file.id, { group: event.target.value || undefined })} value={metadata?.group ?? ""} /></label>
              <label>Replicate number<input min="1" onChange={(event) => updateMetadata(file.id, { replicateNumber: event.target.value ? Number(event.target.value) : undefined })} type="number" value={metadata?.replicateNumber ?? ""} /></label>
              <label>Material or composition<input onChange={(event) => updateMetadata(file.id, { material: event.target.value || undefined })} value={metadata?.material ?? ""} /></label>
              <label>Thickness<span className="emi-compound-input"><input min="0" onChange={(event) => updateMetadata(file.id, { thickness: event.target.value ? Number(event.target.value) : undefined })} step="any" type="number" value={metadata?.thickness ?? ""} /><select aria-label={`Thickness unit for ${file.filename}`} onChange={(event) => updateMetadata(file.id, { thicknessUnit: event.target.value as EmiSampleMetadata["thicknessUnit"] })} value={metadata?.thicknessUnit ?? "mm"}><option value="m">m</option><option value="mm">mm</option><option value="um">µm</option><option value="in">in</option></select></span></label>
              <label>Areal density<span className="emi-compound-input"><input min="0" onChange={(event) => updateMetadata(file.id, { arealDensity: event.target.value ? Number(event.target.value) : undefined })} step="any" type="number" value={metadata?.arealDensity ?? ""} /><select aria-label={`Areal-density unit for ${file.filename}`} onChange={(event) => updateMetadata(file.id, { arealDensityUnit: event.target.value as EmiSampleMetadata["arealDensityUnit"] })} value={metadata?.arealDensityUnit ?? "kg/m2"}><option value="kg/m2">kg/m²</option><option value="g/m2">g/m²</option><option value="g/cm2">g/cm²</option></select></span></label>
              <label>Test date<input onChange={(event) => updateMetadata(file.id, { testDate: event.target.value || undefined })} type="date" value={metadata?.testDate ?? ""} /></label>
              <label>Direction notes<textarea onChange={(event) => updateMetadata(file.id, { directionNotes: event.target.value || undefined })} rows={2} value={metadata?.directionNotes ?? ""} /></label>
              <label>General notes<textarea onChange={(event) => updateMetadata(file.id, { notes: event.target.value || undefined })} rows={2} value={metadata?.notes ?? ""} /></label>
            </div>
          </details></>}
        </article>; })}
      </div>}
      {ready.length > 0 && <div className="emi-bulk-edit"><h3>Bulk metadata edit</h3><p>Applies only to the currently selected files.</p><label>Group<input aria-label="Bulk group" onChange={(event) => setBulkGroup(event.target.value)} value={bulkGroup} /></label><label>Material<input aria-label="Bulk material" onChange={(event) => setBulkMaterial(event.target.value)} value={bulkMaterial} /></label><button className="ui-button" disabled={selected.length === 0 || (!bulkGroup && !bulkMaterial)} onClick={() => selected.forEach((file) => updateMetadata(file.id, { ...(bulkGroup ? { group: bulkGroup } : {}), ...(bulkMaterial ? { material: bulkMaterial } : {}) }))} type="button">Apply to {selected.length} selected file{selected.length === 1 ? "" : "s"}</button></div>}
    </section>

    <section className="emi-panel" aria-label="Dataset controls">
      <div className="emi-section-heading"><div><h2>2. Dataset and direction controls</h2><p>The selected frequency band changes views and statistics only; imported measurements remain intact in memory.</p></div></div>
      <div className="emi-controls-grid">
        <fieldset><legend>Measurement direction</legend><div className="segmented-control emi-direction-control">{(["forward", "reverse", "both"] as const).map((mode) => <button aria-pressed={directionMode === mode} key={mode} onClick={() => setDirectionMode(mode)} type="button">{mode === "forward" ? "Forward" : mode === "reverse" ? "Reverse" : "Both"}</button>)}</div></fieldset>
        <label>Frequency units<select className="ui-select" onChange={(event) => setUnit(event.target.value as FrequencyUnit)} value={unit}><option>GHz</option><option>Hz</option></select></label>
        <label>Minimum frequency<input aria-label="Minimum frequency" min="0" onChange={(event) => setRangeBoundary("minimumHz", event.target.value)} step="any" type="number" value={range.minimumHz === undefined ? "" : range.minimumHz / factor} /></label>
        <label>Maximum frequency<input aria-label="Maximum frequency" min="0" onChange={(event) => setRangeBoundary("maximumHz", event.target.value)} step="any" type="number" value={range.maximumHz === undefined ? "" : range.maximumHz / factor} /></label>
      </div>
      <fieldset className="emi-metric-controls"><legend>Visible metrics</legend>{EMI_METRICS.map((metric) => <label key={metric}><input checked={metrics.has(metric)} onChange={() => setMetrics((current) => { const next = new Set(current); if (next.has(metric)) next.delete(metric); else next.add(metric); return next; })} type="checkbox" />{METRIC_LABELS[metric]}</label>)}</fieldset>
      {selected.length > 0 && <div className="emi-band-presets"><span>Band presets:</span><button className="ui-button ui-button-compact" onClick={() => { const frequencies = selected.flatMap((file) => file.dataset.points.map((point) => point.frequencyHz)); setRange({ minimumHz: Math.min(...frequencies), maximumHz: Math.max(...frequencies) }); rangeEditedRef.current = true; }} type="button">Full selected range</button><button className="ui-button ui-button-compact" onClick={() => { const minima = selected.map((file) => Math.min(...file.dataset.points.map((point) => point.frequencyHz))); const maxima = selected.map((file) => Math.max(...file.dataset.points.map((point) => point.frequencyHz))); setRange({ minimumHz: Math.max(...minima), maximumHz: Math.min(...maxima) }); rangeEditedRef.current = true; }} type="button">Shared overlap</button></div>}
      {range.minimumHz !== undefined && range.maximumHz !== undefined && range.minimumHz > range.maximumHz && <p className="emi-error-text" role="alert">Minimum frequency must not exceed maximum frequency.</p>}
    </section>

    {ready.length > 0 && <section className="emi-panel" aria-label="Replicate groups">
      <div className="emi-section-heading"><div><h2>Replicate groups and grid compatibility</h2><p>Groups represent independent specimens. Derived metrics are calculated per specimen before aggregation; complex S-parameters are not averaged.</p></div><button className="ui-button ui-button-primary" disabled={selected.length === 0} onClick={() => { const id = crypto.randomUUID(); setProject((current) => ({ ...current, groups: [...current.groups, { id, name: `Replicate group ${current.groups.length + 1}`, datasetIds: selected.map((file) => file.id) }] })); }} type="button">Create group from selected</button></div>
      {project.groups.length === 0 ? <p className="emi-supporting">No replicate groups yet. Select files above, then create a group. Files may remain ungrouped.</p> : <div className="emi-group-grid">{project.groups.map((group) => <article className="emi-group-card" key={group.id}><div className="emi-file-title"><input aria-label={`Group name for ${group.name}`} onChange={(event) => setProject((current) => ({ ...current, groups: current.groups.map((entry) => entry.id === group.id ? { ...entry, name: event.target.value } : entry) }))} value={group.name} /><button className="ui-button ui-button-compact ui-button-destructive" onClick={() => setProject((current) => ({ ...current, groups: current.groups.filter((entry) => entry.id !== group.id) }))} type="button">Delete group</button></div>
        <ul>{group.datasetIds.map((id) => { const member = ready.find((file) => file.id === id); if (!member) return null; const entry = project.datasets.find((dataset) => dataset.id === id); return <li key={id}><span><strong>{entry?.sampleMetadata.displayName ?? member.filename}</strong> · {member.dataset.points.length} points · {formatFrequency(Math.min(...member.dataset.points.map((point) => point.frequencyHz)), unit)}–{formatFrequency(Math.max(...member.dataset.points.map((point) => point.frequencyHz)), unit)} · F {member.issues.some((issue) => issue.direction === "forward") ? "warning" : "valid"} / R {member.issues.some((issue) => issue.direction === "reverse") ? "warning" : "valid"}</span><button aria-label={`Remove ${member.filename} from ${group.name}`} onClick={() => setProject((current) => ({ ...current, groups: current.groups.map((candidate) => candidate.id === group.id ? { ...candidate, datasetIds: candidate.datasetIds.filter((datasetId) => datasetId !== id) } : candidate) }))} type="button">×</button></li>; })}</ul>
        {groupAggregations.filter((entry) => entry.group.id === group.id).map((entry) => <p className="emi-grid-status" key={entry.direction}><strong>{directionLabel(entry.direction)}:</strong> {entry.result.compatibility.replaceAll("-", " ")} · {entry.result.statistics.length > 0 ? `${entry.result.frequencyGridHz.length} aggregate frequencies${entry.result.interpolationApplied ? " (interpolated)" : ""}` : "pointwise aggregation unavailable"}</p>)}
      </article>)}</div>}
      <details className="emi-advanced-panel"><summary>Advanced interpolation settings</summary><p>Interpolation is disabled by default, uses derived scalar metrics only, is restricted to the shared overlap, never extrapolates, and preserves invalid bracket regions.</p><div className="emi-controls-grid">
        <label className="emi-checkbox-label"><input checked={interpolation.enabled} onChange={(event) => setProject((current) => ({ ...current, interpolation: { ...current.interpolation, enabled: event.target.checked } }))} type="checkbox" />Enable interpolation for incompatible grids</label>
        <label>Common-grid strategy<select className="ui-select" onChange={(event) => setProject((current) => ({ ...current, interpolation: { ...current.interpolation, strategy: event.target.value as EmiInterpolationOptions["strategy"] } }))} value={interpolation.strategy}><option value="reference-grid">First specimen grid</option><option value="frequency-interval">Frequency interval</option><option value="point-count">Point count</option></select></label>
        {interpolation.strategy === "frequency-interval" && <label>Interval (Hz)<input min="0" onChange={(event) => setProject((current) => ({ ...current, interpolation: { ...current.interpolation, frequencyIntervalHz: Number(event.target.value) } }))} step="any" type="number" value={interpolation.frequencyIntervalHz ?? ""} /></label>}
        {interpolation.strategy === "point-count" && <label>Common point count<input min="2" onChange={(event) => setProject((current) => ({ ...current, interpolation: { ...current.interpolation, pointCount: Number(event.target.value) } }))} type="number" value={interpolation.pointCount ?? 200} /></label>}
        <label>Complex S21/S12 threshold<input min="0" onChange={(event) => updateQualityControl({ reciprocityComplexTolerance: Number(event.target.value) })} step="any" type="number" value={project.qualityControl.reciprocityComplexTolerance ?? 0.05} /></label><label>Forward/reverse threshold (dB)<input min="0" onChange={(event) => updateQualityControl({ directionalDifferenceToleranceDb: Number(event.target.value) })} step="any" type="number" value={project.qualityControl.directionalDifferenceToleranceDb ?? 3} /></label><label>Decomposition tolerance (dB)<input min="0" onChange={(event) => updateQualityControl({ decompositionToleranceDb: Number(event.target.value) })} step="any" type="number" value={project.qualityControl.decompositionToleranceDb ?? 1e-10} /></label>
      </div></details>
    </section>}

    {selected.length === 0 ? <section className="emi-panel emi-empty-state"><h2>Select a successfully parsed file to analyze</h2><p>Plots, statistics, quality checks, tabular data, and exports will appear here.</p></section> : <>
      <section className="emi-panel" aria-label="Summary statistics">
        <div className="emi-section-heading"><div><h2>3. Summary statistics</h2><p>Each file remains independent. Invalid metric values are excluded and counted explicitly.</p></div></div>
        <div className="emi-table-scroll"><table className="emi-table"><thead><tr><th>File</th><th>Direction</th><th>Metric</th><th>Mean</th><th>Median</th><th>Std. dev.</th><th>Minimum</th><th>Maximum</th><th>Valid points</th></tr></thead><tbody>
          {selected.flatMap((file) => directions.flatMap((direction) => EMI_METRICS.map((metric) => {
            const stat = calculateEmiStatistics(file.calculation[direction], metric, range);
            return <tr key={`${file.id}-${direction}-${metric}`}><td>{file.filename}</td><td>{directionLabel(direction)}</td><td>{metric}</td><td>{formatNumber(stat.mean)}</td><td>{formatNumber(stat.median)}</td><td>{formatNumber(stat.standardDeviation)}</td><td>{formatNumber(stat.minimum)}</td><td>{formatNumber(stat.maximum)}</td><td>{stat.validPointCount}/{stat.count} ({formatNumber(stat.validPointPercentage, 4)}%){stat.excludedPointCount > 0 && <span className="emi-excluded"> · {stat.excludedPointCount} excluded</span>}</td></tr>;
          })))}
        </tbody></table></div>
      </section>

      {project.groups.length > 0 && <section className="emi-panel" aria-label="Replicate band summaries">
        <div className="emi-section-heading"><div><h2>Replicate band summaries</h2><p>Specimen-first is the default comparison of independent specimens. Pooled-point summaries are shown separately because specimens with more valid points receive more weight.</p></div></div>
        <div className="emi-table-scroll"><table className="emi-table"><thead><tr><th>Group</th><th>Direction</th><th>Metric</th><th>Approach</th><th>Mean</th><th>Median</th><th>Sample SD</th><th>95% CI</th><th>Valid specimens</th><th>Valid points</th><th>Avg. valid %</th></tr></thead><tbody>{project.groups.flatMap((group) => directions.flatMap((direction) => {
          const members = group.datasetIds.flatMap((id) => { const file = ready.find((entry) => entry.id === id); return file ? [{ id, points: file.calculation[direction] }] : []; });
          return EMI_METRICS.flatMap((metric) => [calculateSpecimenFirstBandSummary(members, metric, range), calculatePooledPointBandSummary(members, metric, range)]).map((summary) => <tr key={`${group.id}-${direction}-${summary.metric}-${summary.approach}`}><td>{group.name}</td><td>{directionLabel(direction)}</td><td>{summary.metric}</td><td>{summary.approach === "specimen-first" ? "Specimen-first" : "Pooled points"}</td><td>{formatNumber(summary.mean)}</td><td>{formatNumber(summary.median)}</td><td>{formatNumber(summary.sampleStandardDeviation)}</td><td>{summary.confidenceInterval95 ? `${formatNumber(summary.confidenceInterval95.lower)} to ${formatNumber(summary.confidenceInterval95.upper)}` : "Insufficient replicates"}</td><td>{summary.validSpecimenCount}/{summary.specimenCount}</td><td>{summary.validPointCount}</td><td>{formatNumber(summary.averageValidPointPercentage)}%</td></tr>);
        }))}</tbody></table></div>
      </section>}

      <section className="emi-panel" aria-label="EMI comparison workspace">
        <div className="emi-section-heading"><div><h2>Comparison workspace</h2><p>Choose comparison entries independently of plot selection. Normalized SET is a derived screening normalization, not a directly measured shielding quantity. No automatic scientific ranking is applied.</p></div><label>Sort by<select className="ui-select" onChange={(event) => setComparisonSort(event.target.value as typeof comparisonSort)} value={comparisonSort}><option value="name">Name</option><option value="group">Group</option>{EMI_METRICS.map((metric) => <option key={metric} value={metric}>{metric} mean</option>)}<option value="thickness">Thickness</option><option value="arealDensity">Areal density</option><option value="validity">Valid-point percentage</option><option value="warnings">Warning count</option></select></label></div>
        <div className="emi-table-scroll"><table className="emi-table"><thead><tr><th>Compare</th><th>Name</th><th>Group</th><th>Type</th><th>Direction</th><th>SET mean</th><th>SER mean</th><th>SEA mean</th><th>R mean</th><th>T mean</th><th>A mean</th><th>SET std. dev.</th><th>Valid %</th><th>Replicates</th><th>Thickness</th><th>Areal density</th><th>SET / thickness (dB/mm)</th><th>SET / areal density (dB/(kg/m²))</th><th>QC</th></tr></thead><tbody>{comparisonEntries.map((entry) => <tr className={excludedComparisonIds.has(entry.id) ? "emi-comparison-excluded" : undefined} key={entry.id}><td><input aria-label={`Compare ${entry.name} ${entry.direction}`} checked={!excludedComparisonIds.has(entry.id)} onChange={() => setExcludedComparisonIds((current) => { const next = new Set(current); if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id); return next; })} type="checkbox" /></td><td>{entry.name}</td><td>{entry.group}</td><td>{entry.aggregateType}</td><td>{entry.direction}</td>{EMI_METRICS.map((metric) => <td key={metric}>{formatNumber(entry.values[metric].mean)}</td>)}<td>{formatNumber(entry.values.SET.standardDeviation)}</td><td>{formatNumber(entry.validity)}%</td><td>{entry.replicateCount}</td><td>{formatNumber(entry.thickness)} {entry.thicknessUnit}</td><td>{formatNumber(entry.arealDensity)} {entry.arealDensityUnit}</td><td>{formatNumber(entry.normalizedThickness)}</td><td>{formatNumber(entry.normalizedAreal)}</td><td>{entry.warningCount === 0 ? "No warnings" : `${entry.warningCount} warnings`}</td></tr>)}</tbody></table></div>
      </section>

      <section className="emi-panel" aria-label="Advanced plot formatting">
        <details className="emi-advanced-panel"><summary>Publication plot formatting</summary><p>Formatting changes presentation only and never alters analysis data.</p><div className="emi-format-grid">
          <label>Preset<select className="ui-select" onChange={(event) => { const preset = event.target.value as EmiPlotConfiguration["preset"]; const dimensions = preset === "presentation" ? [1600, 900] : preset === "single-column" ? [900, 700] : preset === "double-column" ? [1400, 850] : [1200, 800]; setProject((current) => ({ ...current, plot: { ...current.plot, preset, figureWidth: dimensions[0] as number, figureHeight: dimensions[1] as number, aspectRatio: preset === "presentation" ? "16:9" : "3:2" } })); }} value={project.plot.preset}><option value="screen">Screen analysis</option><option value="presentation">Presentation</option><option value="single-column">Single-column paper figure</option><option value="double-column">Double-column paper figure</option></select></label>
          <label>Plot title<input onChange={(event) => setProject((current) => ({ ...current, plot: { ...current.plot, title: event.target.value } }))} value={project.plot.title} /></label><label>Subtitle<input onChange={(event) => setProject((current) => ({ ...current, plot: { ...current.plot, subtitle: event.target.value } }))} value={project.plot.subtitle} /></label><label>X-axis label<input onChange={(event) => setProject((current) => ({ ...current, plot: { ...current.plot, xAxisLabel: event.target.value } }))} value={project.plot.xAxisLabel} /></label><label>Shielding Y-axis label<input onChange={(event) => setProject((current) => ({ ...current, plot: { ...current.plot, shieldingYAxisLabel: event.target.value } }))} value={project.plot.shieldingYAxisLabel} /></label><label>Power Y-axis label<input onChange={(event) => setProject((current) => ({ ...current, plot: { ...current.plot, powerYAxisLabel: event.target.value } }))} value={project.plot.powerYAxisLabel} /></label>
          <label>Legend position<select className="ui-select" onChange={(event) => setProject((current) => ({ ...current, plot: { ...current.plot, legendPosition: event.target.value as EmiPlotConfiguration["legendPosition"] } }))} value={project.plot.legendPosition}><option value="top">Top</option><option value="right">Right</option><option value="bottom">Bottom</option><option value="none">Hidden</option></select></label><label>Uncertainty<select className="ui-select" onChange={(event) => setProject((current) => ({ ...current, plot: { ...current.plot, uncertaintyBand: event.target.value as EmiPlotConfiguration["uncertaintyBand"] } }))} value={project.plot.uncertaintyBand}><option value="none">None</option><option value="standard-deviation">Sample standard deviation</option><option value="confidence-95">95% confidence interval</option></select></label>
          <label>Frequency axis<select className="ui-select" onChange={(event) => setProject((current) => ({ ...current, plot: { ...current.plot, xScale: event.target.value as EmiPlotConfiguration["xScale"] } }))} value={project.plot.xScale}><option value="linear">Linear</option><option value="logarithmic">Logarithmic</option></select></label><label>Line style<select className="ui-select" onChange={(event) => setProject((current) => ({ ...current, plot: { ...current.plot, lineStyle: event.target.value as EmiPlotConfiguration["lineStyle"] } }))} value={project.plot.lineStyle}><option value="mixed">Distinguish means with dashes</option><option value="solid">Solid</option><option value="dashed">Dashed</option></select></label>
          <label>Shielding Y minimum<input onChange={(event) => setProject((current) => ({ ...current, plot: { ...current.plot, shieldingYMinimum: event.target.value ? Number(event.target.value) : undefined } }))} step="any" type="number" value={project.plot.shieldingYMinimum ?? ""} /></label><label>Shielding Y maximum<input onChange={(event) => setProject((current) => ({ ...current, plot: { ...current.plot, shieldingYMaximum: event.target.value ? Number(event.target.value) : undefined } }))} step="any" type="number" value={project.plot.shieldingYMaximum ?? ""} /></label><label>Power Y minimum<input onChange={(event) => setProject((current) => ({ ...current, plot: { ...current.plot, powerYMinimum: event.target.value ? Number(event.target.value) : undefined } }))} step="any" type="number" value={project.plot.powerYMinimum ?? ""} /></label><label>Power Y maximum<input onChange={(event) => setProject((current) => ({ ...current, plot: { ...current.plot, powerYMaximum: event.target.value ? Number(event.target.value) : undefined } }))} step="any" type="number" value={project.plot.powerYMaximum ?? ""} /></label>
          <label>Figure width (px)<input min="400" onChange={(event) => setProject((current) => ({ ...current, plot: { ...current.plot, figureWidth: Number(event.target.value) } }))} type="number" value={project.plot.figureWidth} /></label><label>Figure height (px)<input min="300" onChange={(event) => setProject((current) => ({ ...current, plot: { ...current.plot, figureHeight: Number(event.target.value) } }))} type="number" value={project.plot.figureHeight} /></label><label>PNG scale<select className="ui-select" onChange={(event) => setProject((current) => ({ ...current, plot: { ...current.plot, rasterScale: Number(event.target.value) as EmiPlotConfiguration["rasterScale"] } }))} value={project.plot.rasterScale}><option value="1">1×</option><option value="2">2×</option><option value="3">3×</option><option value="4">4×</option></select></label>
          <label className="emi-checkbox-label"><input checked={project.plot.showIndividualReplicates} onChange={(event) => setProject((current) => ({ ...current, plot: { ...current.plot, showIndividualReplicates: event.target.checked } }))} type="checkbox" />Show individual replicate traces</label><label className="emi-checkbox-label"><input checked={project.plot.medianVisibility} onChange={(event) => setProject((current) => ({ ...current, plot: { ...current.plot, medianVisibility: event.target.checked } }))} type="checkbox" />Show group median traces</label><label className="emi-checkbox-label"><input checked={project.plot.gridVisibility} onChange={(event) => setProject((current) => ({ ...current, plot: { ...current.plot, gridVisibility: event.target.checked } }))} type="checkbox" />Show grid</label><label className="emi-checkbox-label"><input checked={project.plot.markerVisibility} onChange={(event) => setProject((current) => ({ ...current, plot: { ...current.plot, markerVisibility: event.target.checked } }))} type="checkbox" />Show markers</label><label className="emi-checkbox-label"><input checked={project.plot.lightBackground} onChange={(event) => setProject((current) => ({ ...current, plot: { ...current.plot, lightBackground: event.target.checked } }))} type="checkbox" />Light export background</label>
        </div></details>
      </section>

      <EmiPlot bands={bands(["SET", "SER", "SEA"])} exportName="emi-shielding-effectiveness" format={project.plot} maximumHz={range.maximumHz} minimumHz={range.minimumHz} title="4. Shielding effectiveness" traces={traces(["SET", "SER", "SEA"])} unit={unit} warningFrequenciesHz={selectedWarningFrequencies} yLabel="dB" />
      <EmiPlot bands={bands(["R", "T", "A"])} exportName="emi-power-coefficients" format={project.plot} maximumHz={range.maximumHz} minimumHz={range.minimumHz} title="5. Incident-power coefficients" traces={traces(["R", "T", "A"])} unit={unit} warningFrequenciesHz={selectedWarningFrequencies} yLabel="Dimensionless" />

      <section className="emi-panel" aria-label="Quality control">
        <div className="emi-section-heading"><div><h2>6. Quality-control report</h2><p>Warnings are screening results only; the software does not alter measurements or determine their physical cause.</p></div></div>
        <p className="emi-causal-note">Flagged values can indicate calibration uncertainty, fixture or reference-plane effects, instrument drift, or malformed data. Review the measurement context before drawing physical conclusions.</p>
        {selected.map((file) => <article className="emi-qc-file" key={file.id}><h3>{file.filename} · {file.issues.length} warning{file.issues.length === 1 ? "" : "s"}</h3>
          {[...directions, "shared" as const].map((group) => {
            const groupIssues = file.issues.filter((issue) => group === "shared" ? issue.direction === undefined : issue.direction === group);
            if (group === "shared" && groupIssues.length === 0) return null;
            return <div className="emi-qc-group" key={group}><h4>{group === "shared" ? "File-wide and direction-comparison checks" : directionLabel(group)}</h4>
              {groupIssues.length === 0 && <p className="emi-success-text">No direction-specific warnings.</p>}
              {aggregateEmiIssues(groupIssues).map((aggregate) => <details key={aggregate.code}><summary><strong>{aggregate.code.replaceAll("_", " ")}</strong><span>{aggregate.count} affected{aggregate.minimumFrequencyHz !== undefined ? ` · ${formatFrequency(aggregate.minimumFrequencyHz, unit)}${aggregate.maximumFrequencyHz !== aggregate.minimumFrequencyHz ? ` – ${formatFrequency(aggregate.maximumFrequencyHz, unit)}` : ""}` : ""}{aggregate.maximumViolation !== undefined ? ` · max violation ${formatNumber(aggregate.maximumViolation, 7)}` : ""}</span></summary><ul>{aggregate.issues.map((issue, index) => <li key={`${issue.rowNumber ?? issue.frequencyHz}-${index}`}><span>{issue.frequencyHz !== undefined ? formatFrequency(issue.frequencyHz, unit) : issue.rowNumber ? `Source row ${issue.rowNumber}` : "File level"}</span> — {issue.message}</li>)}</ul></details>)}
            </div>;
          })}
          {file.issues.length === 0 && <p className="emi-success-text">No validation warnings were produced with the configured screening thresholds.</p>}
        </article>)}
      </section>

      <section className="emi-panel" aria-label="Data table">
        <div className="emi-section-heading"><div><h2>7. Tabular inspection</h2><p>Raw complex values and calculated metrics for one selected file and direction.</p></div></div>
        <div className="emi-table-controls"><label>File<select className="ui-select" onChange={(event) => setTableFileId(event.target.value)} value={tableFile?.id ?? ""}>{selected.map((file) => <option key={file.id} value={file.id}>{file.filename}</option>)}</select></label><label>Direction<select className="ui-select" onChange={(event) => setTableDirection(event.target.value as EmiDirection)} value={tableDirection}><option value="forward">Forward (S11 / S21)</option><option value="reverse">Reverse (S22 / S12)</option></select></label></div>
        <div className="emi-table-scroll emi-data-table-scroll"><table className="emi-table"><thead><tr><th>Frequency ({unit})</th><th>Reflection Re</th><th>Reflection Im</th><th>Transmission Re</th><th>Transmission Im</th><th>R</th><th>T</th><th>A</th><th>SET (dB)</th><th>SER (dB)</th><th>SEA (dB)</th><th>Status</th><th>Validation messages</th></tr></thead><tbody>{tableRows.map((row, index) => <tr key={`${row.frequencyHz}-${index}`}><td>{formatNumber(row.frequencyHz / factor, 10)}</td><td>{formatNumber(row.reflectionReal, 10)}</td><td>{formatNumber(row.reflectionImaginary, 10)}</td><td>{formatNumber(row.transmissionReal, 10)}</td><td>{formatNumber(row.transmissionImaginary, 10)}</td><td>{formatNumber(row.R, 10)}</td><td>{formatNumber(row.T, 10)}</td><td>{formatNumber(row.A, 10)}</td><td>{formatNumber(row.SET, 10)}</td><td>{formatNumber(row.SER, 10)}</td><td>{formatNumber(row.SEA, 10)}</td><td><span className={`emi-validity emi-validity-${row.validity}`}>{row.validity}</span></td><td>{row.validationCodes.length > 0 ? <details><summary>{row.validationCodes.join(", ")}</summary><ul>{row.validationMessages.map((message, messageIndex) => <li key={messageIndex}>{message}</li>)}</ul></details> : "—"}</td></tr>)}</tbody></table></div>
        <p className="emi-supporting">Showing {tableRows.length} points in the selected frequency band.</p>
      </section>

      <section className="emi-panel" aria-label="CSV exports">
        <div className="emi-section-heading"><div><h2>8. Analysis notes and exports</h2><p>Blank shielding cells represent undefined metrics. Project and manifest JSON formats are versioned.</p></div></div>
        <label className="emi-project-description">Project notes<textarea onChange={(event) => setProject((current) => ({ ...current, notes: event.target.value }))} rows={4} value={project.notes} /></label>
        <div className="emi-export-actions"><button className="ui-button ui-button-primary" onClick={() => downloadCsv("emi-processed-data.csv", createProcessedEmiCsv(selected, directions))} type="button">Export processed data CSV</button><button className="ui-button" onClick={() => downloadCsv("emi-summary-statistics.csv", createSummaryStatisticsCsv(selected, directions, range))} type="button">Export summary statistics CSV</button><button className="ui-button" disabled={project.groups.length === 0} onClick={() => downloadCsv("emi-replicate-pointwise-summary.csv", createReplicatePointwiseCsv(projectSnapshot(), ready, directions, interpolation))} type="button">Export replicate pointwise CSV</button><button className="ui-button" onClick={() => downloadCsv("emi-band-summary.csv", createBandSummaryCsv(projectSnapshot(), ready, directions, range))} type="button">Export band summary CSV</button><button className="ui-button" onClick={() => downloadContent("emi-analysis-manifest.json", createEmiAnalysisManifest(projectSnapshot()), "application/json;charset=utf-8")} type="button">Export analysis manifest</button><button className="ui-button" onClick={() => { const figures = [...document.querySelectorAll("svg[data-emi-plot]")].map((element) => new XMLSerializer().serializeToString(element)); downloadContent("emi-analysis-summary.html", createEmiAnalysisSummaryHtml(projectSnapshot(), figures), "text/html;charset=utf-8"); }} type="button">Export analysis summary HTML</button></div>
      </section>
    </>}
  </div>;
}
