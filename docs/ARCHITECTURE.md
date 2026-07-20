# MAXCalc architecture

## Dependency direction

```text
Next.js routes and React UI
              ↓
Application adapters and presentation models
       ↙             ↓              ↘
Chemistry engine   Local repositories   Cloud/lab interfaces
                         ↓                    ↓
                    Dexie/IndexedDB     Authenticated API routes
                                              ↓
                                      Supabase Auth/Postgres/RLS
```

Dependencies flow downward. Infrastructure implementations may satisfy an application interface, but domain and scientific modules do not import infrastructure or UI code.

The chemistry engine in `packages/chemistry-engine` is framework-independent. It must not import React, Next.js, browser APIs, Dexie, Supabase, network clients, UI state, or persistence adapters.

## Major layers

| Layer | Primary locations | Responsibility |
| --- | --- | --- |
| Route composition | `app/` | Next.js pages, API handlers, Auth callback, route-level boundaries |
| UI features | `components/` | Calculator, comparison, account, lab, settings, print, dialogs, shared chrome |
| Application adapters | `lib/workspace`, `lib/presentation`, `lib/comparison`, `lib/print`, `lib/export` | Convert UI state to domain input and domain output to stable presentation/export models |
| Scientific engine | `packages/chemistry-engine` | Formula/composition, sites, exact arithmetic, matrices, solver, batch scaling, descriptors |
| Local persistence | `lib/persistence`, `lib/settings`, `lib/layouts` | Versioned entities, Dexie stores, migrations, transactions, backup, recovery |
| Personal cloud sync | `lib/cloud`, `app/api/cloud-sync` | Account-scoped repositories, durable outbox, merge/conflicts, coordinator, validated server writes |
| Authentication | `lib/supabase`, `components/auth`, `app/auth`, `proxy.ts` | Cookie-backed Supabase sessions, safe redirects, profile boundary |
| Private labs | `lib/labs`, `components/labs`, `app/api/labs`, `app/labs` | Role-aware lab cache, publication, invitations, audit, retention |
| Data registries | `data/`, `packages/chemistry-engine/default-*` | Versioned atomic weights and radius datasets with provenance |
| Build and verification | `scripts/`, `tests/`, `supabase/tests` | Ingestion, hardening, unit/browser/RLS verification, release evidence |

## Primary data flows

### Calculation

1. Controlled workspace input is stored as decimal strings and explicit structured site data.
2. `lib/workspace/adapter.ts` converts editable state into `BatchRecipeInput`.
3. `calculateBatchRecipe` performs deterministic scientific calculation.
4. Presentation modules derive tables, verification, summaries, print, and export content without recalculation.
5. A valid save transaction stores canonical input, immutable revision, immutable snapshot, digests, and the mutable recipe pointer.

### Local save and recovery

Working recovery is independent from an explicit recipe revision. Recovery may replace editable state after refresh; it never mutates a historical snapshot. A scientific save commits revision, snapshot, recipe pointer, recent item, and account outbox descriptors atomically.

### Personal synchronization

Entity writes and durable outbox intent share one IndexedDB transaction. `performManualSync` is the authoritative engine for manual and automatic passes. It pulls by monotonic cursor, validates every cloud record, merges immutable revisions before pointers, preserves conflicts, quarantines future/malformed rows, uploads in dependency order, and advances the cursor only according to the documented policy.

### Private lab publication

Publication copies an explicitly selected immutable personal revision/snapshot through an authenticated server route. Server-side RLS and role-checking RPCs remain authoritative. Lab cache records are separate from personal recipes; copying a lab version creates a new independent personal record.

## Compatibility boundaries

High-risk contracts include:

- chemistry canonical representations and exact scientific scalar objects;
- deterministic object and precursor ordering used by hashes;
- error/warning codes, trace codes, precision, rounding, and tie-breaking;
- IndexedDB database/store/index names and migrations 1–11;
- Supabase table/column/RPC names and migration order;
- local record, backup, export, cloud sync, print, and lab schema versions;
- public routes, environment variables, storage keys, and legacy `max-stoich` identifiers.

See the specialized architecture documents for the scientific engine, persistence, cloud sync, authentication, security, comparison, print/export, themes, and private labs.
