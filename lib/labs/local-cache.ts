import type { MaxStoichDatabase } from "../persistence/database";
import type { LabSyncPayload } from "./types";

export const LAB_CACHE_CHANGED_EVENT = "max-stoich:lab-cache-changed";
const sessionId = (ownerId: string, labId: string) => `${ownerId}:${labId}`;

export async function applyLabSyncPayload(database: MaxStoichDatabase, payload: LabSyncPayload): Promise<void> {
  const allowedLabIds = new Set(payload.labs.map((lab) => lab.id));
  await database.transaction("rw", [database.labCaches, database.labMemberships, database.labEntries, database.labVersions, database.labPublicationNotes, database.labAuditEvents, database.labSyncSessions], async () => {
    await database.labCaches.bulkPut([...payload.labs]);
    if (payload.memberships.length) await database.labMemberships.bulkPut([...payload.memberships]);
    if (payload.entries.length) await database.labEntries.bulkPut([...payload.entries]);
    if (payload.versions.length) await database.labVersions.bulkPut([...payload.versions]);
    if (payload.notes.length) await database.labPublicationNotes.bulkPut([...payload.notes]);
    if (payload.auditEvents.length) await database.labAuditEvents.bulkPut([...payload.auditEvents]);
    for (const lab of payload.labs) {
      await database.labSyncSessions.put({ id: sessionId(payload.ownerId, lab.id), ownerId: payload.ownerId, labId: lab.id, cursor: payload.cursor, membershipStatus: "active", role: lab.role, lastSuccessfulSyncAt: new Date().toISOString() });
    }
    if (!payload.labs.length) {
      const cached = await database.labCaches.toArray();
      for (const lab of cached.filter((item) => !allowedLabIds.has(item.id))) await removeLabCache(database, lab.id);
    }
  });
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(LAB_CACHE_CHANGED_EVENT));
}

export async function removeLabCache(database: MaxStoichDatabase, labId: string): Promise<void> {
  await database.transaction("rw", [database.labCaches, database.labMemberships, database.labEntries, database.labVersions, database.labPublicationNotes, database.labAuditEvents, database.labSyncSessions], async () => {
    await database.labCaches.delete(labId);
    await database.labMemberships.where("labId").equals(labId).delete();
    await database.labEntries.where("labId").equals(labId).delete();
    await database.labVersions.where("labId").equals(labId).delete();
    await database.labPublicationNotes.where("labId").equals(labId).delete();
    await database.labAuditEvents.where("labId").equals(labId).delete();
    await database.labSyncSessions.where("labId").equals(labId).delete();
  });
}

export async function syncAuthorizedLabCaches(database: MaxStoichDatabase): Promise<void> {
  const response = await fetch("/api/labs", { cache: "no-store" });
  if (!response.ok) throw new Error("Authorized lab libraries could not be refreshed.");
  const payload = await response.json() as LabSyncPayload;
  // This is a verified full authorization snapshot. Replacing the lab-only
  // cache removes revoked memberships and server-purged rows without touching
  // independent personal recipes copied from a publication.
  await database.transaction("rw", [database.labCaches, database.labMemberships, database.labEntries, database.labVersions, database.labPublicationNotes, database.labAuditEvents, database.labSyncSessions], async () => {
    await Promise.all([
      database.labCaches.clear(),
      database.labMemberships.clear(),
      database.labEntries.clear(),
      database.labVersions.clear(),
      database.labPublicationNotes.clear(),
      database.labAuditEvents.clear(),
      database.labSyncSessions.clear(),
    ]);
  });
  await applyLabSyncPayload(database, { ...payload, cursor: "0", entries: [], versions: [], notes: [], auditEvents: [] });
  for (const lab of payload.labs) {
    let cursor = "0";
    for (let page = 0; page < 100; page += 1) {
      const pageResponse = await fetch(`/api/labs?labId=${encodeURIComponent(lab.id)}&cursor=${encodeURIComponent(cursor)}`, { cache: "no-store" });
      if (!pageResponse.ok) throw new Error("An authorized lab page could not be refreshed.");
      const next = await pageResponse.json() as LabSyncPayload;
      await applyLabSyncPayload(database, next);
      if (next.cursor === cursor) break;
      cursor = next.cursor;
      if (page === 99) throw new Error("The authorized lab library exceeds the bounded synchronization page limit.");
    }
  }
}
