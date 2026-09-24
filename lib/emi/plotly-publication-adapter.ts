import type { PublicationFigureSpec, PublicationResolvedSeries } from "./publication-figure";
import { figurePreviewPixels } from "./publication-figure";

export interface PlotlyPublicationFigure {
  readonly data: readonly Record<string, unknown>[];
  readonly layout: Readonly<Record<string, unknown>>;
  readonly config: Readonly<Record<string, unknown>>;
}

const ptToPx = (value: number) => value * (96 / 72);
const font = (value: PublicationFigureSpec["fonts"][keyof PublicationFigureSpec["fonts"]]) => ({ family: value.family, size: ptToPx(value.sizePt), color: "#111111", style: value.style, weight: value.weight === "bold" ? 700 : 400 });

function alignmentX(alignment: "left" | "center" | "right"): number { return alignment === "left" ? 0 : alignment === "right" ? 1 : 0.5; }
function alignmentAnchor(alignment: "left" | "center" | "right"): "left" | "center" | "right" { return alignment; }

function legendPlacement(spec: PublicationFigureSpec): Readonly<Record<string, unknown>> {
  const preset = {
    "upper-left": [0.02, 0.98, "left", "top"], "upper-center": [0.5, 0.98, "center", "top"], "upper-right": [0.98, 0.98, "right", "top"],
    "center-left": [0.02, 0.5, "left", "middle"], center: [0.5, 0.5, "center", "middle"], "center-right": [0.98, 0.5, "right", "middle"],
    "lower-left": [0.02, 0.02, "left", "bottom"], "lower-center": [0.5, 0.02, "center", "bottom"], "lower-right": [0.98, 0.02, "right", "bottom"],
    "outside-top": [0.5, 1.12, "center", "bottom"], "outside-bottom": [0.5, -0.2, "center", "top"], "outside-right": [1.03, 0.5, "left", "middle"], manual: [spec.legend.x, spec.legend.y, "left", "top"],
  } as const;
  const [x, y, xanchor, yanchor] = preset[spec.legend.position];
  return { x, y, xanchor, yanchor, xref: "paper", yref: "paper", orientation: spec.legend.position === "outside-right" ? "v" : spec.legend.columns > 1 || spec.legend.position === "outside-top" || spec.legend.position === "outside-bottom" ? "h" : "v" };
}

function markerSymbol(marker: PublicationFigureSpec["series"][number]["marker"], open: boolean): string {
  if (marker === "plus") return "cross-thin";
  if (marker === "none") return "circle";
  return `${marker}${open && !marker.includes("cross") ? "-open" : ""}`;
}

function tickFormat(axis: PublicationFigureSpec["axes"]["x"] | PublicationFigureSpec["axes"]["y"]): string | undefined {
  if (axis.numberFormat === "fixed") return `.${axis.precision}f`;
  if (axis.numberFormat === "scientific") return `.${axis.precision}e`;
  return undefined;
}

function effectiveMargins(spec: PublicationFigureSpec, width: number, height: number): PublicationFigureSpec["geometry"]["margin"] {
  const margin = { ...spec.geometry.margin };
  if (!spec.legend.visible) return margin;
  if (spec.legend.position === "outside-right") margin.right = Math.max(margin.right, Math.min(180, Math.round(width * 0.36)));
  if (spec.legend.position === "outside-top") margin.top = Math.max(margin.top, Math.min(120, Math.round(height * 0.24)));
  if (spec.legend.position === "outside-bottom") margin.bottom = Math.max(margin.bottom, Math.min(120, Math.round(height * 0.24)));
  return margin;
}

export function buildPlotlyPublicationFigure(spec: PublicationFigureSpec, resolved: readonly PublicationResolvedSeries[]): PlotlyPublicationFigure {
  const dimensions = figurePreviewPixels(spec);
  const margins = effectiveMargins(spec, dimensions.width, dimensions.height);
  const values = new Map(resolved.map((series) => [series.id, series]));
  const data = spec.series.filter((series) => series.visible).sort((a, b) => a.zOrder - b.zOrder).flatMap((series) => {
    const resolvedSeries = values.get(series.id); if (!resolvedSeries) return [];
    const markerEnabled = series.marker !== "none";
    return [{
      type: "scatter", mode: markerEnabled ? "lines+markers" : "lines", name: series.label, legendgroup: series.id, x: resolvedSeries.x, y: resolvedSeries.y,
      line: { color: series.color, width: ptToPx(series.widthPt), dash: series.dash }, opacity: series.opacity,
      marker: { color: series.color, line: { color: series.color, width: ptToPx(Math.min(series.widthPt, 1)) }, maxdisplayed: series.markerMaxDisplayed, size: ptToPx(series.markerSizePt), symbol: markerSymbol(series.marker, series.markerOpen) },
      connectgaps: false, hovertemplate: `%{x:.5g} ${spec.frequencyUnit}<br>%{y:.5g}<extra>${series.label.replaceAll("<", "&lt;")}</extra>`,
    }];
  });
  const background = spec.geometry.background === "transparent" ? "rgba(0,0,0,0)" : "#ffffff";
  const annotations: Record<string, unknown>[] = [];
  if (spec.text.titleVisible && spec.text.title) annotations.push({ x: alignmentX(spec.text.titleAlignment), y: 1, xref: "paper", yref: "paper", xanchor: alignmentAnchor(spec.text.titleAlignment), yanchor: "bottom", yshift: ptToPx(spec.text.titleSpacingPt + (spec.text.subtitleVisible ? spec.fonts.subtitle.sizePt + spec.text.subtitleSpacingPt : 0)), showarrow: false, text: spec.text.title.replaceAll("\n", "<br>"), font: font(spec.fonts.title), align: spec.text.titleAlignment });
  if (spec.text.subtitleVisible && spec.text.subtitle) annotations.push({ x: alignmentX(spec.text.subtitleAlignment), y: 1, xref: "paper", yref: "paper", xanchor: alignmentAnchor(spec.text.subtitleAlignment), yanchor: "bottom", yshift: ptToPx(spec.text.subtitleSpacingPt), showarrow: false, text: spec.text.subtitle.replaceAll("\n", "<br>"), font: font(spec.fonts.subtitle), align: spec.text.subtitleAlignment });
  if (spec.text.panelLabelVisible && spec.text.panelLabel) annotations.push({ x: spec.text.panelLabelX, y: spec.text.panelLabelY, xref: "paper", yref: "paper", xanchor: "left", yanchor: "top", showarrow: false, text: spec.text.panelLabel, font: font(spec.fonts.panelLabel) });
  const commonAxis = { ticks: spec.axes.tickDirection, ticklen: ptToPx(spec.axes.tickLengthPt), tickwidth: ptToPx(spec.axes.tickWidthPt), linewidth: ptToPx(spec.axes.axisWidthPt), showline: true, mirror: true, linecolor: "#111111", showgrid: spec.axes.majorGrid, gridcolor: "#d1d5db", gridwidth: 0.6, zeroline: false, tickfont: font(spec.fonts.tick), automargin: false };
  const layout = {
    width: dimensions.width, height: dimensions.height, autosize: false, paper_bgcolor: background, plot_bgcolor: background, font: font(spec.fonts.tick), showlegend: spec.legend.visible,
    margin: margins,
    xaxis: { ...commonAxis, title: { text: spec.axes.x.label, standoff: ptToPx(spec.axes.x.labelPaddingPt), font: font(spec.fonts.axisTitle) }, type: spec.axes.x.scale, autorange: spec.axes.x.automaticRange, ...(spec.axes.x.automaticRange ? {} : { range: spec.axes.x.scale === "log" ? [Math.log10(spec.axes.x.minimum!), Math.log10(spec.axes.x.maximum!)] : [spec.axes.x.minimum, spec.axes.x.maximum] }), ...(spec.axes.x.majorTick ? { dtick: spec.axes.x.majorTick } : {}), ...(tickFormat(spec.axes.x) ? { tickformat: tickFormat(spec.axes.x) } : {}), ticklabelstandoff: ptToPx(spec.axes.x.tickLabelPaddingPt), minor: { ticks: spec.axes.x.minorTicks ? spec.axes.tickDirection : "", showgrid: spec.axes.minorGrid } },
    yaxis: { ...commonAxis, title: { text: spec.axes.y.label, standoff: ptToPx(spec.axes.y.labelPaddingPt), font: font(spec.fonts.axisTitle) }, autorange: spec.axes.y.automaticRange, ...(spec.axes.y.automaticRange ? {} : { range: [spec.axes.y.minimum, spec.axes.y.maximum] }), ...(spec.axes.y.majorTick ? { dtick: spec.axes.y.majorTick } : {}), ...(tickFormat(spec.axes.y) ? { tickformat: tickFormat(spec.axes.y) } : {}), ticklabelstandoff: ptToPx(spec.axes.y.tickLabelPaddingPt), minor: { ticks: spec.axes.y.minorTicks ? spec.axes.tickDirection : "", showgrid: spec.axes.minorGrid } },
    legend: { ...legendPlacement(spec), font: font(spec.fonts.legend), bgcolor: spec.legend.background ? "rgba(255,255,255,0.94)" : "rgba(255,255,255,0)", bordercolor: "#111111", borderwidth: spec.legend.frame ? ptToPx(spec.legend.borderWidthPt) : 0, itemwidth: spec.legend.sampleLengthPx, tracegroupgap: spec.legend.rowSpacingPx, entrywidthmode: "pixels", entrywidth: spec.legend.columns > 1 ? Math.max(40, (dimensions.width - margins.left - margins.right) / spec.legend.columns - spec.legend.columnSpacingPx) : undefined, indentation: spec.legend.textGapPx, itemsizing: "trace" },
    annotations,
  };
  return { data, layout, config: { displayModeBar: false, responsive: false, staticPlot: false, scrollZoom: false, doubleClick: "reset+autosize" } };
}
