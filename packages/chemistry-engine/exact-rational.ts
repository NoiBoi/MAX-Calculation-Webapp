/** Internal exact arithmetic for finite-decimal chemistry inputs and rational solver outputs. */
export interface ExactRational { readonly numerator: bigint; readonly denominator: bigint }

export const RATIONAL_ZERO: ExactRational = Object.freeze({ numerator: 0n, denominator: 1n });
export const RATIONAL_ONE: ExactRational = Object.freeze({ numerator: 1n, denominator: 1n });

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

export function makeRational(numerator: bigint, denominator = 1n): ExactRational {
  if (denominator === 0n) throw new Error("Exact rational denominator cannot be zero.");
  if (numerator === 0n) return RATIONAL_ZERO;
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = gcd(numerator, denominator);
  return Object.freeze({ numerator: (numerator / divisor) * sign, denominator: (denominator / divisor) * sign });
}

export function parseExactRational(value: string): ExactRational {
  const fractionMatch = /^([+-]?\d+)\/([+]?[1-9]\d*)$/.exec(value);
  if (fractionMatch) return makeRational(BigInt(fractionMatch[1]!), BigInt(fractionMatch[2]!));
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(value);
  if (!match || ((match[2] ?? "") === "" && (match[3] ?? "") === "")) throw new Error(`Invalid exact numeric text: ${value}`);
  const sign = match[1] === "-" ? -1n : 1n;
  const integer = match[2] || "0";
  const fraction = match[3] || "";
  const exponent = BigInt(match[4] || "0");
  let numerator = BigInt(`${integer}${fraction}` || "0") * sign;
  let denominator = 10n ** BigInt(fraction.length);
  if (exponent > 0n) numerator *= 10n ** exponent;
  if (exponent < 0n) denominator *= 10n ** -exponent;
  return makeRational(numerator, denominator);
}

export function addRational(left: ExactRational, right: ExactRational): ExactRational {
  return makeRational(left.numerator * right.denominator + right.numerator * left.denominator, left.denominator * right.denominator);
}

export function subtractRational(left: ExactRational, right: ExactRational): ExactRational {
  return makeRational(left.numerator * right.denominator - right.numerator * left.denominator, left.denominator * right.denominator);
}

export function multiplyRational(left: ExactRational, right: ExactRational): ExactRational {
  return makeRational(left.numerator * right.numerator, left.denominator * right.denominator);
}

export function divideRational(left: ExactRational, right: ExactRational): ExactRational {
  return makeRational(left.numerator * right.denominator, left.denominator * right.numerator);
}

export function negateRational(value: ExactRational): ExactRational {
  return makeRational(-value.numerator, value.denominator);
}

export function absRational(value: ExactRational): ExactRational {
  return value.numerator < 0n ? negateRational(value) : value;
}

export function compareRational(left: ExactRational, right: ExactRational): number {
  const difference = left.numerator * right.denominator - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

export function equalRational(left: ExactRational, right: ExactRational): boolean {
  return left.numerator === right.numerator && left.denominator === right.denominator;
}

export function sumRationals(values: readonly ExactRational[]): ExactRational {
  return values.reduce(addRational, RATIONAL_ZERO);
}

export function rationalToString(value: ExactRational): string {
  if (value.denominator === 1n) return value.numerator.toString();
  let remainder = value.denominator;
  let twos = 0;
  let fives = 0;
  while (remainder % 2n === 0n) { remainder /= 2n; twos += 1; }
  while (remainder % 5n === 0n) { remainder /= 5n; fives += 1; }
  if (remainder !== 1n) return `${value.numerator.toString()}/${value.denominator.toString()}`;
  const places = Math.max(twos, fives);
  const scale = (2n ** BigInt(places - twos)) * (5n ** BigInt(places - fives));
  const scaled = value.numerator * scale;
  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled).toString().padStart(places + 1, "0");
  let text = places === 0 ? digits : `${digits.slice(0, -places)}.${digits.slice(-places)}`;
  while (text.includes(".") && text.endsWith("0")) text = text.slice(0, -1);
  if (text.endsWith(".")) text = text.slice(0, -1);
  return scaled === 0n ? "0" : `${negative ? "-" : ""}${text}`;
}

export interface RrefResult {
  readonly rows: readonly (readonly ExactRational[])[];
  readonly rank: number;
  readonly pivotColumns: readonly number[];
}

export function rationalRref(input: readonly (readonly ExactRational[])[], coefficientColumns?: number): RrefResult {
  const rows = input.map((row) => [...row]);
  const columns = coefficientColumns ?? rows[0]?.length ?? 0;
  const pivots: number[] = [];
  let pivotRow = 0;
  for (let column = 0; column < columns && pivotRow < rows.length; column += 1) {
    const selected = rows.findIndex((row, index) => index >= pivotRow && row[column]?.numerator !== 0n);
    if (selected < 0) continue;
    [rows[pivotRow], rows[selected]] = [rows[selected]!, rows[pivotRow]!];
    const pivot = rows[pivotRow]![column]!;
    rows[pivotRow] = rows[pivotRow]!.map((entry) => divideRational(entry, pivot));
    for (let row = 0; row < rows.length; row += 1) {
      if (row === pivotRow) continue;
      const factor = rows[row]![column]!;
      if (factor.numerator === 0n) continue;
      rows[row] = rows[row]!.map((entry, index) => subtractRational(entry, multiplyRational(factor, rows[pivotRow]![index]!)));
    }
    pivots.push(column);
    pivotRow += 1;
  }
  return Object.freeze({ rows: Object.freeze(rows.map((row) => Object.freeze(row))), rank: pivots.length, pivotColumns: Object.freeze(pivots) });
}

export function solveExactLinearSystem(
  coefficients: readonly (readonly ExactRational[])[],
  rightHandSide: readonly ExactRational[],
  variableCount: number,
): { readonly status: "unique" | "multiple" | "inconsistent"; readonly solution?: readonly ExactRational[]; readonly rank: number } {
  const augmented = coefficients.map((row, index) => [...row, rightHandSide[index] ?? RATIONAL_ZERO]);
  const reduced = rationalRref(augmented, variableCount);
  const inconsistent = reduced.rows.some((row) => row.slice(0, variableCount).every((entry) => entry.numerator === 0n) && row[variableCount]?.numerator !== 0n);
  if (inconsistent) return Object.freeze({ status: "inconsistent", rank: reduced.rank });
  if (reduced.rank < variableCount) return Object.freeze({ status: "multiple", rank: reduced.rank });
  const solution = Array.from({ length: variableCount }, () => RATIONAL_ZERO);
  reduced.pivotColumns.forEach((column, row) => { solution[column] = reduced.rows[row]![variableCount] ?? RATIONAL_ZERO; });
  return Object.freeze({ status: "unique", solution: Object.freeze(solution), rank: reduced.rank });
}

export function dotRationals(left: readonly ExactRational[], right: readonly ExactRational[]): ExactRational {
  return sumRationals(left.map((value, index) => multiplyRational(value, right[index] ?? RATIONAL_ZERO)));
}
