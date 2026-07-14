export type ReferenceValidationClass = "synthetic-arithmetic" | "hand-audited" | "spreadsheet-matched" | "laboratory-approved";

export interface ScientificReferenceCase {
  readonly caseId: string;
  readonly category: string;
  readonly targetComposition: string;
  readonly targetSemanticRole: "ideal-crystal" | "intended-feed";
  readonly siteModel: string;
  readonly precursorDefinitions: string;
  readonly precursorConstraints: string;
  readonly batchMassBasis: string;
  readonly adjustments: string;
  readonly atomicDataVersion: string;
  readonly expectedMatrix: string;
  readonly expectedSolverQuantities: string;
  readonly expectedBatchScale: string;
  readonly expectedPrecursorMasses: string;
  readonly expectedFinalRoundedMasses: string;
  readonly expectedRealizedComposition: string;
  readonly expectedResiduals: string;
  readonly expectedWarnings: readonly string[];
  readonly tolerance: string;
  readonly expectedValueSource: string;
  readonly reviewerStatus: string;
  readonly validationClass: ReferenceValidationClass;
}

const pending = "Pending independent spreadsheet or laboratory comparison; no value invented.";
function reference(caseId: string, category: string, targetComposition: string, changes: Partial<ScientificReferenceCase> = {}): ScientificReferenceCase {
  return Object.freeze({ caseId, category, targetComposition, targetSemanticRole: "ideal-crystal", siteModel: "Flat elemental target; no site inference", precursorDefinitions: pending, precursorConstraints: "None", batchMassBasis: "ideal-product-mass", adjustments: "None", atomicDataVersion: "2024.1.0", expectedMatrix: pending, expectedSolverQuantities: pending, expectedBatchScale: pending, expectedPrecursorMasses: pending, expectedFinalRoundedMasses: pending, expectedRealizedComposition: pending, expectedResiduals: pending, expectedWarnings: Object.freeze([]), tolerance: "Exact decimal/rational comparison until an independently reviewed tolerance is recorded.", expectedValueSource: "MAX Stoich deterministic engine fixture; independent reference pending", reviewerStatus: "Provisional — no named laboratory reviewer", validationClass: "synthetic-arithmetic", ...changes });
}

export const SCIENTIFIC_REFERENCE_CASES: readonly ScientificReferenceCase[] = Object.freeze([
  reference("REF-001", "Ti2AlN simple synthetic route", "Ti2AlN", { siteModel: "Explicit 211: M=Ti, A=Al, X=N", precursorDefinitions: "Ti, Al, N elemental synthetic sources", expectedMatrix: "Rows N, Al, Ti; diagonal elemental-source balance", expectedSolverQuantities: "Ti=2, Al=1, N=1 mol/mol target", expectedResiduals: "All target-element residuals exactly 0 before rounding", expectedValueSource: "Hand audit from formula coefficients", validationClass: "hand-audited" }),
  reference("REF-002", "Ti3AlC2 simple synthetic route", "Ti3AlC2", { siteModel: "Explicit 312: M=Ti, A=Al, X=C", precursorDefinitions: "Ti, Al, C elemental synthetic sources", expectedSolverQuantities: "Ti=3, Al=1, C=2 mol/mol target", expectedValueSource: "Hand audit from formula coefficients", validationClass: "hand-audited" }),
  reference("REF-003", "Ti4AlN3 simple synthetic route", "Ti4AlN3", { siteModel: "Explicit 413: M=Ti, A=Al, X=N", precursorDefinitions: "Ti, Al, N elemental synthetic sources", expectedSolverQuantities: "Ti=4, Al=1, N=3 mol/mol target", expectedValueSource: "Hand audit from formula coefficients", validationClass: "hand-audited" }),
  reference("REF-004", "Nb2AlN simple synthetic route", "Nb2AlN", { siteModel: "Explicit 211: M=Nb, A=Al, X=N", precursorDefinitions: "Nb, Al, N elemental synthetic sources" }),
  reference("REF-005", "Mixed Ti/Nb M-site", "(Ti0.5Nb0.5)2AlN", { siteModel: "Explicit 211: M=Ti 0.5 + Nb 0.5, A=Al, X=N", precursorDefinitions: "Ti, Nb, Al, N elemental synthetic sources", expectedSolverQuantities: "Ti=1, Nb=1, Al=1, N=1 mol/mol target", expectedValueSource: "Hand audit from expanded formula", validationClass: "hand-audited" }),
  reference("REF-006", "Mixed C/N X-site", "Ti3Al(C0.5N0.5)2", { siteModel: "Explicit 312: M=Ti, A=Al, X=C 0.5 + N 0.5", precursorDefinitions: "Ti, Al, C, N elemental synthetic sources", expectedSolverQuantities: "Ti=3, Al=1, C=1, N=1 mol/mol target", expectedValueSource: "Hand audit from expanded formula", validationClass: "hand-audited" }),
  reference("REF-007", "Nine-element mixed M-site", "Synthetic nine-element M-site", { siteModel: "Explicit 211 M-site with nine declared occupants", atomicDataVersion: "Synthetic test-only dataset where required", expectedValueSource: "Synthetic arithmetic verification only" }),
  reference("REF-008", "Direct aluminum feed coefficient", "Ti2AlN", { adjustments: "Aluminum per formula = 1.05, pre-solver", expectedSolverQuantities: "Al requirement and elemental Al solution become 1.05 mol/mol target", expectedValueSource: "Hand-audited direct coefficient 1.05", validationClass: "hand-audited" }),
  reference("REF-009", "Precursor-specific excess", "Ti2AlN", { adjustments: "5% Al precursor molar excess, post-solver; no re-solve", expectedResiduals: "Positive Al residual from post-solver excess" }),
  reference("REF-010", "Purity correction", "Ti2AlN", { adjustments: "Al purity 95%; gross mass=pure mass/0.95", expectedWarnings: ["IMPURITY_COMPOSITION_UNMODELED"] }),
  reference("REF-011", "Handling-loss correction", "Ti2AlN", { adjustments: "2% all-precursor handling loss; mass divided by 0.98" }),
  reference("REF-012", "Recovered-product basis", "Ti2AlN", { batchMassBasis: "recovered-product-mass with explicit 80% yield", expectedBatchScale: "Nominal product mass=requested recovered mass/0.8" }),
  reference("REF-013", "Final precursor-mixture basis", "Ti2AlN", { batchMassBasis: "final-precursor-mixture-mass", expectedBatchScale: "Requested mass divided by gross mixture mass per target formula mole" }),
  reference("REF-014", "Balance rounding residual", "Ti2AlN", { adjustments: "Coarse explicit balance increment", expectedResiduals: "Nonzero signed residual from final rounded masses", expectedWarnings: ["MATERIAL_ROUNDING_SHIFT", "REALIZED_RESIDUAL_ABOVE_TOLERANCE"] }),
  reference("REF-015", "Missing required element source", "Ti2AlN", { precursorDefinitions: "Ti and Al only; N source intentionally absent", expectedWarnings: ["MISSING_REQUIRED_ELEMENT_SOURCE", "RANK_INCONSISTENT"] }),
  reference("REF-016", "Non-negative infeasibility", "Synthetic exact linear system", { expectedSolverQuantities: "No accepted solution; algebraic solution requires a negative precursor", expectedWarnings: ["NEGATIVE_PRECURSOR_QUANTITY_REQUIRED"] }),
  reference("REF-017", "Fixed precursor constraint", "Ti2AlN", { precursorConstraints: "One explicit fixed precursor quantity", expectedSolverQuantities: "Fixed quantity honored exactly or structured infeasible-constraints" }),
  reference("REF-018", "Bounded precursor constraint", "Ti2AlN", { precursorConstraints: "Explicit minimum/maximum bounds", expectedSolverQuantities: "Every successful quantity lies within exact bounds" }),
  reference("REF-019", "Ratio constraint", "Ti3 elemental target", { precursorConstraints: "Two Ti sources constrained 2:1", expectedSolverQuantities: "2 and 1 mol/mol target", expectedValueSource: "Hand-audited simultaneous ratio equation", validationClass: "hand-audited" }),
  reference("REF-020", "Precursor-only contaminant element", "Ti", { precursorDefinitions: "TiO2 synthetic source for Ti target", expectedSolverQuantities: "TiO2=1 mol/mol target", expectedRealizedComposition: "Raw totals Ti=1, O=2; O retained as precursor-only", expectedWarnings: ["PRECURSOR_ONLY_ELEMENT"] }),
]);
