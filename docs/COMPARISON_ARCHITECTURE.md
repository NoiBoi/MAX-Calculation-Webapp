# Comparison workspace architecture

Each comparison scenario owns its target, explicit site model, radius configuration, precursor route, feed adjustments, batch settings, validation state, and optional historical snapshot. Scientifically different targets remain supported. Comparison identity and add/open/save actions are workspace-level; scientific edits and failures remain scenario-local.

The comparison UI reuses the calculator weighing-summary presentation for formulas, purity, molar quantities, masses, status, warnings, radius descriptors, and provenance. Standard mode keeps routine inputs and results visible. Advanced mode adds per-scenario site descriptors and a grouped solver/balance/residual/trace summary. Radius values from different datasets are labeled not directly comparable and are never ranked or differenced.
# Analysis representation

Comparison analysis has four presentations: recipe cards, summary metrics, baseline-relative differences, and an aligned precursor matrix. Baseline selection is presentation state and never edits a scenario. Signed mass and percentage differences are descriptive and must not be labeled as scientifically better.

The original-batch representation uses each stored input mass. Common-batch representation clones scenario inputs, substitutes the temporary target mass, and safely recalculates through the existing workspace adapter. It does not mutate or persist the saved recipes. Matrix cells distinguish missing precursors, unavailable calculations, zero quantities, and present quantities; modes include final mass, exact solver molar ratio, presence, and mass difference from baseline.

Copy and CSV exports use the currently selected representation. The existing digest-protected JSON comparison export remains the authoritative exact scientific record.

Scenarios may be sorted by saved order, name, total mass, precursor count, warning count, or verification residual. Temporary visibility is held only in component state: hiding a scenario does not remove it from the comparison or change the persisted scenario array.

Comparison printing extends the shared `PrintJob` with an optional immutable analysis payload. Supported contents are full recipes, overview only, precursor matrix, and overview plus compact recipes. Overview and matrix pages use the same dedicated print root, page geometry, typography, metadata, readiness signal, and theme-independent print rules as recipe pages.
