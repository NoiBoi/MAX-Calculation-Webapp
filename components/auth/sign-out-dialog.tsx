"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-provider";
import { useCloudSync } from "../cloud/cloud-sync-provider";

export function SignOutDialog({ open, onClose }: Readonly<{ open: boolean; onClose: () => void }>) {
  const { signOut, pending } = useAuth();
  const cloud = useCloudSync();
  const dialog = useRef<HTMLDialogElement>(null);
  const [cache, setCache] = useState<"keep" | "remove">("keep");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (open && !dialog.current?.open) dialog.current?.showModal();
    if (!open && dialog.current?.open) dialog.current.close();
  }, [open]);
  const close = () => { dialog.current?.close(); onClose(); };
  const confirm = async () => {
    setMessage("");
    try {
      if (cache === "remove") {
        const result = await cloud.removeDownloadedCache();
        if (result.preservedPending) setMessage(`${result.preservedPending} local or pending record(s) were preserved on this device.`);
      }
      await signOut();
      close();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Sign-out could not be completed."); }
  };
  return <dialog aria-labelledby="sign-out-title" className="m-auto w-[min(94vw,36rem)] rounded-xl border-2 bg-white p-0 shadow-2xl backdrop:bg-slate-950/60" onCancel={(event) => { event.preventDefault(); close(); }} ref={dialog}>
    <form className="p-5" method="dialog" onSubmit={(event) => { event.preventDefault(); void confirm(); }}>
      <h2 className="text-xl font-bold" id="sign-out-title">Sign out</h2>
      <fieldset className="mt-4 space-y-3">
        <legend className="text-sm">Choose how downloaded cloud data is handled on this device. Cloud records are never deleted by this choice.</legend>
        <label className="flex gap-3 rounded border p-3"><input checked={cache === "keep"} name="cache" onChange={() => setCache("keep")} type="radio" /><span><strong>Keep downloaded data for this account</strong><br /><span className="text-sm">Safe default. It remains isolated from other accounts and returns when this account signs in again.</span></span></label>
        <label className="flex gap-3 rounded border p-3"><input checked={cache === "remove"} name="cache" onChange={() => setCache("remove")} type="radio" /><span><strong>Remove downloaded cloud cache from this device</strong><br /><span className="text-sm">Anonymous data and unsynchronized local changes are preserved.</span></span></label>
      </fieldset>
      <p className="mt-3 text-sm">Anonymous local data will remain.</p>
      {message && <p aria-live="assertive" className="mt-3 rounded border p-3 text-sm">{message}</p>}
      <div className="mt-5 flex justify-end gap-2"><button className="rounded border px-4 py-2" onClick={close} type="button">Cancel</button><button className="rounded bg-slate-900 px-4 py-2 font-semibold text-white disabled:bg-slate-400" disabled={pending} type="submit">{pending ? "Signing out…" : "Sign out"}</button></div>
    </form>
  </dialog>;
}
