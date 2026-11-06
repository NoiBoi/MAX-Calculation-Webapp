"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { useDismissibleLayer } from "./use-dismissible-layer";

export function ActionMenu({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const layerRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  useDismissibleLayer({ open, layerRef, triggerRef, onDismiss: () => setOpen(false) });

  return (
    <div className="relative">
      <button aria-controls={open ? id : undefined} aria-expanded={open} aria-label={label} className="ui-button header-navigation-button" onClick={() => setOpen((value) => !value)} ref={triggerRef} type="button">
        More <span aria-hidden="true">•••</span>
      </button>
      {open && <section aria-label={label} className="workbench-menu" id={id} ref={layerRef}>{children}</section>}
    </div>
  );
}
