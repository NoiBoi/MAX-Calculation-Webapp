# Print and summary architecture

Calculator and comparison printouts consume `WeighingSummary`, the same presentation model used by screen and clipboard output. The model is assembled from an existing `BatchCalculationResult` plus workspace input metadata; print components perform no formula parsing, balancing, adjustment, molar-mass, radius, or rounding arithmetic.

The ordinary model includes adjusted feed, batch basis, precursor formula, final intended molar quantity, exact solver quantity where relevant, purity, final rounded mass, status, actionable warnings, engine version, and atomic-weight version. The optional advanced projection adds descriptors only when a valid explicit site model and an exact usable dataset selection are present.

Print CSS targets Letter and A4 through 12 mm page margins, repeatable table headers, non-splitting rows, and compact type. The interactive application is hidden whenever the summary dialog is printed. Two scenarios may share a page in columns; other counts flow in scenario order. Expanded occupant-radius tables remain screen/copy material, while print uses one compact line per site and one shared disclaimer.

Calculation verification uses a separate presentation-only `CalculationVerificationView` assembled from an existing engine result and workspace metadata. Screen output may expand exact values and atomic contributions. Verification print output substitutes a compact precursor table, retains elemental reconciliation, applied assumptions, status, versions, and the phase/yield disclaimer, and omits the full trace. The same 12 mm Letter/A4 page policy applies.

Structured JSON includes the full verification model with canonical exact strings. CSV adds verification status, molar-mass provenance/contributions, reverse-conversion differences, and serialized elemental reconciliation without replacing scientific values with display formatting. Clipboard verification is deliberately concise and human-readable.

## Dedicated print state

Current printing uses `PrintJob` schema `1.0.0` and one shared `PrintableRecipeEntry`/`WeighingSummary` model. Calculator, summary, historical snapshot, comparison, and selected-library actions store a short-lived same-origin job under a random key and open `/print?job=<id>` separately. The root waits for `document.fonts.ready` plus two animation frames, emits `data-print-ready="true"`, invokes print, and closes after `afterprint`; blocked pop-ups return an actionable message. Print components perform no scientific arithmetic.

The persisted settings select Letter/A4, portrait/landscape, 2/4/6-up, density, protected fields, formula/warning/note scope, verification detail, signatures, and page metadata. A calculator recipe is detailed one-up. Comparison/library preserve order and represent invalid entries without masses.

Pagination is computed before rendering from count plus precursor rows and formula/warning/note length. Short 2/4/6 fixtures occupy one page at 100% scale. Oversized recipes receive a full page and visible notice; packing resumes afterward. CSS uses physical page size, readable type, repeated table headers, wrapping formulas, and no `transform: scale(...)` fallback.

Application appearance never enters a print job or scientific presentation model. The dedicated print root declares a light color scheme and explicit white-paper palette, and `@media print` forces white backgrounds, black text, visible borders, and hides the appearance control and creator credit. Light, Dark, Midnight, and System therefore produce identical print content and do not mutate the saved appearance preference.

Print is designed for 100% browser scale without a CSS scale transform. One- and two-up sheets use approximately 15 pt titles, 13 pt adjusted formulas, 10 pt rows, 12.5 pt final masses, and 16 pt totals. Four-up uses 12/10.5/9/11/13 pt respectively; six-up never drops table rows below 8.5 pt, final masses below 10 pt, or totals below 11.5 pt. Metadata floors at 8.5–9 pt. Compact margins, padding, warnings, and provenance make room for the larger type.

Formula markup inserts zero-width break opportunities at element boundaries while retaining identical text. Readability-first pagination uses lower per-region content capacities; a long formula, warning set, note set, or precursor table receives a dedicated page with a visible notice, after which configured packing resumes. Settings preview typography uses the same size tiers. Light, Dark, Midnight, and System all produce the same white-paper output.
