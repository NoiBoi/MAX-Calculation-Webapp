# XRD Stage 4: reference-assisted peak and lattice analysis

## Scope and lineage

Stage 4 consumes one immutable Stage 3 `XRDPeakAnalysis` and one researcher-selected Stage 1 `CalculatedXRDPattern`:

```text
RawXRDArtifact -> ExperimentalXRDMeasurement -> ProcessedXRDRepresentation -> XRDPeakAnalysis
                                                                                     +
                                                        selected CalculatedXRDPattern
                                                                                     |
                                                        XRDReferenceMatchingResult
                                                                                     |
                                                        XRDLatticeRefinementResult
```

This is **reference-assisted peak/lattice analysis**. It is not blind phase identification, quantitative phase analysis, whole-pattern refinement, Rietveld refinement, Pawley refinement, or Le Bail refinement. It does not infer impurities, phase fractions, crystallite size, microstrain, texture, or chemical meaning.

## Compatibility and matching

The service requires a positive experimental wavelength. Its value must agree with the selected calculated pattern to `1e-7 Å`; otherwise matching returns `WAVELENGTH_MISMATCH`. The UI therefore requires an explicit experimental value rather than silently borrowing the reference wavelength. A mismatched Stage 1 pattern must be recalculated from its CIF at the experimental wavelength. Stage 4 does not compare incompatible 2theta positions or alter Stage 1–3 data.

Eligible pairs satisfy the editable maximum absolute position difference, default `0.15° 2θ`. Matching uses SciPy `linear_sum_assignment` over a padded cost matrix with explicit unmatched rows and columns. This gives a deterministic global one-to-one assignment instead of conflicting per-peak nearest-neighbor choices. The primary cost is absolute `Δ2θ`; intensity is disabled by default. An optional, explicitly bounded intensity term exists only as a weak tie-breaker and cannot make an out-of-tolerance pair eligible.

Every match retains signed `Δ2θ = experimental - reference`, absolute error, fitted center/FWHM/height and center standard error where available, calculated relative intensity, the complete pymatgen hkl group, and all in-tolerance alternatives. Alternatives whose positional costs differ by no more than the editable ambiguity threshold (default `0.03°`) are flagged for review. Calculated intensity is supporting information only; intensity disagreement never rejects a positional match.

Grouped hkl contributors are never collapsed in stored data. One hkl is selected automatically only when every contributor has the same crystal-system lattice-equation coefficient vector (for example, symmetry-equivalent cubic contributors), so each predicts the same d-spacing. Otherwise researcher selection is required before refinement.

Researchers can accept/reject proposals, select another in-tolerance reference, choose an hkl, manually assign an unmatched fitted peak to an eligible unused reference, remove a manual assignment, include/exclude a confirmed match from refinement, and reset to the automatic proposal. Provenance states distinguish `AUTO_PROPOSED`, `AUTO_ACCEPTED`, `MANUAL_ASSIGNED`, `MANUAL_CHANGED`, and `REJECTED`. Saving creates a new immutable matching record.

## Lattice refinement

Stage 4 supports cubic (`a`), tetragonal (`a,c`), hexagonal (`a,c`), and orthorhombic (`a,b,c`) systems. It uses the conventional reciprocal-spacing equations:

- cubic: `1/d² = (h²+k²+l²)/a²`
- tetragonal: `1/d² = (h²+k²)/a² + l²/c²`
- hexagonal: `1/d² = (4/3)(h²+hk+k²)/a² + l²/c²`
- orthorhombic: `1/d² = h²/a² + k²/b² + l²/c²`

Observed d-spacing is computed in angstrom using Bragg's law, `d = λ/(2 sin θ)`, with `θ = 2θ/2`. SciPy `least_squares` fits transparent, unweighted signed residuals in degrees 2theta (`observed - predicted`) with linear loss and positive bounds at 50–150% of the selected reference lattice. Unweighted fitting is the default because LMFit center covariance can be missing or unrealistically small; center standard errors remain visible for review.

The optional global `zeroShiftDeg` nuisance parameter is off by default, must be enabled explicitly, and is bounded to `±0.2°` by default. The model is `predictedMeasured2θ = crystallographic2θ + zeroShiftDeg`. It is not described as instrument calibration.

Before nonlinear fitting, Stage 4 computes the rank of the hkl coefficient matrix. This rejects, for example, hexagonal `00l`-only data (no `a` information), hexagonal `hk0`-only data (no `c` information), and analogous rank-deficient cases. It also requires at least as many reflections as total fitted parameters. The optimizer Jacobian is checked after fitting; rank deficiency is an error and high condition number is an explicit warning. Optimizer termination is recorded but is not treated as scientific validity by itself.

No residual outlier is silently removed or down-weighted. The residual table preserves every included reflection and is sorted in the UI for inspection. Researchers exclude a questionable match explicitly and create a new refinement.

## Diagnostics and uncertainty

Results include reference/initial/refined parameters; per-reflection experimental and predicted 2theta, signed delta, observed and predicted d-spacing, hkl, inclusion, and center uncertainty; RMS/mean/maximum absolute 2theta residual; RMS d-spacing residual; rank, parameter count, degrees of freedom, and condition number; optimizer status/message; and included/excluded match IDs.

When the Jacobian is full-rank, the condition number is acceptable, and degrees of freedom are positive, covariance is estimated as `(JᵀJ)⁻¹ * RSS/dof`; parameter standard errors and the covariance/correlation matrices are returned. Otherwise they are `null` with a warning—never zero-filled. These are model/fit uncertainties only and do not represent complete instrument, specimen, assignment, or wavelength uncertainty.

## API, persistence, and provenance

- `POST /v1/xrd/reference/match` and same-origin `/api/xrd/reference/match`
- `POST /v1/xrd/lattice/refine` and same-origin `/api/xrd/lattice/refine`

Pydantic and Zod validate both boundaries. Structured errors include `WAVELENGTH_REQUIRED`, `WAVELENGTH_MISMATCH`, `NO_FITTED_PEAKS`, `NO_MATCHES`, `AMBIGUOUS_ASSIGNMENT`, `INVALID_HKL`, `UNSUPPORTED_CRYSTAL_SYSTEM`, `INSUFFICIENT_INDEPENDENT_REFLECTIONS`, `UNDERDETERMINED_LATTICE`, and `ILL_CONDITIONED_REFINEMENT`.

Dexie schema 15 adds `xrdReferenceMatchingResults` and `xrdLatticeRefinementResults`. Matching records link the exact peak analysis, processed representation, measurement, raw SHA-256, selected reference identity, CIF SHA-256/revision, wavelength, configuration, assignment edits, warnings, timestamps, and scientific versions. Refinements additionally link the exact matching result and retain configuration, parameters, residuals, covariance diagnostics, warnings, and versions. Parent deletion is blocked while descendants exist; refinements must be removed before their matching parent, and Stage 4 matching descendants must be removed before their Stage 3 analysis.

## Validation and limitations

Deterministic synthetic tests cover global one-to-one conflicts, out-of-tolerance and impurity peaks, missing reference peaks, ambiguity, grouped hkls, wavelength mismatch, noise-free cubic/tetragonal/hexagonal/orthorhombic recovery, noisy hexagonal recovery, `00l`-only and `hk0`-only rank failure, explicit outlier exclusion, incorrect hkl residual degradation, covariance behavior, and positive/negative/zero global shifts.

Known limitations: only four orthogonal/high-symmetry systems are supported; refinement is single-reference and peak-position based; wavelength uncertainty is not propagated; Stage 1 must be recalculated externally when wavelengths differ because saved results do not contain CIF text; weighting by fitted-center uncertainty is not enabled; zero shift can remain correlated with sparse lattice data; hkl correctness is ultimately a researcher decision; and no final publication export is provided.

## Recommended Prompt 5 boundary

Prompt 5 should focus on an LMSL reference library, user-uploaded CIF management, curated empirical LMSL XRD references, links from references to samples/batches, integrated workflow cleanup, reference provenance/versioning, and explicit comparison of COD theoretical versus LMSL empirical references. It should not expand Stage 4 into blind identification, phase fractions, or whole-pattern refinement.
