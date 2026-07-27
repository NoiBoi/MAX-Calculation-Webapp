"use client";

import { useMemo, useRef, useState } from "react";
import {
  smoothSeries,
  type EmiMetric,
  type EmiSmoothingWindowSize,
  type SimonSeriesPoint,
} from "@max-stoich/chemistry-engine";
import { createMetricSegments, type PlotPoint } from "@/lib/emi/analyzer";
import type { EmiPlotConfiguration } from "@/lib/emi/project";

export interface EmiPlotTrace {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly metric: EmiMetric;
  readonly points: Parameters<typeof createMetricSegments>[0];
  readonly lineStyle?: "solid" | "dashed";
}

export interface EmiSimonPlotTrace {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly sampleName: string;
  readonly points: readonly SimonSeriesPoint[];
  readonly conductivitySiemensPerMeter: number;
  readonly conductivitySiemensPerCentimeter: number;
  readonly thicknessMicrometers: number;
  readonly calculationVersion: string;
  readonly gapFrequenciesHz?: readonly number[];
}

export interface EmiPlotBand {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly points: readonly Readonly<{ frequencyHz: number; lower: number; upper: number; contributingCount: number }>[];
}

interface DisplayPoint extends PlotPoint {
  readonly rawValue: number;
}

interface HoverPoint extends DisplayPoint {
  readonly id: string;
  readonly label: string;
  readonly color: string;
  readonly kind: "measured" | "simon";
  readonly x: number;
  readonly y: number;
  readonly simon?: EmiSimonPlotTrace;
}

const WIDTH = 900;
const HEIGHT = 330;
const MARGIN = { left: 72, right: 24, top: 58, bottom: 50 };
const SMOOTHING_WINDOWS: readonly EmiSmoothingWindowSize[] = [3, 5, 7, 11];

function axisValue(value: number): string {
  return Math.abs(value) >= 1000 || (Math.abs(value) > 0 && Math.abs(value) < 0.001)
    ? value.toExponential(3)
    : value.toLocaleString(undefined, { maximumSignificantDigits: 5 });
}

function scientific(value: number): string {
  return value.toExponential(3).replace("e+", " × 10^").replace("e-", " × 10^-");
}

export function EmiPlot({
  graphId,
  title,
  yLabel,
  traces,
  minimumHz,
  maximumHz,
  unit,
  bands = [],
  warningFrequenciesHz = [],
  format,
  exportName = "emi-figure",
  smoothingEligible = true,
  simonEligible = false,
  simonTraces = [],
  simonUnavailableCount = 0,
}: {
  readonly graphId: string;
  readonly title: string;
  readonly yLabel: string;
  readonly traces: readonly EmiPlotTrace[];
  readonly minimumHz?: number;
  readonly maximumHz?: number;
  readonly unit: "GHz" | "Hz";
  readonly bands?: readonly EmiPlotBand[];
  readonly warningFrequenciesHz?: readonly number[];
  readonly format?: EmiPlotConfiguration;
  readonly exportName?: string;
  readonly smoothingEligible?: boolean;
  readonly simonEligible?: boolean;
  readonly simonTraces?: readonly EmiSimonPlotTrace[];
  readonly simonUnavailableCount?: number;
}) {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [hover, setHover] = useState<HoverPoint | null>(null);
  const [smoothingEnabled, setSmoothingEnabled] = useState(false);
  const [smoothingWindowSize, setSmoothingWindowSize] = useState<EmiSmoothingWindowSize>(5);
  const [showSimonEstimate, setShowSimonEstimate] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const range = useMemo(() => ({ minimumHz, maximumHz }), [minimumHz, maximumHz]);
  const rawSegments = useMemo(() => traces.map((trace) => ({ trace, segments: createMetricSegments(trace.points, trace.metric, range) })), [range, traces]);
  const canSmooth = smoothingEligible && rawSegments.some((entry) => entry.segments.some((segment) => segment.length >= 3));
  const smoothingActive = smoothingEnabled && canSmooth;
  const rendered = useMemo(() => rawSegments.filter(({ trace }) => !hidden.has(trace.id)).map(({ trace, segments }) => ({
    trace,
    segments: segments.map((segment): readonly DisplayPoint[] => {
      if (!smoothingActive) return segment.map((point) => ({ ...point, rawValue: point.value }));
      const smoothed = smoothSeries(segment.map((point) => ({ x: point.frequencyHz, y: point.value })), { enabled: true, windowSize: smoothingWindowSize });
      return segment.map((point, index) => ({ frequencyHz: point.frequencyHz, rawValue: point.value, value: smoothed[index]?.y ?? point.value }));
    }),
  })), [hidden, rawSegments, smoothingActive, smoothingWindowSize]);
  const renderedSimon = useMemo(() => showSimonEstimate ? simonTraces.filter((trace) => !hidden.has(trace.id)).map((trace) => {
    const gaps = new Set(trace.gapFrequenciesHz ?? []);
    const segments: DisplayPoint[][] = [];
    let current: DisplayPoint[] = [];
    for (const point of trace.points) {
      const inRange = (minimumHz === undefined || point.frequencyHz >= minimumHz) && (maximumHz === undefined || point.frequencyHz <= maximumHz);
      if (!inRange) continue;
      if (!Number.isFinite(point.frequencyHz) || !Number.isFinite(point.theoreticalSetDb) || gaps.has(point.frequencyHz)) {
        if (current.length > 0) segments.push(current);
        current = [];
        continue;
      }
      current.push({ frequencyHz: point.frequencyHz, value: point.theoreticalSetDb, rawValue: point.theoreticalSetDb });
    }
    if (current.length > 0) segments.push(current);
    return { trace, segments };
  }) : [], [hidden, maximumHz, minimumHz, showSimonEstimate, simonTraces]);
  const all = [...rendered.flatMap((entry) => entry.segments.flat()), ...renderedSimon.flatMap((entry) => entry.segments.flat())];
  const xValues = all.map((point) => point.frequencyHz);
  const yValues = [...all.map((point) => point.value), ...bands.flatMap((band) => band.points.flatMap((point) => [point.lower, point.upper]))];
  let xMin = xValues.length > 0 ? Math.min(...xValues) : 0;
  let xMax = xValues.length > 0 ? Math.max(...xValues) : 1;
  let yMin = yValues.length > 0 ? Math.min(...yValues) : 0;
  let yMax = yValues.length > 0 ? Math.max(...yValues) : 1;
  const configuredYMinimum = yLabel === "dB" ? format?.shieldingYMinimum : format?.powerYMinimum;
  const configuredYMaximum = yLabel === "dB" ? format?.shieldingYMaximum : format?.powerYMaximum;
  if (configuredYMinimum !== undefined && Number.isFinite(configuredYMinimum)) yMin = configuredYMinimum;
  if (configuredYMaximum !== undefined && Number.isFinite(configuredYMaximum)) yMax = configuredYMaximum;
  if (xMin === xMax) { xMin -= 0.5; xMax += 0.5; }
  if (yMin === yMax) { const delta = Math.abs(yMin) * 0.05 || 1; yMin -= delta; yMax += delta; }
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  const logarithmicX = format?.xScale === "logarithmic" && xMin > 0;
  const transformedXMin = logarithmicX ? Math.log10(xMin) : xMin;
  const transformedXMax = logarithmicX ? Math.log10(xMax) : xMax;
  const x = (value: number) => MARGIN.left + (((logarithmicX ? Math.log10(value) : value) - transformedXMin) / (transformedXMax - transformedXMin)) * plotWidth;
  const y = (value: number) => MARGIN.top + (1 - ((value - yMin) / (yMax - yMin))) * plotHeight;
  const candidates: HoverPoint[] = [
    ...rendered.flatMap(({ trace, segments }) => segments.flatMap((segment) => segment.map((point) => ({ ...point, id: trace.id, label: trace.label, color: trace.color, kind: "measured" as const, x: x(point.frequencyHz), y: y(point.value) })))),
    ...renderedSimon.flatMap(({ trace, segments }) => segments.flatMap((segment) => segment.map((point) => ({ ...point, id: trace.id, label: trace.label, color: trace.color, kind: "simon" as const, simon: trace, x: x(point.frequencyHz), y: y(point.value) })))),
  ];
  const factor = unit === "GHz" ? 1e9 : 1;
  const displayedYLabel = yLabel === "dB" ? (format?.shieldingYAxisLabel || yLabel) : (format?.powerYAxisLabel || yLabel);
  const legendTraces = [...traces, ...(showSimonEstimate ? simonTraces : [])];
  const exportStyle = `.emi-grid-line{stroke:#cbd5e1;stroke-width:1}.emi-axis-text{fill:#334155;font:11px Arial}.emi-axis-label{fill:#111827;font:bold 12px Arial}.emi-hover-line{display:none}polyline{vector-effect:non-scaling-stroke}`;
  const cloneForExport = () => {
    if (!svgRef.current) return null;
    const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(format?.figureWidth ?? WIDTH));
    clone.setAttribute("height", String(format?.figureHeight ?? HEIGHT));
    clone.style.background = format?.lightBackground === false ? "#111827" : "#ffffff";
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style"); style.textContent = exportStyle; clone.prepend(style);
    clone.querySelector('[aria-label="Exported trace legend"]')?.remove();
    if (format?.legendPosition !== "none") {
      const columns = 4;
      const rows = Math.ceil(legendTraces.length / columns);
      const exportHeight = HEIGHT + 18 + rows * 18;
      clone.setAttribute("viewBox", `0 0 ${WIDTH} ${exportHeight}`);
      const legend = document.createElementNS("http://www.w3.org/2000/svg", "g"); legend.setAttribute("aria-label", "Exported trace legend");
      legendTraces.forEach((trace, index) => {
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g"); group.setAttribute("transform", `translate(${42 + (index % columns) * 214} ${HEIGHT + 20 + Math.floor(index / columns) * 18})`);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line"); line.setAttribute("stroke", trace.color); line.setAttribute("stroke-width", "3"); line.setAttribute("x2", "16"); if ("sampleName" in trace) line.setAttribute("stroke-dasharray", "7 5");
        const label = document.createElementNS("http://www.w3.org/2000/svg", "text"); label.setAttribute("class", "emi-axis-text"); label.setAttribute("x", "21"); label.setAttribute("y", "4"); label.textContent = trace.label.length > 28 ? `${trace.label.slice(0, 27)}…` : trace.label;
        group.append(line, label); legend.append(group);
      });
      clone.append(legend);
    }
    return clone;
  };
  const exportSvg = () => {
    const clone = cloneForExport(); if (!clone) return;
    const source = new XMLSerializer().serializeToString(clone);
    const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" })); anchor.download = `${exportName}.svg`; anchor.click(); URL.revokeObjectURL(anchor.href);
  };
  const exportPng = () => {
    const clone = cloneForExport(); if (!clone) return;
    const source = new XMLSerializer().serializeToString(clone); const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml" })); const image = new Image();
    image.onload = () => { const scale = format?.rasterScale ?? 2; const width = format?.figureWidth ?? WIDTH; const height = format?.figureHeight ?? HEIGHT; const canvas = document.createElement("canvas"); canvas.width = width * scale; canvas.height = height * scale; const context = canvas.getContext("2d"); if (!context) return; context.scale(scale, scale); context.fillStyle = format?.lightBackground === false ? "#111827" : "white"; context.fillRect(0, 0, width, height); context.drawImage(image, 0, 0, width, height); URL.revokeObjectURL(url); canvas.toBlob((blob) => { if (!blob) return; const anchor = document.createElement("a"); anchor.href = URL.createObjectURL(blob); anchor.download = `${exportName}.png`; anchor.click(); URL.revokeObjectURL(anchor.href); }, "image/png"); };
    image.src = url;
  };
  const toggle = (id: string) => setHidden((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const simonUnavailableMessage = simonTraces.length === 0
    ? "Simon estimate unavailable: displayed samples need valid thickness and four-point-probe resistance data."
    : simonUnavailableCount > 0 ? `${simonUnavailableCount} displayed sample${simonUnavailableCount === 1 ? "" : "s"} lack valid electrical inputs; available estimates can still be shown.` : "";

  return <section className="emi-panel" aria-label={title} data-emi-graph-id={graphId}>
    <div className="emi-section-heading"><div><h2>{format?.title || title}</h2>{format?.subtitle && <p>{format.subtitle}</p>}<p>Invalid calculated values are displayed as gaps.</p></div><div className="emi-export-actions"><button className="ui-button ui-button-compact" onClick={exportSvg} type="button">Export {exportName} SVG</button><button className="ui-button ui-button-compact" onClick={exportPng} type="button">Export {exportName} PNG</button></div></div>
    {(canSmooth || simonEligible) && <div className="emi-graph-toolbar" aria-label={`${title} display controls`}>
      {canSmooth && <><label className="emi-checkbox-label"><input checked={smoothingEnabled} onChange={(event) => setSmoothingEnabled(event.target.checked)} type="checkbox" />Smooth measured curves</label>{smoothingEnabled && <label className="emi-window-control">Window<select aria-label={`${title} smoothing window`} className="ui-select" onChange={(event) => setSmoothingWindowSize(Number(event.target.value) as EmiSmoothingWindowSize)} value={smoothingWindowSize}>{SMOOTHING_WINDOWS.map((windowSize) => <option key={windowSize} value={windowSize}>{windowSize} points</option>)}</select></label>}</>}
      {simonEligible && <label className="emi-checkbox-label"><input checked={showSimonEstimate} disabled={simonTraces.length === 0} onChange={(event) => setShowSimonEstimate(event.target.checked)} type="checkbox" />Show Simon estimate</label>}
      {smoothingEnabled && <span className="emi-view-badge" aria-live="polite">Smoothed display</span>}
    </div>}
    {(canSmooth || simonEligible) && <p className="emi-graph-help" id={`${graphId}-help`}>Display-only centered moving average. Raw measured values are retained for calculations, tooltips, summaries, and spreadsheet exports. Simon estimates are theoretical and never smoothed.{simonUnavailableMessage && <> {simonUnavailableMessage}</>}</p>}
    {format?.legendPosition !== "none" && <div className={`emi-chart-legend emi-legend-${format?.legendPosition ?? "top"}`} aria-label={`${title} traces`}>
      {legendTraces.map((trace) => <button aria-pressed={!hidden.has(trace.id)} className={`emi-legend-item ${"sampleName" in trace ? "emi-legend-simon" : ""}`} key={trace.id} onClick={() => toggle(trace.id)} type="button">
        <span aria-hidden="true" style={"sampleName" in trace ? { backgroundColor: "transparent", borderTop: `2px dashed ${trace.color}` } : { backgroundColor: trace.color }} />{trace.label}{"sampleName" in trace && <em>Theoretical</em>}
      </button>)}
    </div>}
    {all.length === 0 ? <div className="emi-empty-chart">No valid selected points are available for this plot.</div> : <div className="emi-chart-wrap">
      <svg
        aria-describedby={`${graphId}-help`}
        aria-label={`${title} interactive plot`}
        className="emi-chart"
        data-emi-plot={exportName}
        onBlur={() => setHover(null)}
        onFocus={() => { if (!hover) setHover(candidates[0] ?? null); }}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const current = hover ? candidates.findIndex((candidate) => candidate.id === hover.id && candidate.frequencyHz === hover.frequencyHz) : -1;
          const delta = event.key === "ArrowRight" ? 1 : -1;
          setHover(candidates[Math.max(0, Math.min(candidates.length - 1, current + delta))] ?? null);
        }}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const pointerX = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
          const pointerY = ((event.clientY - bounds.top) / bounds.height) * HEIGHT;
          const nearest = candidates.reduce<HoverPoint | null>((best, point) => !best || Math.hypot(point.x - pointerX, point.y - pointerY) < Math.hypot(best.x - pointerX, best.y - pointerY) ? point : best, null);
          setHover(nearest);
        }}
        role="img"
        ref={svgRef}
        tabIndex={0}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        <title>{title}; hover for exact values, use left and right arrow keys while focused, and use legend buttons to toggle traces.</title>
        <text className="emi-axis-label" textAnchor="middle" x={WIDTH / 2} y="14">{format?.title || title}</text>
        {format?.subtitle && <text className="emi-axis-text" textAnchor="middle" x={WIDTH / 2} y="28">{format.subtitle}</text>}
        {format?.legendPosition !== "none" && <g aria-label="Exported trace legend">{legendTraces.slice(0, 4).map((trace, index) => <g key={`svg-legend-${trace.id}`} transform={`translate(${72 + index * 200} 43)`}><line stroke={trace.color} strokeDasharray={"sampleName" in trace ? "7 5" : undefined} strokeWidth="3" x1="0" x2="16" y1="0" y2="0" /><text className="emi-axis-text" x="21" y="4">{trace.label.length > 22 ? `${trace.label.slice(0, 21)}…` : trace.label}</text></g>)}{legendTraces.length > 4 && <text className="emi-axis-text" textAnchor="end" x={WIDTH - 24} y="55">+{legendTraces.length - 4} additional traces</text>}</g>}
        {(minimumHz !== undefined || maximumHz !== undefined) && <rect data-selected-frequency-band fill="#0f766e" fillOpacity="0.035" height={plotHeight} width={plotWidth} x={MARGIN.left} y={MARGIN.top}><title>Selected analysis frequency band</title></rect>}
        {(format?.gridVisibility === false ? [] : [0, 0.25, 0.5, 0.75, 1]).map((fraction) => { const yy = MARGIN.top + fraction * plotHeight; const value = yMax - fraction * (yMax - yMin); return <g key={`y-${fraction}`}><line className="emi-grid-line" x1={MARGIN.left} x2={WIDTH - MARGIN.right} y1={yy} y2={yy} /><text className="emi-axis-text" textAnchor="end" x={MARGIN.left - 9} y={yy + 4}>{axisValue(value)}</text></g>; })}
        {(format?.gridVisibility === false ? [] : [0, 0.25, 0.5, 0.75, 1]).map((fraction) => { const xx = MARGIN.left + fraction * plotWidth; const transformed = transformedXMin + fraction * (transformedXMax - transformedXMin); const value = (logarithmicX ? 10 ** transformed : transformed) / factor; return <g key={`x-${fraction}`}><line className="emi-grid-line" x1={xx} x2={xx} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} /><text className="emi-axis-text" textAnchor="middle" x={xx} y={HEIGHT - MARGIN.bottom + 20}>{axisValue(value)}</text></g>; })}
        <text className="emi-axis-label" textAnchor="middle" transform={`rotate(-90 18 ${HEIGHT / 2})`} x={18} y={HEIGHT / 2}>{displayedYLabel}</text>
        <text className="emi-axis-label" textAnchor="middle" x={MARGIN.left + plotWidth / 2} y={HEIGHT - 8}>{format?.xAxisLabel || "Frequency"} ({unit})</text>
        {bands.map((band) => { const valid = band.points.filter((point) => Number.isFinite(point.lower) && Number.isFinite(point.upper) && point.frequencyHz >= xMin && point.frequencyHz <= xMax); if (valid.length < 2) return null; const polygon = [...valid.map((point) => `${x(point.frequencyHz)},${y(point.upper)}`), ...[...valid].reverse().map((point) => `${x(point.frequencyHz)},${y(point.lower)}`)].join(" "); return <polygon data-contributing-counts={valid.map((point) => point.contributingCount).join(",")} fill={band.color} fillOpacity="0.16" key={band.id} points={polygon}><title>{band.label}; contributing replicate counts {valid.map((point) => point.contributingCount).join(", ")}</title></polygon>; })}
        {rendered.flatMap(({ trace, segments }) => segments.map((segment, index) => <polyline data-segment-count={segments.length} data-series-kind="measured" data-smoothed={smoothingActive ? "true" : "false"} data-trace-id={trace.id} fill="none" key={`${trace.id}-${index}`} points={segment.map((point) => `${x(point.frequencyHz)},${y(point.value)}`).join(" ")} stroke={trace.color} strokeDasharray={format?.lineStyle === "dashed" || (format?.lineStyle !== "solid" && trace.lineStyle === "dashed") ? "8 5" : undefined} strokeLinejoin="round" strokeWidth="2" />))}
        {renderedSimon.flatMap(({ trace, segments }) => segments.map((segment, index) => <polyline data-series-kind="simon" data-trace-id={trace.id} data-values={segment.map((point) => point.value).join(",")} fill="none" key={`${trace.id}-${index}`} opacity="0.72" points={segment.map((point) => `${x(point.frequencyHz)},${y(point.value)}`).join(" ")} stroke={trace.color} strokeDasharray="7 5" strokeLinejoin="round" strokeWidth="1.5" />))}
        {format?.markerVisibility && candidates.filter((point) => point.kind === "measured").map((point, index) => <circle cx={point.x} cy={point.y} fill={point.color} key={`marker-${point.id}-${index}`} r="2.4" />)}
        {[...new Set(warningFrequenciesHz)].filter((frequencyHz) => frequencyHz >= xMin && frequencyHz <= xMax).map((frequencyHz) => <path d={`M ${x(frequencyHz)} ${HEIGHT - MARGIN.bottom - 9} l 5 8 h -10 z`} fill="#dc2626" key={`qc-${frequencyHz}`}><title>Quality-control warning at {axisValue(frequencyHz / factor)} {unit}</title></path>)}
        {hover && <g pointerEvents="none"><line className="emi-hover-line" x1={hover.x} x2={hover.x} y1={MARGIN.top} y2={HEIGHT - MARGIN.bottom} /><circle cx={hover.x} cy={hover.y} fill={hover.color} r="4" /></g>}
      </svg>
      {hover && <div className="emi-chart-tooltip" role="status"><strong>{hover.label}</strong><span>Frequency: {(hover.frequencyHz / factor).toPrecision(10)} {unit}</span>{hover.kind === "measured" ? <>{smoothingActive ? <><span>Raw measured value: {hover.rawValue.toPrecision(10)} {yLabel}</span><span>Smoothed display: {hover.value.toPrecision(10)} {yLabel}</span></> : <span>Measured value: {hover.rawValue.toPrecision(10)} {yLabel}</span>}</> : <><span>Simon theoretical SET: {hover.value.toPrecision(10)} dB</span><span>Conductivity: {scientific(hover.simon?.conductivitySiemensPerMeter ?? Number.NaN)} S/m</span><span>Thickness: {axisValue(hover.simon?.thicknessMicrometers ?? Number.NaN)} µm</span><span>Calculation version: {hover.simon?.calculationVersion}</span><span>Theoretical estimate, not measured.</span></>}</div>}
    </div>}
  </section>;
}
