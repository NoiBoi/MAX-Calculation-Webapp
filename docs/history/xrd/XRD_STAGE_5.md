# XRD Stage 5: versioned reference library and integrated workflow

## Scope

Stage 5 adds a persistent, source-neutral XRD reference layer without changing the scientific engines from Stages 1–4. The analysis lineage is now:

```text
Raw artifact -> measurement -> processing -> peaks
                                         +
                 exact XRD reference revision
                                         |
                              matching -> lattice
```

The implementation still does **not** perform blind phase identification, automatic impurity identification, quantitative phase fractions, Rietveld refinement, Pawley refinement, Le Bail refinement, unknown indexing, structure solution, or machine-learning phase recognition.

## Reference abstraction and sources

`XRDReference` is the searchable current pointer. `XRDReferenceRevision` is the immutable scientific record used by analyses. Supported sources are `COD`, `LMSL_CIF`, `USER_CIF`, `LMSL_EMPIRICAL`, and `USER_EMPIRICAL`. Formula and filename are descriptive fields, never identities.

Each revision records its reference/revision identity, source, display and phase names, formula, tags, notes, validation state, change kind/summary, timestamps, publication metadata, and exactly one discriminated payload:

- `STRUCTURE`: exact CIF text and SHA-256, normalized structure/lattice metadata, COD ID/revision where applicable, calculation configuration/result, and deterministic calculated-pattern SHA-256.
- `EMPIRICAL`: immutable Stage 2 measurement/raw hash, optional Stage 3 processing and curated-peak IDs, wavelength/acquisition metadata, optional sample/batch/recipe IDs, and an optional explicit structure-revision association.

An empirical measurement is never converted into or presented as a calculated CIF pattern. Measured and calculated intensity are labeled separately and use independent display scales.

## CIF and COD library behavior

The existing pymatgen calculation path is reused for uploaded LMSL/user CIFs; there is no second parser or diffraction engine. Uploaded content is bounded and schema validated by the existing API. Exact CIF text returned with the calculated result is stored locally, so a saved COD/CIF reference can be reopened without COD or the scientific service.

Duplicate detection is based primarily on exact CIF SHA-256. An identical CIF may be saved as a separate metadata entry only through an explicit save action, and the UI reports existing identical revisions. Same formula, filename, or COD ID alone does not cause a merge. A different COD revision or changed CIF remains a distinct scientific input.

## Empirical references

A selected immutable Stage 3 peak analysis can be promoted to an LMSL empirical reference. The record points to the original Stage 2/3 objects rather than copying long arrays. It records the raw artifact SHA-256, source filename, acquisition metadata, wavelength, selected processing/analysis IDs, and a hash of the curated fitted-peak set. Raw-only and processed-only empirical payloads are supported by the domain/repository even though the primary UI promotes the currently selected curated analysis.

An optional association points to one exact crystallographic reference revision. It is explicit and editable through a new revision; identical formula text never creates an association. Empirical-only references can be compared visually but cannot provide hkl or lattice equations to Stage 4.

## Revisions, validation, and deletion

Creating or changing a reference inserts a new immutable revision and updates the lightweight current pointer. Scientific payload changes, metadata changes, and validation changes are classified separately. Prior revisions remain readable. Stage 4 results store `referenceId`, `revisionId`, and `revisionNumber`, not a pointer to “latest,” so future edits cannot retroactively change a saved analysis.

Validation states are `UNREVIEWED`, `REVIEWED`, `VALIDATED`, and `DEPRECATED`. New references default to `UNREVIEWED`; saving is never treated as scientific validation. Status changes are explicit revision events with timestamps. No reviewer identity is invented because the current local XRD workflow has no authenticated reviewer model.

References with Stage 4 descendants cannot be destructively removed. Deprecation is the supported lifecycle operation. Unreferenced entries can be deleted transactionally with their revisions.

## Persistence and migration

Dexie schema 16 adds:

- `xrdReferences`: searchable current pointers and denormalized filters.
- `xrdReferenceRevisions`: immutable structure or empirical scientific records, indexed by reference/revision, source, validation state, CIF hash, and time.

The schema 15-to-16 migration creates these stores and records migration metadata. It does not rewrite or delete Stage 1–4 measurements, processing runs, peak analyses, matching results, or refinements. Large empirical arrays remain in Stage 2/3 stores. Exact CIF text lives once per immutable structure revision; calculated patterns carry enough configuration and provenance to reproduce the exact sticks used.

## Stage 4 integration and workflow

The XRD page is organized as **Measurements**, **References**, and **Analyze**. The measurement path remains import -> process -> peaks. The reference area includes live COD search, CIF upload/calculation, saved-library search/filter/detail, empirical promotion, revision history, comparison, validation, and metadata export. Analyze presents the selected lineage before matching and lattice refinement.

Direct Stage 1 COD/CIF patterns remain valid Stage 4 inputs for backward compatibility. Selecting a saved structure supplies the same `CalculatedXRDPattern` consumed previously plus its exact immutable library revision identity. Selecting an empirical reference uses its associated structure only when that association exists. Matching and refinement algorithms remain source-neutral and unchanged.

## Provenance and export

Reference detail exposes source, formula, status, crystal metadata or empirical lineage, CIF/raw hashes, calculated-pattern hash, wavelength, structure association, and revision history. Stage 4 continues to retain raw, processing, peak, matching, refinement, engine/library, configuration, hash, and timestamp provenance in the immutable records. The Analyze selection summary avoids raw UUIDs; expert identifiers remain in stored/exported data.

Metadata JSON export includes the versioned reference identity, revision metadata, provenance, hashes, and parent links while omitting CIF text and calculated arrays. A separate portable single-reference bundle includes the complete immutable revision and can be imported. Import recalculates CIF/pattern hashes, requires exact local Stage 2 lineage for empirical records, validates structure associations, and always creates a new local identity; it cannot overwrite an existing reference. Full-project backup remains separate future scope.

## Sample and batch linkage

MAXCalc does not currently provide a mature shared sample/batch entity suitable for a foreign-key relationship. Empirical revisions therefore expose optional opaque `sampleId`, `batchId`, and `recipeId` fields and preserve the existing `maxcalcSampleId` where supplied. Stage 5 does not create a parallel sample database or extend into a cloud LIMS.

## Performance and security

Library search operates on small denormalized current pointers. Calculated patterns are persisted and reused; they are not regenerated on reopen when CIF hash, wavelength, range, engine, and configuration are unchanged. Experimental arrays continue using the Stage 2 full-data-storage/display-decimation strategy.

CIF and JSON inputs are treated as untrusted. Filenames are metadata rather than paths, content is never executed, React escapes displayed metadata, Zod/Pydantic enforce bounded schemas, and new IDs are generated locally instead of accepting imported overwrite targets.

## Known limitations and next stage

- Reference storage is local to the browser/device; it is not an LMSL cloud collaboration database.
- The UI promotes the selected curated Stage 3 state; lower-level raw-only creation is currently repository/API capability.
- A portable bundle contains one reference revision, not an entire multi-reference project graph.
- Empirical comparison is a transparent overlay, not a new identification or whole-pattern fitting engine.
- Stage 4 supports only its existing cubic, tetragonal, hexagonal, and orthorhombic lattice refinement systems.

Stage 6 should focus on end-to-end scientific QA and publication hardening: external reference-software comparisons, wavelength/convention audit, numerical edge cases, measured performance, final workflow polish, complete reproducibility/export packaging, and publication-quality XRD plots through MAXCalc's existing publication-figure infrastructure. It should not add Rietveld, Pawley, Le Bail, blind identification, or phase-fraction functionality.
