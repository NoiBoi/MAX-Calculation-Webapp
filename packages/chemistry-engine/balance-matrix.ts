import { compositionsEqualExact, createComposition } from "./composition";
import { chemistryError, type ChemistryError } from "./errors";
import { parseFormula, serializeComposition } from "./formula-parser";
import { ATOMIC_NUMBER_BY_SYMBOL, VALID_ELEMENT_SYMBOLS } from "./periodic-table";
import type {
  BalanceDiagnostic,
  BalancePrecursorDefinition,
  BalanceTraceEntry,
  ElementalComposition,
  SiteComposition,
} from "./schemas";
import { siteCompositionToElementalComposition } from "./site-composition";
import { ENGINE_VERSION } from "./version";

export const BALANCE_MATRIX_SCHEMA_VERSION = "1.0.0" as const;
export type BalanceAnalysisMode = "target-elements-only";
export type DimensionClassification = "square" | "underdetermined" | "overdetermined";

export interface BalanceMatrixOptions {
  readonly analysisMode?: BalanceAnalysisMode;
}

export interface BalanceRowMetadata {
  readonly index: number;
  readonly element: string;
  readonly atomicNumber: number;
  readonly requiredByTarget: true;
  readonly requirement: string;
  readonly suppliedByAnyPrecursor: boolean;
}

export interface PrecursorOnlyRowMetadata {
  readonly index: number;
  readonly element: string;
  readonly atomicNumber: number;
  readonly requiredByTarget: false;
  readonly requirement: "0";
  readonly precursorIds: readonly string[];
  readonly diagnosticSeverity: "warning";
  readonly strictClosedSystemRequested: false;
  readonly explanation: string;
}

export interface BalanceColumnMetadata {
  readonly index: number;
  readonly precursorId: string;
  readonly displayName: string;
  readonly originalFormula?: string;
  readonly composition: ElementalComposition;
  readonly userOrder?: number;
}

export interface DuplicateColumnGroup {
  readonly precursorIds: readonly string[];
  readonly columnIndices: readonly number[];
}

export interface ProportionalColumnPair {
  readonly precursorIds: readonly [string, string];
  readonly columnIndices: readonly [number, number];
  readonly ratio: string;
}

export interface BalanceMatrixAnalysisResult {
  readonly matrixRank: number;
  readonly augmentedMatrixRank: number;
  readonly rows: number;
  readonly columns: number;
  readonly nullity: number;
  readonly algebraicDegreesOfFreedom: number;
  readonly pivotColumns: readonly number[];
  readonly dependentColumns: readonly number[];
  readonly zeroColumns: readonly number[];
  readonly duplicateColumns: readonly DuplicateColumnGroup[];
  readonly proportionalColumns: readonly ProportionalColumnPair[];
  readonly rankConsistency: "consistent" | "inconsistent";
  readonly structurallyInfeasible: boolean;
  readonly method: Readonly<{
    name: "exact-rational-gaussian-elimination";
    arithmetic: "normalized BigInt fractions";
    pivotStrategy: "left-to-right columns, top-to-bottom rows";
    tolerance: null;
  }>;
}

export interface ElementBalanceMatrix {
  readonly schemaVersion: typeof BALANCE_MATRIX_SCHEMA_VERSION;
  readonly engineVersion: typeof ENGINE_VERSION;
  readonly analysisMode: BalanceAnalysisMode;
  readonly requiredElementMatrix: readonly (readonly string[])[];
  readonly requirementVector: readonly string[];
  readonly precursorOnlyElementMatrix: readonly (readonly string[])[];
  readonly rows: readonly BalanceRowMetadata[];
  readonly precursorOnlyRows: readonly PrecursorOnlyRowMetadata[];
  readonly columns: readonly BalanceColumnMetadata[];
  readonly elementToRow: Readonly<Record<string, number>>;
  readonly precursorToColumn: Readonly<Record<string, number>>;
  readonly dimensions: Readonly<{ rows: number; columns: number }>;
  readonly dimensionClassification: DimensionClassification;
  readonly target: Readonly<{
    inputKind: "elemental-composition" | "site-composition";
    composition: ElementalComposition;
    requirementBasis: "formula-unit-relative elemental coefficients";
    compositionRole?: SiteComposition["compositionRole"];
    siteSchemaVersion?: SiteComposition["schemaVersion"];
    structure?: SiteComposition["structure"];
  }>;
  readonly orderingPolicy: Readonly<{
    rows: "atomic-number-ascending-then-symbol";
    columns: "explicit-order-ascending-then-id; unordered-after-ordered";
    identifierComparison: "ECMAScript-code-unit";
  }>;
  readonly diagnostics: readonly BalanceDiagnostic[];
  readonly trace: readonly BalanceTraceEntry[];
  readonly analysis: BalanceMatrixAnalysisResult;
  readonly canonicalScientificRepresentation: string;
}

export type BalanceMatrixResult =
  | Readonly<{ success: true; value: ElementBalanceMatrix }>
  | Readonly<{ success: false; errors: readonly ChemistryError[]; diagnostics: readonly BalanceDiagnostic[] }>;

interface Rational { readonly numerator: bigint; readonly denominator: bigint }
const ZERO: Rational = { numerator: 0n, denominator: 1n };

function gcd(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function rational(numerator: bigint, denominator = 1n): Rational {
  if (numerator === 0n) return ZERO;
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = gcd(numerator, denominator);
  return { numerator: (numerator / divisor) * sign, denominator: (denominator / divisor) * sign };
}

function decimalToRational(value: string): Rational {
  const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(value);
  if (!match) throw new Error(`Invalid canonical decimal: ${value}`);
  const sign = match[1] === "-" ? -1n : 1n;
  const integer = match[2] || "0";
  const fraction = match[3] || "";
  const exponent = BigInt(match[4] || "0");
  let numerator = BigInt(`${integer}${fraction}` || "0") * sign;
  let denominator = 10n ** BigInt(fraction.length);
  if (exponent > 0n) numerator *= 10n ** exponent;
  if (exponent < 0n) denominator *= 10n ** -exponent;
  return rational(numerator, denominator);
}

function subtract(left: Rational, right: Rational): Rational {
  return rational(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function multiply(left: Rational, right: Rational): Rational {
  return rational(left.numerator * right.numerator, left.denominator * right.denominator);
}

function divide(left: Rational, right: Rational): Rational {
  return rational(left.numerator * right.denominator, left.denominator * right.numerator);
}

function rationalText(value: Rational): string {
  return value.denominator === 1n
    ? value.numerator.toString()
    : `${value.numerator.toString()}/${value.denominator.toString()}`;
}

function exactRref(values: readonly (readonly string[])[]): { rank: number; pivotColumns: readonly number[] } {
  const matrix = values.map((row) => row.map(decimalToRational));
  const columnCount = matrix[0]?.length ?? 0;
  const pivots: number[] = [];
  let pivotRow = 0;
  for (let column = 0; column < columnCount && pivotRow < matrix.length; column += 1) {
    const selected = matrix.findIndex((row, index) => index >= pivotRow && row[column]?.numerator !== 0n);
    if (selected < 0) continue;
    [matrix[pivotRow], matrix[selected]] = [matrix[selected]!, matrix[pivotRow]!];
    const pivot = matrix[pivotRow]![column]!;
    matrix[pivotRow] = matrix[pivotRow]!.map((entry) => divide(entry, pivot));
    for (let row = 0; row < matrix.length; row += 1) {
      if (row === pivotRow) continue;
      const factor = matrix[row]![column]!;
      if (factor.numerator === 0n) continue;
      matrix[row] = matrix[row]!.map((entry, index) =>
        subtract(entry, multiply(factor, matrix[pivotRow]![index]!)),
      );
    }
    pivots.push(column);
    pivotRow += 1;
  }
  return { rank: pivots.length, pivotColumns: Object.freeze(pivots) };
}

function freezeRows(rows: string[][]): readonly (readonly string[])[] {
  return Object.freeze(rows.map((row) => Object.freeze(row)));
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function elementCompare(left: string, right: string): number {
  return (ATOMIC_NUMBER_BY_SYMBOL.get(left) ?? Number.MAX_SAFE_INTEGER)
    - (ATOMIC_NUMBER_BY_SYMBOL.get(right) ?? Number.MAX_SAFE_INTEGER) || stableCompare(left, right);
}

function compositionObject(composition: ElementalComposition): Readonly<Record<string, string>> {
  return Object.freeze(Object.fromEntries(Object.entries(composition.amounts).sort(([a], [b]) => elementCompare(a, b))));
}

function compositionText(composition: ElementalComposition): string {
  const serialized = serializeComposition(composition);
  return serialized.success ? serialized.value : JSON.stringify(compositionObject(composition));
}

const COMMON_ELEMENT_NAMES: Readonly<Record<string, string>> = Object.freeze({
  C: "carbon", N: "nitrogen", O: "oxygen", F: "fluorine", Al: "aluminum",
  Ti: "titanium", Nb: "niobium", K: "potassium",
});

function elementName(symbol: string): string {
  return COMMON_ELEMENT_NAMES[symbol] ?? symbol;
}

function diagnostic(value: BalanceDiagnostic): BalanceDiagnostic {
  return Object.freeze({
    ...value,
    ...(value.precursorIds ? { precursorIds: Object.freeze([...value.precursorIds]) } : {}),
  });
}

function traceEntry(
  stepCode: string,
  description: string,
  entityIds: readonly string[] = [],
  inputReferences: readonly string[] = [],
  outputReferences: readonly string[] = [],
): BalanceTraceEntry {
  return Object.freeze({
    stepCode,
    description,
    entityIds: Object.freeze([...entityIds]),
    inputReferences: Object.freeze([...inputReferences]),
    outputReferences: Object.freeze([...outputReferences]),
  });
}

function failureResult(errors: ChemistryError[], diagnostics: BalanceDiagnostic[]): BalanceMatrixResult {
  for (const error of errors) {
    if (diagnostics.some((item) => item.code === error.code && item.fieldPath === (error.fieldPath ?? ""))) continue;
    diagnostics.push(diagnostic({
      code: error.code,
      severity: "error",
      fieldPath: error.fieldPath ?? "",
      blocking: true,
      message: error.message,
      ...(error.suggestedCorrection ? { suggestedAction: error.suggestedCorrection } : {}),
    }));
  }
  return Object.freeze({
    success: false as const,
    errors: Object.freeze(errors),
    diagnostics: Object.freeze(diagnostics),
  });
}

function validateElementalComposition(
  input: ElementalComposition,
  fieldPath: string,
): { composition?: ElementalComposition; error?: ChemistryError } {
  if (input.schemaVersion !== "1.0.0") {
    return { error: chemistryError(fieldPath === "target" ? "INVALID_BALANCE_TARGET" : "INVALID_PRECURSOR_COMPOSITION", "Unsupported elemental-composition schema version.", { fieldPath: `${fieldPath}.schemaVersion`, offendingValue: String(input.schemaVersion) }) };
  }
  for (const element of Object.keys(input.amounts)) {
    if (!VALID_ELEMENT_SYMBOLS.has(element)) {
      return { error: chemistryError(fieldPath === "target" ? "INVALID_BALANCE_TARGET" : "INVALID_PRECURSOR_COMPOSITION", `Invalid element symbol "${element}" in composition.`, { fieldPath: `${fieldPath}.amounts.${element}`, offendingValue: element }) };
    }
  }
  const created = createComposition(input.amounts);
  if (!created.success) {
    return { error: chemistryError(fieldPath === "target" ? "INVALID_BALANCE_TARGET" : "INVALID_PRECURSOR_COMPOSITION", created.errors[0]?.message ?? "Invalid elemental composition.", { fieldPath, offendingValue: created.errors[0]?.offendingValue }) };
  }
  return { composition: created.value };
}

function duplicateColumns(matrix: readonly (readonly string[])[], ids: readonly string[]): DuplicateColumnGroup[] {
  const signatures = new Map<string, number[]>();
  for (let column = 0; column < ids.length; column += 1) {
    const signature = matrix.map((row) => row[column] ?? "0").join("|");
    const group = signatures.get(signature) ?? [];
    group.push(column);
    signatures.set(signature, group);
  }
  return [...signatures.values()].filter((group) => group.length > 1).map((group) => Object.freeze({
    precursorIds: Object.freeze(group.map((index) => ids[index]!)),
    columnIndices: Object.freeze([...group]),
  }));
}

function proportionalColumns(matrix: readonly (readonly string[])[], ids: readonly string[]): ProportionalColumnPair[] {
  const result: ProportionalColumnPair[] = [];
  for (let left = 0; left < ids.length; left += 1) {
    for (let right = left + 1; right < ids.length; right += 1) {
      let ratio: Rational | undefined;
      let proportional = true;
      let nonzero = false;
      for (const row of matrix) {
        const a = decimalToRational(row[left] ?? "0");
        const b = decimalToRational(row[right] ?? "0");
        if (a.numerator === 0n && b.numerator === 0n) continue;
        nonzero = true;
        if (a.numerator === 0n || b.numerator === 0n) { proportional = false; break; }
        const current = divide(b, a);
        if (!ratio) ratio = current;
        else if (ratio.numerator !== current.numerator || ratio.denominator !== current.denominator) { proportional = false; break; }
      }
      if (proportional && nonzero && ratio && !(ratio.numerator === ratio.denominator)) {
        result.push(Object.freeze({
          precursorIds: Object.freeze([ids[left]!, ids[right]!] as const),
          columnIndices: Object.freeze([left, right] as const),
          ratio: rationalText(ratio),
        }));
      }
    }
  }
  return result;
}

export function analyzeBalanceMatrix(matrix: Pick<ElementBalanceMatrix, "requiredElementMatrix" | "requirementVector" | "columns">): BalanceMatrixAnalysisResult {
  const rows = matrix.requiredElementMatrix.length;
  const columns = matrix.columns.length;
  const primary = exactRref(matrix.requiredElementMatrix);
  const augmentedRows = matrix.requiredElementMatrix.map((row, index) => [...row, matrix.requirementVector[index] ?? "0"]);
  const augmented = exactRref(augmentedRows);
  const pivotSet = new Set(primary.pivotColumns);
  const zeroColumns = Array.from({ length: columns }, (_, index) => index).filter((column) =>
    matrix.requiredElementMatrix.every((row) => (row[column] ?? "0") === "0"),
  );
  const ids = matrix.columns.map((column) => column.precursorId);
  const duplicates = duplicateColumns(matrix.requiredElementMatrix, ids);
  const proportional = proportionalColumns(matrix.requiredElementMatrix, ids);
  const consistent = primary.rank === augmented.rank;
  return Object.freeze({
    matrixRank: primary.rank,
    augmentedMatrixRank: augmented.rank,
    rows,
    columns,
    nullity: columns - primary.rank,
    algebraicDegreesOfFreedom: columns - primary.rank,
    pivotColumns: Object.freeze([...primary.pivotColumns]),
    dependentColumns: Object.freeze(Array.from({ length: columns }, (_, index) => index).filter((index) => !pivotSet.has(index))),
    zeroColumns: Object.freeze(zeroColumns),
    duplicateColumns: Object.freeze(duplicates),
    proportionalColumns: Object.freeze(proportional),
    rankConsistency: consistent ? "consistent" : "inconsistent",
    structurallyInfeasible: !consistent,
    method: Object.freeze({
      name: "exact-rational-gaussian-elimination",
      arithmetic: "normalized BigInt fractions",
      pivotStrategy: "left-to-right columns, top-to-bottom rows",
      tolerance: null,
    }),
  });
}

export function canonicalizeBalanceMatrix(matrix: Omit<ElementBalanceMatrix, "canonicalScientificRepresentation">): string {
  return JSON.stringify({
    schemaVersion: matrix.schemaVersion,
    engineVersion: matrix.engineVersion,
    analysisMode: matrix.analysisMode,
    target: {
      inputKind: matrix.target.inputKind,
      composition: compositionObject(matrix.target.composition),
      requirementBasis: matrix.target.requirementBasis,
      ...(matrix.target.compositionRole ? { compositionRole: matrix.target.compositionRole } : {}),
      ...(matrix.target.siteSchemaVersion ? { siteSchemaVersion: matrix.target.siteSchemaVersion } : {}),
      ...(matrix.target.structure ? { structure: matrix.target.structure } : {}),
    },
    rowElements: matrix.rows.map((row) => row.element),
    precursorIds: matrix.columns.map((column) => column.precursorId),
    precursorCompositions: matrix.columns.map((column) => compositionObject(column.composition)),
    requiredElementMatrix: matrix.requiredElementMatrix,
    requirementVector: matrix.requirementVector,
    precursorOnlyElements: matrix.precursorOnlyRows.map((row) => row.element),
    precursorOnlyElementMatrix: matrix.precursorOnlyElementMatrix,
    elementToRow: matrix.elementToRow,
    precursorToColumn: matrix.precursorToColumn,
    dimensions: matrix.dimensions,
    dimensionClassification: matrix.dimensionClassification,
    orderingPolicy: matrix.orderingPolicy,
    analysis: matrix.analysis,
  });
}

export function buildElementBalanceMatrix(
  targetInput: ElementalComposition | SiteComposition,
  precursorInputs: readonly BalancePrecursorDefinition[],
  options: BalanceMatrixOptions = {},
): BalanceMatrixResult {
  const errors: ChemistryError[] = [];
  const diagnostics: BalanceDiagnostic[] = [];
  if (options.analysisMode !== undefined && options.analysisMode !== "target-elements-only") {
    errors.push(chemistryError("UNSUPPORTED_BALANCE_ANALYSIS_MODE", `Unsupported balance analysis mode "${String(options.analysisMode)}".`, { fieldPath: "options.analysisMode", offendingValue: String(options.analysisMode) }));
  }

  let targetComposition: ElementalComposition | undefined;
  let targetKind: "elemental-composition" | "site-composition";
  const isSite = "sites" in targetInput;
  if (isSite) {
    targetKind = "site-composition";
    if (targetInput.schemaVersion !== "1.0.0") errors.push(chemistryError("INVALID_BALANCE_TARGET", "Unsupported site-composition schema version.", { fieldPath: "target.schemaVersion", offendingValue: String(targetInput.schemaVersion) }));
    else {
      const converted = siteCompositionToElementalComposition(targetInput);
      if (converted.success) targetComposition = converted.value;
      else errors.push(...converted.errors);
    }
  } else {
    targetKind = "elemental-composition";
    const validated = validateElementalComposition(targetInput, "target");
    if (validated.composition) targetComposition = validated.composition;
    if (validated.error) errors.push(validated.error);
  }
  if (targetComposition && Object.keys(targetComposition.amounts).length === 0) {
    const item = diagnostic({ code: "EMPTY_BALANCE_TARGET", severity: "error", fieldPath: "target", blocking: true, message: "The target composition contains no elements.", suggestedAction: "Provide at least one occupied target element." });
    diagnostics.push(item);
    errors.push(chemistryError("EMPTY_BALANCE_TARGET", item.message, { fieldPath: item.fieldPath, suggestedCorrection: item.suggestedAction }));
  }
  if (precursorInputs.length === 0) {
    const item = diagnostic({ code: "EMPTY_PRECURSOR_LIST", severity: "error", fieldPath: "precursors", blocking: true, message: "At least one precursor is required to construct a balance matrix.", suggestedAction: "Add at least one precursor." });
    diagnostics.push(item);
    errors.push(chemistryError("EMPTY_PRECURSOR_LIST", item.message, { fieldPath: item.fieldPath, suggestedCorrection: item.suggestedAction }));
  }

  const seenIds = new Map<string, number>();
  const normalized: Array<{ input: BalancePrecursorDefinition; composition: ElementalComposition; index: number }> = [];
  precursorInputs.forEach((input, index) => {
    const path = `precursors[${index}]`;
    if (input.schemaVersion !== "1.0.0") errors.push(chemistryError("UNSUPPORTED_PRECURSOR_SCHEMA_VERSION", "Unsupported precursor schema version.", { fieldPath: `${path}.schemaVersion`, offendingValue: String(input.schemaVersion) }));
    if (typeof input.id !== "string" || input.id.trim() === "" || input.id.length > 128) errors.push(chemistryError("INVALID_PRECURSOR_ID", "Precursor ID must contain 1 to 128 characters.", { fieldPath: `${path}.id`, offendingValue: String(input.id) }));
    else if (seenIds.has(input.id)) {
      const first = seenIds.get(input.id)!;
      const item = diagnostic({ code: "DUPLICATE_PRECURSOR_ID", severity: "error", fieldPath: `${path}.id`, blocking: true, message: `Precursor ID "${input.id}" duplicates precursors[${first}].id.`, suggestedAction: "Assign every precursor a stable unique ID.", precursorIds: [input.id] });
      diagnostics.push(item);
      errors.push(chemistryError("DUPLICATE_PRECURSOR_ID", item.message, { fieldPath: item.fieldPath, offendingValue: input.id, suggestedCorrection: item.suggestedAction }));
    } else seenIds.set(input.id, index);
    if (typeof input.name !== "string" || input.name.trim() === "" || input.name.length > 120) errors.push(chemistryError("INVALID_PRECURSOR_NAME", "Precursor display name must contain 1 to 120 characters.", { fieldPath: `${path}.name`, offendingValue: String(input.name) }));
    if (input.order !== undefined && (!Number.isSafeInteger(input.order))) errors.push(chemistryError("INVALID_PRECURSOR_ORDER", "Precursor order must be a finite safe integer.", { fieldPath: `${path}.order`, offendingValue: String(input.order) }));
    if (input.formula === undefined && input.composition === undefined) {
      errors.push(chemistryError("MISSING_PRECURSOR_REPRESENTATION", "A precursor formula or elemental composition is required.", { fieldPath: path, suggestedCorrection: "Provide formula or composition." }));
      return;
    }
    let formulaComposition: ElementalComposition | undefined;
    let suppliedComposition: ElementalComposition | undefined;
    if (input.formula !== undefined) {
      const parsed = parseFormula(input.formula);
      if (!parsed.success) {
        for (const parserError of parsed.errors) {
          errors.push(Object.freeze({ ...parserError, fieldPath: `${path}.formula` }));
          diagnostics.push(diagnostic({
            code: "INVALID_PRECURSOR_FORMULA",
            severity: "error",
            fieldPath: `${path}.formula`,
            blocking: true,
            message: `${parserError.code}: ${parserError.message}`,
            ...(parserError.suggestedCorrection ? { suggestedAction: parserError.suggestedCorrection } : {}),
            precursorIds: [input.id],
          }));
        }
      } else formulaComposition = parsed.composition;
    }
    if (input.composition !== undefined) {
      const validated = validateElementalComposition(input.composition, `${path}.composition`);
      if (validated.error) errors.push(validated.error);
      suppliedComposition = validated.composition;
    }
    if (formulaComposition && suppliedComposition && !compositionsEqualExact(formulaComposition, suppliedComposition)) {
      errors.push(chemistryError("PRECURSOR_FORMULA_COMPOSITION_MISMATCH", `Precursor "${input.id}" formula composition (${compositionText(formulaComposition)}) does not match its supplied composition (${compositionText(suppliedComposition)}).`, { fieldPath: path, offendingValue: input.id, suggestedCorrection: "Make the formula and elemental composition exactly equivalent." }));
    }
    const composition = formulaComposition ?? suppliedComposition;
    if (composition && Object.keys(composition.amounts).length === 0) errors.push(chemistryError("ZERO_PRECURSOR_COMPOSITION", `Precursor "${input.id}" contains no elements.`, { fieldPath: `${path}.composition`, offendingValue: input.id }));
    else if (composition) normalized.push({ input, composition, index });
  });

  if (errors.length > 0 || !targetComposition) return failureResult(errors, diagnostics);

  normalized.sort((left, right) => {
    const a = left.input.order;
    const b = right.input.order;
    if (a !== undefined && b !== undefined && a !== b) return a - b;
    if (a !== undefined && b === undefined) return -1;
    if (a === undefined && b !== undefined) return 1;
    return stableCompare(left.input.id, right.input.id);
  });

  const duplicateOrders = new Map<number, string[]>();
  for (const item of normalized) if (item.input.order !== undefined) duplicateOrders.set(item.input.order, [...(duplicateOrders.get(item.input.order) ?? []), item.input.id]);
  for (const [order, ids] of duplicateOrders) if (ids.length > 1) diagnostics.push(diagnostic({ code: "DUPLICATE_PRECURSOR_ORDER", severity: "warning", fieldPath: "precursors", blocking: false, message: `Precursors ${ids.map((id) => `"${id}"`).join(", ")} share order ${order}; stable ID resolves the tie.`, precursorIds: ids }));

  const targetElements = Object.keys(targetComposition.amounts).sort(elementCompare);
  const targetSet = new Set(targetElements);
  const precursorOnlyElements = [...new Set(normalized.flatMap(({ composition }) => Object.keys(composition.amounts).filter((element) => !targetSet.has(element))))].sort(elementCompare);
  const requiredMatrix = freezeRows(targetElements.map((element) => normalized.map(({ composition }) => composition.amounts[element] ?? "0")));
  const requirementVector = Object.freeze(targetElements.map((element) => targetComposition!.amounts[element]!));
  const precursorOnlyMatrix = freezeRows(precursorOnlyElements.map((element) => normalized.map(({ composition }) => composition.amounts[element] ?? "0")));
  const columns = Object.freeze(normalized.map(({ input, composition }, index) => Object.freeze({
    index,
    precursorId: input.id,
    displayName: input.name,
    ...(input.formula !== undefined ? { originalFormula: input.formula } : {}),
    composition,
    ...(input.order !== undefined ? { userOrder: input.order } : {}),
  })));
  const rows = Object.freeze(targetElements.map((element, index) => Object.freeze({
    index,
    element,
    atomicNumber: ATOMIC_NUMBER_BY_SYMBOL.get(element)!,
    requiredByTarget: true as const,
    requirement: targetComposition!.amounts[element]!,
    suppliedByAnyPrecursor: requiredMatrix[index]!.some((value) => value !== "0"),
  })));
  const precursorOnlyRows = Object.freeze(precursorOnlyElements.map((element, index) => {
    const ids = Object.freeze(columns.filter((column) => column.composition.amounts[element] !== undefined).map((column) => column.precursorId));
    return Object.freeze({ index, element, atomicNumber: ATOMIC_NUMBER_BY_SYMBOL.get(element)!, requiredByTarget: false as const, requirement: "0" as const, precursorIds: ids, diagnosticSeverity: "warning" as const, strictClosedSystemRequested: false as const, explanation: `${element} is introduced by precursors but is absent from the target composition.` });
  }));

  for (const row of rows) if (!row.suppliedByAnyPrecursor) diagnostics.push(diagnostic({ code: "MISSING_REQUIRED_ELEMENT_SOURCE", severity: "error", fieldPath: `target.amounts.${row.element}`, blocking: true, message: `Selected precursors provide no ${elementName(row.element)} source.`, suggestedAction: `Add a precursor containing ${row.element}.`, element: row.element }));
  for (const row of precursorOnlyRows) for (const id of row.precursorIds) {
    const name = columns.find((column) => column.precursorId === id)!.displayName;
    diagnostics.push(diagnostic({ code: "PRECURSOR_ONLY_ELEMENT", severity: "warning", fieldPath: `precursors.${id}.composition.amounts.${row.element}`, blocking: false, message: `Precursor "${name}" introduces ${elementName(row.element)}, which is absent from the target composition.`, suggestedAction: "Review possible byproducts, volatile species, or contamination.", element: row.element, precursorIds: [id] }));
  }

  const dimensions = Object.freeze({ rows: rows.length, columns: columns.length });
  const classification: DimensionClassification = dimensions.rows === dimensions.columns ? "square" : dimensions.columns > dimensions.rows ? "underdetermined" : "overdetermined";
  const elementToRow = Object.freeze(Object.fromEntries(rows.map((row) => [row.element, row.index])));
  const precursorToColumn = Object.freeze(Object.fromEntries(columns.map((column) => [column.precursorId, column.index])));
  const targetMetadata = Object.freeze({ inputKind: targetKind, composition: targetComposition, requirementBasis: "formula-unit-relative elemental coefficients" as const, ...(isSite ? { compositionRole: targetInput.compositionRole, siteSchemaVersion: targetInput.schemaVersion, structure: targetInput.structure } : {}) });
  const orderingPolicy = Object.freeze({ rows: "atomic-number-ascending-then-symbol" as const, columns: "explicit-order-ascending-then-id; unordered-after-ordered" as const, identifierComparison: "ECMAScript-code-unit" as const });
  const partial = { schemaVersion: BALANCE_MATRIX_SCHEMA_VERSION, engineVersion: ENGINE_VERSION, analysisMode: "target-elements-only" as const, requiredElementMatrix: requiredMatrix, requirementVector, precursorOnlyElementMatrix: precursorOnlyMatrix, rows, precursorOnlyRows, columns, elementToRow, precursorToColumn, dimensions, dimensionClassification: classification, target: targetMetadata, orderingPolicy };
  const analysis = analyzeBalanceMatrix(partial);
  for (const group of analysis.duplicateColumns) diagnostics.push(diagnostic({ code: "DUPLICATE_COMPOSITION_COLUMNS", severity: "warning", fieldPath: "requiredElementMatrix", blocking: false, message: `Precursors ${group.precursorIds.map((id) => `"${id}"`).join(", ")} have identical target-element columns.`, suggestedAction: "Expect linear dependence unless other constraints distinguish these precursors.", precursorIds: group.precursorIds }));
  for (const pair of analysis.proportionalColumns) diagnostics.push(diagnostic({ code: "PROPORTIONAL_COMPOSITION_COLUMNS", severity: "warning", fieldPath: "requiredElementMatrix", blocking: false, message: `Precursors "${pair.precursorIds[0]}" and "${pair.precursorIds[1]}" have exactly proportional target-element columns.`, suggestedAction: "Expect linear dependence between these columns.", precursorIds: pair.precursorIds }));
  for (const index of analysis.zeroColumns) diagnostics.push(diagnostic({ code: "ZERO_TARGET_CONTRIBUTION_COLUMN", severity: "warning", fieldPath: `columns[${index}]`, blocking: false, message: `Precursor "${columns[index]!.displayName}" contributes no elements required by the target.`, suggestedAction: "Retain only if its non-target elements are intentional.", precursorIds: [columns[index]!.precursorId] }));
  if (analysis.rankConsistency === "inconsistent") diagnostics.push(diagnostic({ code: "RANK_INCONSISTENT", severity: "error", fieldPath: "requiredElementMatrix", blocking: true, message: "The exact augmented rank exceeds the matrix rank, so A x = b is structurally inconsistent.", suggestedAction: "Add or revise precursor sources before constrained solving." }));

  const trace = Object.freeze([
    traceEntry("TARGET_ACCEPTED", "Target composition accepted.", [], ["target"], ["target.composition"]),
    ...(isSite ? [traceEntry("SITE_COMPOSITION_CONVERTED", "Site composition converted to an exact elemental composition.", [], ["target.sites"], ["target.composition"])] : []),
    traceEntry("PRECURSOR_FORMULAS_PARSED", "Available precursor formulas parsed.", columns.filter((column) => column.originalFormula !== undefined).map((column) => column.precursorId), ["precursors.formula"], ["columns.composition"]),
    traceEntry("PRECURSOR_REPRESENTATIONS_CHECKED", "Formula and composition representations checked for exact agreement.", columns.map((column) => column.precursorId), ["precursors"], ["columns.composition"]),
    traceEntry("ROWS_ORDERED", "Target rows ordered by atomic number then element symbol.", targetElements, ["target.composition"], ["rows"]),
    traceEntry("COLUMNS_ORDERED", "Precursor columns ordered by explicit order then stable ID.", columns.map((column) => column.precursorId), ["precursors"], ["columns"]),
    traceEntry("PRIMARY_MATRIX_ASSEMBLED", "Required-element matrix assembled with exact decimal strings.", [], ["rows", "columns"], ["requiredElementMatrix"]),
    traceEntry("REQUIREMENT_VECTOR_ASSEMBLED", "Formula-unit-relative requirement vector assembled.", [], ["target.composition"], ["requirementVector"]),
    traceEntry("PRECURSOR_ONLY_ELEMENTS_IDENTIFIED", "Non-target precursor elements recorded separately.", precursorOnlyElements, ["columns.composition"], ["precursorOnlyElementMatrix"]),
    traceEntry("EXACT_RANK_ANALYZED", "Matrix and augmented rank computed with normalized BigInt rational arithmetic.", [], ["requiredElementMatrix", "requirementVector"], ["analysis"]),
    traceEntry("DIAGNOSTICS_GENERATED", "Structural diagnostics generated deterministically.", [], ["analysis"], ["diagnostics"]),
  ]);
  const diagnosticList = Object.freeze(diagnostics);
  const withoutCanonical = { ...partial, diagnostics: diagnosticList, trace, analysis };
  const value = Object.freeze({ ...withoutCanonical, canonicalScientificRepresentation: canonicalizeBalanceMatrix(withoutCanonical) });
  return Object.freeze({ success: true as const, value });
}
