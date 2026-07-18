import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database, Json, LabRole } from "@/lib/supabase/types";
import type { CalculationSnapshot, RecipeRevision } from "@/lib/persistence/entities";
import { validateRevisionAndSnapshot } from "@/lib/cloud/validation";
import { formatAdjustedFeedFormula } from "@/lib/presentation/weighing-summary";
import { labRoleSchema, publishLabRequestSchema, retentionDaysSchema } from "@/lib/labs/validation";
import type { LabAuditEvent, LabInvitationSummary, LabLibraryEntry, LabLibraryVersion, LabMembership, LabPublicationNote, LabSummary, LabSyncPayload, PublishLabRequest } from "@/lib/labs/types";

export const dynamic = "force-dynamic";
type Client = SupabaseClient<Database>;
const json = (value: unknown): Json => JSON.parse(JSON.stringify(value)) as Json;
const fail = (status: number, code: string, message: string) => NextResponse.json({ code, message }, { status });
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const safeRequestId = () => `lab-${crypto.randomUUID()}`;

async function auth(): Promise<{ client: Client; userId: string } | null> {
  const client = await createSupabaseServerClient();
  if (!client) return null;
  const { data, error } = await client.auth.getUser();
  return error || !data.user ? null : { client, userId: data.user.id };
}

const roleFrom = (memberships: readonly Database["public"]["Tables"]["lab_members"]["Row"][], labId: string, userId: string): LabRole | undefined =>
  memberships.find((item) => item.lab_id === labId && item.user_id === userId && item.membership_status === "active")?.role;

async function labPayload(client: Client, userId: string, selectedLabId?: string, after = "0"): Promise<LabSyncPayload> {
  if (!/^\d+$/.test(after)) throw new Error("INVALID_CURSOR");
  let labsQuery = client.from("labs").select("*").is("archived_at", null).order("name");
  if (selectedLabId) labsQuery = labsQuery.eq("id", selectedLabId);
  const labsResult = await labsQuery;
  if (labsResult.error) throw labsResult.error;
  const labs = labsResult.data ?? [];
  const labIds = labs.map((item) => item.id);
  if (!labIds.length) return { schemaVersion: "1.0.0", ownerId: userId, cursor: after, labs: [], memberships: [], entries: [], versions: [], notes: [], auditEvents: [] };
  const membershipResult = await client.from("lab_members").select("*").in("lab_id", labIds);
  if (membershipResult.error) throw membershipResult.error;
  const memberships = membershipResult.data ?? [];
  const profileIds = [...new Set(memberships.map((item) => item.user_id))];
  const profilesResult = profileIds.length ? await client.from("profiles").select("user_id,display_name").in("user_id", profileIds) : { data: [], error: null };
  if (profilesResult.error) throw profilesResult.error;
  const profileNames = new Map((profilesResult.data ?? []).map((item) => [item.user_id, item.display_name || "Lab member"]));
  const highValues = await Promise.all(labIds.map(async (labId) => {
    const result = await client.rpc("get_lab_sync_high_watermark", { target_lab_id: labId });
    if (result.error) throw result.error;
    return BigInt(String(result.data ?? "0"));
  }));
  const high = highValues.reduce((value, next) => next > value ? next : value, 0n).toString();
  const sequenceAfter = selectedLabId ? after : "0";
  const [entryResult, versionResult, noteResult, auditResult] = await Promise.all([
    client.from("lab_library_entries").select("*").in("lab_id", labIds).gt("sync_sequence", sequenceAfter as unknown as number).lte("sync_sequence", high as unknown as number).order("sync_sequence").limit(1000),
    client.from("lab_library_versions").select("*").in("lab_id", labIds).gt("sync_sequence", sequenceAfter as unknown as number).lte("sync_sequence", high as unknown as number).order("sync_sequence").limit(1000),
    client.from("lab_publication_notes").select("*").in("lab_id", labIds).gt("sync_sequence", sequenceAfter as unknown as number).lte("sync_sequence", high as unknown as number).order("sync_sequence").limit(1000),
    client.from("lab_audit_events").select("*").in("lab_id", labIds).gt("sync_sequence", sequenceAfter as unknown as number).lte("sync_sequence", high as unknown as number).order("sync_sequence").limit(1000),
  ]);
  const firstError = entryResult.error ?? versionResult.error ?? noteResult.error ?? auditResult.error;
  if (firstError) throw firstError;
  // A table page can end before the captured high-water mark. Advance only to
  // the earliest truncated table boundary so the next request cannot skip a
  // row. Other tables may safely overlap because every shared record has a
  // stable identity and the local merge is idempotent.
  const pageSize = 1000;
  const truncatedBoundaries = [entryResult.data, versionResult.data, noteResult.data, auditResult.data]
    .filter((rows) => (rows?.length ?? 0) === pageSize)
    .map((rows) => BigInt(String(rows![rows!.length - 1]!.sync_sequence)));
  const responseCursor = truncatedBoundaries.length
    ? truncatedBoundaries.reduce((value, next) => next < value ? next : value).toString()
    : high;
  const labValues: LabSummary[] = labs.map((item) => ({
    id: item.id, name: item.name, description: item.description, createdBy: item.created_by, createdAt: item.created_at, updatedAt: item.updated_at,
    ...(item.archived_at ? { archivedAt: item.archived_at } : {}),
    retentionDays: ((item.retention_policy as { purgeAfterDays?: number | null })?.purgeAfterDays ?? null) as LabSummary["retentionDays"],
    role: roleFrom(memberships, item.id, userId)!,
  }));
  const memberValues: LabMembership[] = memberships.map((item) => ({
    id: `${item.lab_id}:${item.user_id}`, labId: item.lab_id, userId: item.user_id, displayName: profileNames.get(item.user_id) ?? "Lab member",
    ...(item.email_normalized && roleFrom(memberships, item.lab_id, userId) === "admin" ? { email: item.email_normalized } : {}),
    role: item.role, status: item.membership_status, ...(item.invited_by ? { invitedBy: item.invited_by } : {}), ...(item.joined_at ? { joinedAt: item.joined_at } : {}),
    createdAt: item.created_at, updatedAt: item.updated_at, ...(item.removed_at ? { removedAt: item.removed_at } : {}),
  }));
  const entries: LabLibraryEntry[] = (entryResult.data ?? []).map((item) => ({
    id: item.id, labId: item.lab_id, title: item.title, description: item.description, ...(item.current_version_id ? { currentVersionId: item.current_version_id } : {}),
    createdBy: item.created_by, createdAt: item.created_at, updatedAt: item.updated_at, ...(item.archived_at ? { archivedAt: item.archived_at } : {}),
    ...(item.archived_by ? { archivedBy: item.archived_by } : {}), ...(item.purge_eligible_at ? { purgeEligibleAt: item.purge_eligible_at } : {}),
    visibilityStatus: item.visibility_status, ...(item.retention_hold_reason ? { retentionHoldReason: item.retention_hold_reason } : {}), version: item.version, syncSequence: String(item.sync_sequence),
  }));
  const versions: LabLibraryVersion[] = (versionResult.data ?? []).map((item) => ({
    id: item.id, entryId: item.entry_id, labId: item.lab_id, versionNumber: item.version_number,
    ...(item.source_personal_recipe_id ? { sourcePersonalRecipeId: item.source_personal_recipe_id } : {}),
    ...(item.source_personal_revision_id ? { sourcePersonalRevisionId: item.source_personal_revision_id } : {}),
    publishedBy: item.published_by, publisherName: profileNames.get(item.published_by) ?? "Lab member", publicationNote: item.publication_note,
    scientificInput: item.scientific_input as unknown as RecipeRevision, calculationSnapshot: item.calculation_snapshot as unknown as CalculationSnapshot,
    schemaVersion: item.schema_version, engineVersion: item.engine_version, contentDigest: item.content_digest,
    ...(item.adjusted_feed_formula ? { adjustedFeedFormula: item.adjusted_feed_formula } : {}), targetFormula: item.target_formula,
    verificationStatus: item.verification_status, warningCount: item.warning_count, createdAt: item.created_at, syncSequence: String(item.sync_sequence),
  }));
  const notes: LabPublicationNote[] = (noteResult.data ?? []).map((item) => ({
    id: item.id, labId: item.lab_id, entryId: item.entry_id, publicationVersionId: item.publication_version_id,
    ...(item.source_personal_note_id ? { sourcePersonalNoteId: item.source_personal_note_id } : {}), category: item.category, title: item.title, body: item.body,
    tags: item.tags, ...(item.experiment_date ? { experimentDate: item.experiment_date } : {}), publishedBy: item.published_by, createdAt: item.created_at,
    contentDigest: item.content_digest, syncSequence: String(item.sync_sequence),
  }));
  const auditEvents: LabAuditEvent[] = (auditResult.data ?? []).map((item) => ({
    id: item.id, labId: item.lab_id, ...(item.actor_user_id ? { actorUserId: item.actor_user_id } : {}), actorName: item.actor_user_id ? profileNames.get(item.actor_user_id) ?? "Former lab member" : "System",
    eventType: item.event_type, targetType: item.target_type, ...(item.target_id ? { targetId: item.target_id } : {}), ...(item.target_version_id ? { targetVersionId: item.target_version_id } : {}),
    metadata: item.metadata as Record<string, unknown>, occurredAt: item.occurred_at, ...(item.request_id ? { requestId: item.request_id } : {}), ...(item.source_device_id ? { sourceDeviceId: item.source_device_id } : {}), syncSequence: String(item.sync_sequence),
  }));
  return { schemaVersion: "1.0.0", ownerId: userId, cursor: responseCursor, labs: labValues, memberships: memberValues, entries, versions, notes, auditEvents };
}

export async function GET(request: NextRequest) {
  const authenticated = await auth();
  if (!authenticated) return fail(401, "AUTH_REQUIRED", "Sign in before opening a private lab.");
  const labId = request.nextUrl.searchParams.get("labId") ?? undefined;
  const cursor = request.nextUrl.searchParams.get("cursor") ?? "0";
  try {
    if (request.nextUrl.searchParams.get("invitations") === "1") {
      if (!labId) return fail(400, "LAB_REQUIRED", "Select a lab.");
      const result = await authenticated.client.from("lab_invitations").select("*").eq("lab_id", labId).order("created_at", { ascending: false });
      if (result.error) throw result.error;
      const invitations: LabInvitationSummary[] = (result.data ?? []).map((item) => ({ id: item.id, labId: item.lab_id, emailNormalized: item.email_normalized, intendedRole: item.intended_role, invitedBy: item.invited_by, expiresAt: item.expires_at, ...(item.accepted_at ? { acceptedAt: item.accepted_at } : {}), ...(item.revoked_at ? { revokedAt: item.revoked_at } : {}), createdAt: item.created_at }));
      return NextResponse.json({ invitations });
    }
    return NextResponse.json(await labPayload(authenticated.client, authenticated.userId, labId, cursor));
  } catch (error) {
    if (error instanceof Error && error.message === "INVALID_CURSOR") return fail(400, "INVALID_LAB_CURSOR", "The lab cursor is invalid.");
    return fail(403, "LAB_ACCESS_DENIED", "The private lab is unavailable or your membership is inactive.");
  }
}

const actionSchema = z.object({ action: z.string().min(1) }).passthrough();
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) return fail(403, "CROSS_ORIGIN_REQUEST", "Cross-origin lab requests are not allowed.");
  const authenticated = await auth();
  if (!authenticated) return fail(401, "AUTH_REQUIRED", "Sign in before changing private lab data.");
  let body: Record<string, unknown>;
  try { body = actionSchema.parse(await request.json()); } catch { return fail(400, "INVALID_LAB_REQUEST", "The lab request is malformed."); }
  const requestId = typeof body.requestId === "string" ? body.requestId : safeRequestId();
  try {
    switch (body.action) {
      case "create-lab": {
        const name = z.string().trim().min(1).max(160).parse(body.name);
        const description = z.string().max(4000).parse(body.description ?? "");
        const result = await authenticated.client.rpc("create_private_lab", { lab_name: name, lab_description: description, request_id: requestId });
        if (result.error) throw result.error;
        return NextResponse.json({ labId: result.data });
      }
      case "invite": {
        const labId = z.string().uuid().parse(body.labId), email = z.string().email().transform((value) => value.trim().toLowerCase()).parse(body.email), role = labRoleSchema.parse(body.role);
        const token = randomBytes(32).toString("base64url");
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const result = await authenticated.client.rpc("create_lab_invitation", { target_lab_id: labId, normalized_email: email, intended_role: role, invitation_digest: digest(token), invitation_expires_at: expiresAt, request_id: requestId });
        if (result.error) throw result.error;
        const item = result.data;
        const invitation: LabInvitationSummary = { id: item.id, labId: item.lab_id, emailNormalized: item.email_normalized, intendedRole: item.intended_role, invitedBy: item.invited_by, expiresAt: item.expires_at, createdAt: item.created_at };
        return NextResponse.json({ invitation, invitationUrl: `${request.nextUrl.origin}/labs/invitations/accept?token=${encodeURIComponent(token)}` });
      }
      case "accept-invitation": {
        const token = z.string().min(32).max(200).parse(body.token);
        const result = await authenticated.client.rpc("accept_lab_invitation", { invitation_digest: digest(token), request_id: requestId });
        if (result.error) throw result.error;
        return NextResponse.json({ labId: result.data });
      }
      case "revoke-invitation": {
        const result = await authenticated.client.rpc("revoke_lab_invitation", { invitation_id: z.string().uuid().parse(body.invitationId), request_id: requestId });
        if (result.error) throw result.error;
        return NextResponse.json({ ok: true });
      }
      case "manage-member": {
        const result = await authenticated.client.rpc("manage_lab_member", { target_lab_id: z.string().uuid().parse(body.labId), target_user_id: z.string().uuid().parse(body.userId), requested_role: labRoleSchema.parse(body.role), requested_status: z.enum(["active","suspended","removed"]).parse(body.status), request_id: requestId });
        if (result.error) throw result.error;
        return NextResponse.json({ ok: true });
      }
      case "publish": {
        const publication = publishLabRequestSchema.parse(body.request) as PublishLabRequest;
        const recipeResult = await authenticated.client.from("recipes").select("*").eq("local_record_id", publication.recipeId).eq("owner_id", authenticated.userId).maybeSingle();
        if (recipeResult.error || !recipeResult.data) return fail(409, "PERSONAL_SOURCE_NOT_SYNCED", "Synchronize the selected personal recipe before publishing it to a lab.");
        const revisionResult = await authenticated.client.from("recipe_revisions").select("*").eq("local_record_id", publication.revisionId).eq("recipe_id", recipeResult.data.id).eq("owner_id", authenticated.userId).maybeSingle();
        if (revisionResult.error || !revisionResult.data) return fail(409, "PERSONAL_REVISION_NOT_SYNCED", "Synchronize the selected immutable revision before publishing it.");
        const revision = revisionResult.data.scientific_input as unknown as RecipeRevision;
        const snapshot = revisionResult.data.calculation_snapshot as unknown as CalculationSnapshot;
        await validateRevisionAndSnapshot(revision, snapshot);
        if (snapshot.result.status !== "success" && snapshot.result.status !== "success-with-warnings" || snapshot.result.errors.length) return fail(422, "INVALID_PUBLICATION_RESULT", "A blocking scientific result cannot be published.");
        const notesResult = publication.selectedNoteIds.length ? await authenticated.client.from("recipe_notes").select("*").eq("recipe_id", recipeResult.data.id).eq("owner_id", authenticated.userId).in("local_record_id", [...publication.selectedNoteIds]) : { data: [], error: null };
        if (notesResult.error || (notesResult.data?.length ?? 0) !== publication.selectedNoteIds.length) return fail(422, "INVALID_PUBLICATION_NOTES", "One or more selected notes are unavailable.");
        const selectedNotes = (notesResult.data ?? []).map((note) => {
          if (note.archived_at || note.deleted_at || note.revision_id && note.revision_id !== revisionResult.data!.id) throw new Error("Selected notes must be active and attached to this recipe revision.");
          return { sourcePersonalNoteId: note.id, category: note.category, title: note.title, body: note.body, tags: note.tags, experimentDate: note.experiment_date, contentDigest: digest(JSON.stringify({ category: note.category, title: note.title, body: note.body, tags: note.tags, experimentDate: note.experiment_date })) };
        });
        const adjusted = formatAdjustedFeedFormula(snapshot.result.adjustedFeedComposition.amounts, revision.inputState.targetFormula);
        const verificationStatus = snapshot.result.realizedElements.every((item) => item.passesTolerance) ? "arithmetic-verified" : "review-required";
        const result = await authenticated.client.rpc("publish_lab_version", {
          target_lab_id: publication.labId, target_entry_id: publication.entryId ?? null, expected_entry_version: publication.expectedEntryVersion ?? null,
          publication_title: publication.title, publication_description: publication.description, source_recipe_id: recipeResult.data.id, source_revision_id: revisionResult.data.id,
          publication_note: publication.publicationNote, scientific_input: json(revision), calculation_snapshot: json(snapshot), schema_version: revision.schemaVersion,
          engine_version: revision.engineVersion, content_digest: revision.inputDigest, adjusted_feed_formula: adjusted, target_formula: revision.inputState.targetFormula,
          verification_status: verificationStatus, warning_count: snapshot.result.warnings.length, selected_notes: json(selectedNotes), acknowledge_target_change: publication.acknowledgeTargetChange ?? false,
          request_id: publication.requestId, source_device_id: publication.sourceDeviceId,
        });
        if (result.error) throw result.error;
        return NextResponse.json(result.data);
      }
      case "entry-state": {
        const result = await authenticated.client.rpc("set_lab_entry_state", { target_entry_id: z.string().uuid().parse(body.entryId), action: z.enum(["archive","restore","hold","unhold"]).parse(body.entryAction), expected_version: z.number().int().positive().parse(body.expectedVersion), hold_reason: z.string().max(500).nullable().optional().parse(body.holdReason ?? null), request_id: requestId });
        if (result.error) throw result.error;
        return NextResponse.json({ ok: true });
      }
      case "purge": {
        const result = await authenticated.client.rpc("purge_lab_entry", { target_entry_id: z.string().uuid().parse(body.entryId), confirmation_title: z.string().min(1).parse(body.confirmationTitle), request_id: requestId });
        if (result.error) throw result.error;
        return NextResponse.json({ ok: true });
      }
      case "update-settings": {
        const result = await authenticated.client.rpc("update_lab_settings", { target_lab_id: z.string().uuid().parse(body.labId), lab_name: z.string().trim().min(1).max(160).parse(body.name), lab_description: z.string().max(4000).parse(body.description ?? ""), retention_days: retentionDaysSchema.parse(body.retentionDays), request_id: requestId });
        if (result.error) throw result.error;
        return NextResponse.json({ ok: true });
      }
      default: return fail(400, "UNSUPPORTED_LAB_ACTION", "This lab action is not supported.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "The lab action failed.";
    const conflict = /stale|conflict|last active|retention hold|not eligible/i.test(message);
    const denied = /required|permission|owned|membership|admin|publisher/i.test(message);
    return fail(conflict ? 409 : denied ? 403 : 422, conflict ? "LAB_CONFLICT" : denied ? "LAB_PERMISSION_DENIED" : "LAB_ACTION_REJECTED", message);
  }
}
