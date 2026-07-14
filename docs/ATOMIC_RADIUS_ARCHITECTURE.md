# Atomic-radius registry and descriptor gate

## Current decision

No atomic-radius dataset is installed or approved. The registry therefore returns `unavailable-no-approved-dataset` and the product displays: **Atomic-radius descriptors unavailable: no approved dataset is installed.** No mean, range, variance, standard deviation, mismatch, element radius, or override calculation is executed.

Enabling calculations requires one laboratory-approved dataset containing a stable ID/name/version, one radius definition, primary source and edition, pm units, coordination/oxidation/spin policies, `block-site-descriptor` missing-value policy, complete values, named reviewer, review date, review record, and SHA-256 content digest. Hand-audited scientific fixtures and tolerance review must accompany approval.

## Registry and validation

`radius-data.ts` defines immutable dataset, source, approval, record, override, recipe-selection, diagnostic, registry, and availability contracts. Validation checks required metadata, positive decimal-string values, real element symbols, duplicate unconditional records, pm-only units, reviewer/date requirements, approval state, and an independently calculated digest. Definitions remain separate; no conversion, fallback, or merged “best radius” table exists.

The content digest covers scientific identity, policies, source, and values. Local approval metadata is excluded so import trust can be downgraded without changing the scientific-content address.

## Persistence and historical behavior

Database schema 4 adds `radiusDatasets` without rewriting immutable recipe revisions or snapshots. New revisions can carry a selected dataset ID/version/digest and provenance-complete overrides. New snapshots have optional fields for that exact selection, explicit site model, and descriptor schema version. Because the current gate is closed, ordinary new records omit those optional fields.

Backups include installed dataset records, versions, and record/global digests. Restore validates content and identity before writing. Imported approval metadata is never trusted: imported datasets are stored as `imported-unverified`. A divergent immutable dataset with the same ID/version is a conflict, never a silent overwrite.

## Future descriptor engine

After approval, the engine—not React—will validate explicit sites, exclude vacancy, normalize occupied fractions, resolve values/overrides, and calculate each site independently using Decimal precision. The future implementation must expose contributions, mean, extrema/range, weighted variance/standard deviation, atomic-size mismatch, trace, warnings, and canonical output. Flat formulas never infer M/A/X sites. Site multiplicity is metadata and does not scale site statistics.

Every future atomic-size mismatch display must retain the visible disclaimer: “Screening descriptor only. It is not a direct prediction of physical stress, lattice strain, phase stability, or synthesis success.”
