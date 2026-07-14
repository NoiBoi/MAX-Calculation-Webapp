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
| Al excess [ 5.0] %         | Warnings appear inline beneath affected rows      |
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
- Invalid input preserves the last valid result but marks it stale and ties the message to the field.
- Enter commits and moves to the next logical field; Escape closes only temporary disclosures.
- Adding an occupant/precursor focuses its first editable field. Removing one focuses the nearest surviving row.
- Number inputs select useful text on keyboard focus, accept typed decimals, ignore wheel changes, and retain entered precision until explicit formatting.
- All applied defaults have a visible “default” label and editable source.
- Warnings never use color alone and never clear inputs.
- Copy/export actions provide non-modal status text announced by a live region.

## Implemented calculator layout

The `/workspace` route uses a compact sticky command bar, a target/route input panel, a wider weighing-results panel, and a full-width summary/trace region. At tablet width, inputs stack above results. The result table scrolls inside its panel; the page itself does not require horizontal scrolling.

Valid inputs calculate synchronously and locally with no Calculate button. Invalid input preserves the last valid output with a persistent `STALE` warning and reduced visual emphasis until valid input returns. Standard/advanced toggling preserves one recipe state. The implemented shortcuts are maintained in `KEYBOARD_SHORTCUTS.md`.

Built-in examples, mode, and edits are in memory and reset on refresh. Persistence, export, undo/redo, and layout customization remain deferred.

Chromium workflow runs on the development machine observed 44.0–55.6 ms p95 across 20 live numeric batch-mass edits. This is a local observation without a CI timing gate, not a portable performance guarantee. Automated viewport checks cover 1280×720, 1440×900, 820-pixel tablet width, and a 720-CSS-pixel effective viewport representing 200% zoom on a 1440-pixel display.

## Deferred layout presets

Initial presets are Simple Calculator, High-Entropy Analysis, and Route Comparison. Panel sizes have minimum/maximum bounds, optional panels can be hidden, and Reset Workspace restores the tested default in one action. Density can be compact or comfortable; compact is the laboratory default.

## Low-fidelity route comparison

Two calculation columns share a locked composition header. Differences in route, adjustments, precursor masses, residuals, total mass, and later cost/descriptors align row-by-row. “Duplicate to compare” creates the right side and focuses the route selector. Missing precursors show an explicit em dash and text label, not blank cells.

## Accessibility

- WCAG 2.2 AA contrast and focus appearance.
- Every input has a persistent accessible label and unit association.
- Tables use real headers, captions, and row warning descriptions.
- Status and warning regions use appropriate live-region politeness.
- Pointer targets are at least 24×24 CSS px, with larger primary controls.
- The workflow remains complete at 200% zoom and without color, hover, or precision dragging.

## Measurable usability acceptance criteria

1. A trained user loads a built-in mixed-site example, changes batch mass and Al excess, reviews warnings, and reaches the trace without navigation or a pointer-only step.
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
# Atomic-radius gate UX

Advanced mode contains a semantic Site descriptors panel. It shows explicit site occupants/vacancy, one dataset selector per site, definition/version/coverage/source status/lab status, resolved values, missing entries, aggregates when complete, and the visible non-predictive disclaimer. Flat formulas show the explicit-site requirement and a Configure sites action. No essential source or status information is tooltip-only, color-only, or hover-only.

# Remediated workspace requirements

The single-row responsive command bar, mode/layout distinction, blank/example behavior, and layout semantics are normative as documented in `NAVIGATION_MODE_MODEL.md`. Standard hides matrix/rank/exact residual/constraint/trace/dataset internals. Advanced exposes those capabilities without changing inputs. The weighing table never prints diagnostic codes in its status column.

Blocking and action-required issues expand by default; minor advisories and calculation details are collapsed. Information never uses warning color or count. Display formatting follows `SCIENTIFIC_FORMATTING.md`, including balance-increment mass precision and exact-value access. The per-site radius selector reports definition, version, coverage, source-verification status, and separate laboratory approval.
