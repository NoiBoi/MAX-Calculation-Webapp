import { ChemistryDecimal, analyzeMaxXComponent, replaceMaxXCoefficient } from "@max-stoich/chemistry-engine";
import type { Mode } from "@/lib/persistence/workspace-types";
import type { WorkspaceRecipeState } from "@/lib/workspace/adapter";
import type { WeighingSortOption } from "@/lib/presentation/weighing-sort";
import { isAppearancePreference, type AppearancePreference } from "../theme/theme";

export const USER_SETTINGS_SCHEMA_VERSION = "4.0.0" as const;
export const USER_SETTINGS_ID = "local-user-settings" as const;

export const WEIGHING_RESULT_FIELDS = [
  "precursor-name", "formula", "purity", "solver-molar-ratio", "final-intended-molar-ratio", "batch-scaled-moles", "molar-mass", "pure-required-mass", "pre-round-mass", "final-mass", "realized-moles", "status", "warning", "atomic-radius", "atomic-radius-source", "source",
] as const;
export type WeighingResultField = typeof WEIGHING_RESULT_FIELDS[number];
export type DefaultSaveAction = "save" | "save-and-blank" | "save-and-copy";
export type PrintField = keyof PrintSettings["fields"];

export interface PrintSettings {
  readonly paperSize: "letter" | "a4";
  readonly orientation: "portrait" | "landscape";
  readonly recipesPerPage: 2 | 4 | 6;
  readonly density: "comfortable" | "compact" | "ultra-compact";
  readonly fields: Readonly<{
    recipeName: boolean; revision: boolean; adjustedFeedFormula: boolean; targetBatchMass: boolean; batchBasis: boolean;
    precursorName: boolean; precursorFormula: boolean; molarRatio: boolean; purity: boolean; molarMass: boolean;
    atomicRadius: boolean; finalMass: boolean; totalMass: boolean; arithmeticVerificationStatus: boolean;
    actionRequiredWarnings: boolean; minorAdvisories: boolean; notes: boolean; radiusSummary: boolean;
    engineVersion: boolean; datasetVersions: boolean; signatureLines: boolean;
  }>;
  readonly formulaStyle: "adjusted-feed-only" | "target-and-adjusted" | "all-formulas";
  readonly warningDetail: "action-required-only" | "action-and-minor" | "all";
  readonly notesMode: "none" | "selected" | "furnace-and-processing" | "all";
  readonly verificationDetail: "status" | "status-and-largest-residual" | "compact-table";
  readonly showPageNumbers: boolean;
  readonly showPrintDate: boolean;
  readonly showApplicationName: boolean;
  readonly repeatTableHeaders: boolean;
}

export interface WeighingResultDisplaySettings {
  readonly visibleFields: readonly WeighingResultField[];
  readonly columnOrder: readonly WeighingResultField[];
}

export interface LocalUserSettings {
  readonly id: typeof USER_SETTINGS_ID;
  readonly schemaVersion: typeof USER_SETTINGS_SCHEMA_VERSION;
  readonly appearance: AppearancePreference;
  readonly feedDefaults: Readonly<{ aluminumPerFormula: string; carbonPerFormula: Readonly<{ "211": string; "312": string; "413": string }> }>;
  readonly saveBehavior: Readonly<{ defaultPostSaveAction: DefaultSaveAction }>;
  readonly resultDisplay: Readonly<{ standard: WeighingResultDisplaySettings; advanced: WeighingResultDisplaySettings; atomicRadiusDatasetId: string; weighingSort: WeighingSortOption }>;
  readonly print: PrintSettings;
  readonly updatedAt: string;
}

export const FIELD_LABELS: Readonly<Record<WeighingResultField, string>> = {
  "precursor-name": "Precursor", formula: "Formula", purity: "Purity", "solver-molar-ratio": "Solver molar ratio", "final-intended-molar-ratio": "Final intended molar ratio", "batch-scaled-moles": "Batch-scaled precursor moles", "molar-mass": "Molar mass", "pure-required-mass": "Pure required mass", "pre-round-mass": "Pre-round weighing mass", "final-mass": "Final weighing mass", "realized-moles": "Realized precursor moles", status: "Status", warning: "Warning indicator", "atomic-radius": "Element atomic radius", "atomic-radius-source": "Atomic-radius definition/source", source: "Precursor source or route origin",
};

export const PRINT_FIELD_LABELS: Readonly<Record<PrintField, string>> = {
  recipeName: "Recipe or scenario name", revision: "Revision", adjustedFeedFormula: "Adjusted intended feed formula", targetBatchMass: "Target batch mass", batchBasis: "Batch basis",
  precursorName: "Precursor name", precursorFormula: "Precursor formula", molarRatio: "Molar ratio", purity: "Purity", molarMass: "Molar mass", atomicRadius: "Elemental precursor atomic radius",
  finalMass: "Final weighing mass", totalMass: "Total mass", arithmeticVerificationStatus: "Arithmetic verification status", actionRequiredWarnings: "Action-required warnings", minorAdvisories: "Minor advisories",
  notes: "Notes", radiusSummary: "Compact site-radius descriptor", engineVersion: "Engine version", datasetVersions: "Dataset versions", signatureLines: "Prepared, checked, and batch ID lines",
};

export function createRecommendedPrintSettings(): PrintSettings {
  return {
    paperSize: "letter", orientation: "portrait", recipesPerPage: 2, density: "comfortable",
    fields: { recipeName: true, revision: true, adjustedFeedFormula: true, targetBatchMass: true, batchBasis: true, precursorName: true, precursorFormula: true, molarRatio: true, purity: true, molarMass: false, atomicRadius: false, finalMass: true, totalMass: true, arithmeticVerificationStatus: true, actionRequiredWarnings: true, minorAdvisories: false, notes: false, radiusSummary: false, engineVersion: true, datasetVersions: true, signatureLines: false },
    formulaStyle: "adjusted-feed-only", warningDetail: "action-required-only", notesMode: "none", verificationDetail: "status-and-largest-residual",
    showPageNumbers: true, showPrintDate: true, showApplicationName: true, repeatTableHeaders: true,
  };
}

const STANDARD_ORDER: readonly WeighingResultField[] = ["precursor-name", "formula", "purity", "final-mass", "status", "warning", "solver-molar-ratio", "final-intended-molar-ratio", "batch-scaled-moles", "molar-mass", "pure-required-mass", "pre-round-mass", "realized-moles", "atomic-radius", "atomic-radius-source", "source"];
const ADVANCED_ORDER: readonly WeighingResultField[] = ["precursor-name", "formula", "purity", "final-intended-molar-ratio", "molar-mass", "final-mass", "realized-moles", "status", "warning", "solver-molar-ratio", "batch-scaled-moles", "pure-required-mass", "pre-round-mass", "atomic-radius", "atomic-radius-source", "source"];

export function createDefaultUserSettings(now = new Date().toISOString()): LocalUserSettings {
  return {
    id: USER_SETTINGS_ID, schemaVersion: USER_SETTINGS_SCHEMA_VERSION, appearance: "system",
    feedDefaults: { aluminumPerFormula: "1", carbonPerFormula: { "211": "1", "312": "2", "413": "3" } },
    saveBehavior: { defaultPostSaveAction: "save" },
    resultDisplay: {
      standard: { visibleFields: ["precursor-name", "formula", "purity", "final-mass", "status"], columnOrder: STANDARD_ORDER },
      advanced: { visibleFields: ["precursor-name", "formula", "purity", "final-intended-molar-ratio", "molar-mass", "final-mass", "realized-moles", "status"], columnOrder: ADVANCED_ORDER },
      atomicRadiusDatasetId: "teatum-metallic-cn12", weighingSort: "original",
    }, print: createRecommendedPrintSettings(), updatedAt: now,
  };
}

export function validatePositiveDecimal(value: string): string | undefined {
  try { const parsed = new ChemistryDecimal(value); return parsed.isFinite() && parsed.greaterThan(0) ? undefined : "Enter a finite value greater than zero."; }
  catch { return "Enter a valid positive decimal."; }
}

export function validateDisplaySettings(value: WeighingResultDisplaySettings, mode: Mode): readonly string[] {
  const errors: string[] = [];
  const visible = new Set(value.visibleFields);
  if (!visible.has("final-mass")) errors.push("Final weighing mass must remain visible.");
  if (!visible.has("precursor-name") && !visible.has("formula")) errors.push("Keep Precursor or Formula visible so every row has an identity.");
  if (mode === "advanced" && !visible.has("status") && !visible.has("warning")) errors.push("Advanced mode must retain Status or Warning indicator.");
  if (value.visibleFields.some((field) => !WEIGHING_RESULT_FIELDS.includes(field)) || value.columnOrder.length !== WEIGHING_RESULT_FIELDS.length || new Set(value.columnOrder).size !== WEIGHING_RESULT_FIELDS.length || value.columnOrder.some((field) => !WEIGHING_RESULT_FIELDS.includes(field))) errors.push("Column order contains an unsupported, missing, or duplicate field.");
  return errors;
}

export function validateUserSettings(value: LocalUserSettings): readonly string[] {
  const errors: string[] = [];
  if (value.schemaVersion !== USER_SETTINGS_SCHEMA_VERSION) errors.push(`Unsupported settings schema ${String(value.schemaVersion)}.`);
  if (!isAppearancePreference(value.appearance)) errors.push("Appearance must be Light, Dark, Midnight, or System.");
  for (const [label, amount] of [["Default aluminum", value.feedDefaults.aluminumPerFormula], ["211 carbon", value.feedDefaults.carbonPerFormula["211"]], ["312 carbon", value.feedDefaults.carbonPerFormula["312"]], ["413 carbon", value.feedDefaults.carbonPerFormula["413"]]] as const) { const error = validatePositiveDecimal(amount); if (error) errors.push(`${label}: ${error}`); }
  errors.push(...validateDisplaySettings(value.resultDisplay.standard, "standard"), ...validateDisplaySettings(value.resultDisplay.advanced, "advanced"));
  if (!value.print) { errors.push("Print settings are missing and require settings migration."); return errors; }
  if (!["letter", "a4"].includes(value.print.paperSize) || !["portrait", "landscape"].includes(value.print.orientation) || ![2, 4, 6].includes(value.print.recipesPerPage)) errors.push("Print paper, orientation, or recipes-per-page value is unsupported.");
  if (!value.print.fields.recipeName || !value.print.fields.adjustedFeedFormula || (!value.print.fields.precursorName && !value.print.fields.precursorFormula) || !value.print.fields.finalMass || !value.print.fields.totalMass) errors.push("Print settings must retain recipe identity, adjusted feed, precursor identity, final mass, and total mass.");
  if (value.print.notesMode === "none" && value.print.fields.notes) errors.push("Turn off the Notes field or select a notes inclusion mode.");
  return errors;
}

export function migrateUserSettings(input: unknown, now = new Date().toISOString()): LocalUserSettings {
  const defaults = createDefaultUserSettings(now);
  if (!input || typeof input !== "object") return defaults;
  const source = input as Partial<LocalUserSettings> & { schemaVersion?: string };
  if (![USER_SETTINGS_SCHEMA_VERSION, "3.0.0", "2.0.0", "1.0.0"].includes(String(source.schemaVersion))) throw new Error(`Unsupported future user-settings schema ${String(source.schemaVersion)}.`);
  const candidate: LocalUserSettings = {
    ...defaults, ...source, id: USER_SETTINGS_ID, schemaVersion: USER_SETTINGS_SCHEMA_VERSION,
    feedDefaults: { ...defaults.feedDefaults, ...source.feedDefaults, carbonPerFormula: { ...defaults.feedDefaults.carbonPerFormula, ...source.feedDefaults?.carbonPerFormula } },
    saveBehavior: { ...defaults.saveBehavior, ...source.saveBehavior },
    resultDisplay: { ...defaults.resultDisplay, ...source.resultDisplay, standard: { ...defaults.resultDisplay.standard, ...source.resultDisplay?.standard }, advanced: { ...defaults.resultDisplay.advanced, ...source.resultDisplay?.advanced } },
    print: { ...defaults.print, ...source.print, fields: { ...defaults.print.fields, ...source.print?.fields } }, updatedAt: source.updatedAt ?? now,
  };
  const errors = validateUserSettings(candidate); if (errors.length) throw new Error(errors.join(" ")); return candidate;
}

export function displaySettingsForMode(settings: LocalUserSettings, mode: Mode): WeighingResultDisplaySettings { return settings.resultDisplay[mode]; }

export function applyFeedDefaultsToNewTemplate(recipe: WorkspaceRecipeState, settings: LocalUserSettings, template?: "211" | "312" | "413"): WorkspaceRecipeState {
  let targetFormula = recipe.targetFormula;
  if (template) { const x = analyzeMaxXComponent(targetFormula); if (x.success && x.value.element === "C" && !targetFormula.includes("N")) { const replaced = replaceMaxXCoefficient(targetFormula, settings.feedDefaults.carbonPerFormula[template]); if (replaced.success) targetFormula = replaced.formula; } }
  return { ...recipe, targetFormula, aluminumPerFormula: settings.feedDefaults.aluminumPerFormula };
}

export function relativeTemplateCarbonLabel(template: "211" | "312" | "413", value: string): string {
  const ideal = new ChemistryDecimal({ "211": "1", "312": "2", "413": "3" }[template]); const current = new ChemistryDecimal(value); const percent = current.dividedBy(ideal).minus(1).times(100);
  if (percent.isZero()) return "Stoichiometric default"; return `${percent.abs().toDecimalPlaces(6).toString()}% ${percent.isPositive() ? "above" : "below"} ideal`;
}
