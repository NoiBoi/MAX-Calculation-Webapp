import { chemistryError, failure, success, type ChemistryResult } from "./errors";
import {
  ChemistryDecimal,
  DEFAULT_COMPARISON_TOLERANCE,
  formatDecimal,
  parseDecimal,
} from "./numeric";
import type { ElementalComposition } from "./schemas";

export type { ElementalComposition } from "./schemas";

function freezeComposition(amounts: Record<string, string>): ElementalComposition {
  return Object.freeze({
    schemaVersion: "1.0.0" as const,
    amounts: Object.freeze({ ...amounts }),
  });
}

export function createComposition(
  amounts: Readonly<Record<string, string>>,
): ChemistryResult<ElementalComposition> {
  const normalized: Record<string, string> = {};

  for (const element of Object.keys(amounts).sort()) {
    if (!/^[A-Z][a-z]?$/.test(element)) {
      return failure(
        chemistryError("INVALID_COMPOSITION", `Invalid element symbol "${element}" in composition.`, {
          offendingValue: element,
        }),
      );
    }

    const raw = amounts[element];
    if (raw === undefined) continue;
    const value = parseDecimal(raw);
    if (!value?.isFinite() || value.isNegative()) {
      return failure(
        chemistryError("INVALID_COMPOSITION", `Coefficient for ${element} must be finite and non-negative.`, {
          offendingValue: raw,
        }),
      );
    }
    if (!value.isZero()) normalized[element] = formatDecimal(value);
  }

  return success(freezeComposition(normalized));
}

function validatedComposition(
  composition: ElementalComposition,
): ChemistryResult<Readonly<Record<string, string>>> {
  const created = createComposition(composition.amounts);
  return created.success ? success(created.value.amounts) : created;
}

export function addCompositions(
  left: ElementalComposition,
  right: ElementalComposition,
): ChemistryResult<ElementalComposition> {
  const leftResult = validatedComposition(left);
  if (!leftResult.success) return leftResult;
  const rightResult = validatedComposition(right);
  if (!rightResult.success) return rightResult;

  const elements = new Set([...Object.keys(leftResult.value), ...Object.keys(rightResult.value)]);
  const amounts: Record<string, string> = {};
  for (const element of [...elements].sort()) {
    const total = new ChemistryDecimal(leftResult.value[element] ?? "0").plus(
      rightResult.value[element] ?? "0",
    );
    if (!total.isZero()) amounts[element] = formatDecimal(total);
  }
  return success(freezeComposition(amounts));
}

export function multiplyComposition(
  composition: ElementalComposition,
  scalar: string,
): ChemistryResult<ElementalComposition> {
  const validated = validatedComposition(composition);
  if (!validated.success) return validated;
  const factor = parseDecimal(scalar);
  if (!factor?.isFinite() || factor.isNegative()) {
    return failure(
      chemistryError("INVALID_SCALAR", "Composition scalar must be finite and non-negative.", {
        offendingValue: scalar,
      }),
    );
  }

  const amounts: Record<string, string> = {};
  for (const [element, coefficient] of Object.entries(validated.value)) {
    const product = new ChemistryDecimal(coefficient).times(factor);
    if (!product.isZero()) amounts[element] = formatDecimal(product);
  }
  return success(freezeComposition(amounts));
}

export function totalAtomCount(composition: ElementalComposition): ChemistryResult<string> {
  const validated = validatedComposition(composition);
  if (!validated.success) return validated;
  const total = Object.values(validated.value).reduce(
    (sum, coefficient) => sum.plus(coefficient),
    new ChemistryDecimal(0),
  );
  return success(formatDecimal(total));
}

export function normalizeCompositionToTotal(
  composition: ElementalComposition,
  targetTotal: string,
): ChemistryResult<ElementalComposition> {
  const validated = validatedComposition(composition);
  if (!validated.success) return validated;
  const target = parseDecimal(targetTotal);
  if (!target?.isFinite() || !target.greaterThan(0)) {
    return failure(
      chemistryError("INVALID_SCALAR", "Normalization total must be finite and greater than zero.", {
        offendingValue: targetTotal,
      }),
    );
  }

  const total = Object.values(validated.value).reduce(
    (sum, coefficient) => sum.plus(coefficient),
    new ChemistryDecimal(0),
  );
  if (!total.greaterThan(0)) {
    return failure(chemistryError("EMPTY_COMPOSITION", "Cannot normalize an empty or zero composition."));
  }
  return multiplyComposition(composition, formatDecimal(target.dividedBy(total), 50));
}

export function normalizeCompositionRelativeTo(
  composition: ElementalComposition,
  referenceElement: string,
  referenceAmount = "1",
): ChemistryResult<ElementalComposition> {
  const validated = validatedComposition(composition);
  if (!validated.success) return validated;
  if (!(referenceElement in validated.value)) {
    return failure(
      chemistryError(
        "NORMALIZATION_REFERENCE_MISSING",
        `Cannot normalize relative to ${referenceElement}; it is not present.`,
        { offendingValue: referenceElement },
      ),
    );
  }
  const reference = new ChemistryDecimal(validated.value[referenceElement] ?? "0");
  if (!reference.greaterThan(0)) {
    return failure(
      chemistryError(
        "NORMALIZATION_REFERENCE_ZERO",
        `Cannot normalize relative to ${referenceElement}; its coefficient is zero.`,
        { offendingValue: referenceElement },
      ),
    );
  }
  const desired = parseDecimal(referenceAmount);
  if (!desired?.isFinite() || !desired.greaterThan(0)) {
    return failure(
      chemistryError("INVALID_SCALAR", "Reference amount must be finite and greater than zero.", {
        offendingValue: referenceAmount,
      }),
    );
  }
  return multiplyComposition(composition, formatDecimal(desired.dividedBy(reference), 50));
}

export function compositionsEqualExact(
  left: ElementalComposition,
  right: ElementalComposition,
): boolean {
  const leftResult = validatedComposition(left);
  const rightResult = validatedComposition(right);
  if (!leftResult.success || !rightResult.success) return false;
  const elements = new Set([...Object.keys(leftResult.value), ...Object.keys(rightResult.value)]);
  return [...elements].every((element) =>
    new ChemistryDecimal(leftResult.value[element] ?? "0").equals(
      rightResult.value[element] ?? "0",
    ),
  );
}

export function compositionsEqualWithinTolerance(
  left: ElementalComposition,
  right: ElementalComposition,
  tolerance = DEFAULT_COMPARISON_TOLERANCE,
): ChemistryResult<boolean> {
  const leftResult = validatedComposition(left);
  if (!leftResult.success) return leftResult;
  const rightResult = validatedComposition(right);
  if (!rightResult.success) return rightResult;
  const allowed = parseDecimal(tolerance);
  if (!allowed?.isFinite() || allowed.isNegative()) {
    return failure(
      chemistryError("INVALID_TOLERANCE", "Comparison tolerance must be finite and non-negative.", {
        offendingValue: tolerance,
      }),
    );
  }
  const elements = new Set([...Object.keys(leftResult.value), ...Object.keys(rightResult.value)]);
  return success(
    [...elements].every((element) =>
      new ChemistryDecimal(leftResult.value[element] ?? "0")
        .minus(rightResult.value[element] ?? "0")
        .abs()
        .lessThanOrEqualTo(allowed),
    ),
  );
}
