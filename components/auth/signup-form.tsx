"use client";

import { useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export function SignupForm() {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [displayName, setDisplayName] = useState(""); const [pending, setPending] = useState(false); const [message, setMessage] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (pending) return; setPending(true); setMessage("");
    const client = getSupabaseBrowserClient(); if (!client) { setMessage("Cloud accounts are not configured."); setPending(false); return; }
    try { const { error } = await client.auth.signUp({ email: email.trim(), password, options: { data: { display_name: displayName.trim() }, emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/account")}` } }); if (error) throw error; setMessage("Check your email to confirm the account."); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Account creation failed."); } finally { setPending(false); }
  };
  return <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}><label className="block text-sm font-semibold">Display name<input autoComplete="name" className="mt-1 min-h-11 w-full rounded border px-3" maxLength={120} onChange={(event) => setDisplayName(event.target.value)} value={displayName} /></label><label className="block text-sm font-semibold">Email<input autoComplete="email" className="mt-1 min-h-11 w-full rounded border px-3" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label><label className="block text-sm font-semibold">Password<input autoComplete="new-password" className="mt-1 min-h-11 w-full rounded border px-3" minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>{message && <p aria-live="polite" className="rounded border bg-slate-50 p-3 text-sm">{message}</p>}<button className="min-h-11 w-full rounded bg-teal-800 px-4 py-2 font-semibold text-white disabled:bg-slate-400" disabled={pending} type="submit">{pending ? "Creating…" : "Create account"}</button></form>;
}

