# MAXCalc XRD overview

## Architecture

MAXCalc uses a Next.js/React browser application, Dexie/IndexedDB for immutable local records, and a separately deployable FastAPI scientific service. The service delegates crystallographic structure parsing and theoretical powder patterns to pymatgen, baseline estimation to pybaselines, smoothing and peak detection to SciPy, local pseudo-Voigt fitting to LMFit, and numerical refinement to NumPy/SciPy. COD access uses the official COD API through the service; deterministic tests never require the network.

## Pipeline

```text
raw artifact -> parsed measurement -> processed pattern -> fitted peaks
-> immutable reference revision -> reviewed one-to-one matches
-> lattice refinement -> project archive / publication figure
```

Every saved transformation records its exact parent IDs, raw/CIF hashes, configuration, timestamp, and scientific-library versions. Raw bytes, parsed arrays, processed arrays, fit results, and reference revisions are immutable.

## Responsibility boundary

MAXCalc implements orchestration, validation, provenance, immutable persistence, reference revision management, matching configuration/review, supported-system lattice-fit coordination, visualization, portable project packaging, and publication export. It does not implement a replacement crystallography engine or whole-pattern refinement.

Specifically excluded are Rietveld refinement, Pawley or Le Bail fitting, blind phase identification, unknown indexing, automatic multiphase search, quantitative phase fractions, structure solution, preferred-orientation correction, and crystallite-size/microstrain claims.

## Scientific methods and conventions

Positions are persisted in degrees 2theta, wavelengths and d spacings in angstrom, and peak widths in degrees 2theta. Matching residuals are experimental minus calculated. A refined zero shift is added to calculated 2theta. Hexagonal pymatgen four-index output is explicitly converted to three-index hkl before persistence. CuKa means pymatgen's 1.54184 A weighted-average preset; CuKa1 is 1.54056 A. Exact numeric wavelength is always retained.

## Validation

Validation includes deterministic CIF fixtures for cubic, tetragonal, orthorhombic, and hexagonal/MAX-like systems; independent analytical d-spacing and Bragg-law checks; wavelength-shift regression tests; seeded synthetic peak generation; parser through lattice-refinement golden flow; numerical failure tests; hash-corruption rejection; clean-database project round trip; FigureSpec serialization; vector-SVG inspection; and exact physical-size/DPI checks. See `docs/XRD_STAGE_6.md` for the structured results and measured tolerances.

GSAS-II is not a production dependency and was not available for an executed comparison in this environment. MAXCalc therefore makes no GSAS-II validation claim. The portable local fixtures and exact settings are suitable for a separately reviewed external-oracle comparison.

## Routine-use assessment

Within its declared boundary, the feature is designed for routine LMSL reference-assisted analysis: preserve a measurement, process it audibly, fit and review peaks, compare to a known exact reference revision at the same wavelength, refine supported lattice parameters when identifiable, and export a reproducible record or publication figure. It must not be used as evidence of phase purity, quantitative composition, unknown identification, or a whole-pattern crystallographic refinement.

For Rietveld refinement, Pawley/Le Bail fitting, unknown indexing, or quantitative multiphase analysis, evaluate an established engine such as GSAS-II rather than extending MAXCalc's lightweight workflow.
