import type { WorkspaceCalculationState, WorkspaceRecipeState } from "../workspace/adapter";
import { buildWorkspaceCalculation } from "../workspace/adapter";
import type { ComparisonScenario, ComparisonWorkspace, PersistedValidationStatus } from "../persistence/entities";

export const COMPARISON_SCHEMA_VERSION = "1.0.0" as const;
export const MAX_COMPARISON_SCENARIOS = 4;

const clone = <T>(value: T): T => structuredClone(value);
const localId = (prefix: string): string => `${prefix}-${globalThis.crypto.randomUUID()}`;

function scenario(name: string, inputState: WorkspaceRecipeState, source: ComparisonScenario["source"], validationStatus: PersistedValidationStatus): ComparisonScenario {
  return { id: localId("scenario"), name, source, inputState: clone(inputState), validationStatus };
}

export function createComparisonWorkspace(input: WorkspaceRecipeState, name = `${input.targetFormula} route comparison`): ComparisonWorkspace {
  const now = new Date().toISOString();
  const first = scenario("Scenario A", input, { kind: "working-recipe" }, "synthetic");
  const second = scenario("Scenario B", input, { kind: "duplicate", scenarioId: first.id }, "synthetic");
  return { schemaVersion: "3.0.0", id: localId("comparison"), name, sharedTarget: { targetFormula: input.targetFormula, ...(input.siteComposition ? { siteComposition: clone(input.siteComposition) } : {}) }, scenarios: [first, second], selectedMetrics: ["total-mass", "active-precursors", "largest-residual", "warning-count", "mass-closeness"], focusedScenarioId: first.id, layoutId: "builtin-route-comparison", notes: "", validationStatus: "synthetic", historical: false, createdAt: now, updatedAt: now };
}

export function updateSharedTarget(workspace: ComparisonWorkspace, target: ComparisonWorkspace["sharedTarget"]): ComparisonWorkspace {
  return { ...workspace, sharedTarget: clone(target), scenarios: workspace.scenarios.map((item) => ({ ...item, inputState: { ...item.inputState, targetFormula: target.targetFormula, ...(target.siteComposition ? { siteComposition: clone(target.siteComposition) } : { siteComposition: undefined }), presetId: "custom" }, historical: undefined })), historical: false, updatedAt: new Date().toISOString() };
}

export function updateScenario(workspace: ComparisonWorkspace, scenarioId: string, update: (input: WorkspaceRecipeState) => WorkspaceRecipeState): ComparisonWorkspace {
  return { ...workspace, scenarios: workspace.scenarios.map((item) => item.id === scenarioId ? { ...item, inputState: update(clone(item.inputState)), historical: undefined } : item), historical: false, updatedAt: new Date().toISOString() };
}

export function duplicateScenario(workspace: ComparisonWorkspace, scenarioId: string): ComparisonWorkspace {
  if (workspace.scenarios.length >= MAX_COMPARISON_SCENARIOS) throw new Error(`A comparison supports at most ${MAX_COMPARISON_SCENARIOS} scenarios.`);
  const source = workspace.scenarios.find((item) => item.id === scenarioId);
  if (!source) throw new Error("Scenario was not found.");
  const copy = scenario(`Copy of ${source.name}`, source.inputState, { kind: "duplicate", scenarioId: source.id }, source.validationStatus);
  return { ...workspace, scenarios: [...workspace.scenarios, copy], focusedScenarioId: copy.id, historical: false, updatedAt: new Date().toISOString() };
}

export function removeScenario(workspace: ComparisonWorkspace, scenarioId: string): ComparisonWorkspace {
  if (workspace.scenarios.length <= 2) throw new Error("A route comparison must retain at least two scenarios.");
  const scenarios = workspace.scenarios.filter((item) => item.id !== scenarioId);
  return { ...workspace, scenarios, focusedScenarioId: workspace.focusedScenarioId === scenarioId ? scenarios[0]!.id : workspace.focusedScenarioId, historical: false, updatedAt: new Date().toISOString() };
}

export function calculateComparison(workspace: ComparisonWorkspace): Readonly<Record<string, WorkspaceCalculationState>> {
  return Object.freeze(Object.fromEntries(workspace.scenarios.map((item): [string, WorkspaceCalculationState] => [item.id, item.historical ? { state: item.historical.result.status === "success" ? "valid" : "valid-with-warnings", result: item.historical.result, errors: [] } : buildWorkspaceCalculation(item.inputState)])));
}
