import { makeRational, rationalToString, type ExactRational } from "./exact-rational";
import { ChemistryDecimal, formatDecimal, INTERNAL_PRECISION_DIGITS, OUTPUT_PRECISION_DIGITS } from "./numeric";

export type ScientificScalar =
  | Readonly<{ kind: "finite-decimal"; canonical: string; numerator: string; denominator: string }>
  | Readonly<{ kind: "rational"; canonical: string; numerator: string; denominator: string }>;

export interface ScientificDecimalApproximation {
  readonly value: string;
  readonly sourceExactCanonical: string;
  readonly calculationPrecisionSignificantDigits: typeof INTERNAL_PRECISION_DIGITS;
  readonly serializedPrecisionSignificantDigits: typeof OUTPUT_PRECISION_DIGITS;
  readonly roundingMode: "round-half-even";
}

export function scientificScalarFromExact(value: ExactRational): ScientificScalar {
  const canonical = rationalToString(value);
  return Object.freeze({ kind: canonical.includes("/") ? "rational" as const : "finite-decimal" as const, canonical, numerator: value.numerator.toString(), denominator: value.denominator.toString() });
}

export function scientificScalarToExact(value: ScientificScalar): ExactRational {
  return makeRational(BigInt(value.numerator), BigInt(value.denominator));
}

export function approximateScientificScalar(value: ScientificScalar | ExactRational): ScientificDecimalApproximation {
  const exact = "kind" in value ? scientificScalarToExact(value) : value;
  const scalar = "kind" in value ? value : scientificScalarFromExact(value);
  const decimal = new ChemistryDecimal(exact.numerator.toString()).dividedBy(exact.denominator.toString());
  return Object.freeze({ value: formatDecimal(decimal), sourceExactCanonical: scalar.canonical, calculationPrecisionSignificantDigits: INTERNAL_PRECISION_DIGITS, serializedPrecisionSignificantDigits: OUTPUT_PRECISION_DIGITS, roundingMode: "round-half-even" });
}
