import {
  calculateEmiStatistics,
  calculateSimonSeries,
  type EmiDirection,
  type EmiFrequencyRange,
} from "@max-stoich/chemistry-engine";
import { buildProcessedRows, EMI_METRICS, type EmiAnalysisFile } from "./analyzer";
import type { EmiProjectRecord } from "./project";

export type EmiExportCell = string | number | null;
export interface EmiExportColumn { readonly key: string; readonly header: string; readonly kind: "text" | "number"; }
export interface EmiExportTable { readonly name: string; readonly columns: readonly EmiExportColumn[]; readonly rows: readonly Readonly<Record<string, EmiExportCell>>[]; }

function text(key: string, header: string): EmiExportColumn { return { key, header, kind: "text" }; }
function number(key: string, header: string): EmiExportColumn { return { key, header, kind: "number" }; }
function metadata(project: EmiProjectRecord | undefined, id: string) { return project?.datasets.find((entry) => entry.id === id); }

export function buildDirectionalProcessedExport(project: EmiProjectRecord | undefined, files: readonly EmiAnalysisFile[], directions: readonly EmiDirection[]): EmiExportTable {
  const columns = [
    text("originalFilename", "Original filename"), text("direction", "Direction"),
    number("frequencyHz", "Frequency (Hz)"), number("frequencyGHz", "Frequency (GHz)"),
    number("reflectionReal", "Reflection real"), number("reflectionImaginary", "Reflection imaginary"), number("transmissionReal", "Transmission real"), number("transmissionImaginary", "Transmission imaginary"),
    number("R", "R"), number("T", "T"), number("A", "A"), number("SET", "SET (dB)"), number("SER", "SER (dB)"), number("SEA", "SEA (dB)"),
    text("validity", "Validity flags"), text("validationCodes", "Validation codes"), text("displayName", "Display name"), text("sampleId", "Sample ID"),
    number("simonTotal", "Simon theoretical EMI SE (dB)"), number("simonReflection", "Simon reflection term (dB)"), number("simonAbsorption", "Simon absorption term (dB)"),
  ];
  const rows = files.flatMap((file) => directions.flatMap((direction) => {
    const sample = metadata(project, file.id)?.sampleMetadata;
    const electrical = metadata(project, file.id)?.electricalProperties?.derived?.aggregate;
    const simon = electrical ? calculateSimonSeries({ frequencyPointsHz: file.dataset.points.map((point) => point.frequencyHz), conductivitySiemensPerCentimeter: electrical.conductivitySiemensPerCentimeter, thicknessMicrometers: electrical.thicknessMicrometers }) : null;
    return buildProcessedRows(file.dataset, file.calculation, direction, file.issues).map((row, index) => ({
      originalFilename: row.filename, displayName: sample?.displayName ?? row.filename, sampleId: sample?.sampleId ?? "", direction: row.direction,
      frequencyHz: row.frequencyHz, frequencyGHz: row.frequencyHz / 1e9,
      reflectionReal: row.reflectionReal, reflectionImaginary: row.reflectionImaginary, transmissionReal: row.transmissionReal, transmissionImaginary: row.transmissionImaginary,
      R: row.R, T: row.T, A: row.A, SET: row.SET, SER: row.SER, SEA: row.SEA, validity: row.validity, validationCodes: row.validationCodes.join("|"), simonTotal: simon?.[index]?.theoreticalSetDb ?? null, simonReflection: simon?.[index]?.reflectionTermDb ?? null, simonAbsorption: simon?.[index]?.absorptionTermDb ?? null,
    }));
  }));
  return { name: "Directional Data", columns, rows };
}

export function buildFrequencyResolvedExport(project: EmiProjectRecord, files: readonly EmiAnalysisFile[]): EmiExportTable {
  const columns = [
    text("originalFilename", "Original filename"), text("displayName", "Display name"), text("sampleId", "Sample ID"), number("frequencyHz", "Frequency (Hz)"), number("frequencyGHz", "Frequency (GHz)"),
    number("s11Real", "S11 real"), number("s11Imaginary", "S11 imaginary"), number("s21Real", "S21 real"), number("s21Imaginary", "S21 imaginary"), number("s22Real", "S22 real"), number("s22Imaginary", "S22 imaginary"), number("s12Real", "S12 real"), number("s12Imaginary", "S12 imaginary"),
    number("forwardSET", "Forward measured SET (dB)"), number("forwardSER", "Forward measured SER (dB)"), number("forwardSEA", "Forward measured SEA (dB)"), number("forwardR", "Forward R"), number("forwardT", "Forward T"), number("forwardA", "Forward A"),
    number("reverseSET", "Reverse measured SET (dB)"), number("reverseSER", "Reverse measured SER (dB)"), number("reverseSEA", "Reverse measured SEA (dB)"), number("reverseR", "Reverse R"), number("reverseT", "Reverse T"), number("reverseA", "Reverse A"),
    number("simonTotal", "Simon theoretical EMI SE (dB)"), number("simonReflection", "Simon reflection term (dB)"), number("simonAbsorption", "Simon absorption term (dB)"),
  ];
  const rows = files.flatMap((file) => {
    const entry = metadata(project, file.id);
    const electrical = entry?.electricalProperties?.derived?.aggregate;
    const simon = electrical ? calculateSimonSeries({ frequencyPointsHz: file.dataset.points.map((point) => point.frequencyHz), conductivitySiemensPerCentimeter: electrical.conductivitySiemensPerCentimeter, thicknessMicrometers: electrical.thicknessMicrometers }) : null;
    return file.dataset.points.map((point, index) => {
      const forward = file.calculation.forward[index]; const reverse = file.calculation.reverse[index]; const theoretical = simon?.[index];
      return {
        originalFilename: file.dataset.filename, displayName: entry?.sampleMetadata.displayName ?? file.dataset.filename, sampleId: entry?.sampleMetadata.sampleId ?? "", frequencyHz: point.frequencyHz, frequencyGHz: point.frequencyHz / 1e9,
        s11Real: point.s11.real, s11Imaginary: point.s11.imaginary, s21Real: point.s21.real, s21Imaginary: point.s21.imaginary, s22Real: point.s22.real, s22Imaginary: point.s22.imaginary, s12Real: point.s12.real, s12Imaginary: point.s12.imaginary,
        forwardSET: forward?.SET ?? null, forwardSER: forward?.SER ?? null, forwardSEA: forward?.SEA ?? null, forwardR: forward?.R ?? null, forwardT: forward?.T ?? null, forwardA: forward?.A ?? null,
        reverseSET: reverse?.SET ?? null, reverseSER: reverse?.SER ?? null, reverseSEA: reverse?.SEA ?? null, reverseR: reverse?.R ?? null, reverseT: reverse?.T ?? null, reverseA: reverse?.A ?? null,
        simonTotal: theoretical?.theoreticalSetDb ?? null, simonReflection: theoretical?.reflectionTermDb ?? null, simonAbsorption: theoretical?.absorptionTermDb ?? null,
      };
    });
  });
  return { name: "Frequency Data", columns, rows };
}

export function buildSummaryExport(project: EmiProjectRecord | undefined, files: readonly EmiAnalysisFile[], directions: readonly EmiDirection[], range: EmiFrequencyRange): EmiExportTable {
  const columns = [text("originalFilename", "Original filename"), text("direction", "Direction"), text("metric", "Metric"), number("minimumHz", "Range minimum (Hz)"), number("maximumHz", "Range maximum (Hz)"), number("count", "Points"), number("valid", "Valid points"), number("excluded", "Excluded points"), number("validPercentage", "Valid-point percentage"), number("mean", "Mean"), number("median", "Median"), number("standardDeviation", "Population standard deviation"), number("minimum", "Minimum"), number("maximum", "Maximum"), text("displayName", "Display name"), text("sampleId", "Sample ID")];
  const rows = files.flatMap((file) => directions.flatMap((direction) => EMI_METRICS.map((metric) => {
    const sample = metadata(project, file.id)?.sampleMetadata; const statistics = calculateEmiStatistics(file.calculation[direction], metric, range);
    return { originalFilename: file.dataset.filename, displayName: sample?.displayName ?? file.dataset.filename, sampleId: sample?.sampleId ?? "", direction, metric, minimumHz: range.minimumHz ?? null, maximumHz: range.maximumHz ?? null, count: statistics.count, valid: statistics.validPointCount, excluded: statistics.excludedPointCount, validPercentage: statistics.validPointPercentage, mean: statistics.mean, median: statistics.median, standardDeviation: statistics.standardDeviation, minimum: statistics.minimum, maximum: statistics.maximum };
  })));
  return { name: "Summary Statistics", columns, rows };
}

export function buildElectricalPropertiesExport(project: EmiProjectRecord): EmiExportTable {
  const columns = [text("displayName", "Sample name"), text("datasetId", "Dataset ID"), text("sampleId", "Sample ID"), number("thicknessUm", "Thickness (µm)"), number("readingNumber", "Raw resistance reading number"), number("rawResistance", "Raw resistance (Ω)"), number("correctionFactor", "Correction factor"), number("sheetResistance", "Sheet resistance (Ω/sq)"), number("meanRawResistance", "Mean raw resistance (Ω)"), number("conductivitySm", "Conductivity (S/m)"), number("conductivityScm", "Conductivity (S/cm)"), number("resistivityOhmM", "Resistivity (Ω·m)"), number("resistivityOhmCm", "Resistivity (Ω·cm)"), text("aggregation", "Aggregation method"), text("calculationVersion", "Calculation version"), text("measurementNote", "Measurement note")];
  const rows = project.datasets.flatMap((entry) => {
    const electrical = entry.electricalProperties; const derived = electrical?.derived; const readings = electrical?.rawResistanceReadingsOhm ?? [];
    const source: readonly (number | null)[] = readings.length > 0 ? readings : [null];
    return source.map((reading, index) => ({ displayName: entry.sampleMetadata.displayName, datasetId: entry.id, sampleId: entry.sampleMetadata.sampleId ?? "", thicknessUm: electrical?.thicknessMicrometers ?? null, readingNumber: readings.length > 0 ? index + 1 : null, rawResistance: reading, correctionFactor: electrical?.correctionFactor ?? null, sheetResistance: derived?.individualReadings[index]?.sheetResistanceOhmPerSquare ?? null, meanRawResistance: derived?.meanRawResistanceOhm ?? null, conductivitySm: derived?.aggregate.conductivitySiemensPerMeter ?? null, conductivityScm: derived?.aggregate.conductivitySiemensPerCentimeter ?? null, resistivityOhmM: derived?.aggregate.resistivityOhmMeter ?? null, resistivityOhmCm: derived?.aggregate.resistivityOhmCentimeter ?? null, aggregation: derived?.aggregationMethod ?? "", calculationVersion: electrical?.calculationVersion ?? "", measurementNote: electrical?.measurementNote ?? "" }));
  });
  return { name: "Electrical Properties", columns, rows };
}

export function buildEmiExportTables(project: EmiProjectRecord, files: readonly EmiAnalysisFile[], directions: readonly EmiDirection[], range: EmiFrequencyRange): readonly EmiExportTable[] {
  return [buildFrequencyResolvedExport(project, files), buildDirectionalProcessedExport(project, files, directions), buildSummaryExport(project, files, directions, range), buildElectricalPropertiesExport(project)];
}

export function exportTableToCsv(table: EmiExportTable): string {
  const cell = (value: EmiExportCell): string => { if (value === null) return ""; const output = String(value); return /[",\r\n]/.test(output) ? `"${output.replaceAll('"', '""')}"` : output; };
  return `${[table.columns.map((column) => column.header), ...table.rows.map((row) => table.columns.map((column) => row[column.key] ?? null))].map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
}
