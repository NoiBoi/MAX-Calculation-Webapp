import "fake-indexeddb/auto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaxStoichDatabase } from "../../lib/persistence/database";
import { applyLabSyncPayload, removeLabCache, syncAuthorizedLabCaches } from "../../lib/labs/local-cache";
import { labRoleSchema, publishLabRequestSchema, retentionDaysSchema } from "../../lib/labs/validation";
import type { LabSyncPayload } from "../../lib/labs/types";

const databases: MaxStoichDatabase[] = [];
const labId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";

function database(): MaxStoichDatabase {
  const value = new MaxStoichDatabase(`private-lab-${crypto.randomUUID()}`);
  databases.push(value);
  return value;
}

function payload(cursor = "1"): LabSyncPayload {
  return {
    schemaVersion: "1.0.0",
    ownerId,
    cursor,
    labs: [{ id: labId, name: "Anasori Lab", description: "Private library", createdBy: ownerId, createdAt: "2026-07-17T00:00:00.000Z", updatedAt: "2026-07-17T00:00:00.000Z", retentionDays: 90, role: "admin" }],
    memberships: [{ id: "33333333-3333-4333-8333-333333333333", labId, userId: ownerId, displayName: "Admin", role: "admin", status: "active", joinedAt: "2026-07-17T00:00:00.000Z", createdAt: "2026-07-17T00:00:00.000Z", updatedAt: "2026-07-17T00:00:00.000Z" }],
    entries: [],
    versions: [],
    notes: [],
    auditEvents: [],
  };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(databases.splice(0).map(async (item) => { item.close(); await item.delete(); }));
});

describe("private lab contracts and cache boundaries", () => {
  it("accepts only explicit roles, retention policies, and complete publication requests", () => {
    expect(labRoleSchema.parse("viewer")).toBe("viewer");
    expect(() => labRoleSchema.parse("owner")).toThrow();
    expect(retentionDaysSchema.parse(null)).toBeNull();
    expect(() => retentionDaysSchema.parse(7)).toThrow();
    expect(publishLabRequestSchema.parse({
      labId,
      title: "Published route",
      description: "",
      recipeId: "personal-recipe",
      revisionId: "immutable-revision",
      publicationNote: "",
      selectedNoteIds: [],
      sourceDeviceId: "device",
      requestId: "request-1234",
    }).title).toBe("Published route");
  });

  it("stores authorized lab data in independent namespaced tables and removes it on revocation", async () => {
    const db = database();
    await db.open();
    await applyLabSyncPayload(db, payload());
    expect(await db.labCaches.get(labId)).toMatchObject({ role: "admin" });
    expect(await db.labMemberships.where("labId").equals(labId).count()).toBe(1);
    expect((await db.labSyncSessions.get(`${ownerId}:${labId}`))?.cursor).toBe("1");
    await removeLabCache(db, labId);
    expect(await db.labCaches.count()).toBe(0);
    expect(await db.labMemberships.count()).toBe(0);
    expect(await db.labSyncSessions.count()).toBe(0);
  });

  it("reconciles a verified full authorization snapshot so stale lab rows cannot linger", async () => {
    const db = database();
    await db.open();
    await applyLabSyncPayload(db, payload());
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...payload("2"), labs: [], memberships: [] }), { status: 200, headers: { "content-type": "application/json" } })));
    await syncAuthorizedLabCaches(db);
    expect(await db.labCaches.count()).toBe(0);
    expect(await db.labMemberships.count()).toBe(0);
  });
});

describe("private lab database security contract", () => {
  const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/202607170004_private_lab_libraries.sql"), "utf8");

  it("forces RLS and grants authenticated clients read-only table access", () => {
    expect(sql).toContain("alter table public.lab_library_versions force row level security");
    expect(sql).toContain("alter table public.lab_publication_notes force row level security");
    expect(sql).toContain("revoke all on table public.lab_invitations");
    expect(sql).toContain("grant select on table public.lab_invitations");
  });

  it("keeps publication records immutable and invitations digest-only", () => {
    expect(sql).toContain("create trigger lab_versions_immutable");
    expect(sql).toContain("create trigger lab_notes_immutable");
    expect(sql).toContain("token_digest text not null unique");
    expect(sql).not.toMatch(/token_plain|plaintext_token|invitation_token text/);
  });

  it("uses server-authorized RPCs for publish, membership, retention, and purge", () => {
    expect(sql).toContain("create function public.publish_lab_version");
    expect(sql).toContain("create function public.manage_lab_member");
    expect(sql).toContain("create function public.set_lab_entry_state");
    expect(sql).toContain("create function public.purge_lab_entry");
    expect(sql).toContain("stale lab entry metadata version");
    expect(sql).toContain("the last active lab admin cannot be changed or removed");
  });

  it("preserves a narrow audit event instead of publishing scientific payloads into metadata", () => {
    expect(sql).toContain("Append-only safe lab action history");
    expect(sql).toContain("Full scientific payloads and note bodies are excluded from metadata");
    expect(sql).toContain("create trigger lab_audit_immutable");
  });
});
