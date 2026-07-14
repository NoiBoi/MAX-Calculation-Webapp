# Local Persistence and Export Architecture

## Boundary and schema

The React workspace calls project-owned `RecipeRepository` and `RouteRepository` interfaces. `LocalDataRepositories` implements them with Dexie/IndexedDB; the chemistry engine has no persistence or browser imports. Database version 2 contains `recipes`, `recipeRevisions`, `snapshots`, `routes`, `routeRevisions`, `recentCalculations`, `recovery`, and `migrations`. Compound revision indexes enforce deterministic lookups; name, formula, status, archive, and update-time indexes support the compact libraries.

All records carry local schema version `2.0.0`. Migration definitions are ordered and append-only in `lib/persistence/migrations.ts`. A migration failure does not delete or reset the database. The UI reports a blocking recovery message, and `exportRawBackup()` remains available to development/recovery tooling.

## Transactions and concurrency

A scientific save computes canonical SHA-256 digests before opening one IndexedDB transaction. The transaction writes the immutable recipe revision and snapshot, then updates the recipe current pointer and compact recent entry. Any failure rolls back all four records. Route revision and pointer writes are similarly atomic. Expected revision numbers provide optimistic concurrency; a stale tab receives `PersistenceConflictError` and never overwrites another revision.

Display-name, description, tags, validation status, and archive state are metadata and do not rewrite scientific history. Every scientific input edit—including target/site composition, route, constraints, objective, batch basis/mass, adjustments, purity, loss, yield, rounding, overrides, notes, or data selection—requires an explicit revision save.

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
