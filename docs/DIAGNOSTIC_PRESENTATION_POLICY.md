# Diagnostic presentation policy

Policy version `1.0.0` changes presentation only. Engine errors, warnings, exact residuals, canonical output, traces, and exports are unchanged.

- **Blocking**: invalid/missing data, infeasibility, negative requirements, corrupt datasets, or unsupported values. Current masses are unavailable.
- **Action required**: sub-balance masses, material rounding shifts, relative residuals at or above 1%, and unverified overrides.
- **Minor advisory**: smaller numerical residuals and non-blocking method notes. Collapsed by default.
- **Information**: interval atomic-weight policy, dataset identity, and exact-method details. Excluded from warning counts.

`MATERIAL_ROUNDING_SHIFT` and `REALIZED_RESIDUAL_ABOVE_TOLERANCE` are merged by element and event for display while retaining both codes and exact messages. Scientific solver tolerances remain independent of this versioned UI policy.
