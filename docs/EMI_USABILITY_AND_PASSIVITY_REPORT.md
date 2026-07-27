# EMI usability and passivity implementation report

## Scope and outcome

This milestone repaired the EMI thickness contract, electrical-entry layout, graph interaction, and passivity reporting without changing the complex S-parameter parser or clamping any measured result. The pre-change evidence is recorded in `EMI_USABILITY_AND_PASSIVITY_BASELINE.md`.

## Authoritative thickness and compatibility

Project schema `3.0.0` makes `sampleMetadata.thickness` plus `thicknessUnit` the only editable and authoritative thickness. Electrical-property records retain raw resistance readings, the fixed factor, note, version, and derived snapshot, but no longer store a second thickness.

Migration accepts schemas `1.0.0` and `2.0.0`:

- metadata-only thickness is retained;
- electrical-only thickness moves to sample metadata in µm;
- equivalent values are deduplicated after unit conversion;
- conflicting values are both preserved in `thicknessConflict` and electrical/Simon derivation is paused until the user explicitly chooses sample metadata or the legacy electrical value.

All electrical and Simon calculations convert the authoritative value to µm through the pure chemistry-engine unit conversion. Editing metadata immediately rebuilds an existing electrical snapshot when no conflict is open.

## Pointwise validity model

Raw complex components remain authoritative. MAXCalc continues to calculate:

```text
R = |Sreflection|²
T = |Stransmission|²
A = 1 - R - T
```

No value is clamped, normalized, or replaced. The centralized comparison epsilon is `1e-12` and is used only when deciding whether a floating-point boundary comparison is a physical warning. It never changes a stored or exported number.

Each directional point now receives a physical-validity status, power-balance residual `R + T + A - 1`, decomposition-valid flag, reason codes, and human-readable reasons. The model detects nonfinite results, R/T outside the physical range, `R + T > 1`, negative A, and invalid logarithm domains. SER and SEA remain null when `1 - R` is not finite and positive; exports leave these numeric cells blank and explain why.

Dataset summaries report valid/warning/invalid counts, affected percentage, R/T/A extrema, and the frequency and magnitude of the most severe passivity violation. These statements describe measured behavior only. Calibration, fixture/reference-plane effects, instrument drift, and malformed files are presented as possible review paths rather than assigned causes.

## Graph and form behavior

- The graph structure is title, legend, controls, help, then plot.
- The smoothing window appears only while smoothing is enabled; Simon remains SET-only.
- SVG client coordinates are mapped through the rendered `xMidYMid meet` geometry, so letterboxing cannot displace hover selection.
- A canonical displayed frequency is selected first; the tooltip, vertical cursor, and one active point marker share its exact frequency.
- Left/Right keyboard navigation changes frequency; Up/Down changes series at the current frequency.
- Permanent red per-warning triangle arrays and permanent point arrays were removed. Invalid derived values remain gaps.
- Automatic y domains receive six-percent display padding unless the user supplies an explicit bound.
- The electrical note and resistance controls use the shared theme-aware input surface in Light, Dark, and Midnight.

## Export and verification contract

XLSX output now contains explicit diagnostic columns in both frequency and directional sheets, preserves raw invalid R/T/A values, keeps unavailable decomposition metrics blank, freezes header rows, enables filters, and supplies bounded content-aware widths. CSV typed export tables receive the same diagnostic fields.

Regression coverage includes legacy thickness migration and conflict resolution, passivity-violating raw values such as `R = 1.00582`, epsilon behavior, dataset summaries, letterboxed pointer mapping, one authoritative thickness control, themed electrical controls, marker/tooltip frequency identity, null spreadsheet decomposition cells, diagnostic reasons, widths, frozen headers, and filters.

Representative post-change captures:

- `docs/images/emi-usability-after-light.png`
- `docs/images/emi-usability-after-dark.png`
- `docs/images/emi-usability-after-midnight.png`
- `docs/images/emi-usability-after-electrical-midnight.png`
