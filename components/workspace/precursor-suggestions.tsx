import { useRef, type KeyboardEvent } from "react";
import type { WorkspacePrecursorSuggestion } from "@/lib/workspace/precursor-additions";

interface Props {
  readonly enabled: boolean;
  readonly open: boolean;
  readonly loading: boolean;
  readonly message?: string;
  readonly suggestions: readonly WorkspacePrecursorSuggestion[];
  readonly onOpenChange: (open: boolean) => void;
  readonly onAdd: (suggestion: WorkspacePrecursorSuggestion) => void;
}

export function PrecursorSuggestions({ enabled, open, loading, message, suggestions, onOpenChange, onAdd }: Props) {
  const trigger = useRef<HTMLButtonElement>(null);
  if (!enabled) return null;
  const close = () => {
    onOpenChange(false);
    trigger.current?.focus();
  };
  const navigate = (event: KeyboardEvent<HTMLElement>) => {
    if (!open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-add-suggestion]")];
    if (!buttons.length) return;
    event.preventDefault();
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = index < 0 ? (event.key === "ArrowDown" ? 0 : buttons.length - 1)
      : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  };

  return <div className="precursor-assistance" onKeyDown={navigate}>
    <div className="precursor-assistance-bar">
      <span aria-live="polite">{message}</span>
      <button aria-controls={open ? "precursor-suggestions" : undefined} aria-expanded={open} className="ui-button ui-button-compact" onClick={() => onOpenChange(!open)} ref={trigger} type="button">Suggest precursors</button>
    </div>
    {open && <section aria-labelledby="precursor-suggestions-heading" className="precursor-suggestions" id="precursor-suggestions">
      <h4 id="precursor-suggestions-heading">Suggested additions</h4>
      <p>Checks elemental balance before constraints. Review materials and purity before use.</p>
      {suggestions.map((suggestion) => {
        const formulas = suggestion.materials.map((item) => item.formula).join(", ");
        const purities = suggestion.materials.filter((item) => item.defaultPurityPercent).map((item) => `${item.formula} ${item.defaultPurityPercent}%`);
        return <article className="precursor-suggestion" key={suggestion.id}>
          <div>
            <strong>{formulas}</strong>
            <p>{suggestion.source === "saved-route" ? "Saved route · " : ""}{suggestion.name} · {suggestion.validation} · {suggestion.complete ? "Balance possible" : `Still needs ${suggestion.missing.join(", ")}`}</p>
            {purities.length > 0 && <p>Stored purity · {purities.join(", ")}</p>}
            {suggestion.introduced.length > 0 && <p>Also introduces {suggestion.introduced.join(", ")}.</p>}
          </div>
          <button aria-label={`Add ${formulas}`} className="ui-button ui-button-compact" data-add-suggestion onClick={() => onAdd(suggestion)} type="button">Add</button>
        </article>;
      })}
      {!suggestions.length && <p role="status">{loading ? "Checking saved routes…" : "No suitable additions found. You can still enter materials manually."}</p>}
    </section>}
  </div>;
}
