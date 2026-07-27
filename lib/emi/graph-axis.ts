export type EmiAxisQuantity =
  | "shielding-db"
  | "power-coefficient"
  | "s-parameter"
  | "conductivity-s-per-m"
  | "resistance-ohm"
  | "sheet-resistance-ohm-per-square";

export interface EmiYAxisModel {
  readonly minimum: number;
  readonly maximum: number;
  readonly tickStep: number;
  readonly ticks: readonly Readonly<{ value: number; label: string }>[];
  readonly notation: "fixed" | "scientific";
  readonly leftMargin: number;
  readonly titleX: number;
}

const superscripts: Readonly<Record<string, string>> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
const superscript = (value: number) => String(value).split("").map((character) => superscripts[character] ?? character).join("");
const cleanZero = (value: number, threshold: number) => Math.abs(value) < threshold ? 0 : value;
const trimFixed = (value: number, digits: number) => {
  const normalized = cleanZero(value, 0.5 * 10 ** -digits);
  return normalized === 0 ? "0" : normalized.toFixed(digits);
};

function fixedDigits(quantity: EmiAxisQuantity, tickStep: number): number {
  if (quantity === "shielding-db") return Math.max(1, Math.min(2, -Math.floor(Math.log10(Math.abs(tickStep))) + 1));
  return Math.max(0, Math.min(6, -Math.floor(Math.log10(Math.abs(tickStep))) + 1));
}

function formatTicks(values: readonly number[], quantity: EmiAxisQuantity, tickStep: number): Readonly<{ labels: readonly string[]; notation: "fixed" | "scientific" }> {
  const maximumMagnitude = Math.max(...values.map(Math.abs));
  const scientificNotation = maximumMagnitude > 0 && (maximumMagnitude < 1e-4 || Math.abs(tickStep) < 1e-5 || maximumMagnitude >= 1e6);
  if (scientificNotation) {
    const exponent = Math.floor(Math.log10(maximumMagnitude));
    const scale = 10 ** exponent;
    const scaledStep = Math.abs(tickStep / scale);
    const digits = Math.max(1, Math.min(3, -Math.floor(Math.log10(scaledStep)) + 1));
    return { notation: "scientific", labels: values.map((value) => value === 0 ? "0" : `${trimFixed(value / scale, digits)}×10${superscript(exponent)}`) };
  }
  let digits = fixedDigits(quantity, tickStep);
  let labels = values.map((value) => trimFixed(value, digits));
  while (new Set(labels).size !== labels.length && digits < 8) { digits += 1; labels = values.map((value) => trimFixed(value, digits)); }
  return { notation: "fixed", labels };
}

function paddedDomain(values: readonly number[], quantity: EmiAxisQuantity, configuredMinimum?: number, configuredMaximum?: number): readonly [number, number] {
  const finite = values.filter(Number.isFinite);
  let minimum = finite.length ? Math.min(...finite) : 0;
  let maximum = finite.length ? Math.max(...finite) : 1;
  if (minimum === maximum) {
    const delta = minimum === 0 ? (quantity === "shielding-db" ? 1 : 0.05) : Math.max(Math.abs(minimum) * 0.08, Number.MIN_VALUE * 1e6);
    minimum -= delta; maximum += delta;
  } else {
    const rawRange = maximum - minimum;
    if (minimum >= 0 && minimum <= rawRange * 0.2) minimum = 0; else minimum -= rawRange * 0.06;
    if (maximum <= 0 && Math.abs(maximum) <= rawRange * 0.2) maximum = 0; else maximum += rawRange * 0.06;
  }
  if (configuredMinimum !== undefined && Number.isFinite(configuredMinimum)) minimum = configuredMinimum;
  if (configuredMaximum !== undefined && Number.isFinite(configuredMaximum)) maximum = configuredMaximum;
  if (!(maximum > minimum)) { const delta = Math.abs(minimum) * 0.08 || 1; minimum -= delta; maximum += delta; }
  return [minimum, maximum];
}

/** Builds a deterministic visual-only y domain, tick formatter, and collision-safe left margin. */
export function buildEmiYAxis(input: Readonly<{ values: readonly number[]; quantity: EmiAxisQuantity; tickCount?: number; configuredMinimum?: number; configuredMaximum?: number }>): EmiYAxisModel {
  const tickCount = Math.max(2, Math.min(9, input.tickCount ?? 5));
  const [minimum, maximum] = paddedDomain(input.values, input.quantity, input.configuredMinimum, input.configuredMaximum);
  const tickStep = (maximum - minimum) / (tickCount - 1);
  const values = Array.from({ length: tickCount }, (_, index) => cleanZero(maximum - index * tickStep, Math.abs(tickStep) * 1e-12));
  const formatted = formatTicks(values, input.quantity, tickStep);
  const widestCharacters = Math.max(...formatted.labels.map((label) => label.length));
  const estimatedTickWidth = widestCharacters * 6.4;
  const leftMargin = Math.min(132, Math.max(72, Math.ceil(estimatedTickWidth + 42)));
  return { minimum, maximum, tickStep, ticks: values.map((value, index) => ({ value, label: formatted.labels[index]! })), notation: formatted.notation, leftMargin, titleX: 17 };
}
