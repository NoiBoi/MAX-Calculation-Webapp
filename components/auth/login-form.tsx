"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { safeInternalPath } from "@/lib/auth/safe-redirect";
import { useAuth } from "./auth-provider";

export function LoginForm({ nextPath }: { readonly nextPath: string }) {
  const router = useRouter();
  const { refreshUser, signupsEnabled } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true); setError("");
    const client = getSupabaseBrowserClient();
    if (!client) { setError("Cloud accounts are not configured."); setPending(false); return; }
    try {
      const result = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      await refreshUser();
      router.replace(safeInternalPath(nextPath));
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in failed. Check your credentials and try again.");
    } finally { setPending(false); }
  };
  return <form className="mt-6 space-y-4" onSubmit={(event) => void submit(event)}>
    <label className="block text-sm font-semibold">Email<input autoComplete="email" className="mt-1 min-h-11 w-full rounded border px-3" inputMode="email" name="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
    <label className="block text-sm font-semibold">Password<span className="relative mt-1 block"><input autoComplete="current-password" className="min-h-11 w-full rounded border px-3 pr-20" name="password" onChange={(event) => setPassword(event.target.value)} required type={showPassword ? "text" : "password"} value={password} /><button aria-pressed={showPassword} className="absolute right-1 top-1 min-h-9 rounded px-3 text-xs font-semibold" onClick={() => setShowPassword((value) => !value)} type="button">{showPassword ? "Hide" : "Show"}</button></span></label>
    {error && <p aria-live="assertive" className="rounded border border-red-400 bg-red-50 p-3 text-sm font-semibold text-red-900">{error}</p>}
    <button className="min-h-11 w-full rounded bg-teal-800 px-4 py-2 font-semibold text-white disabled:bg-slate-400" disabled={pending} type="submit">{pending ? "Signing in…" : "Sign in"}</button>
    <div className="flex flex-wrap justify-between gap-3 text-sm"><Link className="underline" href="/forgot-password">Forgot password?</Link>{signupsEnabled ? <Link className="underline" href="/signup">Create account</Link> : <span className="text-slate-600">Accounts are invitation-only.</span>}</div>
    <Link className="block text-center text-sm underline" href="/workspace">Continue with the local calculator</Link>
  </form>;
}

