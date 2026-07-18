# Cloud database schema

Migration `202607170002_account_cloud_sync.sql` adds the private synchronization schema.
Migration `202607170003_account_sync_realtime_hints.sql` adds the five synchronized content tables to Supabase Realtime. Realtime rows are notification hints only and do not bypass the authenticated pull endpoint, validation, merge, or RLS.

| Table | Mutability | Identity and ownership |
| --- | --- | --- |
| `recipes` | Mutable metadata and soft-delete tombstone | UUID primary key, stable `local_record_id`, `owner_id`, expected `version`, monotonic `sync_sequence` |
| `recipe_revisions` | Insert/select only; update/delete trigger rejects mutation | Owner-matching composite recipe foreign key, unique recipe/revision number, immutable scientific input/snapshot/digest/version provenance |
| `recipe_notes` | Mutable plain text and soft-delete tombstone | Owner-matching recipe FK and composite owner/recipe/revision FK |
| `comparisons` | Mutable whole document and soft-delete tombstone | UUID plus stable local identity, schema and optimistic version |
| `user_settings` | One mutable row per owner | `owner_id` primary key and optimistic version |
| `user_devices` | Mutable diagnostics | UUID, unique owner/installation pair; never an authorization boundary |

Every synchronized table enables and forces RLS. Read/insert/update policies bind `owner_id` to `(select auth.uid())`; revisions have no update/delete policy or grant. Column-level update grants exclude ownership, primary IDs, stable local IDs, creation timestamps, versions, and sequence values. Composite foreign keys prevent cross-owner recipes, revisions, and notes even if application validation fails.

`maxcalc_sync_sequence` supplies insert/update ordering. Mutable triggers increment `version`, use server time for `updated_at`, and allocate a new sequence. `get_maxcalc_sync_high_watermark()` returns the authenticated server cursor as text. `apply_recipe_bundle()` holds the recipe row, verifies `expected_version`, checks existing revision digests and JSON byte meaning, inserts new revisions, and advances the current pointer in one transaction.

Ordinary deletion updates `deleted_at`; revision rows remain retained. Hard deletion is not granted to authenticated clients in this milestone.

The browser-local schema is version 11. `cloudSyncOutbox` stores compact durable operation descriptors and `cloudSyncLeases` stores expiring per-account cross-tab coordinator ownership. Separate `labCaches`, `labMemberships`, `labEntries`, `labVersions`, `labPublicationNotes`, `labAuditEvents`, and `labSyncSessions` stores form an authorization-revocable lab namespace. Neither synchronization namespace is included in calculation digests.

Migration `202607170004_private_lab_libraries.sql` adds digest-only `lab_invitations`, mutable `lab_library_entries`, immutable `lab_library_versions`, immutable `lab_publication_notes`, and append-only `lab_audit_events`. Direct authenticated table access is select-only under forced RLS. Security-definer RPCs enforce roles, same-lab foreign keys, last-admin protection, optimistic entry versions, publication-source ownership, retention holds, and confirmed eligible purge.
