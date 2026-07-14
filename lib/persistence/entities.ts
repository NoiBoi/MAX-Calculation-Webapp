import type { AtomicRadiusDataset, BatchCalculationResult, RadiusDescriptorConfig, SiteComposition } from "@max-stoich/chemistry-engine";
import type { Mode } from "./workspace-types";
import type { WorkspaceRecipeState } from "../workspace/adapter";
import type { ValidationStatus, WorkspacePrecursorInput } from "../workspace/presets";

export const LOCAL_SCHEMA_VERSION = "4.0.0" as const;
export type LocalSchemaVersion = "2.0.0" | "3.0.0" | typeof LOCAL_SCHEMA_VERSION;
export type PersistedValidationStatus = ValidationStatus | "deprecated";

export interface SavedRecipe {
  readonly schemaVersion: LocalSchemaVersion;
  readonly id: string;
  readonly name: string;
  readonly targetFormula: string;
  readonly description: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly currentRevisionNumber: number;
  readonly currentRevisionId: string;
  readonly archived: boolean;
  readonly validationStatus: PersistedValidationStatus;
  readonly tags: readonly string[];
  readonly duplicatedFromRecipeId?: string;
  readonly duplicatedFromRevisionId?: string;
}

export interface RecipeRevision {
  readonly schemaVersion: LocalSchemaVersion;
  readonly id: string;
  readonly recipeId: string;
  readonly revisionNumber: number;
  readonly parentRevisionId?: string;
  readonly canonicalScientificInput: string;
  readonly inputState: WorkspaceRecipeState;
  readonly createdAt: string;
  readonly revisionNote: string;
  readonly inputSchemaVersion: "1.0.0";
  readonly engineVersion: string;
  readonly snapshotId: string;
  readonly inputDigest: string;
}

export interface CalculationSnapshot {
  readonly schemaVersion: LocalSchemaVersion;
  readonly id: string;
  readonly recipeId: string;
  readonly recipeRevisionId: string;
  readonly canonicalScientificInput: string;
  readonly canonicalScientificOutput: string;
  readonly inputDigest: string;
  readonly outputDigest: string;
  readonly engineVersion: string;
  readonly formulaParserVersion: string;
  readonly siteCompositionVersion: string;
  readonly balanceMatrixVersion: string;
  readonly solverVersion: string;
  readonly batchCalculationVersion: string;
  readonly atomicWeightDataVersion: string;
  readonly atomicWeightDataDigest: string;
  readonly atomicRadiusDatasetId?: string;
  readonly atomicRadiusDatasetVersion?: string;
  readonly atomicRadiusDatasetDigest?: string;
  readonly radiusDescriptorSchemaVersion?: "1.0.0";
  readonly radiusDescriptorConfig?: RadiusDescriptorConfig;
  readonly radiusSiteModel?: SiteComposition;
  readonly result: BatchCalculationResult;
  readonly createdAt: string;
  readonly validationStatus: PersistedValidationStatus;
}

export interface SavedRoute {
  readonly schemaVersion: LocalSchemaVersion;
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly currentRevisionNumber: number;
  readonly currentRevisionId: string;
  readonly validationStatus: PersistedValidationStatus;
  readonly archived: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface RouteRevision {
  readonly schemaVersion: LocalSchemaVersion;
  readonly id: string;
  readonly routeId: string;
  readonly revisionNumber: number;
  readonly parentRevisionId?: string;
  readonly precursors: readonly WorkspacePrecursorInput[];
  readonly defaults: Pick<WorkspaceRecipeState, "objective" | "alExcessPercent" | "precursorExcessId" | "precursorExcessPercent" | "handlingLossPercent" | "balanceIncrementGrams" | "roundingMode" | "practicalMinimumMassGrams">;
  readonly createdAt: string;
  readonly canonicalDigest: string;
}

export interface RecentCalculation {
  readonly schemaVersion: LocalSchemaVersion;
  readonly snapshotId: string;
  readonly recipeId: string;
  readonly recipeName: string;
  readonly revisionNumber: number;
  readonly targetFormula: string;
  readonly batchMass: string;
  readonly basis: string;
  readonly calculationStatus: string;
  readonly warningCount: number;
  readonly lastOpenedAt: string;
}

export interface WorkspaceRecoveryState {
  readonly schemaVersion: LocalSchemaVersion;
  readonly id: "current";
  readonly committedRecipe: WorkspaceRecipeState;
  readonly invalidDraft?: Readonly<{ fieldPath: string; value: string; message: string }>;
  readonly mode: Mode;
  readonly activePanel: "none" | "trace" | "recipes" | "routes" | "revisions";
  readonly inputPanelCollapsed: boolean;
  readonly baseRecipeId?: string;
  readonly baseRevisionId?: string;
  readonly savedAsRecipe: boolean;
  readonly unsavedChanges: boolean;
  readonly committedEditSequence: number;
  readonly updatedAt: string;
}

export interface MigrationMetadata { readonly schemaVersion: LocalSchemaVersion; readonly id: string; readonly fromVersion: number; readonly toVersion: number; readonly appliedAt: string; readonly status: "complete" | "failed" }
export interface IntegrityDiagnostic { readonly code: string; readonly severity: "error" | "warning"; readonly recordType: string; readonly recordId: string; readonly message: string; readonly blocking: boolean }
export interface IntegrityResult { readonly valid: boolean; readonly diagnostics: readonly IntegrityDiagnostic[] }

export type ComparisonMetric = "total-mass" | "active-precursors" | "largest-residual" | "warning-count" | "introduced-elements" | "mass-closeness";
export interface ComparisonScenarioSource { readonly kind: "working-recipe" | "saved-recipe" | "saved-route" | "built-in" | "duplicate" | "empty"; readonly recipeId?: string; readonly recipeRevisionId?: string; readonly routeId?: string; readonly routeRevisionId?: string; readonly scenarioId?: string }
export interface ComparisonHistoricalCalculation { readonly canonicalInput: string; readonly canonicalOutput: string; readonly inputDigest: string; readonly outputDigest: string; readonly engineVersion: string; readonly atomicWeightDataVersion: string; readonly calculatedAt: string; readonly result: BatchCalculationResult }
export interface ComparisonScenario { readonly id: string; readonly name: string; readonly source: ComparisonScenarioSource; readonly inputState: WorkspaceRecipeState; readonly validationStatus: PersistedValidationStatus; readonly historical?: ComparisonHistoricalCalculation }
export interface ComparisonWorkspace {
  readonly schemaVersion: LocalSchemaVersion;
  readonly id: string;
  readonly name: string;
  readonly sharedTarget: Pick<WorkspaceRecipeState, "targetFormula" | "siteComposition">;
  readonly scenarios: readonly ComparisonScenario[];
  readonly selectedMetrics: readonly ComparisonMetric[];
  readonly focusedScenarioId: string;
  readonly layoutId: string;
  readonly notes: string;
  readonly validationStatus: PersistedValidationStatus;
  readonly historical: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type WorkspaceLayoutKind = "calculator" | "advanced-calculator" | "route-comparison" | "descriptor-placeholder";
export interface WorkspaceLayout {
  readonly schemaVersion: LocalSchemaVersion;
  readonly layoutSchemaVersion: "1.0.0";
  readonly id: string;
  readonly name: string;
  readonly kind: WorkspaceLayoutKind;
  readonly builtIn: boolean;
  readonly isDefault: boolean;
  readonly density: "compact" | "comfortable";
  readonly inputWidthPercent: 35 | 40 | 45 | 50;
  readonly visibleColumns: readonly ("formula" | "purity" | "solver-quantity" | "final-mass" | "status")[];
  readonly summaryExpanded: boolean;
  readonly tracePlacement: "below" | "side";
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface StoredAtomicRadiusDataset {
  readonly schemaVersion: typeof LOCAL_SCHEMA_VERSION;
  readonly id: string;
  readonly datasetId: string;
  readonly datasetVersion: string;
  readonly digest: string;
  readonly localTrust: "built-in-approved" | "locally-reviewed" | "imported-unverified" | "provisional";
  readonly dataset: AtomicRadiusDataset;
  readonly installedAt: string;
  readonly updatedAt: string;
}
