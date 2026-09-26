# XRD Stage 2: trustworthy experimental-data ingestion

## Implemented scope

Stage 2 adds one deliberately limited data path:

```text
exact uploaded text-file bytes
  -> SHA-256 identity
  -> versioned generic-text parser + explicit settings
  -> immutable parsed measurement and descriptive characterization
  -> local IndexedDB raw artifact + measurement records
  -> faithful raw-intensity plot
```

It performs **no** baseline correction, smoothing, normalization, resampling, reordering, deduplication, peak detection/fitting, phase matching, hkl assignment, lattice refinement, size/strain calculation, or quantitative phase analysis.

## Supported files and parser behavior

The Stage 2 generic delimited-text adapter accepts CSV, TSV, TXT, XY, XYE, and DAT only when the bytes decode as text and contain at least two usable numerical points. An extension is a UI hint, not proof of format. Proprietary/binary vendor RAW, UXD, BRML, XRDML, and other instrument containers are not decoded.

UTF-8 (including a BOM) is preferred; Windows-1252 is an explicit heuristic fallback and is recorded as a warning. The parser detects comma, tab, semicolon, or generic whitespace separation, a leading header region, column names, and likely 2theta/intensity columns. Detection confidence and every choice are returned in `XRDParserProvenance`. Users may override delimiter, header-row count, and both selected columns, then request a new preview. Decimal-comma input is supported with a non-comma delimiter through the API model.

Blank and recognized comment lines (`#`, `;`, and `//`) are ignored intentionally. Once the data region starts, malformed selected-column rows are counted and returned with representative line numbers, excerpts, and reasons. They are never silently discarded. Warnings are bounded to representative examples rather than returning an unbounded list.

## Raw artifact, parsed measurement, and provenance

`RawXRDArtifact` identifies the exact uploaded bytes. SHA-256 is computed before decoding or parsing; filename, MIME type, parser settings, and metadata do not affect the digest. The artifact identifier is derived from that digest. The browser persists the original `Blob` separately from parsed values.

`ExperimentalXRDMeasurement` schema `1.0.0` references both artifact ID and digest and stores explicit `twoThetaDeg` and raw `intensity` arrays. It also stores parser/service versions, detected format and confidence, encoding, delimiter, decimal convention, header region, comment conventions, selected columns, explicit overrides, import time, optional acquisition metadata, validation issues, and descriptive characterization. Re-parsing identical bytes creates another measurement record rather than overwriting an earlier interpretation.

## Validation and characterization

Import is blocked for empty/binary/undecodable files, no numerical data, fewer than two usable points, invalid column selection, and NaN/infinite selected values. Representable but unusual datasets remain unchanged and receive stable warnings for descending or non-monotonic scans, duplicate angles, irregular spacing, negative intensity, rejected data-region rows, and ranges outside 0–180 degrees.

Characterization reports point count, 2theta and intensity extrema, finite-value status, ordering, duplicate count, median absolute step where meaningful, step variation, and rejected-row count. These calculations describe the arrays; they do not modify them.

## API and limits

The same-origin route `POST /api/xrd/data/parse` forwards multipart form data to stateless `POST /v1/xrd/data/parse`. The default limit is 25 MiB and can be changed with matching `XRD_MAX_UPLOAD_BYTES` on Next.js and `MAXCALC_XRD_MAX_UPLOAD_BYTES` on the scientific service. Filenames are reduced to their basename and capped; uploaded content is never executed, written to a server path, or sent to COD/another third party. Structured errors omit stack traces.

## Local persistence and duplicate behavior

Existing Dexie/IndexedDB storage is upgraded to schema 13 with `xrdRawArtifacts` and `xrdMeasurements`. Raw `Blob`s and long arrays are not written to `localStorage`. The library supports reopen, display-name changes, and confirmed deletion. Renaming changes only mutable display metadata. Deleting one interpretation retains a shared raw artifact while another measurement references it; the raw record is removed only with its final local reference.

Content-hash duplicate detection offers existing records to open but does not prohibit a second interpretation. Local XRD records are device/browser data and are not included in cloud synchronization or the LMSL database.

## Visualization

The experimental chart labels 2theta in degrees and raw measured intensity. It adds no peak markers or reference assignments. For more than 12,000 points, only the SVG display path is stride-sampled and the UI states that fact; complete arrays remain persisted unchanged. The calculated COD reference workspace stays separate to avoid implying a scientific match.

## Local development and tests

The scientific service adds `python-multipart` solely for bounded multipart uploads. Install the updated service extras, then run `npm run science:test`. Frontend contracts, persistence, lint/type checks, builds, and Playwright remain in the root scripts. Parser fixtures are local and deterministic; no parser test requires internet access.

## Next scientific layer

Stage 3 should create optional, immutable processed representations from a selected raw measurement: established-library baseline estimation, optional smoothing with recorded parameters, candidate peak detection, local pseudo-Voigt fitting, and manual peak correction. Each result should retain lineage to this Stage 2 measurement and never overwrite its arrays. Reference matching, hkl assignment, lattice refinement, phase fractions, and Rietveld/Pawley/Le Bail work should remain later stages.
