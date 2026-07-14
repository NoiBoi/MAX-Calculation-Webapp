import type { ElementBalanceMatrix } from "./balance-matrix";
import { chemistryError, type ChemistryError } from "./errors";
import {
  RATIONAL_ONE,
  RATIONAL_ZERO,
  absRational,
  addRational,
  compareRational,
  divideRational,
  dotRationals,
  equalRational,
  makeRational,
  multiplyRational,
  parseExactRational,
  rationalToString,
  solveExactLinearSystem,
  subtractRational,
  sumRationals,
  type ExactRational,
} from "./exact-rational";
import type {
  PrecursorSolverObjective,
  SolverPrecursorConstraint,
  SolverTolerancePolicy,
} from "./schemas";
import { ENGINE_VERSION } from "./version";
import { scientificScalarFromExact, type ScientificScalar } from "./scientific-scalar";

export const PRECURSOR_SOLVER_SCHEMA_VERSION = "1.0.0" as const;
export const DEFAULT_SOLVER_CANDIDATE_LIMIT = 250_000;
export const DEFAULT_SOLVER_TOLERANCES: SolverTolerancePolicy = Object.freeze({
  elementalAbsolute: "0",
  elementalRelative: "0",
  nonnegativity: "0",
  bound: "0",
  ratio: "0",
  objectiveTie: "0",
});

export type PrecursorSolverStatus =
  | "exact-unique"
  | "exact-multiple"
  | "infeasible-linear"
  | "infeasible-nonnegative"
  | "infeasible-constraints"
  | "invalid-input"
  | "solver-failure";

export interface PrecursorSolverOptions {
  readonly schemaVersion?: "1.0.0";
  readonly objectives?: readonly PrecursorSolverObjective[];
  readonly tolerances?: Partial<SolverTolerancePolicy>;
  readonly candidateLimit?: number;
}

export interface SolverDiagnostic {
  readonly code: string;
  readonly severity: "warning" | "error";
  readonly blocking: boolean;
  readonly fieldPath: string;
  readonly message: string;
  readonly suggestedAction?: string;
  readonly precursorIds?: readonly string[];
  readonly element?: string;
}

export interface SolverTraceEntry {
  readonly stepCode: string;
  readonly description: string;
  readonly entityIds: readonly string[];
  readonly inputs: Readonly<Record<string, string>>;
  readonly outputs: Readonly<Record<string, string>>;
}

export interface ElementResidualResult {
  readonly element: string;
  readonly required: string;
  readonly reconstructed: string;
  readonly residual: string;
  readonly absoluteResidual: string;
  readonly relativeResidual?: string;
  readonly scale: string;
  readonly tolerance: string;
  readonly passes: boolean;
}

export interface ConstraintVerificationEntry {
  readonly code: "NONNEGATIVITY" | "FIXED" | "LOWER_BOUND" | "UPPER_BOUND" | "RATIO";
  readonly fieldPath: string;
  readonly precursorIds: readonly string[];
  readonly expected: string;
  readonly actual: string;
  readonly tolerance: string;
  readonly passes: boolean;
}

export interface PrecursorQuantityResult {
  readonly precursorId: string;
  readonly displayName: string;
  readonly columnIndex: number;
  readonly precursorMolesPerTargetFormulaMole: string;
  readonly exactQuantity: ScientificScalar;
  readonly units: "mol precursor / mol target formula";
  readonly isZero: boolean;
  readonly active: boolean;
  readonly fixedValue?: string;
  readonly lowerBound: string;
  readonly upperBound?: string;
  readonly ratioConstraintIndices: readonly number[];
  readonly boundsPass: boolean;
  readonly targetElementContributions: Readonly<Record<string, string>>;
  readonly precursorOnlyElementContributions: Readonly<Record<string, string>>;
}

export interface IntroducedElementResult {
  readonly element: string;
  readonly introducedAmount: string;
  readonly contributingPrecursorIds: readonly string[];
  readonly strictClosedSystemRequested: false;
  readonly warning: string;
}

export interface SolverObjectiveResult {
  readonly requested: readonly PrecursorSolverObjective[];
  readonly appliedOrder: readonly string[];
  readonly values: readonly Readonly<{ kind: string; values: readonly string[] }>[];
  readonly tieBreakingPolicy: "lexicographically-minimize-ordered-quantity-vector";
  readonly multipleFeasibleSolutions: boolean;
  readonly selectionExplanation: string;
}

export interface PrecursorSolverResult {
  readonly schemaVersion: typeof PRECURSOR_SOLVER_SCHEMA_VERSION;
  readonly engineVersion: typeof ENGINE_VERSION;
  readonly sourceBalanceMatrixSchemaVersion: string;
  readonly sourceBalanceMatrixCanonicalRepresentation: string;
  readonly status: PrecursorSolverStatus;
  readonly quantities: readonly PrecursorQuantityResult[];
  readonly quantitiesByPrecursorId: Readonly<Record<string, string>>;
  readonly orderedQuantityVector: readonly string[];
  readonly orderedExactQuantityVector: readonly ScientificScalar[];
  readonly exactQuantitiesByPrecursorId: Readonly<Record<string, ScientificScalar>>;
  readonly quantityBasis: "moles of precursor formula units per mole of target formula units";
  readonly units: "mol precursor / mol target formula";
  readonly reconstructedTargetComposition: Readonly<Record<string, string>>;
  readonly elementalResiduals: readonly ElementResidualResult[];
  readonly precursorOnlyIntroducedElements: readonly IntroducedElementResult[];
  readonly normalizedConstraints: readonly SolverPrecursorConstraint[];
  readonly activeConstraints: readonly SolverPrecursorConstraint[];
  readonly constraintVerification: readonly ConstraintVerificationEntry[];
  readonly objective: SolverObjectiveResult;
  readonly rank: ElementBalanceMatrix["analysis"];
  readonly feasibilityClassification: PrecursorSolverStatus;
  readonly warnings: readonly SolverDiagnostic[];
  readonly errors: readonly SolverDiagnostic[];
  readonly trace: readonly SolverTraceEntry[];
  readonly backend: Readonly<{
    name: "internal-exact-rational-vertex-enumeration";
    version: "1.0.0";
    arithmetic: "normalized BigInt fractions";
    numericalPrecision: null;
    candidateLimit: number;
    candidatesExamined: number;
    exactVerification: true;
  }>;
  readonly tolerances: SolverTolerancePolicy;
  readonly activePrecursorPolicy: "exactly-greater-than-zero";
  readonly canonicalScientificRepresentation: string;
}

export type PrecursorQuantityVector = readonly string[] | Readonly<Record<string, string>>;

interface BoundState {
  lower: ExactRational;
  upper?: ExactRational;
  fixed?: ExactRational;
  modes: Set<string>;
}

interface RatioState {
  readonly numeratorPrecursorId: string;
  readonly denominatorPrecursorId: string;
  readonly numeratorIndex: number;
  readonly denominatorIndex: number;
  readonly numeratorRatio: ExactRational;
  readonly denominatorRatio: ExactRational;
}

interface PreprocessedConstraints {
  readonly valid: boolean;
  readonly errors: readonly ChemistryError[];
  readonly normalized: readonly SolverPrecursorConstraint[];
  readonly bounds: readonly BoundState[];
  readonly ratios: readonly RatioState[];
  readonly equalities: readonly (readonly ExactRational[])[];
  readonly equalityRightHandSide: readonly ExactRational[];
}

interface CandidateEnumeration {
  readonly candidates: readonly (readonly ExactRational[])[];
  readonly examined: number;
  readonly limitExceeded: boolean;
  readonly equalityRank: number;
  readonly equalityInconsistent: boolean;
}

function freezeRecord<T>(value: Record<string, T>): Readonly<Record<string, T>> {
  return Object.freeze({ ...value });
}

function solverDiagnostic(value: SolverDiagnostic): SolverDiagnostic {
  return Object.freeze({ ...value, ...(value.precursorIds ? { precursorIds: Object.freeze([...value.precursorIds]) } : {}) });
}

function traceEntry(stepCode: string, description: string, entityIds: readonly string[] = [], inputs: Record<string, string> = {}, outputs: Record<string, string> = {}): SolverTraceEntry {
  return Object.freeze({ stepCode, description, entityIds: Object.freeze([...entityIds]), inputs: freezeRecord(inputs), outputs: freezeRecord(outputs) });
}

function stableConstraintText(constraint: SolverPrecursorConstraint): string {
  const entries = Object.entries(constraint).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return JSON.stringify(Object.fromEntries(entries));
}

function exactInput(value: unknown, path: string, positive: boolean, errors: ChemistryError[]): ExactRational | undefined {
  if (typeof value !== "string") {
    errors.push(chemistryError("INVALID_SOLVER_CONSTRAINT", "Solver constraint values must be decimal strings.", { fieldPath: path, offendingValue: String(value) }));
    return undefined;
  }
  if (value.includes("/")) {
    errors.push(chemistryError("INVALID_SOLVER_CONSTRAINT", "Solver constraint inputs must be finite decimal strings, not rational-result notation.", { fieldPath: path, offendingValue: value }));
    return undefined;
  }
  try {
    const parsed = parseExactRational(value);
    if (compareRational(parsed, RATIONAL_ZERO) < 0 || (positive && parsed.numerator === 0n)) {
      errors.push(chemistryError("INVALID_SOLVER_CONSTRAINT", positive ? "Ratio components must be finite and greater than zero." : "Constraint quantities must be finite and non-negative.", { fieldPath: path, offendingValue: value }));
      return undefined;
    }
    return parsed;
  } catch {
    errors.push(chemistryError("INVALID_SOLVER_CONSTRAINT", "Invalid finite decimal constraint value.", { fieldPath: path, offendingValue: value }));
    return undefined;
  }
}

function canonicalConstraint(constraint: SolverPrecursorConstraint): SolverPrecursorConstraint {
  if (constraint.mode === "solver") return Object.freeze({ schemaVersion: "1.0.0", mode: "solver", precursorId: constraint.precursorId });
  if (constraint.mode === "fixed") return Object.freeze({ schemaVersion: "1.0.0", mode: "fixed", precursorId: constraint.precursorId, value: rationalToString(parseExactRational(constraint.value)) });
  if (constraint.mode === "bounded") return Object.freeze({ schemaVersion: "1.0.0", mode: "bounded", precursorId: constraint.precursorId, ...(constraint.minimum === undefined ? {} : { minimum: rationalToString(parseExactRational(constraint.minimum)) }), ...(constraint.maximum === undefined ? {} : { maximum: rationalToString(parseExactRational(constraint.maximum)) }) });
  return Object.freeze({ schemaVersion: "1.0.0", mode: "ratio", numeratorPrecursorId: constraint.numeratorPrecursorId, denominatorPrecursorId: constraint.denominatorPrecursorId, numeratorRatio: rationalToString(parseExactRational(constraint.numeratorRatio)), denominatorRatio: rationalToString(parseExactRational(constraint.denominatorRatio)) });
}

function preprocessConstraints(matrix: ElementBalanceMatrix, constraints: readonly SolverPrecursorConstraint[]): PreprocessedConstraints {
  const errors: ChemistryError[] = [];
  const ids = new Set(matrix.columns.map((column) => column.precursorId));
  const bounds: BoundState[] = matrix.columns.map(() => ({ lower: RATIONAL_ZERO, modes: new Set(["solver"]) }));
  const ratios: RatioState[] = [];
  const accepted: SolverPrecursorConstraint[] = [];
  const signatures = new Set<string>();
  const ratioPairValues = new Map<string, ExactRational>();

  constraints.forEach((constraint, inputIndex) => {
    const path = `constraints[${inputIndex}]`;
    if (constraint.schemaVersion !== "1.0.0") {
      errors.push(chemistryError("UNSUPPORTED_SOLVER_SCHEMA_VERSION", "Unsupported solver-constraint schema version.", { fieldPath: `${path}.schemaVersion`, offendingValue: String(constraint.schemaVersion) }));
      return;
    }
    if (!(constraint.mode === "solver" || constraint.mode === "fixed" || constraint.mode === "bounded" || constraint.mode === "ratio")) {
      errors.push(chemistryError("INVALID_SOLVER_CONSTRAINT", `Unsupported solver constraint mode "${String((constraint as { mode?: unknown }).mode)}".`, { fieldPath: `${path}.mode` }));
      return;
    }
    const referenced = constraint.mode === "ratio" ? [constraint.numeratorPrecursorId, constraint.denominatorPrecursorId] : [constraint.precursorId];
    for (const id of referenced) if (!ids.has(id)) errors.push(chemistryError("UNKNOWN_CONSTRAINT_PRECURSOR", `Constraint references unknown precursor ID "${id}".`, { fieldPath: path, offendingValue: id }));
    if (referenced.some((id) => !ids.has(id))) return;
    if (constraint.mode === "ratio" && constraint.numeratorPrecursorId === constraint.denominatorPrecursorId) {
      errors.push(chemistryError("INVALID_SOLVER_CONSTRAINT", "A ratio constraint must reference two different precursor IDs.", { fieldPath: path, offendingValue: constraint.numeratorPrecursorId }));
      return;
    }
    if (constraint.mode === "fixed" && !exactInput(constraint.value, `${path}.value`, false, errors)) return;
    if (constraint.mode === "bounded") {
      if (constraint.minimum !== undefined && !exactInput(constraint.minimum, `${path}.minimum`, false, errors)) return;
      if (constraint.maximum !== undefined && !exactInput(constraint.maximum, `${path}.maximum`, false, errors)) return;
    }
    if (constraint.mode === "ratio") {
      if (!exactInput(constraint.numeratorRatio, `${path}.numeratorRatio`, true, errors)) return;
      if (!exactInput(constraint.denominatorRatio, `${path}.denominatorRatio`, true, errors)) return;
    }
    const canonical = canonicalConstraint(constraint);
    const signature = stableConstraintText(canonical);
    if (signatures.has(signature)) {
      errors.push(chemistryError("DUPLICATE_SOLVER_CONSTRAINT", "An identical solver constraint was provided more than once.", { fieldPath: path, offendingValue: signature }));
      return;
    }
    signatures.add(signature);
    accepted.push(canonical);
  });

  accepted.sort((left, right) => stableConstraintText(left) < stableConstraintText(right) ? -1 : stableConstraintText(left) > stableConstraintText(right) ? 1 : 0);
  for (const constraint of accepted) {
    if (constraint.mode === "ratio") {
      const numeratorIndex = matrix.precursorToColumn[constraint.numeratorPrecursorId]!;
      const denominatorIndex = matrix.precursorToColumn[constraint.denominatorPrecursorId]!;
      const numeratorRatio = parseExactRational(constraint.numeratorRatio);
      const denominatorRatio = parseExactRational(constraint.denominatorRatio);
      const firstId = constraint.numeratorPrecursorId < constraint.denominatorPrecursorId ? constraint.numeratorPrecursorId : constraint.denominatorPrecursorId;
      const secondId = firstId === constraint.numeratorPrecursorId ? constraint.denominatorPrecursorId : constraint.numeratorPrecursorId;
      const firstOverSecond = firstId === constraint.numeratorPrecursorId ? divideRational(numeratorRatio, denominatorRatio) : divideRational(denominatorRatio, numeratorRatio);
      const pairKey = `${firstId}|${secondId}`;
      const previous = ratioPairValues.get(pairKey);
      if (previous && !equalRational(previous, firstOverSecond)) errors.push(chemistryError("CONTRADICTORY_SOLVER_CONSTRAINTS", `Ratio constraints for "${firstId}" and "${secondId}" are contradictory.`, { fieldPath: "constraints", offendingValue: pairKey }));
      else ratioPairValues.set(pairKey, firstOverSecond);
      ratios.push({ numeratorPrecursorId: constraint.numeratorPrecursorId, denominatorPrecursorId: constraint.denominatorPrecursorId, numeratorIndex, denominatorIndex, numeratorRatio, denominatorRatio });
      continue;
    }
    const index = matrix.precursorToColumn[constraint.precursorId]!;
    const state = bounds[index]!;
    state.modes.add(constraint.mode);
    if (constraint.mode === "fixed") {
      const value = parseExactRational(constraint.value);
      if (state.fixed && !equalRational(state.fixed, value)) errors.push(chemistryError("CONTRADICTORY_SOLVER_CONSTRAINTS", `Precursor "${constraint.precursorId}" has conflicting fixed quantities.`, { fieldPath: `constraints.${constraint.precursorId}` }));
      state.fixed = value;
    } else if (constraint.mode === "bounded") {
      if (constraint.minimum !== undefined) {
        const minimum = parseExactRational(constraint.minimum);
        if (compareRational(minimum, state.lower) > 0) state.lower = minimum;
      }
      if (constraint.maximum !== undefined) {
        const maximum = parseExactRational(constraint.maximum);
        if (!state.upper || compareRational(maximum, state.upper) < 0) state.upper = maximum;
      }
    }
  }

  bounds.forEach((state, index) => {
    const id = matrix.columns[index]!.precursorId;
    if (state.upper && compareRational(state.lower, state.upper) > 0) errors.push(chemistryError("CONTRADICTORY_SOLVER_CONSTRAINTS", `Precursor "${id}" has a minimum greater than its maximum.`, { fieldPath: `constraints.${id}` }));
    if (state.fixed) {
      if (compareRational(state.fixed, state.lower) < 0 || (state.upper && compareRational(state.fixed, state.upper) > 0)) errors.push(chemistryError("CONTRADICTORY_SOLVER_CONSTRAINTS", `Precursor "${id}" has a fixed quantity outside its bounds.`, { fieldPath: `constraints.${id}` }));
      state.lower = state.fixed;
      state.upper = state.fixed;
    }
  });

  const ratioGraph = new Map<number, Array<{ to: number; factor: ExactRational }>>();
  for (const ratio of ratios) {
    const quotient = divideRational(ratio.numeratorRatio, ratio.denominatorRatio);
    ratioGraph.set(ratio.denominatorIndex, [...(ratioGraph.get(ratio.denominatorIndex) ?? []), { to: ratio.numeratorIndex, factor: quotient }]);
    ratioGraph.set(ratio.numeratorIndex, [...(ratioGraph.get(ratio.numeratorIndex) ?? []), { to: ratio.denominatorIndex, factor: divideRational(RATIONAL_ONE, quotient) }]);
  }
  const ratioPotentials = new Map<number, ExactRational>();
  for (const start of ratioGraph.keys()) {
    if (ratioPotentials.has(start)) continue;
    ratioPotentials.set(start, RATIONAL_ONE);
    const pending = [start];
    while (pending.length > 0) {
      const current = pending.pop()!;
      for (const edge of ratioGraph.get(current) ?? []) {
        const expected = multiplyRational(ratioPotentials.get(current)!, edge.factor);
        const existing = ratioPotentials.get(edge.to);
        if (existing && !equalRational(existing, expected)) errors.push(chemistryError("CONTRADICTORY_SOLVER_CONSTRAINTS", "The ratio-constraint cycle contains incompatible exact ratios.", { fieldPath: "constraints" }));
        else if (!existing) { ratioPotentials.set(edge.to, expected); pending.push(edge.to); }
      }
    }
  }

  const equalityRows: ExactRational[][] = [];
  const equalityRight: ExactRational[] = [];
  bounds.forEach((state, index) => {
    if (state.fixed || (state.upper && equalRational(state.lower, state.upper))) {
      const row = Array.from({ length: matrix.columns.length }, () => RATIONAL_ZERO);
      row[index] = RATIONAL_ONE;
      equalityRows.push(row);
      equalityRight.push(state.fixed ?? state.lower);
    }
  });
  for (const ratio of ratios) {
    const row = Array.from({ length: matrix.columns.length }, () => RATIONAL_ZERO);
    row[ratio.numeratorIndex] = ratio.denominatorRatio;
    row[ratio.denominatorIndex] = makeRational(-ratio.numeratorRatio.numerator, ratio.numeratorRatio.denominator);
    equalityRows.push(row);
    equalityRight.push(RATIONAL_ZERO);
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    normalized: Object.freeze(accepted),
    bounds: Object.freeze(bounds.map((state) => Object.freeze(state))),
    ratios: Object.freeze(ratios.map((ratio) => Object.freeze(ratio))),
    equalities: Object.freeze(equalityRows.map((row) => Object.freeze(row))),
    equalityRightHandSide: Object.freeze(equalityRight),
  });
}

export function validatePrecursorConstraints(matrix: ElementBalanceMatrix, constraints: readonly SolverPrecursorConstraint[]): Readonly<{ valid: boolean; errors: readonly ChemistryError[]; normalizedConstraints: readonly SolverPrecursorConstraint[] }> {
  const matrixErrors = validateMatrix(matrix);
  if (matrixErrors.length > 0) return Object.freeze({ valid: false, errors: matrixErrors, normalizedConstraints: Object.freeze([]) });
  const result = preprocessConstraints(matrix, constraints);
  return Object.freeze({ valid: result.valid, errors: result.errors, normalizedConstraints: result.normalized });
}

function combinations(count: number, choose: number, visit: (indices: readonly number[]) => boolean): boolean {
  const current: number[] = [];
  function recurse(start: number): boolean {
    if (current.length === choose) return visit(current);
    for (let index = start; index <= count - (choose - current.length); index += 1) {
      current.push(index);
      if (!recurse(index + 1)) return false;
      current.pop();
    }
    return true;
  }
  return recurse(0);
}

function withinBounds(solution: readonly ExactRational[], bounds: readonly BoundState[]): boolean {
  return solution.every((value, index) => compareRational(value, bounds[index]!.lower) >= 0 && (!bounds[index]!.upper || compareRational(value, bounds[index]!.upper!) <= 0));
}

function enumerateCandidates(equalities: readonly (readonly ExactRational[])[], rightHandSide: readonly ExactRational[], bounds: readonly BoundState[], limit: number): CandidateEnumeration {
  const variableCount = bounds.length;
  const base = solveExactLinearSystem(equalities, rightHandSide, variableCount);
  if (base.status === "inconsistent") return Object.freeze({ candidates: Object.freeze([]), examined: 0, limitExceeded: false, equalityRank: base.rank, equalityInconsistent: true });
  const equalityRank = base.rank;
  if (equalityRank === variableCount && base.solution) return Object.freeze({ candidates: Object.freeze(withinBounds(base.solution, bounds) ? [base.solution] : []), examined: 1, limitExceeded: false, equalityRank, equalityInconsistent: false });
  const pinnedCount = variableCount - equalityRank;
  const candidates = new Map<string, readonly ExactRational[]>();
  let examined = 0;
  let limitExceeded = false;
  combinations(variableCount, pinnedCount, (indices) => {
    const choices = indices.map((index) => {
      const state = bounds[index]!;
      return state.upper && !equalRational(state.lower, state.upper) ? [state.lower, state.upper] : [state.lower];
    });
    const assignment: ExactRational[] = [];
    function assign(depth: number): boolean {
      if (depth < choices.length) {
        for (const value of choices[depth]!) { assignment[depth] = value; if (!assign(depth + 1)) return false; }
        return true;
      }
      examined += 1;
      if (examined > limit) { limitExceeded = true; return false; }
      const rows = equalities.map((row) => [...row]);
      const rhs = [...rightHandSide];
      indices.forEach((index, position) => {
        const row = Array.from({ length: variableCount }, () => RATIONAL_ZERO);
        row[index] = RATIONAL_ONE;
        rows.push(row);
        rhs.push(assignment[position]!);
      });
      const solved = solveExactLinearSystem(rows, rhs, variableCount);
      if (solved.status === "unique" && solved.solution && withinBounds(solved.solution, bounds)) {
        const signature = solved.solution.map(rationalToString).join("|");
        candidates.set(signature, solved.solution);
      }
      return true;
    }
    return assign(0);
  });
  return Object.freeze({ candidates: Object.freeze([...candidates.values()]), examined, limitExceeded, equalityRank, equalityInconsistent: false });
}

function validateMatrix(matrix: ElementBalanceMatrix): readonly ChemistryError[] {
  const errors: ChemistryError[] = [];
  if (matrix.schemaVersion !== "1.0.0") errors.push(chemistryError("INVALID_SOLVER_MATRIX", "Unsupported balance-matrix schema version.", { fieldPath: "matrix.schemaVersion", offendingValue: String(matrix.schemaVersion) }));
  if (matrix.requiredElementMatrix.length !== matrix.rows.length || matrix.requirementVector.length !== matrix.rows.length || matrix.columns.length !== matrix.dimensions.columns) errors.push(chemistryError("INVALID_SOLVER_MATRIX", "Balance-matrix dimensions do not agree with metadata.", { fieldPath: "matrix.dimensions" }));
  if (matrix.requiredElementMatrix.some((row) => row.length !== matrix.columns.length)) errors.push(chemistryError("INVALID_SOLVER_MATRIX", "Every balance-matrix row must have one entry per precursor column.", { fieldPath: "matrix.requiredElementMatrix" }));
  matrix.columns.forEach((column, index) => {
    if (matrix.precursorToColumn[column.precursorId] !== index) errors.push(chemistryError("INVALID_SOLVER_MATRIX", `Precursor map does not match column "${column.precursorId}".`, { fieldPath: `matrix.precursorToColumn.${column.precursorId}` }));
  });
  try {
    const values = [...matrix.requiredElementMatrix.flat(), ...matrix.requirementVector];
    if (values.some((value) => value.includes("/"))) throw new Error();
    values.forEach(parseExactRational);
  }
  catch { errors.push(chemistryError("INVALID_SOLVER_MATRIX", "Matrix coefficients and requirements must be exact finite numeric strings.", { fieldPath: "matrix.requiredElementMatrix" })); }
  return Object.freeze(errors);
}

function tolerancePolicy(input: Partial<SolverTolerancePolicy> | undefined, errors: ChemistryError[]): SolverTolerancePolicy {
  const result: Record<keyof SolverTolerancePolicy, string> = { ...DEFAULT_SOLVER_TOLERANCES };
  for (const key of Object.keys(result) as Array<keyof SolverTolerancePolicy>) {
    const raw = input?.[key];
    if (raw === undefined) continue;
    try {
      if (raw.includes("/")) throw new Error();
      const value = parseExactRational(raw);
      if (compareRational(value, RATIONAL_ZERO) < 0) throw new Error();
      result[key] = rationalToString(value);
    } catch { errors.push(chemistryError("INVALID_SOLVER_TOLERANCE", `Solver tolerance "${key}" must be a non-negative decimal string.`, { fieldPath: `options.tolerances.${key}`, offendingValue: String(raw) })); }
  }
  return Object.freeze(result);
}

function normalizeVector(matrix: ElementBalanceMatrix, vector: PrecursorQuantityVector, errors: ChemistryError[]): readonly ExactRational[] {
  const text: readonly string[] = Array.isArray(vector) ? vector : matrix.columns.map((column) => (vector as Readonly<Record<string, string>>)[column.precursorId] ?? "");
  if (text.length !== matrix.columns.length) errors.push(chemistryError("INVALID_SOLVER_MATRIX", "Quantity vector must contain one value per precursor column.", { fieldPath: "solution" }));
  return Object.freeze(matrix.columns.map((column, index) => {
    try { return parseExactRational(text[index] ?? ""); }
    catch { errors.push(chemistryError("INVALID_SOLVER_MATRIX", `Invalid quantity for precursor "${column.precursorId}".`, { fieldPath: `solution.${column.precursorId}`, offendingValue: text[index] })); return RATIONAL_ZERO; }
  }));
}

export interface SolutionVerificationResult {
  readonly valid: boolean;
  readonly errors: readonly ChemistryError[];
  readonly elementalResiduals: readonly ElementResidualResult[];
  readonly constraintVerification: readonly ConstraintVerificationEntry[];
  readonly reconstructedTargetComposition: Readonly<Record<string, string>>;
}

function verifyExact(matrix: ElementBalanceMatrix, values: readonly ExactRational[], preprocessed: PreprocessedConstraints, tolerances: SolverTolerancePolicy): SolutionVerificationResult {
  const residuals: ElementResidualResult[] = [];
  const reconstructed: Record<string, string> = {};
  matrix.rows.forEach((row, rowIndex) => {
    const coefficients = matrix.requiredElementMatrix[rowIndex]!.map(parseExactRational);
    const actual = dotRationals(coefficients, values);
    const required = parseExactRational(matrix.requirementVector[rowIndex]!);
    const residual = subtractRational(actual, required);
    const absolute = absRational(residual);
    const scale = [RATIONAL_ONE, absRational(required), sumRationals(coefficients.map((coefficient, index) => absRational(multiplyRational(coefficient, values[index]!))))].reduce((maximum, value) => compareRational(value, maximum) > 0 ? value : maximum, RATIONAL_ONE);
    const tolerance = addRational(parseExactRational(tolerances.elementalAbsolute), multiplyRational(parseExactRational(tolerances.elementalRelative), scale));
    reconstructed[row.element] = rationalToString(actual);
    residuals.push(Object.freeze({ element: row.element, required: rationalToString(required), reconstructed: rationalToString(actual), residual: rationalToString(residual), absoluteResidual: rationalToString(absolute), ...(required.numerator === 0n ? {} : { relativeResidual: rationalToString(divideRational(absolute, absRational(required))) }), scale: rationalToString(scale), tolerance: rationalToString(tolerance), passes: compareRational(absolute, tolerance) <= 0 }));
  });
  const checks: ConstraintVerificationEntry[] = [];
  values.forEach((value, index) => {
    const id = matrix.columns[index]!.precursorId;
    const state = preprocessed.bounds[index]!;
    const nonnegativeTolerance = parseExactRational(tolerances.nonnegativity);
    checks.push(Object.freeze({ code: "NONNEGATIVITY", fieldPath: `quantities.${id}`, precursorIds: Object.freeze([id]), expected: ">= 0", actual: rationalToString(value), tolerance: tolerances.nonnegativity, passes: compareRational(value, makeRational(-nonnegativeTolerance.numerator, nonnegativeTolerance.denominator)) >= 0 }));
    if (state.fixed) checks.push(Object.freeze({ code: "FIXED", fieldPath: `constraints.${id}`, precursorIds: Object.freeze([id]), expected: rationalToString(state.fixed), actual: rationalToString(value), tolerance: tolerances.bound, passes: compareRational(absRational(subtractRational(value, state.fixed)), parseExactRational(tolerances.bound)) <= 0 }));
    checks.push(Object.freeze({ code: "LOWER_BOUND", fieldPath: `constraints.${id}.minimum`, precursorIds: Object.freeze([id]), expected: `>= ${rationalToString(state.lower)}`, actual: rationalToString(value), tolerance: tolerances.bound, passes: compareRational(value, subtractRational(state.lower, parseExactRational(tolerances.bound))) >= 0 }));
    if (state.upper) checks.push(Object.freeze({ code: "UPPER_BOUND", fieldPath: `constraints.${id}.maximum`, precursorIds: Object.freeze([id]), expected: `<= ${rationalToString(state.upper)}`, actual: rationalToString(value), tolerance: tolerances.bound, passes: compareRational(value, addRational(state.upper, parseExactRational(tolerances.bound))) <= 0 }));
  });
  preprocessed.ratios.forEach((ratio, index) => {
    const actual = subtractRational(multiplyRational(ratio.denominatorRatio, values[ratio.numeratorIndex]!), multiplyRational(ratio.numeratorRatio, values[ratio.denominatorIndex]!));
    checks.push(Object.freeze({ code: "RATIO", fieldPath: `constraints.ratios[${index}]`, precursorIds: Object.freeze([ratio.numeratorPrecursorId, ratio.denominatorPrecursorId]), expected: "0", actual: rationalToString(actual), tolerance: tolerances.ratio, passes: compareRational(absRational(actual), parseExactRational(tolerances.ratio)) <= 0 }));
  });
  return Object.freeze({ valid: residuals.every((item) => item.passes) && checks.every((item) => item.passes), errors: Object.freeze([]), elementalResiduals: Object.freeze(residuals), constraintVerification: Object.freeze(checks), reconstructedTargetComposition: freezeRecord(reconstructed) });
}

export function verifyPrecursorSolution(matrix: ElementBalanceMatrix, solution: PrecursorQuantityVector, constraints: readonly SolverPrecursorConstraint[] = [], tolerances: SolverTolerancePolicy = DEFAULT_SOLVER_TOLERANCES): SolutionVerificationResult {
  const errors = [...validateMatrix(matrix)];
  const preprocessed = preprocessConstraints(matrix, constraints);
  errors.push(...preprocessed.errors);
  const values = normalizeVector(matrix, solution, errors);
  const canonicalTolerances = tolerancePolicy(tolerances, errors);
  if (errors.length > 0) return Object.freeze({ valid: false, errors: Object.freeze(errors), elementalResiduals: Object.freeze([]), constraintVerification: Object.freeze([]), reconstructedTargetComposition: Object.freeze({}) });
  return verifyExact(matrix, values, preprocessed, canonicalTolerances);
}

function compareVectors(left: readonly ExactRational[], right: readonly ExactRational[]): number {
  for (let index = 0; index < left.length; index += 1) { const comparison = compareRational(left[index]!, right[index]!); if (comparison !== 0) return comparison; }
  return 0;
}

function objectiveMetrics(candidate: readonly ExactRational[], objectives: readonly PrecursorSolverObjective[], matrix: ElementBalanceMatrix): readonly ExactRational[] {
  const metrics: ExactRational[] = [];
  for (const objective of objectives) {
    if (objective.kind === "deterministic-feasible") metrics.push(...candidate);
    if (objective.kind === "minimize-total-quantity") metrics.push(sumRationals(candidate));
    if (objective.kind === "prefer-precursors") {
      const preferred = new Set(objective.precursorIds);
      metrics.push(sumRationals(candidate.filter((_, index) => !preferred.has(matrix.columns[index]!.precursorId))));
      [...objective.precursorIds].reverse().forEach((id) => metrics.push(candidate[matrix.precursorToColumn[id]!]!));
    }
  }
  return metrics;
}

function chooseCandidate(candidates: readonly (readonly ExactRational[])[], objectives: readonly PrecursorSolverObjective[], matrix: ElementBalanceMatrix): readonly ExactRational[] {
  return [...candidates].sort((left, right) => {
    const leftMetrics = objectiveMetrics(left, objectives, matrix);
    const rightMetrics = objectiveMetrics(right, objectives, matrix);
    const metricComparison = compareVectors(leftMetrics, rightMetrics);
    return metricComparison || compareVectors(left, right);
  })[0]!;
}

function defaultObjective(): readonly PrecursorSolverObjective[] {
  return Object.freeze([Object.freeze({ kind: "deterministic-feasible" as const })]);
}

function validateObjectives(matrix: ElementBalanceMatrix, input: readonly PrecursorSolverObjective[] | undefined, errors: ChemistryError[]): readonly PrecursorSolverObjective[] {
  const objectives = input && input.length > 0 ? input : defaultObjective();
  const normalized: PrecursorSolverObjective[] = [];
  objectives.forEach((objective, index) => {
    if (!(objective.kind === "deterministic-feasible" || objective.kind === "minimize-total-quantity" || objective.kind === "prefer-precursors")) {
      errors.push(chemistryError("UNSUPPORTED_SOLVER_OBJECTIVE", `Unsupported solver objective "${String((objective as { kind?: unknown }).kind)}". Cardinality minimization is deferred rather than approximated.`, { fieldPath: `options.objectives[${index}].kind` }));
      return;
    }
    if (objective.kind === "prefer-precursors") {
      const seen = new Set<string>();
      for (const id of objective.precursorIds ?? []) {
        if (matrix.precursorToColumn[id] === undefined) errors.push(chemistryError("UNKNOWN_CONSTRAINT_PRECURSOR", `Preferred precursor ID "${id}" is unknown.`, { fieldPath: `options.objectives[${index}].precursorIds`, offendingValue: id }));
        if (seen.has(id)) errors.push(chemistryError("INVALID_SOLVER_CONSTRAINT", `Preferred precursor ID "${id}" is duplicated.`, { fieldPath: `options.objectives[${index}].precursorIds`, offendingValue: id }));
        seen.add(id);
      }
      if ((objective.precursorIds ?? []).length === 0) errors.push(chemistryError("INVALID_SOLVER_CONSTRAINT", "A precursor-preference objective requires at least one ID.", { fieldPath: `options.objectives[${index}].precursorIds` }));
      normalized.push(Object.freeze({ kind: "prefer-precursors", precursorIds: Object.freeze([...(objective.precursorIds ?? [])]) }));
    } else normalized.push(Object.freeze({ kind: objective.kind }));
  });
  return Object.freeze(normalized);
}

function objectiveResult(objectives: readonly PrecursorSolverObjective[], selected: readonly ExactRational[] | undefined, multiple: boolean, matrix: ElementBalanceMatrix): SolverObjectiveResult {
  const values = objectives.map((objective) => Object.freeze({ kind: objective.kind, values: Object.freeze(selected ? objectiveMetrics(selected, [objective], matrix).map(rationalToString) : []) }));
  return Object.freeze({ requested: Object.freeze([...objectives]), appliedOrder: Object.freeze(objectives.map((objective) => objective.kind)), values: Object.freeze(values), tieBreakingPolicy: "lexicographically-minimize-ordered-quantity-vector", multipleFeasibleSolutions: multiple, selectionExplanation: selected ? `Selected by ${objectives.map((objective) => objective.kind).join(" then ")}, followed by lexicographic minimization in stable column order.` : "No feasible candidate was selected." });
}

function resultCanonical(value: Omit<PrecursorSolverResult, "canonicalScientificRepresentation">): string {
  return JSON.stringify({ schemaVersion: value.schemaVersion, engineVersion: value.engineVersion, sourceBalanceMatrixSchemaVersion: value.sourceBalanceMatrixSchemaVersion, sourceBalanceMatrixCanonicalRepresentation: value.sourceBalanceMatrixCanonicalRepresentation, status: value.status, orderedQuantityVector: value.orderedQuantityVector, orderedExactQuantityVector: value.orderedExactQuantityVector, quantityBasis: value.quantityBasis, units: value.units, reconstructedTargetComposition: value.reconstructedTargetComposition, elementalResiduals: value.elementalResiduals, precursorOnlyIntroducedElements: value.precursorOnlyIntroducedElements, normalizedConstraints: value.normalizedConstraints, activeConstraints: value.activeConstraints, constraintVerification: value.constraintVerification, objective: value.objective, rank: value.rank, warnings: value.warnings.map((item) => ({ code: item.code, fieldPath: item.fieldPath, precursorIds: item.precursorIds, element: item.element })), errors: value.errors.map((item) => ({ code: item.code, fieldPath: item.fieldPath, precursorIds: item.precursorIds, element: item.element })), trace: value.trace, backend: value.backend, tolerances: value.tolerances, activePrecursorPolicy: value.activePrecursorPolicy });
}

function finalize(value: Omit<PrecursorSolverResult, "canonicalScientificRepresentation">): PrecursorSolverResult {
  return Object.freeze({ ...value, canonicalScientificRepresentation: resultCanonical(value) });
}

export function canonicalizePrecursorSolution(result: PrecursorSolverResult): string {
  return resultCanonical(result);
}

function emptyResult(matrix: ElementBalanceMatrix, status: PrecursorSolverStatus, constraints: readonly SolverPrecursorConstraint[], objectives: readonly PrecursorSolverObjective[], tolerances: SolverTolerancePolicy, errors: readonly SolverDiagnostic[], warnings: readonly SolverDiagnostic[], trace: readonly SolverTraceEntry[], candidateLimit: number, examined: number): PrecursorSolverResult {
  const objective = objectiveResult(objectives, undefined, false, matrix);
  return finalize({ schemaVersion: PRECURSOR_SOLVER_SCHEMA_VERSION, engineVersion: ENGINE_VERSION, sourceBalanceMatrixSchemaVersion: matrix.schemaVersion, sourceBalanceMatrixCanonicalRepresentation: matrix.canonicalScientificRepresentation, status, quantities: Object.freeze([]), quantitiesByPrecursorId: Object.freeze({}), orderedQuantityVector: Object.freeze([]), orderedExactQuantityVector: Object.freeze([]), exactQuantitiesByPrecursorId: Object.freeze({}), quantityBasis: "moles of precursor formula units per mole of target formula units", units: "mol precursor / mol target formula", reconstructedTargetComposition: Object.freeze({}), elementalResiduals: Object.freeze([]), precursorOnlyIntroducedElements: Object.freeze([]), normalizedConstraints: Object.freeze([...constraints]), activeConstraints: Object.freeze([]), constraintVerification: Object.freeze([]), objective, rank: matrix.analysis, feasibilityClassification: status, warnings: Object.freeze([...warnings]), errors: Object.freeze([...errors]), trace: Object.freeze([...trace]), backend: Object.freeze({ name: "internal-exact-rational-vertex-enumeration", version: "1.0.0", arithmetic: "normalized BigInt fractions", numericalPrecision: null, candidateLimit, candidatesExamined: examined, exactVerification: true }), tolerances, activePrecursorPolicy: "exactly-greater-than-zero" });
}

export function solvePrecursorBalance(matrix: ElementBalanceMatrix, constraints: readonly SolverPrecursorConstraint[] = [], options: PrecursorSolverOptions = {}): PrecursorSolverResult {
  const validationErrors = [...validateMatrix(matrix)];
  if (options.schemaVersion !== undefined && options.schemaVersion !== "1.0.0") validationErrors.push(chemistryError("UNSUPPORTED_SOLVER_SCHEMA_VERSION", "Unsupported precursor-solver options schema version.", { fieldPath: "options.schemaVersion", offendingValue: String(options.schemaVersion) }));
  const tolerances = tolerancePolicy(options.tolerances, validationErrors);
  const objectives = validateObjectives(matrix, options.objectives, validationErrors);
  const candidateLimit = options.candidateLimit ?? DEFAULT_SOLVER_CANDIDATE_LIMIT;
  if (!Number.isSafeInteger(candidateLimit) || candidateLimit <= 0) validationErrors.push(chemistryError("INVALID_SOLVER_CONSTRAINT", "Candidate limit must be a positive safe integer.", { fieldPath: "options.candidateLimit", offendingValue: String(candidateLimit) }));
  const preprocessed = preprocessConstraints(matrix, constraints);
  const directConflicts = preprocessed.errors.filter((error) => error.code === "CONTRADICTORY_SOLVER_CONSTRAINTS");
  validationErrors.push(...preprocessed.errors.filter((error) => error.code !== "CONTRADICTORY_SOLVER_CONSTRAINTS"));
  const trace: SolverTraceEntry[] = [traceEntry("SOLVER_INPUT_ACCEPTED", "Balance matrix and solver options accepted for validation.", [], { matrixSchemaVersion: matrix.schemaVersion }, { precursorCount: String(matrix.columns.length) }), traceEntry("CONSTRAINTS_CANONICALIZED", "Constraints canonicalized and sorted independently of input order.", [], { constraintCount: String(constraints.length) }, { normalizedConstraintCount: String(preprocessed.normalized.length) })];
  if (validationErrors.length > 0) {
    const diagnostics = validationErrors.map((error) => solverDiagnostic({ code: error.code, severity: "error", blocking: true, fieldPath: error.fieldPath ?? "", message: error.message, ...(error.suggestedCorrection ? { suggestedAction: error.suggestedCorrection } : {}) }));
    trace.push(traceEntry("SOLVER_INPUT_REJECTED", "Solver input validation failed.", [], {}, { errorCount: String(diagnostics.length) }));
    return emptyResult(matrix, "invalid-input", preprocessed.normalized, objectives, tolerances, diagnostics, [], trace, Number.isSafeInteger(candidateLimit) && candidateLimit > 0 ? candidateLimit : DEFAULT_SOLVER_CANDIDATE_LIMIT, 0);
  }
  if (directConflicts.length > 0) {
    const diagnostics = directConflicts.map((error) => solverDiagnostic({ code: error.code, severity: "error", blocking: true, fieldPath: error.fieldPath ?? "constraints", message: error.message, suggestedAction: "Correct or remove the contradictory simultaneous constraints." }));
    trace.push(traceEntry("DIRECT_CONSTRAINT_CONFLICT_DETECTED", "Direct fixed, bound, or ratio conflicts were detected before candidate enumeration.", [], {}, { conflictCount: String(diagnostics.length) }));
    return emptyResult(matrix, "infeasible-constraints", preprocessed.normalized, objectives, tolerances, diagnostics, [], trace, candidateLimit, 0);
  }
  if (matrix.analysis.rankConsistency === "inconsistent") {
    const errors = [solverDiagnostic({ code: "INFEASIBLE_LINEAR", severity: "error", blocking: true, fieldPath: "matrix.requiredElementMatrix", message: `The elemental balance equations are inconsistent: rank(A) is ${matrix.analysis.matrixRank} while rank([A|b]) is ${matrix.analysis.augmentedMatrixRank}.`, suggestedAction: "Add or revise precursor sources before solving." }), ...matrix.diagnostics.filter((item) => item.blocking).map((item) => solverDiagnostic({ code: item.code, severity: "error", blocking: true, fieldPath: item.fieldPath, message: item.message, suggestedAction: item.suggestedAction, precursorIds: item.precursorIds, element: item.element }))];
    trace.push(traceEntry("LINEAR_INFEASIBILITY_DETECTED", "Existing exact rank analysis proves A x = b inconsistent."));
    return emptyResult(matrix, "infeasible-linear", preprocessed.normalized, objectives, tolerances, errors, [], trace, candidateLimit, 0);
  }

  const matrixRows = matrix.requiredElementMatrix.map((row) => row.map(parseExactRational));
  const requirements = matrix.requirementVector.map(parseExactRational);
  const equalities = [...matrixRows, ...preprocessed.equalities];
  const equalityRight = [...requirements, ...preprocessed.equalityRightHandSide];
  for (const constraint of preprocessed.normalized) if (constraint.mode === "fixed") {
    const index = matrix.precursorToColumn[constraint.precursorId]!;
    const fixed = parseExactRational(constraint.value);
    const contribution = matrixRows.map((row) => multiplyRational(row[index]!, fixed));
    const reduced = requirements.map((value, row) => subtractRational(value, contribution[row]!));
    trace.push(traceEntry("FIXED_VARIABLE_SUBSTITUTED", `Fixed precursor "${constraint.precursorId}" projected from the requirement vector.`, [constraint.precursorId], { fixedQuantity: rationalToString(fixed), originalRequirementVector: requirements.map(rationalToString).join(",") }, { contributionVector: contribution.map(rationalToString).join(","), reducedRequirementVector: reduced.map(rationalToString).join(",") }));
  }
  preprocessed.bounds.forEach((state, index) => { if (state.lower.numerator !== 0n) trace.push(traceEntry("LOWER_BOUND_REGISTERED", `Exact lower bound registered directly for "${matrix.columns[index]!.precursorId}".`, [matrix.columns[index]!.precursorId], { lowerBound: rationalToString(state.lower) }, {})); if (state.upper) trace.push(traceEntry("UPPER_BOUND_REGISTERED", `Exact upper bound registered directly for "${matrix.columns[index]!.precursorId}".`, [matrix.columns[index]!.precursorId], { upperBound: rationalToString(state.upper) }, {})); });
  preprocessed.ratios.forEach((ratio) => trace.push(traceEntry("RATIO_EQUALITY_ADDED", `Exact ratio equality added for "${ratio.numeratorPrecursorId}" and "${ratio.denominatorPrecursorId}".`, [ratio.numeratorPrecursorId, ratio.denominatorPrecursorId], { numeratorRatio: rationalToString(ratio.numeratorRatio), denominatorRatio: rationalToString(ratio.denominatorRatio) }, { equation: `${rationalToString(ratio.denominatorRatio)}*${ratio.numeratorPrecursorId}-${rationalToString(ratio.numeratorRatio)}*${ratio.denominatorPrecursorId}=0` })));

  const enumeration = enumerateCandidates(equalities, equalityRight, preprocessed.bounds, candidateLimit);
  trace.push(traceEntry("EXACT_CANDIDATES_ENUMERATED", "Feasible vertices enumerated using exact rational equality solving and bound activation.", [], { candidateLimit: String(candidateLimit) }, { candidatesExamined: String(enumeration.examined), feasibleVertices: String(enumeration.candidates.length) }));
  if (enumeration.limitExceeded) {
    const errors = [solverDiagnostic({ code: "SOLVER_CANDIDATE_LIMIT_EXCEEDED", severity: "error", blocking: true, fieldPath: "options.candidateLimit", message: `The exact candidate limit of ${candidateLimit} was exceeded before optimization completed.`, suggestedAction: "Reduce the system, add constraints, or explicitly increase the candidate limit." })];
    return emptyResult(matrix, "solver-failure", preprocessed.normalized, objectives, tolerances, errors, [], trace, candidateLimit, enumeration.examined);
  }
  if (enumeration.equalityInconsistent || enumeration.candidates.length === 0) {
    const baselineBounds: BoundState[] = matrix.columns.map(() => ({ lower: RATIONAL_ZERO, modes: new Set(["solver"]) }));
    const baseline = enumerateCandidates(matrixRows, requirements, baselineBounds, candidateLimit);
    const status: PrecursorSolverStatus = baseline.candidates.length === 0 ? "infeasible-nonnegative" : "infeasible-constraints";
    const message = status === "infeasible-nonnegative" ? "The elemental equations have an algebraic solution, but every solution requires at least one negative precursor quantity." : "The elemental balance is non-negative feasible without the supplied constraints, but the simultaneous fixed, bound, or ratio constraints are infeasible.";
    const errors: SolverDiagnostic[] = [solverDiagnostic({ code: status === "infeasible-nonnegative" ? "INFEASIBLE_NONNEGATIVE" : "INFEASIBLE_CONSTRAINTS", severity: "error", blocking: true, fieldPath: status === "infeasible-nonnegative" ? "matrix" : "constraints", message, suggestedAction: status === "infeasible-nonnegative" ? "Change the precursor set; negative quantities are never accepted." : "Relax or correct the conflicting constraints." })];
    if (status === "infeasible-constraints") {
      preprocessed.bounds.forEach((state, columnIndex) => {
        if (!state.fixed) return;
        matrix.rows.forEach((row, rowIndex) => {
          const supplied = multiplyRational(matrixRows[rowIndex]![columnIndex]!, state.fixed!);
          if (compareRational(supplied, requirements[rowIndex]!) > 0) errors.push(solverDiagnostic({ code: "FIXED_QUANTITY_EXCEEDS_REQUIREMENT", severity: "error", blocking: true, fieldPath: `constraints.${matrix.columns[columnIndex]!.precursorId}`, message: `Precursor "${matrix.columns[columnIndex]!.displayName}" is fixed at ${rationalToString(state.fixed!)} mol/mol target, which supplies ${rationalToString(supplied)} ${row.element}, above the required ${rationalToString(requirements[rowIndex]!)} and cannot be offset using non-negative quantities.`, precursorIds: [matrix.columns[columnIndex]!.precursorId], element: row.element }));
        });
      });
      matrix.rows.forEach((row, rowIndex) => {
        if (preprocessed.bounds.some((state, columnIndex) => !state.upper && matrixRows[rowIndex]![columnIndex]!.numerator !== 0n)) return;
        const maximum = sumRationals(preprocessed.bounds.map((state, columnIndex) => multiplyRational(matrixRows[rowIndex]![columnIndex]!, state.upper ?? RATIONAL_ZERO)));
        if (compareRational(maximum, requirements[rowIndex]!) < 0) errors.push(solverDiagnostic({ code: "BOUND_SUPPLY_INSUFFICIENT", severity: "error", blocking: true, fieldPath: "constraints", message: `The maximum allowed quantities of all ${row.element}-containing precursors supply only ${rationalToString(maximum)} ${row.element}, below the required ${rationalToString(requirements[rowIndex]!)}.`, element: row.element }));
      });
      if (preprocessed.ratios.length > 0) errors.push(solverDiagnostic({ code: "RATIO_INCOMPATIBLE", severity: "error", blocking: true, fieldPath: "constraints", message: "One or more exact precursor-ratio constraints are incompatible with the target balance and other simultaneous constraints.", precursorIds: [...new Set(preprocessed.ratios.flatMap((ratioState) => [ratioState.numeratorPrecursorId, ratioState.denominatorPrecursorId]))] }));
    }
    trace.push(traceEntry(status === "infeasible-nonnegative" ? "NONNEGATIVE_INFEASIBILITY_DETECTED" : "CONSTRAINT_INFEASIBILITY_DETECTED", message));
    return emptyResult(matrix, status, preprocessed.normalized, objectives, tolerances, errors, [], trace, candidateLimit, enumeration.examined + baseline.examined);
  }

  const selected = chooseCandidate(enumeration.candidates, objectives, matrix);
  const verification = verifyExact(matrix, selected, preprocessed, tolerances);
  if (!verification.valid) {
    const errors = [solverDiagnostic({ code: "SOLVER_INTERNAL_FAILURE", severity: "error", blocking: true, fieldPath: "solution", message: "The internally selected exact candidate failed independent residual or constraint verification.", suggestedAction: "Report this deterministic solver defect with the canonical input." })];
    trace.push(traceEntry("SOLUTION_VERIFICATION_FAILED", errors[0]!.message));
    return emptyResult(matrix, "solver-failure", preprocessed.normalized, objectives, tolerances, errors, [], trace, candidateLimit, enumeration.examined);
  }
  const hasUnboundedZeroColumn = matrix.analysis.zeroColumns.some((index) => !preprocessed.bounds[index]!.upper);
  const multiple = enumeration.candidates.length > 1 || hasUnboundedZeroColumn;
  const status: PrecursorSolverStatus = multiple ? "exact-multiple" : "exact-unique";
  const objective = objectiveResult(objectives, selected, multiple, matrix);
  const ratioIndicesByColumn = matrix.columns.map(() => [] as number[]);
  preprocessed.ratios.forEach((ratio, index) => { ratioIndicesByColumn[ratio.numeratorIndex]!.push(index); ratioIndicesByColumn[ratio.denominatorIndex]!.push(index); });
  const quantities = Object.freeze(matrix.columns.map((column, columnIndex) => {
    const value = selected[columnIndex]!;
    const targetContributions = Object.fromEntries(matrix.rows.map((row, rowIndex) => [row.element, rationalToString(multiplyRational(parseExactRational(matrix.requiredElementMatrix[rowIndex]![columnIndex]!), value))]));
    const extraContributions = Object.fromEntries(matrix.precursorOnlyRows.map((row, rowIndex) => [row.element, rationalToString(multiplyRational(parseExactRational(matrix.precursorOnlyElementMatrix[rowIndex]![columnIndex]!), value))]));
    const checks = verification.constraintVerification.filter((check) => check.precursorIds.includes(column.precursorId) && check.code !== "RATIO");
    return Object.freeze({ precursorId: column.precursorId, displayName: column.displayName, columnIndex, precursorMolesPerTargetFormulaMole: rationalToString(value), exactQuantity: scientificScalarFromExact(value), units: "mol precursor / mol target formula" as const, isZero: value.numerator === 0n, active: value.numerator > 0n, ...(preprocessed.bounds[columnIndex]!.fixed ? { fixedValue: rationalToString(preprocessed.bounds[columnIndex]!.fixed!) } : {}), lowerBound: rationalToString(preprocessed.bounds[columnIndex]!.lower), ...(preprocessed.bounds[columnIndex]!.upper ? { upperBound: rationalToString(preprocessed.bounds[columnIndex]!.upper!) } : {}), ratioConstraintIndices: Object.freeze(ratioIndicesByColumn[columnIndex]!), boundsPass: checks.every((check) => check.passes), targetElementContributions: freezeRecord(targetContributions), precursorOnlyElementContributions: freezeRecord(extraContributions) });
  }));
  const quantitiesById = freezeRecord(Object.fromEntries(quantities.map((item) => [item.precursorId, item.precursorMolesPerTargetFormulaMole])));
  const exactQuantitiesById = freezeRecord(Object.fromEntries(quantities.map((item) => [item.precursorId, item.exactQuantity])));
  const introduced = Object.freeze(matrix.precursorOnlyRows.map((row, rowIndex) => {
    const coefficients = matrix.precursorOnlyElementMatrix[rowIndex]!.map(parseExactRational);
    const amount = dotRationals(coefficients, selected);
    const contributing = Object.freeze(matrix.columns.filter((_, index) => multiplyRational(coefficients[index]!, selected[index]!).numerator !== 0n).map((column) => column.precursorId));
    return Object.freeze({ element: row.element, introducedAmount: rationalToString(amount), contributingPrecursorIds: contributing, strictClosedSystemRequested: false as const, warning: `${row.element} is introduced by the selected precursor quantities but is absent from the target composition.` });
  }));
  const warnings = introduced.filter((item) => item.introducedAmount !== "0").map((item) => solverDiagnostic({ code: "PRECURSOR_ONLY_ELEMENT_INTRODUCED", severity: "warning", blocking: false, fieldPath: `precursorOnlyIntroducedElements.${item.element}`, message: item.warning, element: item.element, precursorIds: item.contributingPrecursorIds }));
  const activeConstraints = Object.freeze(preprocessed.normalized.filter((constraint) => {
    if (constraint.mode === "fixed" || constraint.mode === "ratio") return true;
    if (constraint.mode !== "bounded") return false;
    const value = selected[matrix.precursorToColumn[constraint.precursorId]!]!;
    return (constraint.minimum !== undefined && equalRational(value, parseExactRational(constraint.minimum))) || (constraint.maximum !== undefined && equalRational(value, parseExactRational(constraint.maximum)));
  }));
  trace.push(traceEntry("OBJECTIVES_APPLIED", objective.selectionExplanation, [], { requestedObjectives: objective.appliedOrder.join(",") }, { selectedVector: selected.map(rationalToString).join(",") }), traceEntry("EXACT_SOLUTION_VERIFIED", "Selected quantities independently verified against elemental equations, non-negativity, bounds, and ratios.", [], {}, { residualVector: verification.elementalResiduals.map((item) => item.residual).join(",") }), traceEntry("SOLUTION_CANONICALIZED", "Exact rational quantities serialized without numerical clamping or timestamps."));
  return finalize({ schemaVersion: PRECURSOR_SOLVER_SCHEMA_VERSION, engineVersion: ENGINE_VERSION, sourceBalanceMatrixSchemaVersion: matrix.schemaVersion, sourceBalanceMatrixCanonicalRepresentation: matrix.canonicalScientificRepresentation, status, quantities, quantitiesByPrecursorId: quantitiesById, orderedQuantityVector: Object.freeze(selected.map(rationalToString)), orderedExactQuantityVector: Object.freeze(selected.map(scientificScalarFromExact)), exactQuantitiesByPrecursorId: exactQuantitiesById, quantityBasis: "moles of precursor formula units per mole of target formula units", units: "mol precursor / mol target formula", reconstructedTargetComposition: verification.reconstructedTargetComposition, elementalResiduals: verification.elementalResiduals, precursorOnlyIntroducedElements: introduced, normalizedConstraints: preprocessed.normalized, activeConstraints, constraintVerification: verification.constraintVerification, objective, rank: matrix.analysis, feasibilityClassification: status, warnings: Object.freeze(warnings), errors: Object.freeze([]), trace: Object.freeze(trace), backend: Object.freeze({ name: "internal-exact-rational-vertex-enumeration", version: "1.0.0", arithmetic: "normalized BigInt fractions", numericalPrecision: null, candidateLimit, candidatesExamined: enumeration.examined, exactVerification: true }), tolerances, activePrecursorPolicy: "exactly-greater-than-zero" });
}
