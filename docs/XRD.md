# XRD analysis

## Scope

MAXCalc handles one-dimensional powder X-ray diffraction data in a reference-assisted workflow. It preserves the imported file, creates immutable derived analysis records, compares fitted experimental peaks with a researcher-selected crystallographic reference, and refines supported lattice parameters from confirmed hkl assignments.

The normal path is:

```text
Import -> Process -> Peaks -> Reference -> Match -> Lattice -> Export
```

This is not a whole-pattern refinement or automated phase-identification system.

## Experimental data

The import adapter accepts text-based CSV, TSV, TXT, XY, XYE, and DAT files with at least two usable numerical points. It detects common delimiters and can accept explicit column selections when detection is ambiguous. Proprietary or binary instrument formats such as RAW, UXD, BRML, and XRDML are not decoded.

MAXCalc stores the exact uploaded bytes and their SHA-256 hash before parsing. The parsed two-theta and intensity arrays retain their source relationship. Plot decimation changes only the browser preview; it does not replace stored arrays. Processing always creates a child record and never overwrites the raw measurement.

## Processing

Baseline subtraction and smoothing are independent and optional. Both are off in the default configuration.

- **arPLS baseline:** asymmetrically reweighted penalized least squares from `pybaselines`
- **AsLS baseline:** asymmetric least squares from `pybaselines`
- **Savitzky-Golay smoothing:** `scipy.signal.savgol_filter`

When both operations are enabled, MAXCalc applies baseline subtraction first and smoothing second. Saved records include the complete configuration, intermediate arrays, transformation order, warnings, and Python library versions.

Baseline lambda controls smoothness rather than a physical material property. Savitzky-Golay window length and polynomial order affect the displayed and analyzed derived signal, so they should be selected against instrument resolution and peak width. The raw record remains unchanged.

## Peak analysis

Candidate detection uses [`scipy.signal.find_peaks`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.find_peaks.html). Prominence is the vertical separation between a candidate and its surrounding baseline context. Minimum spacing is entered in degrees two-theta and converted using the measured axis spacing.

Each candidate is fitted locally with an [LMFit pseudo-Voigt model](https://lmfit.github.io/lmfit-py/builtin_models.html) and a constant or linear local background. Overlapping candidate windows are fitted as grouped components. Results retain center, center standard error when available, amplitude, height, FWHM, pseudo-Voigt fraction, fit diagnostics, residuals, and component curves.

Researchers can add or remove candidates, exclude candidates, change fit windows, refit, and inspect local residuals. Automatic detection and optimizer completion are not acceptance decisions. Saved peak analyses preserve all manual edits and parent identifiers.

## References

References remain separated by source and evidence type:

- **COD:** a structure retrieved from the [Crystallography Open Database](https://www.crystallography.net/cod/) with source revision and CIF hash
- **User CIF:** a locally supplied crystallographic structure
- **LMSL CIF:** a laboratory-managed crystallographic structure
- **LMSL empirical:** an immutable measured pattern linked to its raw, processing, and peak-analysis lineage

Theoretical powder patterns are calculated from CIF structures with [`pymatgen.analysis.diffraction.xrd.XRDCalculator`](https://pymatgen.org/pymatgen.analysis.diffraction.html). Calculated relative intensities are theoretical and normalized within their pattern. They are not measured intensities and are not quantitatively equivalent to an empirical trace.

Every saved reference change creates a revision. Matching results point to the exact reference revision and CIF hash used. Formula text alone never links an empirical reference to a structure.

## Matching

Matching is position-based and requires an explicit positive experimental wavelength. MAXCalc rejects a mismatch between the experimental wavelength and the wavelength used to calculate the selected reference pattern.

The service constructs candidate experimental and reference pairs within the maximum absolute two-theta tolerance, then uses a global one-to-one assignment. It records unmatched peaks, unmatched reflections, alternative candidates, ambiguity, and researcher changes. Calculated intensity is displayed for review but is not used as a quantitative phase-fraction measurement.

The tolerance is a candidate-search window, not an uncertainty estimate. Review assignments against sample context, instrument calibration, peak overlap, and possible secondary phases before including them in refinement.

## Lattice refinement

MAXCalc refines peak positions for these crystal systems:

| Crystal system | Refined lattice terms |
| --- | --- |
| Cubic | `a` |
| Tetragonal | `a`, `c` |
| Hexagonal | `a`, `c` |
| Orthorhombic | `a`, `b`, `c` |

Refinement uses bounded nonlinear least squares through [`scipy.optimize.least_squares`](https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.least_squares.html). It requires confirmed hkl assignments and enough independent reflections to identify every fitted parameter. Rank, condition number, residuals, covariance availability, and degrees of freedom remain visible.

An optional bounded global two-theta zero shift can be fitted with the lattice terms. This adds a correlated parameter and may make sparse data underdetermined. Enable it only when the dataset can identify it and instrument calibration supports the interpretation.

## Publication figures

The publication editor can layer raw or processed measurements, theoretical reference sticks, fitted peak centers, and selected hkl labels. Display normalization and vertical offsets are recorded in the figure specification and do not change scientific records.

Exports include SVG, deterministic PNG, figure-specification JSON, and plotted-data CSV. Project ZIP export carries the immutable analysis lineage required to inspect or transfer the saved analysis without rerunning every calculation.

## Reproducibility

Saved XRD records include, as applicable:

- raw-file and CIF SHA-256 hashes
- immutable parent identifiers and timestamps
- parser, processing, detection, fitting, matching, and refinement configurations
- manual edits, exclusions, ambiguity decisions, and warnings
- Python, MAXCalc service, NumPy, SciPy, pybaselines, LMFit, and pymatgen versions
- exact reference revision and radiation wavelength

The project package validates hashes and parent relationships during import. A successful package import proves internal consistency, not experimental correctness.

## Scientific limits

MAXCalc XRD does not provide:

- Rietveld refinement
- Pawley or Le Bail fitting
- quantitative phase fractions
- blind identification of unknown phases
- general unknown indexing
- crystallite-size or microstrain analysis
- preferred-orientation correction
- structure solution

Peak fits and lattice-parameter standard errors are conditional on the selected model, assignments, and available covariance. They do not include every source of instrument, wavelength, specimen, calibration, or model uncertainty. Optimizer success is not a scientific validation status.

## Scientific backend

| Task | Backend |
| --- | --- |
| CIF parsing, symmetry, and theoretical patterns | pymatgen |
| Baseline estimation | pybaselines |
| Smoothing and candidate detection | SciPy |
| Local pseudo-Voigt fitting | LMFit |
| Global matching and lattice optimization | SciPy |
| Public structure source | Crystallography Open Database |

Pinned versions are defined in `scientific-service/pyproject.toml`. The web application calls the service through same-origin `/api/xrd` routes; the browser does not receive the service URL or shared token.
