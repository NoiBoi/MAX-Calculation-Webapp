# Account-scoped cloud synchronization

## Scope

Milestone 3 adds reliable automatic foreground synchronization for saved recipes, immutable recipe revisions and historical snapshots, structured notes, comparisons, and stable user settings. MAXCalc remains local-first: calculation, local save, reopening downloaded records, comparison, print, export, and backup do not wait for Supabase. `Sync now` remains available and invokes the same engine.

Routes, transient recovery/workspace state, layouts, locally installed scientific datasets, attachments, and print-preview state are not synchronized. Shared lab libraries, live collaboration, presence, comments, and administrative management remain outside this milestone.

## Storage and identity boundaries

Anonymous records remain in `max-stoich-local`. Each authenticated account uses a physically distinct IndexedDB database named `max-stoich-local-account-<user id>`. Account switching therefore changes the actual storage namespace; User A's cache is not queried, displayed, or uploaded while User B is active. A root account-scope boundary remounts local-data consumers when the authenticated user changes.

Existing MAXCalc IDs are stable text identities. Cloud tables use UUID primary keys. `cloudSyncRecords` stores the durable local-ID-to-cloud-UUID mapping separately from recipes, revisions, snapshots, notes, comparisons, and scientific exports. Sync state never enters canonical scientific input/output or immutable calculation snapshots.

The local schema is version 10. Milestone 2 introduced:

- `cloudSyncRecords`: per-record state, cloud UUID/version, last successful base, error, and source-device metadata.
- `cloudSyncSessions`: monotonic cursor, first-upload decision, timestamps, and last summary.
- `cloudConflicts`: both values and explicit open/resolved state.
- `cloudQuarantine`: bounded diagnostics for isolated malformed/future records; note bodies and full scientific payloads are not copied into logs.
- `cloudDevices`: optional display name and installation identity for diagnostics only.

Milestone 3 adds:

- `cloudSyncOutbox`: durable one-operation-per-record descriptors, retry state, attempt metadata, expected cloud version, and a stable per-mutation idempotency key. Payloads remain in their authoritative entity tables instead of being duplicated into the queue.
- `cloudSyncLeases`: short account-scoped leases that prevent overlapping passes across tabs while allowing takeover after expiry.

Local entity writes and their outbox descriptor commit in the same Dexie transaction. Mutable create/update/delete sequences compact to the latest necessary operation; immutable recipe revisions retain distinct identities. Cloud-applied merges write entity tables directly and never enqueue themselves.

## First-device upload

Signing in never claims anonymous records automatically. If anonymous recipes, notes, comparisons, or custom settings exist, MAXCalc shows counts and offers:

- **Review and upload**: choose categories, validate links and immutable snapshots, review stable-ID or digest duplicates, then explicitly confirm. Confirmed records are copied into the account database with stable local IDs and marked pending. The anonymous originals remain.
- **Keep local only**: store the decision without changing either database.
- **Not now**: dismiss for the current browser session; the account Cloud data page remains available.

Names alone never merge records. A matching stable ID plus matching immutable digest is identical. Different IDs with matching scientific digests are potential duplicates requiring review.

## Shared synchronization phases

`performManualSync` remains the single authoritative synchronization engine and is called by both **Sync now** and the automatic coordinator:

1. Confirm that authenticated owner, local account namespace, and cloud repository owner match.
2. Read the local monotonic cursor.
3. Capture a server high-watermark and pull rows ordered by `sync_sequence, id`.
4. Validate each downloaded record, then merge immutable revisions before recipe pointers.
5. Preserve deterministic conflicts and quarantine malformed/future rows individually.
6. Build pending operations in dependency order: recipe bundles, notes, comparisons, settings.
7. Apply optimistic writes and tombstones through the authenticated route handler.
8. Update diagnostic device metadata.
9. Persist the cursor and complete/partial summary.

The cursor is a Postgres sequence value returned as text, not a client timestamp or JavaScript number. Rows with `sync_sequence > previous cursor AND <= captured high-watermark` form the page. If a per-table page reaches the 1,000-row safety limit, the returned cursor stops at the earliest saturated page boundary; later calls re-read harmless overlaps rather than skip rows sharing a timestamp or sequence range.

## Cloud write boundary

The browser cannot submit arbitrary table JSON directly from UI components. `lib/cloud/cloud-repositories.ts` defines framework-independent repository contracts. `/api/cloud-sync`:

- verifies the cookie-backed Supabase user with the Auth server;
- ignores any client ownership claim and uses the verified user ID;
- validates recipes, formulas, canonical input digests, snapshot output digests, exact rationals, notes, comparisons, settings, IDs, and size/count bounds;
- calls the transactional `apply_recipe_bundle` function for recipe metadata plus all immutable revisions;
- applies expected-version predicates to every mutable update and soft delete;
- returns per-record `applied`, `identical`, `conflict`, or `error` results so partial failures remain explicit.

## Merge and conflict policy

- **Recipe revisions** are append-only. Matching local ID and input/output digests are identical. Same ID with different scientific content is a severe integrity conflict; neither copy is overwritten.
- **Recipe metadata** uses a cloud version base. One-sided changes apply. Two-sided name/archive/current-pointer changes preserve both values.
- **Notes** use expected versions. Two-sided edits retain local and cloud bodies as plain text and offer keep-local, keep-cloud, or duplicate-local-and-keep-cloud.
- **Comparisons** are whole versioned documents. Conflict choices are keep local, keep cloud, or keep both under distinct stable IDs.
- **Settings** use whole-record choice in this milestone: use this device or use cloud.
- **Deletion** uses `deleted_at` tombstones. A delete racing an edit becomes a conflict; ordinary sync never hard-deletes cloud history.

Scientific keep-both resolution moves the local conflicting revision to a new stable revision/snapshot identity and revision number, restores the cloud copy under the cloud stable identity, and marks the local copy for explicit upload. Export-both is always available before this action.

## Validation, compatibility, and failure isolation

Downloaded ownership must match the authenticated account. Current and supported older local schemas are validated directly. Unsupported future schemas are quarantined and reported as blocked; they are never downgraded or overwritten. A malformed row does not clear IndexedDB, invoke application recovery, or prevent unrelated valid records from merging.

Cloud errors stay in the sync surface. Offline passes perform no request and leave changes pending. The coordinator distinguishes offline, network, rate-limit, server, authentication, authorization, validation, and conflict failures. Retryable failures use bounded jittered delays of approximately 5 seconds, 15 seconds, 45 seconds, 2 minutes, 5 minutes, and at most 10 minutes. Authentication waits for a valid session; reconnect schedules an immediate bounded pass.

## Automatic coordinator and remote awareness

One account-scoped coordinator is mounted at the application shell. It schedules a pass on enabled startup, durable local outbox changes, reconnect, a throttled return-to-focus check, manual retry, and Supabase Realtime hints. Local changes debounce for 2 seconds; reconnect waits 1 second; focus checks are limited to one per 45 seconds. A trigger during an active pass requests exactly one follow-up pass.

An IndexedDB lease and `BroadcastChannel` coordinate tabs. Broadcast messages contain only generic pass requests or status, never note text or scientific payloads. Supabase `postgres_changes` subscriptions are filtered by authenticated `owner_id`; their contents are treated only as hints. Every remote hint runs the normal server pull, schema validation, merge, conflict, and quarantine path. Unsubscribing and releasing the lease are mandatory on sign-out or account change.

Automatic synchronization can be disabled or paused from Settings, Account, and Cloud data. Trigger toggles cover startup, local changes, reconnect, focus, and remote hints. Routine success is quiet by default. Pending/error/conflict states remain visible and `Sync now` continues to work while automatic sync is disabled.

Remote data never replaces the open editor. If a newer revision is downloaded while a recipe is open, MAXCalc refreshes library data and reports that a newer revision is available. Unsaved work remains open until the user deliberately reopens the saved recipe.

## Backup and restore interaction

Cloud sync is not a backup. Full local backup continues to include account-local recipes, revisions, snapshots, notes, comparisons, and settings with digests. Sync metadata and session tokens are excluded. Restored records receive `local-only` metadata and require a separate review action before they can become pending upload; restore never overwrites cloud records by itself.

## Known Milestone 3 limitations

- Synchronization is automatic only while a signed-in MAXCalc page is running. There is no service worker or closed-tab execution.
- Synchronization remains private to one account.
- Saved precursor routes and custom layouts are not synchronized.
- Conflict resolution is record-level; settings have no section merge.
- Cloud retention/restoration UI for tombstones is not implemented.
- The pull endpoint pages at 1,000 changed rows per table and may re-download overlap at a boundary. Identity maps are paged to 20,000 recipes and 20,000 revisions; larger accounts require a later cursor-scoped identity lookup.
- One changed recipe bundle with 1,000 or more immutable revisions is rejected as a whole rather than downloaded partially.
- Live Supabase RLS and multi-device Playwright suites require a disposable configured project and are not run when credentials are absent.

## Controlled lab-library synchronization

Milestone 4 uses a separate authenticated lab endpoint, cursor, IndexedDB namespace, and lab-ID-filtered Realtime subscriptions. Personal sync never infers publication. A verified full lab refresh replaces only authorized lab cache tables, removing revoked memberships and purged rows while leaving personal copies untouched. Incremental hints and cursors do not bypass server validation or RLS. Offline access is read-only; publication and administration require an online authorization check. See `PRIVATE_LAB_LIBRARIES.md`.
