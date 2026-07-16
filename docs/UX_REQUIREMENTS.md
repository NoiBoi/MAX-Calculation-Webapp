# UX Requirements

## Default workspace

The main workflow is a single desktop screen with a narrow top command bar and three bounded regions. No routine edit opens a new page or modal.

```text
+--------------------------------------------------------------------------------+
| MAX Stoich | Built-in example | Standard–Advanced | Reset | Commands |
+----------------------------+---------------------------------------------------+
| COMPOSITION + ROUTE        | WEIGHING TABLE                                    |
| Formula [TiNbAlN       ]   | Precursor | formula | purity | moles | FINAL MASS |
| Route   [NbN route     v]  | ...                                               |
| Batch   [10.000] g         |                                                   |
| Aluminum/formula [1.2]     | Warnings appear inline beneath affected rows      |
| [site summary disclosure]  |                                                   |
+----------------------------+---------------------------------------------------+
| SUMMARY: ideal → excess → purity → loss → rounded | total | residual | version |
+--------------------------------------------------------------------------------+
```

### Standard density

The left region contains conventional formula, route, target-mass, and common enabled adjustments. The right region gives at least 60% of usable width to the weighing table. Final weighing mass uses the largest numeric type and stays copyable without edit mode. The footer summary expands in place to show trace and assumptions.

### Advanced mode

Advanced mode adds in-place tabs/panels for sites, constraints, adjustment order, residuals, trace, descriptors, custom materials, uncertainty, and rounding. The primary weighing table remains visible. Expensive descriptor content loads only when opened.

### Tablet behavior

At narrower widths, composition/route becomes a collapsible top section above the table. The table may scroll horizontally with precursor and final-mass columns sticky. Essential controls never require drag; resize handles have keyboard alternatives.

## Interaction rules

- Valid changes update results immediately; formula paste may debounce no more than 150 ms.
- Save opens a compact modal with editable recipe name, current/new revision status, validation status, an optional multiline revision note, and explicit Cancel/Save action. Enter submits outside the multiline note; Escape cancels and returns focus to Save. Name-only edits are labeled as rename operations and do not create scientific history.
- Ordinary buttons use a CSS-only 80–120 ms hover/focus/pressed response, a visible keyboard focus ring, a one-pixel pressed movement, and clear selected, pending, and disabled states without layout shift.
- `Alt+ArrowUp` and `Alt+ArrowDown` move between enabled precursor formula inputs, select the destination text, stop at route boundaries, and announce the destination. Plain arrow keys retain normal caret behavior. Row reorder buttons preserve the complete row and focus the moved formula field.
- A compact `Normalize leading mixed-site ratios` checkbox sits beside the target input. It is off by default and never changes the entered text. When enabled for supported 211/312/413 syntax, an inline preview shows the entered ratio total, requested M multiplicity, percentage occupancy, per-formula coefficient, ideal-versus-feed meaning, selectable site-occupancy and expanded formulas, copy actions, generated explicit site model, and expandable exact fractions. Disabling it immediately restores ordinary formula grouping and prominently shows the entered formula without clearing or integer-scaling it.
- The common-adjustment grid places `Aluminum per formula` beside a dynamically labeled `Carbon per formula` or `Nitrogen per formula` control, followed by handling loss and balance increment. Both are positive direct molar coefficients used before solving. Aluminum help labels stoichiometric, below-ideal, or above-ideal state; percentages are explanatory only. Targets without Al hide the shortcut. Normalized target, expanded target, and adjusted intended-feed formulas remain visibly distinct.
- `Aluminum per formula` is authoritative user state, not a value repeatedly derived by React effects. Compatible Al-target edits preserve it while ideal helper text changes; unrelated route, X-feed, mode, layout, suggestion, save, and recovery operations cannot reset it.
- Invalid input preserves the last valid result but marks it stale and ties the message to the field.
- Enter commits and moves to the next logical field; Escape closes only temporary disclosures.
- Adding an occupant/precursor focuses its first editable field. Removing one focuses the nearest surviving row.
- Number inputs select useful text on keyboard focus, accept typed decimals, ignore wheel changes, and retain entered precision until explicit formatting.
- All applied defaults have a visible “default” label and editable source.
- Warnings never use color alone and never clear inputs.
- Copy/export actions provide non-modal status text announced by a live region.

## Implemented calculator layout

The `/workspace` route uses a compact sticky command bar, a target/route input panel, a wider weighing-results panel, and a full-width summary/trace region. At tablet width, inputs stack above results. The result table scrolls inside its panel; the page itself does not require horizontal scrolling.

The weighing table has one compact persisted sort selector for original route order, name, exact numeric final mass, numeric purity, and diagnostic severity in both directions. Sorting is stable presentation-only state: ties return to original route order and stable ID, engine/matrix/solver/snapshot order never changes, copy and user-facing CSV follow the visible order, and JSON scientific structures remain canonical.

Valid inputs calculate synchronously and locally with no Calculate button. Invalid input preserves the last valid output with a persistent `STALE` warning and reduced visual emphasis until valid input returns. Standard/advanced toggling preserves one recipe state. The implemented shortcuts are maintained in `KEYBOARD_SHORTCUTS.md`.

Built-in examples, mode, and edits are in memory and reset on refresh. Persistence, export, undo/redo, and layout customization remain deferred.

Chromium workflow runs on the development machine observed 44.0–55.6 ms p95 across 20 live numeric batch-mass edits. This is a local observation without a CI timing gate, not a portable performance guarantee. Automated viewport checks cover 1280×720, 1440×900, 820-pixel tablet width, and a 720-CSS-pixel effective viewport representing 200% zoom on a 1440-pixel display.

## Deferred layout presets

Initial presets are Simple Calculator, High-Entropy Analysis, and Route Comparison. Panel sizes have minimum/maximum bounds, optional panels can be hidden, and Reset Workspace restores the tested default in one action. Density can be compact or comfortable; compact is the laboratory default.

## Low-fidelity route comparison

Two calculation columns share a locked composition header. Differences in route, adjustments, precursor masses, residuals, total mass, and later cost/descriptors align row-by-row. “Duplicate to compare” creates the right side and focuses the route selector. Missing precursors show an explicit em dash and text label, not blank cells.

## Accessibility

- WCAG 2.2 AA contrast and focus appearance.
- Light, neutral Dark, black Midnight, and System use one persistent preference. The compact appearance control is keyboard and screen-reader accessible, System reacts to OS changes but never chooses Midnight, reduced motion suppresses transitions, and every dialog/panel/table inherits semantic theme tokens. Midnight relies on thin borders and typography rather than large filled contrast. Startup applies the root theme before primary UI paint; print always uses a larger-type light paper palette at 100% scale.
- Every input has a persistent accessible label and unit association.
- Tables use real headers, captions, and row warning descriptions.
- Status and warning regions use appropriate live-region politeness.
- Pointer targets are at least 24×24 CSS px, with larger primary controls.
- The workflow remains complete at 200% zoom and without color, hover, or precision dragging.

## Measurable usability acceptance criteria

1. A trained user loads a built-in mixed-site example, changes batch mass and the aluminum feed coefficient, reviews warnings, and reaches the trace without navigation or a pointer-only step.
2. A built-in example reaches final masses immediately after app open.
3. Every routine action is keyboard reachable in a logical order with no focus trap.
4. Standard/advanced toggling 20 times preserves byte-equivalent recipe state.
5. Refresh recovery is deferred; the UI explicitly states that state resets on refresh.
6. A warning caused by removing the only nitrogen precursor appears inline within one calculation cycle and leaves all inputs unchanged.
7. Copy/export acceptance is deferred with the export milestone.
8. At 1280×720, composition controls, at least five result rows, summary, and warnings are usable without full-page horizontal scroll.
9. Common changes render updated results within 100 ms p95 over 100 iterations on the agreed reference laptop.
10. At 200% zoom and keyboard-only operation, the routine workflow remains completable without obscured focused controls.

## Durable-workspace requirements

- Recovery restores the last valid committed workspace, mode, base revision, and unsaved indicator within the primary screen; invalid draft text cannot destroy that valid state.
- The recipe and route side panels are labeled, searchable, keyboard accessible, and non-modal. Archive is the routine cleanup action; permanent delete explains its cascade and requires confirmation.
- Taskbar utility layers toggle from their trigger, close when another opens, dismiss on outside pointer interaction or Escape, remain open for inside/nested-modal interaction, and return focus to their trigger only after Escape. Explicit close controls remain available.
- Saved/current, unsaved, stale, invalid, and historical states use visible text, not color alone. Save/copy/export results use an accessible live region.
- Undo/redo applies only to scientific working inputs, groups rapid edits, and is bounded. Panels, scrolling, historical viewing, and export actions are excluded.
- Historical revision contents cannot be edited in place. Recalculation is explicit and creates unsaved current-engine work.
- Copy, CSV, JSON, and print controls are disabled for stale or invalid current results. Print excludes navigation and form controls.
# Release-candidate workflow requirements

- Comparison uses one visibly locked target, scenario headings, independent controls, explicit `Not used` cells, semantic tables, and non-color difference text. At narrow/tablet widths scenarios stack and tables scroll within their region.
- Scenario add/remove/duplicate controls are keyboard operable; removal provides session undo. Status changes use live regions.
- Layout widths are bounded and critical target, precursor, batch, final-mass, warning, and status content cannot be hidden. Built-ins are immutable and 200% zoom must not require page-level horizontal scrolling.
- Restore/import always shows preview, type/version/count or scientific metadata, digest status, conflicts, and proposed action before writing. Replace and clear operations require explicit confirmation.
- Imported names and notes render as text only. No difference is hover-only or color-only.
- Saved-recipe notes use a searchable modal with category and exact-tag filters, a multiline plain-text editor, optional experiment date/operator, archive/delete actions, and clearly displayed general or revision attachment. Line breaks are preserved and arbitrary HTML is never rendered.
# Atomic-radius gate UX

Advanced mode contains a semantic Site descriptors panel. It shows explicit site occupants/vacancy, one dataset selector per site, definition/version/coverage/source status/lab status, resolved values, missing entries, aggregates when complete, and the visible non-predictive disclaimer. Flat formulas show the explicit-site requirement and a Configure sites action. No essential source or status information is tooltip-only, color-only, or hover-only.

# Remediated workspace requirements

The single-row responsive command bar, mode/layout distinction, blank/example behavior, and layout semantics are normative as documented in `NAVIGATION_MODE_MODEL.md`. Standard hides matrix/rank/exact residual/constraint/trace/dataset internals. Advanced exposes those capabilities without changing inputs. The weighing table never prints diagnostic codes in its status column.

# Precursor-suggestion and management requirements

- `Suggest precursors`, `Autofill best candidate`, `Add precursor`, and destructive-styled `Clear all` remain beside the precursor heading.
- Suggestion cards expose formulas, source type, validation status, exact solver status, introduced elements, explanation, and a separate Use action. They state that candidates are not experimental-success predictions.
- Autofill confirms replacement of a non-empty list, preserves registered IDs, and leaves purity blank unless the source record explicitly stores it.
- Clear all confirms the row count, preserves target/settings/adjustments, never deletes registry or saved-route data, returns focus to Suggest, and is one undo step.
- A target change never replaces the active route. An invalid old route offers Suggest replacements, Keep current route, and Clear precursors.
- Route origin (`manual`, `loaded`, or `suggestion-generated`) persists as workflow metadata but does not affect scientific arithmetic or canonical input digests.

Blocking and action-required issues expand by default; minor advisories and calculation details are collapsed. Information never uses warning color or count. Display formatting follows `SCIENTIFIC_FORMATTING.md`, including balance-increment mass precision and exact-value access. The per-site radius selector reports definition, version, coverage, source-verification status, and separate laboratory approval.
# Balance-side summaries

- `View weighing summary` is prominent beside the result export actions and is enabled only for a current valid result or an explicitly opened historical snapshot.
- Summary dialogs use semantic headings and tables, restore focus on close, close with Escape, remain usable at 200% zoom, and provide plain-text copy and clean print actions.
- Calculator and comparison summaries share the same formula, purity, molar-ratio, mass, status, warning, and provenance presentation. Advanced radius content is an explicit opt-in for screen, copy, and print.
- Print defaults to a compact 9–11 pt laboratory layout with 10–14 mm margins, repeated table headers, non-splitting rows, wrapped formulas, an operator signature line, and no navigation, form controls, empty states, raw matrices, or full traces. Two comparison scenarios use columns only when the page remains legible; larger sets flow as compact scenario sections.
- The Save button submits with Enter. Its adjacent arrow menu exposes `Save and start blank` and `Save and open copy`; all save actions are disabled while persistence is pending and Escape closes only when no save is pending.
- Comparison opens with no placeholder scenarios and exposes `Add saved recipes`, `Add current recipe`, and `Add blank scenario` actions.
- The saved-recipe picker supports search, checkbox multi-selection, select-all-visible, clear, duplicate indication, and current revision metadata. Recipes with different targets are allowed and remain independent.
- A successful comparison save is reported only after persistence readback. Failure leaves the working comparison unchanged and provides an actionable message.

## Verification workflow

- `Verify calculations` is a secondary audit action in the bottom Calculation details row beside the matching `Open calculation trace` control. It is absent from primary results actions and restores focus after close.
- Default values are concise; exact quantities and atomic-weight contributions are disclosed per precursor.
- Positive and negative differences are explicitly labeled `excess` and `deficiency`; precursor-only elements have a separate table.
- Invalid or stale current work has no usable verification. Comparison keeps valid and unavailable scenarios independently visible and supports one-scenario and all-scenario actions.
- Advanced weighing summary contains only status, target formula moles, largest residual, atomic-data version, and direction to the full view.
- Print removes controls and full trace while retaining compact conversion, reconciliation, assumptions, status, and the experimental-limitations disclaimer.

## Local settings interaction

- Settings are organized as Formula and feed defaults, Save behavior, Weighing-results display, and Data/reset on `/settings`.
- Scientific inputs use associated labels, positive-decimal validation, ideal-template helpers, and explicit precedence text.
- Standard and Advanced column checkboxes and labeled Up/Down buttons are keyboard accessible and have independent synthetic previews. Drag-and-drop is not required.
- Final mass cannot be hidden; Precursor or Formula must remain; Advanced must retain Status or Warning indicator. Invalid configurations are blocked with actionable text.
- Display settings affect the active calculator after navigation without recalculation. Feed defaults affect only newly created compatible calculations. Reset-all requires confirmation and never deletes scientific records or layouts.
- The route and weighing table remain usable at 200% zoom through wrapping controls and horizontal table scrolling.

## Print interaction

- Settings is directly visible in the calculator command bar. Print settings provide Letter/A4, orientation, 2/4/6-up packing, field toggles, formula/warning/note modes, verification detail, signatures, and page metadata with a synthetic preview.
- Recipe/scenario identity, adjusted feed, precursor identity, final mass, and total mass cannot be hidden.
- Print validates content, builds the shared model, opens `/print`, waits for fonts/layout, marks `data-print-ready="true"`, and invokes the browser dialog. Pop-up failure leaves the workspace unchanged.
- Dedicated print state excludes application controls and trace. Short 2/4/6 layouts use intrinsic-height cards, reserved header/footer bands, readable physical type, and no scaling in Letter/A4 portrait or landscape. Long recipes receive a full-width page region with a notice. The white-paper palette and weighing-results numeric font are invariant across Light, Dark, and Midnight.
- Screen credits read `Built by Matthew Deng · deng301@purdue.edu for inquiries · Built for the Anasori Lab`. Print uses the same compact credit in the reserved page footer rather than the fixed screen element.
# Startup, preview, and comparison requirements

- Retry must visibly enter a pending state and perform a new database initialization attempt.
- Destructive reset is never the first or only recovery action.
- The print preview uses the actual print page and responds to unsaved Settings edits immediately.
- Comparison baseline and common-batch controls are labeled presentation-only.
- Difference displays use signed text and labels in addition to color.
