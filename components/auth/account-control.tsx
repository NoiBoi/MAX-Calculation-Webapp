"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "./auth-provider";
import { useCloudSync } from "../cloud/cloud-sync-provider";
import { SignOutDialog } from "./sign-out-dialog";

export function AccountControl() {
  const { configured, configurationMessage, user, pending, message } = useAuth();
  const cloud = useCloudSync();
  const [open, setOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", escape);
    return () => { window.removeEventListener("pointerdown", outside); window.removeEventListener("keydown", escape); };
  }, [open]);

  if (!configured) return <div className="account-control"><Link className="account-button" href="/login" title={configurationMessage}>Cloud setup</Link></div>;
  if (!user) return <div className="account-control"><Link className="account-button" href="/login">Sign in</Link>{message && <span aria-live="polite" className="account-toast">{message}</span>}</div>;
  return <div className="account-control" ref={root}>
    <button aria-expanded={open} aria-haspopup="menu" className="account-button" onClick={() => setOpen((value) => !value)} type="button"><span className="account-button-label">{user.displayName}</span><span aria-hidden="true">▾</span></button>
    {open && <div aria-label="Account" className="account-menu" role="menu">
      <p className="account-identity">{user.email}</p>
      <p className="account-cloud-status">Cloud account connected<br /><span>{cloud.statusLabel}</span></p>
      <button className="account-menu-item" disabled={cloud.pending || !cloud.online} onClick={() => void cloud.syncNow().then(() => setOpen(false))} role="menuitem" type="button">{cloud.pending ? "Syncing…" : "Sync now"}</button>
      <button className="account-menu-item" onClick={() => void (cloud.preferences.paused ? cloud.resume() : cloud.pause()).then(() => setOpen(false))} role="menuitem" type="button">{cloud.preferences.paused ? "Resume automatic sync" : "Pause automatic sync"}</button>
      <Link className="account-menu-item" href="/account" role="menuitem" onClick={() => setOpen(false)}>Account</Link>
      <Link className="account-menu-item" href="/account/cloud-data" role="menuitem" onClick={() => setOpen(false)}>Cloud data</Link>
      <Link className="account-menu-item" href="/labs" role="menuitem" onClick={() => setOpen(false)}>Private lab libraries</Link>
      {cloud.counts.pendingUpload > 0 && <Link className="account-menu-item" href="/account/cloud-data#pending" role="menuitem" onClick={() => setOpen(false)}>Review pending changes ({cloud.counts.pendingUpload})</Link>}
      {cloud.counts.conflicts > 0 && <Link className="account-menu-item" href="/account/cloud-data#conflicts" role="menuitem" onClick={() => setOpen(false)}>Review conflicts ({cloud.counts.conflicts})</Link>}
      <Link className="account-menu-item" href="/reset-password" role="menuitem" onClick={() => setOpen(false)}>Change password</Link>
      <button className="account-menu-item" disabled={pending} onClick={() => { setOpen(false); setSignOutOpen(true); }} role="menuitem" type="button">Sign out</button>
    </div>}
    {(message || cloud.notification) && <span aria-live="polite" className="account-toast">{message ?? cloud.notification}</span>}
    <SignOutDialog onClose={() => setSignOutOpen(false)} open={signOutOpen} />
  </div>;
}
