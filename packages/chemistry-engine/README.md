# Chemistry Engine

Framework-independent MAX Stoich scientific functions. This package has no React, Next.js, storage, or network dependency.

## Implemented public API

```ts
import {
  DEFAULT_ELEMENT_DATA,
  calculateAtomicFractions,
  calculateMassFractions,
  calculateMolarMass,
  parseFormula,
  serializeComposition,
} from "@max-stoich/chemistry-engine";

const parsed = parseFormula("(Ti0.5Nb0.5)2AlN");
if (parsed.success) {
  // { Ti: "1", Nb: "1", Al: "1", N: "1" }
  parsed.composition.amounts;

  // Atomic-number order; grouping is intentionally not reconstructed.
  serializeComposition(parsed.composition);
  calculateAtomicFractions(parsed.composition);
  calculateMolarMass(parsed.composition, DEFAULT_ELEMENT_DATA);
  calculateMassFractions(parsed.composition, DEFAULT_ELEMENT_DATA);
}
```

Composition utilities include `createComposition`, `addCompositions`, `multiplyComposition`, `totalAtomCount`, `normalizeCompositionToTotal`, `normalizeCompositionRelativeTo`, `compositionsEqualExact`, and `compositionsEqualWithinTolerance`.

Explicit crystallographic site APIs include `createStandardMaxComposition`, `createCustomSiteComposition`, `validateSiteComposition`, `normalizeSiteComposition`, `siteCompositionToElementalComposition`, and `renderSiteComposition`.

```ts
const siteModel = createStandardMaxComposition("211", {
  M: { occupants: [{ element: "Ti", fraction: "0.5" }, { element: "Nb", fraction: "0.5" }] },
  A: { occupants: [{ element: "Al", fraction: "1" }] },
  X: { occupants: [{ element: "N", fraction: "1" }] },
}, { compositionRole: "ideal-crystal" });

if (siteModel.success) {
  renderSiteComposition(siteModel.value.composition); // (Ti0.5Nb0.5)2AlN
  siteCompositionToElementalComposition(siteModel.value.composition);
}
```

Creation is strict by default. `normalizeOccupants` and `normalizeAll` must be selected explicitly and return warnings plus a normalization trace. Vacancy is never hidden; rendering uses `□` plus metadata/warnings. Locks are preserved metadata and do not change scientific arithmetic.

### Deterministic elemental balance matrices

`buildElementBalanceMatrix` accepts a canonical elemental composition or validated site composition plus versioned precursor definitions. Each precursor provides a stable ID, display name, optional order, and either a formula, elemental composition, or both. Dual representations must agree exactly.

```ts
import { analyzeBalanceMatrix, buildElementBalanceMatrix, parseFormula, solvePrecursorBalance } from "@max-stoich/chemistry-engine";

const target = parseFormula("Ti2AlN");
if (target.success) {
  const built = buildElementBalanceMatrix(target.composition, [
    { schemaVersion: "1.0.0", id: "tin", name: "TiN", formula: "TiN" },
    { schemaVersion: "1.0.0", id: "ti", name: "Ti", formula: "Ti" },
    { schemaVersion: "1.0.0", id: "al", name: "Al", formula: "Al" },
  ]);
  if (built.success) {
    // Rows N, Al, Ti; columns al, ti, tin
    built.value.requiredElementMatrix; // [["0","0","1"],["1","0","0"],["0","1","1"]]
    built.value.requirementVector; // ["1", "1", "2"] per target formula unit
    built.value.analysis.matrixRank; // 3
    built.value.analysis.augmentedMatrixRank; // 3
    analyzeBalanceMatrix(built.value); // same standalone exact analysis
  }
}
```

Rows use atomic-number order. Columns use ascending explicit order then stable ID; unordered columns follow ordered columns. Elements introduced only by precursors are preserved in `precursorOnlyElementMatrix`, warned about, and excluded from the default target-only rank calculation. Missing target sources remain as zero rows with blocking diagnostics.

Rank analysis converts canonical finite decimals to normalized `BigInt` fractions and uses deterministic left-to-right, top-to-bottom rational Gauss-Jordan elimination. No JavaScript `number`, tolerance, or rounding participates. Exact near-but-nonzero differences therefore remain independent; a numerical near-dependence advisory is not included yet. The elimination performs roughly cubic rational work for square matrices, while numerator/denominator bit size may grow with coefficient digit count. This release imposes no artificial dimension or digit cap; callers should keep inputs at ordinary laboratory scale. Tested representative sizes are 4 × 5, 9 × 12, and 15 × 20, with no worker or cache required.

`canonicalizeBalanceMatrix` produces the same byte string for equivalent scientific inputs regardless of object order, precursor input order, trailing zeros, or formula-versus-composition representation. Display names and original formula text stay available in column metadata but do not change that scientific serialization.

The matrix API itself only constructs and diagnoses `A x = b`; solving is a separate API layer below.

### Exact constrained precursor solving

`solvePrecursorBalance` now solves matrix quantities in `mol precursor / mol target formula`. It does not calculate grams.

```ts
const matrixResult = buildElementBalanceMatrix(target.composition, [
  { schemaVersion: "1.0.0", id: "al", name: "Al", formula: "Al" },
  { schemaVersion: "1.0.0", id: "n", name: "N", formula: "N" },
  { schemaVersion: "1.0.0", id: "ti", name: "Ti", formula: "Ti" },
]);

if (matrixResult.success) {
  const solved = solvePrecursorBalance(matrixResult.value);
  solved.status; // exact-unique
  solved.quantitiesByPrecursorId; // { al: "1", n: "1", ti: "2" } for Ti2AlN
  solved.elementalResiduals; // one independently verified zero residual per target element
}
```

An underdetermined example can explicitly minimize total precursor formula-unit quantity:

```ts
solvePrecursorBalance(matrix, [], {
  objectives: [{ kind: "minimize-total-quantity" }],
});
```

Fixed, bounded, and ratio constraints are simultaneous:

```ts
solvePrecursorBalance(matrix, [
  { schemaVersion: "1.0.0", mode: "fixed", precursorId: "al", value: "1" },
  { schemaVersion: "1.0.0", mode: "bounded", precursorId: "ti", minimum: "0", maximum: "3" },
  {
    schemaVersion: "1.0.0",
    mode: "ratio",
    numeratorPrecursorId: "ti",
    denominatorPrecursorId: "tin",
    numeratorRatio: "2",
    denominatorRatio: "1",
  },
]);
```

Failures retain precise classifications such as `infeasible-linear`, `infeasible-nonnegative`, and `infeasible-constraints`, with structured explanations. Use `validatePrecursorConstraints` for input checks, `verifyPrecursorSolution` for independent residual/bound/ratio verification, and `canonicalizePrecursorSolution` for byte-stable scientific snapshots.

The internal backend uses normalized `BigInt` fractions and deterministic vertex enumeration; no numerical dependency or binary floating-point result is authoritative. Objectives are applied in explicit order, then ties lexicographically minimize the stable ordered quantity vector. The default limit is 250,000 examined candidates. Representative 4 × 5, 9 × 12, and 15 × 20 systems are tested; a highly combinatorial system returns a structured limit failure instead of hanging. Exact non-terminating results use reduced notation such as `1/3`.

Known solver limitations: exact active-precursor cardinality minimization is deferred and rejected as unsupported, strict closed-system mode is absent, and no numerical conditioning advisory is provided. The solver does not establish reaction feasibility, phase formation, yield, or experimental suitability.

### Batch scaling and final weighing masses

`calculateBatchRecipe` composes the existing composition, matrix, solver, and molar-mass APIs into one immutable result. The input explicitly chooses ideal-product, recovered-product, or final-precursor-mixture mass basis. Only recovered-product basis uses expected yield.

```ts
const target = parseFormula("Ti2AlN");
if (target.success) {
  const recipe = calculateBatchRecipe({
    schemaVersion: "1.0.0",
    idealCrystalComposition: target.composition,
    precursors: [
      { schemaVersion: "1.0.0", id: "ti", name: "Titanium", formula: "Ti" },
      { schemaVersion: "1.0.0", id: "al", name: "Aluminum", formula: "Al", purity: "0.995" },
      { schemaVersion: "1.0.0", id: "n", name: "Nitrogen", formula: "N" },
    ],
    batch: { basis: "ideal-product-mass", requestedMassGrams: "10" },
    adjustments: [
      { schemaVersion: "1.0.0", id: "al-extra", type: "elemental-excess", stage: "pre-solver", element: "Al", fraction: "0.05", order: 0, source: "user" },
      { schemaVersion: "1.0.0", id: "transfer", type: "handling-loss", stage: "mass-domain", label: "Transfer", fraction: "0.02", scope: "all", order: 0, source: "user" },
    ],
    rounding: { adjustmentId: "round", order: 0, incrementGrams: "0.001", mode: "nearest-half-even", residualToleranceMoles: "0.00001", materialityRelativeTolerance: "0.001" },
  });
  recipe.precursors; // final masses, retained masses, realized moles, provenance
  recipe.realizedElements; // signed residual and tolerance result per element
  recipe.trace; // resolved stage-by-stage explanation
}
```

Elemental adjustments change the requirement and trigger a solve. Precursor-specific adjustments apply after that solve and intentionally do not re-solve. Purity is division by `(0,1]`; handling loss is division by retained fraction `(1-L)`; final balance rounding is the only mass rounding step. Realized moles use final gross mass times purity divided by molar mass, while expected retained gross mass is reported separately. `canonicalizeBatchCalculation` supports stable scientific snapshots and `verifyBatchCalculation` independently checks totals and residual consistency.

Molar-mass overrides require g/mol, source, reason, and provenance and remain visible in output and warnings. Unsupported nonlinear adjustments and unsupported bases return structured statuses. No route is claimed experimentally valid, and the engine does not predict reactions, phases, or actual yield.

All fallible functions return a discriminated `success` result with structured, stable error codes. Finite inputs and mass-domain serialized outputs are decimal strings. Exact solver quantities additionally use `ScientificScalar`, a discriminated finite-decimal/rational object with reduced numerator and denominator. `approximateScientificScalar` creates a labeled 50-digit-context, 34-significant-digit, round-half-even approximation without replacing the exact value. Returned compositions, scalar objects, arrays, records, warnings, and trace entries are frozen.

## Important boundaries

Formula parsing produces only a flat elemental vector. It never infers crystallographic sites, structure family, feed meaning, or realized composition. A valid element symbol may parse even when the selected atomic-weight dataset cannot calculate its molar mass.

### Explicit grouped M-site ratios

`normalizeLeadingSiteRatioGroup(formula, { enabled: true, expectedSite: "M" })` is an opt-in API for a single leading mixed M-site ratio group in 211, 312, or 413 notation. It leaves `parseFormula` unchanged. It returns reduced exact occupancies and per-formula coefficients, selectable site-occupancy and expanded formula strings, a generated ideal site model, separate ideal-template and intended-feed metadata/compositions, parsed remainder, warnings, and trace. `(TiVMoTa0.5W1.5)4AlC2.7` therefore retains ideal M4AlC3 metadata while the solver receives exact C2.7 (`27/10`); no missing carbon is restored. `analyzeMaxXComponent` and `replaceMaxXCoefficient` support synchronized positive-decimal C/N editing for unambiguous standard MAX forms. Mixed C/N and unsupported structures remain explicit errors.

The site-occupancy formula contains fractions summing to one inside the M group and applies the M multiplicity once. The expanded formula already contains total M coefficients and never receives another group multiplier. Terminating compositions cross the batch boundary directly; non-terminating rational compositions use a traced common-denominator equivalent without weakening the exact public result.
# Atomic-radius registry

`createAtomicRadiusRegistry`, `validateAtomicRadiusDataset`, `assessRadiusDescriptorAvailability`, and `calculateSiteRadiusDescriptor` expose the framework-independent data and calculation layer. The shipped registry has two source-verified screening datasets and one provisional dataset. A flat formula never supplies site assignments; calculations require an explicit `SiteComposition` and per-site dataset.

Future overrides must match the selected definition and include a reason, source or measurement basis, label, and revision date. Vacancies will be excluded—not assigned radius zero—and any missing occupied value will block the site aggregate. Atomic-size mismatch is always a screening descriptor, never a prediction of stress, strain, stability, or synthesis success.

# Current atomic registries and descriptors

Element schema `2.0.0` distinguishes a valid element from atomic-weight availability. The CIAAW-derived `2024.2.0` registry has all 118 symbols; molar mass returns `MISSING_ATOMIC_WEIGHT` only when a valid record lacks an authoritative calculation value.

Radius schema/descriptor schema `2.0.0` installs separate Teatum metallic, Cordero covalent, and provisional Rahm neutral-isodensity datasets. `calculateSiteRadiusDescriptor` uses Decimal mean/variance/square root/mismatch arithmetic on one explicit site and one explicit dataset; vacancies are excluded and missing values block aggregates. `source-verified` permits exploratory screening but is independent of `lab-approved`.
