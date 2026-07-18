import type { CalculationSnapshot, RecipeNote, RecipeRevision } from "../persistence/entities";

export const LAB_SCHEMA_VERSION = "1.0.0" as const;
export type LabRole = "admin" | "member" | "viewer";
export type LabMembershipStatus = "invited" | "active" | "suspended" | "removed";
export type LabVisibilityStatus = "active" | "archived" | "retention-hold";
export type LabRetentionDays = null | 30 | 90 | 365;

export interface LabSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt?: string;
  readonly retentionDays: LabRetentionDays;
  readonly role: LabRole;
}

export interface LabMembership {
  readonly id: string;
  readonly labId: string;
  readonly userId: string;
  readonly displayName: string;
  readonly email?: string;
  readonly role: LabRole;
  readonly status: LabMembershipStatus;
  readonly invitedBy?: string;
  readonly joinedAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly removedAt?: string;
}

export interface LabLibraryEntry {
  readonly id: string;
  readonly labId: string;
  readonly title: string;
  readonly description: string;
  readonly currentVersionId?: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly archivedAt?: string;
  readonly archivedBy?: string;
  readonly purgeEligibleAt?: string;
  readonly visibilityStatus: LabVisibilityStatus;
  readonly retentionHoldReason?: string;
  readonly version: number;
  readonly syncSequence: string;
}

export interface LabLibraryVersion {
  readonly id: string;
  readonly entryId: string;
  readonly labId: string;
  readonly versionNumber: number;
  readonly sourcePersonalRecipeId?: string;
  readonly sourcePersonalRevisionId?: string;
  readonly publishedBy: string;
  readonly publisherName: string;
  readonly publicationNote: string;
  readonly scientificInput: RecipeRevision;
  readonly calculationSnapshot: CalculationSnapshot;
  readonly schemaVersion: string;
  readonly engineVersion: string;
  readonly contentDigest: string;
  readonly adjustedFeedFormula?: string;
  readonly targetFormula: string;
  readonly verificationStatus: string;
  readonly warningCount: number;
  readonly createdAt: string;
  readonly syncSequence: string;
}

export interface LabPublicationNote {
  readonly id: string;
  readonly labId: string;
  readonly entryId: string;
  readonly publicationVersionId: string;
  readonly sourcePersonalNoteId?: string;
  readonly category: string;
  readonly title: string;
  readonly body: string;
  readonly tags: readonly string[];
  readonly experimentDate?: string;
  readonly publishedBy: string;
  readonly createdAt: string;
  readonly contentDigest: string;
  readonly syncSequence: string;
}

export interface LabAuditEvent {
  readonly id: string;
  readonly labId: string;
  readonly actorUserId?: string;
  readonly actorName: string;
  readonly eventType: string;
  readonly targetType: string;
  readonly targetId?: string;
  readonly targetVersionId?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
  readonly requestId?: string;
  readonly sourceDeviceId?: string;
  readonly syncSequence: string;
}

export interface LabSyncSession {
  readonly id: string;
  readonly ownerId: string;
  readonly labId: string;
  readonly cursor: string;
  readonly membershipStatus: LabMembershipStatus;
  readonly role: LabRole;
  readonly lastSuccessfulSyncAt: string;
}

export interface LabSyncPayload {
  readonly schemaVersion: typeof LAB_SCHEMA_VERSION;
  readonly ownerId: string;
  readonly cursor: string;
  readonly labs: readonly LabSummary[];
  readonly memberships: readonly LabMembership[];
  readonly entries: readonly LabLibraryEntry[];
  readonly versions: readonly LabLibraryVersion[];
  readonly notes: readonly LabPublicationNote[];
  readonly auditEvents: readonly LabAuditEvent[];
}

export interface LabCopyProvenance {
  readonly labId: string;
  readonly labName: string;
  readonly entryId: string;
  readonly entryTitle: string;
  readonly publicationVersionId: string;
  readonly versionNumber: number;
  readonly publisherName: string;
  readonly publishedAt: string;
  readonly copiedAt: string;
}

export interface PublishLabRequest {
  readonly labId: string;
  readonly entryId?: string;
  readonly expectedEntryVersion?: number;
  readonly title: string;
  readonly description: string;
  readonly recipeId: string;
  readonly revisionId: string;
  readonly publicationNote: string;
  readonly selectedNoteIds: readonly string[];
  readonly acknowledgeTargetChange?: boolean;
  readonly sourceDeviceId: string;
  readonly requestId: string;
}

export interface LabInvitationSummary {
  readonly id: string;
  readonly labId: string;
  readonly emailNormalized: string;
  readonly intendedRole: LabRole;
  readonly invitedBy: string;
  readonly expiresAt: string;
  readonly acceptedAt?: string;
  readonly revokedAt?: string;
  readonly createdAt: string;
}

export type PublishedNoteSource = Pick<RecipeNote, "id" | "category" | "title" | "body" | "tags" | "experimentDate">;
