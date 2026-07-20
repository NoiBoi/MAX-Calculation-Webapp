# Scientific engine architecture

## Boundary

`packages/chemistry-engine` is a pure TypeScript package. It has no React, Next.js, browser, IndexedDB, Supabase, network, UI-state, or persistence dependencies. Decimal.js and Zod are its only runtime libraries.

Finite external inputs cross the engine boundary as decimal strings. Exact solver outputs use the discriminated scientific-scalar contract; a rational numerator/denominator is never silently converted into a short decimal. Decimal approximations carry precision and rounding metadata.

## Pipeline

1. Formula parsing and explicit site composition produce canonical elemental composition.
2. Element data lookup distinguishes a valid element symbol from available atomic data.
3. Exact elemental balance matrices preserve deterministic row/column order and rank analysis.
4. The constrained solver uses normalized BigInt rationals and deterministic candidate/tie ordering.
5. Batch calculation applies pre-solver, post-solver, mass-domain, and final-rounding stages in explicit order.
6. Molar mass, purity, retained handling loss, and balance rounding produce final weighing masses.
7. Realized precursor moles and elemental composition are reconstructed from final masses.
8. Structured warnings, errors, residuals, provenance, and trace accompany the result.

## Module responsibilities

- `formula-parser.ts`, `composition.ts`: syntax and flat elemental composition.
- `site-composition.ts`, `site-ratio-normalization.ts`: explicit site models and opt-in grouped normalization.
- `element-data*.ts`, `radius-data.ts`, `descriptors.ts`: versioned scientific datasets and screening descriptors.
- `exact-rational.ts`, `scientific-scalar.ts`, `numeric.ts`: exact and approximate numeric contracts.
- `balance-matrix.ts`: exact deterministic matrix construction and analysis.
- `precursor-solver.ts`: constrained exact solving and verification.
- `molar-mass.ts`: atomic-data-backed mass calculation.
- `batch-calculation.ts`: ordered end-to-end mole-to-mass orchestration.
- `schemas.ts`, `errors.ts`, `validation.ts`: public validation and diagnostic contracts.
- `index.ts`: supported package surface.

## Invariants

Do not change without a dedicated scientific milestone and equivalence evidence:

- canonical JSON byte meaning and object ordering used by digests;
- exact rational normalization or denominator sign;
- Decimal precision, serialization precision, or rounding mode;
- matrix row/column ordering, rank classification, constraint normalization, candidate limit, or tie-breaking;
- error, warning, trace, units, schema, engine, or dataset identifiers;
- distinction among ideal, intended, adjusted, and realized composition;
- distinction between ordinary formulas and explicit crystallographic site occupancy;
- dataset definition, missing-value, source-verification, and approval policy.

## Change procedure

Add a failing regression test first. Document equations and units. Compare representative canonical scientific representations before and after byte-for-byte. Run every engine test plus workspace adapter, persistence, backup, comparison, verification, export, and browser workflows that consume the changed result.

Flat formulas never infer M/A/X occupancy. Radius mismatch remains a screening descriptor, not a stability or synthesis prediction.
