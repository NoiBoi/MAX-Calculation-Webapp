"use client";

import {
  FOUR_POINT_PROBE_CORRECTION_FACTOR,
  calculateElectricalProperty,
  calculateElectricalPropertySummary,
  calculateSimonSeries,
} from "@max-stoich/chemistry-engine";
import { calculateEmiElectricalRecord, type EmiElectricalPropertyRecord } from "@/lib/emi/project";

function scientific(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? "Unavailable" : value.toLocaleString(undefined, { maximumSignificantDigits: 10 });
}

export function EmiElectricalPropertiesEditor({ filename, frequenciesHz, value, onChange }: Readonly<{
  filename: string;
  frequenciesHz: readonly number[];
  value?: EmiElectricalPropertyRecord;
  onChange: (value: EmiElectricalPropertyRecord) => void;
}>) {
  const thicknessMicrometers = value?.thicknessMicrometers;
  const readings = value?.rawResistanceReadingsOhm ?? [];
  const calculation = calculateElectricalPropertySummary({ rawResistanceReadingsOhm: readings, thicknessMicrometers, correctionFactor: value?.correctionFactor ?? FOUR_POINT_PROBE_CORRECTION_FACTOR });
  const update = (next: Readonly<{ thicknessMicrometers?: number | null; rawResistanceReadingsOhm?: readonly (number | null)[]; measurementNote?: string }>) => onChange(calculateEmiElectricalRecord({
    thicknessMicrometers: next.thicknessMicrometers !== undefined ? next.thicknessMicrometers : thicknessMicrometers,
    rawResistanceReadingsOhm: next.rawResistanceReadingsOhm ?? readings,
    correctionFactor: value?.correctionFactor ?? FOUR_POINT_PROBE_CORRECTION_FACTOR,
    measurementNote: next.measurementNote !== undefined ? next.measurementNote : value?.measurementNote,
  }));
  const simon = calculation.ok ? calculateSimonSeries({ frequencyPointsHz: frequenciesHz, conductivitySiemensPerCentimeter: calculation.value.aggregate.conductivitySiemensPerCentimeter, thicknessMicrometers }) : null;

  return <details className="emi-electrical-editor">
    <summary>Electrical properties and Simon estimate</summary>
    <p className="emi-supporting">Enter raw four-point-probe resistance in Ω—not sheet resistance. MAXCalc applies the fixed geometric correction factor <strong>{FOUR_POINT_PROBE_CORRECTION_FACTOR}</strong>.</p>
    <div className="emi-electrical-inputs">
      <label>Film thickness, µm<input aria-label={`Film thickness in micrometers for ${filename}`} min="0" onChange={(event) => update({ thicknessMicrometers: event.target.value === "" ? null : Number(event.target.value) })} step="any" type="number" value={thicknessMicrometers ?? ""} /></label>
      <label>Measurement note<textarea aria-label={`Electrical measurement note for ${filename}`} onChange={(event) => update({ measurementNote: event.target.value })} rows={2} value={value?.measurementNote ?? ""} /></label>
    </div>
    <div className="emi-reading-heading"><div><h4>Raw four-point-probe resistance readings</h4><p>Aggregation: arithmetic mean of raw resistance, then sheet resistance and conductivity are calculated from that mean.</p></div><button className="ui-button ui-button-compact" onClick={() => update({ rawResistanceReadingsOhm: [...readings, null] })} type="button">Add reading</button></div>
    {readings.length === 0 ? <p className="emi-supporting">No resistance readings entered. VNA analysis remains available.</p> : <div className="emi-table-scroll"><table className="emi-table emi-electrical-table"><thead><tr><th>Reading</th><th>Raw resistance, Ω</th><th>Sheet resistance, Ω/sq</th><th>Conductivity, S/m</th><th>Conductivity, S/cm</th><th>Action</th></tr></thead><tbody>{readings.map((reading, index) => {
      const result = calculateElectricalProperty({ rawResistanceOhm: reading, thicknessMicrometers, correctionFactor: value?.correctionFactor ?? FOUR_POINT_PROBE_CORRECTION_FACTOR });
      return <tr key={index}><td>{index + 1}</td><td><input aria-label={`Raw four-point-probe resistance ${index + 1} for ${filename}`} min="0" onChange={(event) => update({ rawResistanceReadingsOhm: readings.map((candidate, candidateIndex) => candidateIndex === index ? event.target.value === "" ? null : Number(event.target.value) : candidate) })} step="any" type="number" value={reading ?? ""} /></td><td>{result.ok ? scientific(result.value.sheetResistanceOhmPerSquare) : "Unavailable"}</td><td>{result.ok ? scientific(result.value.conductivitySiemensPerMeter) : "Unavailable"}</td><td>{result.ok ? scientific(result.value.conductivitySiemensPerCentimeter) : "Unavailable"}</td><td><button aria-label={`Remove resistance reading ${index + 1} for ${filename}`} className="ui-button ui-button-compact ui-button-destructive" onClick={() => update({ rawResistanceReadingsOhm: readings.filter((_, candidateIndex) => candidateIndex !== index) })} type="button">Remove</button></td></tr>;
    })}</tbody></table></div>}
    {!calculation.ok && readings.length > 0 && <ul className="emi-electrical-errors" role="alert">{calculation.errors.map((error, index) => <li key={`${error.code}-${error.readingIndex ?? "sample"}-${index}`}>{error.readingIndex !== undefined ? `Reading ${error.readingIndex + 1}: ` : ""}{error.message}</li>)}</ul>}
    {calculation.ok && <dl className="emi-electrical-summary">
      <div><dt>Raw resistance readings</dt><dd>{calculation.value.readingCount}</dd></div>
      <div><dt>Mean raw resistance</dt><dd>{scientific(calculation.value.meanRawResistanceOhm)} Ω</dd></div>
      <div><dt>Sheet resistance</dt><dd>{scientific(calculation.value.aggregate.sheetResistanceOhmPerSquare)} Ω/sq</dd></div>
      <div><dt>Conductivity</dt><dd>{scientific(calculation.value.aggregate.conductivitySiemensPerMeter)} S/m</dd></div>
      <div><dt>Conductivity</dt><dd>{scientific(calculation.value.aggregate.conductivitySiemensPerCentimeter)} S/cm</dd></div>
      <div><dt>Volume resistivity</dt><dd>{scientific(calculation.value.aggregate.resistivityOhmMeter)} Ω·m</dd></div>
    </dl>}
    <div className="emi-simon-note"><strong>Theoretical EMI SE — Simon estimate</strong><p>Empirical conductivity- and thickness-based estimate. This is not a measured VNA result and may not accurately represent thin, porous, anisotropic, multilayered, or otherwise non-ideal materials.</p>{simon ? <p>{simon.length} unsmoothed theoretical points are available at the measured frequencies. They remain separate from measured SET.</p> : <p>Unavailable until all thickness and resistance inputs are finite and greater than zero.</p>}</div>
  </details>;
}

