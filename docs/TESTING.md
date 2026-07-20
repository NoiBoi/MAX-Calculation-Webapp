# Testing MAXCalc

## Commands

```text
npm run typecheck
npm run lint
npm run test
npm run test:e2e
npm run build
npm run security:scan
npm run release:baseline
npm audit
```

`npm run check` runs type checking, linting, and all Vitest unit/scientific tests. `npm run validate:rc` adds the production build and browser-secret scan. `npm run test:deployed` targets the hardening suite; set the documented test-target environment rather than pointing destructive fixtures at production.

## Test layers

- Chemistry tests live beside engine modules and prove parsing, exact arithmetic, deterministic matrices/solver, batch scaling, data provenance, and descriptors.
- `tests/unit` covers adapters, persistence/migrations, backup/recovery, cloud sync/conflicts/outbox, Auth policy, labs/RLS source contracts, settings, print, and presentation.
- `tests/e2e` covers calculator/comparison workflows, accessibility, keyboard operation, themes, responsive geometry, print/PDF output, recovery, and configured cloud behavior.
- `supabase/tests` contains disposable-project pgTAP/RLS verification. Never run it against production data.

## Environment-gated tests

Live Auth/sync tests require disposable credentials supplied outside source control. Provider-policy checks require the project URL and public key. Missing credentials should produce an explicit skip; do not silently retry or weaken assertions.

## Equivalence expectations

- Scientific changes require canonical-output and exact-scalar assertions.
- Persistence changes require upgrade, rollback, historical snapshot, and backup compatibility tests.
- Cloud changes require account isolation, idempotency, cursor, conflict, outbox, and partial-failure tests.
- UI refactors require existing DOM/accessibility behavior plus screenshots for affected routes, themes, and viewports.
- Print changes require Letter/A4 PDFs at supported orientation and packing combinations.

Do not update a snapshot merely because the new result is convenient. Explain and independently verify every intentional contract change.

Current cleanup baseline counts and known pre-existing failures are recorded in `CODE_CLEANUP_BASELINE.md`.
