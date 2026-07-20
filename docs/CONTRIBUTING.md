# Contributing to MAXCalc

## Priorities

Scientific correctness and reproducibility outrank workflow speed, visibility, flexibility, customization, and styling. Preserve uncertainty and explicit validation status; do not invent a chemistry convention or provenance value.

## Workflow

1. Read the relevant architecture and contract documents.
2. Inspect the current worktree and preserve unrelated user changes.
3. Record or reproduce the baseline behavior.
4. Add a failing regression test for a defect or contract change.
5. Make one bounded change in the owning layer.
6. Run focused checks, inspect the diff, then run the complete required validation.
7. Document compatibility implications and unresolved ambiguity.

Avoid framework rewrites, speculative abstraction, broad state-management replacement, dependency upgrades mixed into refactors, and migration edits that rewrite history.

## Scientific changes

Keep scientific logic in `packages/chemistry-engine`. Document equations, units, exact/approximate numeric behavior, data source/version, deterministic ordering, errors/warnings, and trace behavior. Do not add or alter atomic data, radii, precursor defaults, or routes without provenance and review status.

## Data and security changes

Never rename released serialized fields, database stores/columns, routes, environment variables, error codes, warning codes, or backup identifiers without an explicit compatible reader/migration and tests. Preserve server-side authorization, RLS, same-origin checks, request bounds, digest verification, idempotency, and account/lab isolation. Service-role code must never enter browser-importable modules.

## UI changes

Routine calculation remains on `/workspace`. Preserve state, keyboard alternatives, accessible names, class names used by tests/print logic, and current responsive/theme/print output. Scientific results must come through the public application adapter/engine boundary.

## Definition of done

TypeScript, ESLint, unit/scientific tests, relevant component/browser/RLS tests, production build, security scan, dependency audit, and diff review pass. No test is skipped to make the change green, and compatibility evidence accompanies every versioned-contract change.
