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

export function createComparisonWorkspace(input?: WorkspaceRecipeState, name = input?.targetFormula ? `${input.targetFormula} route comparison` : "Untitled comparison"): ComparisonWorkspace {
  const now = new Date().toISOString();
  return { schemaVersion: "3.0.0", id: localId("comparison"), name, sharedTarget: { targetFormula: input?.targetFormula ?? "", ...(input?.siteComposition ? { siteComposition: clone(input.siteComposition) } : {}) }, scenarios: [], selectedMetrics: ["total-mass", "active-precursors", "largest-residual", "warning-count", "mass-closeness"], focusedScenarioId: "", layoutId: "builtin-route-comparison", notes: "", validationStatus: "synthetic", historical: false, createdAt: now, updatedAt: now };
}

export function addComparisonScenario(workspace: ComparisonWorkspace, input: WorkspaceRecipeState, name: string, source: ComparisonScenario["source"], validationStatus: PersistedValidationStatus): ComparisonWorkspace {
  if (workspace.scenarios.length >= MAX_COMPARISON_SCENARIOS) throw new Error(`A comparison supports at most ${MAX_COMPARISON_SCENARIOS} scenarios.`);
  const added = scenario(name, input, source, validationStatus);
  const sharedTarget = workspace.scenarios.length === 0 ? { targetFormula: input.targetFormula, ...(input.siteComposition ? { siteComposition: clone(input.siteComposition) } : {}) } : workspace.sharedTarget;
  return { ...workspace, sharedTarget, scenarios: [...workspace.scenarios, added], focusedScenarioId: added.id, historical: false, updatedAt: new Date().toISOString() };
}

export function updateSharedTarget(workspace: ComparisonWorkspace, target: ComparisonWorkspace["sharedTarget"]): ComparisonWorkspace {
  return { ...workspace, sharedTarget: clone(target), scenarios: workspace.scenarios.map((item) => ({ ...item, inputState: { ...item.inputState, targetFormula: target.targetFormula, ...(target.siteComposition ? { siteComposition: clone(target.siteComposition) } : { siteComposition: undefined }), presetId: "custom" }, historical: undefined })), historical: false, updatedAt: new Date().toISOString() };
}

export function updateScenario(workspace: ComparisonWorkspace, scenarioId: string, update: (input: WorkspaceRecipeState) => WorkspaceRecipeState): ComparisonWorkspace {
  let updatedInput: WorkspaceRecipeState | undefined;
  const scenarios = workspace.scenarios.map((item) => { if (item.id !== scenarioId) return item; updatedInput = update(clone(item.inputState)); return { ...item, inputState: updatedInput, historical: undefined }; });
  const changedFirst = workspace.scenarios[0]?.id === scenarioId && updatedInput;
  return { ...workspace, ...(changedFirst ? { sharedTarget: { targetFormula: updatedInput!.targetFormula, ...(updatedInput!.siteComposition ? { siteComposition: clone(updatedInput!.siteComposition) } : {}) } } : {}), scenarios, historical: false, updatedAt: new Date().toISOString() };
}

export function duplicateScenario(workspace: ComparisonWorkspace, scenarioId: string): ComparisonWorkspace {
  if (workspace.scenarios.length >= MAX_COMPARISON_SCENARIOS) throw new Error(`A comparison supports at most ${MAX_COMPARISON_SCENARIOS} scenarios.`);
  const source = workspace.scenarios.find((item) => item.id === scenarioId);
  if (!source) throw new Error("Scenario was not found.");
  const copy = scenario(`Copy of ${source.name}`, source.inputState, { kind: "duplicate", scenarioId: source.id }, source.validationStatus);
  return { ...workspace, scenarios: [...workspace.scenarios, copy], focusedScenarioId: copy.id, historical: false, updatedAt: new Date().toISOString() };
}

export function removeScenario(workspace: ComparisonWorkspace, scenarioId: string): ComparisonWorkspace {
  const scenarios = workspace.scenarios.filter((item) => item.id !== scenarioId);
  const first = scenarios[0]?.inputState;
  return { ...workspace, ...(first ? { sharedTarget: { targetFormula: first.targetFormula, ...(first.siteComposition ? { siteComposition: clone(first.siteComposition) } : {}) } } : {}), scenarios, focusedScenarioId: workspace.focusedScenarioId === scenarioId ? scenarios[0]?.id ?? "" : workspace.focusedScenarioId, historical: false, updatedAt: new Date().toISOString() };
}

export function calculateComparison(workspace: ComparisonWorkspace): Readonly<Record<string, WorkspaceCalculationState>> {
  return Object.freeze(Object.fromEntries(workspace.scenarios.map((item): [string, WorkspaceCalculationState] => [item.id, item.historical ? { state: item.historical.result.status === "success" ? "valid" : "valid-with-warnings", result: item.historical.result, errors: [] } : buildWorkspaceCalculation(item.inputState)])));
}
