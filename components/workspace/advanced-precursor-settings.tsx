import type { WorkspacePrecursorInput } from "@/lib/workspace/presets";

interface Props {
  readonly precursors: readonly WorkspacePrecursorInput[];
  readonly onChange: (index: number, patch: Partial<WorkspacePrecursorInput>) => void;
}

export function PrecursorConstraints({ precursors, onChange }: Props) {
  if (!precursors.length) return null;
  return <div className="advanced-precursor-settings">
    <h3>Precursor constraints</h3>
    <p>Quantities are in mol precursor per mol target formula.</p>
    {precursors.map((item, index) => <fieldset className="advanced-precursor-fields" key={item.id}>
      <legend>{item.name}</legend>
      <label>Control<select aria-label={`${item.name} control`} onChange={(event) => onChange(index, { constraintMode: event.target.value as WorkspacePrecursorInput["constraintMode"] })} value={item.constraintMode}>
        <option value="solver">Solver</option><option value="fixed">Fixed</option><option value="bounded">Bounded</option><option value="ratio">Ratio</option>
      </select></label>
      {item.constraintMode === "fixed" && <label>Quantity<input aria-label={`${item.name} fixed quantity`} inputMode="decimal" onChange={(event) => onChange(index, { fixedValue: event.target.value })} value={item.fixedValue} /></label>}
      {item.constraintMode === "bounded" && <>
        <label>Minimum<input aria-label={`${item.name} minimum`} inputMode="decimal" onChange={(event) => onChange(index, { minimum: event.target.value })} value={item.minimum} /></label>
        <label>Maximum<input aria-label={`${item.name} maximum`} inputMode="decimal" onChange={(event) => onChange(index, { maximum: event.target.value })} value={item.maximum} /></label>
      </>}
      {item.constraintMode === "ratio" && <>
        <label>Ratio denominator<select aria-label={`${item.name} ratio denominator`} onChange={(event) => onChange(index, { ratioDenominatorId: event.target.value })} value={item.ratioDenominatorId}>
          <option value="">Choose precursor</option>
          {precursors.filter((candidate) => candidate.id !== item.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
        </select></label>
        <label>Numerator<input aria-label={`${item.name} numerator ratio`} inputMode="decimal" onChange={(event) => onChange(index, { numeratorRatio: event.target.value })} value={item.numeratorRatio} /></label>
        <label>Denominator<input aria-label={`${item.name} denominator ratio`} inputMode="decimal" onChange={(event) => onChange(index, { denominatorRatio: event.target.value })} value={item.denominatorRatio} /></label>
      </>}
    </fieldset>)}
  </div>;
}

export function MaterialOverrides({ precursors, onChange }: Props) {
  if (!precursors.length) return null;
  return <div className="advanced-precursor-settings">
    <h3>Molar-mass overrides</h3>
    {precursors.map((item, index) => <fieldset className="advanced-precursor-fields" key={item.id}>
      <legend>{item.name}</legend>
      <label>Molar-mass override (g/mol)<input aria-label={`${item.name} molar mass override`} inputMode="decimal" onChange={(event) => onChange(index, { molarMassOverride: event.target.value })} value={item.molarMassOverride} /></label>
      <label>Override source<input aria-label={`${item.name} override source`} onChange={(event) => onChange(index, { molarMassOverrideSource: event.target.value })} placeholder="Required with override" value={item.molarMassOverrideSource} /></label>
    </fieldset>)}
  </div>;
}
