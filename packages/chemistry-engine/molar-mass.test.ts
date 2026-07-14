import { describe, expect, it } from "vitest";
import type { ElementDataSet } from "./element-data-schema";
import { DEFAULT_ELEMENT_DATA } from "./default-element-data";
import { parseFormula } from "./formula-parser";
import {
  calculateAtomicFractions,
  calculateMassFractions,
  calculateMolarMass,
} from "./molar-mass";
import { ChemistryDecimal } from "./numeric";
import { FractionResultSchema, MolarMassResultSchema } from "./schemas";

function composition(formula: string) {
  const parsed = parseFormula(formula);
  expect(parsed.success).toBe(true);
  if (!parsed.success) throw new Error(parsed.errors[0]?.message);
  return parsed.composition;
}

function sum(values: readonly string[]) {
  return values.reduce((total, value) => total.plus(value), new ChemistryDecimal(0));
}

describe("molar mass from versioned atomic data", () => {
  it.each([
    ["Ti3AlC2", "194.605"],
    ["Ti4AlN3", "260.471"],
    ["Nb2AlN", "226.801"],
    ["TiN", "61.874"],
    ["NbN", "106.913"],
    ["AlN", "40.989"],
  ])("calculates %s as %s g/mol", (formula, expected) => {
    const result = calculateMolarMass(composition(formula), DEFAULT_ELEMENT_DATA);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.value.totalMolarMass).toBe(expected);
      expect(result.value.units).toBe("g/mol");
      expect(result.value.elementDataVersion).toBe("2024.2.0");
      expect(MolarMassResultSchema.safeParse(result.value).success).toBe(true);
    }
  });

  it("reports per-element contributions that sum exactly to the returned total", () => {
    const result = calculateMolarMass(composition("Ti3AlC2"), DEFAULT_ELEMENT_DATA);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(sum(result.value.contributions.map((entry) => entry.contributionGramsPerMole)).toString()).toBe(
      result.value.totalMolarMass,
    );
    expect(result.value.contributions.find((entry) => entry.element === "Ti")).toMatchObject({
      coefficient: "3",
      atomicWeightGramsPerMole: "47.867",
      contributionGramsPerMole: "143.601",
    });
  });

  it("returns deterministic interval-data warnings", () => {
    const first = calculateMolarMass(composition("Ti3AlC2"), DEFAULT_ELEMENT_DATA);
    const second = calculateMolarMass(composition("Ti3AlC2"), DEFAULT_ELEMENT_DATA);
    expect(first).toEqual(second);
    expect(first.success).toBe(true);
    if (first.success) expect(first.value.warnings).toEqual([
      expect.objectContaining({ code: "ATOMIC_WEIGHT_INTERVAL", element: "C" }),
    ]);
  });

  it("consumes a user-specified versioned record visibly in warnings and trace", () => {
    const custom = structuredClone(DEFAULT_ELEMENT_DATA) as ElementDataSet;
    custom.dataVersion = "2024.1.1";
    const titanium = custom.elements.find((element) => element.symbol === "Ti");
    if (!titanium) throw new Error("Missing Ti fixture");
    titanium.calculationValue = "48";
    titanium.calculationValuePolicy = "user-specified";

    const result = calculateMolarMass(composition("TiN"), custom);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.totalMolarMass).toBe("62.007");
    expect(result.value.warnings).toContainEqual(expect.objectContaining({
      code: "USER_SPECIFIED_ATOMIC_WEIGHT",
      element: "Ti",
    }));
    expect(result.value.trace).toContainEqual(expect.objectContaining({
      element: "Ti",
      valueGramsPerMole: "48",
      policy: "user-specified",
    }));
  });

  it("returns atomic-data-unavailable for a real element with no CIAAW calculation value", () => {
    const result = calculateMolarMass(composition("Tc"), DEFAULT_ELEMENT_DATA);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]).toMatchObject({
      code: "MISSING_ATOMIC_WEIGHT",
      offendingValue: "Tc",
    });
  });
});

describe("atomic and mass fractions", () => {
  it("calculates atomic fractions whose returned values sum to one within 1e-32", () => {
    const result = calculateAtomicFractions(composition("Ti3AlC2"));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(FractionResultSchema.safeParse(result.value).success).toBe(true);
    expect(new ChemistryDecimal(result.value.sum).minus(1).abs().lessThanOrEqualTo("1e-32")).toBe(true);
    expect(result.value.entries.find((entry) => entry.element === "Ti")?.fraction).toBe("0.5");
  });

  it("calculates mass fractions whose returned values sum to one within 1e-32", () => {
    const result = calculateMassFractions(composition("Ti3AlC2"), DEFAULT_ELEMENT_DATA);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(FractionResultSchema.safeParse(result.value).success).toBe(true);
    expect(new ChemistryDecimal(result.value.sum).minus(1).abs().lessThanOrEqualTo("1e-32")).toBe(true);
    expect(result.value.elementDataVersion).toBe("2024.2.0");
  });

  it("rejects fractions for an empty composition", async () => {
    const { createComposition } = await import("./composition");
    const empty = createComposition({});
    expect(empty.success).toBe(true);
    if (!empty.success) return;
    const result = calculateAtomicFractions(empty.value);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]?.code).toBe("EMPTY_COMPOSITION");
  });
});
