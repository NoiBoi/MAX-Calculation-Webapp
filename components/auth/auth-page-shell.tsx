import type { ReactNode } from "react";
import { AppHeader, PageContainer } from "@/components/site/app-header";

export function AuthPageShell({ title, description, children, wide = false }: Readonly<{ title: string; description?: string; children: ReactNode; wide?: boolean }>) {
  return <>
    <AppHeader activeSection="account" status={description} title={title} />
    <main><PageContainer width="workspace">
      <div className={wide ? "account-content" : "workbench-panel padded-panel auth-card"}>{children}</div>
    </PageContainer></main>
  </>;
}

export function CloudUnavailable({ message }: { readonly message: string }) {
  return <div className="auth-unavailable">
    <h2 className="font-semibold">Cloud accounts unavailable</h2>
    <p className="mt-1 text-sm">This installation uses local storage.</p>
    <details className="mt-2 text-sm"><summary>Configuration details</summary><p className="mt-1">{message}</p></details>
  </div>;
}
