# EMI graph overlay and smoothing baseline

Date: 2026-07-27

## Pre-change graph inventory

The analyzer had two interactive frequency-chart instances, both rendered by `components/emi/emi-plot.tsx`:

1. **Shielding effectiveness** combined measured SET, SER, and SEA traces in one chart.
2. **Incident-power coefficients** combined measured R, T, and A traces in one chart.

There was no S-parameter-magnitude or frequency-dependent conductivity chart. Simon values were calculated and exported separately, but were not rendered on a graph. Chart state consisted only of per-chart legend visibility; smoothing and Simon visibility controls did not exist.

The combined shielding chart could not satisfy independent SET, SER, and SEA view settings. This milestone therefore treats the three shielding metrics as separate graph instances that continue to use the existing chart renderer.

## Scientific classification

- Simon overlay eligible: measured total SET versus frequency only.
- Simon overlay excluded: SER and SEA because the repository does not establish a reviewed scientific equivalence between the empirical Simon component terms and MAXCalc's VNA-derived SER/SEA definitions.
- Smoothing eligible: continuous measured SET, SER, SEA, and R/T/A frequency traces.
- Smoothing excluded: tables, scalar summaries, metadata, electrical-property scalar results, and the Simon theoretical series.

## Baseline validation

Before implementation:

- TypeScript: passed.
- ESLint: passed with zero warnings.
- Unit/scientific tests: 506 passed across 38 files.
- EMI Playwright tests: 3 passed.
- Production build: passed; `/emi` built successfully.

The pre-change project schema was `2.0.0`; this display-only milestone does not require a schema or IndexedDB migration.
