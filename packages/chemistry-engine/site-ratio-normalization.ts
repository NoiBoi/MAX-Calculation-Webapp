import { createComposition, type ElementalComposition } from "./composition";
import { chemistryError, type ChemistryError } from "./errors";
import {
  addRational,
  compareRational,
  divideRational,
  makeRational,
  multiplyRational,
  parseExactRational,
  RATIONAL_ONE,
  RATIONAL_ZERO,
  rationalToString,
  type ExactRational,
} from "./exact-rational";
import { parseFormula, tokenizeFormula, type FormulaParseResult } from "./formula-parser";
import { approximateScientificScalar, scientificScalarFromExact, type ScientificScalar } from "./scientific-scalar";
import { createStandardMaxComposition, type StandardMaxTemplate } from "./site-composition";
import type { SiteComposition } from "./schemas";

export interface SiteRatioNormalizationOptions {
  readonly enabled: true;
  readonly expectedSite?: "M";
  readonly template?: StandardMaxTemplate;
}

export interface NormalizedSiteRatioEntry {
  readonly element: string;
  readonly enteredRatio: ScientificScalar;
  readonly normalizedOccupancy: ScientificScalar;
  readonly normalizedFormulaCoefficient: ScientificScalar;
  readonly occupancyApproximation: string;
  readonly formulaCoefficientApproximation: string;
}

export interface SiteRatioNormalizationTraceEntry {
  readonly operation: "parse-leading-ratio-group" | "normalize-site-ratios" | "create-explicit-site-model" | "derive-calculation-composition";
  readonly description: string;
  readonly exactValues: Readonly<Record<string, string>>;
}

export interface SiteRatioNormalizationValue {
  readonly schemaVersion: "1.0.0";
  readonly originalFormula: string;
  readonly detectedGroupText: string;
  readonly requestedMultiplicity: ScientificScalar;
  readonly template: StandardMaxTemplate;
  readonly enteredRatios: readonly NormalizedSiteRatioEntry[];
  readonly ratioSum: ScientificScalar;
  readonly normalizedOccupancies: Readonly<Record<string, ScientificScalar>>;
  readonly normalizedFormulaCoefficients: Readonly<Record<string, ScientificScalar>>;
  readonly explicitSiteModel: SiteComposition;
  readonly idealTemplateFormula: string;
  readonly idealXCoefficient: ScientificScalar;
  readonly intendedFeedXElement: "C" | "N";
  readonly intendedFeedXCoefficient: ScientificScalar;
  readonly intendedFeedXCoefficientText: string;
  readonly feedClassification: "stoichiometric" | "x-deficient" | "x-excess";
  readonly siteModelLabel: string;
  readonly siteOccupancyFormula: string;
  readonly expandedPerFormulaFormula: string;
  readonly remainingFormulaText: string;
  readonly remainingParsedFormula: Extract<FormulaParseResult, { readonly success: true }>;
  readonly derivedElementalComposition: Readonly<Record<string, ScientificScalar>>;
  readonly intendedFeedComposition: Readonly<Record<string, ScientificScalar>>;
  readonly idealCalculationComposition: ElementalComposition;
  readonly calculationComposition: ElementalComposition;
  readonly calculationCompositionScaleFactor: ScientificScalar;
  readonly warnings: readonly Readonly<{ code: string; message: string }>[];
  readonly trace: readonly SiteRatioNormalizationTraceEntry[];
}

export type SiteRatioNormalizationResult =
  | Readonly<{ success: true; originalFormula: string; value: SiteRatioNormalizationValue }>
  | Readonly<{ success: false; originalFormula: string; errors: readonly ChemistryError[] }>;

export interface MaxXComponentValue {
  readonly originalFormula: string;
  readonly template: StandardMaxTemplate;
  readonly element: "C" | "N";
  readonly enteredCoefficientText: string;
  readonly coefficient: ScientificScalar;
  readonly idealCoefficient: ScientificScalar;
  readonly coefficientPosition: number;
  readonly coefficientEnd: number;
}

export type MaxXComponentResult =
  | Readonly<{ success: true; value: MaxXComponentValue }>
  | Readonly<{ success: false; originalFormula: string; errors: readonly ChemistryError[] }>;

const multiplicityTemplate: Readonly<Record<string, StandardMaxTemplate>> = Object.freeze({ "2": "211", "3": "312", "4": "413" });
const xMultiplicity: Readonly<Record<StandardMaxTemplate, ExactRational>> = Object.freeze({ "211": makeRational(1n), "312": makeRational(2n), "413": makeRational(3n) });

function fail(originalFormula: string, error: ChemistryError): SiteRatioNormalizationResult {
  return Object.freeze({ success: false as const, originalFormula, errors: Object.freeze([error]) });
}

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function lcm(left: bigint, right: bigint): bigint {
  return (left / gcd(left, right)) * right;
}

function scalarRecord(values: ReadonlyMap<string, ExactRational>): Readonly<Record<string, ScientificScalar>> {
  return Object.freeze(Object.fromEntries([...values.entries()].map(([element, value]) => [element, scientificScalarFromExact(value)])));
}

function exactRatioScalar(value: ExactRational): ScientificScalar {
  return Object.freeze({ kind: value.denominator === 1n ? "finite-decimal" as const : "rational" as const, canonical: value.denominator === 1n ? value.numerator.toString() : `${value.numerator}/${value.denominator}`, numerator: value.numerator.toString(), denominator: value.denominator.toString() });
}

function exactRatioRecord(values: ReadonlyMap<string, ExactRational>): Readonly<Record<string, ScientificScalar>> {
  return Object.freeze(Object.fromEntries([...values.entries()].map(([element, value]) => [element, exactRatioScalar(value)])));
}

export function normalizeLeadingSiteRatioGroup(
  formula: string,
  options: SiteRatioNormalizationOptions,
): SiteRatioNormalizationResult {
  const originalFormula = formula;
  if (!options.enabled) {
    return fail(originalFormula, chemistryError("SITE_RATIO_MODE_DISABLED", "Grouped-site normalization must be explicitly enabled.", { fieldPath: "targetFormula" }));
  }
  const tokenized = tokenizeFormula(formula);
  if (!tokenized.success) return Object.freeze({ success: false as const, originalFormula, errors: tokenized.errors });
  const tokens = tokenized.tokens;
  if (tokens[0]?.kind !== "open-parenthesis") {
    return fail(originalFormula, chemistryError("SITE_RATIO_LEADING_GROUP_REQUIRED", "Normalization mode requires one leading parenthesized mixed-element group.", { position: 0, fieldPath: "targetFormula" }));
  }

  let closeIndex = -1;
  for (let index = 1; index < tokens.length; index += 1) {
    const current = tokens[index]!;
    if (current.kind === "open-parenthesis") {
      return fail(originalFormula, chemistryError("SITE_RATIO_NESTED_GROUP_UNSUPPORTED", "Nested ratio groups are not supported.", { position: current.position, end: current.end, fieldPath: "targetFormula" }));
    }
    if (current.kind === "close-parenthesis") { closeIndex = index; break; }
  }
  if (closeIndex < 0) {
    return fail(originalFormula, chemistryError("UNMATCHED_OPENING_PARENTHESIS", "The leading ratio group is missing a closing parenthesis.", { position: 0, fieldPath: "targetFormula" }));
  }
  if (closeIndex === 1) {
    return fail(originalFormula, chemistryError("EMPTY_GROUP", "The leading ratio group cannot be empty.", { position: 0, end: tokens[closeIndex]!.end, fieldPath: "targetFormula" }));
  }

  const close = tokens[closeIndex]!;
  const multiplicityToken = tokens[closeIndex + 1];
  if (multiplicityToken?.kind !== "number" || multiplicityToken.position !== close.end) {
    return fail(originalFormula, chemistryError("SITE_RATIO_MULTIPLICITY_REQUIRED", "A positive multiplicity of 2, 3, or 4 must immediately follow the leading ratio group.", { position: close.end, fieldPath: "targetFormula" }));
  }
  const multiplicity = parseExactRational(multiplicityToken.value);
  const multiplicityCanonical = rationalToString(multiplicity);
  const template = multiplicityTemplate[multiplicityCanonical];
  if (!template) {
    return fail(originalFormula, chemistryError("SITE_RATIO_UNSUPPORTED_MULTIPLICITY", `Grouped-site normalization supports multiplicities 2, 3, and 4; received "${multiplicityToken.value}".`, { position: multiplicityToken.position, end: multiplicityToken.end, offendingValue: multiplicityToken.value, fieldPath: "targetFormula" }));
  }
  if (options.template && options.template !== template) {
    return fail(originalFormula, chemistryError("SITE_RATIO_TEMPLATE_MISMATCH", `Multiplicity ${multiplicityCanonical} identifies template ${template}, not requested template ${options.template}.`, { offendingValue: multiplicityToken.value, fieldPath: "targetFormula" }));
  }

  const groupText = formula.slice(1, close.position);
  const parsedGroup = parseFormula(groupText);
  if (!parsedGroup.success) return Object.freeze({ success: false as const, originalFormula, errors: parsedGroup.errors });
  const groupTokens = tokens.slice(1, closeIndex);
  const ratios = new Map<string, ExactRational>();
  const order: string[] = [];
  for (let index = 0; index < groupTokens.length; index += 1) {
    const current = groupTokens[index]!;
    if (current.kind !== "element") continue;
    const next = groupTokens[index + 1];
    const ratio = next?.kind === "number" ? parseExactRational(next.value) : RATIONAL_ONE;
    if (compareRational(ratio, RATIONAL_ZERO) <= 0) {
      return fail(originalFormula, chemistryError(compareRational(ratio, RATIONAL_ZERO) === 0 ? "ZERO_COEFFICIENT" : "NEGATIVE_COEFFICIENT", `Ratio for ${current.value} must be greater than zero.`, { position: next?.position ?? current.position, end: next?.end ?? current.end, offendingValue: next?.value ?? "1", fieldPath: "targetFormula" }));
    }
    if (!ratios.has(current.value)) order.push(current.value);
    ratios.set(current.value, addRational(ratios.get(current.value) ?? RATIONAL_ZERO, ratio));
  }
  if (ratios.size < 2) {
    return fail(originalFormula, chemistryError("SITE_RATIO_MIXED_GROUP_REQUIRED", "The leading ratio group must contain at least two different elements.", { position: 0, end: close.end, fieldPath: "targetFormula" }));
  }
  const ratioSum = [...ratios.values()].reduce(addRational, RATIONAL_ZERO);
  if (compareRational(ratioSum, RATIONAL_ZERO) <= 0) {
    return fail(originalFormula, chemistryError("SITE_RATIO_ZERO_TOTAL", "The entered site-ratio total must be greater than zero.", { fieldPath: "targetFormula" }));
  }

  const remainingFormulaText = formula.slice(multiplicityToken.end);
  if (!remainingFormulaText) {
    return fail(originalFormula, chemistryError("SITE_RATIO_INVALID_MAX_REMAINDER", `Template ${template} requires an Al${template === "211" ? "X" : `X${xMultiplicity[template].numerator.toString()}`} remainder using C or N for X.`, { position: multiplicityToken.end, fieldPath: "targetFormula" }));
  }
  const remainingParsedFormula = parseFormula(remainingFormulaText);
  if (!remainingParsedFormula.success) return Object.freeze({ success: false as const, originalFormula, errors: remainingParsedFormula.errors });
  const remainderAmounts = remainingParsedFormula.composition.amounts;
  const remainderElements = Object.keys(remainderAmounts);
  const xElement = remainderElements.find((element) => element === "C" || element === "N");
  const xCoefficient = xElement ? parseExactRational(remainderAmounts[xElement] ?? "0") : RATIONAL_ZERO;
  const validRemainder = remainderElements.length === 2
    && parseExactRational(remainderAmounts.Al ?? "0").numerator === 1n
    && parseExactRational(remainderAmounts.Al ?? "0").denominator === 1n
    && xElement !== undefined
    && compareRational(xCoefficient, RATIONAL_ZERO) > 0;
  if (!validRemainder) {
    return fail(originalFormula, chemistryError("SITE_RATIO_INVALID_MAX_REMAINDER", `The remainder "${remainingFormulaText}" is incompatible with template ${template}; expected Al followed by one positive C or N coefficient.`, { position: multiplicityToken.end, end: formula.length, offendingValue: remainingFormulaText, fieldPath: "targetFormula" }));
  }
  const remainderTokens = tokenizeFormula(remainingFormulaText);
  const xTokenIndex = remainderTokens.success ? remainderTokens.tokens.findIndex((item) => item.kind === "element" && item.value === xElement) : -1;
  const xNumberToken = remainderTokens.success && xTokenIndex >= 0 && remainderTokens.tokens[xTokenIndex + 1]?.kind === "number" ? remainderTokens.tokens[xTokenIndex + 1] : undefined;
  const intendedFeedXCoefficientText = xNumberToken?.value ?? "1";

  const occupancies = new Map<string, ExactRational>();
  const coefficients = new Map<string, ExactRational>();
  for (const element of order) {
    const ratio = ratios.get(element)!;
    occupancies.set(element, divideRational(ratio, ratioSum));
    coefficients.set(element, multiplyRational(multiplicity, divideRational(ratio, ratioSum)));
  }
  const entries = Object.freeze(order.map((element) => {
    const enteredRatio = scientificScalarFromExact(ratios.get(element)!);
    const normalizedOccupancy = exactRatioScalar(occupancies.get(element)!);
    const normalizedFormulaCoefficient = exactRatioScalar(coefficients.get(element)!);
    return Object.freeze({
      element,
      enteredRatio,
      normalizedOccupancy,
      normalizedFormulaCoefficient,
      occupancyApproximation: approximateScientificScalar(normalizedOccupancy).value,
      formulaCoefficientApproximation: approximateScientificScalar(normalizedFormulaCoefficient).value,
    });
  }));

  const siteResult = createStandardMaxComposition(template, {
    M: { occupants: entries.map((entry) => ({ element: entry.element, fraction: entry.occupancyApproximation })) },
    A: { occupants: [{ element: "Al", fraction: "1" }] },
    X: { occupants: [{ element: xElement!, fraction: "1" }] },
  }, { normalizationMode: "normalizeOccupants" });
  if (!siteResult.success) return Object.freeze({ success: false as const, originalFormula, errors: siteResult.errors });

  const derived = new Map(coefficients);
  for (const [element, amount] of Object.entries(remainderAmounts)) {
    derived.set(element, addRational(derived.get(element) ?? RATIONAL_ZERO, parseExactRational(amount)));
  }
  const requiresIntegerScale = [...derived.values()].some((value) => rationalToString(value).includes("/"));
  const scale = requiresIntegerScale ? [...derived.values()].reduce((current, value) => lcm(current, value.denominator), 1n) : 1n;
  const calculationAmounts = Object.fromEntries([...derived.entries()].map(([element, value]) => [element, requiresIntegerScale ? (value.numerator * (scale / value.denominator)).toString() : rationalToString(value)]));
  const calculationComposition = createComposition(calculationAmounts);
  if (!calculationComposition.success) return Object.freeze({ success: false as const, originalFormula, errors: calculationComposition.errors });
  const idealDerived = new Map(coefficients);
  idealDerived.set("Al", RATIONAL_ONE);
  idealDerived.set(xElement!, xMultiplicity[template]);
  const idealCalculationAmounts = Object.fromEntries([...idealDerived.entries()].map(([element, value]) => [element, requiresIntegerScale ? (value.numerator * (scale / value.denominator)).toString() : rationalToString(value)]));
  const idealCalculationComposition = createComposition(idealCalculationAmounts);
  if (!idealCalculationComposition.success) return Object.freeze({ success: false as const, originalFormula, errors: idealCalculationComposition.errors });

  const comparisonToIdeal = compareRational(xCoefficient, xMultiplicity[template]);
  const feedClassification = comparisonToIdeal === 0 ? "stoichiometric" as const : comparisonToIdeal < 0 ? "x-deficient" as const : "x-excess" as const;
  const coefficientText = (element: string, coefficient: string) => `${element}${coefficient === "1" ? "" : coefficient}`;
  const exactFractionText = (scalar: ScientificScalar) => scalar.denominator === "1" ? scalar.numerator : `${scalar.numerator}/${scalar.denominator}`;
  const siteOccupancyFormula = `(${entries.map((entry) => coefficientText(entry.element, exactFractionText(entry.normalizedOccupancy))).join("")})${multiplicityCanonical}Al${coefficientText(xElement!, intendedFeedXCoefficientText)}`;
  const expandedPerFormulaFormula = `${entries.map((entry) => coefficientText(entry.element, exactFractionText(entry.normalizedFormulaCoefficient))).join("")}Al${coefficientText(xElement!, intendedFeedXCoefficientText)}`;
  const idealTemplateFormula = `M${multiplicityCanonical}Al${coefficientText(xElement!, rationalToString(xMultiplicity[template]))}`;
  const siteModelLabel = `${template}-derived mixed M-site composition${feedClassification === "stoichiometric" ? " with stoichiometric feed" : feedClassification === "x-deficient" ? ` with ${xElement === "C" ? "carbon" : "nitrogen"}-deficient feed` : ` with ${xElement === "C" ? "carbon" : "nitrogen"}-excess feed`}`;
  const warnings = feedClassification === "stoichiometric" ? [] : [Object.freeze({ code: feedClassification === "x-deficient" ? "X_FEED_BELOW_IDEAL" : "X_FEED_ABOVE_IDEAL", message: `${xElement} intended-feed coefficient ${intendedFeedXCoefficientText} differs from ideal ${rationalToString(xMultiplicity[template])} for template ${template}.` })];

  const value: SiteRatioNormalizationValue = Object.freeze({
    schemaVersion: "1.0.0",
    originalFormula,
    detectedGroupText: groupText,
    requestedMultiplicity: scientificScalarFromExact(multiplicity),
    template,
    enteredRatios: entries,
    ratioSum: scientificScalarFromExact(ratioSum),
    normalizedOccupancies: exactRatioRecord(occupancies),
    normalizedFormulaCoefficients: exactRatioRecord(coefficients),
    explicitSiteModel: siteResult.value.composition,
    idealTemplateFormula,
    idealXCoefficient: scientificScalarFromExact(xMultiplicity[template]),
    intendedFeedXElement: xElement! as "C" | "N",
    intendedFeedXCoefficient: exactRatioScalar(xCoefficient),
    intendedFeedXCoefficientText,
    feedClassification,
    siteModelLabel,
    siteOccupancyFormula,
    expandedPerFormulaFormula,
    remainingFormulaText,
    remainingParsedFormula,
    derivedElementalComposition: scalarRecord(derived),
    intendedFeedComposition: scalarRecord(derived),
    idealCalculationComposition: idealCalculationComposition.value,
    calculationComposition: calculationComposition.value,
    calculationCompositionScaleFactor: scientificScalarFromExact(makeRational(scale)),
    warnings: Object.freeze(warnings),
    trace: Object.freeze([
      Object.freeze({ operation: "parse-leading-ratio-group" as const, description: "Parsed the explicitly enabled leading M-site ratio group and MAX remainder.", exactValues: Object.freeze({ group: groupText, remainder: remainingFormulaText, multiplicity: multiplicityCanonical }) }),
      Object.freeze({ operation: "normalize-site-ratios" as const, description: "Normalized every entered ratio by the exact ratio sum, then multiplied by the requested M-site multiplicity.", exactValues: Object.freeze({ ratioSum: rationalToString(ratioSum), occupancySum: "1", formulaCoefficientSum: multiplicityCanonical }) }),
      Object.freeze({ operation: "create-explicit-site-model" as const, description: "Created an explicit standard MAX site model; non-terminating fractions use labeled Decimal approximations only in the decimal-only site schema.", exactValues: Object.freeze(Object.fromEntries(entries.map((entry) => [entry.element, entry.normalizedOccupancy.canonical]))) }),
      Object.freeze({ operation: "derive-calculation-composition" as const, description: requiresIntegerScale ? "Scaled the exact rational ideal template and intended feed to equivalent integer compositions for the existing calculation engine boundary." : "Preserved the exact terminating-decimal ideal template and intended feed without scaling.", exactValues: Object.freeze({ scaleFactor: scale.toString(), intendedFeed: JSON.stringify(calculationAmounts), idealTemplate: JSON.stringify(idealCalculationAmounts) }) }),
    ]),
  });
  return Object.freeze({ success: true as const, originalFormula, value });
}

export function analyzeMaxXComponent(formula: string): MaxXComponentResult {
  const tokenized = tokenizeFormula(formula);
  if (!tokenized.success) return Object.freeze({ success: false as const, originalFormula: formula, errors: tokenized.errors });
  const xTokens = tokenized.tokens.filter((item) => item.kind === "element" && (item.value === "C" || item.value === "N"));
  const distinctX = new Set(xTokens.map((item) => item.value));
  if (xTokens.length !== 1 || distinctX.size !== 1) {
    return Object.freeze({ success: false as const, originalFormula: formula, errors: Object.freeze([chemistryError("MAX_X_COMPONENT_UNSUPPORTED", "A single unambiguous C or N component is required; mixed C/N targets use the advanced X-site editor.", { fieldPath: "targetFormula" })]) });
  }
  const xToken = xTokens[0]!;
  const xTokenIndex = tokenized.tokens.indexOf(xToken);
  const numberToken = tokenized.tokens[xTokenIndex + 1]?.kind === "number" ? tokenized.tokens[xTokenIndex + 1] : undefined;
  const enteredCoefficientText = numberToken?.value ?? "1";
  const coefficient = parseExactRational(enteredCoefficientText);
  if (compareRational(coefficient, RATIONAL_ZERO) <= 0) {
    return Object.freeze({ success: false as const, originalFormula: formula, errors: Object.freeze([chemistryError("ZERO_COEFFICIENT", `${xToken.value} coefficient must be greater than zero.`, { position: numberToken?.position ?? xToken.end, end: numberToken?.end ?? xToken.end, fieldPath: "targetFormula" })]) });
  }

  let template: StandardMaxTemplate | undefined;
  if (tokenized.tokens[0]?.kind === "open-parenthesis") {
    const normalized = normalizeLeadingSiteRatioGroup(formula, { enabled: true, expectedSite: "M" });
    if (normalized.success) template = normalized.value.template;
  } else if (!tokenized.tokens.some((item) => item.kind === "open-parenthesis" || item.kind === "close-parenthesis")) {
    const parsed = parseFormula(formula);
    if (parsed.success && compareRational(parseExactRational(parsed.composition.amounts.Al ?? "0"), RATIONAL_ONE) === 0) {
      const mTotal = Object.entries(parsed.composition.amounts)
        .filter(([element]) => element !== "Al" && element !== xToken.value)
        .reduce((sum, [, amount]) => addRational(sum, parseExactRational(amount)), RATIONAL_ZERO);
      template = multiplicityTemplate[rationalToString(mTotal)];
    }
  }
  if (!template) {
    return Object.freeze({ success: false as const, originalFormula: formula, errors: Object.freeze([chemistryError("MAX_X_COMPONENT_UNSUPPORTED", "The formula does not have an unambiguous supported 211, 312, or 413 MAX structure.", { fieldPath: "targetFormula" })]) });
  }
  return Object.freeze({ success: true as const, value: Object.freeze({
    originalFormula: formula,
    template,
    element: xToken.value as "C" | "N",
    enteredCoefficientText,
    coefficient: scientificScalarFromExact(coefficient),
    idealCoefficient: scientificScalarFromExact(xMultiplicity[template]),
    coefficientPosition: numberToken?.position ?? xToken.end,
    coefficientEnd: numberToken?.end ?? xToken.end,
  }) });
}

export function replaceMaxXCoefficient(formula: string, coefficientText: string): Readonly<{ success: true; formula: string; component: MaxXComponentValue } | { success: false; originalFormula: string; errors: readonly ChemistryError[] }> {
  let coefficient: ExactRational;
  try { coefficient = parseExactRational(coefficientText); }
  catch { return Object.freeze({ success: false as const, originalFormula: formula, errors: Object.freeze([chemistryError("INVALID_COEFFICIENT", `Invalid X-component coefficient "${coefficientText}".`, { offendingValue: coefficientText, fieldPath: "targetFormula" })]) }); }
  if (compareRational(coefficient, RATIONAL_ZERO) <= 0) {
    return Object.freeze({ success: false as const, originalFormula: formula, errors: Object.freeze([chemistryError(compareRational(coefficient, RATIONAL_ZERO) === 0 ? "ZERO_COEFFICIENT" : "NEGATIVE_COEFFICIENT", "X-component coefficient must be greater than zero.", { offendingValue: coefficientText, fieldPath: "targetFormula" })]) });
  }
  const analyzed = analyzeMaxXComponent(formula);
  if (!analyzed.success) return analyzed;
  const updatedFormula = `${formula.slice(0, analyzed.value.coefficientPosition)}${coefficientText}${formula.slice(analyzed.value.coefficientEnd)}`;
  const updated = analyzeMaxXComponent(updatedFormula);
  if (!updated.success) return updated;
  return Object.freeze({ success: true as const, formula: updatedFormula, component: updated.value });
}
