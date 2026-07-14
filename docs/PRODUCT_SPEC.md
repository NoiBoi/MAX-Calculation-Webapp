# MAX Stoich Product Specification

Status: foundation baseline, 2026-07-13  
Product version target: first usable release (FUR)

## Product statement

MAX Stoich is a local-first laboratory workspace that turns a known MAX-phase target composition and an explicit precursor route into reproducible weighing masses. It is optimized for trained users performing many related calculations without leaving the primary screen.

## Priority order

1. Correct and reproducible chemistry calculations.
2. Fast routine operation.
3. Visible assumptions and adjustments.
4. Flexible unusual compositions and routes.
5. Progressive advanced controls.
6. Visual refinement.

When priorities conflict, the lower-numbered priority wins.

## First functional calculator milestone

This milestone supports one-screen loading and editing of temporary built-in examples, batch-mass changes, explicit excess adjustments, live weighing results, inline warnings, stale-result protection, standard/advanced modes, trace inspection, and keyboard use.

It does not include persistence, saved recipes/routes, refresh recovery, copy/export/print, cloud accounts, shared permissions, authentication, backend synchronization, speculative optimization, or unvalidated atomic-radius descriptors.

## Primary user and setting

The primary user is a trained materials-research laboratory worker who already knows the intended composition and route. They may wear gloves, repeat similar recipes, use a laptop or tablet near a balance, and need to audit a calculation later.

## Core jobs

- Calculate a routine built-in or explicitly entered route with no more than composition/route selection and batch-mass entry; saved routes arrive with persistence.
- Duplicate a prior recipe and change one variable without rebuilding it.
- Inspect every applied default, adjustment, warning, dataset version, and result revision.
- Copy or export the weighing table directly at the balance.
- Recover the exact workspace after refresh or accidental closure.
- Compare two routes from a shared starting recipe.

## Domain distinctions

The product always distinguishes:

- **Ideal crystal formula:** crystallographic site definition before feed changes.
- **Intended feed composition:** explicit target for the precursor balance.
- **Adjusted feed composition:** intended feed after ordered experimental adjustments.
- **Realized composition:** elemental composition implied by final rounded masses.

These labels must not be shortened to an ambiguous single “composition” in result summaries.

## Functional scope

### Standard workspace

- Conventional formula entry with site-model population only when parsing is unambiguous.
- Temporary built-in composition and precursor-route selection with visible validation status.
- Target batch mass and common excess/purity controls.
- Live precursor table, concise summary, inline warnings, and trace disclosure.
- Stale-result protection, keyboard focus shortcuts, and an expandable engine-provided trace.

### Advanced workspace

- Mixed occupants, multiplicities, vacancies, deficiencies, and custom sites.
- Fixed, bounded, ratio-locked, and solver-controlled precursor amounts.
- Reorderable adjustments and solver objectives.
- Residuals, trace, material overrides, rounding/uncertainty controls, and descriptors.

Mode switching preserves one shared recipe state; it never converts or discards advanced values.

## Deferred local-first data

The current calculator is intentionally in memory. A later milestone will use IndexedDB through Dexie for recipes, routes, recent calculations, preferences, and immutable snapshots while keeping the chemistry engine independent.

## Reproducibility contract

Every saved calculation snapshot includes canonical input, input/output schema versions, engine version, atomic-data versions, recipe revision, ordered adjustments, ISO timestamp, warnings, complete trace, and a SHA-256 digest of canonical input. Re-running the same versioned input must produce byte-equivalent scientific values and warning codes; display formatting may change independently.

## Non-functional targets

- Local common calculations: p95 under 100 ms on the agreed reference laptop.
- No network request in the calculation path.
- Refresh recovery: latest committed workspace restored without user action.
- Keyboard-only routine flow: 100% completion without pointer input.
- Accessibility: WCAG 2.2 AA target for application UI.
- No destructive operation without confirmation; warnings otherwise remain non-modal.

## Release gates

The calculator is not laboratory-released until approved reference results pass, all blocking scientific ambiguities are resolved, type/lint/unit/workflow checks pass, and a trained user completes the built-in routine workflow in 30 seconds or less in at least 4 of 5 timed attempts.

## Local-first persistence milestone

Workspace recovery is automatic and separate from explicit scientific saves. A saved recipe is a named current pointer plus metadata; each scientific save creates a numbered immutable input revision and matching calculation snapshot. Historical output is displayed exactly as stored with its engine/data versions and is never silently recalculated. Recipes and precursor routes are browser-local, searchable, duplicable, archivable, and revisioned. Copy, tidy CSV, structured JSON, and print operate only on current valid output or a verified historical snapshot. No account, cloud sync, shared permissions, cross-profile backup, or automatic restore exists in this milestone.
# Release-candidate additions (schema 3)

The local product includes a locked-target route comparison for two to four independently editable scenarios, bounded named layouts, and verified full backup/preview/merge/replace. Import accepts only application-owned calculation, recipe, route, comparison, and backup JSON. Historical outputs are preserved and explicit recalculation creates new state. There is no backend, authentication, synchronization, or multi-user permission model.

Release status is **Laboratory validation in progress**, not laboratory approved. Atomic-radius descriptors are exploratory screening outputs from source-verified data; configurational-entropy descriptors remain out of scope.

# Scientific-data and UX remediation (schema 5)

Fresh local state opens a blank unsaved calculation with no target, sites, precursors, route, or result; valid recovery still wins. Built-in examples are immutable templates cloned into a transient state labeled `Unsaved copy of …`; reset restores that copy and Save creates an ordinary user recipe.

The top bar integrates current identity/status with a reduced primary action set. Standard mode is the routine laboratory workflow. Advanced mode adds explicit-site editing, solver controls, overrides, matrix/rank diagnostics, installed radius descriptors, provenance, and trace. Compact Balance View makes final masses dominant; Route Comparison opens the real comparison product.

Diagnostics use blocking/action/minor/information hierarchy and information is not counted as a warning. CIAAW dataset `2024.2.0` covers all 118 symbols. Source-verified Teatum metallic and Cordero covalent datasets are usable for screening without being labeled lab-approved; Rahm neutral-isodensity data remain provisional pending direct SI verification.
# Atomic-radius product scope

Advanced mode exposes per-site atomic-radius selection, resolved values, missing-value state, source/laboratory status, and screening aggregates for explicit sites. Missing or provisional data block aggregates; no placeholder result is emitted.

# Deterministic precursor candidates

A valid target can produce advisory candidate precursor routes from the checked-in precursor registry and exact-target saved routes. Candidates are verified through the existing balance matrix and exact non-negative solver before display. Ranking is explicit: matching lab-approved, spreadsheet-matched, and hand-audited saved routes; source-verified built-ins; conservative registered binary/elemental candidates; then registered elemental fallback. This ranking predicts neither synthesis success nor phase formation.

Autofill never runs on formula entry. Applying a candidate replaces the entire working route in one undoable command and requires confirmation when rows already exist. Clear all removes only working precursor rows, preserves target and batch controls, requires confirmation, and is one undoable command. Formula changes preserve rows and show a coverage warning when the old route is no longer usable.
# Weighing summaries and comparison assembly

The calculator provides a large, paper-friendly weighing summary built only from the currently usable engine result. It shows the adjusted intended feed formula, batch basis, ordered precursor masses, total, and action-required messages. Stale working results cannot open the summary; immutable historical results remain available and are labeled historical.

Recipe comparison starts empty. Users explicitly add saved recipe revisions, the current unsaved calculator state, or a blank scenario. Saved-recipe import supports multiple selections and preserves every scenario's independent target, site model, adjustments, and route even when the targets differ scientifically. A working comparison may temporarily contain one scenario, while persistence requires two to four. Comparison summaries preserve scenario order and keep invalid scenarios visible without presenting masses as usable.

# Calculator workflow and recipe records (schema 7)

`/` opens the production calculator directly; `/workspace` remains supported and `/demo` contains the secondary feature tutorial/development reference. The compact Save dialog separates recipe metadata from scientific history: editable naming alone renames the recipe pointer, while changed canonical scientific input creates the next immutable revision and optional concise revision note. No saved state is reported before the repository transaction succeeds.

The direct `Aluminum per formula` value has one authoritative workspace field. Compatible Al-bearing target edits preserve it while independently updating ideal-reference help; precursor, carbon, mode, layout, suggestion, and recovery actions cannot derive over it. A target without Al removes the shortcut, and loading/resetting a different record intentionally supplies that record's value.

Normal and comparison weighing summaries report the final intended precursor molar quantity in `mol precursor / mol target formula` and final weighing mass. Exact solver rationals remain exact; compact decimals are presentation only, and a post-solver precursor adjustment exposes both solver and final intended quantities.

Saved recipes have separate structured notes with stable IDs, category, title, multiline plain-text body, tags, timestamps, optional experiment date/operator, optional revision link, and archive state. Notes are locally searchable by recipe/formula and note content and filterable by category/tag. Adding or editing a note never rewrites a scientific revision or snapshot. Full backups include notes; ordinary weighing exports exclude them by default.
