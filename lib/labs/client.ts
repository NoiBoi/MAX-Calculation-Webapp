import type { LabInvitationSummary, LabRole, LabSyncPayload, PublishLabRequest } from "./types";

export class LabApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) { super(message); this.name = "LabApiError"; }
}

async function response<T>(result: Response | Promise<Response>): Promise<T> {
  result = await result;
  const payload = await result.json().catch(() => ({})) as { code?: string; message?: string };
  if (!result.ok) throw new LabApiError(payload.code ?? "LAB_REQUEST_FAILED", payload.message ?? "The lab request failed.", result.status);
  return payload as T;
}

export const labApi = {
  list: () => response<LabSyncPayload>(fetch("/api/labs", { cache: "no-store" })),
  sync: (labId: string, cursor = "0") => response<LabSyncPayload>(fetch(`/api/labs?labId=${encodeURIComponent(labId)}&cursor=${encodeURIComponent(cursor)}`, { cache: "no-store" })),
  invitations: (labId: string) => response<{ invitations: readonly LabInvitationSummary[] }>(fetch(`/api/labs?labId=${encodeURIComponent(labId)}&invitations=1`, { cache: "no-store" })),
  action: <T>(action: string, data: Readonly<Record<string, unknown>>) => response<T>(fetch("/api/labs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...data }) })),
  create: (name: string, description: string) => labApi.action<{ labId: string }>("create-lab", { name, description }),
  publish: (request: PublishLabRequest) => labApi.action<{ entryId: string; versionId: string; versionNumber: number }>("publish", { request }),
  invite: (labId: string, email: string, role: LabRole) => labApi.action<{ invitation: LabInvitationSummary; invitationUrl: string }>("invite", { labId, email, role }),
};
