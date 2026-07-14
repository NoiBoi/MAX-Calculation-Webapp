# Laboratory release-candidate architecture

## Comparison state and difference engine

Database schema 3 stores a versioned comparison workspace with one locked target and two to four independent scenario inputs. A scenario retains source IDs/revisions and may retain canonical historical input/output, SHA-256 digests, exact engine result, and engine/dataset versions. Editing uses immutable scenario-local updates; changing the shared target is the only operation that updates every scenario. All calculations call the standard workspace adapter and chemistry engine.

The difference engine is a read-only projection of those results. It aligns rows by intentionally shared identity, then canonical elemental composition, then a stable scenario-local row. Display names never establish scientific identity. Missing cells say `Not used`. Summaries describe deterministic numeric criteria and never claim experimental superiority.

## Layout schema

Layout records are separately versioned presentation preferences. Built-in presets cannot be overwritten. Input width is limited to 35, 40, 45, or 50 percent; comparison input width is capped at 45 percent. Final mass and status columns are mandatory. An invalid user record falls back to a tested preset and cannot alter recipes, snapshots, or chemistry.

## Backup and restore

The plain-JSON backup schema is `1.0.0`. It includes database/application versions, records and relationships, exact rationals, canonical scientific strings, dataset versions, record counts, SHA-256 per-record digests, and a global manifest digest. Creation time is metadata and is deliberately excluded from the reproducible digest.

Restore always validates before writing. Preview writes nothing. Replace takes a safety backup, then clears and writes all application tables in one IndexedDB transaction. Merge skips identical records; divergent records are either kept locally or imported with a new connected identity. Recipe/revision/snapshot and route/revision graphs are remapped together. Immutable history is never overwritten. A thrown write aborts the whole transaction.

## Application-owned import

Accepted JSON record types are full backup, complete saved calculation, saved recipe graph, saved route graph, and comparison workspace. Owned record envelopes carry schema version and a payload digest. Validation limits files to 10 MiB, 5,000 backup records, 100,000 characters per string, and 40 nesting levels. It rejects unknown/future formats, malformed formulas/scalars/rationals, missing references or dataset metadata, digest mismatch, and structured output that differs from canonical output. Preview precedes import; imported historical output is preserved without recalculation.

## Release metadata and diagnostics

Release approval is documentation metadata, separate from recipe validation. Current status is **Laboratory validation in progress**; no responsible reviewer or acceptance record has approved this build. Diagnostics remain local, omit full proprietary recipe content by default, and are exported only on user action.

## Descriptor gate

No approved atomic-radius dataset with definition, source/version, coordination and oxidation policies, reviewer, missing-value policy, units, and digest exists. Descriptor controls therefore remain disabled and return no placeholder values.
