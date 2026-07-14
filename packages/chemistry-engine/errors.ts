export type ChemistryErrorCode =
  | "EMPTY_FORMULA"
  | "WHITESPACE_NOT_ALLOWED"
  | "UNKNOWN_ELEMENT"
  | "INVALID_ELEMENT_START"
  | "INVALID_COEFFICIENT"
  | "ZERO_COEFFICIENT"
  | "NEGATIVE_COEFFICIENT"
  | "UNEXPECTED_NUMBER"
  | "EMPTY_GROUP"
  | "UNMATCHED_OPENING_PARENTHESIS"
  | "UNMATCHED_CLOSING_PARENTHESIS"
  | "TRAILING_INVALID_CHARACTER"
  | "UNSUPPORTED_CHARGE"
  | "UNSUPPORTED_ISOTOPE"
  | "UNSUPPORTED_HYDRATION_DOT"
  | "UNSUPPORTED_VARIABLE"
  | "UNSUPPORTED_UNCERTAINTY"
  | "INVALID_COMPOSITION"
  | "INVALID_SCALAR"
  | "INVALID_TOLERANCE"
  | "EMPTY_COMPOSITION"
  | "NORMALIZATION_REFERENCE_MISSING"
  | "NORMALIZATION_REFERENCE_ZERO"
  | "INVALID_ELEMENT_DATA"
  | "MISSING_ATOMIC_WEIGHT"
  | "INVALID_SITE_STRUCTURE"
  | "INVALID_SITE_ID"
  | "DUPLICATE_SITE_ID"
  | "INVALID_MULTIPLICITY"
  | "NEGATIVE_OCCUPANCY"
  | "NEGATIVE_VACANCY"
  | "VACANCY_ABOVE_ONE"
  | "INVALID_SITE_ELEMENT"
  | "DUPLICATE_OCCUPANT"
  | "EMPTY_OCCUPIED_SITE"
  | "SITE_OCCUPANCY_NOT_NORMALIZED"
  | "SITE_OCCUPANCY_ABOVE_ONE"
  | "CANNOT_NORMALIZE_OCCUPANTS"
  | "INVALID_NORMALIZATION_MODE"
  | "EMPTY_BALANCE_TARGET"
  | "EMPTY_PRECURSOR_LIST"
  | "INVALID_PRECURSOR_ID"
  | "DUPLICATE_PRECURSOR_ID"
  | "INVALID_PRECURSOR_NAME"
  | "INVALID_PRECURSOR_ORDER"
  | "MISSING_PRECURSOR_REPRESENTATION"
  | "INVALID_PRECURSOR_FORMULA"
  | "PRECURSOR_FORMULA_COMPOSITION_MISMATCH"
  | "ZERO_PRECURSOR_COMPOSITION"
  | "INVALID_PRECURSOR_COMPOSITION"
  | "INVALID_BALANCE_TARGET"
  | "UNSUPPORTED_PRECURSOR_SCHEMA_VERSION"
  | "UNSUPPORTED_BALANCE_ANALYSIS_MODE"
  | "INVALID_SOLVER_MATRIX"
  | "UNSUPPORTED_SOLVER_SCHEMA_VERSION"
  | "INVALID_SOLVER_CONSTRAINT"
  | "DUPLICATE_SOLVER_CONSTRAINT"
  | "UNKNOWN_CONSTRAINT_PRECURSOR"
  | "CONTRADICTORY_SOLVER_CONSTRAINTS"
  | "INVALID_SOLVER_TOLERANCE"
  | "UNSUPPORTED_SOLVER_OBJECTIVE"
  | "SOLVER_CANDIDATE_LIMIT_EXCEEDED"
  | "SOLVER_INTERNAL_FAILURE";

export interface ChemistryError {
  readonly code: ChemistryErrorCode;
  readonly message: string;
  readonly position?: number;
  readonly end?: number;
  readonly token?: string;
  readonly offendingValue?: string;
  readonly suggestedCorrection?: string;
  readonly fieldPath?: string;
}

export interface ChemistryWarning {
  readonly code: "ATOMIC_WEIGHT_INTERVAL" | "USER_SPECIFIED_ATOMIC_WEIGHT";
  readonly message: string;
  readonly element: string;
}

export type ChemistryResult<T> =
  | { readonly success: true; readonly value: T }
  | { readonly success: false; readonly errors: readonly ChemistryError[] };

export function chemistryError(
  code: ChemistryErrorCode,
  message: string,
  details: Omit<ChemistryError, "code" | "message"> = {},
): ChemistryError {
  return Object.freeze({ code, message, ...details });
}

export function success<T>(value: T): ChemistryResult<T> {
  return Object.freeze({ success: true as const, value });
}

export function failure<T>(...errors: ChemistryError[]): ChemistryResult<T> {
  return Object.freeze({ success: false as const, errors: Object.freeze(errors) });
}
