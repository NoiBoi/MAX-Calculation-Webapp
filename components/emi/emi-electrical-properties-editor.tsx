"use client";

import {
  FOUR_POINT_PROBE_CORRECTION_FACTOR,
  calculateElectricalProperty,
  calculateElectricalPropertySummary,
  calculateSimonSeries,
} from "@max-stoich/chemistry-engine";
import { calculateEmiElectricalRecord, type EmiElectricalPropertyRecord, type EmiThicknessConflict } from "@/lib/emi/project";

function scientific(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? "Unavailable" : value.toLocaleString(undefined, { maximumSignificantDigits: 10 });
}

export function EmiElectricalPropertiesEditor({ filename, frequenciesHz, value, thicknessLabel, enteredThicknessLabel, thicknessMicrometers, thicknessConflict, onChange, onEditSampleThickness, onResolveThicknessConflict }: Readonly<{
  filename: string;
  frequenciesHz: readonly number[];
  value?: EmiElectricalPropertyRecord;
  thicknessLabel: string;
  enteredThicknessLabel?: string;
  thicknessMicrometers: number | null;
  thicknessConflict?: EmiThicknessConflict;
  onChange: (value: EmiElectricalPropertyRecord) => void;
  onEditSampleThickness: () => void;
  onResolveThicknessConflict: (source: "metadata" | "legacy-electrical") => void;
}>) {
  const readings = value?.rawResistanceReadingsOhm ?? [];
  const correctionFactor = value?.correctionFactor ?? FOUR_POINT_PROBE_CORRECTION_FACTOR;
  const calculation = calculateElectricalPropertySummary({ rawResistanceReadingsOhm: readings, thicknessMicrometers, correctionFactor });
  const update = (next: Readonly<{ rawResistanceReadingsOhm?: readonly (number | null)[]; measurementNote?: string }>) => onChange(calculateEmiElectricalRecord({
    thicknessMicrometers,
    rawResistanceReadingsOhm: next.rawResistanceReadingsOhm ?? readings,
    correctionFactor,
    measurementNote: next.measurementNote !== undefined ? next.measurementNote : value?.measurementNote,
  }));
  const simon = calculation.ok ? calculateSimonSeries({ frequencyPointsHz: frequenciesHz, conductivitySiemensPerCentimeter: calculation.value.aggregate.conductivitySiemensPerCentimeter, thicknessMicrometers }) : null;

  return <section className="emi-electrical-editor" aria-labelledby={`emi-electrical-heading-${filename}`}>
    <div className="emi-editor-heading">
      <div><span className="emi-step-kicker">Optional theoretical comparison</span><h3 id={`emi-electrical-heading-${filename}`}>Four-point resistance &amp; Simon estimate</h3><p>Enter each raw four-point-probe resistance in Ω. MAXCalc averages the readings, applies the fixed geometric correction factor 4.532, then derives conductivity for the Simon estimate.</p></div>
      <span className={`emi-readiness-badge ${calculation.ok ? "emi-readiness-ready" : "emi-readiness-optional"}`}>{calculation.ok ? "Simon ready" : "Optional"}</span>
    </div>
    {thicknessConflict && <div className="emi-thickness-conflict" role="alert">
      <strong>Resolve conflicting saved thickness values</strong>
      <p>Sample metadata contains {thicknessConflict.metadataThickness.value} {thicknessConflict.metadataThickness.unit}, while the legacy electrical section contains {thicknessConflict.legacyElectricalThicknessMicrometers} µm. Both values are preserved. Electrical and Simon calculations are paused until you choose one.</p>
      <div className="emi-export-actions"><button className="ui-button" onClick={() => onResolveThicknessConflict("metadata")} type="button">Use sample metadata</button><button className="ui-button" onClick={() => onResolveThicknessConflict("legacy-electrical")} type="button">Use legacy electrical value</button></div>
    </div>}
    <dl className="emi-electrical-context">
      <div><dt>Thickness used</dt><dd>{thicknessConflict ? "Conflict unresolved" : thicknessLabel}</dd></div>
      {!thicknessConflict && enteredThicknessLabel && enteredThicknessLabel !== thicknessLabel && <div><dt>Entered as</dt><dd>{enteredThicknessLabel}</dd></div>}
      <div><dt>Geometric correction factor</dt><dd>{correctionFactor}</dd></div>
      <div><dt>Simon status</dt><dd>{thicknessConflict ? "Paused" : calculation.ok ? "Ready to plot" : thicknessMicrometers === null ? "Add thickness first" : "Add resistance readings"}</dd></div>
    </dl>
    <div className="emi-reading-heading"><div><h4>Resistance readings</h4><p>Use repeat readings from the same sample. VNA analysis still works if this section is left blank.</p></div><div className="emi-inline-actions"><button className="ui-button ui-button-compact" onClick={onEditSampleThickness} type="button">Edit thickness</button><button className="ui-button ui-button-compact ui-button-primary" onClick={() => update({ rawResistanceReadingsOhm: [...readings, null] })} type="button">{readings.length === 0 ? "Add first reading" : "Add reading"}</button></div></div>
    {readings.length === 0 ? <div className="emi-electrical-empty"><strong>No resistance readings yet</strong><span>Add readings only if you want the theoretical Simon comparison.</span></div> : <div className="emi-reading-grid">{readings.map((reading, index) => {
      const result = calculateElectricalProperty({ rawResistanceOhm: reading, thicknessMicrometers, correctionFactor });
      return <div className="emi-reading-card" key={index}><div className="emi-reading-card-head"><strong>Reading {index + 1}</strong><button aria-label={`Remove resistance reading ${index + 1} for ${filename}`} className="emi-icon-button" onClick={() => update({ rawResistanceReadingsOhm: readings.filter((_, candidateIndex) => candidateIndex !== index) })} type="button">Remove</button></div><label>Raw resistance <span className="emi-input-with-suffix"><input aria-label={`Raw four-point-probe resistance ${index + 1} for ${filename}`} min="0" onChange={(event) => update({ rawResistanceReadingsOhm: readings.map((candidate, candidateIndex) => candidateIndex === index ? event.target.value === "" ? null : Number(event.target.value) : candidate) })} step="any" type="number" value={reading ?? ""} /><span>Ω</span></span></label><dl><div><dt>Sheet resistance</dt><dd>{result.ok ? `${scientific(result.value.sheetResistanceOhmPerSquare)} Ω/sq` : "—"}</dd></div><div><dt>Conductivity</dt><dd>{result.ok ? `${scientific(result.value.conductivitySiemensPerMeter)} S/m` : "—"}</dd></div></dl></div>;
    })}</div>}
    {!calculation.ok && readings.length > 0 && !thicknessConflict && <ul className="emi-electrical-errors" role="alert">{calculation.errors.map((error, index) => <li key={`${error.code}-${error.readingIndex ?? "sample"}-${index}`}>{error.readingIndex !== undefined ? `Reading ${error.readingIndex + 1}: ` : ""}{error.message}</li>)}</ul>}
    {calculation.ok && <dl className="emi-electrical-summary">
      <div><dt>Raw resistance readings</dt><dd>{calculation.value.readingCount}</dd></div>
      <div><dt>Mean raw resistance</dt><dd>{scientific(calculation.value.meanRawResistanceOhm)} Ω</dd></div>
      <div><dt>Sheet resistance</dt><dd>{scientific(calculation.value.aggregate.sheetResistanceOhmPerSquare)} Ω/sq</dd></div>
      <div><dt>Conductivity</dt><dd>{scientific(calculation.value.aggregate.conductivitySiemensPerMeter)} S/m</dd></div>
      <div><dt>Conductivity</dt><dd>{scientific(calculation.value.aggregate.conductivitySiemensPerCentimeter)} S/cm</dd></div>
      <div><dt>Volume resistivity</dt><dd>{scientific(calculation.value.aggregate.resistivityOhmMeter)} Ω·m</dd></div>
    </dl>}
    <label className="emi-measurement-note">Measurement note<textarea aria-label={`Electrical measurement note for ${filename}`} onChange={(event) => update({ measurementNote: event.target.value })} placeholder="Probe geometry, sample condition, instrument, or measurement context" rows={3} value={value?.measurementNote ?? ""} /></label>
    <div className={`emi-simon-note ${simon ? "emi-simon-ready" : ""}`}><strong>{simon ? "Simon estimate ready" : "Theoretical EMI SE — Simon estimate"}</strong><p>Empirical conductivity- and thickness-based estimate. This is not a measured VNA result and may not accurately represent thin, porous, anisotropic, multilayered, or otherwise non-ideal materials.</p>{simon ? <p>{simon.length} unsmoothed theoretical points are available at the measured frequencies. They remain separate from measured SET.</p> : <p>Unavailable until the authoritative sample thickness and all resistance inputs are finite and greater than zero.</p>}</div>
  </section>;
}
