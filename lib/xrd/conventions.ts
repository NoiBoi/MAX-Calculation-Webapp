/** Canonical XRD units and sign conventions used at every MAXCalc boundary. */
export const XRD_CONVENTIONS = {
  twoTheta: { internalUnit: "degree", displayUnit: "° 2θ", persisted: true },
  theta: { internalUnit: "radian", displayUnit: "not persisted", persisted: false },
  wavelength: { internalUnit: "angstrom", displayUnit: "Å", persisted: true },
  dSpacing: { internalUnit: "angstrom", displayUnit: "Å", persisted: true },
  fwhm: { internalUnit: "degree two-theta", displayUnit: "° 2θ", persisted: true },
  deltaTwoTheta: { sign: "experimental-minus-calculated", unit: "degree two-theta" },
  zeroShift: { sign: "added-to-calculated-two-theta", unit: "degree two-theta" },
  pseudoVoigtAmplitude: { meaning: "integrated area", unit: "intensity-times-degree" },
  pseudoVoigtHeight: { meaning: "fitted maximum above local background", unit: "intensity" },
  theoreticalIntensity: { meaning: "calculated relative intensity normalized to strongest reflection", range: "0-100" },
} as const;

export const XRD_RADIATION_PRESETS = {
  CuKa: { label: "Cu Kα weighted average (pymatgen CuKa)", wavelengthAngstrom: 1.54184 },
  CuKa1: { label: "Cu Kα1", wavelengthAngstrom: 1.54056 },
} as const;

export type XRDRadiationPreset = keyof typeof XRD_RADIATION_PRESETS;

export function braggTwoThetaDeg(dAngstrom: number, wavelengthAngstrom: number): number {
  if (!(dAngstrom > 0) || !(wavelengthAngstrom > 0)) throw new Error("Positive d-spacing and wavelength are required.");
  const ratio = wavelengthAngstrom / (2 * dAngstrom);
  if (ratio > 1) throw new Error("No first-order Bragg reflection exists for this d-spacing and wavelength.");
  return 2 * Math.asin(ratio) * 180 / Math.PI;
}

export function dSpacingFromTwoTheta(twoThetaDeg: number, wavelengthAngstrom: number): number {
  if (!(twoThetaDeg > 0 && twoThetaDeg <= 180) || !(wavelengthAngstrom > 0)) throw new Error("Valid 2θ and a positive wavelength are required.");
  return wavelengthAngstrom / (2 * Math.sin(twoThetaDeg * Math.PI / 360));
}

export function cubicDSpacing(aAngstrom: number, h: number, k: number, l: number): number {
  const norm = Math.sqrt(h * h + k * k + l * l);
  if (!(aAngstrom > 0) || norm === 0) throw new Error("A positive lattice parameter and nonzero hkl are required.");
  return aAngstrom / norm;
}

export function hexagonalDSpacing(aAngstrom: number, cAngstrom: number, h: number, k: number, l: number): number {
  if (!(aAngstrom > 0) || !(cAngstrom > 0) || (h === 0 && k === 0 && l === 0)) throw new Error("Positive lattice parameters and nonzero hkl are required.");
  return 1 / Math.sqrt((4 / 3) * (h * h + h * k + k * k) / (aAngstrom * aAngstrom) + (l * l) / (cAngstrom * cAngstrom));
}

export type XRDScientificStatus = "well-constrained" | "manual-review-required" | "ambiguous" | "underdetermined" | "high-residual" | "covariance-unavailable";

export function refinementScientificStatuses(result: Readonly<{ diagnostics: Readonly<{ optimizerSuccess: boolean; rank: number; parameterCount: number; degreesOfFreedom: number | null; rmsDeltaTwoThetaDeg: number; covariance: readonly (readonly number[])[] | null }>; warnings: readonly string[] }>): readonly XRDScientificStatus[] {
  const statuses: XRDScientificStatus[] = [];
  if (result.diagnostics.rank < result.diagnostics.parameterCount || result.diagnostics.degreesOfFreedom === null || result.diagnostics.degreesOfFreedom <= 0) statuses.push("underdetermined");
  if (result.diagnostics.rmsDeltaTwoThetaDeg > 0.15) statuses.push("high-residual");
  if (result.diagnostics.covariance === null) statuses.push("covariance-unavailable");
  if (!result.diagnostics.optimizerSuccess || result.warnings.length) statuses.push("manual-review-required");
  if (!statuses.length) statuses.push("well-constrained");
  return statuses;
}
