"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

export type WorkspaceId = "calculator" | "comparison" | "emi" | "xrd";

const WORKSPACES = [
  { id: "calculator", href: "/workspace", name: "Calculator", description: "Stoichiometry & synthesis calculations", icon: "∑", development: false },
  { id: "comparison", href: "/compare", name: "Comparison", description: "Compare recipes and calculated properties", icon: "⇄", development: false },
  { id: "emi", href: "/emi", name: "EMI Analysis", description: "Analyze, visualize, and export EMI measurements", icon: "≈", development: false },
  { id: "xrd", href: "/xrd", name: "XRD Analysis", description: "Diffraction analysis", icon: "⌁", development: true },
] as const;

export function WorkspaceSwitcher({ activeWorkspace }: Readonly<{ activeWorkspace?: WorkspaceId }>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const active = WORKSPACES.find((workspace) => workspace.id === activeWorkspace);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => { if (!rootRef.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, [open]);

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...(rootRef.current?.querySelectorAll<HTMLAnchorElement>("[role=menuitem]") ?? [])];
    if (!items.length) return;
    event.preventDefault();
    const current = items.indexOf(document.activeElement as HTMLAnchorElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1 + items.length) % items.length : (current - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  return <div className="workspace-switcher" onKeyDown={moveFocus} ref={rootRef}>
    <button aria-controls="workspace-menu" aria-expanded={open} aria-haspopup="menu" className="workspace-switcher-trigger" onClick={() => setOpen((value) => !value)} ref={triggerRef} type="button">
      <span className="workspace-switcher-trigger-icon" aria-hidden="true">{active?.icon ?? "⌘"}</span>
      <span className="workspace-switcher-label">{active?.name ?? "Choose workspace"}</span>
      <svg aria-hidden="true" className="workspace-switcher-chevron" fill="none" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" /></svg>
    </button>
    {open && <div aria-label="MAXCalc workspaces" className="workspace-menu" id="workspace-menu" role="menu">
      <p className="workspace-menu-label">Workspaces</p>
      {WORKSPACES.map((workspace) => <Link aria-current={workspace.id === activeWorkspace ? "page" : undefined} className={`workspace-menu-item ${workspace.id === activeWorkspace ? "is-active" : ""}`} href={workspace.href} key={workspace.id} onClick={() => setOpen(false)} role="menuitem">
        <span className="workspace-menu-icon" aria-hidden="true">{workspace.icon}</span>
        <span className="workspace-menu-copy"><strong>{workspace.name}</strong><small>{workspace.description}</small></span>
        {workspace.development && <span className="workspace-menu-badge">In development</span>}
      </Link>)}
      <Link className="workspace-menu-utility" href="/settings" onClick={() => setOpen(false)} role="menuitem"><span aria-hidden="true">⚙</span><span>Settings</span></Link>
    </div>}
  </div>;
}
