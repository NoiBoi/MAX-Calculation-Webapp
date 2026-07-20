# Local Persistence and Export Architecture

## Boundary and schema

The React workspace calls project-owned repository interfaces. `LocalDataRepositories` implements them with Dexie/IndexedDB; the chemistry engine has no persistence or browser imports. Database version 11 contains recipes, immutable revisions/snapshots, structured recipe notes, routes, recovery, comparisons, layouts, datasets, user settings, migration records, cloud-sync metadata, a durable outbox, cross-tab leases, and an independently namespaced private-lab cache. Compound revision indexes enforce deterministic lookups; note indexes cover recipe, optional revision, category, tag, archive, and update time without scanning calculation snapshots.

Current mutable records carry local schema version `11.0.0`. Migration definitions are ordered and append-only in `lib/persistence/migrations.ts`. Migration `5-to-6-aluminum-feed-coefficient` converts editable recovery/comparison inputs from legacy excess percentage using `Al_feed=Al_ideal*(1+excess/100)`: 20 becomes 1.2 and 120 becomes 2.2 for ideal Al1. Migration `6-to-7-recipe-notes` adds the independent notes table; `7-to-8-user-settings` adds settings; `8-to-9-cloud-sync-metadata` adds synchronization bookkeeping; `9-to-10-durable-automatic-sync-outbox` adds operation and lease records and migrates pending metadata into the queue; `10-to-11-private-lab-library-cache` adds lab cache stores without rewriting personal records. Immutable recipe revisions and historical calculation snapshots are not rewritten; legacy scientific input is migrated only when opened into editable current-engine work. A migration failure does not delete or reset the database.

## Transactions and concurrency

A scientific save computes canonical SHA-256 digests before opening one IndexedDB transaction. The transaction writes the immutable recipe revision and snapshot, updates the recipe current pointer and compact recent entry, and creates recipe/revision outbox descriptors for an authenticated owner. Any failure rolls back the entity records and their sync intent together. Note, comparison, settings, metadata, archive, deletion, and reviewed anonymous-adoption writes use the same transactional rule. Route revision and pointer writes are similarly atomic but remain local-only. Expected revision numbers provide optimistic concurrency; a stale tab receives `PersistenceConflictError` and never overwrites another revision.

Display-name, description, tags, validation status, archive state, and structured experimental notes are metadata and do not rewrite scientific history. Every scientific input edit—including target/site composition, route, constraints, objective, batch basis/mass, adjustments, purity, loss, yield, rounding, overrides, or data selection—requires an explicit revision save. The concise revision note belongs to that immutable revision; experimental notes are separate mutable records and may optionally point at it.

Recipe-note bodies are bounded plain text. Repository operations create, update, archive, delete, search, and validate recipe/revision linkage without modifying calculation snapshots. Recipe deletion cascades its notes. Full manifest-backed backup/restore includes notes and remaps their linked recipe/revision identities during divergent merge. Ordinary calculation CSV, weighing JSON, and print surfaces exclude all notes by default; this avoids silently exporting private experimental records.

## Canonical records and snapshots

Canonicalization sorts object keys, normalizes numeric strings through the engine decimal contract, removes transient workspace/preset IDs, and gives precursors deterministic identity ordering. Timestamps and random persistence IDs are outside scientific digests. Snapshot output uses the engine canonical representation normalized by the project canonicalizer. Input, output, and atomic-weight data receive separate SHA-256 digests.

Snapshots store the full structured `BatchCalculationResult`, including matrix, solver, exact `ScientificScalar` numerator/denominator objects, labeled decimal approximations, 50-digit calculation precision, 34-digit serialization precision, half-even rounding metadata, mass pipeline, realized composition, residuals, warnings, and trace. Historical snapshots are never mutated. Opening one displays its stored output; “Recalculate with current engine” creates an unsaved working result.

The integrity checker validates pointers, required snapshots, input/output digests, supported schema versions, required engine/data metadata, and positive rational denominators. Diagnostics are structured and suspicious records are not repaired automatically.

## Recovery and command history

Recovery is distinct from recipe revision save. Valid committed input, mode, panel, base revision, unsaved flag, and edit sequence are debounced into IndexedDB. Malformed in-progress text is recorded separately and cannot replace the last valid committed input. Refresh restores working input and recalculates unsaved work with the current engine.

Undo/redo uses immutable before/after recipe commands. Edits sharing a field key within 500 ms form one command; route application, precursor deletion, preset reset, duplication, and new recipe are single commands. The in-memory history is capped at 150 commands and UI-only actions are excluded.

## Export formats and safety

Copy produces tab-delimited `Precursor`, `Formula`, `Purity`, `Final weighing mass`, and `Unit` columns from the visible result. CSV is UTF-8 BOM, standards-quoted, tidy one-row-per-precursor data with repeated provenance, separate exact solver and decimal approximation columns. JSON uses export schema `1.0.0` and embeds structured scientific input/result plus digests and versions. Print CSS removes navigation and inputs while retaining tables, warnings, summary, and versions.

Copy, CSV, JSON, and print are blocked for invalid or stale current work. A verified historical snapshot remains exportable as the saved record.
# Comparison persistence behavior

Comparison assembly is an in-memory working operation. Empty and one-scenario workspaces are valid while assembling but are not persisted as completed comparisons. Saved comparisons require two to four scenarios but do not require target equivalence. Each scenario persists its own target formula, explicit site model, adjustments, and precursor route. The legacy `sharedTarget` field records the first scenario for schema compatibility and never overwrites other scenarios during ordinary comparison work. Saving snapshots every currently valid scenario, preserves invalid scenario inputs without inventing results, writes the stable comparison ID with scenario order and source recipe/revision metadata, and reads the record back before showing `Comparison saved`. Repository or IndexedDB failure does not replace the working state.
# Save post-actions

Save post-actions are transactionally ordered: validate and persist, read the saved record back, then transition the workspace. `Save and start blank` constructs a new blank transient workspace while retaining UI preferences. `Save and open copy` constructs a new transient identity from the just-saved scientific input and records duplication provenance. Notes remain attached to their source recipe/revision and revision-note text is never promoted into the copy.

# Schema 8 local user settings

Database version 8 adds one `userSettings` table keyed by `local-user-settings`. `UserSettingsRepository` is the authoritative reader/writer/reset boundary. Missing records are initialized from documented defaults; unsupported future settings schemas are rejected. The 7→8 migration adds settings without modifying recipe revisions, snapshots, routes, layouts, or notes. The earlier localStorage weighing-sort preference is imported once into the settings record when applicable.

Full backup manifests include settings counts and digests. Verified pre-settings backups retain their historical manifest verification and receive documented defaults during migration. Replace restore restores settings; merge follows the selected conflict policy. Resetting settings never clears other tables.

User-settings record schema `2.0.0` added nested Print settings without changing IndexedDB database version 8 or scientific tables. Schema `3.0.0` added `light | dark | system`; schema `4.0.0` adds explicit `midnight`. Reading schemas `1.0.0` through `3.0.0` supplies missing defaults and persists the migrated record; existing `dark` remains revised neutral Dark and is never converted to Midnight. Integrity scans validate the migrated form and future schemas remain rejected. Appearance defaults to System and never enters recipe revisions, snapshots, comparison scientific input, canonical output digests, CSV, or recipe JSON.

IndexedDB remains authoritative. Because it cannot be read synchronously before first paint, successful settings reads/writes/restores maintain a derived `max-stoich-appearance` localStorage bootstrap mirror. The root initialization script reads only that value, resolves System through `prefers-color-scheme`, and sets `data-theme` before hydration. React then reconciles from the settings repository and live media-query changes. Reset writes the System default; verified backup and restore include the authoritative appearance field.

# Cloud-account separation

Anonymous records remain in `max-stoich-local`. Each authenticated user receives a physically separate IndexedDB database named from that verified Supabase user ID. Route providers remount on identity changes, so User A, User B, and signed-out state cannot read one another's repository instance accidentally. Stable local record IDs remain unchanged; cloud UUIDs, server versions, cursors, base digests, tombstones, conflict state, outbox operations, and leases live only in the synchronization stores introduced in versions 9 and 10. Version 11 lab-cache stores remain separate from personal and cloud-sync records.

Signing in does not claim anonymous records. The first-upload review explicitly copies selected anonymous records into the current account database before any upload. Signing out defaults to preserving the account cache, with a separately confirmed option to remove only fully synchronized cloud-downloaded cache records. Pending, local-only, conflicted, and failed records are never removed by that action. See `CLOUD_SYNC_ARCHITECTURE.md`.
# Startup retry and safe recovery

Workspace initialization is an explicit repeatable operation, not a cached promise. Every Retry closes the current Dexie connection, reopens IndexedDB, reruns idempotent upgrades, reloads settings, checks scientific-record pointers, validates recovery, reloads libraries, and only then enters the calculator.

Failures are classified as IndexedDB unavailable, quota exceeded, upgrade blocked, migration failed, recovery corrupt, settings corrupt, scientific-record corrupt, or unknown. A blocked upgrade tells the user to close other MAXCalc tabs; existing connections close on `versionchange`.

Recovery actions have strict safety boundaries:

- Open without restoring skips the recovery record and opens a blank calculator. It preserves saved scientific records and readable settings.
- Repair validates and migrates the editable recipe, removes malformed transient UI state, and rebuilds derived calculation state. It never rewrites immutable snapshots.
- Reset recoverable workspace deletes only the current recovery record.
- Reset settings only deletes the versioned `userSettings` record and appearance bootstrap. It preserves recipes, revisions, snapshots, notes, routes, comparisons, layouts, and recovery input.
- Diagnostic export attempts a raw local backup without exposing contents on screen.
- Route and global error boundaries expose raw IndexedDB recovery actions so a failure before the workspace mounts cannot trap the user behind a reload-only Retry button.
- Emergency backup export is explicit and may include local record contents; the on-screen technical disclosure contains only error metadata.
- Full reset is confirmed separately, names the lost record categories, and deletes every local database table.
