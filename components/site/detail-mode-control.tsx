"use client";

export type DetailMode = "standard" | "advanced";

/** Shared authoritative Standard/Advanced mode control used by calculator and comparison headers. */
export function DetailModeControl({ mode, onChange, ariaLabel, className = "" }: Readonly<{
  mode: DetailMode;
  onChange: (mode: DetailMode) => void;
  ariaLabel: string;
  className?: string;
}>) {
  return <div aria-label={ariaLabel} className={`segmented-control detail-mode-control ${className}`.trim()} role="group">
    <button aria-pressed={mode === "standard"} onClick={() => onChange("standard")} type="button">Standard</button>
    <button aria-pressed={mode === "advanced"} onClick={() => onChange("advanced")} type="button">Advanced</button>
  </div>;
}
