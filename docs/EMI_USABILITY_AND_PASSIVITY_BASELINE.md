# EMI usability and passivity baseline

Date: 2026-07-27

## Reproduction fixture

The baseline used `emi-reference-data/9-2.1.csv`, a Keysight complex real/imaginary S-parameter export with 201 ordered frequencies from 26.5 to 40 GHz. The workflow was populated with:

- general metadata thickness: `0.012 mm`;
- electrical-properties thickness: `12 µm`;
- one raw four-point-probe resistance reading: `1 Ω`;
- a measurement note;
- measured SET smoothing with the 5-point centered window;
- the sample-specific Simon overlay.

The supplied task attachment contained requirements only and no separate screenshot attachments. Reproducible application screenshots were therefore captured directly in Light, Dark, and Midnight themes:

- `docs/images/emi-usability-baseline-light.png`
- `docs/images/emi-usability-baseline-dark.png`
- `docs/images/emi-usability-baseline-midnight.png`
- `docs/images/emi-usability-baseline-duplicate-thickness.png`
- `docs/images/emi-usability-baseline-warning-markers.png`

## Duplicate thickness and electrical form behavior

The same physical thickness is independently editable in `sampleMetadata.thickness` plus `sampleMetadata.thicknessUnit` and in `electricalProperties.thicknessMicrometers`. Conductivity, resistivity, and Simon currently read only the electrical copy; comparison metadata and normalized displays read the general copy. No equality or conflict check connects them.

In the Dark baseline, the electrical thickness input and measurement-note textarea lack the shared input background, border, text, placeholder, and focus treatment used by metadata controls. Their visible area blends into the surrounding panel, and the two-row note has no useful placeholder. The permanent explanatory text is `Enter raw four-point-probe resistance in Ω—not sheet resistance. MAXCalc applies the fixed geometric correction factor 4.532.`

## Graph toolbar and red-marker behavior

The current graph toolbar orders smoothing, window, Simon, then the status badge before the help text and legend. The window is correctly hidden until smoothing is enabled, but controls precede the legend rather than following it.

The representative file produces 204 validation warnings. `selectedWarningFrequencies` includes every issue with a frequency, including 200 forward/reverse-difference warnings, and every unique frequency is rendered as a red triangular SVG path at the chart floor. The SET graph therefore contained 200 repeated red triangles unrelated to its legend. This is a validation-series rendering defect, not a measured-data marker or Simon point.

## Hover and cursor alignment

The chart uses a `900 × 330` viewBox but was displayed at approximately `1200 × 400` because of its CSS maximum height. SVG `preserveAspectRatio` letterboxes that geometry horizontally, while pointer conversion scales `clientX` across the entire bounding box. At a pointer x-coordinate of 120 px, the active cursor rendered near 174 px—approximately 54 px to the right. The tooltip, marker, and cursor share one selected candidate internally, but the candidate selection is based on the wrong plot-space pointer coordinate near the chart edges.

## Reflectance and passivity behavior

The parser treats the declared Keysight columns as complex real and imaginary S-parameters. The calculator computes `R = Re(Sreflection)^2 + Im(Sreflection)^2`, `T` equivalently, and `A = 1 - R - T` without clamping. It already preserves raw `R > 1` and negative `A` values. SET remains available when `T > 0`; SER is `null` when `1 - R <= 0`; SEA is `null` unless both `T > 0` and `1 - R > 0`.

The representative file demonstrated maximum forward `R = 1.00015`, minimum forward `A = -0.000159362`, and one excluded forward SER/SEA point. These values are mathematically consistent with the imported complex components and are currently flagged by pointwise validation. Existing diagnostics cover `R > 1`, `T > 1`, `R + T > 1`, negative A, nonfinite source values, and undefined SET/SER/SEA, but there is no concise dataset-level passivity summary.

## Export behavior

CSV and XLSX exports preserve raw S-parameter components and raw R/T/A. Invalid SER/SEA numeric cells are empty because null cells are serialized as blank and nonfinite numeric cells are also omitted. Current exports expose a generic validity field and pipe-delimited validation codes in the directional sheet, but the frequency-data sheet lacks direction-specific status, `R + T - 1`, decomposition-valid flags, and reason fields.

The XLSX writer has no column-width declarations, frozen header row, or autofilter. Headers are complete in XML but open at default widths, making adjacent `Forward…` and `Reverse…` columns difficult to distinguish visually.

## Baseline validation

Before implementation:

- TypeScript: passed.
- ESLint: passed with zero warnings.
- Unit/scientific/export tests: 518 passed across 39 files.
- Full Playwright suite: 139 passed and 4 credential-gated tests skipped.
- Production Next.js build: passed, including `/emi`.

No calculations, schemas, exports, or UI source files were changed before this baseline was recorded.
