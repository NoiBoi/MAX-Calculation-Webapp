import { EMI_ELECTRICAL_CALCULATION_VERSION, FOUR_POINT_PROBE_CORRECTION_FACTOR } from "./scientific-constants";

export type EmiElectricalErrorCode =
  | "MISSING_THICKNESS"
  | "INVALID_THICKNESS"
  | "EMPTY_RESISTANCE_READINGS"
  | "MISSING_RESISTANCE"
  | "INVALID_RESISTANCE"
  | "INVALID_CORRECTION_FACTOR"
  | "INVALID_CONDUCTIVITY"
  | "NONFINITE_RESULT"
  | "MISSING_FREQUENCY"
  | "INVALID_FREQUENCY";

export interface EmiElectricalCalculationError {
  readonly code: EmiElectricalErrorCode;
  readonly message: string;
  readonly readingIndex?: number;
}

export interface ElectricalPropertyInput {
  readonly rawResistanceOhm: number | null | undefined;
  readonly thicknessMicrometers: number | null | undefined;
  readonly correctionFactor?: number;
}

export interface ElectricalPropertyResult {
  readonly rawResistanceOhm: number;
  readonly correctionFactor: number;
  readonly sheetResistanceOhmPerSquare: number;
  readonly thicknessMicrometers: number;
  readonly thicknessMeters: number;
  readonly thicknessCentimeters: number;
  readonly conductivitySiemensPerMeter: number;
  readonly conductivitySiemensPerCentimeter: number;
  readonly resistivityOhmMeter: number;
  readonly resistivityOhmCentimeter: number;
  readonly calculationVersion: typeof EMI_ELECTRICAL_CALCULATION_VERSION;
}

export type ElectricalPropertyCalculation =
  | Readonly<{ ok: true; value: ElectricalPropertyResult }>
  | Readonly<{ ok: false; errors: readonly EmiElectricalCalculationError[] }>;

function positiveFinite(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function calculateElectricalProperty(input: ElectricalPropertyInput): ElectricalPropertyCalculation {
  const errors: EmiElectricalCalculationError[] = [];
  if (input.thicknessMicrometers === null || input.thicknessMicrometers === undefined) errors.push({ code: "MISSING_THICKNESS", message: "Film thickness is required to calculate conductivity." });
  else if (!positiveFinite(input.thicknessMicrometers)) errors.push({ code: "INVALID_THICKNESS", message: "Film thickness must be a finite number greater than zero micrometers." });
  if (input.rawResistanceOhm === null || input.rawResistanceOhm === undefined) errors.push({ code: "MISSING_RESISTANCE", message: "A raw four-point-probe resistance is required." });
  else if (!positiveFinite(input.rawResistanceOhm)) errors.push({ code: "INVALID_RESISTANCE", message: "Raw four-point-probe resistance must be a finite number greater than zero ohms." });
  const correctionFactor = input.correctionFactor ?? FOUR_POINT_PROBE_CORRECTION_FACTOR;
  if (!positiveFinite(correctionFactor)) errors.push({ code: "INVALID_CORRECTION_FACTOR", message: "The four-point-probe correction factor must be finite and greater than zero." });
  if (errors.length > 0) return { ok: false, errors };

  const rawResistanceOhm = input.rawResistanceOhm as number;
  const thicknessMicrometers = input.thicknessMicrometers as number;
  const sheetResistanceOhmPerSquare = correctionFactor * rawResistanceOhm;
  const thicknessMeters = thicknessMicrometers * 1e-6;
  const thicknessCentimeters = thicknessMicrometers * 1e-4;
  const resistivityOhmMeter = sheetResistanceOhmPerSquare * thicknessMeters;
  const conductivitySiemensPerMeter = 1 / resistivityOhmMeter;
  const derivedValues = [sheetResistanceOhmPerSquare, thicknessMeters, thicknessCentimeters, resistivityOhmMeter, conductivitySiemensPerMeter, conductivitySiemensPerMeter / 100, resistivityOhmMeter * 100];
  if (!derivedValues.every(Number.isFinite)) return { ok: false, errors: [{ code: "NONFINITE_RESULT", message: "The electrical inputs produce a nonfinite result at this numeric precision." }] };
  return { ok: true, value: {
    rawResistanceOhm,
    correctionFactor,
    sheetResistanceOhmPerSquare,
    thicknessMicrometers,
    thicknessMeters,
    thicknessCentimeters,
    conductivitySiemensPerMeter,
    conductivitySiemensPerCentimeter: conductivitySiemensPerMeter / 100,
    resistivityOhmMeter,
    resistivityOhmCentimeter: resistivityOhmMeter * 100,
    calculationVersion: EMI_ELECTRICAL_CALCULATION_VERSION,
  } };
}

export interface ElectricalPropertySummary {
  readonly readingCount: number;
  readonly rawResistanceReadingsOhm: readonly number[];
  readonly individualReadings: readonly ElectricalPropertyResult[];
  readonly meanRawResistanceOhm: number;
  readonly aggregate: ElectricalPropertyResult;
  readonly aggregationMethod: "arithmetic-mean-raw-resistance-then-calculate";
}

export type ElectricalPropertySummaryCalculation =
  | Readonly<{ ok: true; value: ElectricalPropertySummary }>
  | Readonly<{ ok: false; errors: readonly EmiElectricalCalculationError[] }>;

/** Aggregate from the arithmetic mean raw resistance; individual conductivities are preserved but never averaged. */
export function calculateElectricalPropertySummary(input: Readonly<{
  rawResistanceReadingsOhm: readonly (number | null | undefined)[];
  thicknessMicrometers: number | null | undefined;
  correctionFactor?: number;
}>): ElectricalPropertySummaryCalculation {
  if (input.rawResistanceReadingsOhm.length === 0) return { ok: false, errors: [{ code: "EMPTY_RESISTANCE_READINGS", message: "Add at least one raw four-point-probe resistance reading." }] };
  const calculations = input.rawResistanceReadingsOhm.map((rawResistanceOhm, readingIndex) => {
    const result = calculateElectricalProperty({ rawResistanceOhm, thicknessMicrometers: input.thicknessMicrometers, correctionFactor: input.correctionFactor });
    return result.ok ? result : { ok: false as const, errors: result.errors.map((error) => ({ ...error, readingIndex })) };
  });
  const errors = calculations.flatMap((result) => result.ok ? [] : result.errors);
  if (errors.length > 0) return { ok: false, errors };
  const individualReadings = calculations.map((result) => (result as Readonly<{ ok: true; value: ElectricalPropertyResult }>).value);
  const rawResistanceReadingsOhm = individualReadings.map((result) => result.rawResistanceOhm);
  const meanRawResistanceOhm = rawResistanceReadingsOhm.reduce((sum, value) => sum + value, 0) / rawResistanceReadingsOhm.length;
  const aggregate = calculateElectricalProperty({ rawResistanceOhm: meanRawResistanceOhm, thicknessMicrometers: input.thicknessMicrometers, correctionFactor: input.correctionFactor });
  if (!aggregate.ok) return aggregate;
  return { ok: true, value: { readingCount: individualReadings.length, rawResistanceReadingsOhm, individualReadings, meanRawResistanceOhm, aggregate: aggregate.value, aggregationMethod: "arithmetic-mean-raw-resistance-then-calculate" } };
}

export interface SimonInput {
  readonly conductivitySiemensPerCentimeter: number | null | undefined;
  readonly frequencyMegahertz: number | null | undefined;
  readonly thicknessCentimeters: number | null | undefined;
}

export interface SimonResult {
  readonly totalShieldingEffectivenessDb: number;
  readonly reflectionTermDb: number;
  readonly absorptionTermDb: number;
}

export type SimonCalculation =
  | Readonly<{ ok: true; value: SimonResult }>
  | Readonly<{ ok: false; errors: readonly EmiElectricalCalculationError[] }>;

/** Simon empirical estimate. Units: S/cm, MHz, cm, and dB. */
export function calculateSimonEstimate(input: SimonInput): SimonCalculation {
  const errors: EmiElectricalCalculationError[] = [];
  if (!positiveFinite(input.conductivitySiemensPerCentimeter)) errors.push({ code: "INVALID_CONDUCTIVITY", message: "Conductivity must be a finite number greater than zero S/cm." });
  if (input.frequencyMegahertz === null || input.frequencyMegahertz === undefined) errors.push({ code: "MISSING_FREQUENCY", message: "Frequency is required for the Simon estimate." });
  else if (!positiveFinite(input.frequencyMegahertz)) errors.push({ code: "INVALID_FREQUENCY", message: "Frequency must be a finite number greater than zero MHz." });
  if (input.thicknessCentimeters === null || input.thicknessCentimeters === undefined) errors.push({ code: "MISSING_THICKNESS", message: "Thickness is required for the Simon estimate." });
  else if (!positiveFinite(input.thicknessCentimeters)) errors.push({ code: "INVALID_THICKNESS", message: "Thickness must be a finite number greater than zero centimeters." });
  if (errors.length > 0) return { ok: false, errors };
  const conductivity = input.conductivitySiemensPerCentimeter as number;
  const frequency = input.frequencyMegahertz as number;
  const thickness = input.thicknessCentimeters as number;
  const reflectionTermDb = 50 + 10 * Math.log10(conductivity / frequency);
  const absorptionTermDb = 1.7 * thickness * Math.sqrt(conductivity * frequency);
  if (!Number.isFinite(reflectionTermDb) || !Number.isFinite(absorptionTermDb) || !Number.isFinite(reflectionTermDb + absorptionTermDb)) return { ok: false, errors: [{ code: "NONFINITE_RESULT", message: "The Simon inputs produce a nonfinite result at this numeric precision." }] };
  return { ok: true, value: { reflectionTermDb, absorptionTermDb, totalShieldingEffectivenessDb: reflectionTermDb + absorptionTermDb } };
}

export interface SimonSeriesPoint extends SimonResult {
  readonly frequencyHz: number;
  readonly frequencyGHz: number;
  readonly theoreticalSetDb: number;
}

/** Generate an unsmoothed theoretical series at the original ordered measured frequencies. */
export function calculateSimonSeries(input: Readonly<{
  frequencyPointsHz: readonly number[];
  conductivitySiemensPerCentimeter: number | null | undefined;
  thicknessMicrometers: number | null | undefined;
}>): readonly SimonSeriesPoint[] | null {
  if (!positiveFinite(input.conductivitySiemensPerCentimeter) || !positiveFinite(input.thicknessMicrometers)) return null;
  const thicknessCentimeters = input.thicknessMicrometers * 1e-4;
  const output: SimonSeriesPoint[] = [];
  for (const frequencyHz of input.frequencyPointsHz) {
    const estimate = calculateSimonEstimate({ conductivitySiemensPerCentimeter: input.conductivitySiemensPerCentimeter, frequencyMegahertz: frequencyHz / 1e6, thicknessCentimeters });
    if (!estimate.ok) return null;
    output.push({ frequencyHz, frequencyGHz: frequencyHz / 1e9, theoreticalSetDb: estimate.value.totalShieldingEffectivenessDb, ...estimate.value });
  }
  return output;
}
