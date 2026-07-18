import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";
import type {
  CloudChangeSet,
  CloudComparison,
  CloudRecipe,
  CloudRecipeBundle,
  CloudRecipeNote,
  CloudRecipeRevision,
  CloudUserSettings,
  CloudWriteOperation,
  CloudWriteResult,
} from "@/lib/cloud/sync-types";
import { CloudPayloadValidationError, parseCloudWriteOperations } from "@/lib/cloud/validation";
import type { ComparisonWorkspace, RecipeNote } from "@/lib/persistence/entities";
import type { LocalUserSettings } from "@/lib/settings/user-settings";
import { validateJsonRequestHeaders } from "@/lib/security/request-guards";

export const dynamic = "force-dynamic";
const MAX_PULL_ROWS = 1_000;
const MAX_SYNC_REQUEST_BYTES = 25 * 1024 * 1024;
const IDENTITY_PAGE_SIZE = 500;
const MAX_IDENTITY_ROWS = 20_000;
type Client = SupabaseClient<Database>;
type RecipeRow = Database["public"]["Tables"]["recipes"]["Row"];
type RevisionRow = Database["public"]["Tables"]["recipe_revisions"]["Row"];
type NoteRow = Database["public"]["Tables"]["recipe_notes"]["Row"];
type ComparisonRow = Database["public"]["Tables"]["comparisons"]["Row"];
type SettingsRow = Database["public"]["Tables"]["user_settings"]["Row"];

const json = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json;
const statusError = (status: number, code: string, message: string) => NextResponse.json({ code, message }, { status });

async function authenticatedClient(): Promise<Readonly<{ client: Client; userId: string }> | null> {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { client, userId: data.user.id };
}

function mapRecipe(row: RecipeRow, revisionLocalIds: ReadonlyMap<string, string>): CloudRecipe {
  return {
    cloudId: row.id,
    id: row.local_record_id,
    ownerId: row.owner_id,
    name: row.name,
    targetFormula: row.target_formula,
    description: row.description,
    tags: row.tags,
    currentRevisionId: row.current_revision_id ? revisionLocalIds.get(row.current_revision_id) ?? "" : "",
    ...(row.archived_at ? { archivedAt: row.archived_at } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
    ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
    syncSequence: String(row.sync_sequence),
    ...(row.source_installation_id ? { sourceDeviceId: row.source_installation_id } : {}),
  };
}

function mapRevision(row: RevisionRow, recipeLocalIds: ReadonlyMap<string, string>): CloudRecipeRevision {
  return {
    cloudId: row.id,
    id: row.local_record_id,
    recipeCloudId: row.recipe_id,
    recipeId: recipeLocalIds.get(row.recipe_id) ?? "",
    ownerId: row.owner_id,
    revisionNumber: row.revision_number,
    scientificInput: row.scientific_input as unknown as CloudRecipeRevision["scientificInput"],
    calculationSnapshot: row.calculation_snapshot as unknown as CloudRecipeRevision["calculationSnapshot"],
    schemaVersion: row.schema_version,
    engineVersion: row.engine_version,
    ...(row.revision_note ? { revisionNote: row.revision_note } : {}),
    createdAt: row.created_at,
    contentDigest: row.content_digest,
    syncSequence: String(row.sync_sequence),
    ...(row.source_installation_id ? { sourceDeviceId: row.source_installation_id } : {}),
  };
}

function mapNote(row: NoteRow, recipeLocalIds: ReadonlyMap<string, string>, revisionLocalIds: ReadonlyMap<string, string>): CloudRecipeNote {
  const note: RecipeNote = {
    schemaVersion: "11.0.0",
    id: row.local_record_id,
    recipeId: recipeLocalIds.get(row.recipe_id) ?? "",
    ...(row.revision_id ? { recipeRevisionId: revisionLocalIds.get(row.revision_id) ?? "" } : {}),
    category: row.category,
    title: row.title,
    body: row.body,
    tags: row.tags,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.experiment_date ? { experimentDate: row.experiment_date } : {}),
    ...(row.operator ? { operator: row.operator } : {}),
    archived: Boolean(row.archived_at),
  };
  return {
    cloudId: row.id,
    id: row.local_record_id,
    recipeCloudId: row.recipe_id,
    recipeId: note.recipeId,
    ...(row.revision_id ? { revisionCloudId: row.revision_id, revisionId: note.recipeRevisionId } : {}),
    ownerId: row.owner_id,
    note,
    version: row.version,
    ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
    syncSequence: String(row.sync_sequence),
    ...(row.source_installation_id ? { sourceDeviceId: row.source_installation_id } : {}),
  };
}

function mapComparison(row: ComparisonRow): CloudComparison {
  return {
    cloudId: row.id,
    id: row.local_record_id,
    ownerId: row.owner_id,
    comparison: row.comparison_data as unknown as ComparisonWorkspace,
    version: row.version,
    ...(row.deleted_at ? { deletedAt: row.deleted_at } : {}),
    syncSequence: String(row.sync_sequence),
    ...(row.source_installation_id ? { sourceDeviceId: row.source_installation_id } : {}),
  };
}

function mapSettings(row: SettingsRow): CloudUserSettings {
  return {
    ownerId: row.owner_id,
    settings: row.settings_data as unknown as LocalUserSettings,
    version: row.version,
    syncSequence: String(row.sync_sequence),
    ...(row.source_installation_id ? { sourceDeviceId: row.source_installation_id } : {}),
  };
}

async function identityMaps(client: Client): Promise<Readonly<{ recipes: Map<string, string>; revisions: Map<string, string> }>> {
  const loadRecipes = async () => {
    const rows: { id: string; local_record_id: string }[] = [];
    for (let offset = 0; offset < MAX_IDENTITY_ROWS; offset += IDENTITY_PAGE_SIZE) {
      const { data, error } = await client.from("recipes").select("id,local_record_id").order("id").range(offset, offset + IDENTITY_PAGE_SIZE - 1);
      if (error) throw error;
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < IDENTITY_PAGE_SIZE) return rows;
    }
    throw new Error("The account identity map exceeds this MAXCalc release's documented synchronization limit.");
  };
  const loadRevisions = async () => {
    const rows: { id: string; local_record_id: string }[] = [];
    for (let offset = 0; offset < MAX_IDENTITY_ROWS; offset += IDENTITY_PAGE_SIZE) {
      const { data, error } = await client.from("recipe_revisions").select("id,local_record_id").order("id").range(offset, offset + IDENTITY_PAGE_SIZE - 1);
      if (error) throw error;
      rows.push(...(data ?? []));
      if ((data?.length ?? 0) < IDENTITY_PAGE_SIZE) return rows;
    }
    throw new Error("The account revision identity map exceeds this MAXCalc release's documented synchronization limit.");
  };
  const [recipes, revisions] = await Promise.all([loadRecipes(), loadRevisions()]);
  return {
    recipes: new Map(recipes.map((item) => [item.id, item.local_record_id])),
    revisions: new Map(revisions.map((item) => [item.id, item.local_record_id])),
  };
}

async function getRecipeBundle(client: Client, userId: string, localRecipeId: string): Promise<CloudRecipeBundle | undefined> {
  const { data: recipe, error } = await client.from("recipes").select("*").eq("local_record_id", localRecipeId).maybeSingle();
  if (error) throw error;
  if (!recipe) return undefined;
  const { data: revisions, error: revisionError } = await client.from("recipe_revisions").select("*").eq("recipe_id", recipe.id).order("revision_number");
  if (revisionError) throw revisionError;
  const recipeIds = new Map([[recipe.id, localRecipeId]]);
  const revisionIds = new Map((revisions ?? []).map((item) => [item.id, item.local_record_id]));
  return { recipe: mapRecipe(recipe, revisionIds), revisions: (revisions ?? []).map((item) => mapRevision(item, recipeIds)) };
}

export async function GET(request: NextRequest) {
  const auth = await authenticatedClient();
  if (!auth) return statusError(401, "AUTH_REQUIRED", "Sign in before synchronizing cloud data.");
  const recipeId = request.nextUrl.searchParams.get("recipeId");
  if (recipeId) {
    try {
      const bundle = await getRecipeBundle(auth.client, auth.userId, recipeId);
      return bundle ? NextResponse.json(bundle) : statusError(404, "RECIPE_NOT_FOUND", "The cloud recipe was not found.");
    } catch { return statusError(503, "CLOUD_READ_FAILED", "The cloud recipe could not be loaded."); }
  }
  const cursor = request.nextUrl.searchParams.get("cursor") ?? "0";
  if (!/^\d+$/.test(cursor)) return statusError(400, "INVALID_SYNC_CURSOR", "The sync cursor must be a non-negative integer.");
  try {
    const { data: highWatermark, error: cursorError } = await auth.client.rpc("get_maxcalc_sync_high_watermark");
    if (cursorError) throw cursorError;
    const high = String(highWatermark ?? "0");
    if (BigInt(cursor) > BigInt(high)) return statusError(400, "INVALID_SYNC_CURSOR", "The sync cursor is ahead of the server cursor.");
    const after = cursor as unknown as number;
    const through = high as unknown as number;
    const [recipeResult, revisionResult, noteResult, comparisonResult, settingsResult, deviceResult, maps] = await Promise.all([
      auth.client.from("recipes").select("*").gt("sync_sequence", after).lte("sync_sequence", through).order("sync_sequence").order("id").limit(MAX_PULL_ROWS),
      auth.client.from("recipe_revisions").select("*").gt("sync_sequence", after).lte("sync_sequence", through).order("sync_sequence").order("id").limit(MAX_PULL_ROWS),
      auth.client.from("recipe_notes").select("*").gt("sync_sequence", after).lte("sync_sequence", through).order("sync_sequence").order("id").limit(MAX_PULL_ROWS),
      auth.client.from("comparisons").select("*").gt("sync_sequence", after).lte("sync_sequence", through).order("sync_sequence").order("id").limit(MAX_PULL_ROWS),
      auth.client.from("user_settings").select("*").gt("sync_sequence", after).lte("sync_sequence", through).maybeSingle(),
      auth.client.from("user_devices").select("*").order("updated_at", { ascending: false }).limit(100),
      identityMaps(auth.client),
    ]);
    const firstError = recipeResult.error ?? revisionResult.error ?? noteResult.error ?? comparisonResult.error ?? settingsResult.error ?? deviceResult.error;
    if (firstError) throw firstError;

    // A changed recipe includes every immutable revision, so a repaired or new
    // local cache cannot advance its cursor with an incomplete bundle.
    const changedRecipeIds = (recipeResult.data ?? []).map((item) => item.id);
    let revisions = revisionResult.data ?? [];
    if (changedRecipeIds.length) {
      const complete = await auth.client.from("recipe_revisions").select("*").in("recipe_id", changedRecipeIds).limit(MAX_PULL_ROWS);
      if (complete.error) throw complete.error;
      if ((complete.data?.length ?? 0) === MAX_PULL_ROWS) {
        throw new Error("A changed recipe bundle reached the immutable-revision safety limit and was not returned partially.");
      }
      revisions = [...new Map([...revisions, ...(complete.data ?? [])].map((item) => [item.id, item])).values()];
    }
    const saturatedLastSequences = [
      recipeResult.data ?? [],
      revisionResult.data ?? [],
      noteResult.data ?? [],
      comparisonResult.data ?? [],
    ].filter((rows) => rows.length === MAX_PULL_ROWS).map((rows) => BigInt(String(rows.at(-1)!.sync_sequence)));
    const safeCursor = saturatedLastSequences.length
      ? saturatedLastSequences.reduce((smallest, value) => value < smallest ? value : smallest, BigInt(high)).toString()
      : high;
    const payload: CloudChangeSet = {
      ownerId: auth.userId,
      cursor: safeCursor,
      recipes: (recipeResult.data ?? []).map((item) => mapRecipe(item, maps.revisions)),
      revisions: revisions.map((item) => mapRevision(item, maps.recipes)),
      notes: (noteResult.data ?? []).map((item) => mapNote(item, maps.recipes, maps.revisions)),
      comparisons: (comparisonResult.data ?? []).map(mapComparison),
      ...(settingsResult.data ? { settings: mapSettings(settingsResult.data) } : {}),
      devices: (deviceResult.data ?? []).map((item) => ({
        cloudId: item.id,
        installationId: item.installation_id,
        ...(item.display_name ? { displayName: item.display_name } : {}),
        ...(item.last_sync_at ? { lastSyncAt: item.last_sync_at } : {}),
        updatedAt: item.updated_at,
      })),
    };
    return NextResponse.json(payload);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") console.error("[cloud-sync]", { event: "pull_failed", category: error instanceof Error ? error.name : "unknown" });
    return statusError(503, "CLOUD_PULL_FAILED", "Cloud changes could not be downloaded. Local data was not changed.");
  }
}

function recipePayload(operation: Extract<CloudWriteOperation, { kind: "upsert-recipe-bundle" }>) {
  const { recipe } = operation.bundle;
  return {
    id: operation.mappings.recipeCloudId,
    local_record_id: recipe.id,
    name: recipe.name,
    target_formula: recipe.targetFormula,
    description: recipe.description,
    tags: recipe.tags,
    current_revision_id: operation.mappings.revisionCloudIds[recipe.currentRevisionId],
    archived_at: recipe.archived ? recipe.updatedAt : null,
    created_at: recipe.createdAt,
    deleted_at: null,
    source_installation_id: operation.sourceDeviceId,
  };
}

function revisionPayloads(operation: Extract<CloudWriteOperation, { kind: "upsert-recipe-bundle" }>) {
  const snapshots = new Map(operation.bundle.snapshots.map((item) => [item.id, item]));
  return operation.bundle.revisions.map((revision) => ({
    id: operation.mappings.revisionCloudIds[revision.id],
    local_record_id: revision.id,
    revision_number: revision.revisionNumber,
    scientific_input: revision,
    calculation_snapshot: snapshots.get(revision.snapshotId),
    schema_version: revision.schemaVersion,
    engine_version: revision.engineVersion,
    revision_note: revision.revisionNote,
    created_at: revision.createdAt,
    content_digest: revision.inputDigest,
    source_installation_id: operation.sourceDeviceId,
  }));
}

async function applyRecipe(client: Client, userId: string, operation: Extract<CloudWriteOperation, { kind: "upsert-recipe-bundle" }>): Promise<CloudWriteResult> {
  const { data, error } = await client.rpc("apply_recipe_bundle", {
    recipe_payload: json(recipePayload(operation)),
    revision_payloads: json(revisionPayloads(operation)),
    expected_version: operation.expectedVersion ?? null,
  });
  if (error) {
    if (error.code === "40001" || error.code === "23000" || /conflict/i.test(error.message)) {
      const current = await getRecipeBundle(client, userId, operation.bundle.recipe.id);
      const local = operation.bundle.recipe;
      const identical = current
        && current.recipe.name === local.name
        && current.recipe.targetFormula === local.targetFormula
        && current.recipe.description === local.description
        && JSON.stringify(current.recipe.tags) === JSON.stringify(local.tags)
        && current.recipe.currentRevisionId === local.currentRevisionId
        && Boolean(current.recipe.archivedAt || current.recipe.deletedAt) === local.archived
        && current.revisions.length === operation.bundle.revisions.length
        && operation.bundle.revisions.every((revision) => current.revisions.some((candidate) => candidate.id === revision.id && candidate.contentDigest === revision.inputDigest));
      if (identical && current) return { operation: operation.kind, recordId: local.id, status: "identical", cloudVersion: current.recipe.version, cloudUpdatedAt: current.recipe.updatedAt, cloudRecord: current.recipe };
      return { operation: operation.kind, recordId: operation.bundle.recipe.id, status: "conflict", message: error.code === "23000" ? "Scientific revision integrity conflict." : "The cloud recipe changed since the last sync.", ...(current ? { cloudVersion: current.recipe.version, cloudUpdatedAt: current.recipe.updatedAt, cloudRecord: current.recipe } : {}) };
    }
    throw error;
  }
  const row = data as RecipeRow;
  const localRevisionMap = new Map(operation.bundle.revisions.map((item) => [operation.mappings.revisionCloudIds[item.id]!, item.id]));
  return { operation: operation.kind, recordId: operation.bundle.recipe.id, status: "applied", cloudVersion: row.version, cloudUpdatedAt: row.updated_at, cloudRecord: mapRecipe(row, localRevisionMap) };
}

async function applyNote(client: Client, userId: string, operation: Extract<CloudWriteOperation, { kind: "upsert-note" }>): Promise<CloudWriteResult> {
  const note = operation.note;
  const values = {
    id: operation.cloudId,
    local_record_id: note.id,
    recipe_id: operation.recipeCloudId,
    revision_id: operation.revisionCloudId ?? null,
    owner_id: userId,
    category: note.category,
    title: note.title,
    body: note.body,
    tags: [...note.tags],
    experiment_date: note.experimentDate ?? null,
    operator: note.operator ?? null,
    archived_at: note.archived ? note.updatedAt : null,
    created_at: note.createdAt,
    source_installation_id: operation.sourceDeviceId,
  };
  let row: NoteRow | null = null;
  if (operation.expectedVersion === undefined) {
    const existing = await client.from("recipe_notes").select("*").eq("id", operation.cloudId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      const identical = existing.data.local_record_id === note.id && existing.data.title === note.title && existing.data.body === note.body && existing.data.category === note.category && JSON.stringify(existing.data.tags) === JSON.stringify(note.tags);
      if (!identical) return { operation: operation.kind, recordId: note.id, status: "conflict", cloudVersion: existing.data.version, cloudUpdatedAt: existing.data.updated_at, message: "The stable note ID already has different cloud content." };
      row = existing.data;
    } else {
      const inserted = await client.from("recipe_notes").insert(values).select().single();
      if (inserted.error) throw inserted.error;
      row = inserted.data;
    }
  } else {
    const mutable: Database["public"]["Tables"]["recipe_notes"]["Update"] = { category: values.category, title: values.title, body: values.body, tags: values.tags, experiment_date: values.experiment_date, operator: values.operator, archived_at: values.archived_at, source_installation_id: values.source_installation_id };
    const updated = await client.from("recipe_notes").update(mutable).eq("id", operation.cloudId).eq("version", operation.expectedVersion).select().maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) {
      const current = await client.from("recipe_notes").select("*").eq("id", operation.cloudId).maybeSingle();
      const recipes = new Map([[operation.recipeCloudId, note.recipeId]]);
      const revisions = new Map(operation.revisionCloudId && note.recipeRevisionId ? [[operation.revisionCloudId, note.recipeRevisionId]] : []);
      const identical = current.data
        && current.data.local_record_id === note.id
        && current.data.recipe_id === operation.recipeCloudId
        && current.data.revision_id === (operation.revisionCloudId ?? null)
        && current.data.category === note.category
        && current.data.title === note.title
        && current.data.body === note.body
        && JSON.stringify(current.data.tags) === JSON.stringify(note.tags)
        && current.data.experiment_date === (note.experimentDate ?? null)
        && current.data.operator === (note.operator ?? null)
        && Boolean(current.data.archived_at) === note.archived;
      if (identical && current.data) return { operation: operation.kind, recordId: note.id, status: "identical", cloudVersion: current.data.version, cloudUpdatedAt: current.data.updated_at, cloudRecord: mapNote(current.data, recipes, revisions) };
      return { operation: operation.kind, recordId: note.id, status: "conflict", message: "The cloud note changed since the last sync.", ...(current.data ? { cloudVersion: current.data.version, cloudUpdatedAt: current.data.updated_at, cloudRecord: mapNote(current.data, recipes, revisions) } : {}) };
    }
    row = updated.data;
  }
  const recipes = new Map([[operation.recipeCloudId, note.recipeId]]);
  const revisions = new Map(operation.revisionCloudId && note.recipeRevisionId ? [[operation.revisionCloudId, note.recipeRevisionId]] : []);
  return { operation: operation.kind, recordId: note.id, status: "applied", cloudVersion: row.version, cloudUpdatedAt: row.updated_at, cloudRecord: mapNote(row, recipes, revisions) };
}

async function applyComparison(client: Client, userId: string, operation: Extract<CloudWriteOperation, { kind: "upsert-comparison" }>): Promise<CloudWriteResult> {
  const comparison = operation.comparison;
  const values = { id: operation.cloudId, local_record_id: comparison.id, owner_id: userId, name: comparison.name, comparison_data: json(comparison), schema_version: comparison.schemaVersion, created_at: comparison.createdAt, source_installation_id: operation.sourceDeviceId };
  let row: ComparisonRow | null = null;
  if (operation.expectedVersion === undefined) {
    const existing = await client.from("comparisons").select("*").eq("id", operation.cloudId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      if (existing.data.local_record_id !== comparison.id || JSON.stringify(existing.data.comparison_data) !== JSON.stringify(values.comparison_data)) return { operation: operation.kind, recordId: comparison.id, status: "conflict", message: "The stable comparison ID already has different cloud content." };
      row = existing.data;
    } else {
      const inserted = await client.from("comparisons").insert(values).select().single();
      if (inserted.error) throw inserted.error;
      row = inserted.data;
    }
  } else {
    const mutable: Database["public"]["Tables"]["comparisons"]["Update"] = { name: values.name, comparison_data: values.comparison_data, schema_version: values.schema_version, source_installation_id: values.source_installation_id };
    const updated = await client.from("comparisons").update(mutable).eq("id", operation.cloudId).eq("version", operation.expectedVersion).select().maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) {
      const current = await client.from("comparisons").select("*").eq("id", operation.cloudId).maybeSingle();
      if (current.data?.local_record_id === comparison.id && JSON.stringify(current.data.comparison_data) === JSON.stringify(values.comparison_data)) return { operation: operation.kind, recordId: comparison.id, status: "identical", cloudVersion: current.data.version, cloudUpdatedAt: current.data.updated_at, cloudRecord: mapComparison(current.data) };
      return { operation: operation.kind, recordId: comparison.id, status: "conflict", message: "The cloud comparison changed since the last sync.", ...(current.data ? { cloudVersion: current.data.version, cloudUpdatedAt: current.data.updated_at, cloudRecord: mapComparison(current.data) } : {}) };
    }
    row = updated.data;
  }
  return { operation: operation.kind, recordId: comparison.id, status: "applied", cloudVersion: row.version, cloudUpdatedAt: row.updated_at, cloudRecord: mapComparison(row) };
}

async function applySettings(client: Client, userId: string, operation: Extract<CloudWriteOperation, { kind: "upsert-settings" }>): Promise<CloudWriteResult> {
  const values = { owner_id: userId, settings_data: json(operation.settings), schema_version: operation.settings.schemaVersion, source_installation_id: operation.sourceDeviceId };
  let row: SettingsRow | null = null;
  if (operation.expectedVersion === undefined) {
    const existing = await client.from("user_settings").select("*").eq("owner_id", userId).maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
      if (JSON.stringify(existing.data.settings_data) !== JSON.stringify(values.settings_data)) return { operation: operation.kind, recordId: operation.settings.id, status: "conflict", cloudVersion: existing.data.version, cloudUpdatedAt: existing.data.updated_at, message: "Cloud settings already exist and differ from this device." };
      row = existing.data;
    } else {
      const inserted = await client.from("user_settings").insert(values).select().single();
      if (inserted.error) throw inserted.error;
      row = inserted.data;
    }
  } else {
    const mutable: Database["public"]["Tables"]["user_settings"]["Update"] = { settings_data: values.settings_data, schema_version: values.schema_version, source_installation_id: values.source_installation_id };
    const updated = await client.from("user_settings").update(mutable).eq("owner_id", userId).eq("version", operation.expectedVersion).select().maybeSingle();
    if (updated.error) throw updated.error;
    if (!updated.data) {
      const current = await client.from("user_settings").select("*").eq("owner_id", userId).maybeSingle();
      if (current.data && JSON.stringify(current.data.settings_data) === JSON.stringify(values.settings_data)) return { operation: operation.kind, recordId: operation.settings.id, status: "identical", cloudVersion: current.data.version, cloudUpdatedAt: current.data.updated_at, cloudRecord: mapSettings(current.data) };
      return { operation: operation.kind, recordId: operation.settings.id, status: "conflict", message: "Cloud settings changed since the last sync.", ...(current.data ? { cloudVersion: current.data.version, cloudUpdatedAt: current.data.updated_at, cloudRecord: mapSettings(current.data) } : {}) };
    }
    row = updated.data;
  }
  return { operation: operation.kind, recordId: operation.settings.id, status: "applied", cloudVersion: row.version, cloudUpdatedAt: row.updated_at, cloudRecord: mapSettings(row) };
}

async function softDelete(client: Client, operation: Extract<CloudWriteOperation, { kind: "soft-delete-recipe" | "soft-delete-note" | "soft-delete-comparison" }>): Promise<CloudWriteResult> {
  const table = operation.kind === "soft-delete-recipe" ? "recipes" : operation.kind === "soft-delete-note" ? "recipe_notes" : "comparisons";
  const { data, error } = await client.from(table).update({ deleted_at: new Date().toISOString(), source_installation_id: operation.sourceDeviceId }).eq("id", operation.cloudId).eq("version", operation.expectedVersion).select("version,updated_at").maybeSingle();
  if (error) throw error;
  if (!data) {
    const current = await client.from(table).select("version,updated_at,deleted_at").eq("id", operation.cloudId).maybeSingle();
    if (current.error) throw current.error;
    if (current.data?.deleted_at) return { operation: operation.kind, recordId: operation.id, status: "identical", cloudVersion: current.data.version, cloudUpdatedAt: current.data.updated_at };
    return { operation: operation.kind, recordId: operation.id, status: "conflict", message: "The cloud record changed before deletion could be synchronized." };
  }
  return { operation: operation.kind, recordId: operation.id, status: "applied", cloudVersion: data.version, cloudUpdatedAt: data.updated_at };
}

async function applyDevice(client: Client, userId: string, operation: Extract<CloudWriteOperation, { kind: "upsert-device" }>): Promise<CloudWriteResult> {
  const existing = await client.from("user_devices").select("*").eq("installation_id", operation.installationId).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    const updated = await client.from("user_devices").update({ display_name: operation.displayName ?? null, last_sync_at: operation.lastSyncAt ?? null, updated_at: new Date().toISOString() }).eq("id", existing.data.id).select().single();
    if (updated.error) throw updated.error;
    return { operation: operation.kind, recordId: operation.installationId, status: "applied", cloudUpdatedAt: updated.data.updated_at };
  }
  const inserted = await client.from("user_devices").insert({ id: operation.cloudId, owner_id: userId, installation_id: operation.installationId, display_name: operation.displayName ?? null, last_sync_at: operation.lastSyncAt ?? null }).select().single();
  if (inserted.error) throw inserted.error;
  return { operation: operation.kind, recordId: operation.installationId, status: "applied", cloudUpdatedAt: inserted.data.updated_at };
}

async function applyOperation(client: Client, userId: string, operation: CloudWriteOperation): Promise<CloudWriteResult> {
  switch (operation.kind) {
    case "upsert-recipe-bundle": return applyRecipe(client, userId, operation);
    case "upsert-note": return applyNote(client, userId, operation);
    case "upsert-comparison": return applyComparison(client, userId, operation);
    case "upsert-settings": return applySettings(client, userId, operation);
    case "soft-delete-recipe":
    case "soft-delete-note":
    case "soft-delete-comparison": return softDelete(client, operation);
    case "upsert-device": return applyDevice(client, userId, operation);
  }
}

export async function POST(request: NextRequest) {
  const headerFailure = validateJsonRequestHeaders(request.headers, MAX_SYNC_REQUEST_BYTES);
  if (headerFailure) return statusError(headerFailure.status, headerFailure.code, headerFailure.message);
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return statusError(403, "CROSS_ORIGIN_REQUEST", "Cross-origin synchronization requests are not allowed.");
  }
  const auth = await authenticatedClient();
  if (!auth) return statusError(401, "AUTH_REQUIRED", "Sign in before synchronizing cloud data.");
  let operations: readonly CloudWriteOperation[];
  try {
    operations = await parseCloudWriteOperations(await request.json());
  } catch (error) {
    const validation = error instanceof CloudPayloadValidationError ? error : new CloudPayloadValidationError("INVALID_SYNC_REQUEST", "The sync request could not be validated.");
    return statusError(400, validation.code, validation.message);
  }
  const results: CloudWriteResult[] = [];
  for (const operation of operations) {
    try {
      results.push(await applyOperation(auth.client, auth.userId, operation));
    } catch (error) {
      results.push({ operation: operation.kind, recordId: "id" in operation ? operation.id : operation.kind === "upsert-recipe-bundle" ? operation.bundle.recipe.id : operation.kind === "upsert-note" ? operation.note.id : operation.kind === "upsert-comparison" ? operation.comparison.id : operation.kind === "upsert-settings" ? operation.settings.id : operation.installationId, status: "error", message: "This record could not be synchronized; other records were left intact." });
      if (process.env.NODE_ENV !== "production") console.error("[cloud-sync]", { event: "write_failed", operation: operation.kind, category: error instanceof Error ? error.name : "unknown" });
    }
  }
  return NextResponse.json(results);
}
