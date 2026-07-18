"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true); setMessage("");
    const client = getSupabaseBrowserClient();
    if (!client) { setMessage("Cloud accounts are not configured."); setPending(false); return; }
    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/reset-password")}`;
      const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw error;
      setMessage("If an eligible account exists, password-reset instructions have been sent.");
    } catch {
      setMessage("The reset request could not be completed. Check your connection and try again.");
    } finally { setPending(false); }
  };
  return <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}><label className="block text-sm font-semibold">Email<input autoComplete="email" className="mt-1 min-h-11 w-full rounded border px-3" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>{message && <p aria-live="polite" className="rounded border bg-slate-50 p-3 text-sm">{message}</p>}<button className="min-h-11 w-full rounded bg-teal-800 px-4 py-2 font-semibold text-white disabled:bg-slate-400" disabled={pending} type="submit">{pending ? "Requesting…" : "Send reset instructions"}</button><Link className="block text-center text-sm underline" href="/login">Return to sign in</Link></form>;
}

