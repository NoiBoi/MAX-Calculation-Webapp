"use client";

import { useEffect, useRef, useState } from "react";
import type { MaxStoichDatabase } from "@/lib/persistence/database";
import type { CalculationSnapshot, RecipeRevision, SavedRecipe } from "@/lib/persistence/entities";
import { findSample, registerSample, type LocalSample } from "@/lib/persistence/samples";
import { buildWeighingSummary } from "@/lib/presentation/weighing-summary";
import { createPrintJob, launchPrintJob } from "@/lib/print/print-model";
import type { PrintSettings } from "@/lib/settings/user-settings";

interface Props {
  readonly database: MaxStoichDatabase;
  readonly recipe?: SavedRecipe;
  readonly revision?: RecipeRevision;
  readonly printSettings: PrintSettings;
  readonly onClose: () => void;
}

async function readSampleDetails(database: MaxStoichDatabase, sample: LocalSample) {
  const [recipe, revision] = await Promise.all([
    database.recipes.get(sample.recipeId),
    database.recipeRevisions.get(sample.recipeRevisionId),
  ]);
  const snapshot = revision && await database.snapshots.get(revision.snapshotId);
  return { recipe, revision, snapshot };
}

export function SampleIdsDialog({ database, recipe, revision, printSettings, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const revisionId = revision?.id;
  const [query, setQuery] = useState("");
  const [samples, setSamples] = useState<readonly LocalSample[]>([]);
  const [selected, setSelected] = useState<LocalSample>();
  const [details, setDetails] = useState<Awaited<ReturnType<typeof readSampleDetails>>>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    if (!revisionId) return;
    let active = true;
    void database.samples.where("recipeRevisionId").equals(revisionId).reverse().sortBy("createdAt").then((stored) => {
      if (active) setSamples((current) => [...current, ...stored.filter((sample) => !current.some((item) => item.id === sample.id))]);
    }).catch(() => { if (active) setMessage("Could not read the IDs for this revision."); });
    return () => { active = false; };
  }, [database, revisionId]);

  const showSample = async (sample: LocalSample | undefined) => {
    setSelected(sample);
    setDetails(undefined);
    if (sample) setDetails(await readSampleDetails(database, sample));
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    try { await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Sample action failed. Try again."); }
    finally { setBusy(false); }
  };

  const printSample = (sample: LocalSample, saved: SavedRecipe, linked: RecipeRevision, snapshot: CalculationSnapshot) => {
    const sourceStatus = `Saved revision ${linked.revisionNumber}`;
    try {
      const summary = buildWeighingSummary({ title: saved.name, sourceStatus, inputState: linked.inputState, result: snapshot.result, validationStatus: saved.validationStatus, isHistorical: true });
      launchPrintJob(createPrintJob({ kind: "recipe", title: saved.name, singleRecipeDetailed: true, settings: printSettings, entries: [{ id: sample.id, sampleLabel: sample.label, summary }] }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not open the weighing sheet."); }
  };

  const printable = selected && details?.recipe?.id === selected.recipeId
    && details.revision?.recipeId === selected.recipeId && details.revision.id === selected.recipeRevisionId
    && details.snapshot?.recipeRevisionId === selected.recipeRevisionId && details.snapshot.recipeId === selected.recipeId
    ? { sample: selected, recipe: details.recipe, revision: details.revision, snapshot: details.snapshot }
    : undefined;

  return <dialog aria-labelledby="sample-ids-title" className="m-auto max-h-[90dvh] w-[min(94vw,36rem)] overflow-auto p-0" ref={dialog} onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <header className="flex items-center justify-between gap-3 border-b border-slate-300 px-4 py-3">
      <h2 className="text-lg font-semibold" id="sample-ids-title">Sample IDs</h2>
      <button className="ui-button ui-button-compact" onClick={onClose} type="button">Close</button>
    </header>
    <div className="grid gap-3 p-4">
      <p className="text-sm text-slate-600">Local to this browser and profile. IDs are unique here and stay reserved if a recipe is deleted. They are separate from cloud sync and recipe backups.</p>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
        event.preventDefault();
        void run(async () => {
          await showSample(undefined);
          const sample = await findSample(database, query);
          if (!sample) { setMessage("No sample with that ID was found in this profile."); return; }
          await showSample(sample);
        });
      }}>
        <label className="min-w-0 flex-1 text-sm" htmlFor="sample-id-query">Find sample ID
          <input className="block w-full rounded border px-2" id="sample-id-query" onChange={(event) => setQuery(event.target.value)} placeholder="M-7K4P2Q8R5T" spellCheck={false} value={query} />
        </label>
        <button className="ui-button" disabled={busy || !query.trim()} type="submit">Find</button>
      </form>
      {recipe && revision && <section aria-label="Register sample from saved revision" className="grid gap-2 border-t border-slate-300 pt-3">
        <p className="text-sm">Register a distinct sample from <strong>{recipe.name}</strong> · saved revision {revision.revisionNumber}. The sample uses this revision’s stored calculation.</p>
        <div><button className="ui-button ui-button-primary" disabled={busy} onClick={() => void run(async () => {
          const sample = await registerSample(database, revision.id);
          setSamples((current) => [sample, ...current.filter((item) => item.id !== sample.id)]);
          await showSample(sample);
          setMessage(`Registered ${sample.label}.`);
        })} type="button">Register new sample</button></div>
        {samples.length > 0 && <ul aria-label="IDs for this revision" className="flex max-h-32 flex-wrap gap-2 overflow-auto">
          {samples.map((sample) => <li key={sample.id}><button aria-pressed={selected?.id === sample.id} className="ui-button ui-button-compact font-mono" disabled={busy} onClick={() => void run(() => showSample(sample))} type="button">{sample.label}</button></li>)}
        </ul>}
      </section>}
      {!revision && <p className="text-sm text-slate-600">Save or open a recipe revision to register a sample.</p>}
      {selected && <section aria-label="Sample details" className="grid gap-2 border-t border-slate-300 pt-3">
        <h3 className="select-text font-mono text-base font-semibold">{selected.label}</h3>
        <p className="text-sm text-slate-600">Created {new Date(selected.createdAt).toLocaleString()}</p>
        {printable ? <p className="text-sm">{printable.recipe.name} · revision {printable.revision.revisionNumber} · {printable.revision.inputState.targetFormula}</p>
          : !busy && <p className="text-sm">The linked saved revision or calculation is unavailable in this profile.</p>}
        <div className="flex flex-wrap gap-2">
          <button className="ui-button ui-button-compact" disabled={busy} onClick={() => void run(async () => { await navigator.clipboard.writeText(selected.label); setMessage("Sample ID copied."); })} type="button">Copy ID</button>
          {printable && <button className="ui-button ui-button-compact" disabled={busy} onClick={() => printSample(printable.sample, printable.recipe, printable.revision, printable.snapshot)} type="button">Print weighing sheet</button>}
        </div>
      </section>}
      <p className="text-sm text-slate-600" role="status">{message}</p>
    </div>
  </dialog>;
}
