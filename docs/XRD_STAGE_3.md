# XRD Stage 3: preprocessing and peak analysis

## Implemented scope

Stage 3 provides **PREPROCESSING + PEAK ANALYSIS** for an immutable Stage 2 measurement:

```text
ExperimentalXRDMeasurement (immutable raw parsed arrays)
  -> ProcessedXRDRepresentation (immutable saved run)
    -> XRDPeakAnalysis (immutable saved researcher revision)
```

It does **not** provide phase identification, hkl assignment, lattice refinement, quantitative phase analysis, crystallite-size or microstrain analysis, Pawley/Le Bail/Rietveld refinement, or chemical interpretation.

## Processing

`XRDProcessingConfig` contains independently enabled baseline and smoothing configurations. Both default **off**, so the default analysis intensity is exactly the Stage 2 intensity array. The fixed transformation order is raw intensity -> optional global baseline subtraction -> optional Savitzky-Golay smoothing -> analysis intensity. Every intermediate array that exists is returned and persisted; the parent measurement is never updated.

Global baseline estimation uses pybaselines directly:

- arPLS is the primary option because its reweighting does not require the researcher to choose an asymmetry probability. Exposed parameters are lambda, difference order, maximum iterations, and tolerance.
- AsLS is available when a researcher wants explicit control of asymmetry `p`; it exposes the same common parameters plus `p`.

Tolerance history is converted into iteration count, final tolerance, and a convergence flag when the library returns it. Failure never substitutes another method. A non-converged result is retained with a warning rather than described as converged.

Optional smoothing uses `scipy.signal.savgol_filter`. Window length must be positive, odd, no longer than the dataset, and greater than polynomial order. Because Savitzky-Golay filtering assumes regular sample spacing, irregular 2theta datasets are rejected for smoothing. MAXCalc does not silently resample them.

## Candidate detection

Candidate detection uses `scipy.signal.find_peaks` with recognizable parameters: prominence, optional height, distance, and optional width bounds. User-facing distance and width values are degrees 2theta. They are converted to sample-domain values with the median positive spacing. If spacing differs by more than 2% from that median, the result records a warning; widths are interpolated back onto the original axis. Descending, duplicated, or non-monotonic axes are rejected for Stage 3 operations and remain unchanged in Stage 2.

Candidates retain their source index, approximate position/intensity, prominence, estimated half-height width, configuration identity, and automatic/manual/excluded state. Candidate positions are fitting seeds and are not presented as final fitted centers.

## Local pseudo-Voigt fitting

Fitting uses LMFit `PseudoVoigtModel`; MAXCalc does not implement a profile or optimizer. Each local model adds one shared `ConstantModel` or `LinearModel` background. The default is linear because a global baseline can leave a local offset and slope. Global baseline and local fit background are recorded separately.

The deterministic default window width is the candidate half-height width times four, clamped to 0.4-3.0 degrees. Researchers can store explicit per-candidate bounds. Candidate centers are bounded to +/-0.3 degrees by default, amplitudes are nonnegative, FWHM is bounded to 0.01-2.0 degrees, and the initial center is refined to the strongest local sample within the center bound.

Overlapping candidate windows are fit together with prefixed pseudo-Voigt components and one shared local background. The default maximum is three peaks per group; a larger connected overlap is split with a warning. This is local decomposition, not whole-pattern fitting. Failed, non-finite, or under-sampled fits retain candidates and diagnostics without fabricated parameters. Each fit group retains local x/y, best fit, background, individual component curves, and residuals.

Reported values include LMFit center, amplitude, height, FWHM, fraction, available standard errors, window bounds, point count, optimizer message/evaluations, chi-square, reduced chi-square, AIC, BIC, and R-squared. Missing covariance means uncertainty remains null; it is not imputed.

## Researcher correction and UI

The experimental workspace adds a restrained Stage 3 area without changing the raw plot. It distinguishes an unsaved processing preview from a saved processing run and offers raw, baseline, and processed overlays. After a run is saved, the researcher can detect candidates, fit active peaks, add a peak at a chosen 2theta position, exclude/re-include a candidate, edit its local fit window, refit, inspect numerical local-fit diagnostics, save the analysis, reload the page, and reopen prior processing/analysis records.

Candidate, manual, fitted, and excluded states have separate semantics. Scientific arrays retain full precision; table values use restrained display precision.

## API and errors

- `POST /v1/xrd/data/process`
- `POST /v1/xrd/peaks/detect`
- `POST /v1/xrd/peaks/fit`

The same-origin Next.js proxy validates each request with Zod and forwards it to the corresponding FastAPI route. Pydantic validates the service boundary. Structured failures include `INVALID_PROCESSING_CONFIG`, `BASELINE_FAILED`, `SMOOTHING_FAILED`, `PEAK_DETECTION_FAILED`, and ordinary `INVALID_REQUEST` validation errors. Fit-level failures are normally returned as unsuccessful diagnostics so candidates remain editable. Stack traces are not returned.

## Provenance and persistence

Every processing and analysis result records schema version, exact parent ID(s), raw SHA-256, full configurations, timestamp, transformation order or fit strategy, warnings/diagnostics, service version, Python version, and actual NumPy/SciPy/pybaselines/LMFit versions.

IndexedDB schema 14 adds `xrdProcessedRepresentations` and `xrdPeakAnalyses`. Saving always inserts a new record; it does not overwrite an earlier run. Deleting an analysis does not delete its processing run or measurement. Deleting a processing run with analyses, or a measurement with processing runs, is blocked until descendants are explicitly removed. Raw-artifact reference counting from Stage 2 remains unchanged.

## Dependencies and licenses

| Package | Version | License | Purpose |
| --- | ---: | --- | --- |
| NumPy | 2.5.3 (resolved) | BSD-3-Clause and bundled compatible notices | numerical arrays |
| SciPy | 1.18.1 | BSD-3-Clause and bundled compatible notices | Savitzky-Golay filtering, candidate detection, width estimation |
| pybaselines | 1.2.1 | BSD-3-Clause | arPLS and AsLS global baseline estimation |
| LMFit | 1.3.4 | BSD-3-Clause | pseudo-Voigt models, background composition, nonlinear fitting, diagnostics |

SciPy is now pinned directly because Stage 3 calls its API directly. NumPy remains supplied by the pinned pymatgen/scientific stack, while its actual runtime version is recorded on every result. GSAS-II is not installed.

## Validation and known limitations

Deterministic seeded synthetic tests cover disabled processing, flat/sloped/curved baselines, narrow peaks on broad background, smoothing, invalid configurations, isolated and separated peaks, prominence and distance behavior, irregular spacing, known pseudo-Voigt center/FWHM/amplitude/fraction, offset and sloped local backgrounds, imperfect seeds, two- and three-peak overlap, group limits, manual windows, exclusions, insufficient points, and API error hygiene.

Limitations:

- Baseline algorithms estimate a mathematical background; they do not establish a unique physical background. Convergence and residual inspection remain necessary.
- Degree-based `find_peaks` constraints on irregular axes are median-spacing approximations and are labeled as such. Smoothing is rejected for irregular axes.
- Severe overlap can be underdetermined even if an optimizer terminates. Bounds, covariance availability, residuals, and component stability must be reviewed.
- Standard errors are optimizer/covariance estimates, not guaranteed physical uncertainty.
- Local background is constant or linear only. No arbitrary polynomial or whole-pattern decomposition is attempted.

## Recommended Stage 4 boundary

Stage 4 should be limited to fitted experimental peaks + one researcher-selected Stage 1 reference pattern -> proposed reference-peak matching -> proposed hkl assignments -> researcher confirmation/correction -> lattice-parameter refinement -> deterministic synthetic validation. It should not silently infer phases, and it should not broaden into phase fractions or Rietveld/Pawley/Le Bail analysis.
