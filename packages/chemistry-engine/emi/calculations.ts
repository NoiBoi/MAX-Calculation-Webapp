import type { EmiCalculationResult, EmiDataset, EmiDirection, EmiDirectionalPointResult, EmiFrequencyPoint } from "./types";

function magnitudeSquared(real: number, imaginary: number): number {
  return real * real + imaginary * imaginary;
}

/** Calculate one directional EMI result without clamping measured powers. */
export function calculateEmiPoint(point: EmiFrequencyPoint, direction: EmiDirection): EmiDirectionalPointResult {
  const reflectionParameter = direction === "forward" ? "s11" : "s22";
  const transmissionParameter = direction === "forward" ? "s21" : "s12";
  const reflection = point[reflectionParameter];
  const transmission = point[transmissionParameter];
  const R = magnitudeSquared(reflection.real, reflection.imaginary);
  const T = magnitudeSquared(transmission.real, transmission.imaginary);
  const A = 1 - R - T;
  const oneMinusR = 1 - R;
  const validT = Number.isFinite(T) && T > 0;
  const validOneMinusR = Number.isFinite(oneMinusR) && oneMinusR > 0;
  const SET = validT ? -10 * Math.log10(T) : null;
  const SER = validOneMinusR ? -10 * Math.log10(oneMinusR) : null;
  const SEA = validT && validOneMinusR ? -10 * Math.log10(T / oneMinusR) : null;
  const decompositionResidual = SET !== null && SER !== null && SEA !== null ? SET - SER - SEA : null;
  return { direction, frequencyHz: point.frequencyHz, reflectionParameter, transmissionParameter, R, T, A, SET, SER, SEA, decompositionResidual };
}

/** Calculate forward and reverse results in the original frequency-row order. */
export function calculateEmiDataset(dataset: EmiDataset): EmiCalculationResult {
  return {
    filename: dataset.filename,
    forward: dataset.points.map((point) => calculateEmiPoint(point, "forward")),
    reverse: dataset.points.map((point) => calculateEmiPoint(point, "reverse")),
  };
}
