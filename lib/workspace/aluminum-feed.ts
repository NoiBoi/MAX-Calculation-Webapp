import { ChemistryDecimal, normalizeLeadingSiteRatioGroup, parseFormula, siteCompositionToElementalComposition, type SiteComposition } from "@max-stoich/chemistry-engine";

export interface AluminumFeedInput {
  readonly targetFormula: string;
  readonly normalizeLeadingSiteRatios?: boolean;
  readonly siteComposition?: SiteComposition;
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

export function analyzeWorkspaceAluminumFeed(input: AluminumFeedInput): AluminumFeedAnalysis {
  const parsed = parseFormula(input.targetFormula);
  let idealCoefficient = parsed.success ? parsed.composition.amounts.Al : undefined;
  if (!idealCoefficient && input.siteComposition) { const converted = siteCompositionToElementalComposition(input.siteComposition); if (converted.success) idealCoefficient = converted.value.amounts.Al; }
  if (!idealCoefficient) return { visible: false };
  const enteredCoefficient = input.aluminumPerFormula ?? (input.alExcessPercent !== undefined ? legacyAluminumCoefficient(idealCoefficient, input.alExcessPercent) : idealCoefficient) ?? "";
  const entered = finitePositive(enteredCoefficient);
  const normalized = input.normalizeLeadingSiteRatios ? normalizeLeadingSiteRatioGroup(input.targetFormula, { enabled: true, expectedSite: "M" }) : undefined;
  let calculationAl = normalized?.success ? normalized.value.calculationComposition.amounts.Al : undefined;
  if (!calculationAl && input.siteComposition) { const converted = siteCompositionToElementalComposition(input.siteComposition); if (converted.success) calculationAl = converted.value.amounts.Al; }
  calculationAl ??= idealCoefficient;
  let calculationScaleFactor: string;
  try { calculationScaleFactor = new ChemistryDecimal(calculationAl).dividedBy(idealCoefficient).toFixed(); } catch { return { visible: true, idealCoefficient, enteredCoefficient, error: "Unable to resolve the aluminum coefficient basis." }; }
  if (!entered) return { visible: true, idealCoefficient, enteredCoefficient, calculationScaleFactor, error: "Enter a positive finite decimal aluminum coefficient." };
  return { visible: true, idealCoefficient, enteredCoefficient: entered.toFixed(), calculationScaleFactor };
}

/** Keeps the user-owned feed coefficient stable while the ideal target reference changes. */
export function aluminumCoefficientForTargetChange(current: AluminumFeedInput, nextTargetFormula: string): string {
  const next = parseFormula(nextTargetFormula);
  if (!next.success) return current.aluminumPerFormula ?? "";
  const nextIdeal = next.composition.amounts.Al;
  if (!nextIdeal) return "";
  const currentParsed = parseFormula(current.targetFormula);
  const currentContainsAluminum = currentParsed.success && Boolean(currentParsed.composition.amounts.Al);
  if (currentContainsAluminum && typeof current.aluminumPerFormula === "string" && current.aluminumPerFormula.trim() !== "") return current.aluminumPerFormula;
  return nextIdeal;
}

export function migrateWorkspaceAluminumInput<T extends AluminumFeedInput>(input: T): Omit<T, "aluminumPerFormula" | "alExcessPercent"> & { aluminumPerFormula: string } {
  if (typeof input.aluminumPerFormula === "string") return input as Omit<T, "aluminumPerFormula" | "alExcessPercent"> & { aluminumPerFormula: string };
  const analysis = analyzeWorkspaceAluminumFeed(input);
  const migrated = { ...input, aluminumPerFormula: analysis.enteredCoefficient ?? "" } as Omit<T, "aluminumPerFormula" | "alExcessPercent"> & { aluminumPerFormula: string; alExcessPercent?: string };
  delete migrated.alExcessPercent;
  return migrated;
}
