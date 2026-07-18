import { parseFormula } from "@max-stoich/chemistry-engine";
import { z } from "zod";
import { canonicalizeWorkspaceScientificInput, hasValidRationals, hasValidScientificNumbers, sha256Hex, stableCanonicalize } from "../persistence/canonical";
import type { CalculationSnapshot, ComparisonWorkspace, RecipeNote, RecipeRevision, SavedRecipe } from "../persistence/entities";
import { RECIPE_NOTE_BODY_LIMIT, RECIPE_NOTE_TAG_LIMIT, RECIPE_NOTE_TITLE_LIMIT } from "../persistence/repositories";
import { migrateUserSettings, validateUserSettings, type LocalUserSettings } from "../settings/user-settings";
import type { CloudChangeSet, CloudWriteOperation, LocalRecipeBundle } from "./sync-types";

const supportedLocalSchemas = new Set(["2.0.0", "3.0.0", "4.0.0", "5.0.0", "6.0.0", "7.0.0", "8.0.0", "9.0.0", "10.0.0", "11.0.0"]);
const objectSchema = z.record(z.string(), z.unknown());
const uuidSchema = z.string().uuid();
const nonEmpty = z.string().min(1);
const timestamp = z.string().datetime({ offset: true });
const optionalExpectedVersion = z.number().int().positive().optional();
const MAX_SYNC_REQUEST_BYTES = 25 * 1024 * 1024;
const MAX_REVISIONS_PER_RECIPE_BUNDLE = 999;

export class CloudPayloadValidationError extends Error {
  constructor(readonly code: string, message: string, readonly recordId?: string) {
    super(message);
    this.name = "CloudPayloadValidationError";
  }
}

function requireObject(value: unknown, label: string): Record<string, unknown> {
  const parsed = objectSchema.safeParse(value);
  if (!parsed.success) throw new CloudPayloadValidationError("INVALID_RECORD_SHAPE", `${label} is not a structured record.`);
  return parsed.data;
}

export async function validateRecipeBundleForCloud(bundle: LocalRecipeBundle): Promise<void> {
  const recipe = requireObject(bundle.recipe, "Recipe") as unknown as SavedRecipe;
  if (!recipe.id || !recipe.name.trim() || !recipe.currentRevisionId || !supportedLocalSchemas.has(recipe.schemaVersion)) throw new CloudPayloadValidationError("INVALID_RECIPE", "Recipe identity, name, current revision, or schema version is invalid.", recipe.id);
  validateCloudTimestamps(recipe.createdAt, recipe.updatedAt);
  if (!parseFormula(recipe.targetFormula).success) throw new CloudPayloadValidationError("INVALID_TARGET_FORMULA", "The saved target formula is invalid.", recipe.id);
  if (!bundle.revisions.length || bundle.revisions.length > MAX_REVISIONS_PER_RECIPE_BUNDLE) throw new CloudPayloadValidationError("INVALID_REVISION_COUNT", `A recipe bundle requires 1 to ${MAX_REVISIONS_PER_RECIPE_BUNDLE} immutable revisions.`, recipe.id);
  if (bundle.snapshots.length !== bundle.revisions.length) throw new CloudPayloadValidationError("INVALID_SNAPSHOT_COUNT", "A recipe bundle requires exactly one historical snapshot per immutable revision.", recipe.id);
  if (!bundle.revisions.some((item) => item.id === recipe.currentRevisionId)) throw new CloudPayloadValidationError("MISSING_CURRENT_REVISION", "The current recipe revision is absent.", recipe.id);
  const snapshotById = new Map(bundle.snapshots.map((item) => [item.id, item]));
  const revisionNumbers = new Set<number>();
  for (const revision of bundle.revisions) {
    if (revision.recipeId !== recipe.id || !revision.id || revisionNumbers.has(revision.revisionNumber)) throw new CloudPayloadValidationError("INVALID_REVISION_LINK", "A revision has an invalid recipe link or duplicate revision number.", revision.id);
    revisionNumbers.add(revision.revisionNumber);
    const snapshot = snapshotById.get(revision.snapshotId);
    if (!snapshot || snapshot.recipeId !== recipe.id || snapshot.recipeRevisionId !== revision.id) throw new CloudPayloadValidationError("MISSING_SNAPSHOT", "An immutable calculation snapshot is missing or linked incorrectly.", revision.id);
    await validateRevisionAndSnapshot(revision, snapshot);
  }
}

export async function validateRevisionAndSnapshot(revision: RecipeRevision, snapshot: CalculationSnapshot): Promise<void> {
  validateCloudTimestamps(revision.createdAt, snapshot.createdAt);
  if (!supportedLocalSchemas.has(revision.schemaVersion) || !supportedLocalSchemas.has(snapshot.schemaVersion)) throw new CloudPayloadValidationError("UNSUPPORTED_FUTURE_SCHEMA", `Schema ${revision.schemaVersion} is not supported by this MAXCalc release.`, revision.id);
  if (!revision.inputState?.targetFormula || !parseFormula(revision.inputState.targetFormula).success) throw new CloudPayloadValidationError("INVALID_SCIENTIFIC_INPUT", "The stored scientific input has an invalid target formula.", revision.id);
  const canonical = canonicalizeWorkspaceScientificInput(revision.inputState);
  if (canonical !== revision.canonicalScientificInput || await sha256Hex(canonical) !== revision.inputDigest) throw new CloudPayloadValidationError("SCIENTIFIC_DIGEST_MISMATCH", "The immutable scientific input digest does not match.", revision.id);
  if (snapshot.canonicalScientificInput !== revision.canonicalScientificInput || snapshot.inputDigest !== revision.inputDigest) throw new CloudPayloadValidationError("SNAPSHOT_INPUT_MISMATCH", "The revision and historical snapshot describe different scientific inputs.", revision.id);
  if (await sha256Hex(snapshot.canonicalScientificOutput) !== snapshot.outputDigest) throw new CloudPayloadValidationError("SNAPSHOT_OUTPUT_DIGEST_MISMATCH", "The immutable calculation output digest does not match.", revision.id);
  if (!hasValidRationals(snapshot.result) || !hasValidScientificNumbers(snapshot.result)) throw new CloudPayloadValidationError("INVALID_SCIENTIFIC_VALUE", "The immutable snapshot contains a malformed exact rational or numeric value.", revision.id);
  if (!snapshot.engineVersion || !snapshot.atomicWeightDataVersion || !snapshot.atomicWeightDataDigest) throw new CloudPayloadValidationError("MISSING_SCIENTIFIC_PROVENANCE", "Engine or scientific dataset provenance is missing.", revision.id);
}

export function validateRecipeNoteForCloud(note: RecipeNote): void {
  requireObject(note, "Recipe note");
  validateCloudTimestamps(note.createdAt, note.updatedAt);
  if (!note.id || !note.recipeId || !note.category.trim() || !note.title.trim()) throw new CloudPayloadValidationError("INVALID_NOTE", "Note identity, link, category, and title are required.", note.id);
  if (note.title.length > RECIPE_NOTE_TITLE_LIMIT || note.body.length > RECIPE_NOTE_BODY_LIMIT || note.tags.length > RECIPE_NOTE_TAG_LIMIT) throw new CloudPayloadValidationError("NOTE_LIMIT_EXCEEDED", "The note exceeds a title, body, or tag limit.", note.id);
  if (note.experimentDate && !/^\d{4}-\d{2}-\d{2}$/.test(note.experimentDate)) throw new CloudPayloadValidationError("INVALID_EXPERIMENT_DATE", "The note experiment date must use YYYY-MM-DD.", note.id);
}

export function sanitizeComparisonForCloud(comparison: ComparisonWorkspace): ComparisonWorkspace {
  return {
    ...structuredClone(comparison),
    scenarios: comparison.scenarios.map((scenario) => Object.fromEntries(Object.entries(scenario).filter(([key]) => key !== "historical")) as unknown as typeof scenario),
    historical: false,
  };
}

export function validateComparisonForCloud(comparison: ComparisonWorkspace): void {
  requireObject(comparison, "Comparison");
  validateCloudTimestamps(comparison.createdAt, comparison.updatedAt);
  if (!comparison.id || !comparison.name.trim() || comparison.scenarios.length < 2 || comparison.scenarios.length > 4) throw new CloudPayloadValidationError("INVALID_COMPARISON", "A saved comparison requires a name and two to four scenarios.", comparison.id);
  for (const scenario of comparison.scenarios) {
    if (!scenario.id || !scenario.inputState?.targetFormula || !parseFormula(scenario.inputState.targetFormula).success) throw new CloudPayloadValidationError("INVALID_COMPARISON_SCENARIO", "A comparison scenario has an invalid identity or target formula.", comparison.id);
  }
}

export function validateSettingsForCloud(settings: LocalUserSettings): LocalUserSettings {
  const migrated = migrateUserSettings(settings);
  validateCloudTimestamps(migrated.updatedAt);
  const errors = validateUserSettings(migrated);
  if (errors.length) throw new CloudPayloadValidationError("INVALID_SETTINGS", errors.join(" "), settings.id);
  return migrated;
}

const baseOperationSchema = z.object({ kind: nonEmpty });
export async function parseCloudWriteOperations(input: unknown): Promise<readonly CloudWriteOperation[]> {
  if (new TextEncoder().encode(JSON.stringify(input)).byteLength > MAX_SYNC_REQUEST_BYTES) {
    throw new CloudPayloadValidationError("SYNC_REQUEST_TOO_LARGE", "The sync request exceeds the supported payload size.");
  }
  const root = z.object({ operations: z.array(baseOperationSchema.passthrough()).max(250) }).safeParse(input);
  if (!root.success) throw new CloudPayloadValidationError("INVALID_SYNC_REQUEST", "The sync request is malformed or too large.");
  const operations: CloudWriteOperation[] = [];
  for (const raw of root.data.operations) {
    const value = raw as Record<string, unknown>;
    const sourceDeviceId = typeof value.sourceDeviceId === "string" ? value.sourceDeviceId : "";
    if (value.kind !== "upsert-device" && !sourceDeviceId) throw new CloudPayloadValidationError("MISSING_DEVICE_ID", "A source installation ID is required.");
    if (sourceDeviceId.length > 200) throw new CloudPayloadValidationError("DEVICE_ID_TOO_LONG", "A source installation ID may not exceed 200 characters.");
    switch (value.kind) {
      case "upsert-recipe-bundle": {
        const bundle = value.bundle as LocalRecipeBundle;
        await validateRecipeBundleForCloud(bundle);
        optionalExpectedVersion.parse(value.expectedVersion);
        const mappings = requireObject(value.mappings, "Cloud ID mapping") as { recipeCloudId?: unknown; revisionCloudIds?: unknown };
        uuidSchema.parse(mappings.recipeCloudId);
        const revisionMappings = requireObject(mappings.revisionCloudIds, "Revision cloud ID mapping");
        for (const revision of bundle.revisions) uuidSchema.parse(revisionMappings[revision.id]);
        operations.push(value as unknown as CloudWriteOperation);
        break;
      }
      case "soft-delete-recipe":
      case "soft-delete-note":
      case "soft-delete-comparison":
        uuidSchema.parse(value.cloudId);
        z.number().int().positive().parse(value.expectedVersion);
        nonEmpty.parse(value.id);
        operations.push(value as unknown as CloudWriteOperation);
        break;
      case "upsert-note":
        uuidSchema.parse(value.cloudId);
        uuidSchema.parse(value.recipeCloudId);
        if (value.revisionCloudId) uuidSchema.parse(value.revisionCloudId);
        validateRecipeNoteForCloud(value.note as RecipeNote);
        optionalExpectedVersion.parse(value.expectedVersion);
        operations.push(value as unknown as CloudWriteOperation);
        break;
      case "upsert-comparison":
        uuidSchema.parse(value.cloudId);
        validateComparisonForCloud(value.comparison as ComparisonWorkspace);
        optionalExpectedVersion.parse(value.expectedVersion);
        operations.push({ ...(value as unknown as Extract<CloudWriteOperation, { kind: "upsert-comparison" }>), comparison: sanitizeComparisonForCloud(value.comparison as ComparisonWorkspace) });
        break;
      case "upsert-settings":
        optionalExpectedVersion.parse(value.expectedVersion);
        operations.push({ ...(value as unknown as Extract<CloudWriteOperation, { kind: "upsert-settings" }>), settings: validateSettingsForCloud(value.settings as LocalUserSettings) });
        break;
      case "upsert-device":
        uuidSchema.parse(value.cloudId);
        nonEmpty.max(200).parse(value.installationId);
        if (value.displayName !== undefined) z.string().max(120).parse(value.displayName);
        operations.push(value as unknown as CloudWriteOperation);
        break;
      default:
        throw new CloudPayloadValidationError("UNSUPPORTED_SYNC_OPERATION", `Unsupported sync operation ${String(value.kind)}.`);
    }
  }
  return operations;
}

export function validateChangeSetEnvelope(input: unknown, expectedOwnerId: string): CloudChangeSet {
  const value = requireObject(input, "Cloud change set") as unknown as CloudChangeSet;
  if (value.ownerId !== expectedOwnerId || !Array.isArray(value.recipes) || !Array.isArray(value.revisions) || !Array.isArray(value.notes) || !Array.isArray(value.comparisons) || !Array.isArray(value.devices)) throw new CloudPayloadValidationError("INVALID_CHANGE_SET", "Cloud changes are malformed or claim a different account.");
  if (!/^\d+$/.test(value.cursor)) throw new CloudPayloadValidationError("INVALID_SYNC_CURSOR", "The server sync cursor is invalid.");
  return value;
}

export function validateCloudTimestamps(createdAt: string, updatedAt?: string): void {
  timestamp.parse(createdAt);
  if (updatedAt) timestamp.parse(updatedAt);
}

export function differingFields(left: unknown, right: unknown): readonly string[] {
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return ["value"];
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  return [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])].filter((key) => stableCanonicalize(leftRecord[key]) !== stableCanonicalize(rightRecord[key])).sort();
}
