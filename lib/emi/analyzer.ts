import {
  calculateEmiStatistics,
  type EmiCalculationResult,
  type EmiDataset,
  type EmiDirection,
  type EmiDirectionalPointResult,
  type EmiFrequencyRange,
  type EmiMetric,
  type EmiValidationIssue,
} from "@max-stoich/chemistry-engine";

export const EMI_METRICS = ["SET", "SER", "SEA", "R", "T", "A"] as const satisfies readonly EmiMetric[];

export interface EmiAnalysisFile {
  readonly id: string;
  readonly dataset: EmiDataset;
  readonly calculation: EmiCalculationResult;
  readonly issues: readonly EmiValidationIssue[];
}

export interface PlotPoint {
  readonly frequencyHz: number;
  readonly value: number;
}

export interface ProcessedEmiRow {
  readonly filename: string;
  readonly direction: EmiDirection;
  readonly frequencyHz: number;
  readonly reflectionReal: number;
  readonly reflectionImaginary: number;
  readonly transmissionReal: number;
  readonly transmissionImaginary: number;
  readonly R: number;
  readonly T: number;
  readonly A: number;
  readonly SET: number | null;
  readonly SER: number | null;
  readonly SEA: number | null;
  readonly validity: "valid" | "warning" | "error";
  readonly validationCodes: readonly string[];
  readonly validationMessages: readonly string[];
}

export interface EmiIssueAggregate {
  readonly code: EmiValidationIssue["code"];
  readonly issues: readonly EmiValidationIssue[];
  readonly count: number;
  readonly minimumFrequencyHz?: number;
  readonly maximumFrequencyHz?: number;
  readonly maximumViolation?: number;
}

function inRange(frequencyHz: number, range: EmiFrequencyRange): boolean {
  return (range.minimumHz === undefined || frequencyHz >= range.minimumHz)
    && (range.maximumHz === undefined || frequencyHz <= range.maximumHz);
}

/** Split a metric into drawable runs. Null and non-finite values create visible plot gaps. */
export function createMetricSegments(
  points: readonly EmiDirectionalPointResult[],
  metric: EmiMetric,
  range: EmiFrequencyRange = {},
): readonly (readonly PlotPoint[])[] {
  const segments: PlotPoint[][] = [];
  let current: PlotPoint[] = [];
  for (const point of points) {
    if (!inRange(point.frequencyHz, range)) continue;
    const value = point[metric];
    if (typeof value !== "number" || !Number.isFinite(value) || !Number.isFinite(point.frequencyHz)) {
      if (current.length > 0) segments.push(current);
      current = [];
      continue;
    }
    current.push({ frequencyHz: point.frequencyHz, value });
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

function issuesForRow(
  issues: readonly EmiValidationIssue[],
  direction: EmiDirection,
  frequencyHz: number,
  rowNumber: number,
): readonly EmiValidationIssue[] {
  return issues.filter((issue) =>
    (issue.direction === undefined || issue.direction === direction)
    && (issue.frequencyHz === frequencyHz || (issue.frequencyHz === undefined && issue.rowNumber === rowNumber)));
}

export function buildProcessedRows(
  dataset: EmiDataset,
  calculation: EmiCalculationResult,
  direction: EmiDirection,
  issues: readonly EmiValidationIssue[],
): readonly ProcessedEmiRow[] {
  const results = calculation[direction];
  return dataset.points.flatMap((source, index) => {
    const result = results[index];
    if (!result) return [];
    const reflection = source[direction === "forward" ? "s11" : "s22"];
    const transmission = source[direction === "forward" ? "s21" : "s12"];
    const rowIssues = issuesForRow(issues, direction, source.frequencyHz, source.rowNumber);
    const validity = rowIssues.some((entry) => entry.severity === "error")
      ? "error"
      : rowIssues.length > 0 ? "warning" : "valid";
    return [{
      filename: dataset.filename,
      direction,
      frequencyHz: source.frequencyHz,
      reflectionReal: reflection.real,
      reflectionImaginary: reflection.imaginary,
      transmissionReal: transmission.real,
      transmissionImaginary: transmission.imaginary,
      R: result.R,
      T: result.T,
      A: result.A,
      SET: result.SET,
      SER: result.SER,
      SEA: result.SEA,
      validity,
      validationCodes: [...new Set(rowIssues.map((entry) => entry.code))],
      validationMessages: rowIssues.map((entry) => entry.message),
    }];
  });
}

function violation(issue: EmiValidationIssue): number | undefined {
  const values = issue.values;
  if (!values) return undefined;
  const finite = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);
  switch (issue.code) {
    case "REFLECTION_GREATER_THAN_ONE": return finite(values.R) ? values.R - 1 : undefined;
    case "TRANSMISSION_GREATER_THAN_ONE": return finite(values.T) ? values.T - 1 : undefined;
    case "POWER_SUM_GREATER_THAN_ONE": return finite(values.R) && finite(values.T) ? values.R + values.T - 1 : undefined;
    case "NEGATIVE_ABSORPTION": return finite(values.A) ? -values.A : undefined;
    case "DECOMPOSITION_RESIDUAL_EXCEEDED": return finite(values.decompositionResidual) ? Math.abs(values.decompositionResidual) : undefined;
    case "S21_S12_DIFFERENCE": return finite(values.absoluteComplexDifference) ? values.absoluteComplexDifference : undefined;
    case "FORWARD_REVERSE_DIFFERENCE": return finite(values.absoluteDifferenceDb) ? values.absoluteDifferenceDb : undefined;
    default: return undefined;
  }
}

export function aggregateEmiIssues(issues: readonly EmiValidationIssue[]): readonly EmiIssueAggregate[] {
  const grouped = new Map<EmiValidationIssue["code"], EmiValidationIssue[]>();
  for (const entry of issues) grouped.set(entry.code, [...(grouped.get(entry.code) ?? []), entry]);
  return [...grouped.entries()].map(([code, entries]) => {
    const frequencies = entries.map((entry) => entry.frequencyHz).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    const violations = entries.map(violation).filter((value): value is number => value !== undefined && Number.isFinite(value));
    return {
      code,
      issues: entries,
      count: entries.length,
      minimumFrequencyHz: frequencies.length > 0 ? Math.min(...frequencies) : undefined,
      maximumFrequencyHz: frequencies.length > 0 ? Math.max(...frequencies) : undefined,
      maximumViolation: violations.length > 0 ? Math.max(...violations) : undefined,
    };
  }).sort((left, right) => left.code.localeCompare(right.code));
}

function csvCell(value: string | number | null): string {
  if (value === null) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows: readonly (readonly (string | number | null)[])[]): string {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

export function createProcessedEmiCsv(files: readonly EmiAnalysisFile[], directions: readonly EmiDirection[]): string {
  const header = ["Original filename", "Direction", "Frequency (Hz)", "Frequency (GHz)", "Reflection real", "Reflection imaginary", "Transmission real", "Transmission imaginary", "R", "T", "A", "SET (dB)", "SER (dB)", "SEA (dB)", "Validity flags", "Validation codes"];
  const rows = files.flatMap((file) => directions.flatMap((direction) =>
    buildProcessedRows(file.dataset, file.calculation, direction, file.issues).map((row) => [
      row.filename, row.direction, row.frequencyHz, row.frequencyHz / 1e9,
      row.reflectionReal, row.reflectionImaginary, row.transmissionReal, row.transmissionImaginary,
      row.R, row.T, row.A, row.SET, row.SER, row.SEA, row.validity, row.validationCodes.join("|"),
    ])));
  return csv([header, ...rows]);
}

export function createSummaryStatisticsCsv(
  files: readonly EmiAnalysisFile[],
  directions: readonly EmiDirection[],
  range: EmiFrequencyRange,
): string {
  const header = ["Original filename", "Direction", "Metric", "Range minimum (Hz)", "Range maximum (Hz)", "Points", "Valid points", "Excluded points", "Valid-point percentage", "Mean", "Median", "Population standard deviation", "Minimum", "Maximum"];
  const rows = files.flatMap((file) => directions.flatMap((direction) => EMI_METRICS.map((metric) => {
    const statistics = calculateEmiStatistics(file.calculation[direction], metric, range);
    return [file.dataset.filename, direction, metric, range.minimumHz ?? "", range.maximumHz ?? "", statistics.count, statistics.validPointCount, statistics.excludedPointCount, statistics.validPointPercentage, statistics.mean, statistics.median, statistics.standardDeviation, statistics.minimum, statistics.maximum];
  })));
  return csv([header, ...rows]);
}
