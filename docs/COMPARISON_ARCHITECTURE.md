# Comparison workspace architecture

Each comparison scenario owns its target, explicit site model, radius configuration, precursor route, feed adjustments, batch settings, validation state, and optional historical snapshot. Scientifically different targets remain supported. Comparison identity and add/open/save actions are workspace-level; scientific edits and failures remain scenario-local.

The comparison UI reuses the calculator weighing-summary presentation for formulas, purity, molar quantities, masses, status, warnings, radius descriptors, and provenance. Standard mode keeps routine inputs and results visible. Advanced mode adds per-scenario site descriptors and a grouped solver/balance/residual/trace summary. Radius values from different datasets are labeled not directly comparable and are never ranked or differenced.
