import { describe, expect, it } from "vitest";
import { addRational, parseExactRational, RATIONAL_ZERO, rationalToString } from "./exact-rational";
import { parseFormula } from "./formula-parser";
import { analyzeMaxXComponent, normalizeLeadingSiteRatioGroup, replaceMaxXCoefficient } from "./site-ratio-normalization";

function normalized(formula: string) {
  const result = normalizeLeadingSiteRatioGroup(formula, { enabled: true });
  if (!result.success) throw new Error(result.errors.map((error) => `${error.code}: ${error.message}`).join("\n"));
  return result.value;
}

describe("explicit leading MAX site-ratio normalization", () => {
  it("normalizes the six-element 413 example with exact rational values", () => {
    const value = normalized("(TiVMoNbW1.2Ta0.4)4AlC3");
    expect(value.originalFormula).toBe("(TiVMoNbW1.2Ta0.4)4AlC3");
    expect(value.detectedGroupText).toBe("TiVMoNbW1.2Ta0.4");
    expect(value.template).toBe("413");
    expect(value.ratioSum.canonical).toBe("5.6");
    expect(value.normalizedFormulaCoefficients).toMatchObject({
      Ti: { canonical: "5/7" }, V: { canonical: "5/7" }, Mo: { canonical: "5/7" },
      Nb: { canonical: "5/7" }, W: { canonical: "6/7" }, Ta: { canonical: "2/7" },
    });
    expect(value.normalizedOccupancies).toMatchObject({
      Ti: { canonical: "5/28" }, V: { canonical: "5/28" }, Mo: { canonical: "5/28" },
      Nb: { canonical: "5/28" }, W: { canonical: "3/14" }, Ta: { canonical: "1/14" },
    });
    expect(value.calculationComposition.amounts).toEqual({ Al: "7", C: "21", Mo: "5", Nb: "5", Ta: "2", Ti: "5", V: "5", W: "6" });
    expect(value.calculationCompositionScaleFactor.canonical).toBe("7");
  });

  it.each([
    ["(TiNb)2AlN", "211", { Ti: "1/2", Nb: "1/2" }, { Ti: "1", Nb: "1" }],
    ["(Ti0.7Nb0.3)2AlN", "211", { Ti: "7/10", Nb: "3/10" }, { Ti: "7/5", Nb: "3/5" }],
    ["(TiVNb)3AlC2", "312", { Ti: "1/3", V: "1/3", Nb: "1/3" }, { Ti: "1", V: "1", Nb: "1" }],
  ] as const)("normalizes supported example %s", (formula, template, occupancies, coefficients) => {
    const value = normalized(formula);
    expect(value.template).toBe(template);
    expect(Object.fromEntries(Object.entries(value.normalizedOccupancies).map(([element, scalar]) => [element, scalar.canonical]))).toMatchObject(occupancies);
    expect(Object.fromEntries(Object.entries(value.normalizedFormulaCoefficients).map(([element, scalar]) => [element, scalar.canonical]))).toMatchObject(coefficients);
  });

  it("makes the exact occupancies sum to one and coefficients sum to multiplicity", () => {
    const value = normalized("(TiVMoNbW1.2Ta0.4)4AlC3");
    const occupancyTotal = Object.values(value.normalizedOccupancies).reduce((sum, scalar) => addRational(sum, parseExactRational(scalar.canonical)), RATIONAL_ZERO);
    const coefficientTotal = Object.values(value.normalizedFormulaCoefficients).reduce((sum, scalar) => addRational(sum, parseExactRational(scalar.canonical)), RATIONAL_ZERO);
    expect(rationalToString(occupancyTotal)).toBe("1");
    expect(rationalToString(coefficientTotal)).toBe("4");
  });

  it("preserves a carbon-deficient 413 intended feed and renders both exact formula forms", () => {
    const value = normalized("(TiVMoTa0.5W1.5)4AlC2.7");
    expect(value.ratioSum.canonical).toBe("5");
    expect(value.normalizedOccupancies).toMatchObject({ Ti: { canonical: "1/5" }, V: { canonical: "1/5" }, Mo: { canonical: "1/5" }, Ta: { canonical: "1/10" }, W: { canonical: "3/10" } });
    expect(value.normalizedFormulaCoefficients).toMatchObject({ Ti: { canonical: "4/5" }, V: { canonical: "4/5" }, Mo: { canonical: "4/5" }, Ta: { canonical: "2/5" }, W: { canonical: "6/5" } });
    expect(value.intendedFeedXCoefficient).toMatchObject({ canonical: "27/10", numerator: "27", denominator: "10" });
    expect(value.intendedFeedComposition.C?.canonical).toBe("2.7");
    expect(value.idealXCoefficient.canonical).toBe("3");
    expect(value.idealTemplateFormula).toBe("M4AlC3");
    expect(value.feedClassification).toBe("x-deficient");
    expect(value.siteModelLabel).toContain("carbon-deficient feed");
    expect(value.siteOccupancyFormula).toBe("(Ti1/5V1/5Mo1/5Ta1/10W3/10)4AlC2.7");
    expect(value.expandedPerFormulaFormula).toBe("Ti4/5V4/5Mo4/5Ta2/5W6/5AlC2.7");
    expect(value.expandedPerFormulaFormula).not.toContain(")4");
    expect(value.idealCalculationComposition.amounts.C).toBe("3");
    expect(value.calculationComposition.amounts.C).toBe("2.7");
    expect(value.calculationCompositionScaleFactor.canonical).toBe("1");
  });

  it("analyzes and replaces a supported common X coefficient exactly", () => {
    const formula = "(TiVMoTa0.5W1.5)4AlC3";
    const analyzed = analyzeMaxXComponent(formula);
    expect(analyzed.success && analyzed.value).toMatchObject({ template: "413", element: "C", enteredCoefficientText: "3", idealCoefficient: { canonical: "3" } });
    const replaced = replaceMaxXCoefficient(formula, "2.7");
    expect(replaced.success && replaced.formula).toBe("(TiVMoTa0.5W1.5)4AlC2.7");
    if (replaced.success) expect(replaced.component.coefficient).toMatchObject({ canonical: "2.7", numerator: "27", denominator: "10" });
    for (const invalid of ["0", "-1", "abc"]) expect(replaceMaxXCoefficient(formula, invalid).success).toBe(false);
  });

  it("dynamically identifies pure nitrides and rejects mixed carbonitrides for the common shortcut", () => {
    const nitride = analyzeMaxXComponent("Ti2AlN");
    expect(nitride.success && nitride.value).toMatchObject({ template: "211", element: "N", enteredCoefficientText: "1" });
    expect(analyzeMaxXComponent("Ti3AlCN").success).toBe(false);
  });

  it("leaves ordinary parser grouping unchanged outside explicit mode", () => {
    const parsed = parseFormula("(TiVMoNbW1.2Ta0.4)4AlC3");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.composition.amounts).toEqual({ Al: "1", C: "3", Mo: "4", Nb: "4", Ta: "1.6", Ti: "4", V: "4", W: "4.8" });
  });

  it("preserves original input on a zero-ratio error", () => {
    const formula = "(Ti0Nb1)2AlN";
    const result = normalizeLeadingSiteRatioGroup(formula, { enabled: true });
    expect(result.success).toBe(false);
    expect(result.originalFormula).toBe(formula);
    if (!result.success) expect(result.errors[0]?.code).toBe("ZERO_COEFFICIENT");
  });

  it("rejects a negative ratio", () => {
    const result = normalizeLeadingSiteRatioGroup("(Ti-1Nb)2AlN", { enabled: true });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]?.code).toBe("NEGATIVE_COEFFICIENT");
  });

  it("rejects a missing multiplicity", () => {
    const result = normalizeLeadingSiteRatioGroup("(TiNb)AlN", { enabled: true });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]?.code).toBe("SITE_RATIO_MULTIPLICITY_REQUIRED");
  });

  it("rejects unsupported multiplicities", () => {
    const result = normalizeLeadingSiteRatioGroup("(TiNb)5AlC4", { enabled: true });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]?.code).toBe("SITE_RATIO_UNSUPPORTED_MULTIPLICITY");
  });

  it("rejects nested ratio groups", () => {
    const result = normalizeLeadingSiteRatioGroup("(Ti(VNb))3AlC2", { enabled: true });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]?.code).toBe("SITE_RATIO_NESTED_GROUP_UNSUPPORTED");
  });

  it("rejects an invalid MAX remainder", () => {
    const result = normalizeLeadingSiteRatioGroup("(TiNb)2AlO", { enabled: true });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]?.code).toBe("SITE_RATIO_INVALID_MAX_REMAINDER");
  });

  it("rejects normalization without a leading mixed group", () => {
    const result = normalizeLeadingSiteRatioGroup("Ti2AlN", { enabled: true });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]?.code).toBe("SITE_RATIO_LEADING_GROUP_REQUIRED");
  });

  it("honors an explicitly requested template", () => {
    const result = normalizeLeadingSiteRatioGroup("(TiNb)2AlN", { enabled: true, expectedSite: "M", template: "413" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]?.code).toBe("SITE_RATIO_TEMPLATE_MISMATCH");
  });
});
