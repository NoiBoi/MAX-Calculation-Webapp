"use client";

import Link from "next/link";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import type { AuthUserSummary } from "@/lib/supabase/types";
import { getOrCreateInstallationId } from "@/lib/cloud/local-data-owner";
import { useAuth } from "./auth-provider";
import { useCloudSync } from "../cloud/cloud-sync-provider";
import { SignOutDialog } from "./sign-out-dialog";

interface AccountPanelProps {
  readonly user: AuthUserSummary;
  readonly initialDisplayName: string;
  readonly profileError?: string;
}

const subscribeToInstallationId = () => () => undefined;
const installationIdServerSnapshot = () => "Loading…";
const installationIdBrowserSnapshot = () => {
  try { return getOrCreateInstallationId(); }
  catch { return "Unavailable in this browser"; }
};

export function AccountPanel({ user, initialDisplayName, profileError }: AccountPanelProps) {
  const { pending: authPending, refreshUser } = useAuth();
  const cloud = useCloudSync();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const installationId = useSyncExternalStore(subscribeToInstallationId, installationIdBrowserSnapshot, installationIdServerSnapshot);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(profileError ?? "");
  const [signOutOpen, setSignOutOpen] = useState(false);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true); setMessage("");
    try {
      const response = await fetch("/api/account/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName }) });
      const result = await response.json() as { message?: string; displayName?: string };
      if (!response.ok) throw new Error(result.message ?? "The profile could not be updated.");
      setDisplayName(result.displayName ?? displayName.trim());
      await refreshUser();
      setMessage(result.message ?? "Display name updated.");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "The profile could not be updated.");
    } finally { setPending(false); }
  };

  return <div className="account-page-grid mt-6 grid gap-5 lg:grid-cols-2">
    <section className="rounded-lg border bg-white p-5" aria-labelledby="profile-heading">
      <h2 className="text-lg font-semibold" id="profile-heading">Authentication account</h2>
      <form className="mt-4 space-y-4" onSubmit={(event) => void save(event)}>
        <label className="block text-sm font-semibold">Display name<input autoComplete="name" className="mt-1 min-h-11 w-full rounded border px-3" maxLength={120} onChange={(event) => setDisplayName(event.target.value)} type="text" value={displayName} /></label>
        <label className="block text-sm font-semibold">Email<input className="mt-1 min-h-11 w-full rounded border bg-slate-100 px-3" readOnly type="email" value={user.email} /></label>
        <dl className="grid gap-3 text-sm sm:grid-cols-2"><div><dt className="font-semibold">Email status</dt><dd>{user.emailConfirmed ? "Verified" : "Not verified"}</dd></div><div><dt className="font-semibold">Account created</dt><dd>{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "Unavailable"}</dd></div></dl>
        {message && <p aria-live="polite" className="rounded border bg-slate-50 p-3 text-sm">{message}</p>}
        <div className="flex flex-wrap gap-3"><button className="rounded bg-teal-800 px-4 py-2 font-semibold text-white disabled:bg-slate-400" disabled={pending} type="submit">{pending ? "Saving…" : "Save display name"}</button><Link className="rounded border px-4 py-2 font-semibold" href="/reset-password">Change password</Link></div>
      </form>
    </section>
    <div className="grid content-start gap-5">
      <section className="rounded-lg border bg-white p-5" id="cloud-status" aria-labelledby="cloud-heading">
        <h2 className="text-lg font-semibold" id="cloud-heading">Cloud status</h2>
        <p className="mt-2 font-semibold text-teal-800">{cloud.statusLabel}</p>
        <p className="mt-2 text-sm">Synchronization runs only when you choose it. Local calculations and saves remain available offline.</p>
        <div className="mt-3 flex flex-wrap gap-2"><button className="rounded bg-teal-800 px-3 py-2 font-semibold text-white disabled:bg-slate-400" disabled={cloud.pending || !cloud.online} onClick={() => void cloud.syncNow()} type="button">{cloud.pending ? "Syncing…" : "Sync now"}</button><Link className="rounded border px-3 py-2 font-semibold" href="/account/cloud-data">Manage cloud data</Link></div>
      </section>
      <section className="rounded-lg border bg-white p-5" aria-labelledby="local-heading">
        <h2 className="text-lg font-semibold" id="local-heading">Local MAXCalc data</h2>
        <p className="mt-2 text-sm">This account&apos;s downloaded data is held in a separate IndexedDB cache. Anonymous data and other account caches remain physically separate.</p>
        <dl className="mt-3 text-sm"><dt className="font-semibold">Device installation ID</dt><dd className="mt-1 break-all font-mono text-xs">{installationId || "Loading…"}</dd></dl>
        <Link className="mt-3 inline-block underline" href="/settings">Open local data and backup settings</Link>
      </section>
      <button className="justify-self-start rounded border border-red-400 px-4 py-2 font-semibold disabled:text-slate-400" disabled={authPending} onClick={() => setSignOutOpen(true)} type="button">Sign out</button>
      <SignOutDialog onClose={() => setSignOutOpen(false)} open={signOutOpen} />
    </div>
  </div>;
}
