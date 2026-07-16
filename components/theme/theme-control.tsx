"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "./theme-provider";
import type { AppearancePreference } from "@/lib/theme/theme";

const LABELS: Record<AppearancePreference, string> = { light: "Light", dark: "Dark", midnight: "Midnight", system: "Use system setting" };

export function ThemeControl() {
  const { preference, resolvedTheme, setPreference } = useTheme(); const [open, setOpen] = useState(false); const root = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!open) return; const dismiss = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); }; const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; window.addEventListener("pointerdown", dismiss); window.addEventListener("keydown", escape); return () => { window.removeEventListener("pointerdown", dismiss); window.removeEventListener("keydown", escape); }; }, [open]);
  const choose = (next: AppearancePreference) => { void setPreference(next); setOpen(false); };
  const toggle = () => void setPreference(resolvedTheme === "light" ? "dark" : "light");
  return <div className="theme-control" ref={root}>
    <button aria-label={`Change appearance. Current setting: ${LABELS[preference]}; active theme: ${resolvedTheme}.`} className="theme-toggle" onClick={toggle} title="Change appearance" type="button"><span aria-hidden="true">{resolvedTheme === "light" ? "☀" : resolvedTheme === "midnight" ? "●" : "◐"}</span></button>
    <button aria-expanded={open} aria-haspopup="menu" aria-label="Open appearance menu" className="theme-menu-trigger" onClick={() => setOpen((value) => !value)} title="Choose Light, Dark, or System" type="button">▾</button>
    {open && <div aria-label="Appearance" className="theme-menu" role="menu">{(["light", "dark", "midnight", "system"] as const).map((item) => <button aria-checked={preference === item} className="theme-menu-item" key={item} onClick={() => choose(item)} role="menuitemradio" type="button"><span aria-hidden="true">{item === "light" ? "☀" : item === "dark" ? "◐" : item === "midnight" ? "●" : "▣"}</span><span>{LABELS[item]}</span>{preference === item && <span aria-hidden="true">✓</span>}</button>)}</div>}
  </div>;
}
