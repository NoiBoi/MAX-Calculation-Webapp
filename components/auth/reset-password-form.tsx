"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useAuth } from "./auth-provider";

export function ResetPasswordForm() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [sessionAvailable, setSessionAvailable] = useState(Boolean(user));
  useEffect(() => { void refreshUser().then((current) => setSessionAvailable(Boolean(current))); }, [refreshUser]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (password !== confirmation) { setMessage("Passwords do not match."); return; }
    if (password.length < 8) { setMessage("Use at least eight characters."); return; }
    const client = getSupabaseBrowserClient();
    if (!client) { setMessage("Cloud accounts are not configured."); return; }
    setPending(true); setMessage("");
    try {
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
      setMessage("Password updated successfully.");
      setPassword(""); setConfirmation("");
      await refreshUser();
      setTimeout(() => { router.replace("/account"); router.refresh(); }, 600);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "The password could not be updated. The reset link may be invalid or expired.");
    } finally { setPending(false); }
  };
  if (!sessionAvailable) return <div className="mt-5 rounded border border-amber-500 bg-amber-50 p-4"><p className="font-semibold">No valid password-reset session is available.</p><p className="mt-1 text-sm">The link may be invalid or expired. Request a new reset email.</p><Link className="mt-3 inline-block underline" href="/forgot-password">Request another reset</Link></div>;
  return <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}><label className="block text-sm font-semibold">New password<input autoComplete="new-password" className="mt-1 min-h-11 w-full rounded border px-3" onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label><label className="block text-sm font-semibold">Confirm new password<input autoComplete="new-password" className="mt-1 min-h-11 w-full rounded border px-3" onChange={(event) => setConfirmation(event.target.value)} required type="password" value={confirmation} /></label>{message && <p aria-live="polite" className="rounded border bg-slate-50 p-3 text-sm font-semibold">{message}</p>}<button className="min-h-11 w-full rounded bg-teal-800 px-4 py-2 font-semibold text-white disabled:bg-slate-400" disabled={pending} type="submit">{pending ? "Updating…" : "Update password"}</button></form>;
}

