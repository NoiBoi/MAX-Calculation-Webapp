# CIAAW atomic-weight ingestion

The authoritative inputs are the official CIAAW [Standard Atomic Weights 2024](https://ciaaw.org/atomic-weights.htm) and [Abridged Standard Atomic Weights 2024](https://ciaaw.org/abridged-atomic-weights.htm), accessed 2026-07-14.

`scripts/data-ingest/import-ciaaw-atomic-weights.ts` retrieves those URLs or consumes pinned local review fixtures, parses table rows deterministically, validates atomic number/symbol order against all 118 IUPAC symbols, preserves intervals and explicit absence, uses published abridged calculation values, generates canonical JSON and a SHA-256 digest, and writes `data/atomic-weight-coverage.json`. Duplicate, missing, or reordered symbols fail ingestion. Parser tests use a small legal fixture; the complete official HTML is not redistributed.

Dataset `2024.2.0` has digest `118c45b66dd312a658965d0d0fe58b88ff68c5764653f2866804c2815b9d3376`, 118 registry records, 84 usable calculation values, and 34 explicit no-standard-weight records. Representative mass numbers are not substituted or mislabeled.
