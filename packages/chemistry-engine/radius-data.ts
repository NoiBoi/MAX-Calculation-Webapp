import { z } from "zod";
import { ChemistryDecimal, formatDecimal, parseDecimal } from "./numeric";
import { VALID_ELEMENT_SYMBOLS } from "./periodic-table";
import { DecimalStringSchema, ElementSymbolSchema, IdSchema, SiteCompositionSchema, type SiteComposition } from "./schemas";

export const ATOMIC_RADIUS_DATASET_SCHEMA_VERSION = "2.0.0" as const;
export const RADIUS_DESCRIPTOR_SCHEMA_VERSION = "2.0.0" as const;
export const RADIUS_DESCRIPTOR_UNAVAILABLE_MESSAGE = "Atomic-radius descriptors unavailable: no source-verified dataset is installed." as const;
export const RADIUS_SITE_MODEL_REQUIRED_MESSAGE = "Flat elemental formula — configure explicit crystallographic sites to calculate site-radius descriptors." as const;
export const RADIUS_DESCRIPTOR_DISCLAIMER = "Atomic-size mismatch is a screening descriptor. It is not a direct prediction of physical stress, lattice strain, phase stability, or synthesis success." as const;

export const RadiusDefinitionSchema = z.enum(["metallic", "covalent", "ionic", "neutral-isodensity", "empirical-atomic", "custom"]);
export const RadiusSourceSchema = z.object({
  sourceId: IdSchema,
  title: z.string().min(1),
  primarySource: z.string().min(1),
  editionOrVersion: z.string().min(1),
  publicationYear: z.string().regex(/^\d{4}$/).optional(),
  url: z.url().optional(),
  doi: z.string().min(1).optional(),
  reportIdentifier: z.string().min(1).optional(),
  accessedAt: z.iso.date().optional(),
  sourceDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
});
export const RadiusDatasetStatusSchema = z.enum(["source-verified", "lab-reviewed", "lab-approved", "provisional", "unverified-import"]);
export const RadiusDatasetApprovalSchema = z.object({
  status: RadiusDatasetStatusSchema,
  sourceVerified: z.boolean(),
  labApproval: z.enum(["not-reviewed", "lab-reviewed", "lab-approved"]),
  reviewer: z.string().min(1).optional(),
  reviewDate: z.iso.date().optional(),
  reviewRecord: z.string().min(1).optional(),
}).superRefine((approval, context) => {
  if (["source-verified", "lab-reviewed", "lab-approved"].includes(approval.status) && !approval.sourceVerified) context.addIssue({ code: "custom", path: ["sourceVerified"], message: "Verified statuses require primary-source verification." });
  if (["lab-reviewed", "lab-approved"].includes(approval.status) && (!approval.reviewer || !approval.reviewDate)) context.addIssue({ code: "custom", path: ["reviewer"], message: "Laboratory review requires a named reviewer and date." });
  if (approval.status === "lab-approved" && approval.labApproval !== "lab-approved") context.addIssue({ code: "custom", path: ["labApproval"], message: "Lab-approved status must be explicit." });
});
export const ApprovedAtomicRadiusRecordSchema = z.object({
  element: ElementSymbolSchema,
  radiusPm: DecimalStringSchema,
  selectionKey: z.string().min(1).default("default"),
  defaultForPolicy: z.boolean().default(true),
  coordinationNumber: z.string().min(1).optional(),
  oxidationState: z.string().min(1).optional(),
  spinState: z.string().min(1).optional(),
  methodQualifier: z.string().min(1).optional(),
  estimated: z.boolean().default(false),
  sourceLocation: z.string().min(1),
  notes: z.string().optional(),
});
export const ApprovedAtomicRadiusDatasetSchema = z.object({
  schemaVersion: z.literal(ATOMIC_RADIUS_DATASET_SCHEMA_VERSION),
  datasetId: IdSchema,
  datasetVersion: z.string().regex(/^\d{4}\.\d+\.\d+$/),
  name: z.string().min(1),
  definition: RadiusDefinitionSchema,
  definitionDetail: z.string().min(1),
  source: RadiusSourceSchema,
  units: z.literal("pm"),
  coordinationPolicy: z.string().min(1),
  oxidationStatePolicy: z.string().min(1),
  spinStatePolicy: z.string().min(1),
  missingValuePolicy: z.literal("block-site-descriptor"),
  approval: RadiusDatasetApprovalSchema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  coverage: z.object({ elements: z.array(ElementSymbolSchema), missingElements: z.array(ElementSymbolSchema), recordCount: z.number().int().nonnegative() }),
  parsingWarnings: z.array(z.string()),
  values: z.array(ApprovedAtomicRadiusRecordSchema),
});

export const AtomicRadiusOverrideSchema = z.object({
  overrideId: IdSchema, element: ElementSymbolSchema, radiusPm: DecimalStringSchema, units: z.literal("pm"), definition: RadiusDefinitionSchema,
  reason: z.string().min(1), sourceOrMeasurementBasis: z.string().min(1), label: z.string().min(1), revisionDate: z.iso.date(),
  coordinationContext: z.string().min(1).optional(), oxidationContext: z.string().min(1).optional(),
});

export type RadiusDefinition = z.infer<typeof RadiusDefinitionSchema>;
export type AtomicRadiusDataset = z.infer<typeof ApprovedAtomicRadiusDatasetSchema>;
export type AtomicRadiusOverride = Readonly<z.infer<typeof AtomicRadiusOverrideSchema>>;
export type RadiusDatasetApproval = Readonly<z.infer<typeof RadiusDatasetApprovalSchema>>;
export interface RadiusSiteDatasetSelection { readonly siteId: string; readonly datasetId: string; readonly datasetVersion: string; readonly datasetDigest: string; readonly overrides: readonly AtomicRadiusOverride[] }
export interface RadiusDescriptorConfig { readonly schemaVersion: "2.0.0"; readonly enabled: boolean; readonly siteDatasets: readonly RadiusSiteDatasetSelection[]; readonly datasetId?: string; readonly datasetVersion?: string; readonly datasetDigest?: string; readonly overrides?: readonly AtomicRadiusOverride[] }

export function canonicalRadiusDatasetContent(dataset: AtomicRadiusDataset): unknown {
  return Object.fromEntries(Object.entries(dataset).filter(([key]) => key !== "digest" && key !== "approval"));
}

export type RadiusDatasetDiagnosticCode = "RADIUS_DATASET_INVALID" | "RADIUS_DATASET_ID_MISSING" | "RADIUS_DATASET_SOURCE_MISSING" | "RADIUS_DATASET_UNITS_INVALID" | "RADIUS_VALUE_INVALID" | "RADIUS_ELEMENT_DUPLICATE" | "RADIUS_ELEMENT_UNKNOWN" | "RADIUS_DATASET_DIGEST_MISMATCH" | "RADIUS_DATASET_UNVERIFIED";
export interface RadiusDatasetDiagnostic { readonly code: RadiusDatasetDiagnosticCode; readonly path: string; readonly message: string; readonly blocking: boolean }
export interface AtomicRadiusDatasetValidationResult { readonly valid: boolean; readonly usableForScreening: boolean; readonly approvedForCalculation: boolean; readonly diagnostics: readonly RadiusDatasetDiagnostic[]; readonly dataset?: AtomicRadiusDataset }

function freezeDataset(dataset: z.infer<typeof ApprovedAtomicRadiusDatasetSchema>): AtomicRadiusDataset {
  return Object.freeze({ ...dataset, source: Object.freeze({ ...dataset.source }), approval: Object.freeze({ ...dataset.approval }), coverage: Object.freeze({ ...dataset.coverage, elements: Object.freeze([...dataset.coverage.elements]), missingElements: Object.freeze([...dataset.coverage.missingElements]) }), values: Object.freeze(dataset.values.map((value) => Object.freeze({ ...value }))) }) as AtomicRadiusDataset;
}

export function validateAtomicRadiusDataset(input: unknown, calculatedDigest?: string): AtomicRadiusDatasetValidationResult {
  const diagnostics: RadiusDatasetDiagnostic[] = [];
  const candidate = input && typeof input === "object" ? input as Record<string, unknown> : {};
  if (typeof candidate.datasetId !== "string" || !candidate.datasetId.trim()) diagnostics.push({ code: "RADIUS_DATASET_ID_MISSING", path: "datasetId", message: "Atomic-radius dataset ID is required.", blocking: true });
  if (!candidate.source || typeof candidate.source !== "object") diagnostics.push({ code: "RADIUS_DATASET_SOURCE_MISSING", path: "source", message: "A primary scientific source and edition/version are required.", blocking: true });
  if (candidate.units !== "pm") diagnostics.push({ code: "RADIUS_DATASET_UNITS_INVALID", path: "units", message: "Atomic-radius datasets must use picometres (pm).", blocking: true });
  const parsed = ApprovedAtomicRadiusDatasetSchema.safeParse(input);
  if (!parsed.success) for (const issue of parsed.error.issues) diagnostics.push({ code: "RADIUS_DATASET_INVALID", path: issue.path.join("."), message: issue.message, blocking: true });
  if (!parsed.success) return Object.freeze({ valid: false, usableForScreening: false, approvedForCalculation: false, diagnostics: Object.freeze(diagnostics) });
  const seen = new Set<string>();
  parsed.data.values.forEach((record, index) => {
    if (!VALID_ELEMENT_SYMBOLS.has(record.element)) diagnostics.push({ code: "RADIUS_ELEMENT_UNKNOWN", path: `values.${index}.element`, message: `${record.element} is not a recognized element.`, blocking: true });
    const key = `${record.element}:${record.selectionKey}`;
    if (seen.has(key)) diagnostics.push({ code: "RADIUS_ELEMENT_DUPLICATE", path: `values.${index}`, message: `Dataset contains duplicate qualified record ${key}.`, blocking: true });
    seen.add(key);
    const radius = parseDecimal(record.radiusPm);
    if (!radius?.isFinite() || !radius.greaterThan(0)) diagnostics.push({ code: "RADIUS_VALUE_INVALID", path: `values.${index}.radiusPm`, message: `Radius for ${record.element} must be finite and greater than zero.`, blocking: true });
  });
  if (calculatedDigest === undefined || calculatedDigest !== parsed.data.digest) diagnostics.push({ code: "RADIUS_DATASET_DIGEST_MISMATCH", path: "digest", message: calculatedDigest === undefined ? "Dataset digest has not been independently verified." : "Dataset digest does not match.", blocking: true });
  const sourceUsable = parsed.data.approval.sourceVerified && ["source-verified", "lab-reviewed", "lab-approved"].includes(parsed.data.approval.status);
  if (!sourceUsable) diagnostics.push({ code: "RADIUS_DATASET_UNVERIFIED", path: "approval.status", message: "Dataset remains installed for provenance review but is not usable for screening.", blocking: true });
  const valid = diagnostics.every((item) => !item.blocking);
  return Object.freeze({ valid, usableForScreening: valid && sourceUsable, approvedForCalculation: valid && parsed.data.approval.labApproval === "lab-approved", diagnostics: Object.freeze(diagnostics), dataset: freezeDataset(parsed.data) });
}

export interface AtomicRadiusRegistry { readonly schemaVersion: "2.0.0"; readonly datasets: readonly AtomicRadiusDataset[]; readonly usableDatasets: readonly AtomicRadiusDataset[]; readonly approvedDatasets: readonly AtomicRadiusDataset[]; readonly defaultDatasetId?: string; readonly availabilityMessage: string }
export function createAtomicRadiusRegistry(inputs: readonly unknown[], calculatedDigests: Readonly<Record<string, string>> = {}, defaultDatasetId?: string): AtomicRadiusRegistry {
  const datasets: AtomicRadiusDataset[] = []; const usable: AtomicRadiusDataset[] = []; const approved: AtomicRadiusDataset[] = [];
  for (const input of inputs) { const id = input && typeof input === "object" ? String((input as Record<string, unknown>).datasetId ?? "") : ""; const validation = validateAtomicRadiusDataset(input, calculatedDigests[id]); if (validation.dataset) datasets.push(validation.dataset); if (validation.usableForScreening && validation.dataset) usable.push(validation.dataset); if (validation.approvedForCalculation && validation.dataset) approved.push(validation.dataset); }
  const order = (a: AtomicRadiusDataset, b: AtomicRadiusDataset) => `${a.datasetId}@${a.datasetVersion}`.localeCompare(`${b.datasetId}@${b.datasetVersion}`);
  datasets.sort(order); usable.sort(order); approved.sort(order);
  const selectedDefault = usable.some((item) => item.datasetId === defaultDatasetId) ? defaultDatasetId : usable[0]?.datasetId;
  return Object.freeze({ schemaVersion: "2.0.0", datasets: Object.freeze(datasets), usableDatasets: Object.freeze(usable), approvedDatasets: Object.freeze(approved), ...(selectedDefault ? { defaultDatasetId: selectedDefault } : {}), availabilityMessage: usable.length ? "Source-verified atomic-radius data are installed for screening." : RADIUS_DESCRIPTOR_UNAVAILABLE_MESSAGE });
}

export type RadiusDescriptorAvailabilityStatus = "unavailable-no-verified-dataset" | "unavailable-no-site-model" | "available-screening-dataset";
export interface RadiusDescriptorAvailability { readonly descriptorSchemaVersion: typeof RADIUS_DESCRIPTOR_SCHEMA_VERSION; readonly status: RadiusDescriptorAvailabilityStatus; readonly message: string; readonly siteModel?: SiteComposition; readonly dataset?: AtomicRadiusDataset }
export function assessRadiusDescriptorAvailability(siteModel: SiteComposition | undefined, registry: AtomicRadiusRegistry, selectedDatasetId?: string): RadiusDescriptorAvailability {
  if (!siteModel || !SiteCompositionSchema.safeParse(siteModel).success) return Object.freeze({ descriptorSchemaVersion: RADIUS_DESCRIPTOR_SCHEMA_VERSION, status: "unavailable-no-site-model", message: RADIUS_SITE_MODEL_REQUIRED_MESSAGE });
  const dataset = registry.usableDatasets.find((item) => item.datasetId === selectedDatasetId) ?? registry.usableDatasets.find((item) => item.datasetId === registry.defaultDatasetId);
  if (!dataset) return Object.freeze({ descriptorSchemaVersion: RADIUS_DESCRIPTOR_SCHEMA_VERSION, status: "unavailable-no-verified-dataset", message: RADIUS_DESCRIPTOR_UNAVAILABLE_MESSAGE, siteModel });
  return Object.freeze({ descriptorSchemaVersion: RADIUS_DESCRIPTOR_SCHEMA_VERSION, status: "available-screening-dataset", message: "Source-verified dataset available for screening; laboratory approval is reported separately.", siteModel, dataset });
}

export interface RadiusResolvedOccupant { readonly element: string; readonly occupiedFraction: string; readonly normalizedOccupiedFraction: string; readonly radiusPm?: string; readonly missing: boolean; readonly sourceLocation?: string }
export interface SiteRadiusDescriptor { readonly siteId: string; readonly datasetId: string; readonly datasetVersion: string; readonly occupants: readonly RadiusResolvedOccupant[]; readonly vacancyFraction: string; readonly available: boolean; readonly meanRadiusPm?: string; readonly minimumRadiusPm?: string; readonly maximumRadiusPm?: string; readonly rangeRadiusPm?: string; readonly standardDeviationPm?: string; readonly mismatchPercent?: string; readonly missingElements: readonly string[]; readonly disclaimer: typeof RADIUS_DESCRIPTOR_DISCLAIMER }

export function calculateSiteRadiusDescriptor(siteModel: SiteComposition, siteId: string, dataset: AtomicRadiusDataset, overrides: readonly AtomicRadiusOverride[] = []): SiteRadiusDescriptor {
  const site = siteModel.sites.find((item) => item.id === siteId);
  if (!site) throw new Error(`Unknown explicit site ${siteId}.`);
  const occupiedTotal = site.occupants.reduce((sum, item) => sum.plus(item.fraction), new ChemistryDecimal(0));
  const resolved = site.occupants.map((occupant) => {
    const override = overrides.find((item) => item.element === occupant.element && item.definition === dataset.definition);
    const candidates = dataset.values.filter((item) => item.element === occupant.element && item.defaultForPolicy);
    const value = override ? { radiusPm: override.radiusPm, sourceLocation: override.sourceOrMeasurementBasis } : candidates.length === 1 ? candidates[0] : undefined;
    return Object.freeze({ element: occupant.element, occupiedFraction: occupant.fraction, normalizedOccupiedFraction: formatDecimal(new ChemistryDecimal(occupant.fraction).dividedBy(occupiedTotal)), ...(value ? { radiusPm: value.radiusPm, sourceLocation: value.sourceLocation } : {}), missing: !value });
  });
  const missingElements = resolved.filter((item) => item.missing).map((item) => item.element);
  const base = { siteId, datasetId: dataset.datasetId, datasetVersion: dataset.datasetVersion, occupants: Object.freeze(resolved), vacancyFraction: site.vacancyFraction, missingElements: Object.freeze(missingElements), disclaimer: RADIUS_DESCRIPTOR_DISCLAIMER };
  if (missingElements.length) return Object.freeze({ ...base, available: false });
  const radii = resolved.map((item) => new ChemistryDecimal(item.radiusPm!));
  const weights = resolved.map((item) => new ChemistryDecimal(item.normalizedOccupiedFraction));
  const mean = radii.reduce((sum, radius, index) => sum.plus(radius.times(weights[index]!)), new ChemistryDecimal(0));
  const variance = radii.reduce((sum, radius, index) => sum.plus(radius.minus(mean).pow(2).times(weights[index]!)), new ChemistryDecimal(0));
  const mismatchTerm = radii.reduce((sum, radius, index) => sum.plus(new ChemistryDecimal(1).minus(radius.dividedBy(mean)).pow(2).times(weights[index]!)), new ChemistryDecimal(0));
  const minimum = ChemistryDecimal.min(...radii); const maximum = ChemistryDecimal.max(...radii);
  return Object.freeze({ ...base, available: true, meanRadiusPm: formatDecimal(mean), minimumRadiusPm: formatDecimal(minimum), maximumRadiusPm: formatDecimal(maximum), rangeRadiusPm: formatDecimal(maximum.minus(minimum)), standardDeviationPm: formatDecimal(variance.sqrt()), mismatchPercent: formatDecimal(mismatchTerm.sqrt().times(100)) });
}
