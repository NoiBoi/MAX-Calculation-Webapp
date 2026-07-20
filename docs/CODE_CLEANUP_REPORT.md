# Code cleanup report

Completed on 2026-07-19. This milestone intentionally favored documented
boundaries and small, provable cleanups over broad rewrites.

## Source state

- Baseline commit at the start of the milestone:
  `0e9fdaf74c56bc97060e4bb270c80a64ba6b32e3`.
- Current `main` commit at final validation:
  `3c3276dab5f9345515ded51c09c2d07bb8d6813f`.
- The branch advanced to the existing `UX Cleanup` commit while this worktree
  was active. Cleanup changes remain uncommitted and were not mixed into an
  automatic commit.
- No file, public route, dependency, migration, schema, or compatibility
  identifier was removed.

## Cleanup performed

### Dead code and typing

The stricter TypeScript check using `noUnusedLocals` and
`noUnusedParameters` found one unused server-helper parameter. The parameter
was not deleted: `getRecipeBundle` now uses the verified user ID in an explicit
`owner_id` query predicate. RLS remains authoritative, and the additional
predicate makes the ownership assumption visible without broadening access.

No other unused TypeScript declaration or suppression directive was found.
No source was removed merely because a static search could not find a caller;
route conventions, scripts, migrations, historical readers, registries, and
generated use make that unsafe.

### Duplication and module boundaries

No duplicated runtime path was consolidated. The most visible candidates are
not behaviorally interchangeable:

- historical backup-manifest readers preserve distinct released formats;
- clone/canonicalization helpers sit at different ownership and integrity
  boundaries;
- API authorization checks are intentionally explicit;
- large calculator and comparison shells contain DOM, focus, keyboard,
  print, and recovery contracts that need a dedicated decomposition milestone.

The dependency direction, owning modules, data flows, and compatibility
boundaries are now documented. No dependency was added between the chemistry
engine and React, Next.js, browser APIs, IndexedDB, Supabase, network code, or
UI state.

### API and comments

Focused JSDoc now covers:

- the public batch-calculation entry point;
- persistence repository implementations;
- cloud repository, manual sync, and automatic coordinator entry points;
- backup creation, preview, and restore boundaries;
- the shared application header and page-width primitive.

Comments explain determinism, ownership, side effects, transaction behavior,
and compatibility constraints rather than restating implementation steps.

### Test cleanup

Two baseline Playwright failures used ambiguous global locators after the
shared application header gained the same accessible heading/status text as
the page body. The tests now scope assertions to the authentication or demo
region and use the current stable `Calculator` navigation link. Product DOM,
accessible names, routes, and visible text were not changed.

### Documentation

Added:

- `ARCHITECTURE.md`
- `CODEBASE_GUIDE.md`
- `CODE_CLEANUP_BASELINE.md`
- `CONTRIBUTING.md`
- `SCIENTIFIC_ENGINE_ARCHITECTURE.md`
- `TESTING.md`
- this report

Updated:

- `README.md` with the contributor reading path and current Settings location;
- `LOCAL_PERSISTENCE_ARCHITECTURE.md` for database/local schema 11 and the
  private-lab cache migration;
- `CLOUD_SYNC_ARCHITECTURE.md` for local schema 11;
- `SECURITY.md` for explicit account-owned cloud reads;
- `UX_REQUIREMENTS.md` for the current header placement.

## Dependency audit

Every direct runtime dependency is used by application code or is a required
framework peer contract. Every direct development dependency is used by
TypeScript, lint/build configuration, data/hardening scripts, unit tests, or
browser tests. No dependency was removed, reclassified, or upgraded.

`npm ls --depth=0` reports a valid direct tree. `npm audit --json` reports zero
vulnerabilities across 555 installed production, development, optional, and
transitive packages.

## Validation and equivalence

| Check | Final result |
| --- | --- |
| TypeScript | Passed |
| TypeScript with unused locals/parameters enabled | Passed |
| ESLint | Passed with zero warnings |
| Unit/scientific/component tests | 31 files, 457 passed |
| Production build | Passed; all 22 page groups generated |
| Browser secret scan | Passed |
| Auth-provider policy | Passed; signup disabled consistently, email provider enabled, confirmation required |
| Release baseline | Passed |
| Dependency audit | 0 vulnerabilities |
| Diff whitespace check | Passed |

The final full Playwright run executed 139 tests: 135 passed and four expected
environment-gated cloud tests were skipped. An earlier run exposed one
timing-sensitive `LOGO-THEME-001` failure under ten-worker load; it passed
immediately in isolation and passed in the complete rerun. Theme, responsive,
header-geometry, accessibility, comparison, calculator, persistence, recovery,
backup, export, and print/PDF coverage all passed.

Scientific-output equivalence is established by all 12 chemistry-engine test
files and all 457 Vitest tests passing with unchanged fixtures, exact rational
assertions, deterministic solver results, saved snapshots, backup/import
digests, comparison calculations, verification, and presentation models. No
scientific source or serializer changed.

Visual equivalence is established by the unchanged runtime UI/CSS plus passing
Playwright coverage for calculator and comparison geometry, Settings at 4K,
Light/Dark/Midnight palettes, responsive/zoom behavior, accessibility, and all
Letter/A4 portrait/landscape 2/4/6-up print cases. Representative PNG and PDF
artifacts were regenerated under `test-results/`.

## Compatibility intentionally preserved

- engine and scientific schema versions;
- exact rational and decimal-approximation contracts;
- canonical ordering, hashes, digests, errors, warnings, trace, and rounding;
- IndexedDB name, stores, indexes, version 11, and migrations 1 through 11;
- local, cloud-sync, lab, backup, export, print, and dataset schema versions;
- Supabase tables, columns, RPCs, migration order, RLS, and Auth behavior;
- routes, environment variables, storage keys, serialized fields, and legacy
  `max-stoich` identifiers;
- visible UI, DOM order, class names, dimensions, responsive behavior,
  keyboard behavior, and print output.

## Remaining technical debt

- `workspace-shell`, comparison, and Settings shells are large and should be
  decomposed only with dedicated DOM/focus/visual equivalence fixtures.
- Historical backup manifest handling and record cloning contain intentional
  repetition that needs version-by-version golden fixtures before
  consolidation.
- Schema/version identifiers are repeated across release evidence and
  documentation; generating documentation from runtime contracts would require
  a separately reviewed tooling change.
- Browser automation currently claims Chromium only.
- Live Auth, cloud synchronization, RLS, and private-lab isolation require a
  disposable configured Supabase project. Source-contract/unit coverage passed,
  but destructive SQL fixtures were not run against production.
- The theme-persistence browser check can be timing-sensitive under maximum
  parallel load and would benefit from a test-visible persistence completion
  signal in a separate behavior-neutral testing milestone.
