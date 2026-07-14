import { ChemistryDecimal, type ScientificScalar } from "@max-stoich/chemistry-engine";
import type { WorkspaceRecipeState } from "../workspace/adapter";

const numericKey = /(?:mass|grams|moles|percent|fraction|increment|minimum|maximum|ratio|purity|residual|tolerance|amount)$/i;
const numericContainerKey = /amounts$/i;

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b) [a, b] = [b, a % b];
  return a || 1n;
}

function normalize(value: unknown, key = ""): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    if (!numericKey.test(key) || value.trim() === "") return value;
    try { return new ChemistryDecimal(value).toString(); } catch { return value; }
  }
  if (Array.isArray(value)) return value.map((item) => normalize(item, key));
  const object = value as Record<string, unknown>;
  if ((object.kind === "rational" || object.kind === "finite-decimal") && typeof object.numerator === "string" && typeof object.denominator === "string") {
    try {
      let numerator = BigInt(object.numerator);
      let denominator = BigInt(object.denominator);
      if (denominator < 0n) { numerator = -numerator; denominator = -denominator; }
      const divisor = gcd(numerator, denominator);
      numerator /= divisor; denominator /= divisor;
      const canonical = object.kind === "rational" ? `${numerator}/${denominator}` : new ChemistryDecimal(numerator.toString()).dividedBy(denominator.toString()).toString();
      return { canonical, denominator: denominator.toString(), kind: object.kind, numerator: numerator.toString() };
    } catch { return object; }
  }
  const entries = Object.entries(object).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([itemKey, item]) => [itemKey, normalize(item, numericContainerKey.test(key) ? key : itemKey)]);
  return Object.fromEntries(entries);
}

export function stableCanonicalize(value: unknown): string { return JSON.stringify(normalize(value)); }

export function canonicalizeWorkspaceScientificInput(recipe: WorkspaceRecipeState): string {
  const scientific = {
    targetFormula: recipe.targetFormula,
    normalizeLeadingSiteRatios: recipe.normalizeLeadingSiteRatios ?? false,
    siteComposition: recipe.siteComposition,
    precursors: [...recipe.precursors].sort((left, right) => left.id.localeCompare(right.id)),
    requestedMassGrams: recipe.requestedMassGrams,
    basis: recipe.basis,
    expectedYieldPercent: recipe.expectedYieldPercent,
    alExcessPercent: recipe.alExcessPercent,
    precursorExcessId: recipe.precursorExcessId,
    precursorExcessPercent: recipe.precursorExcessPercent,
    handlingLossPercent: recipe.handlingLossPercent,
    balanceIncrementGrams: recipe.balanceIncrementGrams,
    roundingMode: recipe.roundingMode,
    practicalMinimumMassGrams: recipe.practicalMinimumMassGrams,
    objective: recipe.objective,
    notes: recipe.notes ?? "",
    routeSource: recipe.routeSource,
    radiusDescriptorConfig: recipe.radiusDescriptorConfig,
  };
  return stableCanonicalize(scientific);
}

export async function sha256Hex(canonical: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function hasValidRationals(value: unknown): boolean {
  if (!value || typeof value !== "object") return true;
  const candidate = value as Partial<ScientificScalar>;
  if ((candidate.kind === "rational" || candidate.kind === "finite-decimal") && typeof candidate.denominator === "string") {
    try { return BigInt(candidate.denominator) > 0n && typeof candidate.numerator === "string"; } catch { return false; }
  }
  return Object.values(value).every(hasValidRationals);
}

export function invalidScientificNumberPath(value: unknown, key = "", path = "result"): string | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? undefined : path;
  if (typeof value === "string" && /^(?:NaN|[+-]?Infinity)$/i.test(value)) return path;
  if (typeof value === "string" && value.trim() === "") return undefined;
  if (typeof value === "string" && path.includes(".units.")) return undefined;
  if (typeof value === "string" && (numericKey.test(key) || numericContainerKey.test(key))) {
    try {
      if (/^-?\d+\/\d+$/.test(value)) {
        const [, denominator] = value.split("/");
        return BigInt(denominator!) > 0n ? undefined : path;
      }
      return new ChemistryDecimal(value).isFinite() ? undefined : path;
    } catch { return path; }
  }
  if (!value || typeof value !== "object") return undefined;
  for (const [itemKey, item] of Object.entries(value)) {
    const invalid = invalidScientificNumberPath(item, itemKey, `${path}.${itemKey}`);
    if (invalid) return invalid;
  }
  return undefined;
}

export function hasValidScientificNumbers(value: unknown): boolean {
  return invalidScientificNumberPath(value) === undefined;
}
