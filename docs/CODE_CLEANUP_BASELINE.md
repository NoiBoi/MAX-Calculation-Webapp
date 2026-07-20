# Code cleanup baseline

Recorded on 2026-07-19 before the repository-wide cleanup milestone.

## Source state

- Branch: `main`
- Baseline commit: `0e9fdaf74c56bc97060e4bb270c80a64ba6b32e3`
- Application release: `1.0.0-rc.1`
- Chemistry engine: `0.6.1-rational-scalar-contract`
- Worktree: dirty. The existing modified and untracked files are part of the behavior baseline and must not be discarded by this milestone.
- TypeScript: strict, `noUncheckedIndexedAccess`, no emitted JavaScript.
- TypeScript/ESLint suppression directives: none.

## Validation baseline

| Check | Baseline result |
| --- | --- |
| TypeScript | Passed |
| ESLint | Passed with zero warnings |
| Unit and scientific tests | 31 files, 457 passed, 0 failed, 0 skipped |
| Full Playwright suite | 139 total: 133 passed, 2 failed, 4 skipped |
| Production build | Passed; 22 static/dynamic page groups generated |
| Browser secret scan | Passed; no service-role marker or configured value found |
| `npm audit` | 0 vulnerabilities at every severity |
| Release baseline | Passed |

The two Playwright failures are pre-existing test-locator defects, not observed product failures:

1. `HARDEN-DEPLOYED-001` uses an unscoped `Sign in to MAXCalc` heading locator. The shared application header and the authentication page body intentionally expose the same heading text.
2. `DEFAULT-ROUTE-001` uses an unscoped `Feature demo and tutorial` heading locator. The shared application header and the demo body intentionally expose the same heading text.

The four skips are environment-gated cloud tests: two live Supabase tests without disposable credentials and two local-only cloud-configuration variants that are not applicable to the configured local environment. No test was disabled for this cleanup.

Existing non-failing output includes:

- Node warnings that `NO_COLOR` is ignored while `FORCE_COLOR` is set by the test runner.
- Development-only structured sync logging guarded by `NODE_ENV !== "production"`.
- Test-only performance observations for solver, batch, comparison, and persistence workloads.
- Git line-ending notices that LF will be converted to CRLF when Git next writes affected files.

Next.js 16 does not report route bundle sizes in the current build output, so no comparable per-route bundle-size baseline is available.

## Routes

User-facing routes:

- `/` and `/workspace`
- `/compare`
- `/settings`
- `/account` and `/account/cloud-data`
- `/labs`, `/labs/[labId]`, `/labs/[labId]/audit`, `/labs/[labId]/library`, `/labs/[labId]/members`, `/labs/[labId]/settings`
- `/labs/invitations/accept`
- `/login`, `/signup`, `/forgot-password`, `/reset-password`
- `/auth/error`
- `/materials`, `/recipes`, `/demo`, `/print`

Server and authentication handlers:

- `/api/account/profile`
- `/api/cloud-sync`
- `/api/labs`
- `/auth/callback`

## Versioned contracts

| Contract | Version |
| --- | --- |
| IndexedDB | 11 |
| Local record schema | `11.0.0` |
| Scientific schema | `1.0.0` |
| Cloud sync | `1.0.0` |
| Private lab | `1.0.0` |
| Supabase migrations | `202607170004` |
| Atomic weights | `2024.2.0` |
| Radius dataset schema | `2.0.0` |
| Teatum metallic CN12 | `1.0.0` |
| Cordero covalent | `1.0.0` |
| Rahm neutral-isodensity | `1.0.0` |

Database names, store names, schema ordering, migrations 1 through 11, serialized field names, public routes, environment variables, backup identifiers, and legacy `max-stoich` identifiers are compatibility contracts.

## Public TypeScript surfaces

The supported chemistry package entrypoint is `packages/chemistry-engine/index.ts`. It re-exports:

- schemas, errors, and version constants;
- element and radius datasets and validation;
- formula parsing, composition, site composition, and grouped-site normalization;
- exact numeric/scientific scalar and decimal helpers;
- molar mass, elemental balance matrices, constrained precursor solving, suggestions, and eligibility;
- batch calculation, adjustments, and descriptors.

Additional package subpath exports are `./schemas` and `./element-data-schema`.

Application-level public boundaries include:

- `buildWorkspaceCalculation` and workspace input/result types;
- persistence entity schemas, migrations, repository interfaces, and `LocalDataRepositories`;
- cloud repository contracts, sync types, sync engine, and coordinator;
- lab client/types/validation/cache;
- backup, restore, print, export, and release-baseline interfaces;
- shared application shell and presentation components.

This cleanup may improve documentation or internal types, but it must not unintentionally remove or rename these surfaces.

## Visual baseline artifacts

The baseline Playwright run produced representative artifacts under `test-results/`:

- calculator/header geometry: `ui-polish-*/cross-route-header-alignment.png`
- comparison command bar: `ui-polish-*/comparison-command-bar-1574.png`
- comparison at 2K and 4K: `large-display-*/comparison-2k.png`, `ui-polish-*/comparison-empty-4k.png`
- narrow four-scenario comparison: `ui-polish-*/comparison-four-scenarios-narrow.png`
- Settings at 4K: `large-display-*/settings-4k.png`
- Letter portrait six-up print: `print-system-*/letter-portrait-6-up.png` and `.pdf`
- A4 landscape four-up print: `print-system-*/a4-landscape-4-up.png` and `.pdf`
- partial-page print packing: `print-system-*/3-of-4-partial.*`, `print-system-*/5-of-6-partial.*`

These artifacts cover Light/Dark/Midnight theme behavior, responsive layouts, print packing, and shared header geometry through their originating tests.

## Dependency baseline

Direct runtime dependencies are Next.js, React, Supabase SSR/client, Dexie, Decimal.js, Zod, and Vercel Analytics. Direct development dependencies are TypeScript, ESLint/Next config, Vitest, Playwright/Axe, Tailwind/PostCSS, TSX, type packages, and fake IndexedDB. `npm ls --depth=0` reports a valid tree. `npm audit` reports 0 vulnerabilities across 555 installed production, development, optional, and transitive packages.

No dependency is removed solely because a static text search does not find it; scripts, build tooling, generated code, dynamic imports, and deployment use must also be excluded.
