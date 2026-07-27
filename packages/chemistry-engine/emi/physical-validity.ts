import type { EmiDirectionalPointResult } from "./types";

/** Numerical comparison epsilon only; measured values are never changed or clamped. */
export const EMI_PHYSICAL_EPSILON = 1e-12;

export type EmiPhysicalValidityCode =
  | "NONFINITE_RESULT"
  | "REFLECTION_BELOW_ZERO"
  | "REFLECTION_ABOVE_ONE"
  | "TRANSMISSION_BELOW_ZERO"
  | "TRANSMISSION_ABOVE_ONE"
  | "POWER_SUM_ABOVE_ONE"
  | "NEGATIVE_ABSORPTION"
  | "SET_DOMAIN_INVALID"
  | "SER_DOMAIN_INVALID"
  | "SEA_DOMAIN_INVALID";

export interface EmiPhysicalValidityDiagnostic {
  readonly status: "valid" | "warning" | "invalid";
  readonly frequencyHz: number;
  readonly powerBalanceResidual: number;
  readonly decompositionValid: boolean;
  readonly reasonCodes: readonly EmiPhysicalValidityCode[];
  readonly reasons: readonly string[];
}

const messages: Readonly<Record<EmiPhysicalValidityCode, string>> = {
  NONFINITE_RESULT: "One or more calculated power coefficients are non-finite.",
  REFLECTION_BELOW_ZERO: "Measured reflectance is below 0.",
  REFLECTION_ABOVE_ONE: "Measured reflectance is greater than 1.",
  TRANSMISSION_BELOW_ZERO: "Measured transmittance is below 0.",
  TRANSMISSION_ABOVE_ONE: "Measured transmittance is greater than 1.",
  POWER_SUM_ABOVE_ONE: "Measured R + T is greater than 1.",
  NEGATIVE_ABSORPTION: "Calculated absorptance is below 0.",
  SET_DOMAIN_INVALID: "SET is unavailable because measured T is not finite and greater than 0.",
  SER_DOMAIN_INVALID: "SER is unavailable because measured 1 - R is not finite and greater than 0.",
  SEA_DOMAIN_INVALID: "SEA is unavailable because measured T and 1 - R are not both finite and greater than 0.",
};

export function diagnoseEmiPhysicalValidity(point: EmiDirectionalPointResult): EmiPhysicalValidityDiagnostic {
  const codes: EmiPhysicalValidityCode[] = [];
  if (![point.R, point.T, point.A].every(Number.isFinite)) codes.push("NONFINITE_RESULT");
  if (point.R < -EMI_PHYSICAL_EPSILON) codes.push("REFLECTION_BELOW_ZERO");
  if (point.R > 1 + EMI_PHYSICAL_EPSILON) codes.push("REFLECTION_ABOVE_ONE");
  if (point.T < -EMI_PHYSICAL_EPSILON) codes.push("TRANSMISSION_BELOW_ZERO");
  if (point.T > 1 + EMI_PHYSICAL_EPSILON) codes.push("TRANSMISSION_ABOVE_ONE");
  if (point.R + point.T > 1 + EMI_PHYSICAL_EPSILON) codes.push("POWER_SUM_ABOVE_ONE");
  if (point.A < -EMI_PHYSICAL_EPSILON) codes.push("NEGATIVE_ABSORPTION");
  if (point.SET === null) codes.push("SET_DOMAIN_INVALID");
  if (point.SER === null) codes.push("SER_DOMAIN_INVALID");
  if (point.SEA === null) codes.push("SEA_DOMAIN_INVALID");
  const reasonCodes = [...new Set(codes)];
  const decompositionValid = point.SET !== null && point.SER !== null && point.SEA !== null && [point.SET, point.SER, point.SEA].every(Number.isFinite);
  const invalid = reasonCodes.some((code) => code === "NONFINITE_RESULT" || code.endsWith("DOMAIN_INVALID"));
  return {
    status: reasonCodes.length === 0 ? "valid" : invalid ? "invalid" : "warning",
    frequencyHz: point.frequencyHz,
    powerBalanceResidual: point.R + point.T + point.A - 1,
    decompositionValid,
    reasonCodes,
    reasons: reasonCodes.map((code) => messages[code]),
  };
}

export interface EmiPhysicalValiditySummary {
  readonly pointCount: number;
  readonly validCount: number;
  readonly warningCount: number;
  readonly invalidCount: number;
  readonly affectedPercentage: number;
  readonly minimumR: number | null;
  readonly maximumR: number | null;
  readonly minimumT: number | null;
  readonly maximumT: number | null;
  readonly minimumA: number | null;
  readonly maximumA: number | null;
  readonly mostSevereFrequencyHz: number | null;
  readonly mostSevereMagnitude: number | null;
}

export function summarizeEmiPhysicalValidity(points: readonly EmiDirectionalPointResult[]): EmiPhysicalValiditySummary {
  const diagnostics = points.map(diagnoseEmiPhysicalValidity);
  const finite = (key: "R" | "T" | "A") => points.map((point) => point[key]).filter(Number.isFinite);
  const values = (key: "R" | "T" | "A") => { const items = finite(key); return { minimum: items.length ? Math.min(...items) : null, maximum: items.length ? Math.max(...items) : null }; };
  const scored = points.map((point) => ({ frequencyHz: point.frequencyHz, magnitude: Math.max(0, point.R - 1, point.T - 1, point.R + point.T - 1, -point.R, -point.T, -point.A) })).filter((item) => Number.isFinite(item.magnitude) && item.magnitude > EMI_PHYSICAL_EPSILON).sort((left, right) => right.magnitude - left.magnitude)[0];
  const R = values("R"); const T = values("T"); const A = values("A");
  const warningCount = diagnostics.filter((item) => item.status === "warning").length;
  const invalidCount = diagnostics.filter((item) => item.status === "invalid").length;
  return { pointCount: points.length, validCount: points.length - warningCount - invalidCount, warningCount, invalidCount, affectedPercentage: points.length ? ((warningCount + invalidCount) / points.length) * 100 : 0, minimumR: R.minimum, maximumR: R.maximum, minimumT: T.minimum, maximumT: T.maximum, minimumA: A.minimum, maximumA: A.maximum, mostSevereFrequencyHz: scored?.frequencyHz ?? null, mostSevereMagnitude: scored?.magnitude ?? null };
}
