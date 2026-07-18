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

# Cloud accounts milestone

Supabase authentication is an optional identity layer. Signed-out operation retains all local calculator functionality. Invitation-only is the production default; provider configuration enforces signup policy while the application flag controls the visible form. Login, confirmation, reset, session refresh, account status, display-name management, and sign-out use provider APIs and cookie-backed sessions.

Cloud identity and local scientific data are separate. Signing in does not upload or assign IndexedDB records, and signing out does not delete or hide them. The initial Postgres schema contains only private profiles and lab/membership authorization foundations with RLS. Recipe synchronization, cross-device recovery, cloud backup, lab recipe sharing, realtime, and conflict resolution are explicitly outside this milestone.

# Account cloud-storage milestone

Milestone 2 adds private, account-scoped cloud copies of recipes and every immutable revision/snapshot, structured recipe notes, comparisons, user settings, and lightweight device metadata. Milestone 3 keeps local IndexedDB as the working store and adds a durable transactional outbox plus automatic foreground synchronization. `Sync now` remains available and invokes the same validated pull/merge/upload engine.

Anonymous, User A, and User B data are physically separated into distinct local databases. Signing in never uploads anonymous work. A first-upload review lists local records, validation failures, and likely duplicates, and requires explicit record selection and confirmation. Users may instead keep data local only or defer the decision.

Synchronization downloads first, validates each remote record independently, merges against the last synchronized base, then uploads pending local changes with optimistic versions. Deterministic conflicts are saved for recipe metadata, notes, comparisons, settings, deletion/edit races, or immutable revision identity disagreement. Unsupported or future remote records are quarantined without blocking unrelated valid records. Conflict resolution offers keep local, keep cloud, and keep both where duplication preserves scientific history.

Cloud unavailability never blocks calculation or local save. Offline changes remain pending and retry with bounded jitter after reconnect while a signed-in page is open. Startup, committed local mutations, reconnect, throttled focus, and account-filtered Realtime hints schedule incremental passes. Realtime never supplies canonical local data. Signing out stops the coordinator and preserves account cache by default. A separately confirmed cache-removal action removes only fully synchronized cloud-downloaded copies and never removes anonymous, pending, local-only, conflicted, or failed work.

Routes, precursor libraries, lab sharing, realtime collaboration, closed-tab service-worker synchronization, merge-by-last-write-wins, and destructive cleanup of unsynchronized records remain out of scope.

# Calculator workflow and recipe records (schema 7)

`/` opens the production calculator directly; `/workspace` remains supported and `/demo` contains the secondary feature tutorial/development reference. The compact Save dialog separates recipe metadata from scientific history: editable naming alone renames the recipe pointer, while changed canonical scientific input creates the next immutable revision and optional concise revision note. No saved state is reported before the repository transaction succeeds.

The direct `Aluminum per formula` value has one authoritative workspace field. Compatible Al-bearing target edits preserve it while independently updating ideal-reference help; precursor, carbon, mode, layout, suggestion, and recovery actions cannot derive over it. A target without Al removes the shortcut, and loading/resetting a different record intentionally supplies that record's value.

Normal and comparison weighing summaries report the final intended precursor molar quantity in `mol precursor / mol target formula` and final weighing mass. Exact solver rationals remain exact; compact decimals are presentation only, and a post-solver precursor adjustment exposes both solver and final intended quantities.

Advanced weighing summaries optionally add per-explicit-site atomic-radius provenance and descriptors. Ordinary summaries omit this material. The advanced view reports dataset definition/version, vacancy, mean/minimum/maximum/range/weighted standard deviation/mismatch, resolved occupants, missing values, and overrides without inferring sites or renormalizing around missing values.

Recipe save offers `Save`, `Save and start blank`, and `Save and open copy`. Post-save navigation occurs only after persistence readback. An opened copy retains the complete scientific setup and radius configuration but has a new unsaved identity; structured experimental notes and revision notes are not copied.

Saved recipes have separate structured notes with stable IDs, category, title, multiline plain-text body, tags, timestamps, optional experiment date/operator, optional revision link, and archive state. Notes are locally searchable by recipe/formula and note content and filterable by category/tag. Adding or editing a note never rewrites a scientific revision or snapshot. Full backups include notes; ordinary weighing exports exclude them by default.

## Calculation verification

Every current valid result, and every explicitly opened valid historical snapshot, offers `Verify calculations` in the bottom Calculation details row beside `Open calculation trace`, after results and summary content. It audits target formula moles, exact solver quantity, adjusted precursor moles, engine molar mass and provenance, purity/loss stages, rounding, reverse-calculated realized moles, formula reconciliation, and signed elemental residuals. Comparison uses the same bottom paired controls; an invalid scenario never hides a valid one.

Labels begin with `Arithmetic verification` and are limited to exact, within weighing tolerance, minor rounding differences, review required, or unavailable. They never mean experimental validation. Feed, purity, yield, loss, override, balance, and rounding values are classified as user-entered, route-default, system-default, or dataset-derived assumptions. Measured outcomes remain separate notes.

## Local user settings

The dedicated `/settings` route owns one versioned local user-settings record. New compatible calculations start from Al `1` and carbide template coefficients 211=`1`, 312=`2`, and 413=`3` unless changed locally. Precedence is historical/saved recipe, explicit saved route or built-in example, user default, then system fallback. Defaults never rewrite active work or immutable snapshots; mixed C/N targets and nitrides do not receive a simplified carbon default.

Screen presentation supports laptop, 1080p, 2K, ultrawide, and 4K viewport classes through progressive semantic sizing tokens and bounded content widths. Large displays increase readable typography, controls, tables, and meaningful parallel layout without changing scientific state or using transformed scaling. Calculator, comparison, and Settings navigation share one themed brand component.

The default save action is `Save`; users may select `Save and start blank` or `Save and open copy` while retaining all split-menu choices. Standard and Advanced weighing columns have independent visibility/order. Final mass is mandatory, at least one identity field is mandatory, and Advanced retains status or warnings. Elemental-radius cells use one selected source-verified dataset, show units and definition, never average compounds, and remain non-blocking when unavailable.

## Precursor fallback and printing

Suggestion evaluates registered routes and a deterministic direct elemental identity route for eligible ordinary solid elements with usable atomic-weight values. Eligibility distinguishes `allowed`, `requires-explicit-registration`, and `disallowed`. N, O, halogens, noble gases, misleading physical forms, highly radioactive/synthetic elements, and records without a calculation mass never receive an invented elemental powder. Generic candidates infer no purity, supplier, lot, particle size, stock, hazards, or laboratory suitability.

Print settings are local presentation state, not recipe input. Required fields retain recipe identity, adjusted feed, precursor identity, final mass, and total. Letter and A4 support 2/4/6-up packing at 100% scale. Calculator results use detailed one-up; comparison and selected-library recipes preserve visible order. Invalid scenarios show identity and blocking reason without masses. Oversized recipes receive a full page and notice.
# Appearance system

MAX Stoich provides Light, neutral Dark, black Midnight, and System appearance modes without changing chemistry, saved recipes, exports, or snapshots. A compact global control toggles Light/Dark and opens the four-choice menu; Settings exposes the same authoritative preference. System follows live operating-system changes and never resolves to Midnight. Semantic background, border, text, accent, status, focus, shadow, and overlay tokens preserve the teal identity and warning hierarchy. Midnight uses line-oriented near-black structure with minimal shadows. Print remains a larger-type white-paper presentation regardless of application appearance.
# Reliability and analysis additions

Print Settings provides a live, production-accurate page preview. Route comparison supports a selectable baseline, summary metrics, signed differences, aligned precursor matrices, original or common-batch display, and copy/CSV output. Startup failures use a dedicated recovery surface with real Retry and non-destructive safe-open, repair, export, and recovery-reset actions.

# Controlled private lab libraries

Lab libraries are opt-in shared repositories for signed-in accounts. Admins manage membership, invitations, settings, audit export, and retention; members may publish immutable personal recipe revisions and archive entries they created; viewers read, copy, and compare. Publication never happens from joining or syncing. Each lab version preserves scientific input, snapshot, engine/data provenance, formulas, verification status, warnings, publisher, timestamp, digest, and only explicitly selected note snapshots. Lab content is read-only offline, and personal copies are independent records.
