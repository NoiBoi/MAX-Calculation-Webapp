# EMI graph overlay and smoothing implementation report

Date: 2026-07-27

## Delivered graph changes

The prior combined SET/SER/SEA chart was separated into three instances of the existing renderer so the three measured quantities can have genuinely independent view controls. The resulting continuous frequency graphs are SET, SER, SEA, and combined R/T/A. No new charting framework, S-parameter chart, or conductivity-frequency chart was introduced.

SET is the sole Simon-eligible graph. SER and SEA are excluded because no reviewed equivalence between the Simon component terms and the implemented VNA decomposition was found. This is the only item that would require lab/scientific review before expanding theoretical overlays.

## Smoothing and gaps

The chemistry engine now provides one immutable centered-moving-average helper with windows 3, 5, 7, and 11. It preserves every x-value and source point, uses truncated windows at segment ends, leaves undersized segments raw, and never crosses null/nonfinite gaps. Smoothing is applied independently to each measured trace before SVG coordinate mapping. There is no graph downsampling stage.

Measured tooltips show raw values first and smoothed display values second. Simon values are never passed to the smoothing helper.

## Simon rendering

Each qualifying sample uses its own stored electrical-property record and exact measured frequency ordering. Missing electrical inputs omit only that sample's overlay. Simon lines are lower-emphasis dashed lines with explicit theoretical legends and tooltips containing conductivity, thickness, units, and calculation version. Measured gaps split the rendered theoretical line without deleting the calculated pointwise series.

## State, persistence, and performance

Graph controls are component-local, keyed by stable graph instances through the rendered component topology. State is not included in scientific projects, hashes, exports, or IndexedDB and resets when navigation unmounts the analyzer. Existing schema 2.0.0 projects need no migration.

Raw segments and rendered series are memoized against source data and the applicable graph state. Simon calculation occurs in the analyzer parent and is not recalculated when only a child smoothing control changes. Source arrays are never mutated.

## Accessibility, responsive design, and themes

Controls have visible native labels, wrap at narrow widths, and use shared theme tokens. The focused SVG supports Left/Right Arrow point traversal. Smoothed and theoretical status are communicated in text, while Simon is additionally distinguished with dash pattern and reduced stroke weight. Representative Light desktop, Dark desktop, and Midnight narrow-mobile captures were inspected; controls remained within the panel and legends wrapped without page overflow.

## Scientific safeguards and export regression

- Calculation equations and result objects were not changed.
- Smoothing is display-only and cannot enter summaries, statistics, QC, rankings, persistence, or spreadsheet exports.
- A browser regression compares processed CSV bytes before and after smoothing/window/overlay changes.
- Simon numeric values are asserted unchanged across smoothing-window changes.
- The existing XLSX and Simon export tests remain in the full suite.

## Tests and remaining limitations

Added deterministic unit coverage for all four windows, short series, single/two-point series, gaps, multiple segments, NaN, Infinity, immutability, ordering, length, x preservation, and disabled behavior. Browser coverage exercises independent SET/SER/SEA state, partial Simon availability, dashed theoretical styling, tooltips, export neutrality, navigation reset, responsive layout, and visual capture.

Known limitations: view preferences intentionally reset on analyzer unmount; very dense SVG charts retain the existing no-downsampling behavior; Simon component overlays remain deferred pending scientific review.

## Final validation result

- TypeScript and ESLint: passed with zero warnings.
- Unit/scientific/export tests: 518 passed across 39 files.
- Full Playwright suite: passed (live cloud tests that require external credentials remained skipped by their existing guards).
- EMI reference corpus: 111 of 111 CSV files parsed; maximum SET decomposition residual was `2.842170943040401e-14 dB`.
- Production Next.js build: passed, including `/emi`.
