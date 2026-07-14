import { ChemistryDecimal, parseFormula, type BatchCalculationResult, type DecimalValue } from "@max-stoich/chemistry-engine";
import type { ComparisonMetric, ComparisonScenario } from "../persistence/entities";
import type { WorkspaceCalculationState } from "../workspace/adapter";
import { stableCanonicalize } from "../persistence/canonical";

export interface AlignedPrecursorRow { readonly key: string; readonly canonicalComposition?: string; readonly cells: Readonly<Record<string, Readonly<{ precursorId: string; formula: string; purityPercent: string; finalMassGrams?: string; solverQuantityExact?: string }> | undefined>> }
export interface ScenarioSummary { readonly scenarioId: string; readonly status: string; readonly totalMassGrams?: string; readonly activePrecursorCount: number; readonly largestResidualMoles?: string; readonly warningCodes: readonly string[]; readonly introducedElements: readonly string[]; readonly finalMinusRequestedMassGrams?: string; readonly engineVersion?: string; readonly atomicWeightDataVersion?: string }
export interface ComparisonDifference { readonly rows: readonly AlignedPrecursorRow[]; readonly summaries: readonly ScenarioSummary[]; readonly metricLeaders: Readonly<Partial<Record<ComparisonMetric, readonly string[]>>>; readonly differingWarningCodes: readonly string[] }

function composition(formula: string): string | undefined {
  const parsed = parseFormula(formula);
  return parsed.success ? stableCanonicalize(parsed.composition.amounts) : undefined;
}

function validResult(state: WorkspaceCalculationState): BatchCalculationResult | undefined { return state.state === "valid" || state.state === "valid-with-warnings" ? state.result : undefined; }
function absolute(value?: string): DecimalValue | undefined { if (value === undefined) return undefined; try { return new ChemistryDecimal(value).abs(); } catch { return undefined; } }

export function compareScenarios(scenarios: readonly ComparisonScenario[], calculations: Readonly<Record<string, WorkspaceCalculationState>>): ComparisonDifference {
  const rows: Array<{ key: string; canonicalComposition?: string; cells: Record<string, AlignedPrecursorRow["cells"][string]> }> = [];
  for (const scenario of scenarios) for (const precursor of scenario.inputState.precursors) {
    const canonical = composition(precursor.formula);
    const exactIdRow = rows.find((row) => row.cells[scenario.id] === undefined && Object.values(row.cells).some((cell) => cell?.precursorId === precursor.id && row.canonicalComposition === canonical));
    const compositionRow = exactIdRow ?? rows.find((row) => row.cells[scenario.id] === undefined && canonical !== undefined && row.canonicalComposition === canonical);
    const row = compositionRow ?? { key: canonical ? `composition:${canonical}:${rows.length}` : `local:${scenario.id}:${precursor.id}`, canonicalComposition: canonical, cells: {} };
    if (!compositionRow) rows.push(row);
    const result = validResult(calculations[scenario.id]!);
    const output = result?.precursors.find((item) => item.precursorId === precursor.id);
    row.cells[scenario.id] = { precursorId: precursor.id, formula: precursor.formula, purityPercent: precursor.purityPercent, ...(output ? { finalMassGrams: output.finalRoundedGrossWeighingMassGrams, solverQuantityExact: output.solverMolesPerTargetFormulaMoleExact.canonical } : {}) };
  }
  const summaries = scenarios.map((scenario): ScenarioSummary => {
    const calculation = calculations[scenario.id]!;
    const result = validResult(calculation);
    const targetElements = new Set(result ? Object.keys(result.idealCrystalComposition.amounts) : []);
    const introducedElements = result ? Object.keys(result.precursorOnlyRealizedElementMoles).filter((element) => !targetElements.has(element) && new ChemistryDecimal(result.precursorOnlyRealizedElementMoles[element]!).greaterThan(0)).sort() : [];
    let largest = result?.realizedElements[0]?.absoluteResidualMoles;
    for (const item of result?.realizedElements ?? []) if (!largest || new ChemistryDecimal(item.absoluteResidualMoles).greaterThan(largest)) largest = item.absoluteResidualMoles;
    return { scenarioId: scenario.id, status: calculation.state, ...(result ? { totalMassGrams: result.batch.finalRoundedTotalWeighingMassGrams, largestResidualMoles: largest, finalMinusRequestedMassGrams: result.batch.finalMinusRequestedMassGrams, engineVersion: result.engineVersion, atomicWeightDataVersion: result.dataVersions.atomicWeights } : {}), activePrecursorCount: result?.precursors.filter((item) => new ChemistryDecimal(item.finalRoundedGrossWeighingMassGrams).greaterThan(0)).length ?? 0, warningCodes: [...new Set(result?.warnings.map((item) => item.code) ?? [])].sort(), introducedElements };
  });
  const leaders: Partial<Record<ComparisonMetric, readonly string[]>> = {};
  const selectMin = (metric: ComparisonMetric, value: (item: ScenarioSummary) => DecimalValue | undefined) => { const values = summaries.map((item) => ({ id: item.scenarioId, value: value(item) })).filter((item): item is { id: string; value: DecimalValue } => item.value !== undefined); if (!values.length) return; const minimum = values.reduce((left, right) => right.value.lessThan(left) ? right.value : left, values[0]!.value); leaders[metric] = values.filter((item) => item.value.equals(minimum)).map((item) => item.id); };
  selectMin("total-mass", (item) => item.totalMassGrams ? new ChemistryDecimal(item.totalMassGrams) : undefined);
  selectMin("active-precursors", (item) => new ChemistryDecimal(item.activePrecursorCount));
  selectMin("largest-residual", (item) => absolute(item.largestResidualMoles));
  selectMin("warning-count", (item) => new ChemistryDecimal(item.warningCodes.length));
  selectMin("introduced-elements", (item) => new ChemistryDecimal(item.introducedElements.length));
  selectMin("mass-closeness", (item) => absolute(item.finalMinusRequestedMassGrams));
  const warningSets = summaries.flatMap((item) => item.warningCodes);
  return { rows: rows.map((row) => ({ ...row, cells: Object.freeze({ ...row.cells }) })), summaries, metricLeaders: leaders, differingWarningCodes: [...new Set(warningSets)].filter((code) => summaries.some((item) => item.warningCodes.includes(code)) && summaries.some((item) => !item.warningCodes.includes(code))).sort() };
}
