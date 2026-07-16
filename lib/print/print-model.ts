import type { WeighingSummary } from "../presentation/weighing-summary";
import type { PrintSettings } from "../settings/user-settings";
import type { ComparisonAnalysis, MatrixDisplayMode } from "../comparison/analysis";

export const PRINT_JOB_SCHEMA_VERSION = "1.0.0" as const;
export const PRINT_JOB_STORAGE_PREFIX = "max-stoich.print-job.";

export type PrintableRecipeEntry = Readonly<
  | { id: string; summary: WeighingSummary; unavailable?: never }
  | { id: string; summary?: never; unavailable: Readonly<{ title: string; sourceStatus: string; reason: string; validationStatus: string }> }
>;

export interface PrintJob {
  readonly schemaVersion: typeof PRINT_JOB_SCHEMA_VERSION;
  readonly id: string;
  readonly kind: "recipe" | "comparison" | "library";
  readonly title: string;
  readonly createdAt: string;
  readonly singleRecipeDetailed: boolean;
  readonly settings: PrintSettings;
  readonly entries: readonly PrintableRecipeEntry[];
  readonly comparisonContent?: Readonly<{
    mode: "full-recipes" | "overview-only" | "precursor-matrix" | "overview-plus-compact-recipes";
    analysis: ComparisonAnalysis;
    matrixMode: MatrixDisplayMode;
  }>;
}

export interface PrintablePage {
  readonly index: number;
  readonly entries: readonly PrintableRecipeEntry[];
  readonly notice?: string;
}

function entrySize(entry: PrintableRecipeEntry, settings: PrintSettings): number {
  if (entry.unavailable) return 2;
  const summary = entry.summary;
  const visibleColumns = ["precursorName", "precursorFormula", "molarRatio", "purity", "molarMass", "atomicRadius"].filter((field) => settings.fields[field as keyof typeof settings.fields]).length;
  return summary.precursors.length
    + Math.ceil(summary.adjustedFeedFormula.length / 36)
    + Math.max(0, visibleColumns - 3)
    + (settings.formulaStyle === "all-formulas" ? 3 : settings.formulaStyle === "target-and-adjusted" ? 1 : 0)
    + (settings.verificationDetail === "compact-table" ? 2 : settings.fields.arithmeticVerificationStatus ? 1 : 0)
    + (settings.fields.actionRequiredWarnings ? summary.actionRequiredMessages.length : 0)
    + (settings.fields.minorAdvisories && settings.warningDetail !== "action-required-only" ? summary.minorAdvisoryMessages.length : 0)
    + (settings.fields.notes && settings.notesMode !== "none" ? 2 : 0);
}

/** Deterministic packing policy: oversized recipes receive a full page. */
export function paginatePrintableRecipes(job: PrintJob): readonly PrintablePage[] {
  const configured = job.singleRecipeDetailed ? 1 : job.settings.recipesPerPage;
  const orientationBonus = job.settings.orientation === "landscape" ? 1 : 0;
  const regionCapacity = (configured === 1 ? 24 : configured === 2 ? 13 : configured === 4 ? 9 : 6) + orientationBonus;
  const pages: PrintablePage[] = [];
  let pending: PrintableRecipeEntry[] = [];
  const flush = () => { if (pending.length) { pages.push({ index: pages.length + 1, entries: pending }); pending = []; } };
  for (const entry of job.entries) {
    const size = entrySize(entry, job.settings);
    if (size > regionCapacity) {
      flush();
      const title = entry.summary?.title ?? entry.unavailable!.title;
      const rowCount = entry.summary?.precursors.length;
      pages.push({ index: pages.length + 1, entries: [entry], notice: `${title}${rowCount ? ` contains ${rowCount} precursor rows and` : ""} will use a full page to preserve legible formulas, warnings, notes, and weighing text.` });
      continue;
    }
    pending.push(entry);
    if (pending.length === configured) flush();
  }
  flush();
  return pages;
}

export function createPrintJob(input: Omit<PrintJob, "schemaVersion" | "id" | "createdAt">): PrintJob {
  return { ...input, schemaVersion: PRINT_JOB_SCHEMA_VERSION, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
}

export function launchPrintJob(job: PrintJob): void {
  if (!job.entries.length && !job.comparisonContent) throw new Error("No printable recipe or scenario is available.");
  const key = `${PRINT_JOB_STORAGE_PREFIX}${job.id}`;
  window.localStorage.setItem(key, JSON.stringify(job));
  const popup = window.open(`/print?job=${encodeURIComponent(job.id)}`, `max-stoich-print-${job.id}`, "popup,width=1100,height=850");
  if (!popup) { window.localStorage.removeItem(key); throw new Error("The print window was blocked. Allow pop-ups for this site and try again."); }
}

export function readPrintJob(id: string): PrintJob | undefined {
  const key = `${PRINT_JOB_STORAGE_PREFIX}${id}`;
  try {
    const value = window.localStorage.getItem(key);
    if (!value) return undefined;
    const parsed = JSON.parse(value) as PrintJob;
    window.localStorage.removeItem(key);
    return parsed.schemaVersion === PRINT_JOB_SCHEMA_VERSION && parsed.id === id ? parsed : undefined;
  } catch {
    window.localStorage.removeItem(key);
    return undefined;
  }
}
