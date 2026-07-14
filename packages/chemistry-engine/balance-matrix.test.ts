import { describe, expect, it } from "vitest";
import {
  analyzeBalanceMatrix,
  buildElementBalanceMatrix,
  createComposition,
  createStandardMaxComposition,
  parseFormula,
  type BalancePrecursorDefinition,
  type ElementalComposition,
  type SiteComposition,
} from "./index";

function composition(amounts: Record<string, string>): ElementalComposition {
  const result = createComposition(amounts);
  if (!result.success) throw new Error(result.errors[0]?.message);
  return result.value;
}

function formula(value: string): ElementalComposition {
  const result = parseFormula(value);
  if (!result.success) throw new Error(result.errors[0]?.message);
  return result.composition;
}

function precursor(
  id: string,
  value: string | ElementalComposition,
  order?: number,
): BalancePrecursorDefinition {
  return {
    schemaVersion: "1.0.0",
    id,
    name: id,
    ...(typeof value === "string" ? { formula: value } : { composition: value }),
    ...(order === undefined ? {} : { order }),
  };
}

function matrix(target: ElementalComposition | SiteComposition, precursors: readonly BalancePrecursorDefinition[]) {
  const result = buildElementBalanceMatrix(target, precursors);
  if (!result.success) throw new Error(result.errors.map((error) => error.message).join("; "));
  return result.value;
}

describe("element balance matrix construction", () => {
  it("constructs the hand-audited Ti2AlN matrix without solving", () => {
    const result = matrix(formula("Ti2AlN"), [precursor("tin", "TiN"), precursor("ti", "Ti"), precursor("al", "Al")]);
    expect(result.rows.map((row) => row.element)).toEqual(["N", "Al", "Ti"]);
    expect(result.columns.map((column) => column.precursorId)).toEqual(["al", "ti", "tin"]);
    expect(result.requiredElementMatrix).toEqual([["0", "0", "1"], ["1", "0", "0"], ["0", "1", "1"]]);
    expect(result.requirementVector).toEqual(["1", "1", "2"]);
    expect(result.analysis).toMatchObject({ matrixRank: 3, augmentedMatrixRank: 3, rankConsistency: "consistent" });
  });

  it("constructs and ranks Ti3AlC2 with atomic-number rows", () => {
    const result = matrix(formula("Ti3AlC2"), [precursor("tic", "TiC"), precursor("ti", "Ti"), precursor("al", "Al")]);
    expect(result.rows.map((row) => row.element)).toEqual(["C", "Al", "Ti"]);
    expect(result.requirementVector).toEqual(["2", "1", "3"]);
    expect(result.analysis.matrixRank).toBe(3);
  });

  it("converts a 413 site target and preserves its semantic metadata", () => {
    const site = createStandardMaxComposition("413", {
      M: { occupants: [{ element: "Ti", fraction: "1" }] },
      A: { occupants: [{ element: "Al", fraction: "1" }] },
      X: { occupants: [{ element: "N", fraction: "1" }] },
    });
    if (!site.success) throw new Error(site.errors[0]?.message);
    const result = matrix(site.value.composition, [precursor("ti", "Ti"), precursor("al", "Al"), precursor("n", "N")]);
    expect(result.requirementVector).toEqual(["3", "1", "4"]);
    expect(result.target).toMatchObject({ inputKind: "site-composition", compositionRole: "ideal-crystal", structure: "413", siteSchemaVersion: "1.0.0" });
  });

  it.each([
    ["(Ti0.5Nb0.5)2AlN", ["N", "Al", "Ti", "Nb"], ["1", "1", "1", "1"]],
    ["Ti3Al(C0.5N0.5)2", ["C", "N", "Al", "Ti"], ["1", "1", "1", "3"]],
  ])("uses flat target composition without site inference for %s", (target, elements, requirements) => {
    const result = matrix(formula(target), elements.map((element) => precursor(element.toLowerCase(), element)));
    expect(result.rows.map((row) => row.element)).toEqual(elements);
    expect(result.requirementVector).toEqual(requirements);
    expect(result.target.inputKind).toBe("elemental-composition");
  });

  it("handles an exact non-equimolar nine-element M site without number drift", () => {
    const site = createStandardMaxComposition("211", {
      M: { occupants: ["Ti", "V", "Cr", "Zr", "Nb", "Mo", "Hf", "Ta", "W"].map((element, index) => ({ element, fraction: index === 8 ? "0.2" : "0.1" })) },
      A: { occupants: [{ element: "Al", fraction: "1" }] },
      X: { occupants: [{ element: "N", fraction: "1" }] },
    });
    if (!site.success) throw new Error(site.errors[0]?.message);
    const supplies = ["Ti", "V", "Cr", "Zr", "Nb", "Mo", "Hf", "Ta", "W", "Al", "N"].map((element) => precursor(element.toLowerCase(), element));
    const result = matrix(site.value.composition, supplies);
    expect(result.target.composition.amounts).toMatchObject({ Ti: "0.2", V: "0.2", Cr: "0.2", W: "0.4" });
    expect(result.rows.map((row) => row.element)).toEqual(["N", "Al", "Ti", "V", "Cr", "Zr", "Nb", "Mo", "Hf", "Ta", "W"]);
  });

  it("orders rows and columns identically for reordered inputs", () => {
    const a = matrix(composition({ Ti: "2", N: "1", Al: "1" }), [precursor("z", "TiN"), precursor("a", "Al"), precursor("m", "Ti")]);
    const b = matrix(composition({ Al: "1.0", N: "1.00", Ti: "2.000" }), [precursor("m", composition({ Ti: "1.0" })), precursor("z", composition({ N: "1", Ti: "1" })), precursor("a", composition({ Al: "1" }))]);
    expect(a.canonicalScientificRepresentation).toBe(b.canonicalScientificRepresentation);
  });

  it("uses explicit ascending order and stable ID tie-breaking", () => {
    const result = matrix(formula("TiAl"), [precursor("z", "Ti", 1), precursor("b", "Al", 0), precursor("a", "Ti", 1), precursor("u", "Al")]);
    expect(result.columns.map((column) => column.precursorId)).toEqual(["b", "a", "z", "u"]);
    expect(result.diagnostics.some((item) => item.code === "DUPLICATE_PRECURSOR_ORDER")).toBe(true);
  });

  it("accepts matching formula and composition and rejects disagreement", () => {
    const matching = { ...precursor("tin", "TiN"), composition: composition({ Ti: "1.0", N: "1" }) };
    expect(buildElementBalanceMatrix(formula("TiN"), [matching]).success).toBe(true);
    const mismatch = { ...precursor("tin", "TiN"), composition: composition({ Ti: "1", N: "2" }) };
    const result = buildElementBalanceMatrix(formula("TiN"), [mismatch]);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]).toMatchObject({ code: "PRECURSOR_FORMULA_COMPOSITION_MISMATCH", fieldPath: "precursors[0]" });
  });

  it.each([["N", "nitrogen"], ["Al", "aluminum"]])("keeps a missing %s row and returns a blocking diagnostic", (element) => {
    const result = matrix(formula("TiAlN"), [precursor("ti", "Ti"), ...(element === "N" ? [precursor("al", "Al")] : [precursor("n", "N")])]);
    const index = result.elementToRow[element]!;
    expect(result.requiredElementMatrix[index]).toEqual(["0", "0"]);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "MISSING_REQUIRED_ELEMENT_SOURCE", element, blocking: true }));
    expect(result.analysis.rankConsistency).toBe("inconsistent");
  });

  it("records precursor-only oxygen separately from target rank rows", () => {
    const result = matrix(formula("TiAl"), [precursor("tio2", "TiO2"), precursor("al", "Al")]);
    expect(result.precursorOnlyRows.map((row) => row.element)).toEqual(["O"]);
    expect(result.precursorOnlyElementMatrix).toEqual([["0", "2"]]);
    expect(result.rows.map((row) => row.element)).not.toContain("O");
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: "PRECURSOR_ONLY_ELEMENT", element: "O", blocking: false }));
  });

  it("rejects duplicate IDs with stable paths", () => {
    const result = buildElementBalanceMatrix(formula("Ti"), [precursor("p", "Ti"), precursor("p", "Ti")]);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors).toContainEqual(expect.objectContaining({ code: "DUPLICATE_PRECURSOR_ID", fieldPath: "precursors[1].id" }));
  });

  it("detects identical, proportional, dependent, and zero columns exactly", () => {
    const result = matrix(formula("TiAl"), [precursor("a", "Ti"), precursor("b", composition({ Ti: "1.0" })), precursor("c", "Ti2"), precursor("kf", "KF"), precursor("al", "Al")]);
    expect(result.analysis.duplicateColumns[0]?.precursorIds).toEqual(["a", "b"]);
    expect(result.analysis.proportionalColumns.map((pair) => pair.precursorIds)).toContainEqual(["a", "c"]);
    expect(result.analysis.zeroColumns).toEqual([4]);
    expect(result.analysis.dependentColumns).toEqual([2, 3, 4]);
    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining(["DUPLICATE_COMPOSITION_COLUMNS", "PROPORTIONAL_COMPOSITION_COLUMNS", "ZERO_TARGET_CONTRIBUTION_COLUMN"]));
  });

  it("rejects zero composition, empty target, empty precursors, invalid formulas, and unsupported versions", () => {
    expect(buildElementBalanceMatrix(formula("Ti"), [precursor("zero", composition({}))])).toMatchObject({ success: false, errors: [expect.objectContaining({ code: "ZERO_PRECURSOR_COMPOSITION" })] });
    expect(buildElementBalanceMatrix(composition({}), [precursor("ti", "Ti")])).toMatchObject({ success: false, errors: [expect.objectContaining({ code: "EMPTY_BALANCE_TARGET" })] });
    expect(buildElementBalanceMatrix(formula("Ti"), [])).toMatchObject({ success: false, errors: [expect.objectContaining({ code: "EMPTY_PRECURSOR_LIST" })] });
    expect(buildElementBalanceMatrix(formula("Ti"), [precursor("bad", "Ti(")])).toMatchObject({ success: false, errors: [expect.objectContaining({ code: "UNMATCHED_OPENING_PARENTHESIS", fieldPath: "precursors[0].formula" })], diagnostics: expect.arrayContaining([expect.objectContaining({ code: "INVALID_PRECURSOR_FORMULA", blocking: true })]) });
    expect(buildElementBalanceMatrix(formula("Ti"), [{ ...precursor("ti", "Ti"), schemaVersion: "2.0.0" as "1.0.0" }])).toMatchObject({ success: false, errors: [expect.objectContaining({ code: "UNSUPPORTED_PRECURSOR_SCHEMA_VERSION" })] });
    expect(buildElementBalanceMatrix({ ...formula("Ti"), schemaVersion: "2.0.0" as "1.0.0" }, [precursor("ti", "Ti")])).toMatchObject({ success: false, errors: [expect.objectContaining({ code: "INVALID_BALANCE_TARGET", fieldPath: "target.schemaVersion" })] });
    expect(buildElementBalanceMatrix(formula("Ti"), [{ schemaVersion: "1.0.0", id: "missing", name: "Missing" }])).toMatchObject({ success: false, errors: [expect.objectContaining({ code: "MISSING_PRECURSOR_REPRESENTATION" })] });
    expect(buildElementBalanceMatrix(formula("Ti"), [{ ...precursor("ti", "Ti"), order: Number.NaN }])).toMatchObject({ success: false, errors: [expect.objectContaining({ code: "INVALID_PRECURSOR_ORDER" })] });
  });

  it("rejects a fully vacant site target as empty", () => {
    const vacant = { schemaVersion: "1.0.0", structure: "custom", compositionRole: "ideal-crystal", sites: [{ id: "empty", role: "custom", multiplicity: "1", occupants: [], vacancyFraction: "1" }] } as SiteComposition;
    const result = buildElementBalanceMatrix(vacant, [precursor("ti", "Ti")]);
    expect(result).toMatchObject({ success: false, errors: [expect.objectContaining({ code: "EMPTY_BALANCE_TARGET" })] });
  });

  it.each([
    [formula("TiAl"), [precursor("ti", "Ti"), precursor("al", "Al")], "square"],
    [formula("Ti"), [precursor("a", "Ti"), precursor("b", "Ti")], "underdetermined"],
    [formula("TiAlN"), [precursor("tial", "TiAl"), precursor("n", "N")], "overdetermined"],
  ] as const)("classifies matrix dimensions only", (target, inputs, expected) => {
    expect(matrix(target, inputs).dimensionClassification).toBe(expected);
  });

  it("reports exact rank consistency and algebraic degrees of freedom", () => {
    const consistent = matrix(formula("Ti"), [precursor("a", "Ti"), precursor("b", "Ti2")]);
    expect(consistent.analysis).toMatchObject({ matrixRank: 1, augmentedMatrixRank: 1, algebraicDegreesOfFreedom: 1, rankConsistency: "consistent", structurallyInfeasible: false });
    const inconsistent = matrix(formula("TiAl"), [precursor("mix", "TiAl2")]);
    expect(inconsistent.analysis).toMatchObject({ matrixRank: 1, augmentedMatrixRank: 2, rankConsistency: "inconsistent", structurallyInfeasible: true });
  });

  it("distinguishes exact dependence from arbitrarily close exact independence", () => {
    const dependent = matrix(composition({ Ti: "1", Al: "1" }), [precursor("a", composition({ Ti: "0.1", Al: "0.2" })), precursor("b", composition({ Ti: "0.2", Al: "0.4" }))]);
    const near = matrix(composition({ Ti: "1", Al: "1" }), [precursor("a", composition({ Ti: "0.1", Al: "0.2" })), precursor("b", composition({ Ti: "0.2", Al: "0.4000000000000000000000000000000001" }))]);
    expect(dependent.analysis.matrixRank).toBe(1);
    expect(near.analysis.matrixRank).toBe(2);
    expect(near.analysis.method.tolerance).toBeNull();
  });

  it("preserves exact canonical decimal coefficients in rational rank", () => {
    const third = "0.3333333333333333333333333333333333";
    const result = matrix(composition({ Ti: "1", Al: "1" }), [precursor("a", composition({ Ti: "0.1", Al: third })), precursor("b", composition({ Ti: "0.2", Al: third }))]);
    expect(result.requiredElementMatrix).toEqual([[third, third], ["0.1", "0.2"]]);
    expect(result.analysis.matrixRank).toBe(2);
  });

  it("does not mutate inputs and deeply freezes successful outputs", () => {
    const target = { schemaVersion: "1.0.0", amounts: { Ti: "1.0", Al: "1" } } as const;
    const inputs = [precursor("ti", "Ti"), precursor("al", "Al")];
    const before = JSON.stringify({ target, inputs });
    const result = matrix(target, inputs);
    expect(JSON.stringify({ target, inputs })).toBe(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.requiredElementMatrix)).toBe(true);
    expect(Object.isFrozen(result.requiredElementMatrix[0])).toBe(true);
    expect(Object.isFrozen(result.columns[0]?.composition.amounts)).toBe(true);
    expect(Object.isFrozen(result.diagnostics)).toBe(true);
    expect(Object.isFrozen(result.trace[0]?.entityIds)).toBe(true);
    expect(Object.isFrozen(result.analysis.pivotColumns)).toBe(true);
  });

  it("maintains dimension and mapping invariants", () => {
    const result = matrix(formula("Ti3AlC2"), [precursor("tic", "TiC"), precursor("ti", "Ti"), precursor("al", "Al"), precursor("kf", "KF")]);
    expect(result.requiredElementMatrix).toHaveLength(result.dimensions.rows);
    expect(result.requirementVector).toHaveLength(result.dimensions.rows);
    expect(result.requiredElementMatrix.every((row) => row.length === result.dimensions.columns)).toBe(true);
    expect(result.precursorOnlyElementMatrix.every((row) => row.length === result.dimensions.columns)).toBe(true);
    expect(Object.keys(result.elementToRow)).toHaveLength(result.rows.length);
    expect(Object.keys(result.precursorToColumn)).toHaveLength(result.columns.length);
    expect(result.analysis.matrixRank).toBeLessThanOrEqual(Math.min(result.dimensions.rows, result.dimensions.columns));
    expect(result.analysis.augmentedMatrixRank - result.analysis.matrixRank).toBeLessThanOrEqual(1);
  });

  it("standalone analysis reproduces embedded analysis deterministically", () => {
    const result = matrix(formula("Ti2AlN"), [precursor("ti", "Ti"), precursor("al", "Al"), precursor("tin", "TiN")]);
    expect(analyzeBalanceMatrix(result)).toEqual(result.analysis);
    expect(matrix(formula("Ti2AlN"), [precursor("tin", "TiN"), precursor("al", "Al"), precursor("ti", "Ti")]).canonicalScientificRepresentation).toBe(result.canonicalScientificRepresentation);
  });

  it.each([[4, 5], [9, 12], [15, 20]])("constructs representative deterministic %i by %i laboratory matrices", (rowCount, columnCount) => {
    const elements = ["H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P"].slice(0, rowCount);
    const target = composition(Object.fromEntries(elements.map((element, index) => [element, `${index + 1}`])));
    const inputs = Array.from({ length: columnCount }, (_, index) => precursor(`p${index.toString().padStart(2, "0")}`, composition({ [elements[index % elements.length]!]: `${(index % 3) + 1}` })));
    const result = matrix(target, inputs);
    expect(result.dimensions).toEqual({ rows: rowCount, columns: columnCount });
    expect(result.canonicalScientificRepresentation).toBe(matrix(target, [...inputs].reverse()).canonicalScientificRepresentation);
  });
});
