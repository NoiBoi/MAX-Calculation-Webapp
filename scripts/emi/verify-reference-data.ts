import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { calculateEmiDataset } from "../../packages/chemistry-engine/emi/calculations";
import { parseKeysightCsv } from "../../packages/chemistry-engine/emi/parser";
import type { EmiDirectionalPointResult } from "../../packages/chemistry-engine/emi/types";
import { DEFAULT_EMI_VALIDATION_OPTIONS, validateEmiDataset } from "../../packages/chemistry-engine/emi/validation";

const sourceDirectory = path.resolve(process.argv[2] ?? "emi-reference-data");
const outputPath = path.resolve(process.argv[3] ?? path.join(sourceDirectory, "verification-report.json"));
const entries = await readdir(sourceDirectory, { withFileTypes: true });
const csvNames = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".csv")).map((entry) => entry.name).sort();

const files: object[] = [];
const failures: object[] = [];
let maximumDecompositionResidualDb = 0;
let reflectionGreaterThanOneCount = 0;
let powerSumGreaterThanOneCount = 0;
const issueCountsByCode: Record<string, number> = {};

for (const filename of csvNames) {
  const text = await readFile(path.join(sourceDirectory, filename), "utf8");
  const parsed = parseKeysightCsv(text, filename);
  if (!parsed.ok) {
    failures.push({ filename, issues: parsed.issues });
    continue;
  }
  const calculation = calculateEmiDataset(parsed.dataset);
  const issues = validateEmiDataset(parsed.dataset, calculation);
  for (const issue of issues) issueCountsByCode[issue.code] = (issueCountsByCode[issue.code] ?? 0) + 1;
  const directional: readonly EmiDirectionalPointResult[] = [...calculation.forward, ...calculation.reverse];
  for (const point of directional) {
    if (point.R > 1) reflectionGreaterThanOneCount += 1;
    if (point.R + point.T > 1) powerSumGreaterThanOneCount += 1;
    if (point.decompositionResidual !== null && Number.isFinite(point.decompositionResidual)) {
      maximumDecompositionResidualDb = Math.max(maximumDecompositionResidualDb, Math.abs(point.decompositionResidual));
    }
  }
  const frequencies = parsed.dataset.points.map((point) => point.frequencyHz).filter(Number.isFinite);
  files.push({
    filename,
    pointCount: parsed.dataset.points.length,
    frequencyRangeHz: frequencies.length === 0 ? null : { minimum: Math.min(...frequencies), maximum: Math.max(...frequencies) },
    parsingIssueCount: parsed.dataset.parsingIssues.length,
    forwardWarningCount: issues.filter((issue) => issue.severity === "warning" && issue.direction === "forward").length,
    reverseWarningCount: issues.filter((issue) => issue.severity === "warning" && issue.direction === "reverse").length,
    sharedWarningCount: issues.filter((issue) => issue.severity === "warning" && issue.direction === undefined).length,
    maximumDecompositionResidualDb: directional.reduce((maximum, point) => point.decompositionResidual === null || !Number.isFinite(point.decompositionResidual) ? maximum : Math.max(maximum, Math.abs(point.decompositionResidual)), 0),
    reflectionGreaterThanOneCount: directional.filter((point) => point.R > 1).length,
    powerSumGreaterThanOneCount: directional.filter((point) => point.R + point.T > 1).length,
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  sourceDirectory,
  validationThresholds: DEFAULT_EMI_VALIDATION_OPTIONS,
  summary: {
    csvFileCount: csvNames.length,
    filesParsedSuccessfully: files.length,
    filesFailedParsing: failures.length,
    maximumDecompositionResidualDb,
    reflectionGreaterThanOneCount,
    powerSumGreaterThanOneCount,
    issueCountsByCode,
  },
  files,
  failures,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, ...report.summary }, null, 2));
