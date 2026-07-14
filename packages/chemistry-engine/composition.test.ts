import { describe, expect, it } from "vitest";
import {
  addCompositions,
  compositionsEqualExact,
  compositionsEqualWithinTolerance,
  createComposition,
  multiplyComposition,
  normalizeCompositionRelativeTo,
  normalizeCompositionToTotal,
  totalAtomCount,
  type ElementalComposition,
} from "./composition";

function composition(amounts: Record<string, string>): ElementalComposition {
  const result = createComposition(amounts);
  expect(result.success).toBe(true);
  if (!result.success) throw new Error(result.errors[0]?.message);
  return result.value;
}

function value<T>(result: { success: true; value: T } | { success: false }): T {
  expect(result.success).toBe(true);
  if (!result.success) throw new Error("Expected successful composition operation");
  return result.value;
}

describe("elemental composition operations", () => {
  it("adds and combines elements without order dependence", () => {
    const result = value(addCompositions(composition({ Ti: "1", Al: "1" }), composition({ Ti: "2", C: "2" })));
    expect(result.amounts).toEqual({ Al: "1", C: "2", Ti: "3" });
  });

  it("multiplies by an exact decimal scalar", () => {
    expect(value(multiplyComposition(composition({ Ti: "0.5", Nb: "0.5" }), "2")).amounts).toEqual({
      Nb: "1",
      Ti: "1",
    });
  });

  it("compares exact numeric equality independently of formatting and order", () => {
    expect(compositionsEqualExact(composition({ Ti: "1.0", Al: "2" }), composition({ Al: "2.00", Ti: "1" }))).toBe(true);
  });

  it("supports explicit tolerance comparison", () => {
    const result = compositionsEqualWithinTolerance(
      composition({ Ti: "1" }),
      composition({ Ti: "1.000000000000000000000000000001" }),
      "1e-29",
    );
    expect(result).toEqual({ success: true, value: true });
  });

  it("rejects invalid comparison tolerance", () => {
    const result = compositionsEqualWithinTolerance(composition({ Ti: "1" }), composition({ Ti: "1" }), "-1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]?.code).toBe("INVALID_TOLERANCE");
  });

  it.each([
    ["1", { Al: "0.1666666666666666666666666666666667", C: "0.3333333333333333333333333333333333", Ti: "0.5" }],
    ["100", { Al: "16.66666666666666666666666666666667", C: "33.33333333333333333333333333333333", Ti: "50" }],
  ])("normalizes Ti3AlC2 to total %s", (target, expected) => {
    const result = value(normalizeCompositionToTotal(composition({ Ti: "3", Al: "1", C: "2" }), target));
    expect(result.amounts).toEqual(expected);
  });

  it("normalizes relative to a selected element", () => {
    const result = value(normalizeCompositionRelativeTo(composition({ Ti: "6", Al: "2", C: "4" }), "Al"));
    expect(result.amounts).toEqual({ Al: "1", C: "2", Ti: "3" });
  });

  it.each([{}, { Ti: "0" }])("rejects normalization of empty or zero composition", (amounts) => {
    const result = normalizeCompositionToTotal(composition(amounts as Record<string, string>), "1");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]?.code).toBe("EMPTY_COMPOSITION");
  });

  it("rejects normalization relative to an absent element", () => {
    const result = normalizeCompositionRelativeTo(composition({ Ti: "1" }), "Al");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]?.code).toBe("NORMALIZATION_REFERENCE_MISSING");
  });

  it("returns total atom count", () => {
    expect(totalAtomCount(composition({ Ti: "3", Al: "1", C: "2" }))).toEqual({ success: true, value: "6" });
  });

  it("returns immutable new values without changing inputs", () => {
    const input = composition({ Ti: "1", Al: "1" });
    const before = JSON.stringify(input);
    const output = value(multiplyComposition(input, "2"));
    expect(JSON.stringify(input)).toBe(before);
    expect(output).not.toBe(input);
    expect(Object.isFrozen(output)).toBe(true);
    expect(Object.isFrozen(output.amounts)).toBe(true);
  });
});
