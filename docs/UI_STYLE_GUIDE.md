# MAXCalc UI style guide

MAXCalc is a compact scientific application. Prefer clear hierarchy, alignment, borders, and restrained color over decorative cards, shadows, gradients, or oversized headings.

## Hierarchy and typography

- The application header owns the workspace title (`--font-page-title`). Do not repeat it as a large page heading.
- Major workflow sections use `--font-section-heading`; panel or subsection headings use `--font-subsection-heading`.
- Body text, controls, tables, and supporting text use the shared `--font-*` tokens in `app/globals.css`.
- Use regular weight for content, semibold for labels/buttons/table headers, and stronger emphasis only for workspace or major section titles.
- Use the inherited UI font. Reserve monospace for hashes, code, identifiers, and exact machine-readable strings—not ordinary numbers.
- Use sentence case. Preserve scientific acronyms such as XRD, EMI, COD, CIF, CSV, SVG, and PNG.

## Controls and actions

- Standard controls use `--control-height`; dense toolbar controls use `--control-height-compact`.
- Use `.ui-button` for ordinary actions, `.ui-button-primary` for the single main commit/forward action in a local task, `.ui-button-compact` for dense toolbars, and `.ui-button-destructive` for deletion.
- Prefer concise verb-object labels: `Import measurement`, `Save analysis`, `Export figure`, `Fit peaks`, `Refine lattice`, `Reset view`.
- `Save` persists a record, `Import` brings external data into MAXCalc, `Export` creates an external file, `Open` reopens a saved record, `Use` selects an entity for analysis, `Remove` drops a temporary item, and `Delete` destroys persisted data.
- Keep high-level commands in the application header or workspace command bar. Do not give adjacent actions equal primary emphasis.

## Fields, spacing, and surfaces

- Default field structure is label, control, then supporting or validation text. Use inline fields only for deliberately dense scientific control rows.
- Reuse the spacing variables (`--space-*`, `--panel-padding`, and `--layout-gap`) instead of one-off margins.
- Pages have no border. Sections usually use spacing or a divider. Panels use a subtle border and `--radius-panel`; nested groups should generally use a divider or `--radius-control`, not another elevated card.
- Shadows are reserved for the sticky header and overlays such as menus, popovers, and dialogs.
- Pills are limited to compact statuses or tags. Buttons and ordinary containers are not pills.

## Status, color, and tables

- Accent color indicates the primary action, active navigation, selection, and focus. Plot colors are independent of interface chrome.
- Routine process status is a quiet supporting line. Use semantic info, warning, error, and success colors only when their meaning applies; routine success does not need a large green panel.
- Tables use shared compact text, tabular numerals, a restrained header background, bottom row borders, and horizontal overflow when needed. Text columns align left; numerical columns align right where practical.
- Preserve light, dark, and midnight themes by using semantic variables rather than hard-coded interface colors.

## Accessibility and responsive behavior

- Keep semantic headings, explicit labels, keyboard operation, visible focus, disabled states, and non-color indicators.
- Desktop density is the primary target. At narrow widths, wrap toolbars, stack field grids, and scroll wide scientific tables rather than compressing data until it is unreadable.

