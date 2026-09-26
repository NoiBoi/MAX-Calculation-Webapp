# XRD Stage 1: reference-pattern architecture

## Implemented scope

Stage 1 provides one complete reference-pattern path:

```text
MAXCalc /xrd
  -> same-origin Next.js /api/xrd proxy
  -> isolated FastAPI scientific service
  -> official COD REST API (search + revision-addressable CIF)
  -> pymatgen Structure parser + XRDCalculator
  -> versioned MAXCalc JSON model
  -> theoretical stick plot and reflection table
```

The calculation core accepts CIF text independently of COD at `POST /v1/xrd/pattern/calculate`. COD is one reference adapter, not a required calculation dependency. This is the extension point for LMSL and user CIF sources.

This stage does not process experimental diffraction data, fit peaks, identify phases, refine lattice parameters, or produce publication figures.

## Scientific models and provenance

`scientific-service/maxcalc_science/models.py` defines schema `1.0.0` for reference metadata, lattice, radiation, reflections, grouped hkl contributions, and calculation provenance. Every result records the source type and identifier, retrieval time, available COD revision, publication/DOI fields, CIF SHA-256, wavelength, pymatgen version, service version, and calculation time.

COD pattern requests record the `svnrevision` returned by search. COD's unqualified CIF endpoint is used when that is the current revision; the documented revision-addressable URL is reserved for an explicitly requested older revision because COD does not consistently accept a current global `svnrevision` on the historical endpoint. The CIF hash is authoritative for exact content identity.

## API

- `GET /health`
- `POST /v1/xrd/references/search`
- `POST /v1/xrd/references/cod/{cod_id}/pattern`
- `POST /v1/xrd/pattern/calculate`

FastAPI publishes the complete OpenAPI contract at `/openapi.json`. Pydantic validates the service boundary. Next.js validates inbound requests with Zod and validates scientific responses before rendering them. MAXCalc does not expose raw COD records to the frontend.

Structured errors include `COD_NOT_FOUND`, `COD_UNAVAILABLE`, `CIF_RETRIEVAL_FAILED`, `CIF_PARSE_FAILED`, `INVALID_WAVELENGTH`, `INVALID_TWO_THETA_RANGE` (schema validation is returned as `INVALID_REQUEST`), and `XRD_CALCULATION_FAILED`. Stack traces are not returned.

## Local development

Python 3.11 or newer is required. Python 3.12 is used by the container and verification environment.

```text
cd scientific-service
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[test]"   # Windows
.venv/Scripts/python -m pytest
.venv/Scripts/python -m uvicorn maxcalc_science.main:app --reload --port 8000
```

In another terminal, set `XRD_SCIENCE_SERVICE_URL=http://127.0.0.1:8000`, optionally set the same secret in `XRD_SCIENCE_SERVICE_TOKEN` and `MAXCALC_SERVICE_TOKEN`, and run `npm run dev`.

Docker is an alternative:

```text
docker compose -f compose.xrd.yaml up --build
npm run dev
```

The browser calls only same-origin Next.js routes, so local or production browser CORS configuration is unnecessary.

## Production deployment

The existing Vercel deployment remains responsible for Next.js. Deploy `scientific-service/Dockerfile` to a container service with outbound HTTPS access to `www.crystallography.net`, a health probe on `/health`, and at least 1 GB RAM. Configure its private or TLS URL as server-only `XRD_SCIENCE_SERVICE_URL` in Vercel. Configure matching `XRD_SCIENCE_SERVICE_TOKEN` (Vercel) and `MAXCALC_SERVICE_TOKEN` (Python service). Network policy should restrict direct public access when the platform supports private ingress.

pymatgen, NumPy, SciPy, and crystallographic data make this image materially larger and slower to cold-start than the Next.js app. Keep at least one warm instance for interactive use. CIF responses are cached in memory for one hour per service instance; production can later replace this with a shared immutable cache without changing the domain contract.

## Dependencies and licenses

Direct Python dependencies are pinned to bound intentional upgrades. Transitive packages are resolved by pip during image creation, so production images should also be retained by immutable image digest for exact redeployment:

| Dependency | Purpose | License | Review |
| --- | --- | --- | --- |
| pymatgen 2026.9.24 | CIF parsing, symmetry, powder diffraction | MIT | Active project; official XRD implementation |
| FastAPI 0.141.1 | Validated HTTP/OpenAPI boundary | MIT | Active, widely used |
| HTTPX 0.28.1 | COD HTTPS client and test transport | BSD-3-Clause | Active Encode project |
| Uvicorn 0.53.0 | ASGI production process | BSD-3-Clause | Active Encode project |

pymatgen installs established numerical/transitive dependencies including NumPy and SciPy. GSAS-II, LMFit, and pybaselines are intentionally absent from this stage.

## Scientific validation

Tests use local silicon, sodium-chloride, and zinc-oxide CIF fixtures; they never require COD. Coverage includes malformed/incomplete CIFs, reflections and normalized intensities, grouped hkl/multiplicity, lattice and symmetry output, wavelength-dependent peak shifts, 2θ filtering, determinism, COD normalization/missing fields/network failures/invalid IDs/malformed retrieval/caching, API validation, and local-CIF calculation.

A separate manual integration check should use COD `7221324` (Ti3AlC2, revision returned by COD), then inspect the calculated Cu Kα pattern in `/xrd`. This check requires internet access and is deliberately not part of automated tests.

## Stage 2 boundary

Prompt 2 should add experimental XRD dataset import and a versioned raw-data model only: supported text formats, units, immutable source-file hash, parser provenance, validation, local persistence, and raw-pattern visualization. It may add generic NumPy/SciPy infrastructure required for parsing and resampling. It should not add baseline correction, smoothing, peak detection/fitting, phase matching, hkl assignment, or refinement; those remain later prompts.
