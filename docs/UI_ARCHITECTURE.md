# MAXCalc shared UI architecture

## Product identity and compatibility

`MAXCalc` is the authoritative user-facing product name in navigation, authentication, recovery, settings, comparison, print, metadata, and accessible labels. Existing internal `max-stoich` identifiers remain unchanged where they participate in package resolution, IndexedDB and local-storage continuity, cloud or backup record types, migrations, routes, exports, or historical fixtures.

## Workspace hierarchy

The shared `AppHeader` is the Level 1 application shell. Its custom `WorkspaceSwitcher` is the only Level 2 navigation among Calculator (`/workspace`), Comparison (`/compare`), EMI Analysis (`/emi`), and XRD Analysis (`/xrd`). Documentation, Settings, account, and appearance remain global utilities; workspace commands do not belong in this row.

Each route owns Level 3 functionality and preserves its existing scientific state architecture. Calculator and Comparison retain their dedicated command bars. EMI keeps import, analysis, visualization, and export inside the EMI route. XRD is an explicit development placeholder and performs no scientific analysis.

The switcher uses links so direct URLs, browser refresh, and back/forward navigation remain authoritative. It supports ordinary Tab navigation, arrow-key movement while open, Escape dismissal with focus restoration, click-outside dismissal, an `aria-current` active item, and a restrained mobile layout. Navigating between route-owned client shells may unmount their in-memory React state; durable calculator and EMI records continue through their existing local persistence contracts.

## Application shell

`components/site/app-header.tsx` owns the persistent header geometry for the calculator, comparison, settings, account/authentication, and private-lab routes. Routes supply a stable title/status region and contextual actions, but cannot redefine header height, logo size, gutter, control height, or active-state dimensions.

The header uses:

- `--toolbar-height` for its fixed outer height.
- `--page-gutter` for the shared left and right anchor.
- `--control-height` for standard buttons, links, selects, and segmented controls.
- One stable brand/logo implementation through `SiteBrand`.
- A stable right region containing account and appearance controls.
- Route actions that remain within the available header width without covering global controls.

`PageContainer` establishes the shared outer gutter. Workspace, comparison, and settings routes may choose different bounded maximum widths without shifting their outer alignment.

## Controls and spacing

Shared geometry classes cover standard, compact, primary, strong, destructive, and icon-button treatments. Visual variants retain the same border width and do not change layout dimensions. The spacing hierarchy is expressed through semantic tokens for inline controls, toolbar groups, field stacks, card interiors, and sections.

`InputWithSuffix` renders compound value/unit controls with one outer border. The input has no independent border; the suffix has only a subtle internal separator. Hover, focus, invalid, and disabled treatment resolves from the semantic theme tokens.

## Calculator and comparison action hierarchy

The calculator and comparison routes keep their route-specific workflow actions in dedicated, inset command bars directly below the persistent header. New/open/save/undo/redo/publish and comparison add/import/save/export/print actions use compact controls inside the same bordered bar treatment. Cross-route Compare, Settings, and More navigation stays in a consistent header group beside the Standard/Advanced switch and before account and appearance controls.

Comparison-level controls—identity, baseline, normalization, view, sort, and visibility—remain below the command bar. Scenario-level duplicate, remove, save-as, route, and verification actions remain inside their scenario card.

Scenario cards share padding, header alignment, compact action geometry, and footer separation. Baseline emphasis uses an inset outline, so selecting a baseline cannot resize the card or shift adjacent content.

## Responsive and theme behavior

The same header geometry is used at every route and grows only through the shared large-display tokens. Comparison cards use two columns at normal wide widths, one column below 1400 px, and three columns on supported 4K layouts. At narrow widths, calculator and comparison command groups wrap predictably and lower-frequency actions move into the More menu rather than creating horizontal page overflow.

Light, Dark, Midnight, and System modes use semantic background, border, text, focus, and status tokens. Neutral panel boundaries use `--border-subtle`; interactive controls use `--border-default`; emphasized structural rules use `--border-strong`. Success, warning, error, and information outlines use their corresponding status tokens. Plain utility borders are normalized into this hierarchy, so they never fall back to the current text color or render as unintended black outlines. Print continues to use its independent white-paper palette.

## Regression coverage

`tests/e2e/ui-polish.spec.ts` covers route-to-route header/logo geometry, compound batch input borders and focus across themes, comparison empty/populated layouts, command-bar collision protection, calculator/comparison mode alignment at 1280–1920 px, narrow wrapping, semantic neutral borders, and visible branding. `tests/unit/ui-polish-contract.test.ts` protects shared-component adoption and retained compatibility identifiers.
