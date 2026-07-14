import { describe, expect, it } from "vitest";
import {
  buildElementBalanceMatrix,
  canonicalizePrecursorSolution,
  createComposition,
  parseFormula,
  solvePrecursorBalance,
  validatePrecursorConstraints,
  verifyPrecursorSolution,
  type BalancePrecursorDefinition,
  type ElementBalanceMatrix,
  type ElementalComposition,
  type PrecursorSolverObjective,
  type SolverPrecursorConstraint,
} from "./index";

function composition(amounts: Record<string, string>): ElementalComposition {
  const result = createComposition(amounts);
  if (!result.success) throw new Error(result.errors[0]?.message);
  return result.value;
}

function formula(text: string): ElementalComposition {
  const result = parseFormula(text);
  if (!result.success) throw new Error(result.errors[0]?.message);
  return result.composition;
}

function precursor(id: string, value: string): BalancePrecursorDefinition {
  return { schemaVersion: "1.0.0", id, name: id, formula: value };
}

function matrix(target: ElementalComposition, inputs: readonly BalancePrecursorDefinition[]): ElementBalanceMatrix {
  const result = buildElementBalanceMatrix(target, inputs);
  if (!result.success) throw new Error(result.errors[0]?.message);
  return result.value;
}

const fixed = (precursorId: string, value: string): SolverPrecursorConstraint => ({ schemaVersion: "1.0.0", mode: "fixed", precursorId, value });
const bounded = (precursorId: string, minimum?: string, maximum?: string): SolverPrecursorConstraint => ({ schemaVersion: "1.0.0", mode: "bounded", precursorId, ...(minimum === undefined ? {} : { minimum }), ...(maximum === undefined ? {} : { maximum }) });
const ratio = (numeratorPrecursorId: string, denominatorPrecursorId: string, numeratorRatio = "1", denominatorRatio = "1"): SolverPrecursorConstraint => ({ schemaVersion: "1.0.0", mode: "ratio", numeratorPrecursorId, denominatorPrecursorId, numeratorRatio, denominatorRatio });

describe("deterministic constrained precursor solver", () => {
  it.each([
    ["Ti2AlN", [precursor("al", "Al"), precursor("n", "N"), precursor("ti", "Ti")], { al: "1", n: "1", ti: "2" }],
    ["Ti3AlC2", [precursor("al", "Al"), precursor("c", "C"), precursor("ti", "Ti")], { al: "1", c: "2", ti: "3" }],
    ["Ti4AlN3", [precursor("al", "Al"), precursor("n", "N"), precursor("ti", "Ti")], { al: "1", n: "3", ti: "4" }],
    ["(Ti0.5Nb0.5)2AlN", [precursor("al", "Al"), precursor("n", "N"), precursor("nb", "Nb"), precursor("ti", "Ti")], { al: "1", n: "1", nb: "1", ti: "1" }],
    ["Ti3Al(C0.5N0.5)2", [precursor("al", "Al"), precursor("c", "C"), precursor("n", "N"), precursor("ti", "Ti")], { al: "1", c: "1", n: "1", ti: "3" }],
  ])("solves unique hand-audited formula-unit systems for %s", (target, inputs, expected) => {
    const result = solvePrecursorBalance(matrix(formula(target), inputs));
    expect(result.status).toBe("exact-unique");
    expect(result.quantitiesByPrecursorId).toEqual(expected);
    expect(result.elementalResiduals.every((item) => item.residual === "0" && item.passes)).toBe(true);
    expect(result.units).toBe("mol precursor / mol target formula");
  });

  it("solves a simple diagonal system and preserves stable ordering", () => {
    const result = solvePrecursorBalance(matrix(composition({ Ti: "2", Al: "3" }), [precursor("ti", "Ti"), precursor("al", "Al")]));
    expect(result.quantities.map((item) => item.precursorId)).toEqual(["al", "ti"]);
    expect(result.orderedQuantityVector).toEqual(["3", "2"]);
    expect(result.reconstructedTargetComposition).toEqual({ Al: "3", Ti: "2" });
  });

  it("selects deterministic vertices for duplicate and underdetermined columns", () => {
    const duplicate = matrix(formula("Ti"), [precursor("a", "Ti"), precursor("b", "Ti")]);
    const fallback = solvePrecursorBalance(duplicate);
    expect(fallback).toMatchObject({ status: "exact-multiple", orderedQuantityVector: ["0", "1"] });
    expect(fallback.objective).toMatchObject({ appliedOrder: ["deterministic-feasible"], multipleFeasibleSolutions: true });

    const three = matrix(formula("TiAl"), [precursor("a", "Ti"), precursor("b", "Al"), precursor("mix", "TiAl")]);
    expect(solvePrecursorBalance(three).status).toBe("exact-multiple");
  });

  it("minimizes total precursor quantity exactly", () => {
    const input = matrix(formula("Ti2"), [precursor("ti", "Ti"), precursor("ti2", "Ti2")]);
    const result = solvePrecursorBalance(input, [], { objectives: [{ kind: "minimize-total-quantity" }] });
    expect(result.orderedQuantityVector).toEqual(["0", "1"]);
    expect(result.objective.values[0]?.values).toEqual(["1"]);
  });

  it("applies preferred IDs, ordered objectives, and stable tie-breaking", () => {
    const input = matrix(formula("Ti"), [precursor("a", "Ti"), precursor("b", "Ti")]);
    const objectives: PrecursorSolverObjective[] = [{ kind: "prefer-precursors", precursorIds: ["a", "b"] }, { kind: "minimize-total-quantity" }];
    const result = solvePrecursorBalance(input, [], { objectives });
    expect(result.quantitiesByPrecursorId).toEqual({ a: "1", b: "0" });
    expect(result.objective.appliedOrder).toEqual(["prefer-precursors", "minimize-total-quantity"]);
    expect(result.objective.tieBreakingPolicy).toBe("lexicographically-minimize-ordered-quantity-vector");
  });

  it("solves consistent overdetermined systems and classifies rank inconsistency", () => {
    const consistent = solvePrecursorBalance(matrix(formula("TiAl"), [precursor("mix", "TiAl")]));
    expect(consistent).toMatchObject({ status: "exact-unique", orderedQuantityVector: ["1"] });
    const inconsistent = solvePrecursorBalance(matrix(formula("TiAl"), [precursor("mix", "Ti2Al")]));
    expect(inconsistent.status).toBe("infeasible-linear");
    expect(inconsistent.errors[0]?.message).toMatch(/rank\(A\).*rank\(\[A\|b\]\)/);
  });

  it("distinguishes algebraic feasibility from non-negative feasibility", () => {
    const input = matrix(composition({ Al: "1", Ti: "0.2" }), [precursor("a", "AlTi"), precursor("b", "AlTi2")]);
    const result = solvePrecursorBalance(input);
    expect(result.status).toBe("infeasible-nonnegative");
    expect(result.errors[0]).toMatchObject({ code: "INFEASIBLE_NONNEGATIVE", blocking: true });
  });

  it("retains a feasible zero precursor and exact active policy", () => {
    const result = solvePrecursorBalance(matrix(formula("Ti"), [precursor("a", "Ti"), precursor("b", "Al")]));
    expect(result.status).toBe("exact-multiple");
    expect(result.quantitiesByPrecursorId).toEqual({ a: "1", b: "0" });
    expect(result.quantities[1]).toMatchObject({ isZero: true, active: false });
    expect(result.activePrecursorPolicy).toBe("exactly-greater-than-zero");
  });

  it("supports feasible fixed, fixed-zero, and multiple fixed constraints", () => {
    const input = matrix(formula("TiAl"), [precursor("al", "Al"), precursor("ti", "Ti"), precursor("mix", "TiAl")]);
    const one = solvePrecursorBalance(input, [fixed("mix", "1")]);
    expect(one.quantitiesByPrecursorId).toEqual({ al: "0", mix: "1", ti: "0" });
    const zero = solvePrecursorBalance(input, [fixed("mix", "0")]);
    expect(zero.quantitiesByPrecursorId).toEqual({ al: "1", mix: "0", ti: "1" });
    const several = solvePrecursorBalance(input, [fixed("al", "0.5"), fixed("mix", "0.5"), fixed("ti", "0.5")]);
    expect(several.status).toBe("exact-unique");
  });

  it("reports fixed infeasibility and direct fixed/bound conflicts", () => {
    const input = matrix(formula("TiN"), [precursor("tin", "TiN"), precursor("ti", "Ti")]);
    expect(solvePrecursorBalance(input, [fixed("tin", "2")]).status).toBe("infeasible-constraints");
    const conflict = solvePrecursorBalance(input, [fixed("tin", "1.2"), bounded("tin", undefined, "1")]);
    expect(conflict.status).toBe("infeasible-constraints");
    expect(conflict.errors[0]?.code).toBe("CONTRADICTORY_SOLVER_CONSTRAINTS");
  });

  it("enforces lower, upper, active upper, and equal bounds", () => {
    const input = matrix(formula("Ti"), [precursor("a", "Ti"), precursor("b", "Ti")]);
    expect(solvePrecursorBalance(input, [bounded("a", "0.2")]).quantitiesByPrecursorId).toEqual({ a: "0.2", b: "0.8" });
    expect(solvePrecursorBalance(input, [bounded("a", undefined, "0.4")]).quantitiesByPrecursorId).toEqual({ a: "0", b: "1" });
    const activeUpper = solvePrecursorBalance(input, [bounded("a", undefined, "0.4")], { objectives: [{ kind: "prefer-precursors", precursorIds: ["a"] }] });
    expect(activeUpper.quantitiesByPrecursorId).toEqual({ a: "0.4", b: "0.6" });
    expect(activeUpper.activeConstraints).toEqual([expect.objectContaining({ mode: "bounded", maximum: "0.4" })]);
    const equal = solvePrecursorBalance(input, [bounded("a", "0.25", "0.25")]);
    expect(equal.quantitiesByPrecursorId).toEqual({ a: "0.25", b: "0.75" });
    expect(equal.normalizedConstraints[0]?.mode).toBe("bounded");
  });

  it("reports lower-bound and collective upper-bound infeasibility", () => {
    const input = matrix(formula("Ti"), [precursor("a", "Ti"), precursor("b", "Ti")]);
    expect(solvePrecursorBalance(input, [bounded("a", "1.1")]).status).toBe("infeasible-constraints");
    const insufficient = solvePrecursorBalance(input, [bounded("a", undefined, "0.4"), bounded("b", undefined, "0.4")]);
    expect(insufficient.status).toBe("infeasible-constraints");
  });

  it("rejects negative and reversed bounds as structured input or constraint failures", () => {
    const input = matrix(formula("Ti"), [precursor("a", "Ti")]);
    expect(solvePrecursorBalance(input, [bounded("a", "-0.1")]).status).toBe("invalid-input");
    expect(solvePrecursorBalance(input, [bounded("a", "2", "1")]).status).toBe("infeasible-constraints");
  });

  it("supports exact integer, non-integer, fixed, and bounded ratios", () => {
    const input = matrix(formula("Ti3"), [precursor("a", "Ti"), precursor("b", "Ti")]);
    expect(solvePrecursorBalance(input, [ratio("a", "b")]).quantitiesByPrecursorId).toEqual({ a: "1.5", b: "1.5" });
    expect(solvePrecursorBalance(input, [ratio("a", "b", "2", "1")]).quantitiesByPrecursorId).toEqual({ a: "2", b: "1" });
    expect(solvePrecursorBalance(input, [ratio("a", "b", "2", "1"), fixed("b", "1")]).status).toBe("exact-unique");
    expect(solvePrecursorBalance(input, [ratio("a", "b", "2", "1"), bounded("a", undefined, "2")]).quantitiesByPrecursorId).toEqual({ a: "2", b: "1" });
  });

  it("detects contradictory ratio pairs and cycles", () => {
    const input = matrix(formula("Ti"), [precursor("a", "Ti"), precursor("b", "Ti"), precursor("c", "Ti")]);
    expect(solvePrecursorBalance(input, [ratio("a", "b", "1", "1"), ratio("a", "b", "2", "1")]).status).toBe("infeasible-constraints");
    const cycle = solvePrecursorBalance(input, [ratio("a", "b", "1", "1"), ratio("b", "c", "1", "1"), ratio("a", "c", "2", "1")]);
    expect(cycle.status).toBe("infeasible-constraints");
  });

  it("rejects unknown, zero, and self ratio references", () => {
    const input = matrix(formula("Ti"), [precursor("a", "Ti"), precursor("b", "Ti")]);
    expect(solvePrecursorBalance(input, [ratio("a", "missing")]).status).toBe("invalid-input");
    expect(solvePrecursorBalance(input, [ratio("a", "b", "0", "1")]).status).toBe("invalid-input");
    expect(solvePrecursorBalance(input, [ratio("a", "a")]).status).toBe("invalid-input");
  });

  it("reports a target-incompatible ratio as constrained infeasibility", () => {
    const input = matrix(formula("Ti2Al"), [precursor("ti", "Ti"), precursor("al", "Al")]);
    expect(solvePrecursorBalance(input, [ratio("ti", "al", "1", "1")]).status).toBe("infeasible-constraints");
  });

  it("computes precursor-only introduced totals and retains zero target columns", () => {
    const oxygen = solvePrecursorBalance(matrix(formula("Ti"), [precursor("tio2", "TiO2")]));
    expect(oxygen.precursorOnlyIntroducedElements).toEqual([expect.objectContaining({ element: "O", introducedAmount: "2", contributingPrecursorIds: ["tio2"], strictClosedSystemRequested: false })]);
    expect(oxygen.warnings[0]?.code).toBe("PRECURSOR_ONLY_ELEMENT_INTRODUCED");
    const zeroColumn = solvePrecursorBalance(matrix(formula("Ti"), [precursor("ti", "Ti"), precursor("kf", "KF")]));
    expect(zeroColumn.quantitiesByPrecursorId).toEqual({ kf: "0", ti: "1" });
    expect(zeroColumn.quantities).toHaveLength(2);
  });

  it("is deterministic under reordered constraints and canonicalized precursor input", () => {
    const a = matrix(formula("Ti"), [precursor("b", "Ti"), precursor("a", "Ti")]);
    const b = matrix(composition({ Ti: "1.0" }), [precursor("a", "Ti"), precursor("b", "Ti")]);
    const constraints = [bounded("a", "0.2"), bounded("b", undefined, "0.8")];
    const left = solvePrecursorBalance(a, constraints);
    const right = solvePrecursorBalance(b, [...constraints].reverse());
    expect(left.canonicalScientificRepresentation).toBe(right.canonicalScientificRepresentation);
    expect(canonicalizePrecursorSolution(left)).toBe(left.canonicalScientificRepresentation);
  });

  it("rejects unsupported objectives instead of approximating cardinality", () => {
    const input = matrix(formula("Ti"), [precursor("a", "Ti")]);
    const result = solvePrecursorBalance(input, [], { objectives: [{ kind: "minimize-active-precursors" } as unknown as PrecursorSolverObjective] });
    expect(result).toMatchObject({ status: "invalid-input", errors: [expect.objectContaining({ code: "UNSUPPORTED_SOLVER_OBJECTIVE" })] });
  });

  it("enforces a deterministic exact candidate limit", () => {
    const input = matrix(formula("Ti"), [precursor("a", "Ti"), precursor("b", "Ti"), precursor("c", "Ti"), precursor("d", "Ti")]);
    expect(solvePrecursorBalance(input, [], { candidateLimit: 1 }).status).toBe("solver-failure");
  });

  it("verifies exact, at-tolerance, outside-tolerance, bound, ratio, and negative values", () => {
    const single = matrix(formula("Ti"), [precursor("a", "Ti")]);
    expect(verifyPrecursorSolution(single, ["1"]).valid).toBe(true);
    expect(verifyPrecursorSolution(single, ["0.999"], [], { elementalAbsolute: "0.001", elementalRelative: "0", nonnegativity: "0", bound: "0", ratio: "0", objectiveTie: "0" }).valid).toBe(true);
    expect(verifyPrecursorSolution(single, ["0.9989"], [], { elementalAbsolute: "0.001", elementalRelative: "0", nonnegativity: "0", bound: "0", ratio: "0", objectiveTie: "0" }).valid).toBe(false);
    const pair = matrix(formula("Ti2"), [precursor("a", "Ti"), precursor("b", "Ti")]);
    const checks = verifyPrecursorSolution(pair, ["1.001", "0.999"], [bounded("a", undefined, "1"), ratio("a", "b")], { elementalAbsolute: "0", elementalRelative: "0", nonnegativity: "0", bound: "0.001", ratio: "0.002", objectiveTie: "0" });
    expect(checks.valid).toBe(true);
    expect(verifyPrecursorSolution(single, ["-0.1"]).valid).toBe(false);
  });

  it("uses scale-aware residual metadata for large and small rows", () => {
    const input = matrix(composition({ Ti: "1000000", Al: "0.000001" }), [precursor("al", "Al"), precursor("ti", "Ti")]);
    const result = solvePrecursorBalance(input);
    expect(result.elementalResiduals.map((item) => item.scale)).toEqual(["1", "1000000"]);
    expect(result.elementalResiduals.every((item) => item.residual === "0")).toBe(true);
  });

  it("validates empty, duplicate, unknown, and unsupported-version constraints", () => {
    const input = matrix(formula("Ti"), [precursor("a", "Ti")]);
    expect(validatePrecursorConstraints(input, [])).toMatchObject({ valid: true, errors: [] });
    expect(solvePrecursorBalance(input, [fixed("a", "1"), fixed("a", "1")]).status).toBe("invalid-input");
    expect(solvePrecursorBalance(input, [fixed("missing", "1")]).status).toBe("invalid-input");
    expect(solvePrecursorBalance(input, [{ ...fixed("a", "1"), schemaVersion: "2.0.0" as "1.0.0" }]).status).toBe("invalid-input");
    expect(solvePrecursorBalance(input, [], { schemaVersion: "2.0.0" as "1.0.0" }).status).toBe("invalid-input");
    expect(validatePrecursorConstraints({ ...input, schemaVersion: "2.0.0" as "1.0.0" }, [])).toMatchObject({ valid: false, errors: [expect.objectContaining({ code: "INVALID_SOLVER_MATRIX" })] });
  });

  it("preserves exact non-terminating rational solutions", () => {
    const result = solvePrecursorBalance(matrix(formula("Ti"), [precursor("ti3", "Ti3")]));
    expect(result.orderedQuantityVector).toEqual(["1/3"]);
    expect(result.orderedExactQuantityVector).toEqual([{ kind: "rational", canonical: "1/3", numerator: "1", denominator: "3" }]);
    expect(result.quantities[0]?.exactQuantity).toEqual({ kind: "rational", canonical: "1/3", numerator: "1", denominator: "3" });
    expect(result.exactQuantitiesByPrecursorId.ti3).toEqual(result.quantities[0]?.exactQuantity);
    expect(result.elementalResiduals[0]?.residual).toBe("0");
  });

  it("preserves input and deeply freezes output with stable trace", () => {
    const input = matrix(formula("Ti"), [precursor("a", "Ti"), precursor("b", "Ti")]);
    const constraints = [bounded("a", "0.2")];
    const before = JSON.stringify({ matrix: input.canonicalScientificRepresentation, constraints });
    const result = solvePrecursorBalance(input, constraints);
    expect(JSON.stringify({ matrix: input.canonicalScientificRepresentation, constraints })).toBe(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.quantities)).toBe(true);
    expect(Object.isFrozen(result.quantities[0]?.targetElementContributions)).toBe(true);
    expect(Object.isFrozen(result.trace[0]?.inputs)).toBe(true);
    expect(Object.isFrozen(result.constraintVerification)).toBe(true);
    expect(solvePrecursorBalance(input, constraints).canonicalScientificRepresentation).toBe(result.canonicalScientificRepresentation);
    expect(result.trace.map((entry) => entry.stepCode)).toEqual(expect.arrayContaining(["SOLVER_INPUT_ACCEPTED", "CONSTRAINTS_CANONICALIZED", "EXACT_CANDIDATES_ENUMERATED", "EXACT_SOLUTION_VERIFIED", "SOLUTION_CANONICALIZED"]));
  });

  it("independently catches a corrupted quantity vector", () => {
    const input = matrix(formula("Ti2AlN"), [precursor("al", "Al"), precursor("n", "N"), precursor("ti", "Ti")]);
    const result = solvePrecursorBalance(input);
    expect(result.status).toBe("exact-unique");
    const corrupted = { ...result.quantitiesByPrecursorId, ti: "1.9" };
    const verification = verifyPrecursorSolution(input, corrupted);
    expect(verification.valid).toBe(false);
    expect(verification.elementalResiduals.find((item) => item.element === "Ti")?.residual).toBe("-0.1");
  });

  it.each([[4, 5], [9, 12], [15, 20]])("terminates deterministically for a representative %i by %i solver system", (rowCount, columnCount) => {
    const elements = ["H", "He", "Li", "Be", "B", "C", "N", "O", "F", "Ne", "Na", "Mg", "Al", "Si", "P"].slice(0, rowCount);
    const target = composition(Object.fromEntries(elements.map((element) => [element, "1"])));
    const inputs: BalancePrecursorDefinition[] = elements.map((element, index) => ({ schemaVersion: "1.0.0", id: `base-${index.toString().padStart(2, "0")}`, name: element, composition: composition({ [element]: "1" }) }));
    while (inputs.length < columnCount) {
      const index = inputs.length - rowCount;
      inputs.push({ schemaVersion: "1.0.0", id: `extra-${index.toString().padStart(2, "0")}`, name: `extra-${index}`, composition: composition({ [elements[index % elements.length]!]: "1" }) });
    }
    const result = solvePrecursorBalance(matrix(target, inputs));
    expect(result.status).toBe("exact-multiple");
    expect(result.quantities).toHaveLength(columnCount);
    expect(result.elementalResiduals.every((item) => item.residual === "0")).toBe(true);
  });
});
