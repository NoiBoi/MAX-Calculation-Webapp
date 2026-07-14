import { describe, expect, it } from "vitest";
import {
  parseFormula,
  serializeComposition,
  tokenizeFormula,
  type FormulaParseResult,
} from "./formula-parser";

function parsed(formula: string) {
  const result = parseFormula(formula);
  expect(result.success, result.success ? undefined : result.errors[0]?.message).toBe(true);
  return (result as Extract<FormulaParseResult, { success: true }>).composition;
}

describe("formula tokenization and parsing", () => {
  it.each([
    ["Ti3AlC2", { Ti: "3", Al: "1", C: "2" }],
    ["Ti4AlN3", { Ti: "4", Al: "1", N: "3" }],
    ["Nb2AlN", { Nb: "2", Al: "1", N: "1" }],
    ["TiN", { Ti: "1", N: "1" }],
    ["NbN", { Nb: "1", N: "1" }],
    ["AlN", { Al: "1", N: "1" }],
    ["Ti0.5Nb0.5AlN", { Ti: "0.5", Nb: "0.5", Al: "1", N: "1" }],
    ["(Ti0.5Nb0.5)2AlN", { Ti: "1", Nb: "1", Al: "1", N: "1" }],
    ["(Ti0.2Nb0.3V0.5)2AlC", { Ti: "0.4", Nb: "0.6", V: "1", Al: "1", C: "1" }],
    ["TiAlTi", { Ti: "2", Al: "1" }],
    ["((Ti2)2)3Al", { Ti: "12", Al: "1" }],
    ["Ti0.000000000001Al", { Ti: "0.000000000001", Al: "1" }],
    ["Ti1000000Al", { Ti: "1000000", Al: "1" }],
    ["Ti1.2Al1.1C2", { Ti: "1.2", Al: "1.1", C: "2" }],
  ])("parses %s into a flat elemental composition", (formula, expected) => {
    expect(parsed(formula).amounts).toEqual(expected);
  });

  it("preserves original formula separately from canonical serialization", () => {
    const result = parseFormula("(Ti0.500Nb0.500)2AlN");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.formula).toBe("(Ti0.500Nb0.500)2AlN");
    expect(result.normalizedFormula).toBe("NAlTiNb");
    expect(result.normalizedFormula).not.toContain("(");
  });

  it("parses every real element symbol independently of atomic-weight availability", () => {
    const result = parseFormula("W2Se3");
    expect(result.success).toBe(true);
    if (result.success) expect(result.composition.amounts).toEqual({ W: "2", Se: "3" });
  });

  it("produces source-positioned tokens", () => {
    const result = tokenizeFormula("(Ti0.5)2");
    expect(result.success).toBe(true);
    expect(result.tokens).toEqual([
      { kind: "open-parenthesis", value: "(", position: 0, end: 1 },
      { kind: "element", value: "Ti", position: 1, end: 3 },
      { kind: "number", value: "0.5", position: 3, end: 6 },
      { kind: "close-parenthesis", value: ")", position: 6, end: 7 },
      { kind: "number", value: "2", position: 7, end: 8 },
    ]);
  });

  it.each([
    ["", "EMPTY_FORMULA"],
    ["Tii2", "UNKNOWN_ELEMENT"],
    ["tiN", "INVALID_ELEMENT_START"],
    ["Ti0Al", "ZERO_COEFFICIENT"],
    ["Ti-1Al", "NEGATIVE_COEFFICIENT"],
    ["Ti1.2.3Al", "INVALID_COEFFICIENT"],
    ["(TiAl", "UNMATCHED_OPENING_PARENTHESIS"],
    ["TiAl)", "UNMATCHED_CLOSING_PARENTHESIS"],
    ["()Ti", "EMPTY_GROUP"],
    ["2TiAl", "UNEXPECTED_NUMBER"],
    ["TiAl$", "TRAILING_INVALID_CHARACTER"],
    ["TiN+", "UNSUPPORTED_CHARGE"],
    ["TiN^3-", "UNSUPPORTED_CHARGE"],
    ["^13CTi", "UNSUPPORTED_ISOTOPE"],
    ["Ti1.0(2)Al", "UNSUPPORTED_UNCERTAINTY"],
    ["CuSO4·5H2O", "UNSUPPORTED_HYDRATION_DOT"],
    ["CuSO4.H2O", "UNSUPPORTED_HYDRATION_DOT"],
    ["Ti3AlC2-x", "UNSUPPORTED_VARIABLE"],
    ["Ti N", "WHITESPACE_NOT_ALLOWED"],
  ])("rejects %s with stable code %s", (formula, code) => {
    const result = parseFormula(formula);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors[0]?.code).toBe(code);
      expect(result.errors[0]?.message).toBeTruthy();
    }
  });

  it("preserves useful partial composition on a later parse error", () => {
    const result = parseFormula("Ti2AlXx");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.partialComposition?.amounts).toEqual({ Ti: "2", Al: "1" });
  });
});

describe("canonical serialization", () => {
  it("uses deterministic atomic-number order by default", () => {
    const result = serializeComposition(parsed("Ti3AlC2"));
    expect(result).toEqual({ success: true, value: "C2AlTi3" });
  });

  it("supports an explicit alphabetical order", () => {
    const result = serializeComposition(parsed("Ti3AlC2"), { order: "alphabetical" });
    expect(result).toEqual({ success: true, value: "AlC2Ti3" });
  });

  it("omits ones and insignificant trailing zeros", () => {
    expect(serializeComposition(parsed("Ti1.200Al1.000"))).toEqual({ success: true, value: "AlTi1.2" });
  });

  it("round-trips canonical serialization to the same composition exactly", () => {
    const original = parsed("(Ti0.5Nb0.5)2AlN");
    const serialized = serializeComposition(original);
    expect(serialized.success).toBe(true);
    if (!serialized.success) return;
    const reparsed = parseFormula(serialized.value);
    expect(reparsed.success).toBe(true);
    if (reparsed.success) expect(reparsed.composition.amounts).toEqual(original.amounts);
  });
});
