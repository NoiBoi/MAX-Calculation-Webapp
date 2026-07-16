# Detailed Implementation Plan

Each phase ends at a scientific or usability gate. Later phases do not start merely because code exists.

## Foundation — complete in this task

Repository structure, schema contracts, versioned seed atomic data, product/chemistry/provenance/UX/shortcut/test documentation, low-fidelity workspace, measurable acceptance criteria, and contribution rules. Gate: all available checks pass; scientific decisions remain explicitly blocked rather than guessed.

## 1–3a. Formula, flat composition, and molar-mass milestone — complete

The approved combined milestone implements tokenization, nested stoichiometric grouping, complete element-symbol validation, immutable flat composition vectors and normalization, deterministic serialization, versioned molar mass, atomic/mass fractions, structured errors/warnings, data-selection trace, comprehensive tests, and a minimal application-boundary demonstration. Parenthesized fractional syntax is purely stoichiometric and never infers crystallographic sites.

## 2b. Crystallographic site-composition model — complete

Implemented 211/312/413 templates, arbitrary custom sites, explicit ideal/intended-feed roles, deterministic ordering/rendering, vacancies, lock metadata, strict and explicit normalization modes, elemental-vector conversion, structured diagnostics/trace, comprehensive tests, and a minimal demonstration. Flat formulas such as `TiNbAlN` and `Ti3AlCN` never infer occupancy.

## 4. Deterministic elemental balance matrix — complete

Implemented formula-unit-relative requirement vectors, exact target-element matrices, separate precursor-only element matrices, deterministic element/precursor ordering, canonical serialization, structured missing-source and dependence diagnostics, and exact BigInt-rational matrix/augmented-rank analysis. Hand-audited MAX, mixed-site, nine-element, invalid, reproducibility, and immutability cases pass. No precursor quantities are solved.

## 5. Constrained precursor solver — complete

Implemented exact formula-unit-relative precursor quantities, non-negativity, fixed/bounded/ratio constraints, exact residual and constraint verification, deterministic ordered objectives, canonical trace/output, precursor-only introduced totals, and distinct infeasibility classifications. Exact/under/over/non-negative-infeasible/constrained references and representative 15 × 20 systems pass. No grams are calculated.

## 6–7. Formula-unit-to-batch scaling and ordered adjustment pipeline — complete

Implemented explicit ideal/recovered/mixture bases, pre-solver elemental adjustments, post-solver precursor adjustments without re-solving, provenance-bearing molar-mass overrides, purity division, retained-fraction loss correction, exact final rounding modes, realized composition/residuals, stable warnings, and canonical trace. The combined batch milestone replaces the earlier split plan because these operations must be verified end to end.

## 8. Scientific validation suite — registry and comparison process complete; independent review pending

Implemented a 20-category reference registry with expected-value source, tolerance, classification, and reviewer status plus a controlled spreadsheet-comparison process. No case is falsely promoted. Independent spreadsheet matching and named laboratory approval remain release work.

## 9. Minimal one-screen calculator — complete

Implemented `/workspace` with live engine-backed calculation, explicit presets/site models, editable routes, batch/common adjustments, final masses, warnings, stale-result safety, standard/advanced diagnostics, trace, responsive layout, and a keyboard-complete routine path. Scientific logic remains outside React.

## 10–12. Local persistence, command history, and export — complete

Implemented Dexie repositories and ordered migrations, transactional immutable snapshots, optimistic concurrency, integrity diagnostics, valid-state crash recovery, bounded command history, documented shortcuts, copy/CSV/JSON/print, and saved route/recipe/revision flows. Automated scientific, repository, migration, rollback, export, and browser workflow gates pass; independent laboratory acceptance remains pending.

## 13. Route comparison and production hardening — engineering implementation complete

Implemented locked-target two-to-four route comparison, deterministic difference projection, historical comparison records, bounded saved layouts, schema-3 migration, verified backup/preview/merge/replace, application-owned import, error boundaries, offline loaded-page workflows, the original descriptor-registry gate, and laboratory acceptance materials. Engineering validation is complete only when the recorded validation commands pass. Actual supervised laboratory acceptance remains pending and the product is not laboratory approved.

## 14. Scientific-data and UX remediation — engineering implementation complete

Implemented a blank-first workspace and immutable example copies; a unified primary command bar; explicit Standard/Advanced modes; bounded layouts; centralized scientific formatting and diagnostic presentation; the complete versioned 118-element CIAAW registry; separate Teatum, Cordero, and Rahm radius datasets and deterministic importers; Decimal-based site descriptors; immutable schema-5 dataset snapshots; and provenance-rich JSON/CSV/print surfaces. Source verification and laboratory approval are independent trust axes. Teatum and Cordero are source verified; Rahm remains provisional because automated retrieval of the publisher-hosted primary supporting-information file is unresolved. No radius dataset is represented as laboratory approved.

Engineering gates: type checking, lint, 295 unit/integration tests, 40 browser tests including target viewport/zoom and accessibility checks, deterministic re-import hashes, production build, and dependency audit. Independent scientific review and supervised laboratory acceptance remain pending.

## Next milestone: independent scientific review and laboratory acceptance

Run `LAB_ACCEPTANCE_PLAN.md`, have named reviewers verify the atomic-weight policy and radius transcriptions against primary sources, acquire and verify the Rahm supporting information, and record laboratory approval per dataset/version where warranted. Secure shared-backend preparation remains optional and requires explicit authorization.

## 15. Shared backend

Define Supabase sync/auth/permissions/revision adapters only after local FUR validation. Local calculation remains available offline and independent of backend state.

## Cross-cutting controls

- Maintain backward-compatible snapshot readers and explicit migrations.
- Record equations/units beside implementation and in trace tests.
- Measure before introducing workers or memoization complexity.
- Review all default-route and lot data with laboratory owners.
- Do not implement a phase whose blocking decision remains unresolved.
# Atomic-radius infrastructure milestone

Registry infrastructure is superseded by schema 2: three definition-separated datasets, source-verification/lab-approval split, Decimal descriptor arithmetic, per-site selectors, missing-value blocking, schema-5 immutable provenance, importer/spot-check fixtures, and screening disclaimers are implemented. Laboratory approval remains pending and is not implied.

# Calculation verification and reconciliation milestone

Engineering implementation is complete: engine-backed precursor conversion, purity/loss/rounding stages, reverse realized moles, elemental/formula reconciliation, atomic-weight contributions, assumption classification, comparison isolation, advanced-summary integration, exact JSON/CSV data, and compact Letter/A4 print output. Arithmetic verification is explicitly separate from measured outcomes and never claims phase or reaction validation. Historical snapshots without the additive fields remain readable with unavailable detail labeled. Independent scientific review and laboratory acceptance remain the next gate.

# Local user-settings milestone

Engineering implementation adds a versioned schema-8 IndexedDB settings record, documented feed-default precedence, configurable post-save action, independent Standard/Advanced weighing fields and order, required-column protections, synthetic previews, optional provenance-bearing elemental-radius cells, scoped resets, and verified backup/restore. Settings remain local presentation/starting preferences and never rewrite recipes or snapshots.

# Focused calculation-control, precursor-coverage, and print milestone

Engineering implementation moves verification to the bottom Calculation details row beside trace, adds metadata-driven elemental precursor eligibility and a direct search-limit-bypassing HE route, migrates local user settings to record schema `2.0.0` with print preferences, and routes calculator/comparison/history/library printing through a shared dedicated state. Letter/A4 2/4/6-up and long-recipe fallback are covered at 100% scale. Solver mathematics, scientific persistence schemas, comparison models, and radius calculations are unchanged.

The focused appearance milestone migrates user settings to `3.0.0`, adds one Light/Dark/System authority with a pre-hydration bootstrap mirror, introduces semantic palette tokens and a compact global control, and forces print-safe light rendering. It is presentation-only: chemistry, recipe revisioning, comparison calculations, snapshots, and canonical exports remain unchanged.

The palette/print refinement migrates settings to `4.0.0`, replaces blue-tinted Dark neutrals with charcoal, adds explicit Discord-style black Midnight, preserves System as Light/Dark only, raises print typography for 2/4/6-up sheets, lowers print packing capacities, and adds formula-boundary wrapping. The global creator credit is screen-only. No scientific or pagination architecture is replaced.
