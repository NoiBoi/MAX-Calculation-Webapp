import Link from "next/link";
import type { ReactNode } from "react";
import { SiteBrand } from "@/components/site/site-brand";

export function AuthPageShell({ title, description, children, wide = false }: Readonly<{ title: string; description: string; children: ReactNode; wide?: boolean }>) {
  return <main className="auth-page min-h-screen bg-slate-100 p-4 text-slate-950"><section className={`auth-card mx-auto rounded-xl border bg-white p-6 shadow-sm ${wide ? "max-w-5xl" : "max-w-lg"}`} aria-labelledby="auth-page-title">
    <Link aria-label="Return to MAX Stoich calculator" className="inline-flex font-bold" href="/workspace"><SiteBrand /></Link>
    <h1 className="mt-6 text-2xl font-bold" id="auth-page-title">{title}</h1>
    <p className="mt-2 text-sm text-slate-600">{description}</p>
    {children}
  </section></main>;
}

export function CloudUnavailable({ message }: { readonly message: string }) {
  return <div className="mt-5 rounded border border-amber-500 bg-amber-50 p-4"><h2 className="font-semibold">Cloud accounts unavailable</h2><p className="mt-1 text-sm">{message}</p><p className="mt-2 text-sm">The calculator, local recipes, comparisons, notes, backups, recovery, and printing continue to work without an account.</p></div>;
}
