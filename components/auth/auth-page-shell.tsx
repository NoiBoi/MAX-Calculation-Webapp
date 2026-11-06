import type { ReactNode } from "react";
import { AppHeader, PageContainer } from "@/components/site/app-header";

export function AuthPageShell({ title, description, children, wide = false }: Readonly<{ title: string; description: string; children: ReactNode; wide?: boolean }>) {
  return <>
    <AppHeader activeSection="account" status={description} title={title} />
    <main><PageContainer width="workspace">
      <div className={wide ? "account-content" : "workbench-panel padded-panel auth-card"}>{children}</div>
    </PageContainer></main>
  </>;
}

export function CloudUnavailable({ message }: { readonly message: string }) {
  return <div className="mt-5 rounded border border-amber-500 bg-amber-50 p-4"><h2 className="font-semibold">Cloud accounts unavailable</h2><p className="mt-1 text-sm">{message}</p><p className="mt-2 text-sm">The calculator, local recipes, comparisons, notes, backups, recovery, and printing continue to work without an account.</p></div>;
}
