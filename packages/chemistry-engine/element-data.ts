import { ElementDataSetSchema, type ElementDataSet } from "./element-data-schema";
import { chemistryError, failure, success, type ChemistryResult } from "./errors";

export interface ElementDataIndex {
  readonly data: ElementDataSet;
  readonly bySymbol: ReadonlyMap<string, ElementDataSet["elements"][number]>;
}

export function buildElementDataIndex(data: ElementDataSet): ChemistryResult<ElementDataIndex> {
  const parsed = ElementDataSetSchema.safeParse(data);
  if (!parsed.success) {
    return failure(
      chemistryError("INVALID_ELEMENT_DATA", "Element dataset does not match the versioned schema.", {
        suggestedCorrection: parsed.error.issues[0]?.message,
      }),
    );
  }

  const bySymbol = new Map<string, ElementDataSet["elements"][number]>();
  const atomicNumbers = new Set<number>();
  for (const element of parsed.data.elements) {
    if (bySymbol.has(element.symbol)) {
      return failure(
        chemistryError("INVALID_ELEMENT_DATA", `Element dataset contains duplicate symbol ${element.symbol}.`, {
          offendingValue: element.symbol,
        }),
      );
    }
    if (atomicNumbers.has(element.atomicNumber)) {
      return failure(
        chemistryError(
          "INVALID_ELEMENT_DATA",
          `Element dataset contains duplicate atomic number ${element.atomicNumber}.`,
          { offendingValue: String(element.atomicNumber) },
        ),
      );
    }
    if (element.sourceIds.some((sourceId) => !parsed.data.sources.some((source) => source.id === sourceId))) {
      return failure(
        chemistryError(
          "INVALID_ELEMENT_DATA",
          `Element ${element.symbol} refers to an unknown provenance source.`,
          { offendingValue: element.symbol },
        ),
      );
    }
    bySymbol.set(element.symbol, element);
    atomicNumbers.add(element.atomicNumber);
  }

  return success(Object.freeze({ data: parsed.data, bySymbol }));
}
