# XRD Stage 6: validation, reproducibility, and publication

## Scope and outcome

Stage 6 closes the lightweight, reference-assisted XRD workflow. It does not add whole-pattern refinement, phase search, phase fractions, unknown indexing, size/strain analysis, or structure solution. The complete persisted path is:

```text
raw bytes -> parsed measurement -> processed representation -> fitted peaks
          -> exact reference revision -> reviewed matches -> lattice refinement
          -> portable project package -> reproducible publication FigureSpec
```

## Internal scientific conventions

The executable source of truth is `lib/xrd/conventions.ts`. Production crystallography uses the same three-index hkl convention as Stage 4.

| Quantity | Internal/persisted convention | Display |
| --- | --- | --- |
| 2theta | degrees | degrees 2theta |
| theta | radians only inside trigonometric calls; never persisted | not shown |
| wavelength | angstrom | angstrom, with exact number |
| d spacing | angstrom | angstrom |
| FWHM | degrees 2theta | degrees 2theta |
| pseudo-Voigt amplitude | integrated area | intensity x degree |
| pseudo-Voigt height | maximum above fitted local background | intensity |
| theoretical intensity | pymatgen-calculated relative intensity, max = 100 | calculated relative intensity |
| measured intensity | imported value, unchanged | raw intensity |
| delta 2theta | experimental minus calculated | signed degrees |
| zero shift | value added to calculated 2theta | signed degrees |
| hkl | three-index `(h k l)` | `(h k l)` plus multiplicity |
| uncertainty | standard error only when covariance is available | null/absent otherwise |

The audit found and fixed one material defect: pymatgen can return hexagonal reflections as four-index Miller-Bravais `(h k i l)`. Earlier code silently retained `(h k i)`. Stage 6 now converts those values explicitly to persisted `(h k l)` before matching or lattice refinement.

## Radiation conventions

| Input | Exact wavelength | Meaning |
| --- | ---: | --- |
| `CuKa` | 1.54184 A | pymatgen's Cu K-alpha weighted-average preset |
| `CuKa1` | 1.54056 A | Cu K-alpha-1 preset |
| explicit | supplied value | no label-based equivalence is inferred |

Saved calculated patterns and matching results retain the exact numeric wavelength. The UI now names the weighted average explicitly and offers Cu K-alpha-1 separately. Matching continues to reject numerically incompatible wavelengths.

## Independent validation report

Automated validation is offline and deterministic.

| Capability | Ground truth / method | Expected | MAXCalc result | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| Silicon cubic (111) d | `a / sqrt(3)`, a = 5.431 A | 3.135589 A | 3.135589 A | absolute error <= 0.00002 A | pass |
| Silicon cubic (111) 2theta | independent Bragg-law expression, Cu K-alpha-1 | 28.44135 deg | 28.44135 deg | absolute error <= 0.0002 deg | pass |
| Cu preset identity | pymatgen preset table | 1.54184 / 1.54056 A | exact stored values | <= 1e-12 A | pass |
| Wavelength movement | same Si structure | longer wavelength moves peaks higher | CuKa peak is higher than CuKa1 | correct direction | pass |
| MAX-like hexagonal (002) | `d = c/2`, c = 18.580 A | 9.290000 A; 9.512275 deg | 9.290000 A; 9.512275 deg | <= 0.00003 A and 0.0003 deg | pass |
| MAX-like hex hkl conversion | pymatgen `(h k i l)` to persisted `(h k l)` | (100), (101), etc. retain physical l | first basal reflections now (100), (101) | exact index mapping | pass |
| Seeded end-to-end MAX-like data | known perturbed a = 3.08115 A, c = 18.55213 A | recover both parameters | recovered within 0.002 A (a) and 0.015 A (c); RMS < 0.03 deg | stated tolerances | pass |
| Project ZIP round trip | clean IndexedDB target | exact arrays/configs/hash; new local IDs | exact values restored and IDs remapped | exact equality | pass |
| Corrupt project entry | mutate peaks JSON without changing manifest | reject | integrity error before insertion | mandatory rejection | pass |
| Vector SVG | inspect generated XML | paths/text, no raster image | vector paths/text; no `<image>` | exact structural check | pass |
| Raster size | independent inch/mm conversion | 1050x750, 2100x1500, 4200x2700 | exact | exact pixels | pass |

### External program comparison

GSAS-II is not installed in the repository or scientific-service environment and was not added as a dependency. Therefore Stage 6 does **not** claim an executed GSAS-II comparison. The local CIFs, exact wavelength/range, plotted-data CSV, and deterministic analytical expectations provide a reproducible handoff for a future external-oracle run. Independent analytical cross-checks cover positions and d spacings; relative intensities are not claimed to be cross-program identical. This limitation must remain visible rather than being replaced by a loose tolerance or an unsupported “validated” label.

## Deterministic MAX-like golden dataset

`tests/fixtures/ti3alc2.cif` is a deterministic Ti3AlC2-like P63/mmc structure fixture. It is not claimed to be a validated experimental specimen. The golden test perturbs a by +0.2% and c by -0.15%, generates seeded pseudo-Voigt peaks over a sloped baseline plus a broad hump and noise, serializes 7,501 text points, then runs the real parser, arPLS, Savitzky-Golay smoothing, SciPy peak detection, LMFit fitting, global one-to-one matching, and hexagonal refinement. It requires at least five successful fitted peaks and four refinement matches.

## Numerical and scientific-status hardening

Stages 2-4 already cover small input, rejected NaN/Inf, descending/duplicate/irregular axes, negative intensity, no peaks, weak/narrow/broad/overlapping/boundary peaks, unavailable covariance, failed fits, no/one/many/ambiguous matches, insufficient rank/degrees of freedom, zero shift, and high residuals. Stage 6 preserves those records immutably and adds explicit computation versus scientific status in the refinement UI. Optimizer completion is not presented as scientific validity. Possible diagnostic states are well constrained, manual review required, underdetermined, high residual, and covariance unavailable.

## Portable project package

The `.maxcalc-xrd.zip` container uses only ZIP, JSON, original raw bytes, CIF, and optional FigureSpec JSON. `manifest.json` is schema `1.0.0` and lists every package entry with SHA-256, byte length, media type, software versions, original record identities, export time, and project name. No absolute filesystem path is written.

Import validates the manifest and every entry hash before opening a write transaction. Measurement, processing, peak, matching, refinement, reference, and reference-revision IDs are remapped consistently. Existing raw content with the same SHA-256 is safely reused; imported IDs never overwrite unrelated local records. Original identities remain in the manifest and imported parser provenance. Saved numerical results are reconstructed without recomputation.

Exact numerical recomputation may differ after scientific-library upgrades. The package records service, Python, NumPy, SciPy, pybaselines, and LMFit versions so that difference is disclosed rather than silently described as byte-identical reproducibility.

## XRD publication architecture

`lib/xrd/publication.ts` reuses the existing publication system's physical-unit conversion and PNG raster service, while adding XRD-specific scientific layers. Its SVG renderer uses full persisted arrays, vector paths/sticks, and text. Interactive preview decimation is never passed into project, CSV, SVG, or PNG export.

Supported controls include physical dimensions, DPI, margins, type sizes, axis range/ticks, measured/processed curves, fitted centers, reference sticks, stick height/thickness/offset, measured and processed visual offsets, explicit max=100 display normalization, y-axis visibility, and hkl label modes (none, matched, strongest N, manual, plus manual hiding in the spec). Simple deterministic staggering reduces label collisions. The FigureSpec records exact source IDs/hashes, layers, transformations, offsets, styles, axes, typography, geometry, and export settings.

Normalization and vertical offsets are display transformations only. They never alter persisted intensity arrays. Measured and calculated intensity are labeled as scientifically distinct.

## Performance profile

The deterministic profiler is `scientific-service/scripts/profile_xrd_stage6.py`. A Windows development run on 2026-09-25 produced:

| Points | parse | Savitzky-Golay | detection | arPLS |
| ---: | ---: | ---: | ---: | ---: |
| 5,000 | 23.8 ms | 12.2 ms | 2.4 ms | 24.5 ms |
| 20,000 | 34.6 ms | 5.6 ms | 2.2 ms | 97.0 ms |
| 100,000 | 160.5 ms | 22.4 ms | 8.5 ms | 330.4 ms |

These are diagnostic observations, not cross-machine guarantees. Parsing and baseline estimation are the largest measured CPU costs. No scientific calculation was weakened. Browser persistence, fitting time, plot rendering, and ZIP time depend strongly on the selected peak count, browser, and hardware and remain observable operation-level concerns rather than universal benchmark numbers.

## Workflow and state safety

The researcher path remains Measurements -> References -> Analyze. Changing a peak analysis, reference CIF hash, or reference revision changes the Stage 4 component key and discards unsaved downstream UI state. A new matching proposal clears prior refinement display; changing a match clears the saved-match identity and refinement; mismatched wavelengths are rejected rather than silently recalculated. Project import remaps and restores lineage, then opens the imported peak analysis.

## Known limitations

- This is reference-assisted peak matching, not phase identification or proof of purity.
- The MAX-like fixture validates deterministic mathematics, not experimental truth.
- No executed GSAS-II comparison is claimed in this environment.
- Baseline and local peak decompositions remain model-dependent and require review.
- hkl collision handling is deterministic and simple, not a general typography optimizer.
- PDF and TIFF remain disabled until cross-platform font embedding is validated.
- Long Python scientific requests are reported and conflicting actions are disabled, but service-side cancellation is not implemented.
- Project import preserves saved results; rerunning them is a separate researcher action.

## Advanced-engine boundary

Rietveld refinement, Pawley/Le Bail fitting, unknown indexing, and quantitative multiphase analysis require a fundamentally more advanced diffraction engine. Evaluate established packages such as GSAS-II for those capabilities rather than extending MAXCalc's lightweight engine.
