import type {
  EmiCalculationResult,
  EmiDataset,
  EmiDirection,
  EmiDirectionalPointResult,
  EmiValidationIssue,
  EmiValidationOptions,
} from "./types";

export const DEFAULT_EMI_VALIDATION_OPTIONS = Object.freeze({
  decompositionToleranceDb: 1e-10,
  reciprocityComplexTolerance: 0.05,
  directionalDifferenceToleranceDb: 3,
});

function warning(
  dataset: EmiDataset,
  code: EmiValidationIssue["code"],
  message: string,
  frequencyHz?: number,
  direction?: EmiDirection,
  values?: Readonly<Record<string, number | null>>,
  rowNumber?: number,
): EmiValidationIssue {
  return { severity: "warning", code, message, filename: dataset.filename, frequencyHz, direction, values, rowNumber };
}

const PASSIVITY_CONTEXT = "Possible causes include calibration uncertainty, fixture or reference-plane effects, instrument drift, or malformed data; this check does not identify one definite cause.";

function validateDirection(dataset: EmiDataset, point: EmiDirectionalPointResult, tolerance: number): EmiValidationIssue[] {
  const issues: EmiValidationIssue[] = [];
  const values = { R: point.R, T: point.T, A: point.A, SET: point.SET, SER: point.SER, SEA: point.SEA, decompositionResidual: point.decompositionResidual };
  if (point.R > 1) issues.push(warning(dataset, "REFLECTION_GREATER_THAN_ONE", `Reflection power R exceeds 1. ${PASSIVITY_CONTEXT}`, point.frequencyHz, point.direction, values));
  if (point.T > 1) issues.push(warning(dataset, "TRANSMISSION_GREATER_THAN_ONE", `Transmission power T exceeds 1. ${PASSIVITY_CONTEXT}`, point.frequencyHz, point.direction, values));
  if (point.R + point.T > 1) issues.push(warning(dataset, "POWER_SUM_GREATER_THAN_ONE", `R + T exceeds 1. ${PASSIVITY_CONTEXT}`, point.frequencyHz, point.direction, values));
  if (point.A < 0) issues.push(warning(dataset, "NEGATIVE_ABSORPTION", `Calculated A is negative. ${PASSIVITY_CONTEXT}`, point.frequencyHz, point.direction, values));
  if (point.SET === null) issues.push(warning(dataset, "UNDEFINED_SET", "SET is undefined because T is not finite and greater than zero.", point.frequencyHz, point.direction, values));
  if (point.SER === null) issues.push(warning(dataset, "UNDEFINED_SER", "SER is undefined because 1 - R is not finite and greater than zero.", point.frequencyHz, point.direction, values));
  if (point.SEA === null) issues.push(warning(dataset, "UNDEFINED_SEA", "SEA is undefined because both T and 1 - R must be finite and greater than zero.", point.frequencyHz, point.direction, values));
  if (point.decompositionResidual !== null && Number.isFinite(point.decompositionResidual) && Math.abs(point.decompositionResidual) > tolerance) {
    issues.push(warning(dataset, "DECOMPOSITION_RESIDUAL_EXCEEDED", `SET differs from SER + SEA by more than ${tolerance} dB.`, point.frequencyHz, point.direction, values));
  }
  return issues;
}

/**
 * Validate parser integrity, measured powers, logarithm domains, decomposition,
 * and configurable directional screening thresholds.
 */
export function validateEmiDataset(
  dataset: EmiDataset,
  calculation: EmiCalculationResult,
  options: EmiValidationOptions = {},
): readonly EmiValidationIssue[] {
  const decompositionToleranceDb = options.decompositionToleranceDb ?? DEFAULT_EMI_VALIDATION_OPTIONS.decompositionToleranceDb;
  const reciprocityComplexTolerance = options.reciprocityComplexTolerance ?? DEFAULT_EMI_VALIDATION_OPTIONS.reciprocityComplexTolerance;
  const directionalDifferenceToleranceDb = options.directionalDifferenceToleranceDb ?? DEFAULT_EMI_VALIDATION_OPTIONS.directionalDifferenceToleranceDb;
  const issues: EmiValidationIssue[] = [...dataset.parsingIssues];
  const seen = new Set<number>();
  let previousFrequency: number | undefined;

  dataset.points.forEach((point) => {
    const numericValues = {
      frequencyHz: point.frequencyHz,
      s11Real: point.s11.real, s11Imaginary: point.s11.imaginary,
      s21Real: point.s21.real, s21Imaginary: point.s21.imaginary,
      s22Real: point.s22.real, s22Imaginary: point.s22.imaginary,
      s12Real: point.s12.real, s12Imaginary: point.s12.imaginary,
    };
    for (const [name, value] of Object.entries(numericValues)) {
      if (!Number.isFinite(value)) issues.push(warning(dataset, "NONFINITE_VALUE", `${name} is not finite.`, point.frequencyHz, undefined, { [name]: value }, point.rowNumber));
    }
    if (seen.has(point.frequencyHz)) issues.push(warning(dataset, "DUPLICATE_FREQUENCY", "Frequency is duplicated in the measurement data.", point.frequencyHz, undefined, undefined, point.rowNumber));
    seen.add(point.frequencyHz);
    if (previousFrequency !== undefined && point.frequencyHz < previousFrequency) issues.push(warning(dataset, "NONMONOTONIC_FREQUENCY", "Frequency order decreases relative to the previous measurement row.", point.frequencyHz, undefined, { previousFrequencyHz: previousFrequency }, point.rowNumber));
    previousFrequency = point.frequencyHz;
  });

  for (const point of [...calculation.forward, ...calculation.reverse]) issues.push(...validateDirection(dataset, point, decompositionToleranceDb));
  for (let index = 0; index < dataset.points.length; index += 1) {
    const sourcePoint = dataset.points[index];
    const forward = calculation.forward[index];
    const reverse = calculation.reverse[index];
    if (!sourcePoint || !forward || !reverse) continue;
    const reciprocityDifference = Math.hypot(sourcePoint.s21.real - sourcePoint.s12.real, sourcePoint.s21.imaginary - sourcePoint.s12.imaginary);
    if (Number.isFinite(reciprocityDifference) && reciprocityDifference > reciprocityComplexTolerance) {
      issues.push(warning(dataset, "S21_S12_DIFFERENCE", `The complex difference |S21 - S12| exceeds the configured screening threshold ${reciprocityComplexTolerance}.`, forward.frequencyHz, undefined, { absoluteComplexDifference: reciprocityDifference, forwardT: forward.T, reverseT: reverse.T }));
    }
    const dbDifferences = (["SET", "SER", "SEA"] as const).flatMap((metric) => {
      const left = forward[metric]; const right = reverse[metric];
      return left === null || right === null || !Number.isFinite(left) || !Number.isFinite(right) ? [] : [{ metric, difference: Math.abs(left - right), forward: left, reverse: right }];
    });
    const largest = dbDifferences.sort((left, right) => right.difference - left.difference)[0];
    if (largest && largest.difference > directionalDifferenceToleranceDb) {
      issues.push(warning(dataset, "FORWARD_REVERSE_DIFFERENCE", `Forward/reverse ${largest.metric} differs by more than the configured screening threshold ${directionalDifferenceToleranceDb} dB.`, forward.frequencyHz, undefined, { forward: largest.forward, reverse: largest.reverse, absoluteDifferenceDb: largest.difference }));
    }
  }
  return issues;
}
