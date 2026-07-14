# Chemistry Rules

Status: equations and invariants baseline. Items marked **blocking decision** must be approved before their implementation phase.

## Numeric rules

- Parse finite user inputs as decimal strings. Exact matrix, solver, scaling, mass, and residual arithmetic uses normalized `BigInt` rationals.
- Never use JavaScript `number` for stoichiometric or mass arithmetic.
- Keep internal calculation precision separate from balance/display rounding.
- Round only in an explicit trace step. Do not round intermediate values unless the selected operation requires it.
- Reject non-finite values, locale thousands separators, implicit units, and percentages outside their field policy.
- The milestone decimal context uses 50 significant digits internally and round-half-even.
- Exact solver scalars cross public boundaries as a discriminated `finite-decimal` or `rational` object containing canonical text plus reduced string numerator and denominator. Compatibility strings retain reduced notation such as `1/3`.
- When a decimal approximation is required for presentation or an explicitly decimal consumer, divide numerator by denominator with the 50-significant-digit `ChemistryDecimal` context and round the serialized approximation once to 34 significant digits using round-half-even. Return the approximation beside—not instead of—the exact scalar.
- The default composition-comparison tolerance is `1e-30`; exact comparison uses decimal numeric equality with no tolerance.

## Formula parsing — implemented milestone grammar

```text
formula      = term, { term } ;
term         = element, [ coefficient ] | "(", formula, ")", [ coefficient ] ;
element      = one current IUPAC chemical-element symbol ;
coefficient  = digit, { digit }, [ ".", digit, { digit } ] ;
```

Coefficients are strictly greater than zero; omission means one. Nested groups and fractional group contents are supported. `(Ti0.5Nb0.5)2AlN` therefore produces the flat vector Ti:1, Nb:1, Al:1, N:1. Whitespace is not allowed. `.` is only a decimal point embedded in a coefficient; a standalone period, middle dot, or similar adduct separator is unsupported.

Charges, isotopes, hydration/adduct notation, variables, uncertainty notation, leading formula multipliers, negative/zero coefficients, and malformed decimals are rejected with structured source-positioned errors. The parser preserves original formula text, tokens, and useful partial composition when available.

Element-symbol validity uses the complete IUPAC symbol list and is independent of atomic-weight availability. A formula containing a real element may parse successfully and later fail molar-mass calculation against an incomplete dataset.

Parsing returns only a flat elemental-count map. It never assigns M/A/X sites, structure family, shared-site occupancy, or ideal/feed/realized meaning.

### Explicit leading M-site ratio normalization

`normalizeLeadingSiteRatioGroup` is a separate, opt-in interpretation and does not alter `parseFormula`. It accepts one leading mixed-element group followed immediately by multiplicity 2, 3, or 4 and an unambiguous `AlC...` or `AlN...` remainder with a positive X coefficient. The multiplicity selects the ideal 211, 312, or 413 template only after the caller explicitly enables M-site normalization. Nested groups, vacancies, variables, multiple normalized groups, missing multiplicities, mixed C/N shortcuts, and incompatible remainders are rejected.

For entered ratios `r_i`, ratio sum `R`, and M multiplicity `m`, exact occupied-site fractions are `x_i=r_i/R` and exact formula coefficients are `n_i=m r_i/R`. Both are returned as reduced `ScientificScalar` values. The decimal-only `SiteComposition` receives labeled approximations only where necessary. Terminating intended-feed coefficients such as C2.7 remain exact decimals; non-terminating M vectors use an exactly equivalent common-denominator calculation composition.

The ideal template and intended feed are separate batch inputs. `(TiVMoTa0.5W1.5)4AlC2.7` retains ideal metadata M4AlC3 but sends C2.7 to the pre-solver balance target. The site-occupancy rendering places fractions summing to one inside the group and then applies multiplicity; the expanded rendering contains total per-formula M coefficients and must not receive another multiplier. Original input text is preserved on success and failure. With normalization disabled, the same text retains ordinary grouping semantics.

Canonical serialization defaults to atomic-number order and offers an explicit alphabetical option. This is deterministic infrastructure, not a claim of chemically canonical grouping. It omits coefficients of one and trailing zeros and cannot reconstruct grouping or original token order. The invariant is: parsing a canonical serialization reproduces the same elemental composition exactly.

## Site composition

For each site `s`, multiplicity is `m_s`, occupant fraction is `x_(s,e)`, and vacancy fraction is `v_s`.

Strict normalization requires:

`sum_e x_(s,e) + v_s = 1`

Element count per formula unit is:

`n_e = sum_s m_s * x_(s,e)`

Standard templates are 211 (`M2AX`), 312 (`M3AX2`), and 413 (`M4AX3`). Templates are conveniences, not constraints on custom structures. Occupancy locking controls editor normalization only; it must not silently change chemistry.

### Implemented site model

Every site has an identifier, M/A/X/custom role, optional display label, positive decimal multiplicity, an atomic-number-ordered occupant list, explicit vacancy fraction, and lock metadata. Standard compositions are ordered M → A → X. Custom sites are ordered by identifier. Duplicate occupants are rejected unless creation explicitly selects `duplicateOccupants: "combine"`; combination adds fractions and preserves a lock if either duplicate was locked.

Site compositions carry an explicit semantic role: `ideal-crystal` or `intended-feed`. These roles use the same mathematics but remain distinct values so later feed adjustments cannot overwrite the ideal definition. Flat formulas never infer sites or semantic roles.

### Normalization modes

- `strict`: accepts `sum(x_i) + v = 1` within `1e-30` and does not alter stored values.
- `normalizeOccupants`: holds vacancy `v` fixed and scales occupants by `(1-v)/sum(x_i)`.
- `normalizeAll`: scales occupants and vacancy together by `1/(sum(x_i)+v)`.

Normalization is never implicit. Creation defaults to `strict`; either normalization mode must be selected explicitly. A changed result includes `SITE_NORMALIZATION_APPLIED` and a deterministic trace with before/after totals and scale factors. Locks are metadata only in this milestone and do not alter conversion or normalization mathematics; lock-aware redistribution belongs to a future editor.

Negative/non-finite fractions, vacancy outside `[0,1]`, non-positive multiplicity, invalid elements, duplicate sites/occupants, and an empty occupied site with vacancy other than exactly one are rejected. A fully vacant site is valid. Strict mode distinguishes totals above one from deficient totals.

### Site rendering

Rendering is deterministic display notation, not a formula-parser round trip. Occupants use atomic-number order; M/A/X sites use template order. A single fully occupied element omits parentheses and a coefficient of one. Mixed occupants, partial occupancy where grouping is needed, and vacancies use parentheses. Site multiplicity one is omitted and decimal trailing zeros are removed.

Vacancy is rendered explicitly as `□` by default (or `Va` by option), retained in site metadata, and accompanied by `VACANCY_ANNOTATED`. Custom-site concatenation is ordered by identifier and returns `CUSTOM_SITE_RENDERING` because the flat formula alone cannot reconstruct custom site boundaries.

## Molar mass

For formula counts `n_e` and selected calculation atomic weights `A_e` in g/mol:

`M = sum_e n_e * A_e`

An explicit material molar-mass override takes precedence only for that precursor and appears in warnings/trace/output. Dataset interval values are preserved as provenance, while the dataset's explicit `calculationValue` is used; the engine never invents an interval midpoint.

The implemented molar-mass result includes data version, units, per-element coefficient, selected atomic weight, contribution, mass fraction, source IDs, deterministic data warnings, and an atomic-weight selection trace. A valid formula whose element is absent from the selected dataset returns `MISSING_ATOMIC_WEIGHT`.

## Elemental balance

Let rows be required target elements and columns be precursors. `A_(e,p)` is the exact count of element `e` in one formula unit of precursor `p`; `x_p` is a future precursor-quantity vector; `b_e` is the target elemental coefficient per target formula unit.

`A x = b`

The implemented builder constructs `A` and `b` only; it does not solve for `x`. No target mass, molar mass, purity, excess, yield, or loss scaling enters this milestone. Elemental targets and strictly validated site compositions are accepted. Site targets are converted through the existing API and retain their semantic role and schema metadata. Flat formulas never acquire site meaning.

Primary rows contain target elements only, in atomic-number order with symbol fallback. Every target element remains present even if its row is all zero. Precursor-only elements are recorded in a separate exact matrix with non-blocking warnings; they do not enter default rank analysis because this release does not assume a strict closed system. Lower explicit precursor order values come first, stable ID breaks ties, and unordered precursors follow ordered precursors in ECMAScript code-unit ID order.

A precursor may supply formula, elemental composition, or both. When both are present they must be exactly equal after canonical parsing. IDs must be unique. Display name and original formula are retained for inspection but excluded from the canonical scientific representation; stable ID, canonical composition, final ordering, matrices, metadata, and analysis are included.

All matrix values remain canonical decimal strings. Exact rank converts each finite decimal to a normalized `BigInt` numerator and positive denominator, then performs deterministic rational Gauss-Jordan elimination with left-to-right columns and top-to-bottom pivot search. It reports `rank(A)`, `rank([A|b])`, pivots, dependent/duplicate/proportional/zero columns, nullity, and algebraic degrees of freedom. Equal ranks mean linear consistency only; unequal ranks mean structural inconsistency. Neither result establishes non-negativity, chemical feasibility, reaction products, phase formation, or experimental suitability.

Exact dependence has no tolerance. Values that differ by any exact nonzero decimal remain distinct for rank analysis. A near-dependence advisory is intentionally not implemented in this milestone; future numerical solvers must add a separately documented conditioning analysis without changing exact rank.

Structured diagnostics identify empty targets/lists, missing sources, non-target elements, duplicate IDs/orders/columns, proportional or zero columns, invalid formulas, representation mismatches, and rank inconsistency. Canonical output contains no timestamps, locale operations, random values, React state, or display-only text.

## Constrained precursor solving

The implemented solver defines each `x_p` as moles of precursor formula units per mole of target formula units (`mol precursor / mol target formula`). It never calculates grams. Every accepted solution satisfies `x_p >= 0`; negative algebraic solutions are reported as `infeasible-nonnegative` and are never clamped or made positive.

Constraints are simultaneous exact equations or bounds:

- Fixed: `x_p = f`.
- Bounded: `l_p <= x_p <= u_p`, with default `l_p = 0` and optional `u_p`.
- Ratio: for `x_a:x_b = r_a:r_b`, enforce `r_b x_a - r_a x_b = 0`.
- Exclusion uses an upper bound of zero; no redundant excluded mode exists.

Constraint preprocessing validates versions and precursor references, canonicalizes decimal strings, combines compatible bounds, detects duplicate/directly contradictory constraints and ratio cycles, records fixed-variable contribution and reduced-requirement trace data, and registers exact lower/upper bounds and ratio equalities. Equal bounds behave mathematically as fixed while retaining `bounded` input metadata.

### Exact solver and objectives

Finite decimals become normalized `BigInt` rational numbers. An internal exact vertex enumerator appends enough active lower/upper bounds to the elemental, fixed, and ratio equalities to form determined systems, solves them by rational Gauss-Jordan elimination, rejects bound violations, and independently verifies the selected candidate. The default candidate limit is 250,000. Exceeding it returns `solver-failure`; objectives are never silently changed. The implementation targets ordinary systems through approximately 20 rows, 30 columns, and 50 constraints, but highly combinatorial systems may reach the limit earlier.

Supported ordered objectives are:

1. `deterministic-feasible`: select the lexicographically smallest feasible vertex in stable precursor-column order.
2. `minimize-total-quantity`: minimize `sum_p x_p`.
3. `prefer-precursors`: first minimize total non-preferred quantity, then minimize lower-priority preferred quantities in reverse preference order so earlier IDs receive priority.

Multiple requested objectives are applied lexicographically. Remaining ties lexicographically minimize the ordered quantity vector. Exact cardinality minimization is explicitly deferred and rejected as unsupported; L1 minimization is not mislabeled as active-precursor minimization.

### Verification and classifications

For each element, the solver returns required, reconstructed, signed/absolute/relative residual, scale, tolerance, and pass status. The documented scale is `max(1, |b_e|, sum_p |A_ep x_p|)`, and the allowed elemental residual is `absoluteTolerance + relativeTolerance * scale`. Non-negativity, bounds, ratios, and objective comparison have separate policy fields. The exact backend defaults every tolerance to zero and compares exact rationals; it produces no tiny numerical negatives. `active` therefore means exactly greater than zero.

Statuses distinguish `exact-unique`, `exact-multiple`, `infeasible-linear`, `infeasible-nonnegative`, `infeasible-constraints`, `invalid-input`, and `solver-failure`. Equal matrix ranks establish only algebraic consistency. All successful quantities are independently rechecked against the source matrix and simultaneous constraints.

Precursor-only elements remain outside the default balance equations. Their exact introduced totals and contributing precursors are calculated after solving and returned with non-blocking warnings. Strict closed-system mode remains unsupported because the matrix milestone did not introduce it.

The exact backend may return a reduced rational string such as `1/3` when a solution has no finite decimal representation. Input coefficients and constraints remain finite decimal strings. No numerical conditioning advisory, experimental route preference, chemical-reaction feasibility, phase prediction, or gram-scale calculation is implied.

The shared `ScientificScalar` contract removes ambiguity from that compatibility string. Solver quantity records and ordered result vectors preserve `{ kind, canonical, numerator, denominator }`. Batch scaling reconstructs the exact rational from those integer components and never sends `"1/3"` directly to `decimal.js`. Batch precursor results return the exact formula-relative scalar and a separately labeled decimal approximation with 50-digit calculation precision, 34-digit serialization precision, and round-half-even metadata. `SOLVER_SCALAR_CONVERTED_FOR_MASS_DOMAIN` records this conversion. Current mass-domain equations remain exact rational operations; Decimal is used only for the labeled public approximation of a non-terminating result.

## Scaling to batch mass

For ideal-target molar mass `M_target`, requested mass `m`, expected recovered yield `y`, and unrounded gross mixture mass per target formula mole `G`, the explicit bases are:

- ideal product: `n_formula = m / M_target`
- recovered product: `n_formula = m / (y M_target)`, with explicit `0 < y <= 1`
- final precursor mixture: `n_formula = m / G`

Yield is used only by recovered-product basis. It never modifies ideal-product or mixture-basis scaling. The requested mass, selected basis, nominal product mass, formula moles, final weighing total, and their explicitly named difference are returned. The pipeline never infers a basis.

The intended elemental requirement is scaled from formula moles only after ordered pre-solver feed adjustments are resolved.

## Ordered adjustments

Stages are fixed: direct elemental feed coefficients and advanced elemental excess/deficiency before solving, precursor molar excess/deficiency after solving without re-solving, purity and scoped handling-loss corrections in the mass domain, and final balance rounding. Within a stage, adjustments use ascending explicit `order`, then stable ID. Duplicate order values warn. Each step records before/after values, equation, units, source, and affected entities.

`Aluminum per formula` is the total intended-feed coefficient, never a percentage. If `Al_ideal` is the target/template coefficient and `Al_feed` is entered, the pre-solver requirement is set directly to `Al_feed`; the explanatory relative change is `Al_feed/Al_ideal - 1`. Thus `1.2` means Al1.2 and 20% above an ideal coefficient of 1, while `2.2` means Al2.2 and 120% above ideal. Exact normalized compositions may use an equivalent calculation scale, which is recorded separately in the trace and never changes the displayed per-formula coefficient.

Approved algebraic identity for purity correction, when purity fraction `q` is in `(0,1]`:

`corrected mass = pure-required mass / q`

Approved algebraic identity for final weighing rounding to increment `d`:

`weighing mass = round_mode(corrected mass / d) * d`

Handling loss fraction `L` uses retained-fraction correction: `gross_after = gross_before / (1-L)`. Sequential scoped losses are applied independently and remain visible in the trace. The final gross mass is what is weighed; expected retained gross mass is separately reported as `final gross * product(1-L)`. Per the realized-weighing invariant, realized precursor moles are reconstructed from the final gross weighing mass as `final gross * purity / molar mass`; they therefore show the handling allowance relative to the adjusted requirement.

Elemental excess/deficiency changes the requirement vector before solving. Precursor-specific excess changes a solved precursor amount and therefore may introduce a realized elemental residual. Re-solving after such a change happens only if an explicit later adjustment says so.

## Realized composition and residual

Final rounded precursor moles are recomputed from final gross mass, purity, and the selected molar mass. Their elemental totals form `b_realized`. Residual relative to the batch-scaled adjusted requirement is:

`r_e = b_realized,e - b_adjusted,e`

Realized composition is normalized only for display and is never substituted back into the recipe. Both absolute molar residual and a clearly named relative residual will be available.

Molar mass comes from versioned atomic-weight data unless a positive g/mol override supplies source, reason, provenance, and optional version. Missing selected atomic data blocks mass calculation; it does not make a syntactically valid element unknown. Exact rationals remain authoritative through final rounding; public non-terminating values use the engine decimal serialization.

## Fractions and descriptors

Atomic fraction is `c_e = n_e / sum_j n_j`. Mass fraction is `w_e = n_e A_e / sum_j(n_j A_j)`.

The milestone API exposes canonical decimal fractions, not percentages. Empty/zero compositions are rejected. Returned fraction sums are checked against decimal tolerance; the UI may format percentages later without changing engine values.

For a single site and one approved, internally consistent radius dataset:

`r_bar = sum_i c_i r_i`

`delta = 100 * sqrt(sum_i c_i * (1 - r_i/r_bar)^2)`

`S_config = -R * sum_i c_i ln(c_i)`

Zero-fraction terms contribute zero by continuity. Configurational entropy is reported per mole of that site; multiplicity-weighted totals must be separately labeled. Atomic-size mismatch is a **screening descriptor**, not a direct prediction of stress, phase stability, or lattice distortion. Radius definitions, coordination environments, and units may not be mixed silently.

## Warning invariants

Warnings have stable codes, severity, affected path/entity, actionable message, blocking flag, and suggested action. Blocking errors preserve all input. Required early codes include percent-scale suspicion, invalid purity, non-normalized occupancy, missing element, negative solution, excessive residual, inconsistent units, sub-balance mass, material rounding shift, duplicate precursor, radius-definition mismatch, and unsaved destructive navigation.

## Historical numeric preservation

Persistence never weakens the scientific scalar contract. Exact solver quantities remain reduced rational objects, while required mass arithmetic uses the engine’s documented 50-significant-digit Decimal conversion and half-even policy; its 34-digit serialized approximation is labeled, not substituted for the exact value. Saved historical outputs are immutable. Current-engine recalculation is a separate working result and cannot overwrite an earlier snapshot.
# Comparison and historical-output rules

Comparison performs no chemistry. Every scenario uses the normal end-to-end engine; the difference layer compares canonical existing inputs and outputs. A lower mass, residual, or warning count is a descriptive calculation criterion, not evidence of experimental superiority, phase stability, or synthesis success.

Immutable historical output retains the engine and dataset versions that produced it. Current-engine recalculation is explicit and must preserve the historical result as a distinct state.
# Atomic-radius occupied-site rules

Radius calculations use source-verified data for labeled screening. Vacancy is reported separately and excluded from the occupied distribution: `f_occupied = sum(x_i) = 1-v`, `c_i=x_i/f_occupied`, and `sum(c_i)=1`. Vacancy never receives radius zero. A fully vacant site is unavailable. Any missing occupied-element value blocks aggregates without omission or renormalization. Site statistics are independent of site multiplicity and M/A/X/custom sites are never combined into one unlabeled score.

Implemented screening calculations use `r_mean=sum(c_i r_i)`, `range=max(r_i)-min(r_i)`, `variance=sum(c_i(r_i-r_mean)^2)`, `standardDeviation=sqrt(variance)`, and `delta=100 sqrt(sum(c_i(1-r_i/r_mean)^2))`. Decimal.js uses 50 significant digits internally, 34 for canonical output, half-even rounding, and Decimal square root—not `Math.sqrt`.

# Active radius and diagnostic rules

The equations above are now implemented for explicit sites and source-verified screening datasets. Occupant fractions are normalized over occupied atoms, vacancy is excluded, multiplicity does not affect site statistics, and any missing or qualifier-ambiguous occupant blocks every aggregate without omission. One explicit dataset is selected per site; definitions are never combined into a global mismatch number. Flat formulas never assign M/A/X sites.

Scientific residual calculation/tolerance remains unchanged. Presentation policy `1.0.0` separately considers relative residual and practical rounding context: below 0.1% defaults to minor, 0.1–1% remains minor unless a material balance decision is affected, and above 1% defaults to action required. These are UI defaults, not chemistry acceptance limits.
