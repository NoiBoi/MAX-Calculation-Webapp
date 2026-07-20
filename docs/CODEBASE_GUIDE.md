# MAXCalc codebase guide

## Repository map

- `app/`: App Router pages, authenticated API routes, callbacks, global layout/error handling.
- `components/`: React feature modules and shared visual primitives.
- `lib/workspace/`: editable calculator state, presets, command history, precursor registry, adapter.
- `lib/presentation/`: result formatting, weighing summaries, verification views.
- `lib/comparison/`: comparison state, deterministic differences, and analysis models.
- `lib/persistence/`: versioned entities, Dexie database, repositories, migrations, canonicalization, backup/recovery.
- `lib/cloud/`: cloud contracts, local sync metadata/outbox, validation, merge/conflict logic, coordinator.
- `lib/labs/`: lab types, client, validation, cache, and sync.
- `lib/supabase/`: public configuration, browser/server clients, generated database shape.
- `lib/print/` and `lib/export/`: dedicated print jobs and stable laboratory exports.
- `packages/chemistry-engine/`: pure scientific package.
- `data/`: checked-in versioned source data and generated registries.
- `scripts/data-ingest/`: reproducible scientific data import.
- `scripts/hardening/`: release baseline, provider policy, and browser-secret scanning.
- `supabase/migrations/`: ordered production schema/RLS/RPC changes.
- `supabase/tests/`: disposable-project RLS and lab-isolation verification.
- `tests/unit/`: application, persistence, sync, security, backup, print, settings tests.
- `tests/e2e/`: Chromium workflow, accessibility, responsive, theme, and print tests.

Generated or ephemeral directories include `.next/`, `node_modules/`, `playwright-report/`, `test-results/`, `coverage/`, and `supabase/.temp/`. Do not edit generated Next.js types or test artifacts as source.

## Where changes belong

- Formula, composition, exact arithmetic, site, solver, adjustment, molar-mass, descriptor, trace, and realized-composition behavior belongs in `packages/chemistry-engine`.
- UI-only state and interaction belongs under `components/` or the relevant presentation/application adapter.
- Scientific input conversion belongs in `lib/workspace/adapter.ts`; do not calculate chemistry in React.
- Stable output formatting belongs in `lib/presentation`, `lib/export`, or `lib/print`, depending on the contract.
- Local entity and transaction behavior belongs in `lib/persistence`.
- Cloud transport and merge behavior belongs in `lib/cloud`; server authorization remains in API routes, RLS, and RPCs.

## Common contributor tasks

### Add a saved-record field

1. Decide whether the field is mutable metadata, immutable scientific input, or derived output.
2. Update the entity type and boundary validator.
3. Preserve the serialized field name once released.
4. If existing records require a value, append an explicit migration; never reorder or rewrite historical migrations.
5. Update canonicalization only if the field scientifically belongs in the digest.
6. Update backup/restore, cloud mapping, conflict behavior, and lab publication only where the record crosses those boundaries.
7. Add backward-compatibility, transaction rollback, backup, and sync tests.

### Add an IndexedDB migration

Increment `DATABASE_VERSION`, append a Dexie version block, append the migration metadata contract, and keep every older version definition. Migrate only stores that require rewriting. Prove upgrade from the previous version, idempotent reopen, rollback/failure behavior, and preservation of immutable snapshots.

### Add a scientific dataset

Add provenance and schema-valid source data, use the relevant ingestion script, verify its digest and coverage, assign a new immutable data version, update the registry, and add source/selection/missing-value tests. Source verification and laboratory approval are separate states.

### Add a route

Create the App Router file, use shared application chrome where appropriate, classify caching/authentication requirements, update security headers if the surface is private, add the route to documentation, and add navigation/accessibility tests. Do not move scientific logic into the route.

### Add an export field

Identify whether the field belongs in human-facing CSV, structured calculation JSON, backup, print, or more than one contract. Add it only to the intended serializer, preserve existing columns and field names, document units/exactness, and add an explicit compatibility test.

### Preserve backward compatibility

Never infer compatibility from TypeScript compilation. Test older IndexedDB records, backup manifests, historical snapshots, cloud schema versions, and stable identifiers. Keep readers for supported older versions even when all new writes use the current version.

## Glossary

- **Ideal composition**: the crystallographic target before feed adjustments.
- **Intended feed**: the explicit formula-relative composition the user plans to supply.
- **Adjusted feed**: the requirement after ordered pre-solver adjustments.
- **Realized composition**: composition reconstructed from final rounded weighing masses and declared material data; not a measured product phase.
- **Recipe**: mutable identity and metadata pointing to a current immutable revision.
- **Revision**: immutable scientific input committed at a point in time.
- **Snapshot**: immutable calculated output, provenance, canonical representations, and digests linked to a revision.
- **Route**: reusable local precursor setup and defaults; it does not retroactively modify recipes.
- **Local-only**: stored in one browser namespace and not pending for cloud upload.
- **Cloud-synced**: validated account-owned data with local/cloud mapping and a successful synchronization base.
- **Lab publication**: explicit copy of an immutable personal revision into an authorized private lab library.

## First reading path

New contributors should read `ARCHITECTURE.md`, `SCIENTIFIC_ENGINE_ARCHITECTURE.md`, `LOCAL_PERSISTENCE_ARCHITECTURE.md`, `CLOUD_SYNC_ARCHITECTURE.md`, `SECURITY.md`, and `TESTING.md` before changing cross-layer behavior.
