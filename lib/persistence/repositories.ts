import {
  BALANCE_MATRIX_SCHEMA_VERSION,
  BATCH_CALCULATION_SCHEMA_VERSION,
  DEFAULT_ATOMIC_RADIUS_REGISTRY,
  DEFAULT_ELEMENT_DATA,
  ENGINE_VERSION,
  PRECURSOR_SOLVER_SCHEMA_VERSION,
  canonicalRadiusDatasetContent,
  calculateSiteRadiusDescriptor,
  validateAtomicRadiusDataset,
  type AtomicRadiusDataset,
  type BatchCalculationResult,
} from "@max-stoich/chemistry-engine";
import Dexie from "dexie";
import type { WorkspaceRecipeState } from "../workspace/adapter";
import { canonicalizeWorkspaceScientificInput, hasValidRationals, hasValidScientificNumbers, invalidScientificNumberPath, sha256Hex, stableCanonicalize } from "./canonical";
import { MaxStoichDatabase } from "./database";
import {
  LOCAL_SCHEMA_VERSION,
  type CalculationSnapshot,
  type ComparisonWorkspace,
  type IntegrityDiagnostic,
  type IntegrityResult,
  type RecipeRevision,
  type RouteRevision,
  type SavedRecipe,
  type SavedRoute,
  type WorkspaceRecoveryState,
  type WorkspaceLayout,
  type StoredAtomicRadiusDataset,
} from "./entities";
import { BUILT_IN_LAYOUTS, validateLayout } from "../layouts/layouts";

export class PersistenceConflictError extends Error {
  constructor(message = "This recipe changed in another tab. Reopen it before saving another revision.") {
    super(message);
    this.name = "PersistenceConflictError";
  }
}

export interface SaveCalculatedRevisionRequest {
  readonly recipeId?: string;
  readonly expectedCurrentRevisionNumber?: number;
  readonly name?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly validationStatus?: SavedRecipe["validationStatus"];
  readonly revisionNote?: string;
  readonly inputState: WorkspaceRecipeState;
  readonly result: BatchCalculationResult;
  readonly duplicatedFromRecipeId?: string;
  readonly duplicatedFromRevisionId?: string;
  /** Test-only failure point used to prove transaction rollback. */
  readonly failAfterSnapshotWrite?: boolean;
}

export interface SavedRevisionBundle {
  readonly recipe: SavedRecipe;
  readonly revision: RecipeRevision;
  readonly snapshot: CalculationSnapshot;
}

export interface RecipeRepository {
  saveCalculatedRevision(request: SaveCalculatedRevisionRequest): Promise<SavedRevisionBundle>;
  listRecipes(includeArchived?: boolean): Promise<readonly SavedRecipe[]>;
  getRecipe(id: string): Promise<SavedRecipe | undefined>;
  getRevision(id: string): Promise<RecipeRevision | undefined>;
  listRevisions(recipeId: string): Promise<readonly RecipeRevision[]>;
  renameRecipe(id: string, name: string): Promise<void>;
  setRecipeArchived(id: string, archived: boolean): Promise<void>;
  deleteRecipePermanently(id: string): Promise<void>;
}

export interface RouteRepository {
  saveRouteRevision(input: SaveRouteRevisionRequest): Promise<Readonly<{ route: SavedRoute; revision: RouteRevision }>>;
  listRoutes(includeArchived?: boolean): Promise<readonly SavedRoute[]>;
  listRouteRevisions(routeId: string): Promise<readonly RouteRevision[]>;
}

function id(prefix: string): string {
  const value = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function validCalculatedResult(result: BatchCalculationResult): boolean {
  return (result.status === "success" || result.status === "success-with-warnings") && result.errors.length === 0;
}

async function snapshotFields(inputState: WorkspaceRecipeState, result: BatchCalculationResult): Promise<Readonly<{
  canonicalInput: string;
  canonicalOutput: string;
  inputDigest: string;
  outputDigest: string;
  dataDigest: string;
}>> {
  const canonicalInput = canonicalizeWorkspaceScientificInput(inputState);
  const canonicalOutput = stableCanonicalize(JSON.parse(result.canonicalScientificRepresentation));
  const canonicalData = stableCanonicalize(DEFAULT_ELEMENT_DATA);
  const [inputDigest, outputDigest, dataDigest] = await Promise.all([
    sha256Hex(canonicalInput),
    sha256Hex(canonicalOutput),
    sha256Hex(canonicalData),
  ]);
  return { canonicalInput, canonicalOutput, inputDigest, outputDigest, dataDigest };
}

export interface SaveRouteRevisionRequest {
  readonly routeId?: string;
  readonly expectedCurrentRevisionNumber?: number;
  readonly name?: string;
  readonly description?: string;
  readonly validationStatus?: SavedRoute["validationStatus"];
  readonly inputState: WorkspaceRecipeState;
}

export class LocalDataRepositories implements RecipeRepository, RouteRepository {
  constructor(readonly database = new MaxStoichDatabase()) {}

  async saveCalculatedRevision(request: SaveCalculatedRevisionRequest): Promise<SavedRevisionBundle> {
    if (!validCalculatedResult(request.result)) throw new Error("A current, feasible calculation is required before saving a scientific revision.");
    if (!hasValidRationals(request.result)) throw new Error("The calculation contains an invalid exact scientific scalar.");
    const scientific = await snapshotFields(request.inputState, request.result);
    const now = new Date().toISOString();
    const recipeId = request.recipeId ?? id("recipe");
    const revisionId = id("revision");
    const snapshotId = id("snapshot");

    return this.database.transaction("rw", this.database.recipes, this.database.recipeRevisions, this.database.snapshots, this.database.recentCalculations, async () => {
      const existing = await this.database.recipes.get(recipeId);
      if (existing && request.expectedCurrentRevisionNumber !== undefined && existing.currentRevisionNumber !== request.expectedCurrentRevisionNumber) throw new PersistenceConflictError();
      if (!existing && request.recipeId) throw new PersistenceConflictError("The recipe no longer exists.");
      const revisionNumber = (existing?.currentRevisionNumber ?? 0) + 1;
      const recipe: SavedRecipe = {
        schemaVersion: LOCAL_SCHEMA_VERSION,
        id: recipeId,
        name: request.name?.trim() || existing?.name || `Recipe ${request.inputState.targetFormula}`,
        targetFormula: request.inputState.targetFormula,
        description: request.description ?? existing?.description ?? "",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        currentRevisionNumber: revisionNumber,
        currentRevisionId: revisionId,
        archived: false,
        validationStatus: request.validationStatus ?? existing?.validationStatus ?? "synthetic",
        tags: request.tags ? [...request.tags] : existing?.tags ?? [],
        ...(existing?.duplicatedFromRecipeId || request.duplicatedFromRecipeId ? { duplicatedFromRecipeId: existing?.duplicatedFromRecipeId ?? request.duplicatedFromRecipeId } : {}),
        ...(existing?.duplicatedFromRevisionId || request.duplicatedFromRevisionId ? { duplicatedFromRevisionId: existing?.duplicatedFromRevisionId ?? request.duplicatedFromRevisionId } : {}),
      };
      const revision: RecipeRevision = {
        schemaVersion: LOCAL_SCHEMA_VERSION,
        id: revisionId,
        recipeId,
        revisionNumber,
        ...(existing ? { parentRevisionId: existing.currentRevisionId } : {}),
        canonicalScientificInput: scientific.canonicalInput,
        inputState: clone(request.inputState),
        createdAt: now,
        revisionNote: request.revisionNote?.trim() ?? "",
        inputSchemaVersion: "1.0.0",
        engineVersion: request.result.engineVersion,
        snapshotId,
        inputDigest: scientific.inputDigest,
      };
      const radiusDatasetSelections = request.inputState.radiusDescriptorConfig && request.inputState.siteComposition ? request.inputState.radiusDescriptorConfig.siteDatasets.map((selection) => {
        const dataset = DEFAULT_ATOMIC_RADIUS_REGISTRY.datasets.find((item) => item.datasetId === selection.datasetId && item.datasetVersion === selection.datasetVersion && item.digest === selection.datasetDigest);
        const descriptor = dataset ? calculateSiteRadiusDescriptor(request.inputState.siteComposition!, selection.siteId, dataset, selection.overrides) : undefined;
        return { siteId: selection.siteId, datasetId: selection.datasetId, datasetVersion: selection.datasetVersion, datasetDigest: selection.datasetDigest, sourceVerificationStatus: dataset?.approval.status ?? "unavailable", labApprovalStatus: dataset?.approval.labApproval ?? "not-reviewed", resolvedValues: descriptor?.occupants.map((item) => ({ element: item.element, ...(item.radiusPm ? { radiusPm: item.radiusPm } : {}), missing: item.missing, ...(item.sourceLocation ? { sourceLocation: item.sourceLocation } : {}) })) ?? [] };
      }) : undefined;
      const radiusDescriptorResults = request.inputState.radiusDescriptorConfig && request.inputState.siteComposition ? request.inputState.radiusDescriptorConfig.siteDatasets.flatMap((selection) => {
        const dataset = DEFAULT_ATOMIC_RADIUS_REGISTRY.datasets.find((item) => item.datasetId === selection.datasetId && item.datasetVersion === selection.datasetVersion && item.digest === selection.datasetDigest);
        return dataset ? [calculateSiteRadiusDescriptor(request.inputState.siteComposition!, selection.siteId, dataset, selection.overrides)] : [];
      }) : undefined;
      const snapshot: CalculationSnapshot = {
        schemaVersion: LOCAL_SCHEMA_VERSION,
        id: snapshotId,
        recipeId,
        recipeRevisionId: revisionId,
        canonicalScientificInput: scientific.canonicalInput,
        canonicalScientificOutput: scientific.canonicalOutput,
        inputDigest: scientific.inputDigest,
        outputDigest: scientific.outputDigest,
        engineVersion: request.result.engineVersion,
        formulaParserVersion: "1.0.0",
        siteCompositionVersion: "1.0.0",
        balanceMatrixVersion: BALANCE_MATRIX_SCHEMA_VERSION,
        solverVersion: PRECURSOR_SOLVER_SCHEMA_VERSION,
        batchCalculationVersion: BATCH_CALCULATION_SCHEMA_VERSION,
        atomicWeightDataVersion: request.result.dataVersions.atomicWeights,
        atomicWeightDataDigest: scientific.dataDigest,
        ...(request.inputState.radiusDescriptorConfig && request.inputState.siteComposition ? { radiusDescriptorSchemaVersion: "2.0.0" as const, radiusDescriptorConfig: clone(request.inputState.radiusDescriptorConfig), radiusSiteModel: clone(request.inputState.siteComposition), radiusDatasetSelections: clone(radiusDatasetSelections ?? []), radiusDescriptorResults: clone(radiusDescriptorResults ?? []), radiusDisclaimerVersion: "1.0.0" as const } : {}),
        result: clone(request.result),
        createdAt: now,
        validationStatus: recipe.validationStatus,
      };
      await this.database.recipeRevisions.add(revision);
      await this.database.snapshots.add(snapshot);
      if (request.failAfterSnapshotWrite) throw new Error("Simulated interrupted transaction");
      await this.database.recipes.put(recipe);
      await this.database.recentCalculations.put({
        schemaVersion: LOCAL_SCHEMA_VERSION,
        snapshotId,
        recipeId,
        recipeName: recipe.name,
        revisionNumber,
        targetFormula: request.inputState.targetFormula,
        batchMass: request.inputState.requestedMassGrams,
        basis: request.inputState.basis,
        calculationStatus: request.result.status,
        warningCount: request.result.warnings.length,
        lastOpenedAt: now,
      });
      const staleRecentKeys = await this.database.recentCalculations.orderBy("lastOpenedAt").reverse().offset(50).primaryKeys();
      if (staleRecentKeys.length) await this.database.recentCalculations.bulkDelete(staleRecentKeys);
      return { recipe, revision, snapshot };
    });
  }

  async listRecipes(includeArchived = false): Promise<readonly SavedRecipe[]> {
    const values = await this.database.recipes.orderBy("updatedAt").reverse().toArray();
    return values.filter((item) => includeArchived || !item.archived);
  }
  getRecipe(id: string): Promise<SavedRecipe | undefined> { return this.database.recipes.get(id); }
  getRevision(id: string): Promise<RecipeRevision | undefined> { return this.database.recipeRevisions.get(id); }
  getSnapshot(id: string): Promise<CalculationSnapshot | undefined> { return this.database.snapshots.get(id); }
  async listRevisions(recipeId: string): Promise<readonly RecipeRevision[]> { return this.database.recipeRevisions.where("recipeId").equals(recipeId).reverse().sortBy("revisionNumber"); }
  async renameRecipe(recipeId: string, name: string): Promise<void> {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Recipe name is required.");
    await this.database.recipes.update(recipeId, { name: trimmed, updatedAt: new Date().toISOString() });
  }
  async setRecipeArchived(recipeId: string, archived: boolean): Promise<void> { await this.database.recipes.update(recipeId, { archived, updatedAt: new Date().toISOString() }); }
  async deleteRecipePermanently(recipeId: string): Promise<void> {
    await this.database.transaction("rw", this.database.recipes, this.database.recipeRevisions, this.database.snapshots, this.database.recentCalculations, async () => {
      await Promise.all([
        this.database.recipes.delete(recipeId),
        this.database.recipeRevisions.where("recipeId").equals(recipeId).delete(),
        this.database.snapshots.where("recipeId").equals(recipeId).delete(),
        this.database.recentCalculations.where("recipeId").equals(recipeId).delete(),
      ]);
    });
  }

  async duplicateRecipe(sourceRecipeId: string, sourceRevisionId?: string): Promise<Readonly<{ name: string; inputState: WorkspaceRecipeState; sourceRecipeId: string; sourceRevisionId: string }>> {
    const recipe = await this.database.recipes.get(sourceRecipeId);
    if (!recipe) throw new Error("Source recipe was not found.");
    const revision = await this.database.recipeRevisions.get(sourceRevisionId ?? recipe.currentRevisionId);
    if (!revision || revision.recipeId !== sourceRecipeId) throw new Error("Source revision was not found.");
    return { name: `Copy of ${recipe.name}`, inputState: clone(revision.inputState), sourceRecipeId, sourceRevisionId: revision.id };
  }

  async saveRouteRevision(request: SaveRouteRevisionRequest): Promise<Readonly<{ route: SavedRoute; revision: RouteRevision }>> {
    const now = new Date().toISOString();
    const routeId = request.routeId ?? id("route");
    const revisionId = id("route-revision");
    const routeScientific = {
      precursors: [...request.inputState.precursors].sort((left, right) => left.id.localeCompare(right.id)),
      objective: request.inputState.objective,
      alExcessPercent: request.inputState.alExcessPercent,
      precursorExcessId: request.inputState.precursorExcessId,
      precursorExcessPercent: request.inputState.precursorExcessPercent,
      handlingLossPercent: request.inputState.handlingLossPercent,
      balanceIncrementGrams: request.inputState.balanceIncrementGrams,
      roundingMode: request.inputState.roundingMode,
      practicalMinimumMassGrams: request.inputState.practicalMinimumMassGrams,
    };
    const canonicalDigest = await sha256Hex(stableCanonicalize(routeScientific));
    return this.database.transaction("rw", this.database.routes, this.database.routeRevisions, async () => {
      const existing = await this.database.routes.get(routeId);
      if (existing && request.expectedCurrentRevisionNumber !== undefined && request.expectedCurrentRevisionNumber !== existing.currentRevisionNumber) throw new PersistenceConflictError("This route changed in another tab.");
      if (!existing && request.routeId) throw new PersistenceConflictError("The route no longer exists.");
      const revisionNumber = (existing?.currentRevisionNumber ?? 0) + 1;
      const revision: RouteRevision = {
        schemaVersion: LOCAL_SCHEMA_VERSION,
        id: revisionId,
        routeId,
        revisionNumber,
        ...(existing ? { parentRevisionId: existing.currentRevisionId } : {}),
        precursors: clone(request.inputState.precursors),
        defaults: {
          objective: request.inputState.objective,
          alExcessPercent: request.inputState.alExcessPercent,
          precursorExcessId: request.inputState.precursorExcessId,
          precursorExcessPercent: request.inputState.precursorExcessPercent,
          handlingLossPercent: request.inputState.handlingLossPercent,
          balanceIncrementGrams: request.inputState.balanceIncrementGrams,
          roundingMode: request.inputState.roundingMode,
          practicalMinimumMassGrams: request.inputState.practicalMinimumMassGrams,
        },
        createdAt: now,
        canonicalDigest,
      };
      const route: SavedRoute = {
        schemaVersion: LOCAL_SCHEMA_VERSION,
        id: routeId,
        name: request.name?.trim() || existing?.name || `Route for ${request.inputState.targetFormula}`,
        description: request.description ?? existing?.description ?? "",
        currentRevisionNumber: revisionNumber,
        currentRevisionId: revisionId,
        validationStatus: request.validationStatus ?? existing?.validationStatus ?? "synthetic",
        archived: false,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      await this.database.routeRevisions.add(revision);
      await this.database.routes.put(route);
      return { route, revision };
    });
  }
  async listRoutes(includeArchived = false): Promise<readonly SavedRoute[]> {
    const values = await this.database.routes.orderBy("updatedAt").reverse().toArray();
    return values.filter((item) => includeArchived || !item.archived);
  }
  async listRouteRevisions(routeId: string): Promise<readonly RouteRevision[]> { return this.database.routeRevisions.where("routeId").equals(routeId).reverse().sortBy("revisionNumber"); }
  async getRouteRevision(id: string): Promise<RouteRevision | undefined> { return this.database.routeRevisions.get(id); }
  async setRouteArchived(routeId: string, archived: boolean): Promise<void> { await this.database.routes.update(routeId, { archived, updatedAt: new Date().toISOString() }); }

  async saveRecovery(state: WorkspaceRecoveryState): Promise<void> { await this.database.recovery.put(clone(state)); }
  async loadRecovery(): Promise<WorkspaceRecoveryState | undefined> { return this.database.recovery.get("current"); }
  async clearRecovery(): Promise<void> { await this.database.recovery.delete("current"); }

  async saveComparison(workspace: ComparisonWorkspace): Promise<void> {
    if (workspace.scenarios.length < 2 || workspace.scenarios.length > 4) throw new Error("A comparison requires two to four scenarios.");
    if (workspace.scenarios.some((item) => item.inputState.targetFormula !== workspace.sharedTarget.targetFormula)) throw new Error("Every scenario must use the locked shared target.");
    await this.database.comparisons.put(clone({ ...workspace, schemaVersion: LOCAL_SCHEMA_VERSION, updatedAt: new Date().toISOString() }));
  }
  async getComparison(id: string): Promise<ComparisonWorkspace | undefined> { return this.database.comparisons.get(id); }
  async listComparisons(): Promise<readonly ComparisonWorkspace[]> { return this.database.comparisons.orderBy("updatedAt").reverse().toArray(); }
  async deleteComparison(id: string): Promise<void> { await this.database.comparisons.delete(id); }

  async listLayouts(): Promise<readonly WorkspaceLayout[]> {
    const userLayouts = (await this.database.layouts.orderBy("updatedAt").reverse().toArray()).filter((item) => validateLayout(item).length === 0 && item.layoutSchemaVersion === "1.0.0");
    const hasUserDefault = userLayouts.some((item) => item.isDefault);
    return [...BUILT_IN_LAYOUTS.map((item) => hasUserDefault && item.isDefault ? { ...item, isDefault: false } : item), ...userLayouts];
  }
  async saveLayout(layout: WorkspaceLayout): Promise<void> {
    if (layout.builtIn || layout.id.startsWith("builtin-")) throw new Error("Built-in layouts cannot be overwritten.");
    const errors = validateLayout(layout);
    if (errors.length) throw new Error(errors.join(" "));
    await this.database.transaction("rw", this.database.layouts, async () => {
      if (layout.isDefault) await this.database.layouts.toCollection().modify({ isDefault: false });
      await this.database.layouts.put(clone({ ...layout, schemaVersion: LOCAL_SCHEMA_VERSION, layoutSchemaVersion: "1.0.0", updatedAt: new Date().toISOString() }));
    });
  }
  async deleteLayout(id: string): Promise<void> {
    if (id.startsWith("builtin-")) throw new Error("Built-in layouts cannot be deleted.");
    await this.database.layouts.delete(id);
  }
  async resetDefaultLayout(): Promise<void> { await this.database.layouts.toCollection().modify({ isDefault: false }); }

  async installRadiusDataset(dataset: AtomicRadiusDataset, localTrust: StoredAtomicRadiusDataset["localTrust"] = "imported-unverified"): Promise<StoredAtomicRadiusDataset> {
    const digest = await sha256Hex(stableCanonicalize(canonicalRadiusDatasetContent(dataset)));
    const validation = validateAtomicRadiusDataset(dataset, digest);
    if (!validation.dataset || validation.diagnostics.some((item) => item.code !== "RADIUS_DATASET_UNVERIFIED" && item.blocking)) throw new Error(validation.diagnostics[0]?.message ?? "Atomic-radius dataset validation failed.");
    const trust = localTrust === "built-in-approved" || localTrust === "locally-reviewed" ? localTrust : "imported-unverified";
    const storedDataset = trust === "imported-unverified" ? { ...validation.dataset, approval: { ...validation.dataset.approval, status: "unverified-import" as const, sourceVerified: false, labApproval: "not-reviewed" as const, reviewer: undefined, reviewDate: undefined } } : validation.dataset;
    const now = new Date().toISOString(); const record: StoredAtomicRadiusDataset = { schemaVersion: LOCAL_SCHEMA_VERSION, id: `${storedDataset.datasetId}@${storedDataset.datasetVersion}`, datasetId: storedDataset.datasetId, datasetVersion: storedDataset.datasetVersion, digest: storedDataset.digest, localTrust: trust, dataset: clone(storedDataset), installedAt: now, updatedAt: now };
    const existing = await this.database.radiusDatasets.get(record.id); if (existing && existing.digest !== record.digest) throw new Error("A different immutable radius dataset already uses this ID and version."); if (!existing) await this.database.radiusDatasets.add(record); return existing ?? record;
  }
  async listRadiusDatasets(): Promise<readonly StoredAtomicRadiusDataset[]> { return this.database.radiusDatasets.orderBy("updatedAt").reverse().toArray(); }

  async verifySnapshot(snapshot: CalculationSnapshot): Promise<IntegrityResult> {
    const diagnostics: IntegrityDiagnostic[] = [];
    const inputDigest = await sha256Hex(snapshot.canonicalScientificInput);
    const outputDigest = await sha256Hex(snapshot.canonicalScientificOutput);
    if (inputDigest !== snapshot.inputDigest) diagnostics.push({ code: "INPUT_DIGEST_MISMATCH", severity: "error", recordType: "snapshot", recordId: snapshot.id, message: "The saved scientific input digest does not match.", blocking: true });
    if (outputDigest !== snapshot.outputDigest) diagnostics.push({ code: "OUTPUT_DIGEST_MISMATCH", severity: "error", recordType: "snapshot", recordId: snapshot.id, message: "The saved scientific output digest does not match.", blocking: true });
    if (!hasValidRationals(snapshot.result)) diagnostics.push({ code: "INVALID_SCIENTIFIC_SCALAR", severity: "error", recordType: "snapshot", recordId: snapshot.id, message: "An exact rational has a missing or non-positive denominator.", blocking: true });
    if (!hasValidScientificNumbers(snapshot.result)) diagnostics.push({ code: "INVALID_SCIENTIFIC_NUMBER", severity: "error", recordType: "snapshot", recordId: snapshot.id, message: `The snapshot contains a non-finite or malformed scientific number at ${invalidScientificNumberPath(snapshot.result)}.`, blocking: true });
    if (!snapshot.engineVersion || !snapshot.atomicWeightDataVersion || !snapshot.atomicWeightDataDigest) diagnostics.push({ code: "MISSING_VERSION_METADATA", severity: "error", recordType: "snapshot", recordId: snapshot.id, message: "Required engine or dataset version metadata is missing.", blocking: true });
    if (snapshot.radiusDescriptorConfig?.schemaVersion === "2.0.0" && (!snapshot.radiusDescriptorSchemaVersion || !snapshot.radiusSiteModel || !snapshot.radiusDatasetSelections || !snapshot.radiusDescriptorResults || !snapshot.radiusDisclaimerVersion)) diagnostics.push({ code: "INCOMPLETE_RADIUS_PROVENANCE", severity: "error", recordType: "snapshot", recordId: snapshot.id, message: "A radius-enabled snapshot is missing per-site dataset, resolved-value, descriptor, disclaimer, or explicit-site provenance.", blocking: true });
    if (snapshot.radiusDescriptorConfig?.schemaVersion === "2.0.0" && snapshot.radiusDatasetSelections && snapshot.radiusDescriptorConfig.siteDatasets.some((selection) => !snapshot.radiusDatasetSelections!.some((stored) => stored.siteId === selection.siteId && stored.datasetId === selection.datasetId && stored.datasetVersion === selection.datasetVersion && stored.datasetDigest === selection.datasetDigest))) diagnostics.push({ code: "RADIUS_PROVENANCE_MISMATCH", severity: "error", recordType: "snapshot", recordId: snapshot.id, message: "A per-site radius selection differs from immutable snapshot provenance.", blocking: true });
    return { valid: diagnostics.length === 0, diagnostics };
  }

  async checkStartupIntegrity(): Promise<IntegrityResult> {
    const diagnostics: IntegrityDiagnostic[] = [];
    const [recipes, routes, recent, recovery] = await Promise.all([this.database.recipes.toArray(), this.database.routes.toArray(), this.database.recentCalculations.limit(25).toArray(), this.database.recovery.get("current")]);
    for (const recipe of recipes) { const revision = await this.database.recipeRevisions.get(recipe.currentRevisionId); if (!revision || revision.recipeId !== recipe.id || revision.revisionNumber !== recipe.currentRevisionNumber) diagnostics.push({ code: "INVALID_CURRENT_REVISION", severity: "error", recordType: "recipe", recordId: recipe.id, message: "The current revision pointer is invalid.", blocking: true }); }
    for (const route of routes) { const revision = await this.database.routeRevisions.get(route.currentRevisionId); if (!revision || revision.routeId !== route.id) diagnostics.push({ code: "INVALID_ROUTE_REVISION", severity: "error", recordType: "route", recordId: route.id, message: "The current route revision pointer is invalid.", blocking: true }); }
    for (const item of recent) if (!await this.database.snapshots.get(item.snapshotId)) diagnostics.push({ code: "MISSING_RECENT_SNAPSHOT", severity: "warning", recordType: "recent-calculation", recordId: item.snapshotId, message: "A recent-calculation shortcut references a missing snapshot.", blocking: false });
    if (recovery && recovery.schemaVersion !== LOCAL_SCHEMA_VERSION) diagnostics.push({ code: "RECOVERY_SCHEMA_MISMATCH", severity: "warning", recordType: "recovery", recordId: "current", message: "The recovery draft uses an unsupported schema and will not replace saved records.", blocking: false });
    return { valid: diagnostics.every((item) => !item.blocking), diagnostics };
  }

  async checkIntegrity(): Promise<IntegrityResult> {
    const diagnostics: IntegrityDiagnostic[] = [];
    const [recipes, revisions, snapshots, routes, routeRevisions, comparisons, layouts, radiusDatasets] = await Promise.all([
      this.database.recipes.toArray(), this.database.recipeRevisions.toArray(), this.database.snapshots.toArray(), this.database.routes.toArray(), this.database.routeRevisions.toArray(), this.database.comparisons.toArray(), this.database.layouts.toArray(), this.database.radiusDatasets.toArray(),
    ]);
    const revisionsById = new Map(revisions.map((item) => [item.id, item]));
    const snapshotsById = new Map(snapshots.map((item) => [item.id, item]));
    const routeRevisionsById = new Map(routeRevisions.map((item) => [item.id, item]));
    for (const recipe of recipes) {
      if (recipe.schemaVersion !== LOCAL_SCHEMA_VERSION) diagnostics.push({ code: "UNSUPPORTED_SCHEMA_VERSION", severity: "error", recordType: "recipe", recordId: recipe.id, message: `Unsupported schema ${recipe.schemaVersion}.`, blocking: true });
      const current = revisionsById.get(recipe.currentRevisionId);
      if (!current || current.recipeId !== recipe.id || current.revisionNumber !== recipe.currentRevisionNumber) diagnostics.push({ code: "INVALID_CURRENT_REVISION", severity: "error", recordType: "recipe", recordId: recipe.id, message: "The current revision pointer is invalid.", blocking: true });
    }
    for (const revision of revisions) {
      const snapshot = snapshotsById.get(revision.snapshotId);
      if (!snapshot || snapshot.recipeRevisionId !== revision.id) diagnostics.push({ code: "MISSING_SNAPSHOT", severity: "error", recordType: "revision", recordId: revision.id, message: "The immutable calculation snapshot is missing.", blocking: true });
    }
    for (const snapshot of snapshots) diagnostics.push(...(await this.verifySnapshot(snapshot)).diagnostics);
    for (const route of routes) if (!routeRevisionsById.has(route.currentRevisionId)) diagnostics.push({ code: "INVALID_ROUTE_REVISION", severity: "error", recordType: "route", recordId: route.id, message: "The current route revision pointer is invalid.", blocking: true });
    for (const comparison of comparisons) {
      if (comparison.scenarios.length < 2 || comparison.scenarios.length > 4) diagnostics.push({ code: "INVALID_COMPARISON_SCENARIO_COUNT", severity: "error", recordType: "comparison", recordId: comparison.id, message: "Comparison must contain two to four scenarios.", blocking: true });
      if (comparison.scenarios.some((item) => item.inputState.targetFormula !== comparison.sharedTarget.targetFormula)) diagnostics.push({ code: "COMPARISON_TARGET_MISMATCH", severity: "error", recordType: "comparison", recordId: comparison.id, message: "A scenario does not match the shared target.", blocking: true });
    }
    for (const layout of layouts) for (const message of validateLayout(layout)) diagnostics.push({ code: "INVALID_LAYOUT", severity: "warning", recordType: "layout", recordId: layout.id, message, blocking: false });
    for (const record of radiusDatasets) { const digest = await sha256Hex(stableCanonicalize(canonicalRadiusDatasetContent(record.dataset))); const validation = validateAtomicRadiusDataset(record.dataset, digest); if (digest !== record.digest || validation.diagnostics.some((item) => item.code === "RADIUS_DATASET_DIGEST_MISMATCH")) diagnostics.push({ code: "RADIUS_DATASET_DIGEST_MISMATCH", severity: "error", recordType: "radius-dataset", recordId: record.id, message: "The installed radius dataset digest is invalid.", blocking: true }); }
    return { valid: diagnostics.every((item) => !item.blocking), diagnostics };
  }

  async exportRawBackup(): Promise<string> {
    const [recipes, recipeRevisions, snapshots, routes, routeRevisions, recentCalculations, recovery, migrations, comparisons, layouts, radiusDatasets] = await Promise.all([
      this.database.recipes.toArray(), this.database.recipeRevisions.toArray(), this.database.snapshots.toArray(), this.database.routes.toArray(), this.database.routeRevisions.toArray(), this.database.recentCalculations.toArray(), this.database.recovery.toArray(), this.database.migrations.toArray(), this.database.comparisons.toArray(), this.database.layouts.toArray(), this.database.radiusDatasets.toArray(),
    ]);
    return JSON.stringify({ schemaVersion: LOCAL_SCHEMA_VERSION, exportedAt: new Date().toISOString(), recipes, recipeRevisions, snapshots, routes, routeRevisions, recentCalculations, recovery, migrations, comparisons, layouts, radiusDatasets }, null, 2);
  }

  close(): void { this.database.close(); }
  async deleteDatabase(): Promise<void> { this.database.close(); await Dexie.delete(this.database.name); }
}

export const PERSISTED_ENGINE_VERSION = ENGINE_VERSION;
