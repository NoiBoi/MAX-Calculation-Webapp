"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

export interface SaveRecipeDialogValue { readonly name: string; readonly revisionNote: string }

export function SaveRecipeDialog({ open, initialName, currentRevisionNumber, scientificChanged, validationStatus, returnFocusRef, onClose, onSave }: {
  open: boolean;
  initialName: string;
  currentRevisionNumber?: number;
  scientificChanged: boolean;
  validationStatus: string;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onSave: (value: SaveRecipeDialogValue) => Promise<void>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null); const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName); const [revisionNote, setRevisionNote] = useState(""); const [error, setError] = useState(""); const [pending, setPending] = useState(false);
  const isNew = currentRevisionNumber === undefined; const createsRevision = isNew || scientificChanged;
  const close = () => { if (pending) return; onClose(); requestAnimationFrame(() => returnFocusRef.current?.focus()); };
  useEffect(() => {
    const dialog = dialogRef.current; if (!dialog) return;
    if (open && !dialog.open) { setName(initialName); setRevisionNote(""); setError(""); setPending(false); dialog.showModal(); requestAnimationFrame(() => { nameRef.current?.focus(); nameRef.current?.select(); }); }
    else if (!open && dialog.open) dialog.close();
  }, [initialName, open]);
  const submit = async () => {
    const trimmed = name.trim(); if (!trimmed) { setError("Enter a recipe name."); nameRef.current?.focus(); return; }
    setPending(true); setError("");
    try { await onSave({ name: trimmed, revisionNote }); onClose(); requestAnimationFrame(() => returnFocusRef.current?.focus()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The recipe could not be saved. Try again."); setPending(false); }
  };
  const revisionStatus = isNew ? "Creates revision 1 after confirmation" : scientificChanged ? `Creates new immutable revision ${currentRevisionNumber + 1}` : `Revision ${currentRevisionNumber} remains unchanged · metadata only`;
  return <dialog aria-labelledby="save-recipe-title" className="m-auto w-[min(94vw,34rem)] rounded-xl border-2 border-slate-800 bg-white p-0 shadow-2xl backdrop:bg-slate-950/60" onCancel={(event) => { event.preventDefault(); close(); }} onClose={() => { if (open) onClose(); }} ref={dialogRef}>
    <form className="p-5" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <h1 className="text-xl font-bold" id="save-recipe-title">Save recipe</h1>
      <p className="mt-1 text-sm text-slate-600">{revisionStatus}</p>
      <label className="mt-5 block text-sm font-semibold">Recipe name<input className="mt-1 min-h-11 w-full rounded border border-slate-400 px-3" maxLength={160} onChange={(event) => setName(event.target.value)} ref={nameRef} value={name} /></label>
      <div className="mt-4 grid gap-2 rounded bg-slate-100 p-3 text-sm sm:grid-cols-2"><p><strong>Revision</strong><br />{revisionStatus}</p><p><strong>Validation status</strong><br />{validationStatus}</p></div>
      <label className="mt-4 block text-sm font-semibold">Revision note<textarea className="mt-1 min-h-24 w-full resize-y rounded border border-slate-400 px-3 py-2 disabled:bg-slate-100" disabled={!createsRevision} maxLength={1000} onChange={(event) => setRevisionNote(event.target.value)} placeholder={createsRevision ? "Briefly describe the scientific change (optional)" : "A metadata-only rename does not create a revision"} value={revisionNote} /></label>
      {!createsRevision && <p className="mt-1 text-xs text-slate-600">Rename the recipe without rewriting any historical scientific snapshot.</p>}
      {error && <p aria-live="assertive" className="mt-4 rounded border border-red-400 bg-red-50 p-3 text-sm font-semibold text-red-900">{error}</p>}
      <div className="mt-5 flex justify-end gap-2"><button className="rounded border border-slate-400 px-4 py-2 font-semibold" disabled={pending} onClick={close} type="button">Cancel</button><button className="rounded bg-teal-800 px-4 py-2 font-semibold text-white disabled:bg-slate-400" disabled={pending} type="submit">{pending ? "Saving…" : isNew ? "Save recipe" : scientificChanged ? "Save revision" : "Rename recipe"}</button></div>
    </form>
  </dialog>;
}
