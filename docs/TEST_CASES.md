# Scientific and Workflow Test Cases

## Reference-test policy

Each scientific reference fixture must contain versioned input, independent expected values with source/reviewer, allowed tolerance and rationale, expected warnings, and an immutable snapshot. Placeholder cases below are intentionally not given invented outputs. A case becomes a release gate only after independent review.

## Implemented formula/composition/molar-mass milestone

Vitest coverage now includes valid/invalid tokenization and parsing, nested fractional grouping, all requested MAX reference formulas, original-versus-canonical text, full-symbol validation independent of atomic data, source-positioned errors, partial diagnostics, deterministic serialization and exact round-trip composition, immutable vector arithmetic, total/relative normalization, exact/tolerance comparison, CIAAW-seed molar masses, contribution reconciliation, interval and user-specified data trace, missing data, fractions, and reproducibility.

Focused grouped-site tests cover `(TiVMoNbW1.2Ta0.4)4AlC3`, `(TiVMoTa0.5W1.5)4AlC2.7`, `(TiNb)2AlN`, `(Ti0.7Nb0.3)2AlN`, and `(TiVNb)3AlC2`; exact occupancy/coefficient sums; exact fractional renderings without a double multiplier; exact C `27/10`; ideal C3 versus intended/solver C2.7; ordinary-parser invariance; common X analysis/replacement; nitride labeling; mixed-C/N rejection; invalid coefficients; original-text preservation; template errors; adapter mode switching; and save/reopen preservation. `SITE-RATIO-001` and `SITE-RATIO-002` cover enabled/disabled displays, synchronized carbon edits, the retained ratio table, valid weighing, sort changes without recalculation, and UI sort restoration.

Presentation tests cover name, exact numeric mass, purity, diagnostic-severity, and original-order sorting in both directions, route-order tie breaking, result immutability, and copied-table visible order. Scientific canonical output is compared before and after every presentation sort.

The accepted molar-mass expectations use the checked-in CIAAW 2024 calculation values. Passing these unit tests validates this milestone only; it does not promote the precursor-route reference placeholders below.

## Implemented crystallographic site-composition milestone

Coverage includes 211/312/413 multiplicities, explicit Ti/Nb M mixing, explicit C/N X mixing, a nine-element non-equimolar M site, custom identifiers/labels/multiplicities, partial and full vacancy, strict validation, both explicit normalization modes and trace, above-one/negative/invalid inputs, duplicate rejection and explicit combination, immutability, deterministic site/occupant order and rendering, lock invariance, ideal/feed role separation, and absence of flat-formula site inference.

## Implemented deterministic balance-matrix milestone

All matrix references below are hand-audited exact decimal strings. They validate construction and structural rank only; no precursor masses or quantities are validated.

| Target / case | Row order | Column order | `A` rows / `b` | Rank / augmented rank | Expected diagnostics |
|---|---|---|---|---|---|
| Ti2AlN from Al, Ti, TiN | N, Al, Ti | al, ti, tin | `[0,0,1]`; `[1,0,0]`; `[0,1,1]` / `[1,1,2]` | 3 / 3 | none |
| Ti3AlC2 from Al, Ti, TiC | C, Al, Ti | al, ti, tic | exact formula coefficients / `[2,1,3]` | 3 / 3 | none |
| Ti4AlN3 site target | N, Al, Ti | stable precursor ID | exact site conversion / `[3,1,4]` | reference-set dependent | none with elemental sources |
| (Ti0.5Nb0.5)2AlN | N, Al, Ti, Nb | stable precursor ID | elemental-source columns / `[1,1,1,1]` | 4 / 4 with four elemental sources | no site inference |
| Ti3Al(C0.5N0.5)2 | C, N, Al, Ti | stable precursor ID | elemental-source columns / `[1,1,1,3]` | 4 / 4 with four elemental sources | no site inference |
| Missing N or Al source | atomic-number order, missing row retained | stable precursor ID | missing row is all `0` | augmented rank exceeds rank | blocking `MISSING_REQUIRED_ELEMENT_SOURCE`, `RANK_INCONSISTENT` |
| Oxygen-bearing precursor, oxygen-free target | target elements only; O separate | stable precursor ID | O appears only in precursor-only matrix | target-only rank | warning `PRECURSOR_ONLY_ELEMENT` |
| Duplicate/proportional/zero columns | target elements only | stable precursor ID | exact input coefficients | exact rational rank | non-blocking column diagnostics |

Coverage also includes explicit ordering ties, formula/composition agreement and mismatch, duplicate IDs, empty and fully vacant targets, empty lists, zero precursors, unsupported versions, square/under/over dimension labels, exact versus arbitrarily near dependence, 34-digit decimal coefficients, map/array invariants, input/output immutability, equivalent-input byte reproducibility, repeated calls, and standalone analysis parity.

## Implemented constrained-solver milestone

These fixtures validate formula-unit-relative quantities only. `Reviewer/source` identifies arithmetic review, not experimental route validation.

| Fixture | Constraints / objective | Expected quantities (`mol precursor / mol target formula`) | Status / residual | Expected diagnostics | Reviewer/source |
|---|---|---|---|---|---|
| Diagonal Ti₂AlN from Ti, Al, N | none / deterministic feasible | Ti 2, Al 1, N 1 | `exact-unique`; all zero | none | Hand-audited from formula coefficients; provisional route |
| Ti₃AlC₂ from Ti, Al, C | none / deterministic feasible | Ti 3, Al 1, C 2 | `exact-unique`; all zero | none | Hand-audited from formula coefficients; provisional route |
| Ti₄AlN₃ from Ti, Al, N | none / deterministic feasible | Ti 4, Al 1, N 3 | `exact-unique`; all zero | none | Hand-audited from formula coefficients; provisional route |
| `(Ti0.5Nb0.5)2AlN` elemental sources | none / deterministic feasible | Ti 1, Nb 1, Al 1, N 1 | `exact-unique`; all zero | no site inference | Hand-audited flat vector; provisional route |
| `Ti3Al(C0.5N0.5)2` elemental sources | none / deterministic feasible | Ti 3, Al 1, C 1, N 1 | `exact-unique`; all zero | no site inference | Hand-audited flat vector; provisional route |
| Two identical Ti columns | none / deterministic feasible | stable-column lexicographic vertex | `exact-multiple`; zero | duplicate-column warning inherited | Hand-audited linear system |
| Ti and Ti₂ for Ti₂ target | none / minimize total | Ti 0, Ti₂ 1 | `exact-multiple`; zero | none | Hand-audited linear system |
| Identical Ti columns, prefer `a` | prefer `a`, then `b` | a 1, b 0 | `exact-multiple`; zero | none | Hand-audited objective behavior |
| Fixed TiN above TiN target | TiN fixed 2 | none | `infeasible-constraints` | fixed contribution exceeds requirement | Hand-audited bound contradiction |
| Two Ti sources, each maximum 0.4 | upper bounds | none | `infeasible-constraints` | collective maximum supply insufficient | Hand-audited bound sum |
| Ti sources in 2:1 ratio for Ti₃ | exact ratio | 2 and 1 | `exact-unique`; zero | none | Hand-audited ratio equation |
| Oxygen-bearing TiO₂ for Ti target | none | TiO₂ 1 | `exact-unique`; zero target residual | introduced O total 2 warning | Hand-audited elemental product |
| Algebraic solution requiring negative quantity | none | none accepted | `infeasible-nonnegative` | negative solution required | Hand-audited 2 × 2 equations |

Additional deterministic tests cover compatible/incompatible fixed values, lower/upper/equal bounds, ratio cycles, ratio-plus-fixed/bounds, objective ordering, unsupported cardinality objectives, exact `1/3` output, tolerance boundaries, independent corruption detection, schema/reference errors, canonical constraint reordering, immutable input/output, stable trace, candidate-limit termination, and 4 × 5, 9 × 12, and 15 × 20 representative systems. No fixture validates laboratory phase formation or weighing masses.

Exact-scalar boundary regressions verify `1/3`, `2/3`, and `1/7` as reduced rational objects from solver through batch scaling. They assert the separately labeled 34-significant-digit decimal approximation and its 50-digit/round-half-even metadata, exact molar-mass multiplication, purity division, retained-loss division, final increment rounding, realized elemental totals, normalized realized composition, and trace conversion record.

## Implemented batch-calculation milestone

The batch suite covers all three explicit mass bases; required/invalid recovered yield; small, ordinary, and large decimal masses; pre-solver elemental excess and deficiency; post-solver precursor changes without re-solving; data-derived and provenance-bearing override molar masses; formula/composition agreement; purity identity and correction; global/scoped/sequential retained losses; all four rounding modes and tie behavior; minimum-mass/material-rounding warnings; positive and negative realized residuals; deterministic stage/order/ID resolution; canonical reproducibility; immutability; independent verification; and representative MAX, mixed-composition, and nine-element cases.

Arithmetic fixtures using synthetic molar masses are explicitly labeled test-only. MAX reference cases use the checked-in atomic-weight dataset but remain provisional calculation fixtures, not validated synthesis routes. The next scientific gate requires independent expected-value review, source/reviewer metadata, and laboratory-owner sign-off.

Synchronous local observations on the development machine (Vitest, no threshold) were 1.5–1.7 ms for 4 × 5, 9.5–12.9 ms for 9 × 12, and 608.3–608.9 ms for 15 × 20, each with several adjustments. These are diagnostic observations, not portable acceptance limits.

| ID | Case | Primary assertion | Reference status |
|---|---|---|---|
| CHEM-001 | TiNbAlN with NbN precursor route | Exact elemental balance and final masses | Needs route and approved values |
| CHEM-002 | Alternative TiNbAlN route | Route-dependent solution, same target balance | Needs route definition |
| CHEM-003 | Ti3AlCN | Mixed C/N X-site model and exact balance matrix | Matrix implemented; masses pending |
| CHEM-004 | Ti4AlN3 | 413 conversion and exact balance matrix | Matrix implemented; masses pending |
| CHEM-005 | Nb2AlN | 211 multiplicities | Needs approved values |
| CHEM-006 | Stoichiometric Ti3AlC2 | Formula, molar mass, and hand-audited matrix | Matrix implemented; quantities pending |
| CHEM-007 | Excess-metal Ti3AlC2 | Ordered excess and realized residual | Needs excess basis |
| CHEM-008 | Nine-metal high-entropy M site | Occupancy implemented; entropy remains pending | Site portion implemented |
| CHEM-009 | Mixed C/N X site | Fractional occupants and formula rendering | Implemented |
| CHEM-010 | KF:LiF:NaF 0.59:0.29:0.12 by mass | Mass-ratio lock; ratios sum to one | Needs batch basis |
| CHEM-011 | Precursor purity correction | `mass/purityFraction` and trace | Implemented; provisional arithmetic fixture |
| CHEM-012 | Transfer-loss correction | Retained-fraction division, scope, order, expected retained mass | Implemented; provisional arithmetic fixture |
| CHEM-013 | Weighing-rounding effects | Exact rounded masses, realized composition, residual warning | Implemented; policy values remain user inputs |
| CHEM-014 | Structurally inconsistent precursor system | Missing element retained with specific diagnostics | Matrix and solver classification implemented |
| CHEM-015 | Underdetermined precursor system | Exact feasible vertices and deterministic objectives | Solver implemented; experimental preference unvalidated |
| CHEM-016 | Partially locked system | Fixed amount honored or actionable infeasibility | Formula-unit solver implemented |

## Mandatory parser tests

Element capitalization, multi-digit and decimal subscripts, nested groups, mixed-site notation after approval, malformed symbols, unmatched delimiters, zero/negative counts, unsupported charge/isotope notation, whitespace policy, and canonical round-trip.

## Mandatory property/invariant tests

- Element counts are independent of input map ordering.
- Molar mass is the dot product of counts and versioned weights.
- Exact solver output reconstructs the requirement within tolerance.
- No successful result contains a negative precursor quantity.
- Purity 100% is identity; lower valid purity cannot reduce required weighing mass.
- Zero adjustment is identity.
- Replaying ordered adjustments is deterministic.
- Final rounded masses reproduce the reported realized composition and residual.
- Parsing a canonical serialization reproduces the same elemental composition exactly; original text is preserved separately.
- Matrix dimensions agree with row/column metadata and canonical index maps.
- Exact matrix rank never exceeds `min(rows, columns)` and augmented rank exceeds it by at most one.
- Scientifically equivalent matrix inputs produce byte-identical canonical scientific representations.
- Every successful solver result contains one exact non-negative quantity per precursor and independently verified zero residual.
- Every fixed, bound, and ratio constraint passes its separate exact verification entry.
- Reordered equivalent solver constraints produce byte-identical canonical solver output.

## Playwright workflow cases

| ID | Workflow | Pass condition |
|---|---|---|
| UX-001 | Routine formula workflow | Ti₃AlC₂ preset and batch edit update masses without Calculate |
| UX-002 | Explicit mixed site | Ti/Nb site fractions remain visible and mode-safe |
| UX-003 | Set aluminum per formula | Direct adjusted feed, mass, solver requirement, and coefficient trace update |
| UX-004 | Purity correction | Gross mass increases and impurity warning appears |
| UX-005 | Invalid route | Last valid output is unmistakably stale and recovers automatically |
| UX-006 | Missing N source | Specific matrix diagnostic appears; current masses are blocked |
| UX-007 | Keyboard workflow | Alt focus keys, common edit, result focus, and trace work without pointer |
| UX-008 | Twenty mode toggles | Target and entered precision remain unchanged |
| UX-009 | Coarse rounding | Material rounding-shift warning is visible |
| UX-010 | Tablet viewport | Inputs/table remain usable without page horizontal overflow |

The structured registry in `lib/workspace/reference-cases.ts` covers all 20 requested scientific categories. Every entry records semantic role, site model, route/constraints, basis, adjustments, data version, expected result fields, warnings, tolerance, source, reviewer status, and validation class. Missing independent values remain explicitly pending rather than invented. No entry is laboratory-approved.

## Quality commands

Every implementation change runs type checking, linting, unit tests, and relevant Playwright workflows. Calculation-defect fixes begin with a failing regression test. Performance tests use a fixed dataset, browser, warm-up, iteration count, and reference-machine record.

## Persistence and export fixtures

`tests/unit/persistence.test.ts` covers canonical equivalence/difference, SHA-256 stability, ordered/idempotent migration, transactional revision/snapshot creation, rollback after injected interruption, optimistic conflicts, immutable duplication, cascade deletion, refresh recovery/reopen, route revision preservation, tamper diagnostics, legacy database upgrade, grouped/bounded undo, and CSV/JSON/tabular export. Parameterized `1/3`, `2/3`, and `1/7` fixtures confirm exact rational objects and separately labeled approximations survive export after mass, purity, loss, rounding, and realized-composition processing.

Browser cases cover save/refresh/revision history, exact historical view, undo/redo, route reuse, clipboard, CSV/JSON filenames, print action, and stale export blocking. Migration and concurrency correctness are tested at repository level where failures can be injected deterministically.
# Release-candidate fixtures

Comparison fixtures cover locked target synchronization, independent scenarios, duplication/removal/undo, invalid-route isolation, canonical precursor alignment, same-name/different-composition separation, exact rational flow, deterministic summaries, persistence, and historical preservation. Layout fixtures cover presets, immutable built-ins, width/required-column bounds, default selection, and scientific-state isolation.

Backup/import fixtures cover empty and populated manifests, digest verification, preview without writes, replace/merge, identical/divergent conflict policy, connected identity remapping, rollback, future/oversized/malformed input, missing references/metadata, invalid rationals, tampered structured output, and historical calculation import. Manual laboratory cases and pass criteria are in `LAB_ACCEPTANCE_PLAN.md`.
# Atomic-radius gate fixtures

Radius-gate fixtures use explicitly labeled synthetic schema-contract values only; they are not scientific reference radii. They cover required metadata, units, positive values, real and unique symbols, digest verification, immutable output, approval state, empty-registry behavior, no-site behavior, explicit-site preservation, backup content, and imported-trust downgrade. Mean/range/variance/standard-deviation/mismatch fixtures are intentionally absent until a reviewed dataset and independent expected values are approved.

# Remediation fixtures

The superseding suite verifies blank start/example copies, top-bar demotion, meaningful modes/layouts, warning hierarchy/merging, human formatting with lossless exports, all-118 CIAAW coverage and C/Al/Ti/V/Zr/Nb/Mo/Hf/Ta/W/Re spot checks, deterministic importers/digests, and Teatum/Cordero/Rahm source spot checks for Ti/V/Nb/Zr/Hf/Ta/W/Al/C/N.

Descriptor fixtures cover mixed Ti/V/Nb, mixed C/N, single-element zero mismatch, nine-element support, vacancy normalization, missing-value blocking, provenance-bearing overrides, definition separation, mean/range/weighted standard deviation/delta, multiplicity invariance, and flat-formula non-inference. Persistence fixtures verify per-site dataset/resolved-value/result snapshots and imported-trust downgrade. Playwright workflows are `UX-REMEDIATION-001` through `007` plus the updated radius workflow.

# Precursor-suggestion fixtures

Engine fixtures cover Ti3AlC2, Ti4AlN3, Nb2AlN, mixed Ti/Nb M-site coverage, missing registry elements, negative-quantity rejection, saved lab-approved priority, deterministic ordering, candidate limits, and non-mutation of inputs. Candidate display is limited without weakening exact verification.

Playwright cases `PRECURSOR-SUGGEST-001` through `004` cover panel/status visibility, purity-safe autofill and recalculation, confirmed clear-all plus exact one-step restoration, target-change preservation and replacement offer, and cancellation of non-empty-route replacement. Persistence tests verify route origin is excluded from canonical arithmetic and saved route revisions retain their target for exact matching.

# Direct aluminum-feed fixtures

Engine and adapter fixtures cover coefficients 1, 1.2, 2.2, and 0.9; direct matrix requirements; coupled AlN/TiAl supply; combined Al/C feed coefficients; normalized calculation scaling; zero, negative, malformed, NaN, and infinite rejection; no-Al targets; explicit Al1.2 target parsing; coefficient trace; canonical input differences; undo/redo; and schema-5 migration of 20% to 1.2 and 120% to 2.2. The migration fixture verifies editable recovery is converted while the stored historical snapshot remains byte-equivalent. Playwright `AL-FEED-001` verifies live formula/mass updates and save/reopen preservation.
# Summary and comparison workspace cases

- `SUMMARY-001`: open a valid calculation summary, verify adjusted feed, visible precursor order, masses, total, copy text, print controls, and focus restoration.
- `SUMMARY-002`: show valid and invalid comparison scenarios together; invalid scenarios state the human-readable reason and expose no usable masses.
- `COMPARE-EMPTY-001`: a fresh comparison has zero scenarios and all three explicit add actions.
- `COMPARE-MULTISELECT-001`: multiple compatible current recipe revisions are added atomically with saved names and source IDs; an already-added revision is not silently duplicated.
- `COMPARE-GENERAL-001`: a mixed-target selection imports in one operation; every scenario retains its own target and produces the same calculation state and result it produces in Calculator.
- `COMPARE-SAVE-001`: save, leave, reopen, and verify name, scenario order, source IDs, shared target, layout, metrics, and historical results.

# Calculator workflow and recipe-note cases

- `SAVE-UI-001`: editable initial name and revision note, scientific revision increment, metadata-only rename without snapshot creation, and revision-history display. Repository rollback fixtures verify failed transactions leave the unsaved state and user text available for retry.
- `AL-RESET-001`: direct aluminum feed survives carbon/precursor edits, autofill, mode/layout changes, save/reopen, and refresh recovery; helper tests cover compatible Al-target changes and intentional removal for no-Al targets.
- `PRECURSOR-NAV-001`: Alt-arrow navigation selects adjacent formula inputs at both boundaries, while reorder buttons preserve row identity/metadata and move focus with the row.
- `SUMMARY-MOLAR-001`: calculator and comparison summaries derive final intended `mol precursor / mol target formula` values from engine results, retain exact rational detail, and include quantities in copy and print output.
- `COMPARE-CONSISTENCY-001`: comparison scenarios use the calculator result-table vocabulary and expose the same advanced solver/radius hierarchy without coupling scenario validity.
- `SUMMARY-RADIUS-001`: ordinary summaries omit radius information; advanced summaries show only configured explicit-site descriptors and copy their provenance.
- `SAVE-ACTIONS-001`: every post-save action waits for persistence; blank clears identity/science while copy preserves science and reports that structured notes were not copied.
- `PRINT-CALCULATOR-001`: print media exposes a dense calculation sheet with table, versions, and signature while hiding application chrome.
- `PRINT-COMPARISON-001`: a two-scenario comparison renders a dedicated two-column print grid and overview rather than printing the interactive workspace.
- `PANEL-DISMISS-001` and `DEFAULT-ROUTE-001`: outside/Escape dismissal with focus restoration, calculator landing at `/`, and labeled demo navigation at `/demo`.
- `NOTES-001`: multiline category/tag/date/revision-linked records remain searchable after reopen. Repository fixtures additionally cover edit, archive, deletion, body/title/category/tag search, snapshot immutability, recipe deletion cascade, backup/restore, conflict remapping, safe text storage, and exclusion from ordinary weighing export.

## Calculation verification fixtures

Unit coverage proves engine-sourced mole-to-mass, purity, sequential loss, final rounding, reverse realized moles, signed elemental reconciliation, precursor-only separation, atomic contribution totals, override provenance, exact JSON preservation, historical fallback, assumption classification, and 5/50/500 g linear pre-round scaling.

- `VERIFY-001`: audit precursor conversion, provenance, reverse moles, and exact disclosure.
- `VERIFY-002`: inspect required/supplied values, signed relative residuals, and largest residual after rounding.
- `VERIFY-003`: show purity and loss equations separately and reverse from final mass.
- `VERIFY-004`: confirm 5, 50, and 500 g inputs scale intended moles and pre-round masses by 1, 10, and 100.
- `VERIFY-005`: verify two comparison scenarios, invalidate one, and retain the other's verification.
- `VERIFY-006`: generate compact normal Letter and A4 verification PDFs.

## Local user-settings fixtures

Repository tests cover defaults, save/reopen, independent 211/312/413 values, display independence/order, required-field validation, future-schema rejection, reset isolation, backup inclusion, verified restore, and non-mutation of canonical scientific input. Migration coverage verifies schema 8 initialization without rewriting prior records.

- `SETTINGS-001`: persist feed, save-action, and Standard column changes across refresh.
- `SETTINGS-002`: apply Al and template-specific carbon defaults only to new pure-carbide templates; preserve explicit examples, nitrides, and mixed C/N targets.
- `SETTINGS-003`: use the configured action for the main Save/Enter while retaining all three split-menu actions.
- `SETTINGS-004`: apply Standard visibility independently without changing calculation availability.
- `SETTINGS-005`: show selected elemental radius/provenance for Ti, `Not applicable` for TiC, and preserve separate Standard settings.
- `SETTINGS-006`: reset display/all settings while preserving recipes, routes, snapshots, notes, and layouts.

## Precursor coverage, verification placement, and print fixtures

- `PRECURSOR-COVERAGE-001`: apply an eleven-element direct route containing Sc, Cr, Mn, Fe, Co, Ni, and Zr; verify full coverage, calculation, and undo.
- Engine regressions cover Sc/Y, transition and refractory metals, Ru/Rh/Pd, Re/Os/Ir/Pt, Si/Ge/B, supported lanthanides, explicit N/O policy, unavailable Tc mass, registered precedence, duplicate prevention, determinism, and search-limit bypass.
- `VERIFY-PLACEMENT-001`: prove the top area has no verification action, bottom Calculation details pairs verification with trace, and close restores focus.
- `PRINT-SETTINGS-001`: persist A4, landscape, four-up, field toggles, and required-field protection across refresh and backup/restore.
- `PRINT-{LETTER,A4}-{PORTRAIT,LANDSCAPE}-{2,4,6}-UP`: assert one page, intrinsic-height cards, readable masses, no clipping, no card/reserved-region overlap, no internal page break, no transform, a valid PDF, and no print-root controls at 100% scale.
- `PRINT-LONG-001`: promote a long-name, long-formula, warning-bearing fourteen-row recipe with additional columns to a full-width page region, keep it inside the printable page, report fallback, then resume configured packing without reordering.
- `PRINT-THEME-001`: assert identical white, opaque, shadowless output with dark text/rules in Light, Dark, and Midnight and exact reuse of the weighing-result monospace/tabular-numeral typography.
- `PRINT-CREDIT-001`: assert one non-overlapping brand plus the creator, inquiry email, and Anasori Lab credit in the reserved page footer.
# Appearance fixtures

- `THEME-001`: Dark persists through refresh and calculator, comparison, Settings, and tutorial routes; the pre-hydration root already reports Dark.
- `THEME-002`: System resolves and reacts to emulated Light/Dark preferences while explicit Light/Dark ignore OS changes and preserve their persisted value.
- `THEME-003`: compact control, More panel, Save dialog, trace, and Settings remain themed and operable.
- `THEME-004`: theme changes preserve displayed scientific values, export availability, and unsaved/saved semantics.
- `THEME-005`: printing from Dark uses a white dedicated page while the application remains Dark.
- Appearance migration, repository reopen, backup/restore, resolution, and invalid preference behavior have focused unit coverage.
- `THEME-PALETTE-001`: revised Dark page, panel, and input surfaces are neutral charcoal without blue-dominant neutral values.
- `MIDNIGHT-001`: explicit Midnight uses black/near-black surfaces, lower structural contrast, no startup flash, persistence, readable scientific values, and a serious/critical accessibility audit.
- `THEME-SWITCH-001`: all four choices are distinct, System resolves only to Light/Dark, and weighing values remain unchanged.
- `PRINT-TEXT-001`, `PRINT-4-UP-TEXT-001`, and `PRINT-6-UP-TEXT-001`: title, row, final-mass, and total font floors are measured at 100%; formulas do not clip and long recipes receive a full page without transform scaling.
- Creator credit is present with the correct `mailto:` link and Anasori Lab line in Light, Dark, and Midnight. The fixed site instance is hidden in print media and the dedicated print document supplies an in-flow footer credit.
- `BRAND-001`: the transparent mark appears in site chrome, remains unchanged in Light, inverts in Dark/Midnight, and the opaque supplied variant is exposed through the browser-tab icon metadata. Print removes the dark-theme inversion.
# Focused print, comparison, and recovery regressions

- Live preview renders the shared `PrintDocument` with the current draft settings.
- Partial four- and six-up pages contain exactly the supplied entries; no placeholders are synthesized.
- Dense entries account for visible columns and receive a full-page fallback.
- Baseline-relative signed differences and common-batch recalculation preserve original scenario inputs.
- Retry initialization can be invoked repeatedly after closing the database.
- Corrupt recovery is classified separately, safe-open skips it without deletion, repair removes malformed transient state, and recovery reset preserves saved tables.
