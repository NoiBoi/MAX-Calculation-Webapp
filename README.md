# MAXCalc

MAXCalc is research software for MAX-phase precursor calculations, electromagnetic interference analysis, and reference-assisted powder X-ray diffraction analysis. It is intended for laboratory researchers who need inspectable calculations, local scientific records, and reproducible exports.

The software is under active laboratory validation. It is not a substitute for independent review of synthesis routes, instrument data, or phase assignments.

## Workspaces

### Stoichiometry

The Calculator converts an explicit target composition and precursor route into final gross weighing masses. It supports 211, 312, and 413 site models, mixed-site compositions, exact elemental balance, constrained precursor solving, purity and handling adjustments, batch scaling, realized-composition checks, immutable recipe revisions, comparison, backups, and print-ready preparation sheets.

Atomic-radius outputs are screening descriptors. They do not predict phase stability, stress, synthesis success, or reaction yield.

### EMI

The EMI workspace imports Keysight complex S-parameter CSV files and calculates forward and reverse reflectance, transmittance, absorptance, and shielding terms. Optional thickness and four-point-probe measurements add conductivity and Simon-model estimates. Publication exports include a reproducible figure specification, SVG, PNG, plotted CSV, and project data.

### XRD

The XRD workspace supports:

- experimental CSV, TSV, TXT, XY, XYE, and DAT import with immutable raw-file hashes
- optional arPLS or AsLS baseline subtraction and Savitzky-Golay smoothing
- SciPy peak-candidate detection and local LMFit pseudo-Voigt fitting
- COD structures, uploaded CIF files, saved local structures, and empirical LMSL references
- reference-assisted, position-based, one-to-one peak and hkl matching
- lattice refinement for cubic, tetragonal, hexagonal, and orthorhombic systems
- immutable analysis lineage, portable project archives, and publication figure export

XRD analysis requires an explicit wavelength and researcher review of peak and hkl assignments. MAXCalc does not perform Rietveld refinement, Pawley or Le Bail fitting, quantitative phase analysis, blind phase identification, general unknown indexing, crystallite-size analysis, or structure solution.

## Running locally

Requirements:

- Node.js 22 or newer
- npm
- Docker with Compose, or Python 3.11 or newer, for XRD calculations

Install and start the web application:

```text
npm install
npm run dev
```

Open `http://localhost:3000`.

The stoichiometry and EMI workspaces run without the Python service. For XRD, copy `.env.example` to `.env.local` and start the scientific service:

```text
docker compose -f compose.xrd.yaml up --build
```

The default `XRD_SCIENCE_SERVICE_URL` is `http://127.0.0.1:8000`. Set the same optional shared token in `XRD_SCIENCE_SERVICE_TOKEN` and `MAXCALC_SERVICE_TOKEN` when the service is not limited to a trusted local network.

To run the service directly on Windows:

```text
python -m venv scientific-service/.venv
scientific-service/.venv/Scripts/python -m pip install -e "scientific-service[test]"
scientific-service/.venv/Scripts/python -m uvicorn maxcalc_science.main:app --app-dir scientific-service --host 127.0.0.1 --port 8000
```

### Optional cloud services

Supabase accounts, synchronization, and private laboratory libraries are optional. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` to enable them. Keep public signup disabled unless the deployment has an approved account policy. The browser never receives the XRD service token or a Supabase service-role key.

## Validation and tests

```text
npm run check
npm run test:e2e
npm run build
npm run science:test
```

`npm run check` runs TypeScript, ESLint, and Vitest. Browser tests cover user workflows and accessibility contracts. The Python suite covers parsing, crystallographic calculations, processing, fitting, matching, refinement, and deterministic XRD validation fixtures.

Synthetic and analytical fixtures verify numerical behavior, persistence, lineage, and failure handling. They do not establish laboratory accuracy, phase formation, or experimental suitability.

## Documentation

Start with the [documentation index](docs/README.md). Primary references include:

- [XRD analysis](docs/XRD.md)
- [EMI analysis](docs/EMI_ANALYSIS.md)
- [chemistry rules](docs/CHEMISTRY_RULES.md)
- [architecture](docs/ARCHITECTURE.md)
- [testing](docs/TESTING.md)
- [deployment](docs/DEPLOYMENT.md)
- [contributing](docs/CONTRIBUTING.md)

## Data, privacy, and persistence

Scientific records are stored in IndexedDB in the current browser profile. Anonymous records and each signed-in account use separate local database namespaces. Clearing site data, using a temporary profile, or changing origins can remove local records. Export verified backups and XRD project packages regularly.

XRD structure search and calculation use the configured Python service. COD searches reach the Crystallography Open Database through that service. Supabase traffic occurs only when cloud features are configured and used.

## Status

Research software under active laboratory validation. Engineering tests do not constitute laboratory approval.

## Authorship and license

MAXCalc is maintained by Matthew Deng for LMSL and ICoN PCL. No open-source license is currently declared in this repository, so reuse rights should not be assumed.
