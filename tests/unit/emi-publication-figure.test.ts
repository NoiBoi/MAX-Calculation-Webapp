import { describe, expect, it } from "vitest";
import { buildPlotlyPublicationFigure } from "../../lib/emi/plotly-publication-adapter";
import { finalizePublicationSvg } from "../../lib/emi/publication-export";
import { applyPublicationPalette, carryPublicationSeriesStyles, convertFigureLength, createPublicationFigureSpec, figurePreviewPixels, figureRasterPixels, parsePublicationFigureSpec, publicationSeriesCsv, serializePublicationFigureSpec, validatePublicationAxes } from "../../lib/emi/publication-figure";

const series = [{ id: "sample-forward-SET", datasetId: "sample", direction: "forward" as const, metric: "SET" as const, label: "Sample α", visible: true, widthPt: 1.25, markerSizePt: 4, markerOpen: true, markerMaxDisplayed: 18, opacity: 1, smoothing: { enabled: false, windowSize: 5 as const } }];
const create = () => createPublicationFigureSpec({ metric: "SET", frequencyUnit: "GHz", applicationVersion: "test", engineVersion: "engine", series });

describe("publication figure specification", () => {
  it("converts physical dimensions to exact raster dimensions", () => {
    const spec = create();
    expect(figureRasterPixels(spec)).toEqual({ width: 2100, height: 1650 });
    expect(figureRasterPixels({ ...spec, geometry: { ...spec.geometry, width: 88.9, height: 69.85, unit: "mm", dpi: 300 } })).toEqual({ width: 1050, height: 825 });
    expect(figureRasterPixels({ ...spec, geometry: { ...spec.geometry, width: 3.5, height: 2.5, unit: "in", dpi: 300 } })).toEqual({ width: 1050, height: 750 });
    expect(figureRasterPixels({ ...spec, geometry: { ...spec.geometry, width: 3.5, height: 2.5, unit: "in", dpi: 600 } })).toEqual({ width: 2100, height: 1500 });
    expect(figureRasterPixels({ ...spec, geometry: { ...spec.geometry, width: 7, height: 4.5, unit: "in", dpi: 300 } })).toEqual({ width: 2100, height: 1350 });
    expect(figureRasterPixels({ ...spec, geometry: { ...spec.geometry, width: 90, height: 70, unit: "mm", dpi: 600 } })).toEqual({ width: 2126, height: 1654 });
  });

  it("converts unit values without changing authoritative physical dimensions", () => {
    expect(convertFigureLength(3.5, "in", "mm")).toBeCloseTo(88.9, 10);
    expect(convertFigureLength(88.9, "mm", "in")).toBeCloseTo(3.5, 10);
    expect(convertFigureLength(3.5, "in", "px")).toBe(336);
  });

  it("preserves the requested aspect ratio even for small and pixel-sized figures", () => {
    const initial = create();
    expect(figurePreviewPixels({ ...initial, geometry: { ...initial.geometry, width: 1, height: 1, unit: "in" } })).toEqual({ width: 96, height: 96 });
    expect(figurePreviewPixels({ ...initial, geometry: { ...initial.geometry, width: 120, height: 80, unit: "px" } })).toEqual({ width: 120, height: 80 });
  });

  it("hides a meaningless one-series legend by default", () => {
    expect(create().legend.visible).toBe(false);
    const twoSeries = createPublicationFigureSpec({ metric: "SET", frequencyUnit: "GHz", applicationVersion: "test", engineVersion: "engine", series: [...series, { ...series[0]!, id: "second", datasetId: "second" }] });
    expect(twoSeries.legend.visible).toBe(true);
  });

  it("round-trips every serialized style and legend setting", () => {
    const spec = { ...create(), legend: { ...create().legend, position: "manual" as const, x: 0.37, y: 0.62, columns: 2 }, axes: { ...create().axes, y: { ...create().axes.y, automaticRange: false, minimum: 10, maximum: 70 } } };
    expect(parsePublicationFigureSpec(serializePublicationFigureSpec(spec))).toEqual(spec);
  });

  it("migrates additive axis-format defaults and rejects unsupported schema versions", () => {
    const legacyCompatible = JSON.parse(serializePublicationFigureSpec(create()));
    delete legacyCompatible.axes.x.numberFormat;
    delete legacyCompatible.axes.x.precision;
    delete legacyCompatible.axes.y.numberFormat;
    delete legacyCompatible.axes.y.precision;
    const migrated = parsePublicationFigureSpec(JSON.stringify(legacyCompatible));
    expect(migrated.axes.x).toMatchObject({ numberFormat: "auto", precision: 4 });
    expect(migrated.axes.y).toMatchObject({ numberFormat: "auto", precision: 4 });
    expect(() => parsePublicationFigureSpec(JSON.stringify({ ...legacyCompatible, schemaVersion: "0.9.0" }))).toThrow();
    expect(() => parsePublicationFigureSpec("{not-json")).toThrow(/not valid JSON/);
    expect(() => parsePublicationFigureSpec(JSON.stringify({ ...legacyCompatible, geometry: { ...legacyCompatible.geometry, width: -1 } }))).toThrow(/geometry.width/);
  });

  it("makes grayscale series distinguishable by patterns and markers", () => {
    const initial = { ...create(), text: { ...create().text, title: "Custom title" }, axes: { ...create().axes, y: { ...create().axes.y, automaticRange: false, minimum: 10, maximum: 70 } }, series: [...create().series, { ...create().series[0]!, id: "second", datasetId: "second" }] };
    const grayscale = applyPublicationPalette(initial, "grayscale");
    expect(grayscale.series[0]?.color).not.toBe(grayscale.series[1]?.color);
    expect(grayscale.series[0]?.dash).not.toBe(grayscale.series[1]?.dash);
    expect(grayscale.series[0]?.marker).not.toBe(grayscale.series[1]?.marker);
    expect(grayscale.text).toEqual(initial.text);
    expect(grayscale.axes).toEqual(initial.axes);
  });

  it("maps manual ranges, line styles, markers, fonts, and normalized legends into Plotly", () => {
    const initial = create();
    const spec = { ...initial, axes: { ...initial.axes, x: { ...initial.axes.x, automaticRange: false, minimum: 27, maximum: 39, majorTick: 2 }, y: { ...initial.axes.y, automaticRange: false, minimum: 20, maximum: 60, majorTick: 5 } }, legend: { ...initial.legend, position: "manual" as const, x: 0.4, y: 0.3 }, series: initial.series.map((entry) => ({ ...entry, dash: "dashdot" as const, marker: "diamond" as const })) };
    const figure = buildPlotlyPublicationFigure(spec, [{ id: series[0]!.id, x: [27, 28], y: [30, 31] }]);
    expect(figure.data[0]).toMatchObject({ type: "scatter", mode: "lines+markers", line: { dash: "dashdot" }, marker: { color: spec.series[0]!.color, symbol: "diamond-open" } });
    expect(figure.layout.xaxis).toMatchObject({ range: [27, 39], dtick: 2 });
    expect(figure.layout.yaxis).toMatchObject({ range: [20, 60], dtick: 5 });
    expect(figure.layout.legend).toMatchObject({ x: 0.4, y: 0.3, itemsizing: "trace" });
    expect(figure.config.doubleClick).toBe("reset+autosize");
  });

  it("carries series styling to the same dataset and direction when the EMI quantity changes", () => {
    const prior = create().series[0]!;
    const styled = { ...prior, label: "My specimen", visible: false, color: "#123456", widthPt: 2.5, dash: "longdash" as const, marker: "diamond" as const, markerSizePt: 6, markerOpen: true, markerMaxDisplayed: 12, opacity: 0.7, zOrder: 4, smoothing: { enabled: true, windowSize: 7 as const } };
    const next = { ...prior, id: "sample-forward-SEA", metric: "SEA" as const, label: "Default SEA", color: "#abcdef", widthPt: 1 };
    const carried = carryPublicationSeriesStyles([styled], [next])[0]!;
    expect(carried).toMatchObject({ id: "sample-forward-SEA", metric: "SEA", label: "My specimen", visible: false, color: "#123456", widthPt: 2.5, dash: "longdash", marker: "diamond", markerSizePt: 6, markerOpen: true, markerMaxDisplayed: 12, opacity: 0.7, zOrder: 4, smoothing: { enabled: true, windowSize: 7 } });
  });

  it("rejects inverted and nonpositive logarithmic axis ranges", () => {
    const initial = create();
    const inverted = { ...initial, axes: { ...initial.axes, x: { ...initial.axes.x, automaticRange: false, minimum: 40, maximum: 20 } } };
    expect(validatePublicationAxes(inverted).x).toMatch(/minimum must be less/);
    expect(() => parsePublicationFigureSpec(JSON.stringify(inverted))).toThrow();
    const invalidLog = { ...initial, axes: { ...initial.axes, x: { ...initial.axes.x, automaticRange: false, minimum: 0, maximum: 40, scale: "log" as const } } };
    expect(validatePublicationAxes(invalidLog).x).toMatch(/greater than zero/);
  });

  it("maps manual logarithmic ranges and explicit scientific tick formatting correctly", () => {
    const initial = create();
    const spec = { ...initial, axes: { ...initial.axes, x: { ...initial.axes.x, automaticRange: false, minimum: 1, maximum: 100, scale: "log" as const, numberFormat: "scientific" as const, precision: 2 }, y: { ...initial.axes.y, numberFormat: "fixed" as const, precision: 1 } } };
    const figure = buildPlotlyPublicationFigure(spec, [{ id: series[0]!.id, x: [1, 10, 100], y: [30, 31, 32] }]);
    expect(figure.layout.xaxis).toMatchObject({ range: [0, 2], tickformat: ".2e" });
    expect(figure.layout.yaxis).toMatchObject({ tickformat: ".1f" });
  });

  it("reserves canvas space for an outside legend", () => {
    const initial = createPublicationFigureSpec({ metric: "SET", frequencyUnit: "GHz", applicationVersion: "test", engineVersion: "engine", series: [...series, { ...series[0]!, id: "second", datasetId: "second" }] });
    const spec = { ...initial, legend: { ...initial.legend, position: "outside-right" as const } };
    const figure = buildPlotlyPublicationFigure(spec, [{ id: series[0]!.id, x: [27, 28], y: [30, 31] }]);
    expect(figure.layout.margin).toMatchObject({ right: 121 });
    expect(figure.layout.legend).toMatchObject({ orientation: "v" });
  });

  it("does not mutate plotted scientific values when visual styling changes", () => {
    const initial = create();
    const resolved = [{ id: series[0]!.id, x: [27, 28, 29], y: [30, null, 32] }];
    const styled = { ...initial, geometry: { ...initial.geometry, width: 7, height: 4.5 }, text: { ...initial.text, title: "Styled title", titleVisible: true }, legend: { ...initial.legend, position: "outside-right" as const }, series: initial.series.map((entry) => ({ ...entry, color: "#112233", dash: "longdash" as const, widthPt: 2 })) };
    expect(buildPlotlyPublicationFigure(styled, resolved).data[0]).toMatchObject({ x: resolved[0]!.x, y: resolved[0]!.y });
    expect(publicationSeriesCsv(styled, resolved)).toBe(publicationSeriesCsv(initial, resolved));
  });

  it("adds physical SVG dimensions without rasterizing vector content", () => {
    const output = finalizePublicationSvg('<svg class="main-svg" width="336" height="264" viewBox="0 0 336 264"><path d="M0 0L1 1"/><text>SE<tspan dy="2">T</tspan></text></svg>', create());
    expect(output).toContain('width="3.5in"');
    expect(output).toContain('height="2.75in"');
    expect(output).toContain('viewBox="0 0 336 264"');
    expect(output.match(/viewBox=/g)).toHaveLength(1);
    expect(output).toContain("<path");
    expect(output).not.toContain("<image");
  });
});
