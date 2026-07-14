import type { ElementDataSet } from "./element-data-schema";
import { buildElementDataIndex } from "./element-data";
import { createComposition, type ElementalComposition } from "./composition";
import { chemistryError, failure, success, type ChemistryResult, type ChemistryWarning } from "./errors";
import { ChemistryDecimal, formatDecimal } from "./numeric";
import { ATOMIC_NUMBER_BY_SYMBOL } from "./periodic-table";
import type { FractionEntry, FractionResult, MolarMassResult } from "./schemas";

export type {
  AtomicWeightTraceEntry,
  FractionEntry,
  FractionResult,
  MolarMassContribution,
  MolarMassResult,
} from "./schemas";

function orderedEntries(
  composition: ElementalComposition,
  data: ElementDataSet,
): ChemistryResult<readonly [string, string][]> {
  const validated = createComposition(composition.amounts);
  if (!validated.success) return validated;
  if (Object.keys(validated.value.amounts).length === 0) {
    return failure(chemistryError("EMPTY_COMPOSITION", "Composition must contain a positive coefficient."));
  }
  const index = buildElementDataIndex(data);
  if (!index.success) return index;
  const entries = Object.entries(validated.value.amounts);
  for (const [element] of entries) {
    const record = index.value.bySymbol.get(element);
    if (!record || record.calculationValue === null) {
      return failure(
        chemistryError("MISSING_ATOMIC_WEIGHT", `No usable atomic weight is available for ${element}.`, {
          offendingValue: element,
          suggestedCorrection: "Select an atomic dataset with an authoritative calculation value or provide a provenance-bearing molar-mass override.",
        }),
      );
    }
  }
  entries.sort(
    ([left], [right]) =>
      (index.value.bySymbol.get(left)?.atomicNumber ?? 0) -
      (index.value.bySymbol.get(right)?.atomicNumber ?? 0),
  );
  return success(Object.freeze(entries.map((entry) => Object.freeze(entry) as [string, string])));
}

function sumReturnedFractions(entries: readonly FractionEntry[]): string {
  return formatDecimal(
    entries.reduce((sum, entry) => sum.plus(entry.fraction), new ChemistryDecimal(0)),
  );
}

export function calculateAtomicFractions(
  composition: ElementalComposition,
): ChemistryResult<FractionResult> {
  const validated = createComposition(composition.amounts);
  if (!validated.success) return validated;
  const entries = Object.entries(validated.value.amounts).sort(
    ([left], [right]) =>
      (ATOMIC_NUMBER_BY_SYMBOL.get(left) ?? 0) -
      (ATOMIC_NUMBER_BY_SYMBOL.get(right) ?? 0),
  );
  const total = entries.reduce(
    (sum, [, coefficient]) => sum.plus(coefficient),
    new ChemistryDecimal(0),
  );
  if (!total.greaterThan(0)) {
    return failure(chemistryError("EMPTY_COMPOSITION", "Cannot calculate fractions for an empty composition."));
  }
  const fractions = Object.freeze(
    entries.map(([element, coefficient]) =>
      Object.freeze({
        element,
        coefficient,
        fraction: formatDecimal(new ChemistryDecimal(coefficient).dividedBy(total)),
      }),
    ),
  );
  return success(
    Object.freeze({
      kind: "atomic" as const,
      entries: fractions,
      sum: sumReturnedFractions(fractions),
    }),
  );
}

export function calculateMolarMass(
  composition: ElementalComposition,
  elementData: ElementDataSet,
): ChemistryResult<MolarMassResult> {
  const entriesResult = orderedEntries(composition, elementData);
  if (!entriesResult.success) return entriesResult;
  const index = buildElementDataIndex(elementData);
  if (!index.success) return index;

  const internal = entriesResult.value.map(([element, coefficient]) => {
    const record = index.value.bySymbol.get(element);
    if (!record) return undefined;
    if (record.calculationValue === null || record.calculationValuePolicy === "unavailable") return undefined;
    const atomicWeight = new ChemistryDecimal(record.calculationValue);
    const calculationValuePolicy = record.calculationValuePolicy;
    return { element, coefficient, record, calculationValuePolicy, atomicWeight, contribution: atomicWeight.times(coefficient) };
  });
  if (internal.some((entry) => entry === undefined)) {
    return failure(chemistryError("MISSING_ATOMIC_WEIGHT", "An element has no usable atomic-weight record."));
  }
  const defined = internal.filter((entry): entry is NonNullable<typeof entry> => entry !== undefined);
  const internalTotal = defined.reduce(
    (sum, entry) => sum.plus(entry.contribution),
    new ChemistryDecimal(0),
  );
  if (!internalTotal.greaterThan(0)) {
    return failure(chemistryError("EMPTY_COMPOSITION", "Resulting molar mass must be greater than zero."));
  }

  const warnings: ChemistryWarning[] = [];
  const contributions = Object.freeze(
    defined.map((entry) => {
      if (entry.record.standardAtomicWeight.kind === "interval") {
        warnings.push(
          Object.freeze({
            code: "ATOMIC_WEIGHT_INTERVAL" as const,
            element: entry.element,
            message: `${entry.element} has an interval standard atomic weight; calculation uses the dataset's explicit ${entry.record.calculationValuePolicy} value ${entry.record.calculationValue} g/mol.`,
          }),
        );
      }
      if (entry.record.calculationValuePolicy === "user-specified") {
        warnings.push(
          Object.freeze({
            code: "USER_SPECIFIED_ATOMIC_WEIGHT" as const,
            element: entry.element,
            message: `${entry.element} uses a user-specified atomic weight of ${entry.record.calculationValue} g/mol.`,
          }),
        );
      }
      return Object.freeze({
        element: entry.element,
        coefficient: entry.coefficient,
        atomicWeightGramsPerMole: formatDecimal(entry.atomicWeight),
        contributionGramsPerMole: formatDecimal(entry.contribution),
        massFraction: formatDecimal(entry.contribution.dividedBy(internalTotal)),
        calculationValuePolicy: entry.calculationValuePolicy,
        sourceIds: Object.freeze([...entry.record.sourceIds]),
      });
    }),
  );
  const totalFromReturnedContributions = contributions.reduce(
    (sum, contribution) => sum.plus(contribution.contributionGramsPerMole),
    new ChemistryDecimal(0),
  );
  const trace = Object.freeze(
    defined.map((entry) =>
      Object.freeze({
        operation: "atomic-weight-selection" as const,
        element: entry.element,
        valueGramsPerMole: formatDecimal(entry.atomicWeight),
        policy: entry.calculationValuePolicy,
        sourceIds: Object.freeze([...entry.record.sourceIds]),
      }),
    ),
  );

  return success(
    Object.freeze({
      totalMolarMass: formatDecimal(totalFromReturnedContributions),
      units: "g/mol" as const,
      elementDataVersion: index.value.data.dataVersion,
      contributions,
      warnings: Object.freeze(warnings),
      trace,
    }),
  );
}

export function calculateMassFractions(
  composition: ElementalComposition,
  elementData: ElementDataSet,
): ChemistryResult<FractionResult> {
  const molarMass = calculateMolarMass(composition, elementData);
  if (!molarMass.success) return molarMass;
  const entries = Object.freeze(
    molarMass.value.contributions.map((contribution) =>
      Object.freeze({
        element: contribution.element,
        coefficient: contribution.coefficient,
        fraction: contribution.massFraction,
      }),
    ),
  );
  return success(
    Object.freeze({
      kind: "mass" as const,
      entries,
      sum: sumReturnedFractions(entries),
      elementDataVersion: molarMass.value.elementDataVersion,
    }),
  );
}
