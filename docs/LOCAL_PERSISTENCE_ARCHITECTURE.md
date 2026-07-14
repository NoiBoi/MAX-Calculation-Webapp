# Local Persistence and Export Architecture

## Boundary and schema

The React workspace calls project-owned repository interfaces. `LocalDataRepositories` implements them with Dexie/IndexedDB; the chemistry engine has no persistence or browser imports. Database version 7 contains recipes, immutable revisions/snapshots, structured recipe notes, routes, recovery, comparisons, layouts, datasets, and migration records. Compound revision indexes enforce deterministic lookups; note indexes cover recipe, optional revision, category, tag, archive, and update time without scanning calculation snapshots.

Current mutable records carry local schema version `7.0.0`. Migration definitions are ordered and append-only in `lib/persistence/migrations.ts`. Migration `5-to-6-aluminum-feed-coefficient` converts editable recovery/comparison inputs from legacy excess percentage using `Al_feed=Al_ideal*(1+excess/100)`: 20 becomes 1.2 and 120 becomes 2.2 for ideal Al1. Migration `6-to-7-recipe-notes` adds the independent notes table. Immutable recipe revisions and historical calculation snapshots are not rewritten by either migration; legacy scientific input is migrated only when opened into editable current-engine work. A migration failure does not delete or reset the database.

## Transactions and concurrency

A scientific save computes canonical SHA-256 digests before opening one IndexedDB transaction. The transaction writes the immutable recipe revision and snapshot, then updates the recipe current pointer and compact recent entry. Any failure rolls back all four records. Route revision and pointer writes are similarly atomic. Expected revision numbers provide optimistic concurrency; a stale tab receives `PersistenceConflictError` and never overwrites another revision.

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
