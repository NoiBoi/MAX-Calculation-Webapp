# EMI shielding scientific foundation

## Scope and boundary

The EMI foundation is a React-free module under
`packages/chemistry-engine/emi`. It parses text supplied by a caller, performs
directional calculations, returns structured validation issues, computes
single-dataset and replicate statistics, classifies frequency grids, and
performs explicit overlap-only interpolation. Filesystem access exists only in
`scripts/emi/verify-reference-data.ts`.

The `/emi` interface provides local projects, plots, comparison, and exports.
Cloud records, server persistence, instrument control, and coherent
cross-specimen S-parameter averaging remain outside this scope.

## Observed Keysight CSV structure

The supplied `emi-reference-data` corpus contains 111 CSV exports from a
Keysight N5247B PNA-X. Every inspected file has:

1. `!CSV A.01.01`;
2. one instrument row containing manufacturer, model, serial number, and
   firmware;
3. `!Date:` and `!Source:` rows;
4. a blank separator and `BEGIN CH1_DATA`;
5. the nine-column header
   `Freq(Hz), S21(REAL), S21(IMAG), S11(REAL), S11(IMAG), S22(REAL),
   S22(IMAG), S12(REAL), S12(IMAG)`;
6. 201 measurement rows from 26.5 GHz through 40.0 GHz in 67.5 MHz steps;
7. an `END` marker.

The parser does not depend on that observed column order. Header matching is
case- and punctuation-insensitive, frequencies remain in Hz, and ordinary or
scientific numeric notation is accepted. Blank/comment rows are ignored.
Malformed numeric rows are not silently discarded: each produces a structured
error with filename and source row, while other parseable rows remain
available. Missing markers, headers, required complex columns, or all data rows
produce a failed parse result.

## Legacy master workbook

The referenced workbook was found at
`C:\Users\Matthew Deng\Downloads\Master file for EMI measurement_02.xlsx`.
It contains one sheet (`Sheet1`, used range A1:P209) with 201 Agilent E5071C
measurements from 8.2 GHz through 12.4 GHz. Raw columns A:I are frequency,
S11, S21, S12, and S22 real/imaginary pairs. Columns K:M calculate forward
SET, SER, and SEA.

Representative formulas are:

```text
SET = ABS(20*LOG10(SQRT(S21_real^2 + S21_imag^2)))
SER = -10*LOG10(1 - (SQRT(S11_real^2 + S11_imag^2))^2)
SEA = -10*LOG10((SQRT(S21_real^2 + S21_imag^2))^2 /
                (1 - (SQRT(S11_real^2 + S11_imag^2))^2))
```

The new engine reproduces selected workbook rows at 8.200, 9.565, 10.909,
and 12.253 GHz. It intentionally implements rigorous
`SET = -10 log10(T)` without the workbook's absolute value. Both expressions
agree when `0 < T <= 1`; when `T > 1`, the workbook expression changes the
sign and hides the negative SET that should remain visible for validation.

## Directional equations

Forward uses S11 for reflection and S21 for transmission. Reverse uses S22
and S12. For either direction:

```text
R = reflectionReal^2 + reflectionImaginary^2
T = transmissionReal^2 + transmissionImaginary^2
A = 1 - R - T
SET = -10 log10(T)
SER = -10 log10(1 - R)
SEA = -10 log10(T / (1 - R))
residual = SET - SER - SEA
```

No measured power or logarithm input is clamped. R, T, and A are returned even
when a logarithmic metric is undefined. SET requires finite `T > 0`; SER
requires finite `1 - R > 0`; SEA requires both. Undefined metrics are `null`.

## Validation interpretation

Structural and numerical validation reports missing/unparseable data,
duplicate or decreasing frequencies, nonfinite values, powers above one,
negative A, undefined logarithmic metrics, and decomposition residuals.
Passivity-related messages explicitly list calibration uncertainty, fixture or
reference-plane effects, instrument drift, and malformed data as possible
causes; they do not diagnose one cause.

Directional screening also reports complex `|S21 - S12|` and forward/reverse
shielding differences. Defaults are configurable screening criteria, not
universal physical acceptance limits:

- decomposition identity tolerance: `1e-10 dB`;
- complex reciprocity difference: `0.05`;
- directional shielding difference: `3 dB`.

## Statistics

Statistics use an inclusive optional frequency range. Count includes every
selected point. Valid and excluded counts/percentages are metric-specific;
invalid SET does not exclude the same point from R statistics. Mean, median,
population standard deviation, minimum, and maximum are `null` when no valid
values remain.

## Independent specimens and replicate aggregation

Replicate groups represent independent specimen measurements. MAXCalc first
calculates R, T, A, SET, SER, and SEA for every specimen and direction. It then
aggregates each derived scalar metric independently. It does **not** average
complex S-parameters across independent specimens by default. Coherent complex
averaging would answer a different question and requires measurement phase,
reference-plane, and acquisition assumptions that are not inferred here.

Pointwise group results report the contributing replicate count separately for
every metric and frequency. Invalid values are excluded only from their own
metric. The group mean, median, minimum, maximum, and sample standard deviation
are computed across valid specimens. Sample standard deviation uses `n - 1`,
appropriate for a sample of independent specimens. A two-sided 95% confidence
interval is shown only when at least two valid values are present. It uses the
Student-t critical value for `n - 1` degrees of freedom (the normal 1.96 limit
is used above the tabulated range). This interval describes uncertainty in the
mean under independence and the usual sampling assumptions; it is not a
measurement-system accuracy bound.

## Frequency grids and interpolation

Groups are classified as exact grid match, same range with different point
locations, partial overlap, or nonoverlap. Exact grids aggregate directly.
Interpolation is disabled by default for every incompatible grid.

When a user explicitly enables interpolation, the common grid is restricted to
the range shared by every specimen. The user chooses the first specimen's grid,
a frequency interval, or a point count. Derived scalar metrics are interpolated
linearly. No extrapolation is performed. An interpolated value remains invalid
if either bracketing metric value is invalid, so a line is never bridged across
an invalid logarithmic region. Original calculated values and the interpolated
group grid remain distinguishable in results and exports.

## Band summaries

The default specimen-first summary calculates each specimen's band mean and
then summarizes those specimen means. Every valid specimen therefore has equal
weight. The separately labeled pooled-point summary combines all valid points
before calculation; it weights specimens according to their number of valid
points. These approaches are not equivalent and are never presented as such.

## Thickness and areal-density normalization

Thickness is converted internally to millimetres. The optional normalized
quantity is:

```text
SET per mm = band-mean SET (dB) / thickness (mm)
```

Areal density is converted internally to kilograms per square metre. The
optional shielding efficiency is:

```text
SET per areal density = band-mean SET (dB) / areal density (kg m^-2)
```

These are derived normalizations, not directly measured shielding quantities.
They are omitted when metadata are missing, nonfinite, zero, or negative. Raw
SET remains available beside every normalization.

## Interpretation limitations

SEA is an effective logarithmic decomposition contribution satisfying
`SET = SER + SEA` in the valid domain. It is not the absorbed-power coefficient
A and does not by itself prove absorption-dominant shielding. Likewise, a high
calculated metric or normalized metric does not establish practical superiority
without considering uncertainty, thickness, density, bandwidth, specimen
variation, test geometry, and application requirements.

Calibration quality, fixture response, cable drift, sample placement, and the
chosen reference plane can affect measured S-parameters. Validation warnings
screen the numerical consequences but cannot infer which physical cause is
responsible. MAXCalc does not automatically correct flagged measurements.

## Supplied-data verification

Run `npm run emi:verify` to process every root-level CSV and write the ignored
`emi-reference-data/verification-report.json` report.

The 2026-07-23 verification found:

- 111 of 111 CSVs parsed successfully;
- 22,311 measurement rows total, all with the same 26.5–40.0 GHz sweep;
- maximum absolute decomposition residual:
  `2.842170943040401e-14 dB`;
- 7,317 directional points with `R > 1`;
- 7,498 directional points with `R + T > 1` and therefore negative A;
- 11,963 points above the configurable 3 dB forward/reverse shielding
  screening threshold;
- no point above the default complex `|S21 - S12|` threshold of 0.05.

These flags warrant measurement review but do not establish their cause.
The two supplied PNG screenshots show the original PNA-X log-magnitude traces
over the same sweep and are not used as numeric calculation inputs.
