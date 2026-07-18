# Private lab libraries

Milestone 4 adds controlled, account-authorized libraries without changing the personal workspace authority. Joining a lab never shares personal records. Publication is an explicit server-authorized action that copies one already-synchronized immutable personal recipe revision and calculation snapshot into a new immutable lab version. Notes default to excluded and are copied only when individually selected.

## Roles and actions

| Action | Admin | Member | Viewer |
| --- | --- | --- | --- |
| Read active library and version history | Yes | Yes | Yes |
| Copy a publication to a new personal recipe | Yes | Yes | Yes |
| Add a publication snapshot to comparison | Yes | Yes | Yes |
| Publish a personal immutable revision | Yes | Yes | No |
| Archive own entry | Yes | Yes | No |
| Restore, hold, purge, invite, change roles, export, or edit lab settings | Yes | No | No |

The database is authoritative. UI role checks are affordances, not security controls. The last active admin cannot be removed or demoted. Removed or suspended membership fails authorization immediately and is deleted from the local lab cache after a verified refresh.

## Publication and provenance

Each lab entry is mutable metadata pointing to an append-only sequence of versions. A version contains the exact personal scientific input, immutable calculation snapshot, source IDs, target and adjusted-feed formulas, engine/schema versions, digest, warning count, publisher identity, timestamp, and publication note. Selected structured notes become separate immutable publication-note snapshots. Editing or deleting the personal source later does not alter the publication.

Copying creates a new independent personal recipe and optional new personal note IDs. The personal recipe records lab, entry, publication-version, publisher, and copy timestamps. Purging a lab payload never deletes these personal copies. Comparison uses a temporary local scenario sourced directly from an immutable lab version; edits affect only that scenario.

## Invitations and audit

Invitations are email-bound, expiring, single-use records. The plaintext token is returned once in the secure link; only a SHA-256 digest is stored. Acceptance requires the authenticated email to match. Admins may revoke unused invitations.

Audit rows are append-only and contain safe action metadata, actor, target identity/version, timestamp, request ID, and source-device ID. They do not contain note bodies, complete calculation snapshots, credentials, or invitation plaintext. Admin exports omit request/device identifiers and all secrets.

## Retention

Labs select no automatic eligibility or 30, 90, or 365 days after archive. This policy calculates `purge_eligible_at`; no browser background job purges data. Admins may restore, apply a documented retention hold, remove a hold, or explicitly purge an eligible entry after typing its exact title. Purge deletes the lab scientific payload and selected publication-note bodies while retaining a minimal audit tombstone. See `RETENTION.md`.

## Synchronization and offline behavior

Lab synchronization is separate from personal account synchronization. Realtime messages are lab-ID-filtered hints only. Canonical data always arrives through the authenticated lab endpoint and RLS. An incremental lab cursor updates an authorized namespace; periodic verified full snapshots replace that namespace to remove server-purged rows and revoked labs. Previously downloaded authorized data may be read offline, but all lab writes require an online authorization check.

Limits: no live editing, presence, comments, arbitrary attachments, public links, external collaborators without accounts, inventory, route ownership, or automatic publication. Deployment must apply migration `202607170004_private_lab_libraries.sql` and run disposable multi-user RLS tests before enabling production lab use.
