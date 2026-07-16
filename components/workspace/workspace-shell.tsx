"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ChemistryDecimal, DEFAULT_ATOMIC_RADIUS_REGISTRY, ENGINE_VERSION, analyzeMaxXComponent, assessPrecursorRoute, normalizeLeadingSiteRatioGroup, parseFormula, replaceMaxXCoefficient, suggestPrecursorRoutes, type BatchCalculationResult, type BatchMassBasis, type PrecursorRouteSuggestion, type PrecursorSuggestionResult, type RadiusDescriptorConfig, type RegisteredPrecursorDefinition, type RegisteredPrecursorRoute, type RoundingMode } from "@max-stoich/chemistry-engine";
import { buildWorkspaceCalculation, formatComposition, resolveWorkspaceTarget, type WorkspaceRecipeState } from "@/lib/workspace/adapter";
import { getWorkspacePreset, WORKSPACE_PRESETS, type WorkspacePrecursorInput } from "@/lib/workspace/presets";
import { buildLaboratoryCsv, buildLaboratoryJson, buildWeighingTableTsv, downloadText, safeExportFilename } from "@/lib/export/laboratory-export";
import { LOCAL_SCHEMA_VERSION, type CalculationSnapshot, type RecipeNote, type RecipeRevision, type RouteRevision, type SavedRecipe, type SavedRoute, type WorkspaceLayout } from "@/lib/persistence/entities";
import { LocalDataRepositories } from "@/lib/persistence/repositories";
import { createOwnedRecordExport } from "@/lib/persistence/backup";
import type { Mode } from "@/lib/persistence/workspace-types";
import { RecipeCommandHistory } from "@/lib/workspace/history";
import { AtomicRadiusPanel } from "@/components/descriptor-panel/atomic-radius-panel";
import { SiteBrand } from "@/components/site/site-brand";
import { presentDiagnostics, precursorStatus } from "@/lib/presentation/diagnostics";
import { formatDescriptor, formatMassForBalance, formatMoles, formatPercent } from "@/lib/presentation/scientific-format";
import { sortWeighingPrecursors, WEIGHING_SORT_OPTIONS, type WeighingSortOption } from "@/lib/presentation/weighing-sort";
import { DEFAULT_PRECURSOR_REGISTRY } from "@/lib/workspace/precursor-registry";
import { aluminumCoefficientForTargetChange, analyzeWorkspaceAluminumFeed, migrateWorkspaceAluminumInput } from "@/lib/workspace/aluminum-feed";
import { WeighingSummaryDialog } from "@/components/weighing-summary/weighing-summary-dialog";
import { buildWeighingSummary, coefficientSuffix, formatAdjustedFeedFormula } from "@/lib/presentation/weighing-summary";
import { canonicalizeWorkspaceScientificInput } from "@/lib/persistence/canonical";
import { SaveRecipeDialog, type SaveRecipeDialogValue } from "@/components/workspace/save-recipe-dialog";
import { RecipeNotesDialog } from "@/components/workspace/recipe-notes-dialog";
import { useDismissibleLayer } from "@/components/workspace/use-dismissible-layer";
import { CalculationVerificationDialog } from "@/components/verification/calculation-verification-dialog";
import { buildCalculationVerification } from "@/lib/presentation/calculation-verification";
import { FIELD_LABELS, applyFeedDefaultsToNewTemplate, createDefaultUserSettings, displaySettingsForMode, type LocalUserSettings, type WeighingResultField } from "@/lib/settings/user-settings";
import { createPrintJob, launchPrintJob } from "@/lib/print/print-model";
import { classifyStartupError, loadStartupData, repairRecoveryRecord, type StartupFailure } from "@/lib/persistence/startup-recovery";
import { StartupRecoveryScreen } from "@/components/workspace/startup-recovery-screen";

const WEIGHING_SORT_STORAGE_KEY = "max-stoich.weighing-sort.v1";

export function blankWorkspaceState(settings = createDefaultUserSettings()): WorkspaceRecipeState {
  return {
    transientId: "temporary-blank", presetId: "blank", targetFormula: "", precursors: [], requestedMassGrams: "10.000",
    basis: "ideal-product-mass", expectedYieldPercent: "80", aluminumPerFormula: settings.feedDefaults.aluminumPerFormula, precursorExcessId: "", precursorExcessPercent: "0",
    handlingLossPercent: "0", balanceIncrementGrams: "0.001", roundingMode: "nearest-half-even", practicalMinimumMassGrams: "0.001",
    objective: "deterministic-feasible", routeOrigin: { kind: "manual" },
  };
}

export function genericCarbideTemplateState(template: "211" | "312" | "413", settings: LocalUserSettings): WorkspaceRecipeState {
  const data = { "211": { formula: "Ti2AlC" }, "312": { formula: "Ti3AlC2" }, "413": { formula: "Ti4AlC3" } }[template];
  const precursor = (id: string, formula: string): WorkspacePrecursorInput => ({ id, name: formula, formula, purityPercent: "100", constraintMode: "solver", fixedValue: "", minimum: "", maximum: "", ratioDenominatorId: "", numeratorRatio: "1", denominatorRatio: "1", molarMassOverride: "", molarMassOverrideSource: "" });
  return applyFeedDefaultsToNewTemplate({ ...blankWorkspaceState(settings), transientId: `temporary-generic-${template}`, presetId: "custom", targetFormula: data.formula, precursors: [precursor("ti", "Ti"), precursor("al", "Al"), precursor("c", "C")], routeOrigin: { kind: "manual" } }, settings, template);
}

export function stateFromPreset(id: string): WorkspaceRecipeState {
  const preset = getWorkspacePreset(id);
  const radiusDescriptorConfig: RadiusDescriptorConfig | undefined = preset.siteComposition ? {
    schemaVersion: "2.0.0", enabled: true,
    siteDatasets: preset.siteComposition.sites.map((site) => {
      const datasetId = site.id === "X" ? "cordero-covalent-2008" : "teatum-metallic-cn12";
      const dataset = DEFAULT_ATOMIC_RADIUS_REGISTRY.datasets.find((item) => item.datasetId === datasetId)!;
      return { siteId: site.id, datasetId, datasetVersion: dataset.datasetVersion, datasetDigest: dataset.digest, overrides: [] };
    }),
  } : undefined;
  return {
    transientId: `temporary-${preset.id}`,
    presetId: preset.id,
    targetFormula: preset.targetFormula,
    ...(preset.siteComposition ? { siteComposition: preset.siteComposition } : {}),
    ...(radiusDescriptorConfig ? { radiusDescriptorConfig } : {}),
    precursors: preset.precursors.map((item) => ({ ...item })),
    requestedMassGrams: "10.000",
    basis: "ideal-product-mass",
    expectedYieldPercent: "80",
    aluminumPerFormula: "1",
    precursorExcessId: "",
    precursorExcessPercent: "0",
    handlingLossPercent: "0",
    balanceIncrementGrams: "0.001",
    roundingMode: "nearest-half-even",
    practicalMinimumMassGrams: "0.001",
    objective: "deterministic-feasible", routeOrigin: { kind: "loaded", sourceRouteId: preset.id, validationStatus: preset.validationStatus },
  };
}

function replacePrecursor(recipe: WorkspaceRecipeState, index: number, patch: Partial<WorkspacePrecursorInput>): WorkspaceRecipeState {
  return { ...recipe, precursors: recipe.precursors.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item), routeOrigin: { kind: "manual" }, routeSource: undefined };
}

function suggestionPrecursor(item: RegisteredPrecursorDefinition): WorkspacePrecursorInput {
  return { id: item.id, name: item.name, formula: item.formula ?? "", purityPercent: item.defaultPurityPercent ?? "", constraintMode: "solver", fixedValue: "", minimum: "", maximum: "", ratioDenominatorId: "", numeratorRatio: "1", denominatorRatio: "1", molarMassOverride: "", molarMassOverrideSource: "" };
}

function NumberField({ id, label, value, unit, onChange }: { id: string; label: string; value: string; unit: string; onChange: (value: string) => void }) {
  return <label className="block text-sm font-medium text-slate-800" htmlFor={id}>{label}<span className="mt-1 flex rounded-md border border-slate-400 bg-white focus-within:border-teal-700 focus-within:ring-2 focus-within:ring-teal-200"><input className="min-h-10 min-w-0 flex-1 rounded-l-md px-3 font-mono tabular-nums outline-none" data-primary-field inputMode="decimal" id={id} onChange={(event) => onChange(event.target.value)} value={value} /><span aria-hidden="true" className="flex min-w-12 items-center justify-center border-l border-slate-300 bg-slate-100 px-2 text-xs text-slate-600">{unit}</span></span></label>;
}

function largestResidual(result: BatchCalculationResult): string {
  let largest = result.realizedElements[0];
  for (const item of result.realizedElements) if (!largest || Number(item.absoluteResidualMoles) > Number(largest.absoluteResidualMoles)) largest = item;
  return largest ? `${largest.element} ${formatMoles(largest.signedResidualMoles)}` : "— 0 mol";
}

export function WorkspaceShell() {
  const [recipe, setRecipeState] = useState<WorkspaceRecipeState>(() => blankWorkspaceState());
  const [mode, setMode] = useState<Mode>("standard");
  const [traceOpen, setTraceOpen] = useState(false);
  const [weighingSort, setWeighingSort] = useState<WeighingSortOption>("original");
  const [userSettings, setUserSettings] = useState<LocalUserSettings>(() => createDefaultUserSettings());
  const [xCoefficientDraft, setXCoefficientDraft] = useState<string>();
  const [xCoefficientError, setXCoefficientError] = useState<string>();
  const [commandOpen, setCommandOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<"none" | "recipes" | "routes" | "revisions">("none");
  const [savedRecipe, setSavedRecipe] = useState<SavedRecipe>();
  const [savedRevision, setSavedRevision] = useState<RecipeRevision>();
  const [savedSnapshot, setSavedSnapshot] = useState<CalculationSnapshot>();
  const [historicalSnapshot, setHistoricalSnapshot] = useState<CalculationSnapshot>();
  const [recipes, setRecipes] = useState<readonly SavedRecipe[]>([]);
  const [routes, setRoutes] = useState<readonly SavedRoute[]>([]);
  const [layouts, setLayouts] = useState<readonly WorkspaceLayout[]>([]);
  const [activeLayout, setActiveLayout] = useState<WorkspaceLayout>();
  const [revisions, setRevisions] = useState<readonly RecipeRevision[]>([]);
  const [routeRevisions, setRouteRevisions] = useState<readonly RouteRevision[]>([]);
  const [librarySearch, setLibrarySearch] = useState("");
  const [selectedPrintRecipeIds, setSelectedPrintRecipeIds] = useState<readonly string[]>([]);
  const [statusMessage, setStatusMessage] = useState("Opening local workspace…");
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [startupFailure, setStartupFailure] = useState<StartupFailure>();
  const [startupPending, setStartupPending] = useState(true);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [duplicationSource, setDuplicationSource] = useState<Readonly<{ recipeId: string; revisionId: string; name: string }>>();
  const [historyVersion, setHistoryVersion] = useState(0);
  const [suggestionOpen, setSuggestionOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesRecipe, setNotesRecipe] = useState<SavedRecipe>();
  const [notesRevisions, setNotesRevisions] = useState<readonly RecipeRevision[]>([]);
  const [libraryNotes, setLibraryNotes] = useState<readonly RecipeNote[]>([]);
  const [suggestionResult, setSuggestionResult] = useState<PrecursorSuggestionResult>();
  const [dismissedCoverageFormula, setDismissedCoverageFormula] = useState<string>();
  const repositories = useMemo(() => new LocalDataRepositories(), []);
  const [history] = useState(() => new RecipeCommandHistory(150, 500));
  const committedValidRecipe = useRef(recipe);
  const editSequence = useRef(0);
  const formulaRef = useRef<HTMLInputElement>(null);
  const batchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const suggestRef = useRef<HTMLButtonElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const verificationButtonRef = useRef<HTMLButtonElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const commandLayerRef = useRef<HTMLElement>(null);
  const panelTriggerRef = useRef<HTMLElement>(null);
  const panelLayerRef = useRef<HTMLElement>(null);
  const notesTriggerRef = useRef<HTMLElement>(null);
  const startupStarted = useRef(false);
  const calculation = useMemo(() => buildWorkspaceCalculation(recipe), [recipe]);
  const suggestionTarget = useMemo(() => resolveWorkspaceTarget(recipe), [recipe]);
  const builtInSuggestions = useMemo(() => suggestionTarget ? suggestPrecursorRoutes(suggestionTarget, DEFAULT_PRECURSOR_REGISTRY) : undefined, [suggestionTarget]);
  const currentRouteAssessment = useMemo(() => suggestionTarget && recipe.precursors.length ? assessPrecursorRoute(suggestionTarget, recipe.precursors.map((item) => ({ schemaVersion: "1.0.0", id: item.id, name: item.name, formula: item.formula }))) : undefined, [recipe.precursors, suggestionTarget]);
  const currentRouteInvalid = Boolean(currentRouteAssessment && !currentRouteAssessment.usable);
  const ratioNormalization = useMemo(() => recipe.normalizeLeadingSiteRatios ? normalizeLeadingSiteRatioGroup(recipe.targetFormula, { enabled: true, expectedSite: "M" }) : undefined, [recipe.normalizeLeadingSiteRatios, recipe.targetFormula]);
  const xComponent = useMemo(() => analyzeMaxXComponent(recipe.targetFormula), [recipe.targetFormula]);
  const aluminumFeed = useMemo(() => analyzeWorkspaceAluminumFeed(recipe), [recipe]);
  const aluminumHelper = useMemo(() => {
    if (!aluminumFeed.visible || aluminumFeed.error || !aluminumFeed.idealCoefficient || !aluminumFeed.enteredCoefficient) return aluminumFeed.error;
    const relative = new ChemistryDecimal(aluminumFeed.enteredCoefficient).dividedBy(aluminumFeed.idealCoefficient).minus(1).times(100);
    if (relative.isZero()) return "Stoichiometric aluminum";
    return `${relative.abs().toDecimalPlaces(6).toString()}% ${relative.isPositive() ? "above" : "below"} ideal aluminum`;
  }, [aluminumFeed]);
  const initialValid = calculation.state === "valid" || calculation.state === "valid-with-warnings" ? calculation.result : undefined;
  const [lastValid, setLastValid] = useState<BatchCalculationResult | undefined>(initialValid);
  const currentValid = calculation.state === "valid" || calculation.state === "valid-with-warnings";
  const stale = !currentValid && lastValid !== undefined;
  const displayed = historicalSnapshot?.result ?? (currentValid ? calculation.result : lastValid);
  const workingAdjustedFormula = calculation.result ? formatAdjustedFeedFormula(calculation.result.adjustedFeedComposition.amounts, recipe.targetFormula) : undefined;
  const normalizedAdjustedFormula = ratioNormalization?.success && aluminumFeed.visible && aluminumFeed.enteredCoefficient ? `${ratioNormalization.value.enteredRatios.map((entry) => `${entry.element}${coefficientSuffix(entry.normalizedFormulaCoefficient.canonical)}`).join("")}Al${coefficientSuffix(aluminumFeed.enteredCoefficient)}${ratioNormalization.value.intendedFeedXElement}${coefficientSuffix(ratioNormalization.value.intendedFeedXCoefficientText)}` : undefined;
  const normalizedIdealFormula = ratioNormalization?.success ? `(${ratioNormalization.value.enteredRatios.map((entry) => `${entry.element}${coefficientSuffix(entry.normalizedOccupancy.canonical)}`).join("")})${ratioNormalization.value.requestedMultiplicity.canonical}Al${ratioNormalization.value.intendedFeedXElement}${coefficientSuffix(ratioNormalization.value.idealXCoefficient.canonical)}` : undefined;
  const expandedIdealFormula = ratioNormalization?.success ? `${ratioNormalization.value.enteredRatios.map((entry) => `${entry.element}${coefficientSuffix(entry.normalizedFormulaCoefficient.canonical)}`).join("")}Al${ratioNormalization.value.intendedFeedXElement}${coefficientSuffix(ratioNormalization.value.idealXCoefficient.canonical)}` : undefined;
  const diagnosticPresentation = useMemo(() => displayed ? presentDiagnostics(displayed) : undefined, [displayed]);
  const sortedPrecursors = useMemo(() => displayed ? sortWeighingPrecursors(displayed, recipe.precursors, weighingSort) : [], [displayed, recipe.precursors, weighingSort]);
  const resultDisplaySettings = displaySettingsForMode(userSettings, mode);
  const visibleResultFields = resultDisplaySettings.columnOrder.filter((field) => resultDisplaySettings.visibleFields.includes(field));
  const resultRadiusDataset = DEFAULT_ATOMIC_RADIUS_REGISTRY.usableDatasets.find((dataset) => dataset.datasetId === userSettings.resultDisplay.atomicRadiusDatasetId);
  const elementalRadius = (formula: string | undefined) => {
    if (!formula) return undefined; const parsed = parseFormula(formula); if (!parsed.success) return undefined;
    const elements = Object.keys(parsed.composition.amounts); if (elements.length !== 1) return null;
    const record = resultRadiusDataset?.values.find((item) => item.element === elements[0] && item.defaultForPolicy); return record ? { record, element: elements[0]! } : undefined;
  };
  const activePreset = WORKSPACE_PRESETS.find((item) => item.id === recipe.presetId);
  const validationNote = activePreset?.validationNote ?? (recipe.presetId === "blank" ? "Start with a target formula and add only the precursor materials you intend to use." : "Custom in-memory input; scientific values and route have not been independently reviewed.");
  const canUndo = historyVersion >= 0 && history.canUndo;
  const canRedo = historyVersion >= 0 && history.canRedo;
  const scientificInputChanged = useMemo(() => {
    if (!savedRecipe || !savedRevision) return true;
    if (historicalSnapshot && !unsavedChanges) return false;
    if (savedRevision.id !== savedRecipe.currentRevisionId) return true;
    return canonicalizeWorkspaceScientificInput(recipe) !== savedRevision.canonicalScientificInput;
  }, [historicalSnapshot, recipe, savedRecipe, savedRevision, unsavedChanges]);

  const dismissCommand = useCallback(() => setCommandOpen(false), []);
  const dismissPanel = useCallback(() => setActivePanel("none"), []);
  useDismissibleLayer({ open: commandOpen, layerRef: commandLayerRef, triggerRef: moreButtonRef, onDismiss: dismissCommand });
  useDismissibleLayer({ open: activePanel !== "none", layerRef: panelLayerRef, triggerRef: panelTriggerRef, onDismiss: dismissPanel });

  const refreshLibraries = useCallback(async () => {
    const [nextRecipes, nextRoutes, nextLayouts, nextNotes] = await Promise.all([repositories.listRecipes(), repositories.listRoutes(), repositories.listLayouts(), repositories.listRecipeNotes()]);
    setRecipes(nextRecipes);
    setRoutes(nextRoutes);
    setLayouts(nextLayouts);
    setLibraryNotes(nextNotes);
    setActiveLayout((current) => current ?? nextLayouts.find((item) => item.isDefault) ?? nextLayouts[0]);
  }, [repositories]);

  const setRecipe = (next: WorkspaceRecipeState, type = "edit", groupKey?: string) => {
    history.record(type, groupKey ?? document.activeElement?.id ?? type, recipe, next);
    setHistoryVersion((value) => value + 1);
    setRecipeState(next);
    setXCoefficientDraft(undefined);
    setXCoefficientError(undefined);
    setHistoricalSnapshot(undefined);
    setUnsavedChanges(true);
    editSequence.current += 1;
    const nextCalculation = buildWorkspaceCalculation(next);
    if (recoveryReady && (nextCalculation.state === "valid" || nextCalculation.state === "valid-with-warnings")) void repositories.saveRecovery({ schemaVersion: LOCAL_SCHEMA_VERSION, id: "current", committedRecipe: next, mode, activePanel: "none", inputPanelCollapsed: false, ...(savedRecipe ? { baseRecipeId: savedRecipe.id } : {}), ...(savedRevision ? { baseRevisionId: savedRevision.id } : {}), savedAsRecipe: Boolean(savedRecipe), unsavedChanges: true, committedEditSequence: editSequence.current, updatedAt: new Date().toISOString() }).catch((error) => setStatusMessage(`Recovery save failed: ${error instanceof Error ? error.message : "unknown error"}`));
  };

  useEffect(() => {
    if (!currentValid) return;
    const timer = window.setTimeout(() => setLastValid(calculation.result), 0);
    return () => window.clearTimeout(timer);
  }, [calculation, currentValid]);
  const initializeWorkspace = useCallback(async (options: Readonly<{ skipRecovery?: boolean }> = {}) => {
    setStartupPending(true); setStartupFailure(undefined); setRecoveryReady(false);
    try {
      const startup = await loadStartupData(repositories, options);
      let settings = startup.settings;
      const legacySort = window.localStorage.getItem(WEIGHING_SORT_STORAGE_KEY);
      if (settings.resultDisplay.weighingSort === "original" && WEIGHING_SORT_OPTIONS.some((item) => item.value === legacySort) && legacySort !== "original") { settings = { ...settings, resultDisplay: { ...settings.resultDisplay, weighingSort: legacySort as WeighingSortOption } }; await repositories.saveSettings(settings); }
      window.localStorage.removeItem(WEIGHING_SORT_STORAGE_KEY);
      setUserSettings(settings); setWeighingSort(settings.resultDisplay.weighingSort);
      const recovery = startup.recovery;
      if (recovery) {
        const migratedRecovery = migrateWorkspaceAluminumInput(recovery.committedRecipe);
        setRecipeState(migratedRecovery); committedValidRecipe.current = migratedRecovery; setMode(recovery.mode); setUnsavedChanges(recovery.unsavedChanges); editSequence.current = recovery.committedEditSequence;
        if (recovery.baseRecipeId && recovery.baseRevisionId) {
          const [baseRecipe, baseRevision] = await Promise.all([repositories.getRecipe(recovery.baseRecipeId), repositories.getRevision(recovery.baseRevisionId)]);
          if (baseRecipe && baseRevision) {
            const baseSnapshot = await repositories.getSnapshot(baseRevision.snapshotId);
            setSavedRecipe(baseRecipe); setSavedRevision(baseRevision);
            if (baseSnapshot) { setSavedSnapshot(baseSnapshot); if (!recovery.unsavedChanges) setHistoricalSnapshot(baseSnapshot); }
          }
        }
        setStatusMessage(startup.settingsWarning ?? (recovery.unsavedChanges ? "Recovered unsaved workspace" : "Recovered saved workspace"));
      } else {
        const blank = blankWorkspaceState(settings);
        setRecipeState(blank); committedValidRecipe.current = blank; setSavedRecipe(undefined); setSavedRevision(undefined); setSavedSnapshot(undefined); setHistoricalSnapshot(undefined); setUnsavedChanges(false);
        setStatusMessage(startup.settingsWarning ?? (options.skipRecovery ? "Opened a blank calculator without restoring the last workspace" : "Local workspace ready"));
      }
      await refreshLibraries();
      setRecoveryReady(true);
    } catch (error) {
      setStartupFailure(classifyStartupError(error));
    } finally {
      setStartupPending(false);
    }
  }, [refreshLibraries, repositories]);
  useEffect(() => {
    if (startupStarted.current) return;
    startupStarted.current = true;
    void Promise.resolve().then(() => initializeWorkspace());
  }, [initializeWorkspace]);
  const exportStartupDiagnostic = async () => {
    try { downloadText(`max-stoich-diagnostic-${new Date().toISOString().slice(0, 10)}.json`, await repositories.exportRawBackup(), "application/json;charset=utf-8"); }
    catch (error) { setStartupFailure(classifyStartupError(error)); }
  };
  const repairStartup = async () => {
    setStartupPending(true);
    try { await repositories.database.open(); await repairRecoveryRecord(repositories); await initializeWorkspace(); }
    catch (error) { setStartupFailure(classifyStartupError(error)); setStartupPending(false); }
  };
  const resetStartupRecovery = async () => {
    setStartupPending(true);
    try { await repositories.database.open(); await repositories.clearRecovery(); await initializeWorkspace({ skipRecovery: true }); }
    catch (error) { setStartupFailure(classifyStartupError(error)); setStartupPending(false); }
  };
  const fullStartupReset = async () => {
    if (!window.confirm("Delete all local MAX Stoich recipes, revisions, snapshots, notes, routes, comparisons, settings, and recovery data on this browser? This cannot be undone unless you exported a backup.")) return;
    setStartupPending(true);
    try { await repositories.deleteDatabase(); await initializeWorkspace({ skipRecovery: true }); }
    catch (error) { setStartupFailure(classifyStartupError(error)); setStartupPending(false); }
  };
  useEffect(() => {
    if (!recoveryReady || weighingSort === userSettings.resultDisplay.weighingSort) return;
    const next = { ...userSettings, resultDisplay: { ...userSettings.resultDisplay, weighingSort } };
    void repositories.saveSettings(next).catch((error) => setStatusMessage(`Sort preference was not saved: ${error instanceof Error ? error.message : "local storage error"}`));
  }, [recoveryReady, repositories, userSettings, weighingSort]);
  useEffect(() => {
    if (currentValid) committedValidRecipe.current = recipe;
    if (!recoveryReady) return;
    const timer = window.setTimeout(() => {
      const active = document.activeElement as HTMLInputElement | HTMLSelectElement | null;
      const invalidDraft = !currentValid && active?.id && "value" in active ? { fieldPath: active.id, value: active.value, message: calculation.errors[0]?.message ?? "Invalid in-progress value" } : undefined;
      void repositories.saveRecovery({
        schemaVersion: LOCAL_SCHEMA_VERSION,
        id: "current",
        committedRecipe: currentValid ? recipe : committedValidRecipe.current,
        ...(invalidDraft ? { invalidDraft } : {}),
        mode,
        activePanel: traceOpen ? "trace" : activePanel,
        inputPanelCollapsed: false,
        ...(savedRecipe ? { baseRecipeId: savedRecipe.id } : {}),
        ...(savedRevision ? { baseRevisionId: savedRevision.id } : {}),
        savedAsRecipe: Boolean(savedRecipe),
        unsavedChanges,
        committedEditSequence: editSequence.current,
        updatedAt: new Date().toISOString(),
      }).catch((error) => setStatusMessage(`Recovery save failed: ${error instanceof Error ? error.message : "unknown error"}`));
    }, 350);
    return () => window.clearTimeout(timer);
  }, [activePanel, calculation.errors, currentValid, mode, recipe, recoveryReady, repositories, savedRecipe, savedRevision, traceOpen, unsavedChanges]);
  const choosePreset = (id: string) => {
    const generic = id.match(/^generic-(211|312|413)$/)?.[1] as "211" | "312" | "413" | undefined;
    const next = id === "blank" ? blankWorkspaceState(userSettings) : generic ? genericCarbideTemplateState(generic, userSettings) : stateFromPreset(id);
    setRecipe(next, id === "blank" ? "new-blank" : "example-copy", id);
    setSavedRecipe(undefined); setSavedRevision(undefined); setSavedSnapshot(undefined); setHistoricalSnapshot(undefined); setDuplicationSource(undefined);
    setStatusMessage(id === "blank" ? "New blank calculation" : generic ? `New ${generic} carbide calculation with local feed defaults` : `Unsaved copy of ${getWorkspacePreset(id).name}`);
    if (recoveryReady) void repositories.saveRecovery({ schemaVersion: LOCAL_SCHEMA_VERSION, id: "current", committedRecipe: next, mode, activePanel: "none", inputPanelCollapsed: false, savedAsRecipe: false, unsavedChanges: true, committedEditSequence: editSequence.current + 1, updatedAt: new Date().toISOString() });
    requestAnimationFrame(() => formulaRef.current?.focus());
  };
  const addPrecursor = () => {
    const id = `precursor-${recipe.precursors.length + 1}`;
    setRecipe({ ...recipe, precursors: [...recipe.precursors, { id, name: "New precursor", formula: "", purityPercent: "100", constraintMode: "solver", fixedValue: "", minimum: "", maximum: "", ratioDenominatorId: "", numeratorRatio: "1", denominatorRatio: "1", molarMassOverride: "", molarMassOverrideSource: "" }], routeOrigin: { kind: "manual" }, routeSource: undefined });
    requestAnimationFrame(() => document.getElementById(`precursor-formula-${id}`)?.focus());
  };
  const removePrecursor = (index: number) => {
    const remaining = recipe.precursors.filter((_, itemIndex) => itemIndex !== index);
    setRecipe({ ...recipe, precursors: remaining, routeOrigin: { kind: "manual" }, routeSource: undefined });
    requestAnimationFrame(() => document.getElementById(`precursor-formula-${remaining[Math.min(index, remaining.length - 1)]?.id}`)?.focus());
  };
  const movePrecursor = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= recipe.precursors.length) return;
    const values = [...recipe.precursors];
    [values[index], values[target]] = [values[target]!, values[index]!];
    setRecipe({ ...recipe, precursors: values, routeOrigin: { kind: "manual" }, routeSource: undefined });
    requestAnimationFrame(() => { const field = document.getElementById(`precursor-formula-${values[target]!.id}`) as HTMLInputElement | null; field?.focus(); field?.select(); });
  };
  const navigatePrecursorFormula = (index: number, direction: -1 | 1) => {
    const target = index + direction; if (target < 0 || target >= recipe.precursors.length) return;
    const field = document.getElementById(`precursor-formula-${recipe.precursors[target]!.id}`) as HTMLInputElement | null;
    field?.focus(); field?.select(); setStatusMessage(`Precursor row ${target + 1} formula selected.`);
  };
  const collectSuggestions = async (): Promise<PrecursorSuggestionResult | undefined> => {
    if (!suggestionTarget) return undefined;
    const registry: RegisteredPrecursorDefinition[] = [...DEFAULT_PRECURSOR_REGISTRY];
    const registeredRoutes: RegisteredPrecursorRoute[] = [];
    for (const route of routes) {
      const revision = await repositories.getRouteRevision(route.currentRevisionId);
      if (!revision?.targetFormula) continue;
      const routeTarget = revision.siteComposition ?? (() => { const parsed = parseFormula(revision.targetFormula!); return parsed.success ? parsed.composition : undefined; })();
      if (!routeTarget) continue;
      const precursorIds = revision.precursors.map((item) => `saved:${route.id}:${item.id}`);
      revision.precursors.forEach((item, index) => registry.push({ schemaVersion: "1.0.0", id: precursorIds[index]!, name: item.name, formula: item.formula, validationStatus: route.validationStatus, ...(item.purityPercent.trim() ? { defaultPurityPercent: item.purityPercent } : {}) }));
      registeredRoutes.push({ id: route.id, name: route.name, target: routeTarget, precursorIds, validationStatus: route.validationStatus, sourceType: "saved-route", sourceRouteRevisionId: revision.id });
    }
    const result = suggestPrecursorRoutes(suggestionTarget, registry, registeredRoutes);
    setSuggestionResult(result);
    return result;
  };
  const showSuggestions = async () => { setSuggestionOpen(true); await collectSuggestions(); requestAnimationFrame(() => document.getElementById("precursor-suggestions")?.focus()); };
  const applySuggestion = (candidate: PrecursorRouteSuggestion) => {
    if (recipe.precursors.length && !window.confirm(`Replace the current ${recipe.precursors.length} precursor${recipe.precursors.length === 1 ? "" : "s"} with ${candidate.name}?`)) return;
    setRecipe({ ...recipe, precursors: candidate.precursors.map(suggestionPrecursor), routeOrigin: { kind: "suggestion-generated", candidateId: candidate.candidateId, ...(candidate.sourceRouteId ? { sourceRouteId: candidate.sourceRouteId } : {}), ...(candidate.sourceRouteRevisionId ? { sourceRouteRevisionId: candidate.sourceRouteRevisionId } : {}), validationStatus: candidate.validationStatus }, routeSource: candidate.sourceRouteId && candidate.sourceRouteRevisionId ? { routeId: candidate.sourceRouteId, routeRevisionId: candidate.sourceRouteRevisionId } : undefined, presetId: "custom" }, "autofill-suggestion", "autofill-suggestion");
    setSuggestionOpen(false); setDismissedCoverageFormula(undefined); setStatusMessage(`Autofilled ${candidate.name}. Review materials and purity before laboratory use.`);
  };
  const autofillBest = async () => { const result = await collectSuggestions() ?? builtInSuggestions; const candidate = result?.suggestions[0]; if (!candidate) { setSuggestionOpen(true); setStatusMessage("No usable registered precursor candidate was found."); return; } applySuggestion(candidate); };
  const clearAllPrecursors = () => {
    if (!recipe.precursors.length || !window.confirm(`Remove all ${recipe.precursors.length} precursor${recipe.precursors.length === 1 ? "" : "s"} from this working calculation?`)) return;
    setRecipe({ ...recipe, precursors: [], routeOrigin: { kind: "manual" }, routeSource: undefined }, "clear-all-precursors", "clear-all-precursors");
    setStatusMessage("Cleared all working precursors. Saved routes and historical revisions were not changed."); requestAnimationFrame(() => suggestRef.current?.focus());
  };
  const updateSiteMultiplicity = (siteIndex: number, multiplicity: string) => {
    if (!recipe.siteComposition) return;
    setRecipe({ ...recipe, siteComposition: { ...recipe.siteComposition, sites: recipe.siteComposition.sites.map((site, index) => index === siteIndex ? { ...site, multiplicity } : site) } });
  };
  const updateSiteFraction = (siteIndex: number, occupantIndex: number, fraction: string) => {
    if (!recipe.siteComposition) return;
    setRecipe({ ...recipe, siteComposition: { ...recipe.siteComposition, sites: recipe.siteComposition.sites.map((site, index) => index === siteIndex ? { ...site, occupants: site.occupants.map((occupant, current) => current === occupantIndex ? { ...occupant, fraction } : occupant) } : site) } });
  };
  const openSaveDialog = () => {
    if (!currentValid) { setStatusMessage("Save unavailable: resolve invalid or infeasible inputs first."); return; }
    setSaveOpen(true);
  };
  const applyPostSaveAction = (action: SaveRecipeDialogValue["action"], source: Readonly<{ recipeId: string; revisionId: string; name: string }>) => {
    if (action === "save") return;
    if (action === "save-and-blank") {
      const next = blankWorkspaceState(userSettings); setRecipe(next, "save-and-blank", "save-and-blank"); setSavedRecipe(undefined); setSavedRevision(undefined); setSavedSnapshot(undefined); setHistoricalSnapshot(undefined); setDuplicationSource(undefined); history.clear(); setHistoryVersion((value) => value + 1);
      setStatusMessage(`Saved ${source.name}. Started a new blank calculation.`); requestAnimationFrame(() => formulaRef.current?.focus()); return;
    }
    const next = { ...structuredClone(recipe), transientId: `copy-${crypto.randomUUID()}`, presetId: "custom" };
    setRecipe(next, "save-and-copy", "save-and-copy"); setSavedRecipe(undefined); setSavedRevision(undefined); setSavedSnapshot(undefined); setHistoricalSnapshot(undefined); setDuplicationSource({ recipeId: source.recipeId, revisionId: source.revisionId, name: source.name }); history.clear(); setHistoryVersion((value) => value + 1);
    setStatusMessage(`Saved ${source.name}. Opened an unsaved scientific copy. Structured experimental notes were not copied.`); requestAnimationFrame(() => formulaRef.current?.focus());
  };
  const saveCurrent = async ({ name, revisionNote, action }: SaveRecipeDialogValue) => {
    if (!currentValid) throw new Error("Resolve invalid or infeasible inputs before saving.");
    if (savedRecipe && !scientificInputChanged) {
      if (name !== savedRecipe.name) await repositories.renameRecipe(savedRecipe.id, name);
      const renamed = await repositories.getRecipe(savedRecipe.id); if (!renamed) throw new Error("The renamed recipe could not be read back from local storage.");
      setSavedRecipe(renamed); setUnsavedChanges(false); await refreshLibraries(); setStatusMessage(name === savedRecipe.name ? "No scientific or metadata changes to save." : `Renamed recipe to ${renamed.name}; revision ${renamed.currentRevisionNumber} was not rewritten.`); applyPostSaveAction(action, { recipeId: renamed.id, revisionId: renamed.currentRevisionId, name: renamed.name }); return;
    }
    try {
      const bundle = await repositories.saveCalculatedRevision({
        ...(savedRecipe ? { recipeId: savedRecipe.id, expectedCurrentRevisionNumber: savedRecipe.currentRevisionNumber } : {}),
        name,
        inputState: recipe,
        result: calculation.result,
        revisionNote,
        ...(duplicationSource ? { duplicatedFromRecipeId: duplicationSource.recipeId, duplicatedFromRevisionId: duplicationSource.revisionId } : {}),
      });
      setSavedRecipe(bundle.recipe);
      setSavedRevision(bundle.revision);
      setSavedSnapshot(bundle.snapshot);
      setHistoricalSnapshot(undefined);
      setDuplicationSource(undefined);
      setUnsavedChanges(false);
      committedValidRecipe.current = recipe;
      await repositories.saveRecovery({ schemaVersion: LOCAL_SCHEMA_VERSION, id: "current", committedRecipe: recipe, mode, activePanel: "none", inputPanelCollapsed: false, baseRecipeId: bundle.recipe.id, baseRevisionId: bundle.revision.id, savedAsRecipe: true, unsavedChanges: false, committedEditSequence: editSequence.current, updatedAt: new Date().toISOString() });
      await refreshLibraries();
      setStatusMessage(`Saved ${bundle.recipe.name}, revision ${bundle.revision.revisionNumber}`);
      applyPostSaveAction(action, { recipeId: bundle.recipe.id, revisionId: bundle.revision.id, name: bundle.recipe.name });
    } catch (error) { setStatusMessage(`Save failed: ${error instanceof Error ? error.message : "unknown error"}`); throw error; }
  };
  const openNotes = async (item: SavedRecipe, trigger: HTMLElement) => { notesTriggerRef.current = trigger; setNotesRecipe(item); setNotesRevisions(await repositories.listRevisions(item.id)); setNotesOpen(true); };
  const newRecipe = () => {
    const next = blankWorkspaceState(userSettings);
    setRecipe(next, "new-recipe", "new-recipe");
    setSavedRecipe(undefined); setSavedRevision(undefined); setSavedSnapshot(undefined); setDuplicationSource(undefined);
    history.clear(); setHistoryVersion((value) => value + 1);
    setStatusMessage("New blank calculation");
    if (recoveryReady) void repositories.saveRecovery({ schemaVersion: LOCAL_SCHEMA_VERSION, id: "current", committedRecipe: next, mode, activePanel: "none", inputPanelCollapsed: false, savedAsRecipe: false, unsavedChanges: true, committedEditSequence: editSequence.current + 1, updatedAt: new Date().toISOString() });
    requestAnimationFrame(() => formulaRef.current?.focus());
  };
  const openRecipe = async (item: SavedRecipe, revisionId = item.currentRevisionId) => {
    const revision = await repositories.getRevision(revisionId);
    if (!revision) { setStatusMessage("The selected revision is missing."); return; }
    const snapshot = await repositories.getSnapshot(revision.snapshotId);
    if (!snapshot) { setStatusMessage("The selected immutable snapshot is missing."); return; }
    const integrity = await repositories.verifySnapshot(snapshot);
    if (!integrity.valid) { setStatusMessage(`Snapshot blocked: ${integrity.diagnostics[0]?.message}`); return; }
    const migratedInput = migrateWorkspaceAluminumInput(structuredClone(revision.inputState));
    setRecipeState(migratedInput);
    committedValidRecipe.current = migratedInput;
    setSavedRecipe(item); setSavedRevision(revision); setSavedSnapshot(snapshot); setHistoricalSnapshot(snapshot);
    setUnsavedChanges(false); setDuplicationSource(undefined); history.clear(); setHistoryVersion((value) => value + 1);
    setActivePanel("none");
    setStatusMessage(revision.id === item.currentRevisionId ? `Opened saved revision ${revision.revisionNumber}` : `Viewing historical revision ${revision.revisionNumber} exactly as stored`);
  };
  const duplicateCurrent = () => {
    const next = { ...structuredClone(recipe), transientId: `duplicate-${recipe.transientId}`, presetId: "custom" };
    if (savedRecipe && savedRevision) setDuplicationSource({ recipeId: savedRecipe.id, revisionId: savedRevision.id, name: savedRecipe.name });
    setRecipe(next, "duplicate", "duplicate");
    setSavedRecipe(undefined); setSavedRevision(undefined); setSavedSnapshot(undefined);
    setStatusMessage(`Unsaved copy of ${savedRecipe?.name ?? recipe.targetFormula}`);
    requestAnimationFrame(() => formulaRef.current?.focus());
  };
  const duplicateSaved = async (item: SavedRecipe, revisionId = item.currentRevisionId) => {
    try {
      const duplicate = await repositories.duplicateRecipe(item.id, revisionId);
      setRecipeState({ ...migrateWorkspaceAluminumInput(duplicate.inputState), transientId: `duplicate-${recipe.transientId}`, presetId: "custom" });
      setSavedRecipe(undefined); setSavedRevision(undefined); setSavedSnapshot(undefined); setHistoricalSnapshot(undefined);
      setDuplicationSource({ recipeId: duplicate.sourceRecipeId, revisionId: duplicate.sourceRevisionId, name: item.name });
      setUnsavedChanges(true); history.clear(); setHistoryVersion((value) => value + 1); setActivePanel("none");
      setStatusMessage(`${duplicate.name} is an unsaved working recipe`);
      requestAnimationFrame(() => formulaRef.current?.focus());
    } catch (error) { setStatusMessage(`Duplicate failed: ${error instanceof Error ? error.message : "unknown error"}`); }
  };
  const undo = () => {
    if (!history.canUndo) return;
    setRecipeState(history.undo(recipe)); setHistoricalSnapshot(undefined); setUnsavedChanges(true); setHistoryVersion((value) => value + 1); editSequence.current += 1;
  };
  const redo = () => {
    if (!history.canRedo) return;
    setRecipeState(history.redo(recipe)); setHistoricalSnapshot(undefined); setUnsavedChanges(true); setHistoryVersion((value) => value + 1); editSequence.current += 1;
  };
  const saveRoute = async () => {
    try {
      const saved = await repositories.saveRouteRevision({ name: `${recipe.targetFormula} precursor route`, inputState: recipe });
      await refreshLibraries(); setStatusMessage(`Saved route ${saved.route.name}, revision 1`); setActivePanel("routes");
    } catch (error) { setStatusMessage(`Route save failed: ${error instanceof Error ? error.message : "unknown error"}`); }
  };
  const applyRoute = async (route: SavedRoute) => {
    const revision = await repositories.getRouteRevision(route.currentRevisionId);
    if (!revision) { setStatusMessage("Route revision is missing."); return; }
    setRecipe(migrateWorkspaceAluminumInput({ ...recipe, precursors: structuredClone(revision.precursors), ...revision.defaults, routeSource: { routeId: route.id, routeRevisionId: revision.id }, routeOrigin: { kind: "loaded" as const, sourceRouteId: route.id, sourceRouteRevisionId: revision.id, validationStatus: route.validationStatus }, presetId: "custom" }), "apply-route", "apply-route");
    setActivePanel("none"); setStatusMessage(`Applied ${route.name} revision ${revision.revisionNumber}; the saved route was not changed.`);
  };
  const updateXCoefficient = (value: string) => {
    setXCoefficientDraft(value);
    const replaced = replaceMaxXCoefficient(recipe.targetFormula, value);
    if (!replaced.success) { setXCoefficientError(replaced.errors[0]?.message ?? "Enter a positive decimal coefficient."); return; }
    setXCoefficientError(undefined);
    const normalized = recipe.normalizeLeadingSiteRatios ? normalizeLeadingSiteRatioGroup(replaced.formula, { enabled: true, expectedSite: "M" }) : undefined;
    setRecipe({ ...recipe, targetFormula: replaced.formula, siteComposition: normalized?.success ? normalized.value.explicitSiteModel : undefined, radiusDescriptorConfig: undefined }, "x-per-formula", "x-per-formula");
  };
  const duplicateRoute = async (route: SavedRoute) => {
    const revision = await repositories.getRouteRevision(route.currentRevisionId);
    if (!revision) { setStatusMessage("Route revision is missing."); return; }
    await repositories.saveRouteRevision({ name: `Copy of ${route.name}`, inputState: { ...recipe, precursors: revision.precursors, ...revision.defaults } });
    await refreshLibraries(); setStatusMessage(`Created an independent copy of ${route.name}`);
  };
  const exportRoute = async (route: SavedRoute) => { const revisions = await repositories.listRouteRevisions(route.id); const envelope = await createOwnedRecordExport("max-stoich-saved-route", { route, revisions }); downloadText(safeExportFilename(route.name, "json"), JSON.stringify(envelope, null, 2), "application/json;charset=utf-8"); setStatusMessage(`Exported ${route.name} as a digest-protected route record.`); };
  const exportContext = () => {
    if (!displayed) return undefined;
    return { recipeName: savedRecipe?.name ?? `${recipe.targetFormula} unsaved calculation`, recipe: savedRecipe, revision: savedRevision, snapshot: historicalSnapshot ?? savedSnapshot, inputState: savedRevision && historicalSnapshot ? savedRevision.inputState : recipe, result: displayed, calculatedAt: (historicalSnapshot ?? savedSnapshot)?.createdAt ?? new Date().toISOString(), displaySort: { selected: weighingSort, precursorIds: sortedPrecursors.map((item) => item.precursorId) } };
  };
  const copyWeighingTable = async () => {
    if ((!currentValid && !historicalSnapshot) || !displayed) { setStatusMessage("Copy unavailable for stale or invalid results."); return; }
    try { await navigator.clipboard.writeText(buildWeighingTableTsv(exportContext()!)); setStatusMessage("Weighing table copied"); }
    catch { setStatusMessage("Clipboard permission was denied."); }
  };
  const exportFile = (kind: "csv" | "json") => {
    if ((!currentValid && !historicalSnapshot) || !displayed) { setStatusMessage("Export unavailable for stale or invalid results."); return; }
    const context = exportContext()!;
    const content = kind === "csv" ? buildLaboratoryCsv(context) : buildLaboratoryJson(context);
    downloadText(safeExportFilename(context.recipeName, kind), content, kind === "csv" ? "text/csv;charset=utf-8" : "application/json;charset=utf-8");
    setStatusMessage(`Exported ${kind.toUpperCase()} record`);
  };
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const modifier = event.ctrlKey || event.metaKey;
      if (event.altKey && event.key === "1") { event.preventDefault(); formulaRef.current?.focus(); formulaRef.current?.select(); }
      if (event.altKey && event.key === "2") { event.preventDefault(); document.getElementById(`precursor-formula-${recipe.precursors[0]?.id}`)?.focus(); }
      if (event.altKey && event.key === "3") { event.preventDefault(); batchRef.current?.focus(); batchRef.current?.select(); }
      if (event.altKey && event.key === "4") { event.preventDefault(); resultsRef.current?.focus(); }
      if (modifier && event.altKey && event.key.toLowerCase() === "a") { event.preventDefault(); setMode((value) => value === "standard" ? "advanced" : "standard"); }
      if (modifier && !event.altKey && event.key.toLowerCase() === "k") { event.preventDefault(); setCommandOpen(true); }
      if (modifier && !event.altKey && event.key.toLowerCase() === "s") { event.preventDefault(); openSaveDialog(); }
      if (modifier && event.altKey && event.key.toLowerCase() === "n") { event.preventDefault(); newRecipe(); }
      if (modifier && event.altKey && event.key.toLowerCase() === "d") { event.preventDefault(); duplicateCurrent(); }
      if (modifier && event.altKey && event.key.toLowerCase() === "c") { event.preventDefault(); void copyWeighingTable(); }
      if (modifier && !event.altKey && event.key.toLowerCase() === "z") { event.preventDefault(); if (event.shiftKey) redo(); else undo(); }
      if (event.ctrlKey && !event.altKey && event.key.toLowerCase() === "y") { event.preventDefault(); redo(); }
      if (event.key === "Escape") { setCommandOpen(false); setTraceOpen(false); setActivePanel("none"); }
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  });
  const primaryNavigation = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Enter" || event.ctrlKey || event.altKey) return;
    const fields = [...document.querySelectorAll<HTMLElement>("[data-primary-field]")].filter((item) => !item.hasAttribute("disabled"));
    const index = fields.indexOf(event.currentTarget);
    if (index < 0) return;
    event.preventDefault();
    fields[index + (event.shiftKey ? -1 : 1)]?.focus();
  };

  const currentIdentity = savedRecipe?.name ?? (activePreset ? activePreset.name : recipe.targetFormula || "Untitled calculation");
  const identityStatus = historicalSnapshot ? `Revision ${savedRevision?.revisionNumber ?? "—"} · historical` : savedRecipe ? `Revision ${savedRevision?.revisionNumber ?? 1} · ${unsavedChanges ? "unsaved changes" : "saved"}` : activePreset ? `Unsaved copy of ${activePreset.name}` : "Unsaved";
  const summaryInputState = savedRevision && historicalSnapshot ? savedRevision.inputState : recipe;
  const weighingSummary = displayed && (currentValid || Boolean(historicalSnapshot)) ? buildWeighingSummary({ title: currentIdentity, sourceStatus: identityStatus, inputState: summaryInputState, result: displayed, orderedPrecursorIds: sortedPrecursors.map((item) => item.precursorId), validationStatus: savedRecipe?.validationStatus ?? activePreset?.validationStatus, isHistorical: Boolean(historicalSnapshot), isStale: stale, atomicRadiusDatasetId: userSettings.resultDisplay.atomicRadiusDatasetId }) : undefined;
  const calculationVerification = displayed && (currentValid || Boolean(historicalSnapshot)) ? buildCalculationVerification({ title: currentIdentity, inputState: summaryInputState, result: displayed, stale }) : undefined;
  const printCurrent = () => {
    if (!weighingSummary) { setStatusMessage("Print unavailable: the current calculation is invalid or stale. Open a valid historical snapshot or correct the inputs."); return; }
    try { launchPrintJob(createPrintJob({ kind: "recipe", title: currentIdentity, singleRecipeDetailed: true, settings: userSettings.print, entries: [{ id: savedRevision?.id ?? recipe.transientId, summary: weighingSummary }] })); setStatusMessage("Opened the dedicated preparation-sheet print view."); }
    catch (error) { setStatusMessage(`Print unavailable: ${error instanceof Error ? error.message : "print state could not be created"}`); }
  };
  const printSelectedRecipes = async () => {
    if (!selectedPrintRecipeIds.length) { setStatusMessage("Select at least one saved recipe to print."); return; }
    const entries = await Promise.all(selectedPrintRecipeIds.map(async (recipeId) => {
      const item = recipes.find((candidate) => candidate.id === recipeId);
      if (!item) return { id: recipeId, unavailable: { title: "Missing saved recipe", sourceStatus: "local library", reason: "The selected recipe is no longer available.", validationStatus: "unavailable" } } as const;
      const revision = await repositories.getRevision(item.currentRevisionId), snapshot = revision ? await repositories.getSnapshot(revision.snapshotId) : undefined;
      if (!revision || !snapshot) return { id: recipeId, unavailable: { title: item.name, sourceStatus: `Revision ${item.currentRevisionNumber}`, reason: "The immutable revision or calculation snapshot is missing.", validationStatus: item.validationStatus } } as const;
      return { id: recipeId, summary: buildWeighingSummary({ title: item.name, sourceStatus: `Saved recipe revision ${revision.revisionNumber}`, inputState: revision.inputState, result: snapshot.result, validationStatus: item.validationStatus, isHistorical: true, atomicRadiusDatasetId: userSettings.resultDisplay.atomicRadiusDatasetId }) } as const;
    }));
    try { launchPrintJob(createPrintJob({ kind: "library", title: "Selected saved recipes", singleRecipeDetailed: false, settings: userSettings.print, entries })); setStatusMessage(`Opened ${entries.length} selected saved recipe${entries.length === 1 ? "" : "s"} in library order.`); }
    catch (error) { setStatusMessage(`Print unavailable: ${error instanceof Error ? error.message : "print state could not be created"}`); }
  };
  const renderResultCell = (field: WeighingResultField, item: BatchCalculationResult["precursors"][number], formula: string | undefined) => {
    const status = precursorStatus(displayed!, item.precursorId); const radius = elementalRadius(formula); const numeric = "p-2 text-right font-mono";
    switch (field) {
      case "precursor-name": return <th className="p-2 text-left font-medium" key={field}>{item.displayName}</th>;
      case "formula": return <td className="p-2 text-left font-mono" key={field}>{formula ?? "—"}</td>;
      case "purity": return <td className={numeric} key={field}>{formatPercent(item.purity)}</td>;
      case "solver-molar-ratio": return <td className={numeric} key={field} title={item.solverMolesPerTargetFormulaMole}>{formatDescriptor(item.solverMolesPerTargetFormulaMole)}</td>;
      case "final-intended-molar-ratio": { const ratio = new ChemistryDecimal(item.postSolverAdjustedMoles).dividedBy(displayed!.batch.targetFormulaMoles).toString(); return <td className={numeric} key={field} title={ratio}>{formatDescriptor(ratio)}</td>; }
      case "batch-scaled-moles": return <td className={numeric} key={field}>{formatMoles(item.nominalScaledMoles)}</td>;
      case "molar-mass": return <td className={numeric} key={field}>{formatDescriptor(item.molarMassGramsPerMole, " g/mol")}</td>;
      case "pure-required-mass": return <td className={numeric} key={field}>{formatDescriptor(item.pureRequiredMassGrams, " g")}</td>;
      case "pre-round-mass": return <td className={numeric} key={field}>{formatDescriptor(item.preRoundGrossWeighingMassGrams, " g")}</td>;
      case "final-mass": return <td className="p-2 text-right" key={field}><span className="select-text whitespace-nowrap font-mono text-xl font-bold tabular-nums" title={`Exact stored value: ${item.finalRoundedGrossWeighingMassGrams} g`}>{formatMassForBalance(item.finalRoundedGrossWeighingMassGrams, recipe.balanceIncrementGrams)} g</span></td>;
      case "realized-moles": return <td className={numeric} key={field}>{formatMoles(item.realizedPrecursorMoles)}</td>;
      case "status": return <td className="p-2 text-left text-xs font-medium" key={field}>{status}</td>;
      case "warning": return <td className="p-2 text-left text-xs" key={field}>{status === "Ready" || status === "OK" ? "None" : "Review"}</td>;
      case "atomic-radius": return <td className="p-2 text-left text-xs" key={field} title={radius && resultRadiusDataset ? `${resultRadiusDataset.name} · ${resultRadiusDataset.datasetVersion} · ${resultRadiusDataset.source.primarySource}` : undefined}>{radius === null ? "Not applicable" : radius ? `${radius.record.radiusPm} pm · ${resultRadiusDataset!.definition}${radius.record.coordinationNumber ? ` ${radius.record.coordinationNumber}` : ""}` : "No value"}</td>;
      case "atomic-radius-source": return <td className="p-2 text-left text-xs" key={field}>{radius === null ? "Not applicable" : radius && resultRadiusDataset ? `${resultRadiusDataset.name} · ${resultRadiusDataset.definition} · ${resultRadiusDataset.datasetVersion}` : "No usable dataset"}</td>;
      case "source": return <td className="p-2 text-left text-xs" key={field}>{recipe.routeOrigin?.kind.replaceAll("-", " ") ?? "manual"}</td>;
    }
  };
  const xFeedHelper = xComponent.success ? (() => {
    try {
      const current = new ChemistryDecimal(xCoefficientDraft ?? xComponent.value.enteredCoefficientText);
      const ideal = new ChemistryDecimal(xComponent.value.idealCoefficient.canonical);
      const relative = current.minus(ideal).dividedBy(ideal);
      const elementName = xComponent.value.element === "C" ? "carbon" : "nitrogen";
      const state = relative.isZero() ? `Stoichiometric ${elementName}` : relative.isNegative() ? `${formatPercent(relative.abs().toString(), 4)} below ideal ${elementName}` : `${formatPercent(relative.toString(), 4)} excess ${elementName}`;
      return `Ideal ${xComponent.value.template} value: ${xComponent.value.idealCoefficient.canonical} · ${state}`;
    } catch { return undefined; }
  })() : undefined;

  if (startupFailure) return <StartupRecoveryScreen failure={startupFailure} pending={startupPending} onExport={() => void exportStartupDiagnostic()} onFullReset={() => void fullStartupReset()} onOpenBlank={() => void initializeWorkspace({ skipRecovery: true })} onRepair={() => void repairStartup()} onResetRecovery={() => void resetStartupRecovery()} onRetry={() => void initializeWorkspace()} />;
  if (startupPending && !recoveryReady) return <main className="min-h-screen bg-slate-100 p-8 text-slate-950"><p className="font-semibold">Opening local workspace…</p></main>;
  return <main className="min-h-screen bg-slate-100 text-slate-950" onKeyDown={primaryNavigation}>
    <header className="sticky top-0 z-20 flex min-h-16 flex-nowrap items-center gap-2 border-b border-slate-300 bg-white px-3 py-2 shadow-sm" data-testid="primary-command-bar">
      <Link aria-label="MAX Stoich calculator" className="shrink-0 text-base font-bold tracking-tight text-slate-950 sm:text-lg" href="/"><SiteBrand /></Link>
      <div className="min-w-0 flex-1 border-l border-slate-300 pl-3">
        <p className="truncate text-sm font-semibold" title={currentIdentity}>{currentIdentity}</p>
        <p aria-live="polite" className="truncate text-xs text-slate-600" data-recovery-ready={recoveryReady}>{identityStatus} · {statusMessage}</p>
      </div>
      <button className="min-h-10 shrink-0 rounded-md border border-slate-400 px-3 text-sm font-medium hover:bg-slate-100" onClick={newRecipe}>New</button>
      <button className="hidden min-h-10 shrink-0 rounded-md border border-slate-400 px-3 text-sm font-medium hover:bg-slate-100 sm:block" onClick={(event) => { panelTriggerRef.current = event.currentTarget; setCommandOpen(false); setActivePanel((current) => current === "recipes" ? "none" : "recipes"); void refreshLibraries(); }}>Open</button>
      <div aria-label="Interaction mode" className="hidden min-h-10 shrink-0 rounded-md border border-slate-400 p-0.5 sm:flex">
        <button aria-pressed={mode === "standard"} className={`rounded px-2 text-sm font-medium ${mode === "standard" ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`} onClick={() => setMode("standard")}>Standard</button>
        <button aria-pressed={mode === "advanced"} className={`rounded px-2 text-sm font-medium ${mode === "advanced" ? "bg-slate-900 text-white" : "hover:bg-slate-100"}`} onClick={() => setMode("advanced")}>Advanced</button>
      </div>
      <button className="min-h-10 shrink-0 rounded-md bg-teal-900 px-3 text-sm font-semibold text-white disabled:bg-slate-600" disabled={!currentValid} onClick={openSaveDialog} ref={saveButtonRef}>Save</button>
      <div className="hidden shrink-0 md:flex"><button aria-label="Undo" className="min-h-10 rounded-l-md border px-2 disabled:text-slate-400" disabled={!canUndo} onClick={undo}>↶</button><button aria-label="Redo" className="min-h-10 rounded-r-md border border-l-0 px-2 disabled:text-slate-400" disabled={!canRedo} onClick={redo}>↷</button></div>
      <Link className="hidden min-h-10 shrink-0 rounded-md border px-3 py-2 text-sm font-medium lg:block" href="/compare">Compare</Link>
      <Link className="min-h-10 shrink-0 rounded-md border px-3 py-2 text-sm font-medium" href="/settings">Settings</Link>
      <button aria-expanded={commandOpen} aria-label="More actions and commands" className="min-h-10 shrink-0 rounded-md border border-slate-400 px-3 text-sm font-medium hover:bg-slate-100" onClick={() => { setActivePanel("none"); setCommandOpen((current) => !current); }} ref={moreButtonRef}>More <span aria-hidden="true">•••</span></button>
    </header>

    {commandOpen && <section aria-label="More actions" className="fixed right-3 top-16 z-30 max-h-[82vh] w-[min(22rem,calc(100vw-1.5rem))] overflow-auto rounded-lg border border-slate-400 bg-white p-4 shadow-xl" ref={commandLayerRef}><div className="flex items-center justify-between"><h2 className="font-semibold">More actions</h2><button aria-label="Close more actions" className="min-h-8 min-w-8 rounded border" onClick={() => setCommandOpen(false)}>×</button></div><div className="mt-3 grid gap-2">
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor="template-picker">Start or reset<select className="mt-1 min-h-10 w-full rounded border border-slate-400 bg-white px-2 text-sm font-normal normal-case tracking-normal" id="template-picker" onChange={(event) => { choosePreset(event.target.value); setCommandOpen(false); }} value=""><option disabled value="">Choose…</option><option value="blank">New blank calculation</option><optgroup label="New carbide templates"><option value="generic-211">New 211 carbide</option><option value="generic-312">New 312 carbide</option><option value="generic-413">New 413 carbide</option></optgroup><optgroup label="Built-in examples">{WORKSPACE_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup></select></label>
      <label className="text-xs font-semibold uppercase tracking-wide text-slate-600" htmlFor="layout-picker">Workspace layout<select aria-label="Workspace layout" className="mt-1 min-h-10 w-full rounded border border-slate-400 bg-white px-2 text-sm font-normal normal-case tracking-normal" id="layout-picker" onChange={(event) => { const selected = layouts.find((item) => item.id === event.target.value); if (!selected) return; if (selected.kind === "route-comparison") { window.location.href = "/compare"; return; } setActiveLayout(selected); setMode(selected.kind === "advanced-calculator" ? "advanced" : "standard"); setCommandOpen(false); }} value={activeLayout?.id ?? ""}><optgroup label="Built-in layouts">{layouts.filter((item) => item.builtIn).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>{layouts.some((item) => !item.builtIn) && <optgroup label="My layouts">{layouts.filter((item) => !item.builtIn).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>}</select></label>
      <div className="flex rounded border p-1 sm:hidden"><button className={`flex-1 rounded p-2 text-sm ${mode === "standard" ? "bg-slate-900 text-white" : ""}`} onClick={() => setMode("standard")}>Standard</button><button className={`flex-1 rounded p-2 text-sm ${mode === "advanced" ? "bg-slate-900 text-white" : ""}`} onClick={() => setMode("advanced")}>Advanced</button></div>
      <button className="rounded border p-2 text-left" onClick={() => { newRecipe(); setCommandOpen(false); }}>New recipe <span className="text-xs">Ctrl+Alt+N</span></button>
      <button className="rounded border p-2 text-left disabled:text-slate-400" disabled={!currentValid} onClick={() => { openSaveDialog(); setCommandOpen(false); }}>Save recipe or revision <span className="text-xs">Ctrl+S</span></button>
      <button className="rounded border p-2 text-left" onClick={() => { duplicateCurrent(); setCommandOpen(false); }}>Duplicate <span className="text-xs">Ctrl+Alt+D</span></button>
      <button className="rounded border p-2 text-left disabled:text-slate-400" disabled={!canUndo} onClick={() => { undo(); setCommandOpen(false); }}>Undo</button><button className="rounded border p-2 text-left disabled:text-slate-400" disabled={!canRedo} onClick={() => { redo(); setCommandOpen(false); }}>Redo</button>
      <button className="rounded border p-2 text-left" onClick={(event) => { panelTriggerRef.current = moreButtonRef.current ?? event.currentTarget; setActivePanel("recipes"); setCommandOpen(false); void refreshLibraries(); }}>Open recipe library</button>
      <button className="rounded border p-2 text-left" onClick={(event) => { panelTriggerRef.current = moreButtonRef.current ?? event.currentTarget; setActivePanel("routes"); setCommandOpen(false); void refreshLibraries(); }}>Apply or save route</button>
      {savedRecipe && <button className="rounded border p-2 text-left" onClick={(event) => { void openNotes(savedRecipe, event.currentTarget); setCommandOpen(false); }}>Recipe notes</button>}
      <button className="rounded border p-2 text-left disabled:text-slate-400" disabled={(!currentValid && !historicalSnapshot) || !displayed} onClick={() => { void copyWeighingTable(); setCommandOpen(false); }}>Copy weighing table <span className="text-xs">Ctrl+Alt+C</span></button>
      <button className="rounded border p-2 text-left disabled:text-slate-400" disabled={(!currentValid && !historicalSnapshot) || !displayed} onClick={() => { exportFile("csv"); setCommandOpen(false); }}>Export CSV</button>
      <button className="rounded border p-2 text-left disabled:text-slate-400" disabled={(!currentValid && !historicalSnapshot) || !displayed} onClick={() => { exportFile("json"); setCommandOpen(false); }}>Export JSON</button>
      <button className="rounded border p-2 text-left disabled:text-slate-400" disabled={!weighingSummary} onClick={() => { printCurrent(); setCommandOpen(false); }}>Print preparation sheet</button>
      <Link className="rounded border p-2 text-left" href="/compare">Open route comparison</Link><Link className="rounded border p-2 text-left" href="/settings">Layouts, data, backup, and settings</Link><Link className="rounded border p-2 text-left" href="/demo">Feature demo and tutorial <span className="block text-xs text-slate-600">Development reference</span></Link><button className="rounded border p-2 text-left" onClick={() => { setTraceOpen(true); setCommandOpen(false); }}>Open calculation trace</button>{activePreset && <button className="rounded border p-2 text-left" onClick={() => { choosePreset(activePreset.id); setCommandOpen(false); }}>Reset copied example</button>}
    </div></section>}

    {activePanel !== "none" && <aside aria-label={activePanel === "recipes" ? "Saved recipe library" : activePanel === "routes" ? "Saved route library" : "Recipe revision history"} className="fixed inset-y-14 right-0 z-20 w-full max-w-md overflow-auto border-l border-slate-400 bg-white p-4 shadow-xl print:hidden" ref={panelLayerRef}>
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{activePanel === "recipes" ? "Local recipes" : activePanel === "routes" ? "Precursor routes" : `Revision history · ${savedRecipe?.name ?? "recipe"}`}</h2><button aria-label="Close library" className="min-h-9 min-w-9 rounded border" onClick={() => setActivePanel("none")}>×</button></div>
      {activePanel !== "revisions" && <input aria-label="Search local library" className="mt-3 min-h-10 w-full rounded border px-3" onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Search name, formula, or status" value={librarySearch} />}
      {activePanel === "recipes" && recipes.length > 0 && <section aria-label="Print selected recipes" className="mt-3 rounded border bg-slate-50 p-3"><label className="text-sm font-semibold">Recipes to print<select aria-label="Recipes to print" className="mt-1 min-h-24 w-full rounded border bg-white p-2 text-sm" multiple onChange={(event) => setSelectedPrintRecipeIds(Array.from(event.currentTarget.selectedOptions, (option) => option.value))} value={[...selectedPrintRecipeIds]}>{recipes.map((item) => <option key={item.id} value={item.id}>{item.name} · revision {item.currentRevisionNumber}</option>)}</select></label><p className="mt-1 text-xs">Use Ctrl or Command to select multiple recipes. The configured 2/4/6-up layout is applied in this visible list order.</p><button className="mt-2 w-full rounded border border-slate-500 px-3 py-2 font-semibold disabled:text-slate-400" disabled={!selectedPrintRecipeIds.length} onClick={() => void printSelectedRecipes()}>Print selected recipes</button></section>}
      {activePanel === "recipes" && <div className="mt-4 space-y-3">{recipes.filter((item) => { const notes = libraryNotes.filter((note) => note.recipeId === item.id); return `${item.name} ${item.targetFormula} ${item.validationStatus} ${notes.map((note) => `${note.title} ${note.body} ${note.category} ${note.tags.join(" ")}`).join(" ")}`.toLowerCase().includes(librarySearch.toLowerCase()); }).map((item) => { const noteMatches = libraryNotes.filter((note) => note.recipeId === item.id && (!librarySearch || `${note.title} ${note.body} ${note.category} ${note.tags.join(" ")}`.toLowerCase().includes(librarySearch.toLowerCase()))); return <article className="rounded border p-3" key={item.id}><div className="flex items-start justify-between gap-2"><div><input aria-label={`Recipe name for ${item.targetFormula}`} className="w-full rounded border px-1 font-semibold" defaultValue={item.name} onBlur={(event) => { if (event.target.value !== item.name) void repositories.renameRecipe(item.id, event.target.value).then(refreshLibraries); }} /><p className="mt-1 font-mono text-sm">{item.targetFormula}</p><p className="text-xs">Revision {item.currentRevisionNumber} · {item.validationStatus} · {new Date(item.updatedAt).toLocaleString()}</p><p className="text-xs">{noteMatches.length} matching note{noteMatches.length === 1 ? "" : "s"}</p></div><button className="rounded bg-teal-800 px-3 py-2 text-sm text-white" onClick={() => void openRecipe(item)}>Open</button></div><div className="mt-3 flex flex-wrap gap-2"><button className="rounded border px-2 py-1 text-sm" onClick={() => void duplicateSaved(item)}>Duplicate</button><button className="rounded border px-2 py-1 text-sm" onClick={(event) => void openNotes(item, event.currentTarget)}>Notes</button><button className="rounded border px-2 py-1 text-sm" onClick={() => void repositories.listRevisions(item.id).then((values) => { setSavedRecipe(item); setRevisions([...values].sort((a, b) => b.revisionNumber - a.revisionNumber)); setActivePanel("revisions"); })}>History</button><button className="rounded border px-2 py-1 text-sm" onClick={() => void repositories.setRecipeArchived(item.id, true).then(refreshLibraries)}>Archive</button><button className="rounded border border-red-300 px-2 py-1 text-sm text-red-800" onClick={() => { if (window.confirm(`Permanently delete ${item.name} and every revision, snapshot, and note? This cannot be undone.`)) void repositories.deleteRecipePermanently(item.id).then(refreshLibraries); }}>Delete…</button></div></article>; })}{recipes.length === 0 && <p className="text-sm text-slate-600">No saved recipes yet. Save the current valid calculation to create revision 1.</p>}</div>}
      {activePanel === "routes" && <div className="mt-4"><button className="w-full rounded bg-teal-800 p-2 font-semibold text-white" onClick={() => void saveRoute()}>Save current precursor setup as route</button><div className="mt-3 space-y-3">{routes.filter((item) => `${item.name} ${item.validationStatus}`.toLowerCase().includes(librarySearch.toLowerCase())).map((item) => <article className="rounded border p-3" key={item.id}><h3 className="font-semibold">{item.name}</h3><p className="text-xs">Revision {item.currentRevisionNumber} · {item.validationStatus}</p><div className="mt-2 flex flex-wrap gap-2"><button className="rounded bg-teal-800 px-3 py-1 text-sm text-white" onClick={() => void applyRoute(item)}>Apply copy</button><button className="rounded border px-2 py-1 text-sm" onClick={() => void duplicateRoute(item)}>Duplicate</button><button className="rounded border px-2 py-1 text-sm" onClick={() => void exportRoute(item)}>Export JSON</button><button className="rounded border px-2 py-1 text-sm" onClick={() => void repositories.saveRouteRevision({ routeId: item.id, expectedCurrentRevisionNumber: item.currentRevisionNumber, name: item.name, inputState: recipe }).then(async (saved) => { await refreshLibraries(); setStatusMessage(`Saved ${saved.route.name} route revision ${saved.revision.revisionNumber}`); })}>Update from current</button><button className="rounded border px-2 py-1 text-sm" onClick={() => void repositories.listRouteRevisions(item.id).then((values) => { setRouteRevisions([...values].sort((a, b) => b.revisionNumber - a.revisionNumber)); setStatusMessage(`${item.name} has ${values.length} immutable route revision(s).`); })}>View revisions</button><button className="rounded border px-2 py-1 text-sm" onClick={() => void repositories.setRouteArchived(item.id, true).then(refreshLibraries)}>Archive</button></div>{routeRevisions.some((revision) => revision.routeId === item.id) && <ol className="mt-2 border-t pt-2 text-xs">{routeRevisions.filter((revision) => revision.routeId === item.id).map((revision) => <li key={revision.id}>Revision {revision.revisionNumber} · {new Date(revision.createdAt).toLocaleString()} · digest {revision.canonicalDigest.slice(0, 12)}…</li>)}</ol>}</article>)}</div></div>}
      {activePanel === "revisions" && <div className="mt-4 space-y-3">{revisions.map((revision) => <article className="rounded border p-3" key={revision.id}><h3 className="font-semibold">Revision {revision.revisionNumber}</h3><p className="text-xs">{new Date(revision.createdAt).toLocaleString()} · engine {revision.engineVersion}</p><p className="mt-1 text-sm">{revision.revisionNote || "No revision note"}</p><div className="mt-2 flex gap-2"><button className="rounded bg-teal-800 px-3 py-1 text-sm text-white" onClick={() => savedRecipe && void openRecipe(savedRecipe, revision.id)}>Open snapshot</button><button className="rounded border px-3 py-1 text-sm" onClick={() => savedRecipe && void duplicateSaved(savedRecipe, revision.id)}>Duplicate from revision</button></div></article>)}</div>}
    </aside>}

    <div className={`mx-auto grid max-w-[1500px] gap-4 ${activeLayout?.density === "compact" ? "p-2 xl:grid-cols-[minmax(0,1fr)_20rem]" : "p-4 xl:grid-cols-[var(--workspace-input)_minmax(0,1fr)]"}`} data-layout={activeLayout?.id ?? "builtin-simple-calculator"} style={{ "--workspace-input": `${activeLayout?.inputWidthPercent ?? 40}%` } as CSSProperties}>
      <section aria-labelledby="inputs-heading" className={`rounded-lg border border-slate-300 bg-white p-4 shadow-sm ${activeLayout?.id === "builtin-compact-balance" ? "xl:order-2" : ""}`}>
        <h1 id="inputs-heading" className="text-lg font-semibold">Target and precursor route</h1>
        <p className="mt-1 text-xs text-slate-600">{activePreset ? `You are editing an unsaved copy; ${activePreset.name} remains unchanged. ` : ""}{validationNote}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <label className="block text-sm font-medium" htmlFor="target-formula">Target formula<input aria-describedby={recipe.targetFormula.trim() !== "" && calculation.errors.some((item) => item.fieldPath === "targetFormula") ? "formula-error" : undefined} className="mt-1 min-h-11 w-full rounded-md border border-slate-400 px-3 font-mono outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-200" data-primary-field id="target-formula" onChange={(event) => { const targetFormula = event.target.value; const normalized = recipe.normalizeLeadingSiteRatios ? normalizeLeadingSiteRatioGroup(targetFormula, { enabled: true, expectedSite: "M" }) : undefined; setRecipe({ ...recipe, targetFormula, aluminumPerFormula: aluminumCoefficientForTargetChange(recipe, targetFormula), siteComposition: normalized?.success ? normalized.value.explicitSiteModel : undefined, radiusDescriptorConfig: undefined }); }} ref={formulaRef} spellCheck={false} value={recipe.targetFormula} /></label>
          <div className="rounded-md bg-slate-100 p-3 text-sm"><span className="font-semibold">Site model:</span> {recipe.siteComposition ? `${recipe.siteComposition.structure} explicit M/A/X` : "Flat elemental formula · no site inference"}</div>
        </div>
        <label className="mt-3 flex min-h-10 items-center gap-2 rounded border border-slate-300 bg-white px-3 text-sm"><input checked={recipe.normalizeLeadingSiteRatios ?? false} onChange={(event) => { const enabled = event.target.checked; const normalized = enabled ? normalizeLeadingSiteRatioGroup(recipe.targetFormula, { enabled: true, expectedSite: "M" }) : undefined; setRecipe({ ...recipe, normalizeLeadingSiteRatios: enabled, siteComposition: normalized?.success ? normalized.value.explicitSiteModel : undefined, radiusDescriptorConfig: undefined }, "site-ratio-normalization", "normalize-leading-site-ratios"); }} type="checkbox" />Normalize leading mixed-site ratios</label>
        {!recipe.normalizeLeadingSiteRatios && recipe.targetFormula.trim() !== "" && <><p className="mt-3 rounded-md border border-slate-300 bg-slate-50 p-3 text-sm"><span className="font-semibold">Entered target formula:</span> <span className="select-text font-mono">{recipe.targetFormula}</span></p>{workingAdjustedFormula && aluminumFeed.visible && aluminumFeed.enteredCoefficient !== aluminumFeed.idealCoefficient && <p className="mt-2 rounded-md border border-teal-300 bg-teal-50 p-3 text-sm"><span className="font-semibold">Adjusted intended feed formula:</span> <span className="select-text font-mono text-base">{workingAdjustedFormula}</span></p>}</>}
        {ratioNormalization?.success && normalizedAdjustedFormula && <section aria-label="Target and adjusted feed formulas" className="mt-3 grid gap-2 rounded-md border border-teal-400 bg-white p-3 text-sm"><div><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Normalized target formula</h3><p className="break-all font-mono text-base font-semibold">{normalizedIdealFormula}</p></div><div className="border-t pt-2"><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Expanded target formula</h3><p className="break-all font-mono text-base font-semibold">{expandedIdealFormula}</p></div><div className="border-t-2 border-teal-400 bg-teal-50 p-2"><h3 className="text-xs font-semibold uppercase tracking-wide text-teal-900">Adjusted intended feed formula</h3><p className="break-all font-mono text-lg font-bold text-teal-950">{normalizedAdjustedFormula}</p></div></section>}
        {ratioNormalization?.success && <section aria-labelledby="site-ratio-preview-heading" className="mt-3 rounded-md border border-teal-300 bg-teal-50 p-3 text-sm"><h2 className="font-semibold" id="site-ratio-preview-heading">M-site ratio normalization</h2><p className="mt-1">Entered ratio total: <strong className="font-mono">{ratioNormalization.value.ratioSum.canonical}</strong></p><p>Normalized to M-site multiplicity: <strong className="font-mono">{ratioNormalization.value.requestedMultiplicity.canonical}</strong></p><div className="mt-3 grid gap-2 rounded border border-teal-200 bg-white p-3"><div><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Site-occupancy formula</h3><p className="select-text break-all font-mono text-base font-semibold">{ratioNormalization.value.siteOccupancyFormula}</p><button className="mt-1 rounded border px-2 py-1 text-xs print:hidden" onClick={() => void navigator.clipboard.writeText(ratioNormalization.value.siteOccupancyFormula).then(() => setStatusMessage("Copied site-occupancy formula"))}>Copy site formula</button></div><div className="border-t border-slate-200 pt-2"><h3 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Expanded per-formula formula</h3><p className="select-text break-all font-mono text-base font-semibold">{ratioNormalization.value.expandedPerFormulaFormula}</p><button className="mt-1 rounded border px-2 py-1 text-xs print:hidden" onClick={() => void navigator.clipboard.writeText(ratioNormalization.value.expandedPerFormulaFormula).then(() => setStatusMessage("Copied expanded per-formula formula"))}>Copy expanded formula</button></div></div><div className="mt-2 overflow-x-auto"><table className="min-w-full text-left text-xs"><thead><tr><th className="pr-3">Element</th><th className="pr-3">Entered ratio</th><th className="pr-3">M-site occupancy</th><th>Per formula</th></tr></thead><tbody>{ratioNormalization.value.enteredRatios.map((entry) => <tr key={entry.element}><th className="py-1 pr-3">{entry.element}</th><td className="pr-3 font-mono">{entry.enteredRatio.canonical}</td><td className="pr-3 font-mono">{formatPercent(entry.occupancyApproximation, 5)}</td><td className="font-mono">{formatDescriptor(entry.formulaCoefficientApproximation, "", 6)}</td></tr>)}</tbody></table></div><p className="mt-2 font-semibold">Derived explicit site model: {ratioNormalization.value.siteModelLabel}</p><p className="text-xs">Ideal template: {ratioNormalization.value.idealTemplateFormula} · Intended feed preserves {ratioNormalization.value.intendedFeedXElement}{ratioNormalization.value.intendedFeedXCoefficientText}.</p><details className="mt-2"><summary className="cursor-pointer font-medium">Show exact normalized values</summary><ul className="mt-1 space-y-1 font-mono text-xs">{ratioNormalization.value.enteredRatios.map((entry) => <li key={`exact-${entry.element}`}>{entry.element}: occupancy {entry.normalizedOccupancy.canonical}; per formula {entry.normalizedFormulaCoefficient.canonical}</li>)}<li>{ratioNormalization.value.intendedFeedXElement}: per formula {ratioNormalization.value.intendedFeedXCoefficient.canonical}</li></ul><p className="mt-2 text-xs">Exact calculation composition ×{ratioNormalization.value.calculationCompositionScaleFactor.canonical}: {formatComposition(ratioNormalization.value.calculationComposition.amounts)}</p></details></section>}
        {recipe.targetFormula.trim() !== "" && calculation.errors.filter((item) => item.fieldPath === "targetFormula").map((error) => <p className="mt-2 text-sm font-medium text-red-800" id="formula-error" key={error.code}>Error: {error.message}</p>)}

        <div className="mt-5"><h2 className="font-semibold">Precursors</h2><div className="mt-2 flex flex-wrap gap-2"><button className="min-h-9 rounded-md bg-teal-800 px-3 text-sm font-semibold text-white disabled:bg-slate-300" disabled={!suggestionTarget} onClick={() => void showSuggestions()} ref={suggestRef}>Suggest precursors</button><button className="min-h-9 rounded-md border border-teal-700 px-3 text-sm font-medium text-teal-900 disabled:text-slate-400" disabled={!suggestionTarget || !(suggestionResult ?? builtInSuggestions)?.suggestions.length} onClick={() => void autofillBest()}>Autofill best candidate</button><button className="min-h-9 rounded-md border border-slate-400 px-3 text-sm font-medium" onClick={addPrecursor}>Add precursor</button><button aria-label="Clear all precursors" className="min-h-9 rounded-md border border-red-400 px-3 text-sm font-medium text-red-800 disabled:border-slate-300 disabled:text-slate-400" disabled={!recipe.precursors.length} onClick={clearAllPrecursors}>Clear all</button></div></div>
        {suggestionTarget && recipe.precursors.length === 0 && !suggestionOpen && Boolean(builtInSuggestions?.suggestions.length) && <p className="mt-2 rounded border border-teal-200 bg-teal-50 p-2 text-sm">Candidate precursor routes available. Suggestions are deterministic starting points, not experimental-success predictions.</p>}
        {currentRouteInvalid && dismissedCoverageFormula !== recipe.targetFormula && <section aria-live="polite" className="mt-2 rounded border border-amber-400 bg-amber-50 p-3 text-sm"><p className="font-semibold text-amber-950">Current precursor route no longer covers all target elements.</p>{currentRouteAssessment?.missingElements.length ? <p className="mt-1">Missing registered source in the current route: <span className="font-mono">{currentRouteAssessment.missingElements.join(", ")}</span></p> : <p className="mt-1">The exact non-negative balance is infeasible for the current target.</p>}<div className="mt-2 flex flex-wrap gap-2"><button className="rounded bg-amber-900 px-3 py-1 text-white" onClick={() => void showSuggestions()}>Suggest replacements</button><button className="rounded border border-amber-700 px-3 py-1" onClick={() => setDismissedCoverageFormula(recipe.targetFormula)}>Keep current route</button><button className="rounded border border-red-500 px-3 py-1 text-red-900" onClick={clearAllPrecursors}>Clear precursors</button></div></section>}
        {suggestionOpen && <section aria-labelledby="precursor-suggestions-heading" className="mt-3 rounded-md border border-teal-300 bg-teal-50 p-3" id="precursor-suggestions" tabIndex={-1}><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold" id="precursor-suggestions-heading">Suggested precursors</h3><p className="text-xs text-slate-700">Deterministic candidate routes only. Verify material form, purity, hazards, and experimental suitability.</p></div><button aria-label="Close precursor suggestions" className="rounded border px-2 py-1 text-sm" onClick={() => setSuggestionOpen(false)}>Close</button></div><div className="mt-3 space-y-2">{(suggestionResult ?? builtInSuggestions)?.suggestions.map((candidate, index) => <article className="rounded border border-teal-200 bg-white p-3" key={candidate.candidateId}><h4 className="font-semibold">Candidate {index + 1} — {candidate.name}</h4><p className="mt-1 font-mono text-sm">{candidate.precursorFormulas.join(" · ")}</p><p className="mt-1 text-xs"><span className="font-semibold">{candidate.sourceType.replaceAll("-", " ")}</span> · {candidate.validationStatus} · {candidate.solverStatus}</p><p className="mt-1 text-xs">{candidate.explanation}</p><p className="mt-1 text-xs">{candidate.introducedNonTargetElements.length ? `Introduced non-target elements: ${candidate.introducedNonTargetElements.join(", ")}` : "No non-target elements"}</p><button className="mt-2 rounded bg-teal-800 px-3 py-1 text-sm font-semibold text-white" onClick={() => applySuggestion(candidate)}>Use this route</button></article>)}{!(suggestionResult ?? builtInSuggestions)?.suggestions.length && <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm">No usable candidate route was found. {(suggestionResult ?? builtInSuggestions)?.diagnostics.map((item) => item.message).join(" ")}</p>}</div></section>}
        <div className="mt-2 space-y-3">{recipe.precursors.map((item, index) => {
          const rowWarnings = diagnosticPresentation?.action.filter((warning) => warning.precursorIds.includes(item.id)) ?? [];
          return <fieldset className="rounded-md border border-slate-300 p-3" key={item.id}><legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Route row {index + 1}</legend><div className="grid grid-cols-[minmax(0,1fr)_7rem_auto] gap-2"><label className="text-xs font-medium" htmlFor={`precursor-formula-${item.id}`}>Formula<input className="mt-1 min-h-10 w-full rounded border border-slate-400 px-2 font-mono" data-precursor-formula data-primary-field id={`precursor-formula-${item.id}`} onChange={(event) => setRecipe(replacePrecursor(recipe, index, { formula: event.target.value, name: event.target.value || item.name }))} onKeyDown={(event) => { if (!event.altKey || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return; event.preventDefault(); navigatePrecursorFormula(index, event.key === "ArrowDown" ? 1 : -1); }} value={item.formula} /></label><label className="text-xs font-medium" htmlFor={`purity-${item.id}`}>Purity<input className="mt-1 min-h-10 w-full rounded border border-slate-400 px-2 font-mono" data-primary-field id={`purity-${item.id}`} inputMode="decimal" onChange={(event) => setRecipe(replacePrecursor(recipe, index, { purityPercent: event.target.value }))} placeholder="default" value={item.purityPercent} /></label><span className="mt-5 text-xs text-slate-500">%</span></div><div className="mt-2 flex flex-wrap gap-1"><button aria-label={`Move ${item.name} up`} className="min-h-8 min-w-8 rounded border" disabled={index === 0} onClick={() => movePrecursor(index, -1)}>↑</button><button aria-label={`Move ${item.name} down`} className="min-h-8 min-w-8 rounded border" disabled={index === recipe.precursors.length - 1} onClick={() => movePrecursor(index, 1)}>↓</button><button aria-label={`Remove ${item.name}`} className="min-h-8 rounded border border-red-300 px-2 text-xs text-red-800" onClick={() => removePrecursor(index)}>Remove</button></div>{item.purityPercent.trim() === "" && <p className="mt-1 text-xs text-slate-600">No registry purity stored; calculation uses the engine’s visible assumed-purity default until reviewed.</p>}{rowWarnings.map((warning) => <p className="mt-2 text-xs font-medium text-amber-900" key={warning.id}>Review: {warning.message}</p>)}</fieldset>;
        })}</div>

        {mode === "advanced" && <AtomicRadiusPanel config={recipe.radiusDescriptorConfig} onConfigChange={(radiusDescriptorConfig) => setRecipe({ ...recipe, radiusDescriptorConfig })} onConfigureSites={() => setStatusMessage("Choose an explicit 211, 312, 413, or custom site model and assign every occupant; no sites were inferred from the flat formula.")} siteModel={recipe.siteComposition} />}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium" htmlFor="batch-basis">Batch-mass basis<select className="mt-1 min-h-10 w-full rounded border border-slate-400 bg-white px-2" data-primary-field id="batch-basis" onChange={(event) => setRecipe({ ...recipe, basis: event.target.value as BatchMassBasis })} value={recipe.basis}><option value="ideal-product-mass">Ideal product mass</option><option value="recovered-product-mass">Recovered product mass</option><option value="final-precursor-mixture-mass">Final precursor mixture mass</option></select></label>
          <label className="block text-sm font-medium" htmlFor="batch-mass">Target batch mass<span className="mt-1 flex rounded border border-slate-400"><input className="min-h-10 min-w-0 flex-1 px-3 font-mono" data-primary-field id="batch-mass" inputMode="decimal" onChange={(event) => setRecipe({ ...recipe, requestedMassGrams: event.target.value })} ref={batchRef} value={recipe.requestedMassGrams} /><span className="flex items-center border-l bg-slate-100 px-3 text-xs">g</span></span></label>
          {recipe.basis === "recovered-product-mass" && <div className="sm:col-span-2"><NumberField id="yield" label="Expected reaction yield" onChange={(value) => setRecipe({ ...recipe, expectedYieldPercent: value })} unit="%" value={recipe.expectedYieldPercent} /></div>}
          {aluminumFeed.visible && <label className="block text-sm font-medium" htmlFor="aluminum-per-formula">Aluminum per formula<input aria-describedby={aluminumFeed.error ? "aluminum-per-formula-error" : "aluminum-per-formula-help"} className="mt-1 min-h-10 w-full rounded-md border border-slate-400 px-3 font-mono outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-200" id="aluminum-per-formula" inputMode="decimal" onChange={(event) => setRecipe({ ...recipe, aluminumPerFormula: event.target.value })} value={recipe.aluminumPerFormula ?? aluminumFeed.enteredCoefficient ?? ""} /><span className="mt-1 block text-xs font-normal text-slate-600" id="aluminum-per-formula-help">Ideal value: {aluminumFeed.idealCoefficient} · {aluminumHelper}</span>{aluminumFeed.error && <span className="mt-1 block text-xs font-semibold text-red-800" id="aluminum-per-formula-error">{aluminumFeed.error}</span>}</label>}
          {xComponent.success && <label className="block text-sm font-medium" htmlFor="x-per-formula">{xComponent.value.element === "C" ? "Carbon" : "Nitrogen"} per formula<input aria-describedby={xCoefficientError ? "x-per-formula-error" : "x-per-formula-help"} className="mt-1 min-h-10 w-full rounded-md border border-slate-400 px-3 font-mono outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-200" id="x-per-formula" inputMode="decimal" onChange={(event) => updateXCoefficient(event.target.value)} value={xCoefficientDraft ?? xComponent.value.enteredCoefficientText} /><span className="mt-1 block text-xs font-normal text-slate-600" id="x-per-formula-help">{xFeedHelper}</span>{xCoefficientError && <span className="mt-1 block text-xs font-semibold text-red-800" id="x-per-formula-error">{xCoefficientError}</span>}</label>}
          <NumberField id="handling-loss" label="Handling loss" onChange={(value) => setRecipe({ ...recipe, handlingLossPercent: value })} unit="%" value={recipe.handlingLossPercent} />
          <NumberField id="balance-increment" label="Balance increment" onChange={(value) => setRecipe({ ...recipe, balanceIncrementGrams: value })} unit="g" value={recipe.balanceIncrementGrams} />
        </div>

        {mode === "advanced" && <section aria-labelledby="advanced-heading" className="mt-5 border-t border-slate-300 pt-4"><h2 id="advanced-heading" className="font-semibold">Advanced controls and diagnostics</h2>{recipe.siteComposition && <div className="mt-3"><h3 className="text-sm font-semibold">Explicit sites</h3><dl className="mt-1 grid grid-cols-[3rem_1fr] gap-1 text-sm">{recipe.siteComposition.sites.map((site) => <div className="contents" key={site.id}><dt className="font-semibold">{site.id}</dt><dd className="font-mono">{site.occupants.map((occupant) => `${occupant.element} ${occupant.fraction}`).join(" + ")} · multiplicity {site.multiplicity}</dd></div>)}</dl></div>}<div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium" htmlFor="rounding-mode">Rounding mode<select className="mt-1 min-h-10 w-full rounded border px-2" id="rounding-mode" onChange={(event) => setRecipe({ ...recipe, roundingMode: event.target.value as RoundingMode })} value={recipe.roundingMode}><option value="nearest-half-even">Nearest, half even</option><option value="nearest-half-up">Nearest, half up</option><option value="floor">Floor</option><option value="ceiling">Ceiling</option></select></label><label className="text-sm font-medium" htmlFor="objective">Solver objective<select className="mt-1 min-h-10 w-full rounded border px-2" id="objective" onChange={(event) => setRecipe({ ...recipe, objective: event.target.value as WorkspaceRecipeState["objective"] })} value={recipe.objective}><option value="deterministic-feasible">Deterministic feasible</option><option value="minimize-total-quantity">Minimize quantity</option></select></label><label className="text-sm font-medium" htmlFor="precursor-excess-id">Precursor-specific excess<select className="mt-1 min-h-10 w-full rounded border px-2" id="precursor-excess-id" onChange={(event) => setRecipe({ ...recipe, precursorExcessId: event.target.value })} value={recipe.precursorExcessId}><option value="">None</option>{recipe.precursors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><NumberField id="precursor-excess" label="Precursor excess" onChange={(value) => setRecipe({ ...recipe, precursorExcessPercent: value })} unit="%" value={recipe.precursorExcessPercent} /></div><div className="mt-4 space-y-2">{recipe.precursors.map((item, index) => <div className="grid gap-2 rounded border p-2 text-sm sm:grid-cols-3" key={item.id}><span className="font-medium">{item.name}</span><label>Control<select className="ml-2 rounded border p-1" onChange={(event) => setRecipe(replacePrecursor(recipe, index, { constraintMode: event.target.value as WorkspacePrecursorInput["constraintMode"] }))} value={item.constraintMode}><option value="solver">Solver</option><option value="fixed">Fixed</option><option value="bounded">Bounded</option></select></label>{item.constraintMode === "fixed" ? <input aria-label={`${item.name} fixed quantity`} className="rounded border px-2 font-mono" onChange={(event) => setRecipe(replacePrecursor(recipe, index, { fixedValue: event.target.value }))} placeholder="mol/mol target" value={item.fixedValue} /> : item.constraintMode === "bounded" ? <span className="flex gap-1"><input aria-label={`${item.name} minimum`} className="min-w-0 rounded border px-2" onChange={(event) => setRecipe(replacePrecursor(recipe, index, { minimum: event.target.value }))} placeholder="min" value={item.minimum} /><input aria-label={`${item.name} maximum`} className="min-w-0 rounded border px-2" onChange={(event) => setRecipe(replacePrecursor(recipe, index, { maximum: event.target.value }))} placeholder="max" value={item.maximum} /></span> : <span className="text-slate-500">Unconstrained</span>}</div>)}</div></section>}
        {mode === "advanced" && <section aria-labelledby="advanced-scientific-heading" className="mt-5 border-t border-slate-300 pt-4"><h2 className="font-semibold" id="advanced-scientific-heading">Advanced scientific inputs</h2>{recipe.siteComposition && <div className="mt-3 space-y-2"><h3 className="text-sm font-semibold">Editable explicit sites</h3>{recipe.siteComposition.sites.map((site, siteIndex) => <fieldset className="rounded border p-2" key={site.id}><legend className="px-1 text-sm font-semibold">{site.id} site</legend><label className="text-xs">Multiplicity <input aria-label={`${site.id} site multiplicity`} className="ml-1 w-20 rounded border px-2 font-mono" onChange={(event) => updateSiteMultiplicity(siteIndex, event.target.value)} value={site.multiplicity} /></label><div className="mt-2 flex flex-wrap gap-2">{site.occupants.map((occupant, occupantIndex) => <label className="text-xs" key={`${site.id}-${occupant.element}`}>{occupant.element} fraction <input aria-label={`${site.id} ${occupant.element} fraction`} className="ml-1 w-20 rounded border px-2 font-mono" onChange={(event) => updateSiteFraction(siteIndex, occupantIndex, event.target.value)} value={occupant.fraction} /></label>)}</div></fieldset>)}</div>}<div className="mt-4 space-y-3"><h3 className="text-sm font-semibold">Ratio constraints and material overrides</h3>{recipe.precursors.map((item, index) => <fieldset className="rounded border p-2" key={`advanced-${item.id}`}><legend className="px-1 text-sm font-semibold">{item.name}</legend><div className="grid gap-2 sm:grid-cols-2"><label className="text-xs">Ratio denominator<select aria-label={`${item.name} ratio denominator`} className="mt-1 min-h-9 w-full rounded border px-2" onChange={(event) => setRecipe(replacePrecursor(recipe, index, { constraintMode: event.target.value ? "ratio" : "solver", ratioDenominatorId: event.target.value }))} value={item.constraintMode === "ratio" ? item.ratioDenominatorId : ""}><option value="">No ratio constraint</option>{recipe.precursors.filter((candidate) => candidate.id !== item.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label><span className="flex gap-2"><label className="text-xs">Numerator<input aria-label={`${item.name} numerator ratio`} className="mt-1 min-h-9 w-full rounded border px-2 font-mono" onChange={(event) => setRecipe(replacePrecursor(recipe, index, { numeratorRatio: event.target.value }))} value={item.numeratorRatio} /></label><label className="text-xs">Denominator<input aria-label={`${item.name} denominator ratio`} className="mt-1 min-h-9 w-full rounded border px-2 font-mono" onChange={(event) => setRecipe(replacePrecursor(recipe, index, { denominatorRatio: event.target.value }))} value={item.denominatorRatio} /></label></span><label className="text-xs">Molar-mass override<input aria-label={`${item.name} molar mass override`} className="mt-1 min-h-9 w-full rounded border px-2 font-mono" onChange={(event) => setRecipe(replacePrecursor(recipe, index, { molarMassOverride: event.target.value }))} placeholder="g/mol (optional)" value={item.molarMassOverride} /></label><label className="text-xs">Override source<input aria-label={`${item.name} override source`} className="mt-1 min-h-9 w-full rounded border px-2" onChange={(event) => setRecipe(replacePrecursor(recipe, index, { molarMassOverrideSource: event.target.value }))} placeholder="Required with override" value={item.molarMassOverrideSource} /></label></div></fieldset>)}</div></section>}
      </section>

      <section aria-labelledby="results-heading" className={`min-w-0 rounded-lg border bg-white p-4 shadow-sm ${activeLayout?.id === "builtin-compact-balance" ? "xl:order-1" : ""} ${stale ? "border-amber-600 opacity-75" : "border-slate-300"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="results-heading" className="text-lg font-semibold">Final weighing results</h2><span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${historicalSnapshot ? "bg-blue-100 text-blue-900" : stale ? "bg-amber-200 text-amber-950" : "bg-teal-100 text-teal-900"}`}>{historicalSnapshot ? "Historical saved result" : stale ? "Stale" : "Current working result"}</span></div>
        <div className="mt-2 flex flex-wrap items-end gap-2 print:hidden"><label className="text-xs font-medium" htmlFor="weighing-sort">Sort<select className="ml-2 min-h-9 rounded border border-slate-400 bg-white px-2 text-sm font-normal" id="weighing-sort" onChange={(event) => { const selected = event.target.value as WeighingSortOption; setWeighingSort(selected); window.localStorage.setItem(WEIGHING_SORT_STORAGE_KEY, selected); }} value={weighingSort}>{WEIGHING_SORT_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><button className="rounded bg-teal-800 px-3 py-2 text-sm font-semibold text-white disabled:bg-slate-400" disabled={!weighingSummary} onClick={() => setSummaryOpen(true)}>View weighing summary</button><button className="rounded border px-2 py-1 text-sm disabled:text-slate-400" disabled={(!currentValid && !historicalSnapshot) || !displayed} onClick={() => void copyWeighingTable()}>Copy table</button><button className="rounded border px-2 py-1 text-sm disabled:text-slate-400" disabled={(!currentValid && !historicalSnapshot) || !displayed} onClick={() => exportFile("csv")}>CSV</button><button className="rounded border px-2 py-1 text-sm disabled:text-slate-400" disabled={(!currentValid && !historicalSnapshot) || !displayed} onClick={() => exportFile("json")}>JSON</button><button className="rounded border px-2 py-1 text-sm disabled:text-slate-400" disabled={!weighingSummary} onClick={printCurrent}>Print</button>{historicalSnapshot && <button className="rounded border border-blue-500 px-2 py-1 text-sm" onClick={() => { setHistoricalSnapshot(undefined); setUnsavedChanges(true); setStatusMessage("Recalculated with the current engine as an unsaved working state; the historical snapshot is unchanged."); }}>Recalculate with current engine</button>}</div>
        {historicalSnapshot && <p className="mt-2 rounded border border-blue-300 bg-blue-50 p-2 text-sm">Displayed exactly as saved on {new Date(historicalSnapshot.createdAt).toLocaleString()}. Engine {historicalSnapshot.engineVersion}; atomic data {historicalSnapshot.atomicWeightDataVersion}. Recalculation never overwrites this snapshot.</p>}
        {stale && <p aria-live="assertive" className="mt-3 border-l-4 border-amber-600 bg-amber-50 p-3 font-bold text-amber-950">STALE — values below do not reflect the current input.</p>}
        {!currentValid && recipe.targetFormula.trim() !== "" && <div aria-live="polite" className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-950" role="alert"><p className="font-semibold">Current recipe cannot be calculated.</p>{calculation.errors.map((error, index) => <p className="mt-1" key={`${error.code}-${index}`}><span className="font-mono">{error.code}</span>: {error.message}</p>)}</div>}
        {displayed ? <><div className="mt-4 overflow-x-auto" ref={resultsRef} tabIndex={0}><table className="w-full min-w-[680px] border-collapse text-left text-sm"><caption className="mb-2 text-left text-xs text-slate-600">Final gross weighing masses. Visible columns and order are local presentation settings; sorting and visibility do not change chemistry or canonical exports.</caption><thead><tr className="border-b-2 border-slate-400">{visibleResultFields.map((field) => <th className={`p-2 ${["purity", "solver-molar-ratio", "final-intended-molar-ratio", "batch-scaled-moles", "molar-mass", "pure-required-mass", "pre-round-mass", "final-mass", "realized-moles"].includes(field) ? "text-right" : "text-left"}`} key={field}>{FIELD_LABELS[field]}</th>)}</tr></thead><tbody>{sortedPrecursors.map((item) => { const definition = recipe.precursors.find((precursor) => precursor.id === item.precursorId); return <tr className="border-b border-slate-200" data-precursor-id={item.precursorId} key={item.precursorId}>{visibleResultFields.map((field) => renderResultCell(field, item, definition?.formula))}</tr>; })}</tbody><tfoot><tr className="border-t-2 border-slate-500 font-semibold">{visibleResultFields.map((field, index) => field === "final-mass" ? <td className="p-2 text-right font-mono text-lg" key={field}>{formatMassForBalance(displayed.batch.finalRoundedTotalWeighingMassGrams, recipe.balanceIncrementGrams)} g</td> : index === 0 ? <th className="p-2" key={field}>Final rounded total</th> : <td className="p-2" key={field} />)}</tr></tfoot></table></div>{visibleResultFields.includes("atomic-radius") && !resultRadiusDataset && <p className="mt-2 rounded bg-amber-50 p-2 text-xs font-semibold">Atomic-radius column enabled, but no usable dataset is selected.</p>}
        {diagnosticPresentation && <section aria-labelledby="diagnostics-heading" className="mt-4"><h3 id="diagnostics-heading" className="text-sm font-semibold">{diagnosticPresentation.blocking.length ? `${diagnosticPresentation.blocking.length} blocking` : diagnosticPresentation.action.length ? `${diagnosticPresentation.action.length} action required` : "No action required"} · {diagnosticPresentation.minor.length} minor advisories · {diagnosticPresentation.information.length} calculation details</h3>{diagnosticPresentation.blocking.map((issue) => <article className="mt-2 rounded border-l-4 border-red-700 bg-red-50 p-3 text-sm text-red-950" key={issue.id}><strong>{issue.title}</strong><p>{issue.message}</p></article>)}{diagnosticPresentation.action.map((issue) => <article className="mt-2 rounded border-l-4 border-amber-600 bg-amber-50 p-3 text-sm text-amber-950" key={issue.id}><strong>{issue.title}</strong><p>{issue.message}</p><details className="mt-1 text-xs"><summary>Technical detail</summary><p>Codes: {issue.underlyingCodes.join(", ")}</p>{issue.exactMessages.map((message) => <p className="font-mono" key={message}>{message}</p>)}</details></article>)}{diagnosticPresentation.minor.length > 0 && <details className="mt-3 rounded border border-slate-300 p-2 text-sm"><summary className="cursor-pointer font-medium">Minor advisories ({diagnosticPresentation.minor.length})</summary>{diagnosticPresentation.minor.map((issue) => <article className="mt-2 border-t pt-2" key={issue.id}><strong>{issue.title}</strong><p>{issue.message}</p><p className="mt-1 font-mono text-xs text-slate-600">{issue.underlyingCodes.join(", ")}</p></article>)}</details>}{diagnosticPresentation.information.length > 0 && <details className="mt-2 rounded border border-slate-200 p-2 text-sm"><summary className="cursor-pointer font-medium">Calculation details ({diagnosticPresentation.information.length})</summary>{diagnosticPresentation.information.map((issue) => <article className="mt-2 border-t pt-2" key={issue.id}><p>{issue.message}</p><details className="text-xs"><summary>Show exact source message</summary><p className="font-mono">Codes: {issue.underlyingCodes.join(", ")}</p>{issue.exactMessages.map((message) => <p className="font-mono" key={message}>{message}</p>)}</details></article>)}</details>}</section>}
        {mode === "advanced" && displayed.matrix && <section className="mt-5"><h3 className="font-semibold">Matrix and solver diagnostics</h3><p className="mt-1 text-sm">Rank {displayed.matrix.analysis.matrixRank}; augmented rank {displayed.matrix.analysis.augmentedMatrixRank}; {displayed.matrix.dimensionClassification}; solver {displayed.solver?.status}.</p><div className="mt-2 overflow-x-auto"><table className="min-w-full border-collapse text-xs"><caption className="mb-1 text-left">Elemental balance matrix A and requirement b</caption><thead><tr><th className="border p-1">Element</th>{displayed.matrix.columns.map((column) => <th className="border p-1" key={column.precursorId}>{column.precursorId}</th>)}<th className="border p-1">b</th></tr></thead><tbody>{displayed.matrix.rows.map((row) => <tr key={row.element}><th className="border p-1">{row.element}</th>{displayed.matrix!.requiredElementMatrix[row.index]?.map((value, index) => <td className="border p-1 text-right font-mono" key={displayed.matrix!.columns[index]?.precursorId}>{value}</td>)}<td className="border p-1 text-right font-mono">{row.requirement}</td></tr>)}</tbody></table></div></section>}
        </> : <p className="mt-6 text-sm text-slate-600">Enter a valid target and precursor route to calculate weighing masses.</p>}
      </section>
    </div>

    {displayed && <section aria-labelledby="summary-heading" className="mx-auto mb-6 max-w-[1500px] border-y border-slate-300 bg-white p-4 shadow-sm">
      <h2 id="summary-heading" className="font-semibold">Calculation summary</h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-slate-600">Ideal crystal composition</dt><dd className="font-mono">{formatComposition(displayed.idealCrystalComposition.amounts)}</dd></div><div><dt className="text-slate-600">Intended feed composition</dt><dd className="font-mono">{formatComposition(displayed.intendedFeedComposition.amounts)}</dd></div><div><dt className="text-slate-600">Adjusted feed composition</dt><dd className="font-mono">{formatComposition(displayed.adjustedFeedComposition.amounts)}</dd></div><div><dt className="text-slate-600">Realized composition</dt><dd className="font-mono">{formatComposition(displayed.realizedComposition.amounts)}</dd></div><div><dt className="text-slate-600">Requested / basis</dt><dd>{formatMassForBalance(displayed.batch.requestedMassGrams, recipe.balanceIncrementGrams)} g · {displayed.batch.basis}</dd></div><div><dt className="text-slate-600">Pre-round / final total</dt><dd title={`Exact pre-round: ${displayed.batch.preRoundingTotalPrecursorMassGrams} g`}>{formatMassForBalance(displayed.batch.preRoundingTotalPrecursorMassGrams, recipe.balanceIncrementGrams)} g / {formatMassForBalance(displayed.batch.finalRoundedTotalWeighingMassGrams, recipe.balanceIncrementGrams)} g</dd></div><div><dt className="text-slate-600">Largest elemental residual</dt><dd className="font-mono">{largestResidual(displayed)}</dd></div><div><dt className="text-slate-600">Versions</dt><dd>Engine {displayed.engineVersion} · atomic data {displayed.dataVersions.atomicWeights}</dd></div></dl>
      <section className="mt-4 border-t pt-4 print:hidden" aria-label="Calculation details"><h3 className="font-semibold">Calculation details</h3><p className="mt-1 text-xs text-slate-600">Audit mole-to-mass conversion, rounding, and elemental reconciliation.</p><div className="mt-2 flex flex-wrap gap-2"><button className="min-h-10 rounded border border-slate-400 px-3 font-medium disabled:text-slate-400" disabled={!calculationVerification} onClick={() => setVerificationOpen(true)} ref={verificationButtonRef}>{stale && !historicalSnapshot ? "Verify calculations (stale)" : "Verify calculations"}</button><button aria-expanded={traceOpen} className="min-h-10 rounded border border-slate-400 px-3 font-medium" onClick={() => setTraceOpen(!traceOpen)}>{traceOpen ? "Close calculation trace" : "Open calculation trace"}</button></div></section>
      {traceOpen && <section aria-label="Calculation trace" className="mt-3 max-h-96 overflow-auto rounded border bg-slate-50 p-3 print:hidden"><ol className="space-y-3">{displayed.trace.map((step, index) => <li className="border-b border-slate-200 pb-2 text-sm" key={`${step.stepCode}-${index}`}><strong className="font-mono">{step.stepCode}</strong><p>{step.description}</p>{step.equation && <p className="font-mono text-xs">{step.equation}</p>}<p className="text-xs text-slate-600">Before: {Object.entries(step.before).map(([key, value]) => `${key}=${value}`).join(", ") || "—"} · After: {Object.entries(step.after).map(([key, value]) => `${key}=${value}`).join(", ") || "—"}</p></li>)}</ol></section>}
      <p className="mt-3 text-xs text-slate-600">Local-first workspace recovery is automatic. Recipe revisions are created only by explicit Save. Engine {ENGINE_VERSION}.</p>
    </section>}
    {displayed && <section aria-labelledby="print-radius-heading" className="hidden mx-auto mb-6 max-w-[1500px] border-y border-slate-300 bg-white p-4 text-sm print:block"><h2 className="font-semibold" id="print-radius-heading">Site-radius screening descriptors</h2><p>{recipe.radiusDescriptorConfig ? "Per-site dataset selections, resolved values, trust status, and descriptor results are preserved with this calculation snapshot and its JSON/CSV export." : "No site-radius descriptor configuration is attached to this calculation."}</p><p>Screening descriptor only; not a direct prediction of physical stress, lattice strain, phase stability, or synthesis success.</p></section>}
    <SaveRecipeDialog currentRevisionNumber={savedRecipe?.currentRevisionNumber} defaultAction={userSettings.saveBehavior.defaultPostSaveAction} initialName={savedRecipe?.name ?? (duplicationSource ? `Copy of ${duplicationSource.name}` : `${recipe.targetFormula || "Untitled"} recipe`)} onClose={() => setSaveOpen(false)} onSave={saveCurrent} open={saveOpen} returnFocusRef={saveButtonRef} scientificChanged={scientificInputChanged} validationStatus={savedRecipe?.validationStatus ?? activePreset?.validationStatus ?? "synthetic"} />
    <RecipeNotesDialog onClose={() => setNotesOpen(false)} open={notesOpen} recipe={notesRecipe} repositories={repositories} returnFocusRef={notesTriggerRef} revisions={notesRevisions} />
    <WeighingSummaryDialog entries={weighingSummary ? [{ summary: weighingSummary }] : []} onClose={() => setSummaryOpen(false)} onOpenVerification={() => { setSummaryOpen(false); setVerificationOpen(true); }} onPrint={printCurrent} onStatus={setStatusMessage} open={summaryOpen && Boolean(weighingSummary)} title="Weighing summary" />
    <CalculationVerificationDialog entries={calculationVerification ? [{ verification: calculationVerification }] : []} onAddMeasuredOutcomeNote={savedRecipe ? () => { setVerificationOpen(false); void openNotes(savedRecipe, document.activeElement as HTMLElement); } : undefined} onClose={() => { setVerificationOpen(false); requestAnimationFrame(() => verificationButtonRef.current?.focus()); }} onStatus={setStatusMessage} open={verificationOpen && Boolean(calculationVerification)} title="Calculation verification" />
  </main>;
}
