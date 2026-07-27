# EMI analysis workflow

MAXCalc parses Keysight complex S-parameter CSV files locally. Frequency is canonicalized as Hz and the original measured row order is preserved. Forward calculations use S11/S21; reverse calculations use S22/S12. Measured `R`, `T`, `A`, `SET`, `SER`, and `SEA` are calculated in `packages/chemistry-engine/emi/calculations.ts` and are not changed by sample metadata, electrical measurements, plotting, or exports.

Electrical measurements are optional per dataset. A missing or invalid thickness or resistance prevents only the electrical and Simon calculations; VNA analysis remains available. Simon results are additional theoretical values and never replace measured SET.

Scientific provenance is recorded through the calculation-engine version, parser version, EMI project schema version, electrical calculation version, stored correction factor, original filename, structured raw S-parameter values, and user-entered metadata.

Interpolation applies only to explicitly requested replicate aggregation. Electrical calculations and Simon series use unsmoothed values and the original measured frequency points. No graph smoothing or Simon overlay controls are implemented in this milestone.

