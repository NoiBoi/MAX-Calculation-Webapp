# Constrained Solver Architecture

## Scope

The solver consumes a completed `ElementBalanceMatrix` and returns precursor formula-unit quantities. Its basis is moles of precursor formula units per mole of target formula units. Gram-scale conversion and experimental adjustments are outside this layer.

## Exact arithmetic

Every finite-decimal matrix, requirement, bound, fixed value, and ratio component is converted to a normalized fraction with a `BigInt` numerator and positive `BigInt` denominator. Addition, subtraction, multiplication, division, comparison, dot products, and Gauss-Jordan elimination remain exact. Reduced results use finite canonical decimals where possible and `numerator/denominator` otherwise. JavaScript binary floating point is used only for non-scientific indexes and iteration limits.

## Preprocessing

The solver validates matrix versions/dimensions/maps, constraint versions and references, decimal syntax, objectives, tolerances, and candidate limits. Constraints are canonicalized and sorted. Compatible bounds are intersected; fixed values and equal bounds add exact equalities; ratio locks add `r_b x_a - r_a x_b = 0`. Duplicate records, invalid values, direct bound/fixed conflicts, and inconsistent ratio cycles are detected before optimization. Trace entries retain fixed-column contributions and reduced requirement vectors without mutating the source matrix.

## Optimization algorithm

The feasible set is the intersection of exact equalities and non-negative lower/optional upper bounds. At a vertex, enough variables are at a lower or upper bound to complement the equality rank. The backend deterministically enumerates those bound combinations, solves each resulting determined system exactly, verifies its bounds, and deduplicates exact candidates.

Primary objectives are applied lexicographically. The fallback selects a deterministic feasible vertex. Total-quantity minimization uses `sum(x)`. Precursor preference first minimizes non-preferred quantity and then lower-priority preferred quantities. The final tie-break lexicographically minimizes the ordered quantity vector. Exact active-cardinality minimization is not approximated and is currently unsupported.

## Limits and termination

The default limit is 250,000 examined bound activations. It is checked deterministically and returns `solver-failure` when exceeded. The intended scale is approximately 20 element rows, 30 precursor columns, and 50 constraints, but combinatorial rank/column patterns may hit the candidate limit earlier. Tests exercise 4 × 5, 9 × 12, and 15 × 20 systems. There are no workers, recursion without a finite combination bound, or third-party solver dependencies.

## Independent verification

The selected exact vector is independently multiplied through the original target and precursor-only matrices. Element residuals use scale `max(1, |b|, sum(|A*x|))`; exact solver defaults use zero absolute and relative tolerance. Separate checks cover non-negativity, fixed values, lower/upper bounds, and ratios. A candidate that fails verification produces `solver-failure` and is never returned as usable.

## Determinism and limitations

Stable matrix column order, canonical constraint order, stable pivot search, deterministic combination order, exact comparisons, explicit objectives, and timestamp-free serialization make repeated equivalent calls byte-identical. The backend does not provide numerical conditioning analysis, strict closed-system balancing, mixed-integer cardinality optimization, minimal infeasible subsets, reaction feasibility, phase prediction, or gram-scale quantities.
