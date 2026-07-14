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

Implemented locked-target two-to-four route comparison, deterministic difference projection, historical comparison records, bounded saved layouts, schema-3 migration, verified backup/preview/merge/replace, application-owned import, error boundaries, offline loaded-page workflows, descriptor unavailable gate, and laboratory acceptance materials. Engineering validation is complete only when the recorded validation commands pass. Actual supervised laboratory acceptance remains pending and the product is not laboratory approved.

## Next milestone: laboratory feedback remediation

Run `LAB_ACCEPTANCE_PLAN.md`, then remediate observed scientific or usability failures. Secure shared-backend preparation is an alternative only after local workflow approval and explicit authorization. Advanced descriptors remain blocked until atomic-radius data approval.

## 13–14. Descriptors and layout customization

After radius-data approval, implement lazy descriptor panels and screening labels. Add bounded layout/density presets, comparison view, and reset. Gate: no mixed radii; layouts remain usable at target viewports/zoom.

## 15. Shared backend

Define Supabase sync/auth/permissions/revision adapters only after local FUR validation. Local calculation remains available offline and independent of backend state.

## Cross-cutting controls

- Maintain backward-compatible snapshot readers and explicit migrations.
- Record equations/units beside implementation and in trace tests.
- Measure before introducing workers or memoization complexity.
- Review all default-route and lot data with laboratory owners.
- Do not implement a phase whose blocking decision remains unresolved.
# Atomic-radius infrastructure milestone

Registry infrastructure is complete: versioned schema, approval/digest gate, override contract, schema-4 persistence, backup/import trust policy, unavailable calculator/comparison/settings UI, and export status. Scientific descriptor arithmetic remains blocked because `data/radius-sets.json` contains zero approved datasets. This phase must not be marked scientifically complete until dataset approval and hand-audited mean/range/variance/standard-deviation/mismatch fixtures pass.
