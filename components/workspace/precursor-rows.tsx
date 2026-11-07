import { useId } from "react";
import { WorkbenchIcon } from "@/components/site/workbench-icon";
import type { WorkspacePrecursorInput } from "@/lib/workspace/presets";

interface PrecursorRowsProps {
  readonly precursors: readonly WorkspacePrecursorInput[];
  readonly advanced: boolean;
  readonly onChange: (index: number, patch: Partial<WorkspacePrecursorInput>) => void;
  readonly onNavigate: (index: number, direction: -1 | 1) => void;
  readonly onMove: (index: number, direction: -1 | 1) => void;
  readonly onRemove: (index: number) => void;
}

export function PrecursorRows({ precursors, advanced, onChange, onNavigate, onMove, onRemove }: PrecursorRowsProps) {
  const purityHelpId = useId();
  if (!precursors.length) return null;

  return <div className={advanced ? "precursor-editor is-advanced" : "precursor-editor"} role="group" aria-label="Precursor inputs">
    <div className="precursor-editor-row precursor-editor-heading" aria-hidden="true">
      <span>#</span><span>Formula</span><span>Purity (%)</span><span />
    </div>
    {precursors.map((item, index) => <div aria-label={`Route row ${index + 1}`} className="precursor-editor-row" key={item.id} role="group">
      <span aria-hidden="true" className="precursor-row-number">{index + 1}</span>
      <input aria-label={`Formula, precursor ${index + 1}`} className="px-2" data-precursor-formula data-primary-field id={`precursor-formula-${item.id}`} onChange={(event) => onChange(index, { formula: event.target.value, name: event.target.value || item.name })} onKeyDown={(event) => {
        if (!event.altKey || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
        event.preventDefault();
        onNavigate(index, event.key === "ArrowDown" ? 1 : -1);
      }} placeholder="e.g. Ti" spellCheck={false} value={item.formula} />
      <input aria-describedby={purityHelpId} aria-label={`Purity (%), precursor ${index + 1}`} className="px-2 text-right" data-primary-field id={`purity-${item.id}`} inputMode="decimal" onChange={(event) => onChange(index, { purityPercent: event.target.value })} placeholder="100 assumed" value={item.purityPercent} />
      <div className="precursor-row-actions command-group">
        {advanced && <>
          <button aria-label={`Move ${item.name} up`} className="ui-icon-button ui-button-compact" disabled={index === 0} onClick={() => onMove(index, -1)} type="button"><WorkbenchIcon name="up" /></button>
          <button aria-label={`Move ${item.name} down`} className="ui-icon-button ui-button-compact" disabled={index === precursors.length - 1} onClick={() => onMove(index, 1)} type="button"><WorkbenchIcon name="down" /></button>
        </>}
        <button aria-label={`Remove ${item.name}`} className="ui-icon-button ui-button-compact" onClick={() => onRemove(index)} title={`Remove precursor ${index + 1}`} type="button"><WorkbenchIcon name="close" /></button>
      </div>
    </div>)}
    <p className="precursor-purity-note" id={purityHelpId}>Purity values may include recipe defaults; verify against lot certificates. Blank assumes 100%.</p>
  </div>;
}
