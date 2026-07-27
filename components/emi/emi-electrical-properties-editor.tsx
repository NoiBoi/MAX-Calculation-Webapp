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

  return <details className="emi-electrical-editor">
    <summary>Electrical properties and Simon estimate</summary>
    <p className="emi-supporting">Enter raw four-point-probe resistance in Ω. MAXCalc applies the fixed geometric correction factor 4.532.</p>
    {thicknessConflict && <div className="emi-thickness-conflict" role="alert">
      <strong>Resolve conflicting saved thickness values</strong>
      <p>Sample metadata contains {thicknessConflict.metadataThickness.value} {thicknessConflict.metadataThickness.unit}, while the legacy electrical section contains {thicknessConflict.legacyElectricalThicknessMicrometers} µm. Both values are preserved. Electrical and Simon calculations are paused until you choose one.</p>
      <div className="emi-export-actions"><button className="ui-button" onClick={() => onResolveThicknessConflict("metadata")} type="button">Use sample metadata</button><button className="ui-button" onClick={() => onResolveThicknessConflict("legacy-electrical")} type="button">Use legacy electrical value</button></div>
    </div>}
    <dl className="emi-electrical-context">
      <div><dt>Sample thickness</dt><dd>{thicknessConflict ? "Conflict unresolved" : thicknessLabel}</dd></div>
      {!thicknessConflict && enteredThicknessLabel && enteredThicknessLabel !== thicknessLabel && <div><dt>Entered as</dt><dd>{enteredThicknessLabel}</dd></div>}
      <div><dt>Geometric correction factor</dt><dd>{correctionFactor}</dd></div>
      <div><dt>Calculation status</dt><dd>{thicknessConflict ? "Paused" : calculation.ok ? "Ready" : "Needs valid thickness and readings"}</dd></div>
    </dl>
    <button className="ui-button ui-button-compact" onClick={onEditSampleThickness} type="button">Edit sample thickness</button>
    <div className="emi-reading-heading"><div><h4>Raw four-point-probe resistance readings</h4><p>Aggregation: arithmetic mean of raw resistance, then sheet resistance and conductivity are calculated from that mean.</p></div><button className="ui-button ui-button-compact" onClick={() => update({ rawResistanceReadingsOhm: [...readings, null] })} type="button">Add reading</button></div>
    {readings.length === 0 ? <p className="emi-supporting">No resistance readings entered. VNA analysis remains available.</p> : <div className="emi-table-scroll"><table className="emi-table emi-electrical-table"><thead><tr><th>Reading</th><th>Raw resistance, Ω</th><th>Sheet resistance, Ω/sq</th><th>Conductivity, S/m</th><th>Conductivity, S/cm</th><th>Action</th></tr></thead><tbody>{readings.map((reading, index) => {
      const result = calculateElectricalProperty({ rawResistanceOhm: reading, thicknessMicrometers, correctionFactor });
      return <tr key={index}><td>{index + 1}</td><td><input aria-label={`Raw four-point-probe resistance ${index + 1} for ${filename}`} min="0" onChange={(event) => update({ rawResistanceReadingsOhm: readings.map((candidate, candidateIndex) => candidateIndex === index ? event.target.value === "" ? null : Number(event.target.value) : candidate) })} step="any" type="number" value={reading ?? ""} /></td><td>{result.ok ? scientific(result.value.sheetResistanceOhmPerSquare) : "Unavailable"}</td><td>{result.ok ? scientific(result.value.conductivitySiemensPerMeter) : "Unavailable"}</td><td>{result.ok ? scientific(result.value.conductivitySiemensPerCentimeter) : "Unavailable"}</td><td><button aria-label={`Remove resistance reading ${index + 1} for ${filename}`} className="ui-button ui-button-compact ui-button-destructive" onClick={() => update({ rawResistanceReadingsOhm: readings.filter((_, candidateIndex) => candidateIndex !== index) })} type="button">Remove</button></td></tr>;
    })}</tbody></table></div>}
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
    <div className="emi-simon-note"><strong>Theoretical EMI SE — Simon estimate</strong><p>Empirical conductivity- and thickness-based estimate. This is not a measured VNA result and may not accurately represent thin, porous, anisotropic, multilayered, or otherwise non-ideal materials.</p>{simon ? <p>{simon.length} unsmoothed theoretical points are available at the measured frequencies. They remain separate from measured SET.</p> : <p>Unavailable until the authoritative sample thickness and all resistance inputs are finite and greater than zero.</p>}</div>
  </details>;
}
