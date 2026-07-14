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

Release status is **Laboratory validation in progress**, not laboratory approved. Atomic-radius/configurational-entropy descriptors remain unavailable until a versioned, sourced, policy-complete dataset has a named laboratory reviewer.
# Atomic-radius product scope

Advanced mode exposes the atomic-radius registry and explicit-site availability state. Dataset selection, element values, overrides, and aggregates remain disabled because zero approved datasets are installed. Application-owned exports record this unavailable status and the non-predictive disclaimer; no placeholder result is emitted.
