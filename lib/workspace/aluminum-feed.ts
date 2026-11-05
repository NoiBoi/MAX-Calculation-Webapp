import { ChemistryDecimal, normalizeLeadingSiteRatioGroup, parseFormula, siteCompositionToElementalComposition, type SiteComposition } from "@max-stoich/chemistry-engine";

export interface AluminumFeedInput {
  readonly targetFormula: string;
  readonly normalizeLeadingSiteRatios?: boolean;
  readonly siteComposition?: SiteComposition;
  /** Omit to derive Al from the target formula. Stored strings are explicit overrides. */
  readonly aluminumPerFormula?: string;
  /** Legacy schema-5 percentage input; read only for migration. */
  readonly alExcessPercent?: string;
}

export interface AluminumFeedAnalysis {
  readonly visible: boolean;
  readonly idealCoefficient?: string;
  readonly enteredCoefficient?: string;
  readonly calculationScaleFactor?: string;
  readonly error?: string;
}

function finitePositive(value: string) {
  try { const parsed = new ChemistryDecimal(value); return parsed.isFinite() && parsed.greaterThan(0) ? parsed : undefined; } catch { return undefined; }
}

export function legacyAluminumCoefficient(idealCoefficient: string, excessPercent: string): string | undefined {
  const ideal = finitePositive(idealCoefficient);
  try { const percent = new ChemistryDecimal(excessPercent); if (!ideal || !percent.isFinite()) return undefined; const coefficient = ideal.times(percent.dividedBy(100).plus(1)); return coefficient.greaterThan(0) ? coefficient.toFixed() : undefined; } catch { return undefined; }
}

export function resolveWorkspaceNormalization(input: AluminumFeedInput, parsed?: ReturnType<typeof parseFormula>) {
  if (!input.normalizeLeadingSiteRatios || !input.targetFormula.startsWith("(")) return undefined;
  parsed ??= parseFormula(input.targetFormula);
  if (!parsed.success) return undefined;
  const groupEnd = parsed.tokens.findIndex((token) => token.kind === "close-parenthesis");
  const remainder = parsed.tokens.slice(groupEnd + 1);
  const elements = remainder.filter((token) => token.kind === "element").map((token) => token.value);
  if (!elements.includes("Al") || elements.includes("B") || !(elements.includes("C") || elements.includes("N"))) return undefined;
  return normalizeLeadingSiteRatioGroup(input.targetFormula, { enabled: true, expectedSite: "M" });
}

export function analyzeWorkspaceAluminumFeed(input: AluminumFeedInput): AluminumFeedAnalysis {
  const parsed = parseFormula(input.targetFormula);
  let idealCoefficient = parsed.success ? parsed.composition.amounts.Al : undefined;
  if (!idealCoefficient && input.siteComposition) { const converted = siteCompositionToElementalComposition(input.siteComposition); if (converted.success) idealCoefficient = converted.value.amounts.Al; }
  if (!idealCoefficient) return { visible: false };
  const enteredCoefficient = input.aluminumPerFormula ?? (input.alExcessPercent !== undefined ? legacyAluminumCoefficient(idealCoefficient, input.alExcessPercent) : idealCoefficient) ?? "";
  const entered = finitePositive(enteredCoefficient);
  const normalized = resolveWorkspaceNormalization(input, parsed);
  let calculationAl = normalized?.success ? normalized.value.calculationComposition.amounts.Al : undefined;
  if (!calculationAl && input.siteComposition) { const converted = siteCompositionToElementalComposition(input.siteComposition); if (converted.success) calculationAl = converted.value.amounts.Al; }
  calculationAl ??= idealCoefficient;
  let calculationScaleFactor: string;
  try { calculationScaleFactor = new ChemistryDecimal(calculationAl).dividedBy(idealCoefficient).toFixed(); } catch { return { visible: true, idealCoefficient, enteredCoefficient, error: "Unable to resolve the aluminum coefficient basis." }; }
  if (!entered) return { visible: true, idealCoefficient, enteredCoefficient, calculationScaleFactor, error: "Enter a positive finite decimal aluminum coefficient." };
  return { visible: true, idealCoefficient, enteredCoefficient: entered.toFixed(), calculationScaleFactor };
}

export function migrateWorkspaceAluminumInput<T extends AluminumFeedInput>(input: T): Omit<T, "aluminumPerFormula" | "alExcessPercent"> & AluminumFeedInput {
  const { aluminumPerFormula, alExcessPercent, ...editable } = input;
  if (aluminumPerFormula === "" && !analyzeWorkspaceAluminumFeed(input).visible) return editable;
  if (aluminumPerFormula !== undefined || alExcessPercent === undefined) return input;
  return { ...editable, aluminumPerFormula: analyzeWorkspaceAluminumFeed(input).enteredCoefficient ?? "" };
}
