import { z } from "zod";
import { parseDecimal } from "./numeric";
import { VALID_ELEMENT_SYMBOLS } from "./periodic-table";
import { DecimalStringSchema, ElementSymbolSchema, IdSchema, SiteCompositionSchema, type SiteComposition } from "./schemas";

export const ATOMIC_RADIUS_DATASET_SCHEMA_VERSION = "1.0.0" as const;
export const RADIUS_DESCRIPTOR_SCHEMA_VERSION = "1.0.0" as const;
export const RADIUS_DESCRIPTOR_UNAVAILABLE_MESSAGE = "Atomic-radius descriptors unavailable: no approved dataset is installed." as const;
export const RADIUS_SITE_MODEL_REQUIRED_MESSAGE = "Assign elements to explicit crystallographic sites to calculate site-radius descriptors." as const;

export const RadiusDefinitionSchema = z.enum(["metallic", "covalent", "ionic", "empirical-atomic", "custom"]);
export const RadiusSourceSchema = z.object({
  sourceId: IdSchema,
  title: z.string().min(1),
  primarySource: z.string().min(1),
  editionOrVersion: z.string().min(1),
  publicationYear: z.string().regex(/^\d{4}$/).optional(),
  url: z.url().optional(),
  doi: z.string().min(1).optional(),
  accessedAt: z.iso.date().optional(),
});
export const RadiusDatasetApprovalSchema = z.object({
  status: z.enum(["approved", "provisional", "imported-unverified", "rejected"]),
  reviewer: z.string().min(1).optional(),
  reviewDate: z.iso.date().optional(),
  reviewRecord: z.string().min(1).optional(),
}).superRefine((approval, context) => {
  if (approval.status === "approved" && !approval.reviewer) context.addIssue({ code: "custom", path: ["reviewer"], message: "Approved datasets require a named reviewer." });
  if (approval.status === "approved" && !approval.reviewDate) context.addIssue({ code: "custom", path: ["reviewDate"], message: "Approved datasets require a review date." });
});
export const ApprovedAtomicRadiusRecordSchema = z.object({
  element: ElementSymbolSchema,
  radiusPm: DecimalStringSchema,
  coordinationNumber: z.string().min(1).optional(),
  oxidationState: z.string().min(1).optional(),
  spinState: z.string().min(1).optional(),
  sourceLocation: z.string().min(1).optional(),
  notes: z.string().optional(),
});
export const ApprovedAtomicRadiusDatasetSchema = z.object({
  schemaVersion: z.literal(ATOMIC_RADIUS_DATASET_SCHEMA_VERSION),
  datasetId: IdSchema,
  datasetVersion: z.string().regex(/^\d{4}\.\d+\.\d+$/),
  name: z.string().min(1),
  definition: RadiusDefinitionSchema,
  source: RadiusSourceSchema,
  units: z.literal("pm"),
  coordinationPolicy: z.string().min(1),
  oxidationStatePolicy: z.string().min(1),
  spinStatePolicy: z.string().min(1),
  missingValuePolicy: z.literal("block-site-descriptor"),
  approval: RadiusDatasetApprovalSchema,
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  values: z.array(ApprovedAtomicRadiusRecordSchema),
});

export const AtomicRadiusOverrideSchema = z.object({
  overrideId: IdSchema,
  element: ElementSymbolSchema,
  radiusPm: DecimalStringSchema,
  units: z.literal("pm"),
  definition: RadiusDefinitionSchema,
  reason: z.string().min(1),
  sourceOrMeasurementBasis: z.string().min(1),
  label: z.string().min(1),
  revisionDate: z.iso.date(),
  coordinationContext: z.string().min(1).optional(),
  oxidationContext: z.string().min(1).optional(),
});

export type RadiusDefinition = z.infer<typeof RadiusDefinitionSchema>;
export type AtomicRadiusDataset = Readonly<Omit<z.infer<typeof ApprovedAtomicRadiusDatasetSchema>, "values"> & { readonly values: readonly Readonly<z.infer<typeof ApprovedAtomicRadiusRecordSchema>>[] }>;
export type AtomicRadiusOverride = Readonly<z.infer<typeof AtomicRadiusOverrideSchema>>;
export type RadiusDatasetApproval = Readonly<z.infer<typeof RadiusDatasetApprovalSchema>>;
export interface RadiusDescriptorConfig { readonly schemaVersion: "1.0.0"; readonly enabled: boolean; readonly datasetId: string; readonly datasetVersion: string; readonly datasetDigest: string; readonly overrides: readonly AtomicRadiusOverride[] }

export function canonicalRadiusDatasetContent(dataset: AtomicRadiusDataset): unknown {
  return Object.fromEntries(Object.entries(dataset).filter(([key]) => key !== "digest" && key !== "approval"));
}

export type RadiusDatasetDiagnosticCode =
  | "RADIUS_DATASET_INVALID"
  | "RADIUS_DATASET_ID_MISSING"
  | "RADIUS_DATASET_SOURCE_MISSING"
  | "RADIUS_DATASET_UNITS_INVALID"
  | "RADIUS_VALUE_INVALID"
  | "RADIUS_ELEMENT_DUPLICATE"
  | "RADIUS_ELEMENT_UNKNOWN"
  | "RADIUS_DATASET_DIGEST_MISMATCH"
  | "RADIUS_DATASET_UNAPPROVED";
export interface RadiusDatasetDiagnostic { readonly code: RadiusDatasetDiagnosticCode; readonly path: string; readonly message: string; readonly blocking: boolean }
export interface AtomicRadiusDatasetValidationResult { readonly valid: boolean; readonly approvedForCalculation: boolean; readonly diagnostics: readonly RadiusDatasetDiagnostic[]; readonly dataset?: AtomicRadiusDataset }

function freezeDataset(dataset: z.infer<typeof ApprovedAtomicRadiusDatasetSchema>): AtomicRadiusDataset {
  return Object.freeze({ ...dataset, source: Object.freeze({ ...dataset.source }), approval: Object.freeze({ ...dataset.approval }), values: Object.freeze(dataset.values.map((value) => Object.freeze({ ...value }))) });
}

export function validateAtomicRadiusDataset(input: unknown, calculatedDigest?: string): AtomicRadiusDatasetValidationResult {
  const diagnostics: RadiusDatasetDiagnostic[] = [];
  const candidate = input && typeof input === "object" ? input as Record<string, unknown> : {};
  if (typeof candidate.datasetId !== "string" || !candidate.datasetId.trim()) diagnostics.push({ code: "RADIUS_DATASET_ID_MISSING", path: "datasetId", message: "Atomic-radius dataset ID is required.", blocking: true });
  if (!candidate.source || typeof candidate.source !== "object") diagnostics.push({ code: "RADIUS_DATASET_SOURCE_MISSING", path: "source", message: "A primary scientific source and edition/version are required.", blocking: true });
  if (candidate.units !== "pm") diagnostics.push({ code: "RADIUS_DATASET_UNITS_INVALID", path: "units", message: "Atomic-radius datasets must use picometres (pm); automatic conversion is not supported.", blocking: true });
  const parsed = ApprovedAtomicRadiusDatasetSchema.safeParse(input);
  if (!parsed.success) for (const issue of parsed.error.issues) diagnostics.push({ code: "RADIUS_DATASET_INVALID", path: issue.path.join("."), message: issue.message, blocking: true });
  if (!parsed.success) return Object.freeze({ valid: false, approvedForCalculation: false, diagnostics: Object.freeze(diagnostics) });
  const seen = new Set<string>();
  parsed.data.values.forEach((record, index) => {
    if (!VALID_ELEMENT_SYMBOLS.has(record.element)) diagnostics.push({ code: "RADIUS_ELEMENT_UNKNOWN", path: `values.${index}.element`, message: `${record.element} is not a recognized chemical element symbol.`, blocking: true });
    if (seen.has(record.element)) diagnostics.push({ code: "RADIUS_ELEMENT_DUPLICATE", path: `values.${index}.element`, message: `Dataset contains more than one unconditional value for ${record.element}.`, blocking: true });
    seen.add(record.element);
    const radius = parseDecimal(record.radiusPm);
    if (!radius?.isFinite() || !radius.greaterThan(0)) diagnostics.push({ code: "RADIUS_VALUE_INVALID", path: `values.${index}.radiusPm`, message: `Radius for ${record.element} must be finite and greater than zero.`, blocking: true });
  });
  if (calculatedDigest === undefined || calculatedDigest !== parsed.data.digest) diagnostics.push({ code: "RADIUS_DATASET_DIGEST_MISMATCH", path: "digest", message: calculatedDigest === undefined ? "Atomic-radius dataset content digest has not been independently verified." : "Atomic-radius dataset content digest does not match.", blocking: true });
  if (parsed.data.approval.status !== "approved") diagnostics.push({ code: "RADIUS_DATASET_UNAPPROVED", path: "approval.status", message: "Only a locally approved dataset may enable authoritative radius descriptors.", blocking: true });
  const valid = diagnostics.every((item) => !item.blocking);
  return Object.freeze({ valid, approvedForCalculation: valid && parsed.data.approval.status === "approved", diagnostics: Object.freeze(diagnostics), dataset: freezeDataset(parsed.data) });
}

export interface AtomicRadiusRegistry { readonly schemaVersion: "1.0.0"; readonly datasets: readonly AtomicRadiusDataset[]; readonly approvedDatasets: readonly AtomicRadiusDataset[]; readonly defaultDatasetId?: string; readonly availabilityMessage: string }
export function createAtomicRadiusRegistry(inputs: readonly unknown[], calculatedDigests: Readonly<Record<string, string>> = {}, defaultDatasetId?: string): AtomicRadiusRegistry {
  const datasets: AtomicRadiusDataset[] = []; const approved: AtomicRadiusDataset[] = [];
  for (const input of inputs) { const id = input && typeof input === "object" ? String((input as Record<string, unknown>).datasetId ?? "") : ""; const validation = validateAtomicRadiusDataset(input, calculatedDigests[id]); if (validation.dataset) datasets.push(validation.dataset); if (validation.approvedForCalculation && validation.dataset) approved.push(validation.dataset); }
  datasets.sort((left, right) => `${left.datasetId}@${left.datasetVersion}`.localeCompare(`${right.datasetId}@${right.datasetVersion}`)); approved.sort((left, right) => `${left.datasetId}@${left.datasetVersion}`.localeCompare(`${right.datasetId}@${right.datasetVersion}`));
  const selectedDefault = approved.some((item) => item.datasetId === defaultDatasetId) ? defaultDatasetId : approved[0]?.datasetId;
  return Object.freeze({ schemaVersion: "1.0.0", datasets: Object.freeze(datasets), approvedDatasets: Object.freeze(approved), ...(selectedDefault ? { defaultDatasetId: selectedDefault } : {}), availabilityMessage: approved.length ? "Approved atomic-radius data are installed." : RADIUS_DESCRIPTOR_UNAVAILABLE_MESSAGE });
}

export type RadiusDescriptorAvailabilityStatus = "unavailable-no-approved-dataset" | "unavailable-no-site-model" | "available-dataset-gate-open";
export interface RadiusDescriptorAvailability { readonly descriptorSchemaVersion: typeof RADIUS_DESCRIPTOR_SCHEMA_VERSION; readonly status: RadiusDescriptorAvailabilityStatus; readonly message: string; readonly siteModel?: SiteComposition; readonly dataset?: AtomicRadiusDataset }
export function assessRadiusDescriptorAvailability(siteModel: SiteComposition | undefined, registry: AtomicRadiusRegistry, selectedDatasetId?: string): RadiusDescriptorAvailability {
  if (!siteModel) return Object.freeze({ descriptorSchemaVersion: RADIUS_DESCRIPTOR_SCHEMA_VERSION, status: "unavailable-no-site-model", message: RADIUS_SITE_MODEL_REQUIRED_MESSAGE });
  const parsedSite = SiteCompositionSchema.safeParse(siteModel); if (!parsedSite.success) return Object.freeze({ descriptorSchemaVersion: RADIUS_DESCRIPTOR_SCHEMA_VERSION, status: "unavailable-no-site-model", message: RADIUS_SITE_MODEL_REQUIRED_MESSAGE });
  const dataset = registry.approvedDatasets.find((item) => item.datasetId === selectedDatasetId) ?? registry.approvedDatasets.find((item) => item.datasetId === registry.defaultDatasetId);
  if (!dataset) return Object.freeze({ descriptorSchemaVersion: RADIUS_DESCRIPTOR_SCHEMA_VERSION, status: "unavailable-no-approved-dataset", message: RADIUS_DESCRIPTOR_UNAVAILABLE_MESSAGE, siteModel });
  return Object.freeze({ descriptorSchemaVersion: RADIUS_DESCRIPTOR_SCHEMA_VERSION, status: "available-dataset-gate-open", message: "An approved dataset is installed; descriptor calculation implementation may be enabled after reviewed scientific fixtures are added.", siteModel, dataset });
}
