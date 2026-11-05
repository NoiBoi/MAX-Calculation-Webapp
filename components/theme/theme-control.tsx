"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTheme } from "./theme-provider";
import type { AppearancePreference } from "@/lib/theme/theme";

const OPTIONS = [
  { value: "light", label: "Light", icon: "☀" },
  { value: "dark", label: "Dark", icon: "◐" },
  { value: "midnight", label: "Midnight", icon: "●" },
  { value: "system", label: "Use system setting", icon: "▣" },
] as const;

export function ThemeControl() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const active = OPTIONS.find((option) => option.value === preference);
  const resolved = OPTIONS.find((option) => option.value === resolvedTheme);

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", dismiss);
    return () => window.removeEventListener("pointerdown", dismiss);
  }, [open]);

  const closeAndRestoreFocus = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeAndRestoreFocus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])];
    if (!items.length) return;
    event.preventDefault();
    const current = items.findIndex((item) => item === document.activeElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1
      : event.key === "ArrowDown" ? (current + 1) % items.length
      : current <= 0 ? items.length - 1 : current - 1;
    items[next]?.focus();
  };

  const choose = (next: AppearancePreference) => {
    void setPreference(next);
    closeAndRestoreFocus();
  };

  return <div className="theme-control" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }} onKeyDown={moveFocus} ref={root}>
    <button aria-label={`Change appearance. Current setting: ${active?.label}; active theme: ${resolvedTheme}.`} className="theme-toggle" onClick={() => void setPreference(resolvedTheme === "light" ? "dark" : "light")} title="Change appearance" type="button"><span aria-hidden="true">{resolved?.icon}</span></button>
    <button aria-controls={open ? menuId : undefined} aria-expanded={open} aria-haspopup="menu" aria-label="Open appearance menu" className="theme-menu-trigger" onClick={() => setOpen((value) => !value)} ref={trigger} title="Choose appearance" type="button"><span aria-hidden="true">▾</span></button>
    {open && <div aria-label="Appearance" className="theme-menu" id={menuId} role="menu">
      {OPTIONS.map(({ value, label, icon }) => <button aria-checked={preference === value} className="theme-menu-item" key={value} onClick={() => choose(value)} role="menuitemradio" type="button">
        <span aria-hidden="true">{icon}</span><span>{label}</span>{preference === value && <span aria-hidden="true">✓</span>}
      </button>)}
    </div>}
  </div>;
}
