import { describe, expect, it } from "vitest";
import {
  calculateBatchRecipe,
  canonicalizeBatchCalculation,
  createComposition,
  createStandardMaxComposition,
  parseFormula,
  verifyBatchCalculation,
  type BatchAdjustment,
  type BatchRecipeInput,
  type ElementDataSet,
  type ElementalComposition,
} from "./index";

function formula(text: string): ElementalComposition {
  const result = parseFormula(text);
  if (!result.success) throw new Error(result.errors[0]?.message);
  return result.composition;
}

function composition(amounts: Record<string, string>): ElementalComposition {
  const result = createComposition(amounts);
  if (!result.success) throw new Error(result.errors[0]?.message);
  return result.value;
}

function override(value = "10") {
  return { value, units: "g/mol" as const, source: "synthetic arithmetic fixture", reason: "Hand-audited arithmetic", provenance: "test-only", version: "1" };
}

function baseInput(changes: Partial<BatchRecipeInput> = {}): BatchRecipeInput {
  return {
    schemaVersion: "1.0.0",
    idealCrystalComposition: formula("Li"),
    precursors: [{ schemaVersion: "1.0.0", id: "li", name: "Li", formula: "Li", molarMassOverride: override() }],
    batch: { basis: "ideal-product-mass", requestedMassGrams: "6.94" },
    adjustments: [],
    rounding: { adjustmentId: "round", order: 0, incrementGrams: "0.001", mode: "nearest-half-even", residualToleranceMoles: "0", materialityRelativeTolerance: "0" },
    ...changes,
  };
}

function elemental(type: "elemental-excess" | "elemental-deficiency", id: string, element: string, fraction: string, order = 0): BatchAdjustment {
  return { schemaVersion: "1.0.0", id, type, stage: "pre-solver", element, fraction, order, source: "user" };
}

function precursorAdjustment(type: "precursor-molar-excess" | "precursor-molar-deficiency", id: string, precursorId: string, fraction: string, order = 0): BatchAdjustment {
  return { schemaVersion: "1.0.0", id, type, stage: "post-solver", precursorId, fraction, order, source: "user" };
}

function loss(id: string, fraction: string, scope: "all" | readonly string[] = "all", order = 0): BatchAdjustment {
  return { schemaVersion: "1.0.0", id, type: "handling-loss", stage: "mass-domain", label: id, fraction, scope, order, source: "user" };
}

describe("batch calculation pipeline", () => {
  it("scales ideal-product mass explicitly", () => {
    const result = calculateBatchRecipe(baseInput());
    expect(result.batch).toMatchObject({ basis: "ideal-product-mass", requestedMassGrams: "6.94", idealTargetMolarMassGramsPerMole: "6.94", targetFormulaMoles: "1", preRoundingTotalPrecursorMassGrams: "10", finalRoundedTotalWeighingMassGrams: "10" });
    expect(result.precursors[0]).toMatchObject({ solverMolesPerTargetFormulaMole: "1", nominalScaledMoles: "1", pureRequiredMassGrams: "10", finalRoundedGrossWeighingMassGrams: "10", realizedPrecursorMoles: "1" });
  });

  it("scales recovered-product mass inversely with explicit 80% yield", () => {
    const result = calculateBatchRecipe(baseInput({ batch: { basis: "recovered-product-mass", requestedMassGrams: "5.552", expectedYield: "0.8" } }));
    expect(result.batch).toMatchObject({ nominalProductMassGrams: "6.94", targetFormulaMoles: "1", expectedYield: "0.8" });
  });

  it.each([
    [{ basis: "recovered-product-mass", requestedMassGrams: "5" } as const, "MISSING_EXPECTED_YIELD"],
    [{ basis: "recovered-product-mass", requestedMassGrams: "5", expectedYield: "0" } as const, "INVALID_FRACTION"],
    [{ basis: "recovered-product-mass", requestedMassGrams: "5", expectedYield: "1.1" } as const, "INVALID_FRACTION"],
  ])("rejects invalid recovered-product yield %#", (batch, code) => {
    expect(calculateBatchRecipe(baseInput({ batch })).errors.map((item) => item.code)).toContain(code);
  });

  it("scales final precursor-mixture basis before rounding", () => {
    const result = calculateBatchRecipe(baseInput({ batch: { basis: "final-precursor-mixture-mass", requestedMassGrams: "12.345" } }));
    expect(result.batch).toMatchObject({ targetFormulaMoles: "1.2345", preRoundingTotalPrecursorMassGrams: "12.345" });
  });

  it("returns a structured unsupported result for nonlinear adjustment types", () => {
    const unsupported = { schemaVersion: "1.0.0", id: "nonlinear", type: "nonlinear-mass-offset", stage: "mass-domain", order: 0, source: "user" } as unknown as BatchAdjustment;
    const result = calculateBatchRecipe(baseInput({ batch: { basis: "final-precursor-mixture-mass", requestedMassGrams: "10" }, adjustments: [unsupported] }));
    expect(result).toMatchObject({ status: "unsupported-adjustment", errors: [expect.objectContaining({ code: "UNSUPPORTED_ADJUSTMENT" })] });
  });

  it("includes purity and retained losses in mixture-basis scale", () => {
    const result = calculateBatchRecipe(baseInput({
      precursors: [{ schemaVersion: "1.0.0", id: "li", name: "Li", formula: "Li", purity: "0.5", molarMassOverride: override() }],
      batch: { basis: "final-precursor-mixture-mass", requestedMassGrams: "25" },
      adjustments: [loss("transfer", "0.2")],
    }));
    expect(result.batch.targetFormulaMoles).toBe("1");
    expect(result.batch.preRoundingTotalPrecursorMassGrams).toBe("25");
  });

  it.each(["0.000001", "1.2345", "1000000"])("accepts positive decimal batch mass %s reproducibly", (requestedMassGrams) => {
    const result = calculateBatchRecipe(baseInput({ batch: { basis: "final-precursor-mixture-mass", requestedMassGrams } }));
    expect(["success", "success-with-warnings"]).toContain(result.status);
    expect(result.batch.requestedMassGrams).toBe(requestedMassGrams);
  });

  it("applies elemental excess and deficiency before rebuilding and re-solving", () => {
    const excess = calculateBatchRecipe(baseInput({ adjustments: [elemental("elemental-excess", "li-plus", "Li", "0.05")] }));
    expect(excess.adjustedFeedComposition.amounts).toEqual({ Li: "1.05" });
    expect(excess.solver?.quantitiesByPrecursorId).toEqual({ li: "1.05" });
    expect(excess.precursors[0]?.postSolverAdjustedMoles).toBe("1.05");
    const deficiency = calculateBatchRecipe(baseInput({ adjustments: [elemental("elemental-deficiency", "li-minus", "Li", "0.02")] }));
    expect(deficiency.adjustedFeedComposition.amounts).toEqual({ Li: "0.98" });
  });

  it("applies multiple elemental adjustments sequentially with visible order", () => {
    const result = calculateBatchRecipe(baseInput({ adjustments: [elemental("elemental-deficiency", "b", "Li", "0.05", 1), elemental("elemental-excess", "a", "Li", "0.1", 0)] }));
    expect(result.adjustedFeedComposition.amounts.Li).toBe("1.045");
    expect(result.resolvedAdjustmentOrder.map((item) => item.id)).toEqual(["a", "b", "round"]);
    expect(result.trace.filter((item) => item.stepCode === "ELEMENTAL_ADJUSTMENT_APPLIED").map((item) => item.adjustmentId)).toEqual(["a", "b"]);
  });

  it("treats zero elemental adjustment as identity and rejects invalid values/elements", () => {
    expect(calculateBatchRecipe(baseInput({ adjustments: [elemental("elemental-excess", "zero", "Li", "0")] })).adjustedFeedComposition.amounts).toEqual({ Li: "1" });
    expect(calculateBatchRecipe(baseInput({ adjustments: [elemental("elemental-excess", "bad", "Li", "-0.1")] })).status).toBe("invalid-input");
    expect(calculateBatchRecipe(baseInput({ adjustments: [elemental("elemental-deficiency", "bad", "Li", "1")] })).status).toBe("invalid-input");
    expect(calculateBatchRecipe(baseInput({ adjustments: [elemental("elemental-excess", "bad", "Al", "0.1")] })).errors[0]?.code).toBe("ADJUSTMENT_ELEMENT_ABSENT");
  });

  it("reports solver infeasibility caused by adjusted stoichiometry", () => {
    const result = calculateBatchRecipe(baseInput({ idealCrystalComposition: formula("LiAl"), precursors: [{ schemaVersion: "1.0.0", id: "lial", name: "LiAl", formula: "LiAl", molarMassOverride: override() }], adjustments: [elemental("elemental-excess", "li-plus", "Li", "0.1")] }));
    expect(result.status).toBe("solver-infeasible");
    expect(result.precursors).toEqual([]);
  });

  it("applies precursor-specific adjustments after solving without re-solving", () => {
    const result = calculateBatchRecipe(baseInput({ adjustments: [precursorAdjustment("precursor-molar-excess", "extra", "li", "0.05")] }));
    expect(result.solver?.quantitiesByPrecursorId).toEqual({ li: "1" });
    expect(result.precursors[0]).toMatchObject({ nominalScaledMoles: "1", postSolverAdjustedMoles: "1.05", pureRequiredMassGrams: "10.5" });
    expect(result.realizedElements[0]?.signedResidualMoles).toBe("0.05");
    expect(result.warnings.map((item) => item.code)).toContain("PRECURSOR_ADJUSTMENT_CHANGES_BALANCE");
  });

  it("supports zero and deficiency precursor adjustments and validates IDs/fractions", () => {
    expect(calculateBatchRecipe(baseInput({ adjustments: [precursorAdjustment("precursor-molar-excess", "zero", "li", "0")] })).precursors[0]?.postSolverAdjustedMoles).toBe("1");
    expect(calculateBatchRecipe(baseInput({ adjustments: [precursorAdjustment("precursor-molar-deficiency", "minus", "li", "0.1")] })).precursors[0]?.postSolverAdjustedMoles).toBe("0.9");
    expect(calculateBatchRecipe(baseInput({ adjustments: [precursorAdjustment("precursor-molar-excess", "bad", "missing", "0.1")] })).status).toBe("invalid-input");
    expect(calculateBatchRecipe(baseInput({ adjustments: [precursorAdjustment("precursor-molar-excess", "bad", "li", "-0.1")] })).status).toBe("invalid-input");
  });

  it("derives molar mass from data or uses a visible override", () => {
    const derived = calculateBatchRecipe(baseInput({ precursors: [{ schemaVersion: "1.0.0", id: "li", name: "Li", formula: "Li" }] }));
    expect(derived.precursors[0]).toMatchObject({ molarMassGramsPerMole: "6.94", molarMassSource: "element-data" });
    const overridden = calculateBatchRecipe(baseInput());
    expect(overridden.precursors[0]).toMatchObject({ molarMassGramsPerMole: "10", molarMassSource: "override" });
    expect(overridden.warnings.map((item) => item.code)).toContain("MOLAR_MASS_OVERRIDE_USED");
  });

  it("rejects invalid overrides and missing atomic data", () => {
    const invalid = calculateBatchRecipe(baseInput({ precursors: [{ schemaVersion: "1.0.0", id: "li", name: "Li", formula: "Li", molarMassOverride: { ...override("0") } }] }));
    expect(invalid.status).toBe("invalid-input");
    const missing = calculateBatchRecipe(baseInput({ idealCrystalComposition: formula("Tc"), precursors: [{ schemaVersion: "1.0.0", id: "tc", name: "Tc", formula: "Tc" }] }));
    expect(missing.status).toBe("calculation-failure");
    expect(missing.errors.map((item) => item.code)).toContain("MISSING_ATOMIC_WEIGHT");
  });

  it("inherits formula/composition agreement validation", () => {
    const result = calculateBatchRecipe(baseInput({ precursors: [{ schemaVersion: "1.0.0", id: "li", name: "Li", formula: "Li", composition: composition({ Li: "2" }), molarMassOverride: override() }] }));
    expect(result.status).toBe("invalid-input");
    expect(result.errors.map((item) => item.code)).toContain("PRECURSOR_FORMULA_COMPOSITION_MISMATCH");
  });

  it.each([["1", "10"], ["0.995", "10.05025125628140703517587939698492"], ["0.95", "10.52631578947368421052631578947368"]])("applies purity %s by division", (purity, gross) => {
    const result = calculateBatchRecipe(baseInput({ precursors: [{ schemaVersion: "1.0.0", id: "li", name: "Li", formula: "Li", purity, molarMassOverride: override() }] }));
    expect(result.precursors[0]?.grossMassAfterPurityGrams).toBe(gross);
    expect(Number(result.precursors[0]?.grossMassAfterPurityGrams)).toBeGreaterThanOrEqual(10);
  });

  it("uses explicit purity default and rejects zero, above-one, and percent-scale values", () => {
    const assumed = calculateBatchRecipe(baseInput());
    expect(assumed.precursors[0]).toMatchObject({ purity: "1", puritySource: "assumed-default" });
    expect(assumed.appliedDefaults.map((item) => item.fieldPath)).toContain("precursors.li.purity");
    expect(calculateBatchRecipe(baseInput({ precursors: [{ schemaVersion: "1.0.0", id: "li", name: "Li", formula: "Li", purity: "0", molarMassOverride: override() }] })).status).toBe("invalid-input");
    const percent = calculateBatchRecipe(baseInput({ precursors: [{ schemaVersion: "1.0.0", id: "li", name: "Li", formula: "Li", purity: "95", molarMassOverride: override() }] }));
    expect(percent.errors.map((item) => item.code)).toContain("PERCENT_SCALE_SUSPICION");
  });

  it("reconstructs realized moles from retained gross mass and purity", () => {
    const result = calculateBatchRecipe(baseInput({ precursors: [{ schemaVersion: "1.0.0", id: "li", name: "Li", formula: "Li", purity: "0.5", molarMassOverride: override() }] }));
    expect(result.precursors[0]).toMatchObject({ finalRoundedGrossWeighingMassGrams: "20", pureEquivalentFinalMassGrams: "10", realizedPrecursorMoles: "1" });
    expect(result.warnings.map((item) => item.code)).toContain("IMPURITY_COMPOSITION_UNMODELED");
  });

  it("uses retained-fraction handling loss and applies losses sequentially", () => {
    const one = calculateBatchRecipe(baseInput({ adjustments: [loss("transfer", "0.02")] }));
    expect(one.precursors[0]?.preRoundGrossWeighingMassGrams).toBe("10.20408163265306122448979591836735");
    expect(one.precursors[0]?.handlingLossSteps[0]).toMatchObject({ retainedFraction: "0.98" });
    expect(one.precursors[0]?.expectedRetainedGrossMassGrams).toBe("9.99992");
    expect(one.precursors[0]?.realizedPrecursorMoles).toBe("1.0204");
    const two = calculateBatchRecipe(baseInput({ adjustments: [loss("transfer", "0.02", "all", 0), loss("milling", "0.03", "all", 1)] }));
    expect(two.precursors[0]?.preRoundGrossWeighingMassGrams).toBe("10.51967178624026930359772775089417");
    expect(two.precursors[0]?.handlingLossSteps).toHaveLength(2);
  });

  it("treats zero loss as identity, scopes losses, and rejects loss >= 1", () => {
    expect(calculateBatchRecipe(baseInput({ adjustments: [loss("zero", "0")] })).precursors[0]?.preRoundGrossWeighingMassGrams).toBe("10");
    expect(calculateBatchRecipe(baseInput({ adjustments: [loss("bad", "1")] })).status).toBe("invalid-input");
    const multi = baseInput({ idealCrystalComposition: formula("LiAl"), precursors: [{ schemaVersion: "1.0.0", id: "al", name: "Al", formula: "Al", molarMassOverride: override() }, { schemaVersion: "1.0.0", id: "li", name: "Li", formula: "Li", molarMassOverride: override() }], adjustments: [loss("li-only", "0.2", ["li"])] });
    const result = calculateBatchRecipe(multi);
    expect(result.precursors.find((item) => item.precursorId === "al")?.preRoundGrossWeighingMassGrams).toBe(result.precursors.find((item) => item.precursorId === "al")?.pureRequiredMassGrams);
  });

  it.each([
    ["nearest-half-even", "1"],
    ["nearest-half-up", "1.01"],
    ["floor", "1"],
    ["ceiling", "1.01"],
  ] as const)("applies %s rounding exactly once", (mode, expected) => {
    const result = calculateBatchRecipe(baseInput({ batch: { basis: "final-precursor-mixture-mass", requestedMassGrams: "1.005" }, rounding: { adjustmentId: "round", order: 0, incrementGrams: "0.01", mode, residualToleranceMoles: "1", materialityRelativeTolerance: "1" } }));
    expect(result.precursors[0]?.preRoundGrossWeighingMassGrams).toBe("1.005");
    expect(result.precursors[0]?.finalRoundedGrossWeighingMassGrams).toBe(expected);
  });

  it("rejects invalid increments, supports fine increments, and warns on coarse material shifts", () => {
    expect(calculateBatchRecipe(baseInput({ rounding: { adjustmentId: "round", order: 0, incrementGrams: "0", mode: "nearest-half-even", residualToleranceMoles: "0", materialityRelativeTolerance: "0" } })).status).toBe("invalid-input");
    const fine = calculateBatchRecipe(baseInput({ rounding: { adjustmentId: "round", order: 0, incrementGrams: "0.000001", mode: "nearest-half-even", residualToleranceMoles: "0", materialityRelativeTolerance: "0" } }));
    expect(fine.precursors[0]?.finalRoundedGrossWeighingMassGrams).toBe("10");
    const coarse = calculateBatchRecipe(baseInput({ batch: { basis: "final-precursor-mixture-mass", requestedMassGrams: "1.4" }, rounding: { adjustmentId: "round", order: 0, incrementGrams: "1", mode: "nearest-half-even", residualToleranceMoles: "0", materialityRelativeTolerance: "0.01" } }));
    expect(coarse.warnings.map((item) => item.code)).toEqual(expect.arrayContaining(["MATERIAL_ROUNDING_SHIFT", "REALIZED_RESIDUAL_ABOVE_TOLERANCE"]));
  });

  it("reconstructs raw and normalized realized composition and precursor-only totals", () => {
    const result = calculateBatchRecipe(baseInput({ idealCrystalComposition: formula("Li"), precursors: [{ schemaVersion: "1.0.0", id: "lio", name: "Li2O", formula: "Li2O", molarMassOverride: override() }] }));
    expect(result.rawRealizedElementMoles).toMatchObject({ Li: "1", O: "0.5" });
    expect(result.precursorOnlyRealizedElementMoles).toEqual({ O: "0.5" });
    expect(result.realizedComposition.amounts).toEqual({ Li: "0.6666666666666666666666666666666667", O: "0.3333333333333333333333333333333333" });
  });

  it("warns for sub-balance masses and duplicate adjustment order deterministically", () => {
    const result = calculateBatchRecipe(baseInput({ batch: { basis: "final-precursor-mixture-mass", requestedMassGrams: "0.0007" }, adjustments: [elemental("elemental-excess", "b", "Li", "0", 0), elemental("elemental-excess", "a", "Li", "0", 0)], rounding: { adjustmentId: "round", order: 0, incrementGrams: "0.0001", mode: "nearest-half-even", minimumPracticalMassGrams: "0.001", residualToleranceMoles: "1", materialityRelativeTolerance: "1" } }));
    expect(result.warnings.map((item) => item.code)).toEqual(expect.arrayContaining(["DUPLICATE_ADJUSTMENT_ORDER", "SUB_BALANCE_MASS"]));
    expect(result.warnings.map((item) => `${item.fieldPath}|${item.code}`)).toEqual([...result.warnings].sort((a, b) => a.fieldPath.localeCompare(b.fieldPath) || a.code.localeCompare(b.code)).map((item) => `${item.fieldPath}|${item.code}`));
  });

  it.each(["Ti2AlN", "Ti3AlC2", "Ti4AlN3", "(Ti0.5Nb0.5)2AlN", "Ti3Al(C0.5N0.5)2"])("completes synthetic end-to-end batch %s", (target) => {
    const targetComposition = formula(target);
    const inputs = Object.keys(targetComposition.amounts).map((element) => ({ schemaVersion: "1.0.0" as const, id: element.toLowerCase(), name: element, formula: element, molarMassOverride: override() }));
    const result = calculateBatchRecipe(baseInput({ idealCrystalComposition: targetComposition, precursors: inputs }));
    expect(["success", "success-with-warnings"]).toContain(result.status);
    expect(result.precursors).toHaveLength(inputs.length);
    expect(verifyBatchCalculation(result).valid).toBe(true);
  });

  it("preserves site input for a synthetic nine-element mixed target", () => {
    const site = createStandardMaxComposition("211", { M: { occupants: ["Li", "C", "N", "O", "F", "Na", "Al", "K", "Ti"].map((element, index) => ({ element, fraction: index === 8 ? "0.2" : "0.1" })) }, A: { occupants: [{ element: "V", fraction: "1" }] }, X: { occupants: [{ element: "Nb", fraction: "1" }] } });
    if (!site.success) throw new Error(site.errors[0]?.message);
    const target = site.value.composition;
    const inputs = ["Li", "C", "N", "O", "F", "Na", "Al", "K", "Ti", "V", "Nb"].map((element) => ({ schemaVersion: "1.0.0" as const, id: element.toLowerCase(), name: element, formula: element, molarMassOverride: override() }));
    const result = calculateBatchRecipe(baseInput({ idealCrystalComposition: target, precursors: inputs }));
    expect(["success", "success-with-warnings"]).toContain(result.status);
    expect(result.realizedElements).toHaveLength(11);
  });

  it("rejects duplicate IDs and invalid cross-stage declarations", () => {
    const duplicate = calculateBatchRecipe(baseInput({ adjustments: [elemental("elemental-excess", "same", "Li", "0.1"), elemental("elemental-deficiency", "same", "Li", "0.1")] }));
    expect(duplicate.errors.map((item) => item.code)).toContain("DUPLICATE_ADJUSTMENT_ID");
    const invalid = calculateBatchRecipe(baseInput({ adjustments: [{ ...elemental("elemental-excess", "bad", "Li", "0.1"), stage: "post-solver" } as unknown as BatchAdjustment] }));
    expect(invalid.errors.map((item) => item.code)).toContain("INVALID_ADJUSTMENT_STAGE");
  });

  it("is immutable and byte-reproducible under equivalent adjustment order", () => {
    const adjustments = [elemental("elemental-excess", "b", "Li", "0", 1), elemental("elemental-excess", "a", "Li", "0", 0)];
    const input = baseInput({ adjustments });
    const before = JSON.stringify(input);
    const first = calculateBatchRecipe(input);
    const second = calculateBatchRecipe(baseInput({ adjustments: [...adjustments].reverse(), batch: { basis: "ideal-product-mass", requestedMassGrams: "6.940" } }));
    expect(JSON.stringify(input)).toBe(before);
    expect(first.canonicalScientificRepresentation).toBe(second.canonicalScientificRepresentation);
    expect(canonicalizeBatchCalculation(first)).toBe(first.canonicalScientificRepresentation);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.precursors[0]?.handlingLossSteps)).toBe(true);
    expect(Object.isFrozen(first.trace[0]?.before)).toBe(true);
  });

  it("satisfies batch calculation invariants and linear scaling", () => {
    const one = calculateBatchRecipe(baseInput());
    const two = calculateBatchRecipe(baseInput({ batch: { basis: "ideal-product-mass", requestedMassGrams: "13.88" } }));
    expect(two.batch.targetFormulaMoles).toBe("2");
    expect(two.precursors[0]?.pureRequiredMassGrams).toBe("20");
    for (const result of [one, two]) {
      expect(result.precursors.every((item) => !item.finalRoundedGrossWeighingMassGrams.startsWith("-") && !/NaN|Infinity/.test(JSON.stringify(item)))).toBe(true);
      expect(verifyBatchCalculation(result).valid).toBe(true);
    }
  });

  it.each([
    ["Li", "Li3", "1/3", "30", "6.94", "10", "12.5", "13.88888888888888888888888888888889", "13.889", "1.11112", "0.3333333333333333333333333333333333"],
    ["Li2", "Li3", "2/3", "30", "13.88", "20", "25", "27.77777777777777777777777777777778", "27.778", "2.22224", "0.6666666666666666666666666666666667"],
    ["Li", "Li7", "1/7", "70", "6.94", "10", "12.5", "13.88888888888888888888888888888889", "13.889", "1.11112", "0.1428571428571428571428571428571429"],
  ])("preserves exact solver scalar %s via %s through mass, purity, loss, rounding, and realization", (target, precursorFormula, exact, molarMass, requestedMass, pureMass, grossPurityMass, preRoundMass, finalMass, realizedLi, approximation) => {
    const result = calculateBatchRecipe(baseInput({
      idealCrystalComposition: formula(target),
      precursors: [{ schemaVersion: "1.0.0", id: "rational", name: precursorFormula, formula: precursorFormula, purity: "0.8", molarMassOverride: override(molarMass) }],
      batch: { basis: "ideal-product-mass", requestedMassGrams: requestedMass },
      adjustments: [loss("transfer", "0.1")],
      rounding: { adjustmentId: "round", order: 0, incrementGrams: "0.001", mode: "nearest-half-even", residualToleranceMoles: "1", materialityRelativeTolerance: "1" },
    }));
    const item = result.precursors[0]!;
    expect(result.solver?.orderedQuantityVector).toEqual([exact]);
    expect(item.solverMolesPerTargetFormulaMole).toBe(exact);
    expect(item.solverMolesPerTargetFormulaMoleExact).toEqual({ kind: "rational", canonical: exact, numerator: exact.split("/")[0], denominator: exact.split("/")[1] });
    expect(item.solverMolesPerTargetFormulaMoleDecimalApproximation).toEqual({ value: approximation, sourceExactCanonical: exact, calculationPrecisionSignificantDigits: 50, serializedPrecisionSignificantDigits: 34, roundingMode: "round-half-even" });
    expect(item.pureRequiredMassGrams).toBe(pureMass);
    expect(item.grossMassAfterPurityGrams).toBe(grossPurityMass);
    expect(item.preRoundGrossWeighingMassGrams).toBe(preRoundMass);
    expect(item.finalRoundedGrossWeighingMassGrams).toBe(finalMass);
    expect(result.rawRealizedElementMoles.Li).toBe(realizedLi);
    expect(result.realizedComposition.amounts).toEqual({ Li: "1" });
    expect(result.trace).toContainEqual(expect.objectContaining({ stepCode: "SOLVER_SCALAR_CONVERTED_FOR_MASS_DOMAIN", before: expect.objectContaining({ exactCanonical: exact }), after: { decimalApproximation: approximation }, parameters: { calculationPrecisionSignificantDigits: "50", serializedPrecisionSignificantDigits: "34", roundingMode: "round-half-even" } }));
  });

  it("measures representative synchronous end-to-end systems without a timing gate", () => {
    const symbols = ["H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P"];
    const source = { id: "synthetic-performance", title: "Synthetic performance fixture", organization: "Test only", url: "https://example.invalid/test-only", accessedAt: "2026-07-13T00:00:00Z" };
    const timings: string[] = [];
    for (const [rowCount, columnCount] of [[4, 5], [9, 12], [15, 20]] as const) {
      const elements = symbols.slice(0, rowCount);
      const data: ElementDataSet = { schemaVersion: "2.0.0", dataVersion: "2026.0.0", title: "Synthetic arithmetic and performance data", effectiveDate: "2026-07-13", unit: "g/mol", digest: "0".repeat(64), calculationValuePolicyDescription: "Synthetic performance fixture values.", sources: [source], elements: elements.map((symbol, index) => ({ atomicNumber: index + 1, symbol, name: `synthetic-${symbol}`, standardAtomicWeight: { kind: "point", value: String(index + 1) }, calculationValue: String(index + 1), calculationValuePolicy: "user-specified", sourceIds: [source.id] })) };
      const target = composition(Object.fromEntries(elements.map((element) => [element, "1"])));
      const precursors = elements.map((element, index) => ({ schemaVersion: "1.0.0" as const, id: `base-${index.toString().padStart(2, "0")}`, name: element, composition: composition({ [element]: "1" }), molarMassOverride: override(String(index + 1)) }));
      while (precursors.length < columnCount) {
        const index = precursors.length - rowCount;
        const element = elements[index % elements.length]!;
        precursors.push({ schemaVersion: "1.0.0", id: `extra-${index.toString().padStart(2, "0")}`, name: `extra-${index}`, composition: composition({ [element]: "1" }), molarMassOverride: override(String((index % elements.length) + 1)) });
      }
      const started = performance.now();
      const result = calculateBatchRecipe({ schemaVersion: "1.0.0", idealCrystalComposition: target, precursors, batch: { basis: "ideal-product-mass", requestedMassGrams: "10" }, adjustments: [elemental("elemental-excess", "first-plus", elements[0]!, "0.01"), precursorAdjustment("precursor-molar-excess", "last-plus", precursors.at(-1)!.id, "0.02"), loss("all-loss", "0.01")], rounding: { adjustmentId: "round", order: 0, incrementGrams: "0.001", mode: "nearest-half-even", residualToleranceMoles: "0.001", materialityRelativeTolerance: "0.001" }, elementData: data });
      timings.push(`${rowCount}x${columnCount}=${(performance.now() - started).toFixed(1)}ms`);
      expect(["success", "success-with-warnings"]).toContain(result.status);
      expect(result.precursors).toHaveLength(columnCount);
    }
    console.info(`Batch performance observation: ${timings.join(", ")}`);
  });
});
