import { DEFAULT_ELEMENT_DATA } from "./default-element-data";
import { ATOMIC_NUMBER_BY_SYMBOL, VALID_ELEMENT_SYMBOLS } from "./periodic-table";

export type GenericElementalFallbackPolicy = "allowed" | "requires-explicit-registration" | "disallowed";

export interface ElementPrecursorEligibility {
  readonly symbol: string;
  readonly genericElementalFallback: GenericElementalFallbackPolicy;
  readonly reason?: string;
  readonly atomicWeightAvailable: boolean;
  readonly elementName?: string;
}

const REQUIRES_EXPLICIT = new Set([
  "H", "N", "O", "F", "Cl", "Br", "I",
  "He", "Ne", "Ar", "Kr", "Xe", "Rn",
  "P", "S", "Se", "Hg",
]);

const HIGHLY_RADIOACTIVE_OR_SYNTHETIC = new Set([
  "Tc", "Pm", "Po", "At", "Fr", "Ra", "Ac", "Np", "Pu", "Am", "Cm", "Bk", "Cf", "Es", "Fm", "Md", "No", "Lr",
  "Rf", "Db", "Sg", "Bh", "Hs", "Mt", "Ds", "Rg", "Cn", "Nh", "Fl", "Mc", "Lv", "Ts", "Og",
]);

/**
 * Formula-identity eligibility only. "Allowed" does not assert powder form,
 * purity, supplier, stock, hazards, or experimental suitability.
 */
export function elementPrecursorEligibility(symbol: string): ElementPrecursorEligibility {
  if (!VALID_ELEMENT_SYMBOLS.has(symbol)) return { symbol, genericElementalFallback: "disallowed", reason: "The symbol is not a valid chemical element.", atomicWeightAvailable: false };
  const record = DEFAULT_ELEMENT_DATA.elements.find((item) => item.symbol === symbol);
  const atomicWeightAvailable = Boolean(record?.calculationValue);
  const base = { symbol, atomicWeightAvailable, ...(record ? { elementName: record.name } : {}) };
  if (!atomicWeightAvailable) return { ...base, genericElementalFallback: "disallowed", reason: "Element is valid, but no usable atomic-weight value is available for mass calculation." };
  if (HIGHLY_RADIOACTIVE_OR_SYNTHETIC.has(symbol)) return { ...base, genericElementalFallback: "disallowed", reason: "Generic elemental fallback is disabled for highly radioactive or synthetic elements." };
  if (REQUIRES_EXPLICIT.has(symbol)) return { ...base, genericElementalFallback: "requires-explicit-registration", reason: "Its ordinary physical or chemical form requires an explicitly registered precursor identity." };
  const atomicNumber = ATOMIC_NUMBER_BY_SYMBOL.get(symbol) ?? 0;
  if (atomicNumber > 92) return { ...base, genericElementalFallback: "disallowed", reason: "Generic elemental fallback is disabled outside the approved element policy." };
  return { ...base, genericElementalFallback: "allowed" };
}

