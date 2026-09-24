"use client";

import { useMemo, useRef, useState } from "react";
import { smoothSeries, type EmiFrequencyRange, type EmiMetric } from "@max-stoich/chemistry-engine";
import { createMetricSegments } from "@/lib/emi/analyzer";
import { APPLICATION_VERSION } from "@/lib/release/version";
import {
  applyPublicationPalette,
  carryPublicationSeriesStyles,
  convertFigureLength,
  createPublicationFigureSpec,
  figureRasterPixels,
  parsePublicationFigureSpec,
  publicationSeriesCsv,
  PUBLICATION_DASH_SEQUENCE,
  PUBLICATION_FONT_OPTIONS,
  PUBLICATION_MARKER_SEQUENCE,
  serializePublicationFigureSpec,
  validatePublicationAxes,
  type FigureFontRole,
  type PublicationFigureSpec,
  type PublicationResolvedSeries,
  type PublicationSeriesSpec,
} from "@/lib/emi/publication-figure";
import type { EmiPlotTrace } from "./emi-plot";
import { PublicationFigurePreview, type PublicationFigurePreviewHandle } from "./publication-figure-preview";

const PRESET_STORAGE_KEY = "maxcalc.emi.publication-figure-presets.v1";
const METRICS: readonly EmiMetric[] = ["SET", "SER", "SEA", "R", "T", "A"];
const FONT_ROLE_LABELS: Readonly<Record<FigureFontRole, string>> = { title: "Title", subtitle: "Subtitle", axisTitle: "Axis titles", tick: "Tick labels", legend: "Legend", annotation: "Annotations", panelLabel: "Panel label" };

function download(filename: string, content: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url);
}

function baseSeries(trace: EmiPlotTrace, includeDirection: boolean): Omit<PublicationSeriesSpec, "color" | "dash" | "marker" | "zOrder"> {
  const parts = trace.label.split(" · ");
  if (parts.at(-1) === trace.metric) parts.pop();
  if (parts.at(-1)?.toLowerCase() === trace.direction) {
    if (!includeDirection) parts.pop();
    else parts[parts.length - 1] = trace.direction === "forward" ? "Fwd" : trace.direction === "reverse" ? "Rev" : parts.at(-1)!;
  }
  return { id: trace.id, datasetId: trace.datasetId, direction: trace.direction, metric: trace.metric, label: parts.join(" · ") || trace.label, visible: true, widthPt: 1.25, markerSizePt: 4, markerOpen: false, markerMaxDisplayed: 24, opacity: 1, smoothing: { enabled: false, windowSize: 5 } };
}

function newSpec(metric: EmiMetric, unit: "GHz" | "Hz", traces: readonly EmiPlotTrace[], engineVersion: string) {
  const metricTraces = traces.filter((trace) => trace.metric === metric);
  const includeDirection = new Set(metricTraces.map((trace) => trace.direction)).size > 1;
  return createPublicationFigureSpec({ metric, frequencyUnit: unit, applicationVersion: APPLICATION_VERSION, engineVersion, series: metricTraces.map((trace) => baseSeries(trace, includeDirection)) });
}

function readPresets(): PublicationFigureSpec[] {
  try { const value = JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY) ?? "[]"); return Array.isArray(value) ? value.flatMap((entry) => { try { return [parsePublicationFigureSpec(JSON.stringify(entry))]; } catch { return []; } }) : []; } catch { return []; }
}

export function PublicationFigureEditor({ traces, range, unit, engineVersion }: Readonly<{ traces: readonly EmiPlotTrace[]; range: EmiFrequencyRange; unit: "GHz" | "Hz"; engineVersion: string }>) {
  const [open, setOpen] = useState(false);
  const [spec, setSpec] = useState<PublicationFigureSpec>(() => newSpec("SET", unit, traces, engineVersion));
  const [presets, setPresets] = useState<readonly PublicationFigureSpec[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [status, setStatus] = useState("Publication defaults are ready.");
  const [grayscalePreview, setGrayscalePreview] = useState(false);
  const previewRef = useRef<PublicationFigurePreviewHandle>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const relevantTraces = useMemo(() => new Map(traces.map((trace) => [trace.id, trace])), [traces]);
  const axisErrors = validatePublicationAxes(spec);
  const indistinguishableSeries = useMemo(() => {
    const signatures = new Set<string>();
    for (const series of spec.series.filter((entry) => entry.visible)) {
      const signature = `${series.color.toLowerCase()}|${series.dash}|${series.marker}`;
      if (signatures.has(signature)) return true;
      signatures.add(signature);
    }
    return false;
  }, [spec.series]);
  const legendLabelWarning = useMemo(() => {
    if (!spec.legend.visible) return undefined;
    const visible = spec.series.filter((entry) => entry.visible);
    const longest = Math.max(0, ...visible.map((entry) => entry.label.length));
    const limit = spec.legend.position === "outside-right" ? 42 : spec.legend.position.startsWith("outside-") ? 60 : 48;
    if (longest > limit) return "A visible legend label is unusually long and may clip at this figure size. Shorten the display label, widen the figure, or choose an outside top/bottom legend.";
    const estimatedRows = Math.ceil(visible.length / Math.max(1, spec.legend.columns));
    if ((spec.legend.position === "outside-top" || spec.legend.position === "outside-bottom") && estimatedRows > 4) return "This legend may be too tall for the selected figure size. Increase target columns, shorten labels, or enlarge the figure.";
    if (spec.legend.position === "outside-right" && visible.length > 8) return "A tall outside-right legend may not fit this figure height. Shorten labels, enlarge the figure, or use an outside top/bottom legend.";
    return undefined;
  }, [spec.legend.columns, spec.legend.position, spec.legend.visible, spec.series]);
  const resolved = useMemo<PublicationResolvedSeries[]>(() => spec.series.flatMap((series) => {
    const trace = relevantTraces.get(series.id); if (!trace) return [];
    const segments = createMetricSegments(trace.points, trace.metric, range);
    const factor = spec.frequencyUnit === "GHz" ? 1e9 : 1;
    const x: number[] = []; const y: (number | null)[] = [];
    segments.forEach((segment, segmentIndex) => {
      const display = series.smoothing.enabled ? smoothSeries(segment.map((point) => ({ x: point.frequencyHz, y: point.value })), series.smoothing) : segment.map((point) => ({ x: point.frequencyHz, y: point.value }));
      if (segmentIndex > 0) { x.push((segment[0]?.frequencyHz ?? 0) / factor); y.push(null); }
      display.forEach((point) => { x.push(point.x / factor); y.push(point.y ?? null); });
    });
    return [{ id: series.id, x, y }];
  }), [range, relevantTraces, spec.frequencyUnit, spec.series]);

  const updateSeries = (id: string, update: Partial<PublicationSeriesSpec>) => setSpec((current) => ({ ...current, series: current.series.map((series) => series.id === id ? { ...series, ...update } : series) }));
  const refreshSeries = () => setSpec((current) => {
    const fresh = newSpec(current.metric, current.frequencyUnit, traces, engineVersion);
    const existing = new Map(current.series.map((series) => [series.id, series]));
    const series = fresh.series.map((entry, index) => {
      const prior = existing.get(entry.id);
      return prior ? { ...entry, ...prior, datasetId: entry.datasetId, direction: entry.direction, metric: entry.metric } : { ...entry, zOrder: index };
    });
    return { ...current, series };
  });
  const setFigureWidth = (width: number) => setSpec((current) => {
    if (!Number.isFinite(width) || width <= 0 || current.geometry.height <= 0) return current;
    const ratio = current.geometry.width / current.geometry.height;
    return { ...current, geometry: { ...current.geometry, width, height: current.geometry.aspectRatioLocked ? width / ratio : current.geometry.height } };
  });
  const setFigureHeight = (height: number) => setSpec((current) => {
    if (!Number.isFinite(height) || height <= 0 || current.geometry.width <= 0) return current;
    const ratio = current.geometry.width / current.geometry.height;
    return { ...current, geometry: { ...current.geometry, height, width: current.geometry.aspectRatioLocked ? height * ratio : current.geometry.width } };
  });
  const setFigureUnit = (unitValue: PublicationFigureSpec["geometry"]["unit"]) => setSpec((current) => ({
    ...current,
    geometry: {
      ...current.geometry,
      width: Number(convertFigureLength(current.geometry.width, current.geometry.unit, unitValue).toPrecision(12)),
      height: Number(convertFigureLength(current.geometry.height, current.geometry.unit, unitValue).toPrecision(12)),
      unit: unitValue,
    },
  }));
  const setMetric = (metric: EmiMetric) => setSpec((current) => {
    const replacement = newSpec(metric, current.frequencyUnit, traces, engineVersion);
    return { ...replacement, id: current.id, name: `${metric} publication figure`, geometry: current.geometry, fonts: current.fonts, legend: current.legend, palette: current.palette, series: carryPublicationSeriesStyles(current.series, replacement.series) };
  });
  const savePreset = () => {
    const next = [...presets.filter((entry) => entry.id !== spec.id), spec]; localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(next)); setPresets(next); setSelectedPresetId(spec.id); setStatus(`Saved “${spec.name}” in this browser.`);
  };
  const duplicatePreset = () => setSpec((current) => ({ ...current, id: crypto.randomUUID(), name: `${current.name} (copy)` }));
  const toggleOpen = () => {
    if (!open) {
      setPresets(readPresets());
      setSpec((current) => current.series.some((series) => traces.some((trace) => trace.id === series.id)) ? current : newSpec(current.metric, unit, traces, engineVersion));
    }
    setOpen(!open);
  };
  const reset = () => { setSpec(newSpec(spec.metric, unit, traces, engineVersion)); setStatus("Publication defaults restored."); };
  const getSvg = async () => { const svg = await previewRef.current?.getSvg(); if (!svg) throw new Error("Publication preview is not ready."); return svg; };
  const exportSvg = async () => { try { const svg = await getSvg(); download(`${spec.name}.svg`, svg, "image/svg+xml;charset=utf-8"); setStatus("Vector SVG exported from the publication preview."); } catch (error) { setStatus(error instanceof Error ? error.message : "SVG export failed."); } };
  const exportPng = async () => { try { const svg = await getSvg(); const pixels = figureRasterPixels(spec); const response = await fetch("/api/emi/publication/png", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ svg, ...pixels, background: spec.geometry.background }) }); if (!response.ok) throw new Error((await response.json()).error ?? "PNG export failed."); download(`${spec.name}-${spec.geometry.dpi}dpi.png`, await response.blob(), "image/png"); setStatus(`PNG exported at ${pixels.width} × ${pixels.height} pixels (${spec.geometry.dpi} DPI).`); } catch (error) { setStatus(error instanceof Error ? error.message : "PNG export failed."); } };

  return <section className="emi-panel emi-publication-editor" aria-label="Publication figure editor">
    <div className="emi-section-heading"><div><h2>Publication Figure</h2><p>Create a paper-ready figure from the current EMI data without changing scientific calculations.</p></div><button className="ui-button ui-button-primary" onClick={toggleOpen} type="button">{open ? "Close editor" : "Open figure editor"}</button></div>
    {!open ? <p className="emi-supporting">The editor loads its scientific plotting engine only when opened.</p> : <div className="emi-publication-workspace">
      <div className="emi-publication-controls">
        <div className="emi-publication-toolbar"><button className="ui-button ui-button-compact" onClick={reset} type="button">Publication Default</button><button className="ui-button ui-button-compact" onClick={() => { refreshSeries(); setStatus("Series refreshed from the currently selected measurement files."); }} type="button">Refresh series</button><button className="ui-button ui-button-compact" onClick={savePreset} type="button">Save preset</button><button className="ui-button ui-button-compact" onClick={duplicatePreset} type="button">Duplicate</button><select aria-label="Load saved publication preset" className="ui-select" onChange={(event) => { const loaded = presets.find((entry) => entry.id === event.target.value); if (loaded) { setSpec(loaded); setSelectedPresetId(loaded.id); setStatus(`Loaded “${loaded.name}”.`); } }} value={selectedPresetId}><option value="">Load saved preset…</option>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select><label className="emi-checkbox-label"><input checked={grayscalePreview} type="checkbox" onChange={(event) => setGrayscalePreview(event.target.checked)} />Grayscale preview</label></div>

        <details open><summary>Figure</summary><div className="emi-format-grid">
          <label>Figure name<input value={spec.name} onChange={(event) => setSpec((current) => ({ ...current, name: event.target.value }))} /></label>
          <label>EMI quantity<select className="ui-select" value={spec.metric} onChange={(event) => setMetric(event.target.value as EmiMetric)}>{METRICS.map((metric) => <option key={metric}>{metric}</option>)}</select></label>
          <label>Preset<select className="ui-select" onChange={(event) => { const preset = event.target.value; const size = preset === "single" ? [3.5, 2.75] : preset === "one-half" ? [5.25, 3.6] : [7.2, 4.6]; setSpec((current) => ({ ...current, geometry: { ...current.geometry, width: size[0]!, height: size[1]!, unit: "in" } })); }} defaultValue="single"><option value="single">Single column</option><option value="one-half">1.5 column</option><option value="double">Double column</option></select></label>
          <label>Width<input min="0.1" step="0.01" type="number" value={spec.geometry.width} onChange={(event) => setFigureWidth(Number(event.target.value))} /></label>
          <label>Height<input min="0.1" step="0.01" type="number" value={spec.geometry.height} onChange={(event) => setFigureHeight(Number(event.target.value))} /></label>
          <label>Units<select className="ui-select" value={spec.geometry.unit} onChange={(event) => setFigureUnit(event.target.value as PublicationFigureSpec["geometry"]["unit"])}><option value="in">inches</option><option value="mm">millimeters</option><option value="cm">centimeters</option><option value="px">pixels</option></select></label>
          <label className="emi-checkbox-label"><input checked={spec.geometry.aspectRatioLocked} type="checkbox" onChange={(event) => setSpec((current) => ({ ...current, geometry: { ...current.geometry, aspectRatioLocked: event.target.checked } }))} />Lock aspect ratio</label>
          <label>Background<select className="ui-select" value={spec.geometry.background} onChange={(event) => setSpec((current) => ({ ...current, geometry: { ...current.geometry, background: event.target.value as "white" | "transparent" } }))}><option value="white">White</option><option value="transparent">Transparent</option></select></label>
        </div><details className="emi-publication-nested"><summary>Margins</summary><div className="emi-format-grid">{(["top", "right", "bottom", "left"] as const).map((side) => <label key={side}>{side[0]!.toUpperCase() + side.slice(1)} (px)<input min="0" step="1" type="number" value={spec.geometry.margin[side]} onChange={(event) => setSpec((current) => ({ ...current, geometry: { ...current.geometry, margin: { ...current.geometry.margin, [side]: Number(event.target.value) } } }))} /></label>)}</div></details></details>

        <details><summary>Text</summary><div className="emi-format-grid">
          <label className="emi-checkbox-label"><input checked={spec.text.titleVisible} type="checkbox" onChange={(event) => setSpec((current) => ({ ...current, text: { ...current.text, titleVisible: event.target.checked } }))} />Show title</label><label>Title<textarea rows={2} value={spec.text.title} onChange={(event) => setSpec((current) => ({ ...current, text: { ...current.text, title: event.target.value } }))} /></label>
          <label className="emi-checkbox-label"><input checked={spec.text.subtitleVisible} type="checkbox" onChange={(event) => setSpec((current) => ({ ...current, text: { ...current.text, subtitleVisible: event.target.checked } }))} />Show subtitle</label><label>Subtitle<textarea rows={2} value={spec.text.subtitle} onChange={(event) => setSpec((current) => ({ ...current, text: { ...current.text, subtitle: event.target.value } }))} /></label>
          <label className="emi-checkbox-label"><input checked={spec.text.panelLabelVisible} type="checkbox" onChange={(event) => setSpec((current) => ({ ...current, text: { ...current.text, panelLabelVisible: event.target.checked } }))} />Show panel label</label><label>Panel label<input value={spec.text.panelLabel} onChange={(event) => setSpec((current) => ({ ...current, text: { ...current.text, panelLabel: event.target.value } }))} /></label>
          <label>Title alignment<select className="ui-select" value={spec.text.titleAlignment} onChange={(event) => setSpec((current) => ({ ...current, text: { ...current.text, titleAlignment: event.target.value as PublicationFigureSpec["text"]["titleAlignment"] } }))}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label>Title spacing (pt)<input min="0" step="0.5" type="number" value={spec.text.titleSpacingPt} onChange={(event) => setSpec((current) => ({ ...current, text: { ...current.text, titleSpacingPt: Number(event.target.value) } }))} /></label>
          <label>Subtitle alignment<select className="ui-select" value={spec.text.subtitleAlignment} onChange={(event) => setSpec((current) => ({ ...current, text: { ...current.text, subtitleAlignment: event.target.value as PublicationFigureSpec["text"]["subtitleAlignment"] } }))}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label><label>Subtitle spacing (pt)<input min="0" step="0.5" type="number" value={spec.text.subtitleSpacingPt} onChange={(event) => setSpec((current) => ({ ...current, text: { ...current.text, subtitleSpacingPt: Number(event.target.value) } }))} /></label>
          <label>Panel X (normalized)<input step="0.01" type="number" value={spec.text.panelLabelX} onChange={(event) => setSpec((current) => ({ ...current, text: { ...current.text, panelLabelX: Number(event.target.value) } }))} /></label><label>Panel Y (normalized)<input step="0.01" type="number" value={spec.text.panelLabelY} onChange={(event) => setSpec((current) => ({ ...current, text: { ...current.text, panelLabelY: Number(event.target.value) } }))} /></label>
        </div><div className="emi-publication-fonts">{(Object.keys(FONT_ROLE_LABELS) as FigureFontRole[]).map((role) => <div className="emi-publication-font-row" key={role}><strong>{FONT_ROLE_LABELS[role]}</strong><select aria-label={`${FONT_ROLE_LABELS[role]} font family`} className="ui-select" value={spec.fonts[role].family} onChange={(event) => setSpec((current) => ({ ...current, fonts: { ...current.fonts, [role]: { ...current.fonts[role], family: event.target.value } } }))}>{PUBLICATION_FONT_OPTIONS.map((family) => <option key={family}>{family}</option>)}</select><label>pt<input min="4" max="96" step="0.5" type="number" value={spec.fonts[role].sizePt} onChange={(event) => setSpec((current) => ({ ...current, fonts: { ...current.fonts, [role]: { ...current.fonts[role], sizePt: Number(event.target.value) } } }))} /></label><label className="emi-checkbox-label"><input checked={spec.fonts[role].weight === "bold"} type="checkbox" onChange={(event) => setSpec((current) => ({ ...current, fonts: { ...current.fonts, [role]: { ...current.fonts[role], weight: event.target.checked ? "bold" : "normal" } } }))} />Bold</label><label className="emi-checkbox-label"><input checked={spec.fonts[role].style === "italic"} type="checkbox" onChange={(event) => setSpec((current) => ({ ...current, fonts: { ...current.fonts, [role]: { ...current.fonts[role], style: event.target.checked ? "italic" : "normal" } } }))} />Italic</label></div>)}</div><p className="emi-supporting">SVG keeps text as text and records the selected font stack. If the first font is unavailable when opened elsewhere, the named fallback is used.</p></details>

        <details><summary>Axes</summary><div className="emi-format-grid">
          <label>X-axis title<input value={spec.axes.x.label} onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, x: { ...current.axes.x, label: event.target.value } } }))} /></label><label>Y-axis title<input value={spec.axes.y.label} onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, y: { ...current.axes.y, label: event.target.value } } }))} /></label>
          <label className="emi-checkbox-label"><input checked={spec.axes.x.automaticRange} type="checkbox" onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, x: { ...current.axes.x, automaticRange: event.target.checked } } }))} />Automatic X range</label><label className="emi-checkbox-label"><input checked={spec.axes.y.automaticRange} type="checkbox" onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, y: { ...current.axes.y, automaticRange: event.target.checked } } }))} />Automatic Y range</label><label>X scale<select className="ui-select" value={spec.axes.x.scale} onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, x: { ...current.axes.x, scale: event.target.value as "linear" | "log" } } }))}><option value="linear">Linear</option><option value="log">Logarithmic</option></select></label>
          <label>X minimum<input disabled={spec.axes.x.automaticRange} step="any" type="number" value={spec.axes.x.minimum ?? ""} onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, x: { ...current.axes.x, minimum: Number(event.target.value) } } }))} /></label><label>X maximum<input disabled={spec.axes.x.automaticRange} step="any" type="number" value={spec.axes.x.maximum ?? ""} onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, x: { ...current.axes.x, maximum: Number(event.target.value) } } }))} /></label>
          <label>Y minimum<input disabled={spec.axes.y.automaticRange} step="any" type="number" value={spec.axes.y.minimum ?? ""} onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, y: { ...current.axes.y, minimum: Number(event.target.value) } } }))} /></label><label>Y maximum<input disabled={spec.axes.y.automaticRange} step="any" type="number" value={spec.axes.y.maximum ?? ""} onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, y: { ...current.axes.y, maximum: Number(event.target.value) } } }))} /></label>
          <label>X major interval<input min="0" step="any" type="number" value={spec.axes.x.majorTick ?? ""} onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, x: { ...current.axes.x, majorTick: event.target.value ? Number(event.target.value) : undefined } } }))} /></label><label>Y major interval<input min="0" step="any" type="number" value={spec.axes.y.majorTick ?? ""} onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, y: { ...current.axes.y, majorTick: event.target.value ? Number(event.target.value) : undefined } } }))} /></label>
          <label>X number format<select className="ui-select" value={spec.axes.x.numberFormat} onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, x: { ...current.axes.x, numberFormat: event.target.value as PublicationFigureSpec["axes"]["x"]["numberFormat"] } } }))}><option value="auto">Automatic</option><option value="fixed">Fixed decimal</option><option value="scientific">Scientific</option></select></label><label>X precision<input min="0" max="12" step="1" type="number" value={spec.axes.x.precision} onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, x: { ...current.axes.x, precision: Number(event.target.value) } } }))} /></label>
          <label>Y number format<select className="ui-select" value={spec.axes.y.numberFormat} onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, y: { ...current.axes.y, numberFormat: event.target.value as PublicationFigureSpec["axes"]["y"]["numberFormat"] } } }))}><option value="auto">Automatic</option><option value="fixed">Fixed decimal</option><option value="scientific">Scientific</option></select></label><label>Y precision<input min="0" max="12" step="1" type="number" value={spec.axes.y.precision} onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, y: { ...current.axes.y, precision: Number(event.target.value) } } }))} /></label>
          <label>Tick direction<select className="ui-select" value={spec.axes.tickDirection} onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, tickDirection: event.target.value as "inside" | "outside" } }))}><option value="outside">Outside</option><option value="inside">Inside</option></select></label><label className="emi-checkbox-label"><input checked={spec.axes.majorGrid} type="checkbox" onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, majorGrid: event.target.checked } }))} />Major grid</label>
          <label className="emi-checkbox-label"><input checked={spec.axes.x.minorTicks} type="checkbox" onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, x: { ...current.axes.x, minorTicks: event.target.checked } } }))} />X minor ticks</label><label className="emi-checkbox-label"><input checked={spec.axes.y.minorTicks} type="checkbox" onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, y: { ...current.axes.y, minorTicks: event.target.checked } } }))} />Y minor ticks</label>
          <label className="emi-checkbox-label"><input checked={spec.axes.minorGrid} type="checkbox" onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, minorGrid: event.target.checked } }))} />Minor grid</label><label>Tick length (pt)<input min="0" step="0.25" type="number" value={spec.axes.tickLengthPt} onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, tickLengthPt: Number(event.target.value) } }))} /></label>
          <label>Tick thickness (pt)<input min="0.1" step="0.1" type="number" value={spec.axes.tickWidthPt} onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, tickWidthPt: Number(event.target.value) } }))} /></label><label>Axis thickness (pt)<input min="0.1" step="0.1" type="number" value={spec.axes.axisWidthPt} onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, axisWidthPt: Number(event.target.value) } }))} /></label>
          <label>X title padding (pt)<input min="0" step="0.5" type="number" value={spec.axes.x.labelPaddingPt} onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, x: { ...current.axes.x, labelPaddingPt: Number(event.target.value) } } }))} /></label><label>Y title padding (pt)<input min="0" step="0.5" type="number" value={spec.axes.y.labelPaddingPt} onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, y: { ...current.axes.y, labelPaddingPt: Number(event.target.value) } } }))} /></label>
          <label>X tick-label padding (pt)<input min="0" step="0.5" type="number" value={spec.axes.x.tickLabelPaddingPt} onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, x: { ...current.axes.x, tickLabelPaddingPt: Number(event.target.value) } } }))} /></label><label>Y tick-label padding (pt)<input min="0" step="0.5" type="number" value={spec.axes.y.tickLabelPaddingPt} onChange={(event) => setSpec((current) => ({ ...current, axes: { ...current.axes, y: { ...current.axes.y, tickLabelPaddingPt: Number(event.target.value) } } }))} /></label>
        </div>{(axisErrors.x || axisErrors.y) && <div className="emi-inline-error" role="alert">{axisErrors.x ?? axisErrors.y} The last valid preview is preserved.</div>}</details>

        <details open><summary>Series</summary><div className="emi-publication-series-list">{spec.series.map((series) => <div className="emi-publication-series-row" key={series.id}><input aria-label={`Show ${series.label}`} checked={series.visible} type="checkbox" onChange={(event) => updateSeries(series.id, { visible: event.target.checked })} /><input aria-label={`Label for ${series.label}`} value={series.label} onChange={(event) => updateSeries(series.id, { label: event.target.value })} /><input aria-label={`Color for ${series.label}`} type="color" value={series.color} onChange={(event) => updateSeries(series.id, { color: event.target.value })} /><label>Width<input min="0.25" max="10" step="0.25" type="number" value={series.widthPt} onChange={(event) => updateSeries(series.id, { widthPt: Number(event.target.value) })} /></label><select aria-label={`Line style for ${series.label}`} className="ui-select" value={series.dash} onChange={(event) => updateSeries(series.id, { dash: event.target.value as PublicationSeriesSpec["dash"] })}>{PUBLICATION_DASH_SEQUENCE.map((dash) => <option key={dash}>{dash}</option>)}</select><select aria-label={`Marker for ${series.label}`} className="ui-select" value={series.marker} onChange={(event) => updateSeries(series.id, { marker: event.target.value as PublicationSeriesSpec["marker"] })}><option value="none">No marker</option>{PUBLICATION_MARKER_SEQUENCE.map((marker) => <option key={marker}>{marker}</option>)}</select><details className="emi-publication-series-advanced"><summary>Advanced</summary><div className="emi-format-grid"><label>Marker size (pt)<input min="0" max="40" step="0.5" type="number" value={series.markerSizePt} onChange={(event) => updateSeries(series.id, { markerSizePt: Number(event.target.value) })} /></label><label>Max markers<input min="0" max="10000" step="1" type="number" value={series.markerMaxDisplayed} onChange={(event) => updateSeries(series.id, { markerMaxDisplayed: Number(event.target.value) })} /></label><label>Opacity<input min="0" max="1" step="0.05" type="number" value={series.opacity} onChange={(event) => updateSeries(series.id, { opacity: Number(event.target.value) })} /></label><label>Z-order<input step="1" type="number" value={series.zOrder} onChange={(event) => updateSeries(series.id, { zOrder: Number(event.target.value) })} /></label><label className="emi-checkbox-label"><input checked={series.markerOpen} type="checkbox" onChange={(event) => updateSeries(series.id, { markerOpen: event.target.checked })} />Open marker</label><label className="emi-checkbox-label"><input checked={series.smoothing.enabled} type="checkbox" onChange={(event) => updateSeries(series.id, { smoothing: { ...series.smoothing, enabled: event.target.checked } })} />Display smoothing</label><label>Smoothing window<select className="ui-select" value={series.smoothing.windowSize} onChange={(event) => updateSeries(series.id, { smoothing: { ...series.smoothing, windowSize: Number(event.target.value) as 3 | 5 | 7 | 11 } })}>{[3, 5, 7, 11].map((window) => <option key={window}>{window}</option>)}</select></label></div></details></div>)}</div>
          <label>Palette<select className="ui-select" value={spec.palette} onChange={(event) => setSpec((current) => applyPublicationPalette(current, event.target.value as PublicationFigureSpec["palette"]))}><option value="colorblind-safe">Colorblind-safe</option><option value="muted-scientific">Muted scientific</option><option value="high-contrast">High contrast</option><option value="grayscale">Grayscale with patterns</option></select></label>
          {indistinguishableSeries && <div className="emi-inline-warning" role="status">Two or more visible series share the same color, dash, and marker. Change at least one style before publication.</div>}
        </details>

        <details><summary>Legend</summary><div className="emi-format-grid"><label className="emi-checkbox-label"><input checked={spec.legend.visible} type="checkbox" onChange={(event) => setSpec((current) => ({ ...current, legend: { ...current.legend, visible: event.target.checked } }))} />Show legend</label><label>Position<select className="ui-select" value={spec.legend.position} onChange={(event) => setSpec((current) => ({ ...current, legend: { ...current.legend, position: event.target.value as PublicationFigureSpec["legend"]["position"] } }))}>{["upper-left", "upper-center", "upper-right", "center-left", "center", "center-right", "lower-left", "lower-center", "lower-right", "outside-top", "outside-bottom", "outside-right", "manual"].map((position) => <option key={position}>{position}</option>)}</select></label><label>Target columns<input min="1" max="12" type="number" value={spec.legend.columns} onChange={(event) => setSpec((current) => ({ ...current, legend: { ...current.legend, columns: Number(event.target.value) } }))} /></label><label>Sample length (px)<input min="15" max="200" type="number" value={spec.legend.sampleLengthPx} onChange={(event) => setSpec((current) => ({ ...current, legend: { ...current.legend, sampleLengthPx: Number(event.target.value) } }))} /></label><label>Row spacing (px)<input min="0" type="number" value={spec.legend.rowSpacingPx} onChange={(event) => setSpec((current) => ({ ...current, legend: { ...current.legend, rowSpacingPx: Number(event.target.value) } }))} /></label><label>Column spacing (px)<input min="0" type="number" value={spec.legend.columnSpacingPx} onChange={(event) => setSpec((current) => ({ ...current, legend: { ...current.legend, columnSpacingPx: Number(event.target.value) } }))} /></label><label>Text gap (px)<input min="0" type="number" value={spec.legend.textGapPx} onChange={(event) => setSpec((current) => ({ ...current, legend: { ...current.legend, textGapPx: Number(event.target.value) } }))} /></label><label>Border (pt)<input min="0" step="0.1" type="number" value={spec.legend.borderWidthPt} onChange={(event) => setSpec((current) => ({ ...current, legend: { ...current.legend, borderWidthPt: Number(event.target.value) } }))} /></label><label className="emi-checkbox-label"><input checked={spec.legend.frame} type="checkbox" onChange={(event) => setSpec((current) => ({ ...current, legend: { ...current.legend, frame: event.target.checked } }))} />Frame</label><label className="emi-checkbox-label"><input checked={spec.legend.background} type="checkbox" onChange={(event) => setSpec((current) => ({ ...current, legend: { ...current.legend, background: event.target.checked } }))} />White background</label>{spec.legend.position === "manual" && <><label>Manual X<input step="0.01" type="number" value={spec.legend.x} onChange={(event) => setSpec((current) => ({ ...current, legend: { ...current.legend, x: Number(event.target.value) } }))} /></label><label>Manual Y<input step="0.01" type="number" value={spec.legend.y} onChange={(event) => setSpec((current) => ({ ...current, legend: { ...current.legend, y: Number(event.target.value) } }))} /></label></>}</div><p className="emi-supporting">Target columns use Plotly’s horizontal publication legend and may wrap when labels are long. Manual X/Y values are normalized figure coordinates.</p>{legendLabelWarning && <div className="emi-inline-warning" role="status">{legendLabelWarning}</div>}</details>

        <details><summary>Export</summary><div className="emi-format-grid"><label>DPI preset<select className="ui-select" value={[300, 600].includes(spec.geometry.dpi) ? String(spec.geometry.dpi) : "custom"} onChange={(event) => { if (event.target.value !== "custom") setSpec((current) => ({ ...current, geometry: { ...current.geometry, dpi: Number(event.target.value) } })); }}><option value="300">300 DPI</option><option value="600">600 DPI</option><option value="custom">Custom</option></select></label><label>Custom DPI<input min="72" max="2400" step="1" type="number" value={spec.geometry.dpi} onChange={(event) => setSpec((current) => ({ ...current, geometry: { ...current.geometry, dpi: Number(event.target.value) } }))} /></label><div><strong>Raster size</strong><p>{figureRasterPixels(spec).width.toLocaleString()} × {figureRasterPixels(spec).height.toLocaleString()} px</p></div></div><div className="emi-export-actions"><button className="ui-button ui-button-primary" onClick={() => void exportSvg()} type="button">Export SVG</button><button className="ui-button" onClick={() => void exportPng()} type="button">Export PNG</button><button className="ui-button" onClick={() => download(`${spec.name}.figure.json`, serializePublicationFigureSpec(spec), "application/json;charset=utf-8")} type="button">Export configuration JSON</button><button className="ui-button" onClick={() => download(`${spec.name}.csv`, publicationSeriesCsv(spec, resolved), "text/csv;charset=utf-8")} type="button">Export plotted data CSV</button><button className="ui-button" onClick={() => importRef.current?.click()} type="button">Import configuration</button><input accept="application/json,.json" hidden ref={importRef} type="file" onChange={(event) => { const file = event.target.files?.[0]; if (!file) return; void file.text().then((text) => { try { setSpec(parsePublicationFigureSpec(text)); setStatus(`Imported ${file.name}.`); } catch (error) { setStatus(error instanceof Error ? error.message : "Invalid figure configuration."); } }); }} /></div><p className="emi-supporting">SVG remains vector. PNG is rasterized from that same SVG at the exact physical size and DPI shown above. PDF and TIFF are not enabled until cross-platform font embedding is validated.</p></details>
      </div>
      <div className="emi-publication-preview-column"><PublicationFigurePreview grayscalePreview={grayscalePreview} ref={previewRef} resolved={resolved} spec={spec} /><p aria-live="polite" className="emi-publication-status">{status}</p></div>
    </div>}
  </section>;
}
