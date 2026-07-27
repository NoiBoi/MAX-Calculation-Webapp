# Four-point-probe electrical properties and Simon estimate

## Entered measurement

The resistance field is **raw four-point-probe resistance in ohms**. It is not sheet resistance. MAXCalc preserves every reading and applies the fixed calculation convention:

```text
fourPointProbeCorrectionFactor = 4.532
R_sheet (Ω/sq) = 4.532 × R_raw (Ω)
```

For multiple readings, MAXCalc calculates the arithmetic mean raw resistance and then calculates the sample-level sheet resistance and conductivity from that mean. It does not average individual conductivities and call the result equivalent. No reading is silently removed as an outlier.

## Thickness and conductivity

Sample thickness is entered once in general metadata with an explicit unit. The electrical pipeline converts that authoritative value to micrometers:

```text
thickness_m  = thickness_um × 1e-6
thickness_cm = thickness_um × 1e-4

resistivity_ohm_m  = R_sheet × thickness_m
resistivity_ohm_cm = resistivity_ohm_m × 100

conductivity_S_per_m  = 1 / resistivity_ohm_m
conductivity_S_per_cm = conductivity_S_per_m / 100
```

Equivalently:

```text
conductivity_S_per_m  = 1e6 / (4.532 × R_raw_ohm × thickness_um)
conductivity_S_per_cm = 1e4 / (4.532 × R_raw_ohm × thickness_um)
```

All required inputs must be numeric, finite, and greater than zero. Missing, empty, zero, negative, `NaN`, or infinite values produce structured errors and no derived scientific result.

## Simon theoretical EMI SE

MAXCalc implements the requested Simon empirical formalism with the following unit boundary:

```text
conductivity: S/cm
frequency:    MHz (canonical Hz divided by 1e6)
thickness:    cm
result:       dB

reflection term = 50 + 10 log10(conductivity / frequency)
absorption term = 1.7 × thickness × sqrt(conductivity × frequency)
Simon SE        = reflection term + absorption term
```

The output is labeled **Theoretical EMI SE — Simon estimate**. It is not measured VNA SET, SER, or SEA, is not clamped to zero, and does not validate the experimental measurement. The pointwise series is deterministic, unsmoothed, and uses the associated dataset's exact ordered frequency points.

This empirical expression may not accurately represent thin, porous, anisotropic, multilayered, or otherwise non-ideal materials. The literature reference is Robert M. Simon, “EMI Shielding Through Conductive Plastics,” *Polymer-Plastics Technology and Engineering* 17 (1981), 1–10, [doi:10.1080/03602558108067695](https://www.tandfonline.com/doi/abs/10.1080/03602558108067695).

## Calculation version

New records store `1.0.0-four-point-probe-simon` plus the correction factor. A future convention change must introduce a new version rather than silently reinterpret historical results.
