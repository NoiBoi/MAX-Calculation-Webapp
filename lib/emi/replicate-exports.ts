import {
  calculateEmiStatistics,
  calculatePointwiseReplicateStatistics,
  calculateSpecimenFirstBandSummary,
  normalizeSetByArealDensity,
  normalizeSetByThickness,
  type EmiDirection,
  type EmiFrequencyRange,
  type EmiInterpolationOptions,
} from "@max-stoich/chemistry-engine";
import { EMI_METRICS, type EmiAnalysisFile } from "./analyzer";
import type { EmiProjectRecord, EmiSampleMetadata } from "./project";

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
function csv(rows: readonly (readonly (string | number | null | undefined)[])[]): string { return `${rows.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`; }

function fileMap(files: readonly EmiAnalysisFile[]): Map<string, EmiAnalysisFile> { return new Map(files.map((file) => [file.id, file])); }

export function createReplicatePointwiseCsv(project: EmiProjectRecord, files: readonly EmiAnalysisFile[], directions: readonly EmiDirection[], interpolation: EmiInterpolationOptions): string {
  const header = ["Group", "Direction", "Frequency (Hz)", `Frequency (${project.plot.frequencyUnit})`, "Metric", "Mean", "Median", "Sample standard deviation", "Minimum", "Maximum", "Lower 95% confidence bound", "Upper 95% confidence bound", "Contributing replicate count", "Total replicate count", "Interpolation status"];
  const byId = fileMap(files);
  const factor = project.plot.frequencyUnit === "GHz" ? 1e9 : 1;
  const rows = project.groups.flatMap((group) => directions.flatMap((direction) => {
    const series = group.datasetIds.flatMap((id) => { const file = byId.get(id); return file ? [{ id, points: file.calculation[direction] }] : []; });
    return calculatePointwiseReplicateStatistics(series, interpolation).statistics.map((stat) => [group.name, direction, stat.frequencyHz, stat.frequencyHz / factor, stat.metric, stat.mean, stat.median, stat.sampleStandardDeviation, stat.minimum, stat.maximum, stat.confidenceInterval95?.lower, stat.confidenceInterval95?.upper, stat.contributingReplicateCount, stat.totalReplicateCount, stat.interpolationStatus]);
  }));
  return csv([header, ...rows]);
}

function normalized(metadata: EmiSampleMetadata | undefined, setMean: number | null) {
  const thickness = metadata?.thickness !== undefined && metadata.thicknessUnit ? normalizeSetByThickness(setMean, metadata.thickness, metadata.thicknessUnit) : null;
  const areal = metadata?.arealDensity !== undefined && metadata.arealDensityUnit ? normalizeSetByArealDensity(setMean, metadata.arealDensity, metadata.arealDensityUnit) : null;
  return { thickness, areal };
}

export function createBandSummaryCsv(project: EmiProjectRecord, files: readonly EmiAnalysisFile[], directions: readonly EmiDirection[], range: EmiFrequencyRange): string {
  const header = ["Project", "Group", "Dataset", "Aggregate type", "Direction", "Band minimum (Hz)", "Band maximum (Hz)", "Metric", "Mean", "Median", "Sample standard deviation", "Minimum", "Maximum", "Lower 95% confidence bound", "Upper 95% confidence bound", "Valid-point percentage", "Replicate count", "Thickness", "Thickness unit", "Areal density", "Areal-density unit", "SET per mm", "SET per kg/m2", "Warning count"];
  const byId = fileMap(files);
  const metadata = new Map(project.datasets.map((entry) => [entry.id, entry.sampleMetadata]));
  const individualRows = files.flatMap((file) => directions.flatMap((direction) => EMI_METRICS.map((metric) => {
    const stat = calculateEmiStatistics(file.calculation[direction], metric, range);
    const sample = metadata.get(file.id);
    const values = normalized(sample, metric === "SET" ? stat.mean : null);
    return [project.name, sample?.group, sample?.displayName ?? file.dataset.filename, "individual-dataset", direction, range.minimumHz, range.maximumHz, metric, stat.mean, stat.median, null, stat.minimum, stat.maximum, null, null, stat.validPointPercentage, 1, sample?.thickness, sample?.thicknessUnit, sample?.arealDensity, sample?.arealDensityUnit, values.thickness, values.areal, file.issues.length];
  })));
  const groupRows = project.groups.flatMap((group) => directions.flatMap((direction) => EMI_METRICS.map((metric) => {
    const members = group.datasetIds.flatMap((id) => { const file = byId.get(id); return file ? [{ id, points: file.calculation[direction] }] : []; });
    const stat = calculateSpecimenFirstBandSummary(members, metric, range);
    return [project.name, group.name, "", "specimen-first-group", direction, range.minimumHz, range.maximumHz, metric, stat.mean, stat.median, stat.sampleStandardDeviation, stat.minimum, stat.maximum, stat.confidenceInterval95?.lower, stat.confidenceInterval95?.upper, stat.averageValidPointPercentage, stat.validSpecimenCount, "", "", "", "", "", "", group.datasetIds.reduce((sum, id) => sum + (byId.get(id)?.issues.length ?? 0), 0)];
  })));
  return csv([header, ...individualRows, ...groupRows]);
}

export function createEmiAnalysisManifest(project: EmiProjectRecord): string {
  return JSON.stringify({ manifestSchemaVersion: "1.0.0", recordType: "maxcalc-emi-analysis-manifest", exportedAt: new Date().toISOString(), project: { id: project.id, name: project.name, description: project.description, createdAt: project.createdAt, updatedAt: project.updatedAt }, datasetProvenance: project.datasets.map((entry) => ({ id: entry.id, originalFilename: entry.originalFilename, parsedMetadata: entry.parsedDataset.metadata, pointCount: entry.parsedDataset.points.length, sampleMetadata: entry.sampleMetadata, importedAt: entry.importedAt, parserVersion: entry.parserVersion })), groups: project.groups, calculationEngineVersion: project.calculationEngineVersion, parserVersion: project.parserVersion, validationSettings: project.qualityControl, interpolationSettings: project.interpolation, aggregationSettings: { defaultBandSummary: "specimen-first", standardDeviation: "sample-n-minus-one", confidenceInterval: "two-sided-95-percent-Student-t" }, exportSettings: project.plot }, null, 2);
}

function html(value: unknown): string { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }

export function createEmiAnalysisSummaryHtml(project: EmiProjectRecord, figures: readonly string[] = []): string {
  const datasetRows = project.datasets.map((entry) => `<tr><td>${html(entry.sampleMetadata.displayName)}</td><td>${html(entry.originalFilename)}</td><td>${entry.parsedDataset.points.length}</td><td>${html(entry.sampleMetadata.group)}</td><td>${html(entry.sampleMetadata.material)}</td><td>${html(entry.sampleMetadata.thickness)} ${html(entry.sampleMetadata.thicknessUnit)}</td></tr>`).join("");
  const groupRows = project.groups.map((group) => `<li><strong>${html(group.name)}</strong>: ${group.datasetIds.length} specimen(s)</li>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${html(project.name)} · EMI analysis</title><style>body{font-family:Arial,sans-serif;max-width:1100px;margin:2rem auto;padding:0 1rem;color:#172022}h1,h2{border-bottom:1px solid #94a3b8;padding-bottom:.3rem}table{width:100%;border-collapse:collapse}th,td{border:1px solid #94a3b8;padding:.4rem;text-align:left}figure svg{width:100%;height:auto}.note{background:#eff6ff;border-left:4px solid #3b82f6;padding:.75rem}</style></head><body><h1>${html(project.name)}</h1><p>${html(project.description)}</p><p>Exported ${html(new Date().toISOString())} · engine ${html(project.calculationEngineVersion)} · parser ${html(project.parserVersion)}</p><h2>Method</h2><p class="note">Directional complex S-parameters are converted to derived scalar shielding and power metrics per specimen. Replicate group summaries use specimen-first aggregation by default. Invalid values are excluded per metric and are never clamped.</p><p>Selected frequency range: ${html(project.frequencyRangeHz.minimumHz)} to ${html(project.frequencyRangeHz.maximumHz)} Hz. Directions: ${html(project.selectedDirections.join(", "))}.</p><h2>Datasets</h2><table><thead><tr><th>Display name</th><th>Original filename</th><th>Points</th><th>Group</th><th>Material</th><th>Thickness</th></tr></thead><tbody>${datasetRows}</tbody></table><h2>Replicate groups</h2><ul>${groupRows || "<li>No replicate groups defined.</li>"}</ul><h2>Quality control</h2><p>See the project data and manifest for per-frequency validation codes. Warnings do not identify a physical cause.</p>${figures.map((figure, index) => `<h2>Selected plot ${index + 1}</h2><figure>${figure}</figure>`).join("")}<h2>Project notes</h2><p>${html(project.notes).replaceAll("\n", "<br>")}</p></body></html>`;
}
