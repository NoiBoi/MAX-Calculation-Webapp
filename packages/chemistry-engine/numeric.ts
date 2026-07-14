import Decimal from "decimal.js";

export const INTERNAL_PRECISION_DIGITS = 50;
export const OUTPUT_PRECISION_DIGITS = 34;
export const DEFAULT_COMPARISON_TOLERANCE = "1e-30";

export const ChemistryDecimal = Decimal.clone({
  precision: INTERNAL_PRECISION_DIGITS,
  rounding: Decimal.ROUND_HALF_EVEN,
  toExpNeg: -100,
  toExpPos: 100,
});

export type DecimalValue = InstanceType<typeof ChemistryDecimal>;

export function formatDecimal(value: DecimalValue, precision = OUTPUT_PRECISION_DIGITS): string {
  const rounded = value.toSignificantDigits(precision, ChemistryDecimal.ROUND_HALF_EVEN);
  return rounded.isZero() ? "0" : rounded.toString();
}

export function parseDecimal(value: string): DecimalValue | undefined {
  try {
    const parsed = new ChemistryDecimal(value);
    return parsed.isFinite() ? parsed : undefined;
  } catch {
    return undefined;
  }
}
