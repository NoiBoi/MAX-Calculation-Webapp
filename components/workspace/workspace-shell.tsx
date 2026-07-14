"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { ENGINE_VERSION, type BatchCalculationResult, type BatchMassBasis, type RoundingMode } from "@max-stoich/chemistry-engine";
import { buildWorkspaceCalculation, formatComposition, type WorkspaceRecipeState } from "@/lib/workspace/adapter";
import { getWorkspacePreset, WORKSPACE_PRESETS, type WorkspacePrecursorInput } from "@/lib/workspace/presets";
import { buildLaboratoryCsv, buildLaboratoryJson, buildWeighingTableTsv, downloadText, safeExportFilename } from "@/lib/export/laboratory-export";
import { LOCAL_SCHEMA_VERSION, type CalculationSnapshot, type RecipeRevision, type RouteRevision, type SavedRecipe, type SavedRoute, type WorkspaceLayout } from "@/lib/persistence/entities";
import { LocalDataRepositories } from "@/lib/persistence/repositories";
import { createOwnedRecordExport } from "@/lib/persistence/backup";
import type { Mode } from "@/lib/persistence/workspace-types";
import { RecipeCommandHistory } from "@/lib/workspace/history";
import { AtomicRadiusPanel } from "@/components/descriptor-panel/atomic-radius-panel";

export function stateFromPreset(id: string): WorkspaceRecipeState {
  const preset = getWorkspacePreset(id);
  return {
    transientId: `temporary-${preset.id}`,
    presetId: preset.id,
    targetFormula: preset.targetFormula,
    ...(preset.siteComposition ? { siteComposition: preset.siteComposition } : {}),
    precursors: preset.precursors.map((item) => ({ ...item })),
    requestedMassGrams: "10.000",
    basis: "ideal-product-mass",
    expectedYieldPercent: "80",
    alExcessPercent: "0",
    precursorExcessId: "",
    precursorExcessPercent: "0",
    handlingLossPercent: "0",
    balanceIncrementGrams: "0.001",
    roundingMode: "nearest-half-even",
    practicalMinimumMassGrams: "0.001",
    objective: "deterministic-feasible",
  };
}

function replacePrecursor(recipe: WorkspaceRecipeState, index: number, patch: Partial<WorkspacePrecursorInput>): WorkspaceRecipeState {
  return { ...recipe, precursors: recipe.precursors.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item) };
}

function NumberField({ id, label, value, unit, onChange }: { id: string; label: string; value: string; unit: string; onChange: (value: string) => void }) {
  return <label className="block text-sm font-medium text-slate-800" htmlFor={id}>{label}<span className="mt-1 flex rounded-md border border-slate-400 bg-white focus-within:border-teal-700 focus-within:ring-2 focus-within:ring-teal-200"><input className="min-h-10 min-w-0 flex-1 rounded-l-md px-3 font-mono tabular-nums outline-none" data-primary-field inputMode="decimal" id={id} onChange={(event) => onChange(event.target.value)} value={value} /><span aria-hidden="true" className="flex min-w-12 items-center justify-center border-l border-slate-300 bg-slate-100 px-2 text-xs text-slate-600">{unit}</span></span></label>;
}

function largestResidual(result: BatchCalculationResult): string {
  let largest = result.realizedElements[0];
  for (const item of result.realizedElements) if (!largest || Number(item.absoluteResidualMoles) > Number(largest.absoluteResidualMoles)) largest = item;
  return largest ? `${largest.element} ${largest.signedResidualMoles} mol` : "— 0 mol";
}

export function WorkspaceShell() {
  const [recipe, setRecipeState] = useState<WorkspaceRecipeState>(() => stateFromPreset("ti2aln"));
  const [mode, setMode] = useState<Mode>("standard");
  const [traceOpen, setTraceOpen] = useState(false);
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
  const [statusMessage, setStatusMessage] = useState("Opening local workspace…");
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [unsavedChanges, setUnsavedChanges] = useState(false);
  const [duplicationSource, setDuplicationSource] = useState<Readonly<{ recipeId: string; revisionId: string; name: string }>>();
  const [historyVersion, setHistoryVersion] = useState(0);
  const repositories = useMemo(() => new LocalDataRepositories(), []);
  const [history] = useState(() => new RecipeCommandHistory(150, 500));
  const committedValidRecipe = useRef(recipe);
  const editSequence = useRef(0);
  const formulaRef = useRef<HTMLInputElement>(null);
  const batchRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const calculation = useMemo(() => buildWorkspaceCalculation(recipe), [recipe]);
  const initialValid = calculation.state === "valid" || calculation.state === "valid-with-warnings" ? calculation.result : undefined;
  const [lastValid, setLastValid] = useState<BatchCalculationResult | undefined>(initialValid);
  const currentValid = calculation.state === "valid" || calculation.state === "valid-with-warnings";
  const stale = !currentValid && lastValid !== undefined;
  const displayed = historicalSnapshot?.result ?? (currentValid ? calculation.result : lastValid);
  const activePreset = WORKSPACE_PRESETS.find((item) => item.id === recipe.presetId);
  const validationStatus = activePreset?.validationStatus ?? "synthetic";
  const validationNote = activePreset?.validationNote ?? "Custom in-memory input; scientific values and route have not been independently reviewed.";
  const canUndo = historyVersion >= 0 && history.canUndo;
  const canRedo = historyVersion >= 0 && history.canRedo;

  const refreshLibraries = useCallback(async () => {
    const [nextRecipes, nextRoutes, nextLayouts] = await Promise.all([repositories.listRecipes(), repositories.listRoutes(), repositories.listLayouts()]);
    setRecipes(nextRecipes);
    setRoutes(nextRoutes);
    setLayouts(nextLayouts);
    setActiveLayout((current) => current ?? nextLayouts.find((item) => item.isDefault) ?? nextLayouts[0]);
  }, [repositories]);

  const setRecipe = (next: WorkspaceRecipeState, type = "edit", groupKey?: string) => {
    history.record(type, groupKey ?? document.activeElement?.id ?? type, recipe, next);
    setHistoryVersion((value) => value + 1);
    setRecipeState(next);
    setHistoricalSnapshot(undefined);
    setUnsavedChanges(true);
    editSequence.current += 1;
  };

  useEffect(() => {
    if (!currentValid) return;
    const timer = window.setTimeout(() => setLastValid(calculation.result), 0);
    return () => window.clearTimeout(timer);
  }, [calculation, currentValid]);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        await repositories.database.open();
        const integrity = await repositories.checkStartupIntegrity();
        if (!active) return;
        if (!integrity.valid) setStatusMessage(`Local data needs attention: ${integrity.diagnostics[0]?.message ?? "integrity check failed"}`);
        const recovery = await repositories.loadRecovery();
        if (recovery && active) {
          setRecipeState(recovery.committedRecipe);
          committedValidRecipe.current = recovery.committedRecipe;
          setMode(recovery.mode);
          setUnsavedChanges(recovery.unsavedChanges);
          editSequence.current = recovery.committedEditSequence;
          if (recovery.baseRecipeId && recovery.baseRevisionId) {
            const [baseRecipe, baseRevision] = await Promise.all([repositories.getRecipe(recovery.baseRecipeId), repositories.getRevision(recovery.baseRevisionId)]);
            if (baseRecipe && baseRevision && active) {
              const baseSnapshot = await repositories.getSnapshot(baseRevision.snapshotId);
              setSavedRecipe(baseRecipe); setSavedRevision(baseRevision);
              if (baseSnapshot) { setSavedSnapshot(baseSnapshot); if (!recovery.unsavedChanges) setHistoricalSnapshot(baseSnapshot); }
            }
          }
          setStatusMessage(recovery.unsavedChanges ? "Recovered unsaved workspace" : "Recovered saved workspace");
        } else if (active && integrity.valid) setStatusMessage("Local workspace ready");
        await refreshLibraries();
      } catch (error) {
        if (active) setStatusMessage(`Local recovery is blocked: ${error instanceof Error ? error.message : "database migration failed"}. Your database was not reset.`);
      } finally {
        if (active) setRecoveryReady(true);
      }
    })();
    return () => { active = false; };
  }, [refreshLibraries, repositories]);
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
  const choosePreset = (id: string) => { setRecipe(stateFromPreset(id)); requestAnimationFrame(() => formulaRef.current?.focus()); };
  const addPrecursor = () => {
    const id = `precursor-${recipe.precursors.length + 1}`;
    setRecipe({ ...recipe, precursors: [...recipe.precursors, { id, name: "New precursor", formula: "", purityPercent: "100", constraintMode: "solver", fixedValue: "", minimum: "", maximum: "", ratioDenominatorId: "", numeratorRatio: "1", denominatorRatio: "1", molarMassOverride: "", molarMassOverrideSource: "" }] });
    requestAnimationFrame(() => document.getElementById(`precursor-formula-${id}`)?.focus());
  };
  const removePrecursor = (index: number) => {
    const remaining = recipe.precursors.filter((_, itemIndex) => itemIndex !== index);
    setRecipe({ ...recipe, precursors: remaining });
    requestAnimationFrame(() => document.getElementById(`precursor-formula-${remaining[Math.min(index, remaining.length - 1)]?.id}`)?.focus());
  };
  const movePrecursor = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= recipe.precursors.length) return;
    const values = [...recipe.precursors];
    [values[index], values[target]] = [values[target]!, values[index]!];
    setRecipe({ ...recipe, precursors: values });
  };
  const updateSiteMultiplicity = (siteIndex: number, multiplicity: string) => {
    if (!recipe.siteComposition) return;
    setRecipe({ ...recipe, siteComposition: { ...recipe.siteComposition, sites: recipe.siteComposition.sites.map((site, index) => index === siteIndex ? { ...site, multiplicity } : site) } });
  };
  const updateSiteFraction = (siteIndex: number, occupantIndex: number, fraction: string) => {
    if (!recipe.siteComposition) return;
    setRecipe({ ...recipe, siteComposition: { ...recipe.siteComposition, sites: recipe.siteComposition.sites.map((site, index) => index === siteIndex ? { ...site, occupants: site.occupants.map((occupant, current) => current === occupantIndex ? { ...occupant, fraction } : occupant) } : site) } });
  };
  const saveCurrent = async () => {
    if (!currentValid) { setStatusMessage("Save unavailable: resolve invalid or infeasible inputs first."); return; }
    try {
      const bundle = await repositories.saveCalculatedRevision({
        ...(savedRecipe ? { recipeId: savedRecipe.id, expectedCurrentRevisionNumber: savedRecipe.currentRevisionNumber } : {}),
        name: savedRecipe?.name ?? (duplicationSource ? `Copy of ${duplicationSource.name}` : `${recipe.targetFormula} recipe`),
        inputState: recipe,
        result: calculation.result,
        revisionNote: savedRecipe ? "Saved workspace changes" : "Initial saved calculation",
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
    } catch (error) { setStatusMessage(`Save failed: ${error instanceof Error ? error.message : "unknown error"}`); }
  };
  const newRecipe = () => {
    const next = stateFromPreset("ti2aln");
    setRecipe(next, "new-recipe", "new-recipe");
    setSavedRecipe(undefined); setSavedRevision(undefined); setSavedSnapshot(undefined); setDuplicationSource(undefined);
    history.clear(); setHistoryVersion((value) => value + 1);
    setStatusMessage("New unsaved recipe");
    requestAnimationFrame(() => formulaRef.current?.focus());
  };
  const openRecipe = async (item: SavedRecipe, revisionId = item.currentRevisionId) => {
    const revision = await repositories.getRevision(revisionId);
    if (!revision) { setStatusMessage("The selected revision is missing."); return; }
    const snapshot = await repositories.getSnapshot(revision.snapshotId);
    if (!snapshot) { setStatusMessage("The selected immutable snapshot is missing."); return; }
    const integrity = await repositories.verifySnapshot(snapshot);
    if (!integrity.valid) { setStatusMessage(`Snapshot blocked: ${integrity.diagnostics[0]?.message}`); return; }
    setRecipeState(structuredClone(revision.inputState));
    committedValidRecipe.current = revision.inputState;
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
      setRecipeState({ ...duplicate.inputState, transientId: `duplicate-${recipe.transientId}`, presetId: "custom" });
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
    setRecipe({ ...recipe, precursors: structuredClone(revision.precursors), ...revision.defaults, routeSource: { routeId: route.id, routeRevisionId: revision.id }, presetId: "custom" }, "apply-route", "apply-route");
    setActivePanel("none"); setStatusMessage(`Applied ${route.name} revision ${revision.revisionNumber}; the saved route was not changed.`);
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
    return { recipeName: savedRecipe?.name ?? `${recipe.targetFormula} unsaved calculation`, recipe: savedRecipe, revision: savedRevision, snapshot: historicalSnapshot ?? savedSnapshot, inputState: savedRevision && historicalSnapshot ? savedRevision.inputState : recipe, result: displayed, calculatedAt: (historicalSnapshot ?? savedSnapshot)?.createdAt ?? new Date().toISOString() };
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
      if (modifier && !event.altKey && event.key.toLowerCase() === "s") { event.preventDefault(); void saveCurrent(); }
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

  return <main className="min-h-screen bg-slate-100 text-slate-950" onKeyDown={primaryNavigation}>
    <header className="sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-3 border-b border-slate-300 bg-white px-4 py-2 shadow-sm">
      <Link className="mr-2 text-lg font-bold tracking-tight text-slate-950" href="/">MAX Stoich</Link>
      <label className="sr-only" htmlFor="preset">Built-in example</label>
      <select className="min-h-10 min-w-52 rounded-md border border-slate-400 bg-white px-3" id="preset" onChange={(event) => choosePreset(event.target.value)} value={recipe.presetId}>{WORKSPACE_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <span className="rounded-full border border-amber-500 bg-amber-50 px-2 py-1 text-xs font-semibold uppercase text-amber-900">{validationStatus}</span>
      <button aria-pressed={mode === "advanced"} className="min-h-10 rounded-md border border-slate-400 px-3 font-medium hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700" onClick={() => setMode(mode === "standard" ? "advanced" : "standard")}>{mode === "standard" ? "Advanced mode" : "Standard mode"}</button>
      <button className="min-h-10 rounded-md border border-slate-400 px-3 font-medium hover:bg-slate-100" onClick={() => choosePreset(recipe.presetId)}>Reset example</button>
      <button className="min-h-10 rounded-md bg-teal-800 px-3 font-semibold text-white disabled:bg-slate-400" disabled={!currentValid || Boolean(historicalSnapshot && !unsavedChanges)} onClick={() => void saveCurrent()}>Save</button>
      <button className="min-h-10 rounded-md border px-3 disabled:text-slate-400" disabled={!canUndo} onClick={undo}>Undo</button>
      <button className="min-h-10 rounded-md border px-3 disabled:text-slate-400" disabled={!canRedo} onClick={redo}>Redo</button>
      <button className="min-h-10 rounded-md border px-3" onClick={() => { setActivePanel("recipes"); void refreshLibraries(); }}>Recipes</button>
      <button className="min-h-10 rounded-md border px-3" onClick={() => { setActivePanel("routes"); void refreshLibraries(); }}>Routes</button>
      <Link className="min-h-10 rounded-md border px-3 py-2 font-medium" href="/compare">Compare routes</Link>
      <Link className="min-h-10 rounded-md border px-3 py-2 font-medium" href="/settings">Layouts & data</Link>
      <select aria-label="Workspace layout" className="min-h-10 rounded border px-2" onChange={(event) => { const selected = layouts.find((item) => item.id === event.target.value); if (selected) { setActiveLayout(selected); setMode(selected.kind === "advanced-calculator" ? "advanced" : mode); } }} value={activeLayout?.id ?? ""}>{layouts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <button className="ml-auto min-h-10 rounded-md border border-slate-400 px-3 font-medium hover:bg-slate-100" onClick={() => setCommandOpen(true)}>Commands <span className="text-xs text-slate-500">Ctrl+K</span></button>
      <p aria-live="polite" className="w-full text-xs text-slate-700" data-recovery-ready={recoveryReady}>{historicalSnapshot ? `Historical snapshot · engine ${historicalSnapshot.engineVersion}` : unsavedChanges ? "Unsaved changes" : savedRecipe ? `Saved · revision ${savedRevision?.revisionNumber}` : stale ? "Stale results" : calculation.state === "valid-with-warnings" ? "Current · warnings" : currentValid ? "Current unsaved calculation" : calculation.state.replaceAll("-", " ")} · {statusMessage}</p>
    </header>

    {commandOpen && <section aria-label="Command menu" className="fixed right-4 top-16 z-30 max-h-[80vh] w-80 overflow-auto rounded-lg border border-slate-400 bg-white p-4 shadow-xl"><div className="flex items-center justify-between"><h2 className="font-semibold">Commands</h2><button aria-label="Close command menu" className="min-h-8 min-w-8 rounded border" onClick={() => setCommandOpen(false)}>×</button></div><div className="mt-3 grid gap-2">
      <button className="rounded border p-2 text-left" onClick={() => { newRecipe(); setCommandOpen(false); }}>New recipe <span className="text-xs">Ctrl+Alt+N</span></button>
      <button className="rounded border p-2 text-left disabled:text-slate-400" disabled={!currentValid} onClick={() => { void saveCurrent(); setCommandOpen(false); }}>Save revision <span className="text-xs">Ctrl+S</span></button>
      <button className="rounded border p-2 text-left" onClick={() => { duplicateCurrent(); setCommandOpen(false); }}>Duplicate <span className="text-xs">Ctrl+Alt+D</span></button>
      <button className="rounded border p-2 text-left disabled:text-slate-400" disabled={!canUndo} onClick={() => { undo(); setCommandOpen(false); }}>Undo</button><button className="rounded border p-2 text-left disabled:text-slate-400" disabled={!canRedo} onClick={() => { redo(); setCommandOpen(false); }}>Redo</button>
      <button className="rounded border p-2 text-left" onClick={() => { setActivePanel("recipes"); setCommandOpen(false); void refreshLibraries(); }}>Open recipe library</button>
      <button className="rounded border p-2 text-left" onClick={() => { setActivePanel("routes"); setCommandOpen(false); void refreshLibraries(); }}>Apply or save route</button>
      <button className="rounded border p-2 text-left disabled:text-slate-400" disabled={(!currentValid && !historicalSnapshot) || !displayed} onClick={() => { void copyWeighingTable(); setCommandOpen(false); }}>Copy weighing table <span className="text-xs">Ctrl+Alt+C</span></button>
      <button className="rounded border p-2 text-left disabled:text-slate-400" disabled={(!currentValid && !historicalSnapshot) || !displayed} onClick={() => { exportFile("csv"); setCommandOpen(false); }}>Export CSV</button>
      <button className="rounded border p-2 text-left disabled:text-slate-400" disabled={(!currentValid && !historicalSnapshot) || !displayed} onClick={() => { exportFile("json"); setCommandOpen(false); }}>Export JSON</button>
      <button className="rounded border p-2 text-left disabled:text-slate-400" disabled={(!currentValid && !historicalSnapshot) || !displayed} onClick={() => { window.print(); setCommandOpen(false); }}>Print preparation sheet</button>
      <button className="rounded border p-2 text-left" onClick={() => { setMode(mode === "standard" ? "advanced" : "standard"); setCommandOpen(false); }}>Toggle standard / advanced</button><button className="rounded border p-2 text-left" onClick={() => { setTraceOpen(true); setCommandOpen(false); }}>Open calculation trace</button><button className="rounded border p-2 text-left" onClick={() => { choosePreset(recipe.presetId); setCommandOpen(false); }}>Reset current example</button>
    </div></section>}

    {activePanel !== "none" && <aside aria-label={activePanel === "recipes" ? "Saved recipe library" : activePanel === "routes" ? "Saved route library" : "Recipe revision history"} className="fixed inset-y-14 right-0 z-20 w-full max-w-md overflow-auto border-l border-slate-400 bg-white p-4 shadow-xl print:hidden">
      <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{activePanel === "recipes" ? "Local recipes" : activePanel === "routes" ? "Precursor routes" : `Revision history · ${savedRecipe?.name ?? "recipe"}`}</h2><button aria-label="Close library" className="min-h-9 min-w-9 rounded border" onClick={() => setActivePanel("none")}>×</button></div>
      {activePanel !== "revisions" && <input aria-label="Search local library" className="mt-3 min-h-10 w-full rounded border px-3" onChange={(event) => setLibrarySearch(event.target.value)} placeholder="Search name, formula, or status" value={librarySearch} />}
      {activePanel === "recipes" && <div className="mt-4 space-y-3">{recipes.filter((item) => `${item.name} ${item.targetFormula} ${item.validationStatus}`.toLowerCase().includes(librarySearch.toLowerCase())).map((item) => <article className="rounded border p-3" key={item.id}><div className="flex items-start justify-between gap-2"><div><input aria-label={`Recipe name for ${item.targetFormula}`} className="w-full rounded border px-1 font-semibold" defaultValue={item.name} onBlur={(event) => { if (event.target.value !== item.name) void repositories.renameRecipe(item.id, event.target.value).then(refreshLibraries); }} /><p className="mt-1 font-mono text-sm">{item.targetFormula}</p><p className="text-xs">Revision {item.currentRevisionNumber} · {item.validationStatus} · {new Date(item.updatedAt).toLocaleString()}</p></div><button className="rounded bg-teal-800 px-3 py-2 text-sm text-white" onClick={() => void openRecipe(item)}>Open</button></div><div className="mt-3 flex flex-wrap gap-2"><button className="rounded border px-2 py-1 text-sm" onClick={() => void duplicateSaved(item)}>Duplicate</button><button className="rounded border px-2 py-1 text-sm" onClick={() => void repositories.listRevisions(item.id).then((values) => { setSavedRecipe(item); setRevisions([...values].sort((a, b) => b.revisionNumber - a.revisionNumber)); setActivePanel("revisions"); })}>History</button><button className="rounded border px-2 py-1 text-sm" onClick={() => void repositories.setRecipeArchived(item.id, true).then(refreshLibraries)}>Archive</button><button className="rounded border border-red-300 px-2 py-1 text-sm text-red-800" onClick={() => { if (window.confirm(`Permanently delete ${item.name} and every revision and snapshot? This cannot be undone.`)) void repositories.deleteRecipePermanently(item.id).then(refreshLibraries); }}>Delete…</button></div></article>)}{recipes.length === 0 && <p className="text-sm text-slate-600">No saved recipes yet. Save the current valid calculation to create revision 1.</p>}</div>}
      {activePanel === "routes" && <div className="mt-4"><button className="w-full rounded bg-teal-800 p-2 font-semibold text-white" onClick={() => void saveRoute()}>Save current precursor setup as route</button><div className="mt-3 space-y-3">{routes.filter((item) => `${item.name} ${item.validationStatus}`.toLowerCase().includes(librarySearch.toLowerCase())).map((item) => <article className="rounded border p-3" key={item.id}><h3 className="font-semibold">{item.name}</h3><p className="text-xs">Revision {item.currentRevisionNumber} · {item.validationStatus}</p><div className="mt-2 flex flex-wrap gap-2"><button className="rounded bg-teal-800 px-3 py-1 text-sm text-white" onClick={() => void applyRoute(item)}>Apply copy</button><button className="rounded border px-2 py-1 text-sm" onClick={() => void duplicateRoute(item)}>Duplicate</button><button className="rounded border px-2 py-1 text-sm" onClick={() => void exportRoute(item)}>Export JSON</button><button className="rounded border px-2 py-1 text-sm" onClick={() => void repositories.saveRouteRevision({ routeId: item.id, expectedCurrentRevisionNumber: item.currentRevisionNumber, name: item.name, inputState: recipe }).then(async (saved) => { await refreshLibraries(); setStatusMessage(`Saved ${saved.route.name} route revision ${saved.revision.revisionNumber}`); })}>Update from current</button><button className="rounded border px-2 py-1 text-sm" onClick={() => void repositories.listRouteRevisions(item.id).then((values) => { setRouteRevisions([...values].sort((a, b) => b.revisionNumber - a.revisionNumber)); setStatusMessage(`${item.name} has ${values.length} immutable route revision(s).`); })}>View revisions</button><button className="rounded border px-2 py-1 text-sm" onClick={() => void repositories.setRouteArchived(item.id, true).then(refreshLibraries)}>Archive</button></div>{routeRevisions.some((revision) => revision.routeId === item.id) && <ol className="mt-2 border-t pt-2 text-xs">{routeRevisions.filter((revision) => revision.routeId === item.id).map((revision) => <li key={revision.id}>Revision {revision.revisionNumber} · {new Date(revision.createdAt).toLocaleString()} · digest {revision.canonicalDigest.slice(0, 12)}…</li>)}</ol>}</article>)}</div></div>}
      {activePanel === "revisions" && <div className="mt-4 space-y-3">{revisions.map((revision) => <article className="rounded border p-3" key={revision.id}><h3 className="font-semibold">Revision {revision.revisionNumber}</h3><p className="text-xs">{new Date(revision.createdAt).toLocaleString()} · engine {revision.engineVersion}</p><p className="mt-1 text-sm">{revision.revisionNote || "No revision note"}</p><div className="mt-2 flex gap-2"><button className="rounded bg-teal-800 px-3 py-1 text-sm text-white" onClick={() => savedRecipe && void openRecipe(savedRecipe, revision.id)}>Open snapshot</button><button className="rounded border px-3 py-1 text-sm" onClick={() => savedRecipe && void duplicateSaved(savedRecipe, revision.id)}>Duplicate from revision</button></div></article>)}</div>}
    </aside>}

    <div className={`mx-auto grid max-w-[1500px] gap-4 ${activeLayout?.density === "compact" ? "p-2" : "p-4"} xl:grid-cols-[var(--workspace-input)_minmax(0,1fr)]`} style={{ "--workspace-input": `${activeLayout?.inputWidthPercent ?? 40}%` } as CSSProperties}>
      <section aria-labelledby="inputs-heading" className="rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
        <h1 id="inputs-heading" className="text-lg font-semibold">Target and precursor route</h1>
        <p className="mt-1 text-xs text-slate-600">Built-in examples are temporary and reset on refresh. {validationNote}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <label className="block text-sm font-medium" htmlFor="target-formula">Target formula<input aria-describedby={calculation.errors.some((item) => item.fieldPath === "targetFormula") ? "formula-error" : undefined} className="mt-1 min-h-11 w-full rounded-md border border-slate-400 px-3 font-mono outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-200" data-primary-field id="target-formula" onChange={(event) => setRecipe({ ...recipe, targetFormula: event.target.value, siteComposition: undefined, presetId: "custom" })} ref={formulaRef} spellCheck={false} value={recipe.targetFormula} /></label>
          <div className="rounded-md bg-slate-100 p-3 text-sm"><span className="font-semibold">Site model:</span> {recipe.siteComposition ? `${recipe.siteComposition.structure} explicit M/A/X` : "Flat elemental formula · no site inference"}</div>
        </div>
        {calculation.errors.filter((item) => item.fieldPath === "targetFormula").map((error) => <p className="mt-2 text-sm font-medium text-red-800" id="formula-error" key={error.code}>Error: {error.message}</p>)}

        <div className="mt-5 flex items-center justify-between"><h2 className="font-semibold">Precursors</h2><button className="min-h-9 rounded-md border border-slate-400 px-3 text-sm font-medium" onClick={addPrecursor}>Add precursor</button></div>
        <div className="mt-2 space-y-3">{recipe.precursors.map((item, index) => {
          const rowWarnings = displayed?.warnings.filter((warning) => warning.precursorIds?.includes(item.id)) ?? [];
          return <fieldset className="rounded-md border border-slate-300 p-3" key={item.id}><legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Route row {index + 1}</legend><div className="grid grid-cols-[minmax(0,1fr)_7rem_auto] gap-2"><label className="text-xs font-medium" htmlFor={`precursor-formula-${item.id}`}>Formula<input className="mt-1 min-h-10 w-full rounded border border-slate-400 px-2 font-mono" data-primary-field id={`precursor-formula-${item.id}`} onChange={(event) => setRecipe(replacePrecursor(recipe, index, { formula: event.target.value, name: event.target.value || item.name }))} value={item.formula} /></label><label className="text-xs font-medium" htmlFor={`purity-${item.id}`}>Purity<input className="mt-1 min-h-10 w-full rounded border border-slate-400 px-2 font-mono" data-primary-field id={`purity-${item.id}`} inputMode="decimal" onChange={(event) => setRecipe(replacePrecursor(recipe, index, { purityPercent: event.target.value }))} value={item.purityPercent} /></label><span className="mt-5 text-xs text-slate-500">%</span></div><div className="mt-2 flex flex-wrap gap-1"><button aria-label={`Move ${item.name} up`} className="min-h-8 min-w-8 rounded border" disabled={index === 0} onClick={() => movePrecursor(index, -1)}>↑</button><button aria-label={`Move ${item.name} down`} className="min-h-8 min-w-8 rounded border" disabled={index === recipe.precursors.length - 1} onClick={() => movePrecursor(index, 1)}>↓</button><button aria-label={`Remove ${item.name}`} className="min-h-8 rounded border border-red-300 px-2 text-xs text-red-800" onClick={() => removePrecursor(index)}>Remove</button></div>{rowWarnings.map((warning) => <p className="mt-2 text-xs font-medium text-amber-900" key={warning.code}>Warning: {warning.message}</p>)}</fieldset>;
        })}</div>

        {mode === "advanced" && <AtomicRadiusPanel config={recipe.radiusDescriptorConfig} siteModel={recipe.siteComposition} />}

        <div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium" htmlFor="batch-basis">Batch-mass basis<select className="mt-1 min-h-10 w-full rounded border border-slate-400 bg-white px-2" data-primary-field id="batch-basis" onChange={(event) => setRecipe({ ...recipe, basis: event.target.value as BatchMassBasis })} value={recipe.basis}><option value="ideal-product-mass">Ideal product mass</option><option value="recovered-product-mass">Recovered product mass</option><option value="final-precursor-mixture-mass">Final precursor mixture mass</option></select></label><label className="block text-sm font-medium" htmlFor="batch-mass">Target batch mass<span className="mt-1 flex rounded border border-slate-400"><input className="min-h-10 min-w-0 flex-1 px-3 font-mono" data-primary-field id="batch-mass" inputMode="decimal" onChange={(event) => setRecipe({ ...recipe, requestedMassGrams: event.target.value })} ref={batchRef} value={recipe.requestedMassGrams} /><span className="flex items-center border-l bg-slate-100 px-3 text-xs">g</span></span></label>{recipe.basis === "recovered-product-mass" && <NumberField id="yield" label="Expected reaction yield" onChange={(value) => setRecipe({ ...recipe, expectedYieldPercent: value })} unit="%" value={recipe.expectedYieldPercent} />}<NumberField id="al-excess" label="Elemental Al excess" onChange={(value) => setRecipe({ ...recipe, alExcessPercent: value })} unit="%" value={recipe.alExcessPercent} /><NumberField id="handling-loss" label="Handling loss" onChange={(value) => setRecipe({ ...recipe, handlingLossPercent: value })} unit="%" value={recipe.handlingLossPercent} /><NumberField id="balance-increment" label="Balance increment" onChange={(value) => setRecipe({ ...recipe, balanceIncrementGrams: value })} unit="g" value={recipe.balanceIncrementGrams} /></div>

        {mode === "advanced" && <section aria-labelledby="advanced-heading" className="mt-5 border-t border-slate-300 pt-4"><h2 id="advanced-heading" className="font-semibold">Advanced controls and diagnostics</h2>{recipe.siteComposition && <div className="mt-3"><h3 className="text-sm font-semibold">Explicit sites</h3><dl className="mt-1 grid grid-cols-[3rem_1fr] gap-1 text-sm">{recipe.siteComposition.sites.map((site) => <div className="contents" key={site.id}><dt className="font-semibold">{site.id}</dt><dd className="font-mono">{site.occupants.map((occupant) => `${occupant.element} ${occupant.fraction}`).join(" + ")} · multiplicity {site.multiplicity}</dd></div>)}</dl></div>}<div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium" htmlFor="rounding-mode">Rounding mode<select className="mt-1 min-h-10 w-full rounded border px-2" id="rounding-mode" onChange={(event) => setRecipe({ ...recipe, roundingMode: event.target.value as RoundingMode })} value={recipe.roundingMode}><option value="nearest-half-even">Nearest, half even</option><option value="nearest-half-up">Nearest, half up</option><option value="floor">Floor</option><option value="ceiling">Ceiling</option></select></label><label className="text-sm font-medium" htmlFor="objective">Solver objective<select className="mt-1 min-h-10 w-full rounded border px-2" id="objective" onChange={(event) => setRecipe({ ...recipe, objective: event.target.value as WorkspaceRecipeState["objective"] })} value={recipe.objective}><option value="deterministic-feasible">Deterministic feasible</option><option value="minimize-total-quantity">Minimize quantity</option></select></label><label className="text-sm font-medium" htmlFor="precursor-excess-id">Precursor-specific excess<select className="mt-1 min-h-10 w-full rounded border px-2" id="precursor-excess-id" onChange={(event) => setRecipe({ ...recipe, precursorExcessId: event.target.value })} value={recipe.precursorExcessId}><option value="">None</option>{recipe.precursors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><NumberField id="precursor-excess" label="Precursor excess" onChange={(value) => setRecipe({ ...recipe, precursorExcessPercent: value })} unit="%" value={recipe.precursorExcessPercent} /></div><div className="mt-4 space-y-2">{recipe.precursors.map((item, index) => <div className="grid gap-2 rounded border p-2 text-sm sm:grid-cols-3" key={item.id}><span className="font-medium">{item.name}</span><label>Control<select className="ml-2 rounded border p-1" onChange={(event) => setRecipe(replacePrecursor(recipe, index, { constraintMode: event.target.value as WorkspacePrecursorInput["constraintMode"] }))} value={item.constraintMode}><option value="solver">Solver</option><option value="fixed">Fixed</option><option value="bounded">Bounded</option></select></label>{item.constraintMode === "fixed" ? <input aria-label={`${item.name} fixed quantity`} className="rounded border px-2 font-mono" onChange={(event) => setRecipe(replacePrecursor(recipe, index, { fixedValue: event.target.value }))} placeholder="mol/mol target" value={item.fixedValue} /> : item.constraintMode === "bounded" ? <span className="flex gap-1"><input aria-label={`${item.name} minimum`} className="min-w-0 rounded border px-2" onChange={(event) => setRecipe(replacePrecursor(recipe, index, { minimum: event.target.value }))} placeholder="min" value={item.minimum} /><input aria-label={`${item.name} maximum`} className="min-w-0 rounded border px-2" onChange={(event) => setRecipe(replacePrecursor(recipe, index, { maximum: event.target.value }))} placeholder="max" value={item.maximum} /></span> : <span className="text-slate-500">Unconstrained</span>}</div>)}</div></section>}
        {mode === "advanced" && <section aria-labelledby="advanced-scientific-heading" className="mt-5 border-t border-slate-300 pt-4"><h2 className="font-semibold" id="advanced-scientific-heading">Advanced scientific inputs</h2>{recipe.siteComposition && <div className="mt-3 space-y-2"><h3 className="text-sm font-semibold">Editable explicit sites</h3>{recipe.siteComposition.sites.map((site, siteIndex) => <fieldset className="rounded border p-2" key={site.id}><legend className="px-1 text-sm font-semibold">{site.id} site</legend><label className="text-xs">Multiplicity <input aria-label={`${site.id} site multiplicity`} className="ml-1 w-20 rounded border px-2 font-mono" onChange={(event) => updateSiteMultiplicity(siteIndex, event.target.value)} value={site.multiplicity} /></label><div className="mt-2 flex flex-wrap gap-2">{site.occupants.map((occupant, occupantIndex) => <label className="text-xs" key={`${site.id}-${occupant.element}`}>{occupant.element} fraction <input aria-label={`${site.id} ${occupant.element} fraction`} className="ml-1 w-20 rounded border px-2 font-mono" onChange={(event) => updateSiteFraction(siteIndex, occupantIndex, event.target.value)} value={occupant.fraction} /></label>)}</div></fieldset>)}</div>}<div className="mt-4 space-y-3"><h3 className="text-sm font-semibold">Ratio constraints and material overrides</h3>{recipe.precursors.map((item, index) => <fieldset className="rounded border p-2" key={`advanced-${item.id}`}><legend className="px-1 text-sm font-semibold">{item.name}</legend><div className="grid gap-2 sm:grid-cols-2"><label className="text-xs">Ratio denominator<select aria-label={`${item.name} ratio denominator`} className="mt-1 min-h-9 w-full rounded border px-2" onChange={(event) => setRecipe(replacePrecursor(recipe, index, { constraintMode: event.target.value ? "ratio" : "solver", ratioDenominatorId: event.target.value }))} value={item.constraintMode === "ratio" ? item.ratioDenominatorId : ""}><option value="">No ratio constraint</option>{recipe.precursors.filter((candidate) => candidate.id !== item.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label><span className="flex gap-2"><label className="text-xs">Numerator<input aria-label={`${item.name} numerator ratio`} className="mt-1 min-h-9 w-full rounded border px-2 font-mono" onChange={(event) => setRecipe(replacePrecursor(recipe, index, { numeratorRatio: event.target.value }))} value={item.numeratorRatio} /></label><label className="text-xs">Denominator<input aria-label={`${item.name} denominator ratio`} className="mt-1 min-h-9 w-full rounded border px-2 font-mono" onChange={(event) => setRecipe(replacePrecursor(recipe, index, { denominatorRatio: event.target.value }))} value={item.denominatorRatio} /></label></span><label className="text-xs">Molar-mass override<input aria-label={`${item.name} molar mass override`} className="mt-1 min-h-9 w-full rounded border px-2 font-mono" onChange={(event) => setRecipe(replacePrecursor(recipe, index, { molarMassOverride: event.target.value }))} placeholder="g/mol (optional)" value={item.molarMassOverride} /></label><label className="text-xs">Override source<input aria-label={`${item.name} override source`} className="mt-1 min-h-9 w-full rounded border px-2" onChange={(event) => setRecipe(replacePrecursor(recipe, index, { molarMassOverrideSource: event.target.value }))} placeholder="Required with override" value={item.molarMassOverrideSource} /></label></div></fieldset>)}</div></section>}
      </section>

      <section aria-labelledby="results-heading" className={`min-w-0 rounded-lg border bg-white p-4 shadow-sm ${stale ? "border-amber-600 opacity-75" : "border-slate-300"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="results-heading" className="text-lg font-semibold">Final weighing results</h2><span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${historicalSnapshot ? "bg-blue-100 text-blue-900" : stale ? "bg-amber-200 text-amber-950" : "bg-teal-100 text-teal-900"}`}>{historicalSnapshot ? "Historical saved result" : stale ? "Stale" : "Current working result"}</span></div>
        <div className="mt-2 flex flex-wrap gap-2 print:hidden"><button className="rounded border px-2 py-1 text-sm disabled:text-slate-400" disabled={(!currentValid && !historicalSnapshot) || !displayed} onClick={() => void copyWeighingTable()}>Copy table</button><button className="rounded border px-2 py-1 text-sm disabled:text-slate-400" disabled={(!currentValid && !historicalSnapshot) || !displayed} onClick={() => exportFile("csv")}>CSV</button><button className="rounded border px-2 py-1 text-sm disabled:text-slate-400" disabled={(!currentValid && !historicalSnapshot) || !displayed} onClick={() => exportFile("json")}>JSON</button><button className="rounded border px-2 py-1 text-sm disabled:text-slate-400" disabled={(!currentValid && !historicalSnapshot) || !displayed} onClick={() => window.print()}>Print</button>{historicalSnapshot && <button className="rounded border border-blue-500 px-2 py-1 text-sm" onClick={() => { setHistoricalSnapshot(undefined); setUnsavedChanges(true); setStatusMessage("Recalculated with the current engine as an unsaved working state; the historical snapshot is unchanged."); }}>Recalculate with current engine</button>}</div>
        {historicalSnapshot && <p className="mt-2 rounded border border-blue-300 bg-blue-50 p-2 text-sm">Displayed exactly as saved on {new Date(historicalSnapshot.createdAt).toLocaleString()}. Engine {historicalSnapshot.engineVersion}; atomic data {historicalSnapshot.atomicWeightDataVersion}. Recalculation never overwrites this snapshot.</p>}
        {stale && <p aria-live="assertive" className="mt-3 border-l-4 border-amber-600 bg-amber-50 p-3 font-bold text-amber-950">STALE — values below do not reflect the current input.</p>}
        {!currentValid && <div aria-live="polite" className="mt-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-950" role="alert"><p className="font-semibold">Current recipe cannot be calculated.</p>{calculation.errors.map((error, index) => <p className="mt-1" key={`${error.code}-${index}`}><span className="font-mono">{error.code}</span>: {error.message}</p>)}</div>}
        {displayed ? <><div className="mt-4 overflow-x-auto" ref={resultsRef} tabIndex={0}><table className="w-full min-w-[680px] border-collapse text-left text-sm"><caption className="mb-2 text-left text-xs text-slate-600">Final gross weighing masses. Solver quantity is mol precursor per mol target formula.</caption><thead><tr className="border-b-2 border-slate-400"><th className="p-2">Precursor</th><th className="p-2">Formula</th><th className="p-2 text-right">Purity</th>{mode === "advanced" && <><th className="p-2 text-right">Solver quantity</th><th className="p-2 text-right">Intended moles</th></>}<th className="p-2 text-right">Final weighing mass</th><th className="p-2">Status</th></tr></thead><tbody>{displayed.precursors.map((item) => { const definition = recipe.precursors.find((precursor) => precursor.id === item.precursorId); const warnings = displayed.warnings.filter((warning) => warning.precursorIds?.includes(item.precursorId)); return <tr className="border-b border-slate-200" key={item.precursorId}><th className="p-2 font-medium">{item.displayName}</th><td className="p-2 font-mono">{definition?.formula ?? "—"}</td><td className="p-2 text-right font-mono">{item.purity}</td>{mode === "advanced" && <><td className="p-2 text-right font-mono">{item.solverMolesPerTargetFormulaMole}</td><td className="p-2 text-right font-mono">{item.postSolverAdjustedMoles}</td></>}<td className="p-2 text-right"><span className="select-text whitespace-nowrap font-mono text-xl font-bold tabular-nums">{item.finalRoundedGrossWeighingMassGrams} g</span></td><td className="p-2 text-xs">{warnings.length ? `⚠ ${warnings.map((warning) => warning.code).join(", ")}` : "OK"}</td></tr>; })}</tbody><tfoot><tr className="border-t-2 border-slate-500 font-semibold"><th className="p-2" colSpan={mode === "advanced" ? 5 : 3}>Final rounded total</th><td className="p-2 text-right font-mono text-lg">{displayed.batch.finalRoundedTotalWeighingMassGrams} g</td><td className="p-2" /></tr></tfoot></table></div>
        <section aria-labelledby="warnings-heading" className="mt-5"><h3 id="warnings-heading" className="font-semibold">Warnings ({displayed.warnings.length})</h3>{displayed.warnings.length === 0 ? <p className="mt-1 text-sm text-slate-600">No scientific warnings.</p> : <ul className="mt-2 space-y-2">{displayed.warnings.map((warning, index) => <li className="rounded border-l-4 border-amber-500 bg-amber-50 p-2 text-sm" key={`${warning.code}-${index}`}><strong>⚠ {warning.code}</strong> — {warning.message}{warning.suggestedAction && <span> Suggested action: {warning.suggestedAction}</span>}</li>)}</ul>}</section>
        {mode === "advanced" && displayed.matrix && <section className="mt-5"><h3 className="font-semibold">Matrix and solver diagnostics</h3><p className="mt-1 text-sm">Rank {displayed.matrix.analysis.matrixRank}; augmented rank {displayed.matrix.analysis.augmentedMatrixRank}; {displayed.matrix.dimensionClassification}; solver {displayed.solver?.status}.</p><div className="mt-2 overflow-x-auto"><table className="min-w-full border-collapse text-xs"><caption className="mb-1 text-left">Elemental balance matrix A and requirement b</caption><thead><tr><th className="border p-1">Element</th>{displayed.matrix.columns.map((column) => <th className="border p-1" key={column.precursorId}>{column.precursorId}</th>)}<th className="border p-1">b</th></tr></thead><tbody>{displayed.matrix.rows.map((row) => <tr key={row.element}><th className="border p-1">{row.element}</th>{displayed.matrix!.requiredElementMatrix[row.index]?.map((value, index) => <td className="border p-1 text-right font-mono" key={displayed.matrix!.columns[index]?.precursorId}>{value}</td>)}<td className="border p-1 text-right font-mono">{row.requirement}</td></tr>)}</tbody></table></div></section>}
        </> : <p className="mt-6 text-sm text-slate-600">Enter a valid target and precursor route to calculate weighing masses.</p>}
      </section>
    </div>

    {displayed && <section aria-labelledby="summary-heading" className="mx-auto mb-6 max-w-[1500px] border-y border-slate-300 bg-white p-4 shadow-sm"><h2 id="summary-heading" className="font-semibold">Calculation summary</h2><dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-slate-600">Ideal crystal composition</dt><dd className="font-mono">{formatComposition(displayed.idealCrystalComposition.amounts)}</dd></div><div><dt className="text-slate-600">Intended feed composition</dt><dd className="font-mono">{formatComposition(displayed.intendedFeedComposition.amounts)}</dd></div><div><dt className="text-slate-600">Adjusted feed composition</dt><dd className="font-mono">{formatComposition(displayed.adjustedFeedComposition.amounts)}</dd></div><div><dt className="text-slate-600">Realized composition</dt><dd className="font-mono">{formatComposition(displayed.realizedComposition.amounts)}</dd></div><div><dt className="text-slate-600">Requested / basis</dt><dd>{displayed.batch.requestedMassGrams} g · {displayed.batch.basis}</dd></div><div><dt className="text-slate-600">Pre-round / final total</dt><dd>{displayed.batch.preRoundingTotalPrecursorMassGrams} g / {displayed.batch.finalRoundedTotalWeighingMassGrams} g</dd></div><div><dt className="text-slate-600">Largest elemental residual</dt><dd className="font-mono">{largestResidual(displayed)}</dd></div><div><dt className="text-slate-600">Versions</dt><dd>Engine {displayed.engineVersion} · atomic data {displayed.dataVersions.atomicWeights}</dd></div></dl><button aria-expanded={traceOpen} className="mt-4 min-h-10 rounded border border-slate-400 px-3 font-medium print:hidden" onClick={() => setTraceOpen(!traceOpen)}>{traceOpen ? "Close calculation trace" : "Open calculation trace"}</button>{traceOpen && <section aria-label="Calculation trace" className="mt-3 max-h-96 overflow-auto rounded border bg-slate-50 p-3 print:hidden"><ol className="space-y-3">{displayed.trace.map((step, index) => <li className="border-b border-slate-200 pb-2 text-sm" key={`${step.stepCode}-${index}`}><strong className="font-mono">{step.stepCode}</strong><p>{step.description}</p>{step.equation && <p className="font-mono text-xs">{step.equation}</p>}<p className="text-xs text-slate-600">Before: {Object.entries(step.before).map(([key, value]) => `${key}=${value}`).join(", ") || "—"} · After: {Object.entries(step.after).map(([key, value]) => `${key}=${value}`).join(", ") || "—"}</p></li>)}</ol></section>}<p className="mt-3 text-xs text-slate-600">Local-first workspace recovery is automatic. Recipe revisions are created only by explicit Save. Engine {ENGINE_VERSION}.</p></section>}
    {displayed && <section aria-labelledby="print-radius-heading" className="hidden mx-auto mb-6 max-w-[1500px] border-y border-slate-300 bg-white p-4 text-sm print:block"><h2 className="font-semibold" id="print-radius-heading">Site-radius screening descriptors</h2><p>Atomic-radius descriptors unavailable: no approved dataset is installed.</p><p>Screening descriptor only; not a direct prediction of physical stress, lattice strain, phase stability, or synthesis success.</p></section>}
  </main>;
}
