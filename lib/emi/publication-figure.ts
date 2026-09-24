import { z } from "zod";
import type { EmiDirection, EmiMetric } from "@max-stoich/chemistry-engine";

export const PUBLICATION_FIGURE_SCHEMA_VERSION = "1.0.0" as const;
export const PUBLICATION_FIGURE_RENDERER_VERSION = "plotly-basic-4.1.1" as const;

export const FIGURE_LENGTH_UNITS = ["in", "mm", "cm", "px"] as const;
export type FigureLengthUnit = (typeof FIGURE_LENGTH_UNITS)[number];
export type FigureFontRole = "title" | "subtitle" | "axisTitle" | "tick" | "legend" | "annotation" | "panelLabel";
export type FigureDash = "solid" | "dash" | "dot" | "dashdot" | "longdash" | "longdashdot";
export type FigureMarker = "none" | "circle" | "square" | "triangle-up" | "diamond" | "cross" | "plus";
export type FigureLegendPosition = "upper-left" | "upper-center" | "upper-right" | "center-left" | "center" | "center-right" | "lower-left" | "lower-center" | "lower-right" | "outside-top" | "outside-bottom" | "outside-right" | "manual";

export interface FigureFontSpec {
  readonly family: string;
  readonly sizePt: number;
  readonly weight: "normal" | "bold";
  readonly style: "normal" | "italic";
}

export interface PublicationSeriesSpec {
  readonly id: string;
  readonly datasetId: string;
  readonly direction: EmiDirection | "aggregate" | "theoretical";
  readonly metric: EmiMetric;
  readonly label: string;
  readonly visible: boolean;
  readonly color: string;
  readonly widthPt: number;
  readonly dash: FigureDash;
  readonly marker: FigureMarker;
  readonly markerSizePt: number;
  readonly markerOpen: boolean;
  readonly markerMaxDisplayed: number;
  readonly opacity: number;
  readonly zOrder: number;
  readonly smoothing: Readonly<{ enabled: boolean; windowSize: 3 | 5 | 7 | 11 }>;
}

export interface PublicationFigureSpec {
  readonly schemaVersion: typeof PUBLICATION_FIGURE_SCHEMA_VERSION;
  readonly rendererVersion: typeof PUBLICATION_FIGURE_RENDERER_VERSION;
  readonly id: string;
  readonly name: string;
  readonly metric: EmiMetric;
  readonly frequencyUnit: "GHz" | "Hz";
  readonly geometry: Readonly<{
    width: number;
    height: number;
    unit: FigureLengthUnit;
    aspectRatioLocked: boolean;
    dpi: number;
    background: "white" | "transparent";
    margin: Readonly<{ top: number; right: number; bottom: number; left: number }>;
  }>;
  readonly text: Readonly<{
    title: string;
    titleVisible: boolean;
    titleAlignment: "left" | "center" | "right";
    titleSpacingPt: number;
    subtitle: string;
    subtitleVisible: boolean;
    subtitleAlignment: "left" | "center" | "right";
    subtitleSpacingPt: number;
    panelLabel: string;
    panelLabelVisible: boolean;
    panelLabelX: number;
    panelLabelY: number;
  }>;
  readonly fonts: Readonly<Record<FigureFontRole, FigureFontSpec>>;
  readonly axes: Readonly<{
    x: Readonly<{ label: string; automaticRange: boolean; minimum?: number; maximum?: number; majorTick?: number; minorTicks: boolean; scale: "linear" | "log"; numberFormat: "auto" | "fixed" | "scientific"; precision: number; labelPaddingPt: number; tickLabelPaddingPt: number }>;
    y: Readonly<{ label: string; automaticRange: boolean; minimum?: number; maximum?: number; majorTick?: number; minorTicks: boolean; scale: "linear"; numberFormat: "auto" | "fixed" | "scientific"; precision: number; labelPaddingPt: number; tickLabelPaddingPt: number }>;
    tickDirection: "inside" | "outside";
    tickLengthPt: number;
    tickWidthPt: number;
    axisWidthPt: number;
    majorGrid: boolean;
    minorGrid: boolean;
  }>;
  readonly legend: Readonly<{
    visible: boolean;
    position: FigureLegendPosition;
    x: number;
    y: number;
    columns: number;
    sampleLengthPx: number;
    rowSpacingPx: number;
    columnSpacingPx: number;
    textGapPx: number;
    frame: boolean;
    borderWidthPt: number;
    background: boolean;
    paddingPx: number;
  }>;
  readonly palette: "colorblind-safe" | "muted-scientific" | "high-contrast" | "grayscale";
  readonly series: readonly PublicationSeriesSpec[];
  readonly applicationVersion: string;
  readonly engineVersion: string;
}

export interface PublicationResolvedSeries {
  readonly id: string;
  readonly x: readonly number[];
  readonly y: readonly (number | null)[];
}

export interface PublicationAxisValidation {
  readonly x?: string;
  readonly y?: string;
}

export const PUBLICATION_PALETTES = {
  "colorblind-safe": ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00", "#56B4E9", "#000000"],
  "muted-scientific": ["#3B6FB6", "#C46A3A", "#4F8A6B", "#8A6FB0", "#A8863D", "#547C8C", "#5A5A5A"],
  "high-contrast": ["#000000", "#0057B8", "#D41159", "#008450", "#F2A900", "#7A3E9D", "#00A6D6"],
  grayscale: ["#000000", "#333333", "#666666", "#888888", "#AAAAAA", "#555555", "#777777"],
} as const;

export const PUBLICATION_DASH_SEQUENCE: readonly FigureDash[] = ["solid", "dash", "dot", "dashdot", "longdash", "longdashdot"];
export const PUBLICATION_MARKER_SEQUENCE: readonly FigureMarker[] = ["circle", "square", "triangle-up", "diamond", "cross", "plus"];
export const PUBLICATION_FONT_OPTIONS = [
  "Arial, Helvetica, sans-serif",
  "Times New Roman, Times, serif",
  "Georgia, Times, serif",
  "Helvetica, Arial, sans-serif",
  "system-ui, sans-serif",
] as const;

const fontSchema = z.object({ family: z.string().min(1), sizePt: z.number().positive().max(96), weight: z.enum(["normal", "bold"]), style: z.enum(["normal", "italic"]) });
const seriesSchema = z.object({
  id: z.string().min(1), datasetId: z.string(), direction: z.enum(["forward", "reverse", "aggregate", "theoretical"]), metric: z.enum(["SET", "SER", "SEA", "R", "T", "A"]), label: z.string(), visible: z.boolean(), color: z.string().regex(/^#[0-9a-f]{6}$/i), widthPt: z.number().positive().max(20), dash: z.enum(PUBLICATION_DASH_SEQUENCE as [FigureDash, ...FigureDash[]]), marker: z.enum(["none", "circle", "square", "triangle-up", "diamond", "cross", "plus"]), markerSizePt: z.number().nonnegative().max(40), markerOpen: z.boolean(), markerMaxDisplayed: z.number().int().nonnegative().max(10000), opacity: z.number().min(0).max(1), zOrder: z.number().int(), smoothing: z.object({ enabled: z.boolean(), windowSize: z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(11)]) }),
});

const figureSchema = z.object({
  schemaVersion: z.literal(PUBLICATION_FIGURE_SCHEMA_VERSION), rendererVersion: z.literal(PUBLICATION_FIGURE_RENDERER_VERSION), id: z.string().min(1), name: z.string().min(1), metric: z.enum(["SET", "SER", "SEA", "R", "T", "A"]), frequencyUnit: z.enum(["GHz", "Hz"]),
  geometry: z.object({ width: z.number().positive(), height: z.number().positive(), unit: z.enum(FIGURE_LENGTH_UNITS), aspectRatioLocked: z.boolean(), dpi: z.number().int().min(72).max(2400), background: z.enum(["white", "transparent"]), margin: z.object({ top: z.number().nonnegative(), right: z.number().nonnegative(), bottom: z.number().nonnegative(), left: z.number().nonnegative() }) }),
  text: z.object({ title: z.string(), titleVisible: z.boolean(), titleAlignment: z.enum(["left", "center", "right"]), titleSpacingPt: z.number().nonnegative(), subtitle: z.string(), subtitleVisible: z.boolean(), subtitleAlignment: z.enum(["left", "center", "right"]), subtitleSpacingPt: z.number().nonnegative(), panelLabel: z.string(), panelLabelVisible: z.boolean(), panelLabelX: z.number(), panelLabelY: z.number() }),
  fonts: z.object({ title: fontSchema, subtitle: fontSchema, axisTitle: fontSchema, tick: fontSchema, legend: fontSchema, annotation: fontSchema, panelLabel: fontSchema }),
  axes: z.object({ x: z.object({ label: z.string(), automaticRange: z.boolean(), minimum: z.number().optional(), maximum: z.number().optional(), majorTick: z.number().positive().optional(), minorTicks: z.boolean(), scale: z.enum(["linear", "log"]), numberFormat: z.enum(["auto", "fixed", "scientific"]).default("auto"), precision: z.number().int().min(0).max(12).default(4), labelPaddingPt: z.number().nonnegative(), tickLabelPaddingPt: z.number().nonnegative() }), y: z.object({ label: z.string(), automaticRange: z.boolean(), minimum: z.number().optional(), maximum: z.number().optional(), majorTick: z.number().positive().optional(), minorTicks: z.boolean(), scale: z.literal("linear"), numberFormat: z.enum(["auto", "fixed", "scientific"]).default("auto"), precision: z.number().int().min(0).max(12).default(4), labelPaddingPt: z.number().nonnegative(), tickLabelPaddingPt: z.number().nonnegative() }), tickDirection: z.enum(["inside", "outside"]), tickLengthPt: z.number().nonnegative(), tickWidthPt: z.number().positive(), axisWidthPt: z.number().positive(), majorGrid: z.boolean(), minorGrid: z.boolean() }),
  legend: z.object({ visible: z.boolean(), position: z.enum(["upper-left", "upper-center", "upper-right", "center-left", "center", "center-right", "lower-left", "lower-center", "lower-right", "outside-top", "outside-bottom", "outside-right", "manual"]), x: z.number(), y: z.number(), columns: z.number().int().min(1).max(12), sampleLengthPx: z.number().min(15).max(200), rowSpacingPx: z.number().nonnegative(), columnSpacingPx: z.number().nonnegative(), textGapPx: z.number().nonnegative(), frame: z.boolean(), borderWidthPt: z.number().nonnegative(), background: z.boolean(), paddingPx: z.number().nonnegative() }),
  palette: z.enum(["colorblind-safe", "muted-scientific", "high-contrast", "grayscale"]), series: z.array(seriesSchema), applicationVersion: z.string(), engineVersion: z.string(),
}).superRefine((value, context) => {
  const errors = validatePublicationAxes(value as PublicationFigureSpec);
  if (errors.x) context.addIssue({ code: "custom", path: ["axes", "x"], message: errors.x });
  if (errors.y) context.addIssue({ code: "custom", path: ["axes", "y"], message: errors.y });
});

const baseFont = (sizePt: number, weight: "normal" | "bold" = "normal"): FigureFontSpec => ({ family: PUBLICATION_FONT_OPTIONS[0], sizePt, weight, style: "normal" });

export function createPublicationFigureSpec(input: Readonly<{ name?: string; metric: EmiMetric; frequencyUnit: "GHz" | "Hz"; applicationVersion: string; engineVersion: string; series: readonly Omit<PublicationSeriesSpec, "color" | "dash" | "marker" | "zOrder">[] }>): PublicationFigureSpec {
  const palette = PUBLICATION_PALETTES["colorblind-safe"];
  return {
    schemaVersion: PUBLICATION_FIGURE_SCHEMA_VERSION, rendererVersion: PUBLICATION_FIGURE_RENDERER_VERSION, id: crypto.randomUUID(), name: input.name ?? `${input.metric} publication figure`, metric: input.metric, frequencyUnit: input.frequencyUnit,
    geometry: { width: 3.5, height: 2.75, unit: "in", aspectRatioLocked: true, dpi: 600, background: "white", margin: { top: 54, right: 18, bottom: 48, left: 58 } },
    text: { title: input.metric === "SET" ? "Total EMI shielding effectiveness" : `${input.metric} versus frequency`, titleVisible: false, titleAlignment: "center", titleSpacingPt: 6, subtitle: "", subtitleVisible: false, subtitleAlignment: "center", subtitleSpacingPt: 3, panelLabel: "(a)", panelLabelVisible: false, panelLabelX: 0.015, panelLabelY: 0.985 },
    fonts: { title: baseFont(10, "bold"), subtitle: baseFont(8), axisTitle: baseFont(9), tick: baseFont(8), legend: baseFont(7), annotation: baseFont(7), panelLabel: baseFont(10, "bold") },
    axes: { x: { label: `Frequency (${input.frequencyUnit})`, automaticRange: true, minorTicks: false, scale: "linear", numberFormat: "auto", precision: 4, labelPaddingPt: 8, tickLabelPaddingPt: 3 }, y: { label: ["SET", "SER", "SEA"].includes(input.metric) ? "Shielding effectiveness (dB)" : "Incident-power coefficient", automaticRange: true, minorTicks: false, scale: "linear", numberFormat: "auto", precision: 4, labelPaddingPt: 8, tickLabelPaddingPt: 3 }, tickDirection: "outside", tickLengthPt: 3.5, tickWidthPt: 0.75, axisWidthPt: 0.75, majorGrid: false, minorGrid: false },
    legend: { visible: input.series.length > 1, position: "upper-right", x: 0.98, y: 0.98, columns: 1, sampleLengthPx: 40, rowSpacingPx: 2, columnSpacingPx: 12, textGapPx: 6, frame: false, borderWidthPt: 0.6, background: false, paddingPx: 4 },
    palette: "colorblind-safe",
    series: input.series.map((series, index) => ({ ...series, color: palette[index % palette.length]!, dash: PUBLICATION_DASH_SEQUENCE[index % PUBLICATION_DASH_SEQUENCE.length]!, marker: "none", zOrder: index })),
    applicationVersion: input.applicationVersion, engineVersion: input.engineVersion,
  };
}

export function physicalSizeInInches(value: number, unit: FigureLengthUnit): number {
  if (unit === "in") return value;
  if (unit === "mm") return value / 25.4;
  if (unit === "cm") return value / 2.54;
  return value / 96;
}

export function convertFigureLength(value: number, from: FigureLengthUnit, to: FigureLengthUnit): number {
  const inches = physicalSizeInInches(value, from);
  if (to === "in") return inches;
  if (to === "mm") return inches * 25.4;
  if (to === "cm") return inches * 2.54;
  return inches * 96;
}

export function validatePublicationAxes(spec: Pick<PublicationFigureSpec, "axes">): PublicationAxisValidation {
  const validate = (axis: PublicationFigureSpec["axes"]["x"] | PublicationFigureSpec["axes"]["y"], label: string): string | undefined => {
    if (axis.automaticRange) return undefined;
    if (axis.minimum === undefined || axis.maximum === undefined || !Number.isFinite(axis.minimum) || !Number.isFinite(axis.maximum)) return `${label} minimum and maximum are required.`;
    if (axis.minimum >= axis.maximum) return `${label} minimum must be less than its maximum.`;
    if ("scale" in axis && axis.scale === "log" && axis.minimum <= 0) return `${label} minimum must be greater than zero for a logarithmic scale.`;
    return undefined;
  };
  return { x: validate(spec.axes.x, "X-axis"), y: validate(spec.axes.y, "Y-axis") };
}

export function figurePreviewPixels(spec: PublicationFigureSpec): Readonly<{ width: number; height: number }> {
  return { width: Math.max(1, Math.round(physicalSizeInInches(spec.geometry.width, spec.geometry.unit) * 96)), height: Math.max(1, Math.round(physicalSizeInInches(spec.geometry.height, spec.geometry.unit) * 96)) };
}

export function figureRasterPixels(spec: PublicationFigureSpec): Readonly<{ width: number; height: number }> {
  return { width: Math.round(physicalSizeInInches(spec.geometry.width, spec.geometry.unit) * spec.geometry.dpi), height: Math.round(physicalSizeInInches(spec.geometry.height, spec.geometry.unit) * spec.geometry.dpi) };
}

export function serializePublicationFigureSpec(spec: PublicationFigureSpec): string { return JSON.stringify(figureSchema.parse(spec), null, 2); }
export function parsePublicationFigureSpec(text: string): PublicationFigureSpec {
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("Figure configuration is not valid JSON."); }
  if (!value || typeof value !== "object") throw new Error("Figure configuration must be a JSON object.");
  const schemaVersion = "schemaVersion" in value ? value.schemaVersion : undefined;
  if (schemaVersion !== PUBLICATION_FIGURE_SCHEMA_VERSION) throw new Error(`Unsupported figure schema version “${String(schemaVersion ?? "missing")}”. Expected ${PUBLICATION_FIGURE_SCHEMA_VERSION}.`);
  const parsed = figureSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const location = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    throw new Error(`Invalid figure configuration. ${location}${issue?.message ?? "Validation failed."}`);
  }
  return parsed.data as PublicationFigureSpec;
}

export function applyPublicationPalette(spec: PublicationFigureSpec, paletteName: PublicationFigureSpec["palette"]): PublicationFigureSpec {
  const colors = PUBLICATION_PALETTES[paletteName];
  let visibleIndex = 0;
  return { ...spec, palette: paletteName, series: spec.series.map((series) => {
    if (!series.visible) return series;
    const index = visibleIndex++;
    return { ...series, color: colors[index % colors.length]!, ...(paletteName === "grayscale" ? { dash: PUBLICATION_DASH_SEQUENCE[index % PUBLICATION_DASH_SEQUENCE.length]!, marker: PUBLICATION_MARKER_SEQUENCE[index % PUBLICATION_MARKER_SEQUENCE.length]! } : {}) };
  }) };
}

export function carryPublicationSeriesStyles(
  previous: readonly PublicationSeriesSpec[],
  replacement: readonly PublicationSeriesSpec[],
): readonly PublicationSeriesSpec[] {
  const bySource = new Map(previous.map((series) => [`${series.datasetId}\u0000${series.direction}`, series]));
  return replacement.map((series) => {
    const prior = bySource.get(`${series.datasetId}\u0000${series.direction}`);
    if (!prior) return series;
    return {
      ...series,
      label: prior.label,
      visible: prior.visible,
      color: prior.color,
      widthPt: prior.widthPt,
      dash: prior.dash,
      marker: prior.marker,
      markerSizePt: prior.markerSizePt,
      markerOpen: prior.markerOpen,
      markerMaxDisplayed: prior.markerMaxDisplayed,
      opacity: prior.opacity,
      zOrder: prior.zOrder,
      smoothing: prior.smoothing,
    };
  });
}

export function publicationSeriesCsv(spec: PublicationFigureSpec, resolved: readonly PublicationResolvedSeries[]): string {
  const byId = new Map(resolved.map((series) => [series.id, series]));
  const rows = [["series_id", "dataset_id", "direction", "metric", "display_label", `frequency_${spec.frequencyUnit}`, "value"]];
  for (const series of spec.series.filter((entry) => entry.visible).sort((a, b) => a.zOrder - b.zOrder)) {
    const values = byId.get(series.id); if (!values) continue;
    values.x.forEach((x, index) => rows.push([series.id, series.datasetId, series.direction, series.metric, series.label, String(x), values.y[index] === null || values.y[index] === undefined ? "" : String(values.y[index])]));
  }
  const escape = (value: string) => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return `${rows.map((row) => row.map(escape).join(",")).join("\r\n")}\r\n`;
}
