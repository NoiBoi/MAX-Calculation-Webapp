"use client";

import { useEffect, type RefObject } from "react";

export function useDismissibleLayer({ open, layerRef, triggerRef, onDismiss }: { open: boolean; layerRef: RefObject<HTMLElement | null>; triggerRef: RefObject<HTMLElement | null>; onDismiss: (reason: "outside" | "escape") => void }) {
  useEffect(() => {
    if (!open) return;
    const pointer = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null; if (!target) return;
      if (layerRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      if (target.closest("dialog,[role='dialog']")) return;
      onDismiss("outside");
    };
    const keyboard = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); onDismiss("escape"); requestAnimationFrame(() => triggerRef.current?.focus()); } };
    document.addEventListener("pointerdown", pointer, true); document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("pointerdown", pointer, true); document.removeEventListener("keydown", keyboard); };
  }, [layerRef, onDismiss, open, triggerRef]);
}
