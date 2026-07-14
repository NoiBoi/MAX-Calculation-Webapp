import Decimal from "decimal.js";

function decimalPlaces(increment: string): number {
  const normalized = increment.trim().toLowerCase();
  const [coefficient, exponentText] = normalized.split("e");
  const fraction = coefficient?.split(".")[1]?.length ?? 0;
  const exponent = Number(exponentText ?? 0);
  return Math.max(0, fraction - exponent);
}

export function formatMassForBalance(value: string, incrementGrams: string): string {
  try { return new Decimal(value).toFixed(decimalPlaces(incrementGrams), Decimal.ROUND_HALF_EVEN); }
  catch { return value; }
}

export function formatPercent(fraction: string, significantDigits = 4): string {
  try { return `${new Decimal(fraction).times(100).toSignificantDigits(significantDigits).toString()}%`; }
  catch { return fraction; }
}

export function formatMoles(value: string): string {
  try {
    const amount = new Decimal(value); const absolute = amount.abs();
    if (absolute.lessThan("0.001")) return `${amount.times("1000000").toSignificantDigits(4).toString()} µmol`;
    if (absolute.lessThan(1)) return `${amount.times("1000").toSignificantDigits(4).toString()} mmol`;
    return `${amount.toSignificantDigits(4).toString()} mol`;
  } catch { return `${value} mol`; }
}

export function formatRadiusPm(value: string): string {
  try { return `${new Decimal(value).toDecimalPlaces(2).toString()} pm`; }
  catch { return `${value} pm`; }
}

export function formatDescriptor(value: string, suffix = ""): string {
  try { return `${new Decimal(value).toSignificantDigits(4).toString()}${suffix}`; }
  catch { return `${value}${suffix}`; }
}
