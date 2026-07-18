"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCloudSync } from "@/components/cloud/cloud-sync-provider";
import { getOrCreateInstallationId } from "@/lib/cloud/local-data-owner";
import { labApi } from "@/lib/labs/client";
import type { LabLibraryEntry, LabRole, LabSummary } from "@/lib/labs/types";
import type { CalculationSnapshot, RecipeNote, RecipeRevision, SavedRecipe } from "@/lib/persistence/entities";

export function PublishToLabDialog({ open, recipe, revision, snapshot, notes, labs, entries, onClose, onPublished }: {
  open: boolean; recipe?: SavedRecipe; revision?: RecipeRevision; snapshot?: CalculationSnapshot; notes: readonly RecipeNote[];
  labs: readonly LabSummary[]; entries: readonly LabLibraryEntry[]; onClose: () => void; onPublished: (message: string) => void;
}) {
  const cloud = useCloudSync();
  const ref = useRef<HTMLDialogElement>(null);
  const [labId,setLabId]=useState(""); const [title,setTitle]=useState(""); const [description,setDescription]=useState("");
  const [publicationNote,setPublicationNote]=useState(""); const [entryId,setEntryId]=useState(""); const [selected,setSelected]=useState<ReadonlySet<string>>(new Set());
  const [acknowledge,setAcknowledge]=useState(false); const [message,setMessage]=useState(""); const [pending,setPending]=useState(false);
  useEffect(()=>{const dialog=ref.current;if(!dialog)return;if(open&&!dialog.open){setLabId(labs[0]?.id??"");setTitle(recipe?.name??"");setDescription(recipe?.description??"");setPublicationNote("");setEntryId("");setSelected(new Set());setAcknowledge(false);setMessage("");dialog.showModal();}else if(!open&&dialog.open)dialog.close();},[labs,open,recipe]);
  const lab= labs.find((item)=>item.id===labId);
  const role:LabRole|undefined=lab?.role;
  const eligibleEntries=useMemo(()=>entries.filter((item)=>item.labId===labId&&item.visibilityStatus==="active"),[entries,labId]);
  const selectableNotes=notes.filter((note)=>note.recipeId===recipe?.id&&!note.archived&&(!note.recipeRevisionId||note.recipeRevisionId===revision?.id));
  const arithmetic=snapshot?.result.realizedElements.every((item)=>item.passesTolerance)?"Verified within weighing tolerance":"Review required";
  const publish=async()=>{if(!recipe||!revision||!snapshot||!lab)return;setPending(true);setMessage("");try{const target=entries.find((item)=>item.id===entryId);const result=await labApi.publish({labId:lab.id,...(target?{entryId:target.id,expectedEntryVersion:target.version}:{}),title:title.trim(),description,recipeId:recipe.id,revisionId:revision.id,publicationNote,selectedNoteIds:[...selected],...(acknowledge?{acknowledgeTargetChange:true}:{}),sourceDeviceId:getOrCreateInstallationId(),requestId:`publish-${crypto.randomUUID()}`});onPublished(`Published ${title} as ${lab.name} lab version ${result.versionNumber}. Personal revision ${revision.revisionNumber} remains private and unchanged.`);onClose();}catch(error){setMessage(error instanceof Error?error.message:"Publication failed.");}finally{setPending(false);}};
  return <dialog aria-labelledby="publish-lab-title" className="m-auto max-h-[92vh] w-[min(94vw,58rem)] overflow-auto rounded-xl border-2 border-slate-800 bg-white p-0 backdrop:bg-slate-950/60" onCancel={(event)=>{event.preventDefault();onClose();}} onClose={onClose} ref={ref}>
    <header className="sticky top-0 z-10 flex items-start gap-3 border-b bg-white p-4"><div className="mr-auto"><h2 className="text-xl font-bold" id="publish-lab-title">Publish immutable snapshot to lab</h2><p className="text-sm">Publication creates a lab-owned copy. Later personal edits and note changes cannot alter it.</p></div><button className="rounded border px-3 py-2" onClick={onClose}>Cancel</button></header>
    <div className="grid gap-4 p-4 sm:grid-cols-2">
      <label className="text-sm font-semibold">Destination lab<select className="mt-1 w-full rounded border p-2" onChange={(event)=>{setLabId(event.target.value);setEntryId("");}} value={labId}>{labs.filter((item)=>item.role!=="viewer").map((item)=><option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}</select></label>
      <label className="text-sm font-semibold">Publication mode<select className="mt-1 w-full rounded border p-2" onChange={(event)=>setEntryId(event.target.value)} value={entryId}><option value="">New lab entry</option>{eligibleEntries.map((item)=><option key={item.id} value={item.id}>New version of {item.title}</option>)}</select></label>
      <label className="text-sm font-semibold sm:col-span-2">Publication title<input className="mt-1 w-full rounded border px-3 py-2" onChange={(event)=>setTitle(event.target.value)} value={title}/></label>
      <label className="text-sm font-semibold sm:col-span-2">Description<textarea className="mt-1 w-full rounded border p-3" onChange={(event)=>setDescription(event.target.value)} value={description}/></label>
      <section className="rounded border bg-slate-50 p-3 text-sm sm:col-span-2"><h3 className="font-semibold">Immutable source confirmation</h3><dl className="mt-2 grid gap-2 sm:grid-cols-2"><div><dt>Personal source</dt><dd>{recipe?.name??"Unavailable"} · revision {revision?.revisionNumber??"—"}</dd></div><div><dt>Target formula</dt><dd className="font-mono">{revision?.inputState.targetFormula??"—"}</dd></div><div><dt>Adjusted intended feed</dt><dd className="font-mono">{snapshot?.result.adjustedFeedComposition?Object.entries(snapshot.result.adjustedFeedComposition.amounts).map(([element,value])=>`${element}${value==="1"?"":value}`).join(""):"—"}</dd></div><div><dt>Validation</dt><dd>{snapshot?.validationStatus??"Unavailable"} · {arithmetic}</dd></div><div><dt>Engine/schema</dt><dd>{revision?.engineVersion??"—"} · {revision?.schemaVersion??"—"}</dd></div><div><dt>Warnings</dt><dd>{snapshot?.result.warnings.length??0}</dd></div></dl></section>
      <label className="text-sm font-semibold sm:col-span-2">Publication note<textarea className="mt-1 min-h-24 w-full rounded border p-3" onChange={(event)=>setPublicationNote(event.target.value)} value={publicationNote}/></label>
      <section className="sm:col-span-2"><h3 className="font-semibold">Selected note snapshots</h3><p className="text-xs">No notes are selected by default. Each selected note is copied into the immutable publication; later private edits remain private.</p><div className="mt-2 space-y-2">{selectableNotes.map((note)=><label className="flex items-start gap-2 rounded border p-3 text-sm" key={note.id}><input checked={selected.has(note.id)} onChange={()=>setSelected((current)=>{const next=new Set(current);if(next.has(note.id))next.delete(note.id);else next.add(note.id);return next;})} type="checkbox"/><span><strong>{note.category}: {note.title}</strong><span className="mt-1 block whitespace-pre-wrap">{note.body}</span></span></label>)}{!selectableNotes.length&&<p className="rounded border border-dashed p-3 text-sm">No active notes attached to this recipe or revision.</p>}</div></section>
      {entryId&&<label className="flex items-start gap-2 rounded border border-amber-400 p-3 text-sm sm:col-span-2"><input checked={acknowledge} onChange={(event)=>setAcknowledge(event.target.checked)} type="checkbox"/>I acknowledge that a target-formula change, if present, is intentional. The server still checks entry version and publishing permission.</label>}
      {message&&<p aria-live="assertive" className="rounded border border-red-400 bg-red-50 p-3 text-sm sm:col-span-2">{message}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2 sm:col-span-2"><span className="mr-auto text-xs">Published calculation does not imply experimental synthesis success.</span><button className="rounded bg-teal-900 px-4 py-2 font-semibold text-white disabled:bg-slate-400" disabled={pending||!cloud.online||!title.trim()||!lab||role==="viewer"||!recipe||!revision||!snapshot} onClick={()=>void publish()}>{pending?"Publishing…":entryId?"Publish new lab version":"Publish to lab"}</button></div>
    </div>
  </dialog>;
}
