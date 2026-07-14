# MAX Stoich Contributor Instructions

## Product order of operations

Scientific correctness and reproducibility outrank workflow speed, visibility, flexibility, customization, and styling in that order. Follow `docs/IMPLEMENTATION_PLAN.md`; do not skip a blocking decision or invent a chemistry convention.

## Architecture boundaries

- All formula, composition, molar-mass, matrix, solver, adjustment, descriptor, validation, trace, and realized-composition logic belongs in `packages/chemistry-engine`.
- The chemistry engine must not import React, Next.js, browser APIs, Dexie, or persistence adapters.
- UI code consumes the public `calculateRecipe(input: RecipeInput): CalculationResult` API when implemented.
- Finite input quantities cross boundaries as decimal strings. Exact solver outputs use the shared discriminated scientific-scalar contract and may be reduced rationals; decimal approximations are explicitly labeled with precision and rounding metadata.
- Inputs, outputs, data, and snapshots are explicitly versioned.

## Scientific change rules

- Document equations and units.
- Add a failing regression test before fixing a calculation defect.
- Do not add an atomic weight, radius, precursor default, or route without provenance and review status.
- Never mix radius definitions silently. Always label atomic-size mismatch as a screening descriptor.
- Preserve input after errors and return specific actionable warnings.
- Preserve backward compatibility for saved snapshots or provide a tested explicit migration.

## Workflow rules

- Keep routine calculation on `/workspace`; no wizard or required modal.
- Preserve state across standard/advanced mode changes, refresh, and non-destructive navigation.
- Keep defaults visible and editable.
- Provide keyboard and non-drag alternatives for essential actions.
- Do not add cloud/auth dependencies before local workflow validation.

## Definition of done

Run type checking, linting, unit tests, and relevant Playwright tests. Review diffs for unrelated changes. Record unresolved scientific ambiguity as a blocking decision in the appropriate document instead of selecting a plausible value.
