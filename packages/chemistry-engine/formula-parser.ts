import { createComposition, type ElementalComposition } from "./composition";
import { chemistryError, type ChemistryError, type ChemistryResult } from "./errors";
import { ChemistryDecimal, formatDecimal } from "./numeric";
import { ATOMIC_NUMBER_BY_SYMBOL, VALID_ELEMENT_SYMBOLS } from "./periodic-table";

export type FormulaTokenKind = "element" | "number" | "open-parenthesis" | "close-parenthesis";

export interface FormulaToken {
  readonly kind: FormulaTokenKind;
  readonly value: string;
  readonly position: number;
  readonly end: number;
}

export type FormulaTokenizeResult =
  | { readonly success: true; readonly tokens: readonly FormulaToken[] }
  | { readonly success: false; readonly tokens: readonly FormulaToken[]; readonly errors: readonly ChemistryError[] };

export interface SerializationOptions {
  readonly order?: "atomic-number" | "alphabetical";
}

export type FormulaParseResult =
  | {
      readonly success: true;
      readonly formula: string;
      readonly normalizedFormula: string;
      readonly composition: ElementalComposition;
      readonly tokens: readonly FormulaToken[];
    }
  | {
      readonly success: false;
      readonly formula: string;
      readonly errors: readonly ChemistryError[];
      readonly tokens: readonly FormulaToken[];
      readonly partialComposition?: ElementalComposition;
    };

function token(kind: FormulaTokenKind, value: string, position: number, end: number): FormulaToken {
  return Object.freeze({ kind, value, position, end });
}

function tokenizeFailure(
  tokens: FormulaToken[],
  error: ChemistryError,
): FormulaTokenizeResult {
  return Object.freeze({
    success: false as const,
    tokens: Object.freeze([...tokens]),
    errors: Object.freeze([error]),
  });
}

export function tokenizeFormula(formula: string): FormulaTokenizeResult {
  const tokens: FormulaToken[] = [];
  if (formula.length === 0) {
    return tokenizeFailure(tokens, chemistryError("EMPTY_FORMULA", "Formula cannot be empty.", { position: 0 }));
  }
  if (formula.trim().length === 0) {
    return tokenizeFailure(tokens, chemistryError("EMPTY_FORMULA", "Formula cannot be empty.", { position: 0 }));
  }
  const uncertaintyMatch = /\d(?:\.\d+)?\(\d+\)/.exec(formula);
  if (uncertaintyMatch?.index !== undefined) {
    return tokenizeFailure(
      tokens,
      chemistryError(
        "UNSUPPORTED_UNCERTAINTY",
        "Uncertainty notation is not supported in this release.",
        {
          position: uncertaintyMatch.index,
          end: uncertaintyMatch.index + uncertaintyMatch[0].length,
          offendingValue: uncertaintyMatch[0],
        },
      ),
    );
  }

  let position = 0;
  while (position < formula.length) {
    const character = formula[position] ?? "";

    if (/\s/.test(character)) {
      return tokenizeFailure(
        tokens,
        chemistryError("WHITESPACE_NOT_ALLOWED", `Whitespace is not allowed at position ${position}.`, {
          position,
          end: position + 1,
          offendingValue: character,
          suggestedCorrection: "Remove whitespace from the formula.",
        }),
      );
    }

    if (character === "·" || character === "•") {
      return tokenizeFailure(
        tokens,
        chemistryError(
          "UNSUPPORTED_HYDRATION_DOT",
          "Hydration-dot notation is not supported in this release.",
          { position, end: position + 1, offendingValue: character },
        ),
      );
    }

    if (character === "^" && /^\^\d+[A-Z]/.test(formula.slice(position))) {
      return tokenizeFailure(
        tokens,
        chemistryError("UNSUPPORTED_ISOTOPE", "Isotope notation is not supported in this release.", {
          position,
          end: position + 1,
          offendingValue: formula.slice(position),
        }),
      );
    }

    if (character === "[" && /^\[\d+[A-Z]/.test(formula.slice(position))) {
      return tokenizeFailure(
        tokens,
        chemistryError("UNSUPPORTED_ISOTOPE", "Isotope notation is not supported in this release.", {
          position,
          end: position + 1,
          offendingValue: formula.slice(position),
        }),
      );
    }

    if (character === "+" || character === "^" ) {
      return tokenizeFailure(
        tokens,
        chemistryError("UNSUPPORTED_CHARGE", "Charge notation is not supported in this release.", {
          position,
          end: position + 1,
          offendingValue: character,
        }),
      );
    }

    if (character === "-") {
      const remainder = formula.slice(position);
      if (/^-x\b/i.test(remainder)) {
        return tokenizeFailure(
          tokens,
          chemistryError("UNSUPPORTED_VARIABLE", "Variable stoichiometry is not supported in this release.", {
            position,
            end: formula.length,
            offendingValue: remainder,
          }),
        );
      }
      return tokenizeFailure(
        tokens,
        chemistryError("NEGATIVE_COEFFICIENT", `Negative coefficients are not allowed at position ${position}.`, {
          position,
          end: position + 1,
          offendingValue: character,
        }),
      );
    }

    if (character === "(") {
      tokens.push(token("open-parenthesis", character, position, position + 1));
      position += 1;
      continue;
    }
    if (character === ")") {
      tokens.push(token("close-parenthesis", character, position, position + 1));
      position += 1;
      continue;
    }

    if (/[A-Z]/.test(character)) {
      let end = position + 1;
      while (end < formula.length && /[a-z]/.test(formula[end] ?? "")) end += 1;
      tokens.push(token("element", formula.slice(position, end), position, end));
      position = end;
      continue;
    }

    if (/[a-z]/.test(character)) {
      const code = character === "x" ? "UNSUPPORTED_VARIABLE" : "INVALID_ELEMENT_START";
      const message =
        code === "UNSUPPORTED_VARIABLE"
          ? "Variable stoichiometry is not supported in this release."
          : `Element symbols must begin with an uppercase letter at position ${position}.`;
      return tokenizeFailure(
        tokens,
        chemistryError(code, message, { position, end: position + 1, offendingValue: character }),
      );
    }

    if (/\d/.test(character) || character === ".") {
      const start = position;
      let end = position;
      while (end < formula.length && /[\d.]/.test(formula[end] ?? "")) end += 1;
      const value = formula.slice(start, end);
      const dotCount = [...value].filter((part) => part === ".").length;
      const valid = /^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value);
      if (!valid || dotCount > 1) {
        const isSeparator = dotCount === 1 && value.endsWith(".") && /[A-Z(]/.test(formula[end] ?? "");
        return tokenizeFailure(
          tokens,
          chemistryError(
            isSeparator ? "UNSUPPORTED_HYDRATION_DOT" : "INVALID_COEFFICIENT",
            isSeparator
              ? "Hydration-dot notation is not supported in this release."
              : `Invalid coefficient "${value}" at position ${start}.`,
            { position: start, end, offendingValue: value },
          ),
        );
      }
      tokens.push(token("number", value, start, end));
      position = end;
      continue;
    }

    return tokenizeFailure(
      tokens,
      chemistryError(
        "TRAILING_INVALID_CHARACTER",
        `Formula contains invalid character "${character}" at position ${position}.`,
        { position, end: position + 1, offendingValue: character },
      ),
    );
  }

  return Object.freeze({ success: true as const, tokens: Object.freeze(tokens) });
}

interface SequenceResult {
  readonly success: boolean;
  readonly amounts: Map<string, InstanceType<typeof ChemistryDecimal>>;
  readonly error?: ChemistryError;
}

function mergeAmount(
  target: Map<string, InstanceType<typeof ChemistryDecimal>>,
  element: string,
  amount: InstanceType<typeof ChemistryDecimal>,
): void {
  target.set(element, (target.get(element) ?? new ChemistryDecimal(0)).plus(amount));
}

export function parseFormula(formula: string): FormulaParseResult {
  const tokenized = tokenizeFormula(formula);
  if (!tokenized.success) {
    return Object.freeze({
      success: false as const,
      formula,
      tokens: tokenized.tokens,
      errors: tokenized.errors,
    });
  }

  let cursor = 0;
  const tokens = tokenized.tokens;

  const coefficientAfter = (label: string): { value?: InstanceType<typeof ChemistryDecimal>; error?: ChemistryError } => {
    const next = tokens[cursor];
    if (next?.kind !== "number") return { value: new ChemistryDecimal(1) };
    cursor += 1;
    const value = new ChemistryDecimal(next.value);
    if (!value.greaterThan(0)) {
      return {
        error: chemistryError(
          "ZERO_COEFFICIENT",
          `Coefficient after ${label} must be greater than zero.`,
          { position: next.position, end: next.end, token: next.value, offendingValue: next.value },
        ),
      };
    }
    return { value };
  };

  const parseSequence = (opening?: FormulaToken): SequenceResult => {
    const amounts = new Map<string, InstanceType<typeof ChemistryDecimal>>();
    let termCount = 0;

    while (cursor < tokens.length) {
      const current = tokens[cursor];
      if (!current) break;

      if (current.kind === "close-parenthesis") {
        if (!opening) {
          return {
            success: false,
            amounts,
            error: chemistryError(
              "UNMATCHED_CLOSING_PARENTHESIS",
              `Formula contains an unmatched closing parenthesis at position ${current.position}.`,
              { position: current.position, end: current.end, token: current.value },
            ),
          };
        }
        if (termCount === 0) {
          return {
            success: false,
            amounts,
            error: chemistryError("EMPTY_GROUP", `Formula contains an empty group at position ${opening.position}.`, {
              position: opening.position,
              end: current.end,
              token: "()",
            }),
          };
        }
        cursor += 1;
        return { success: true, amounts };
      }

      if (current.kind === "number") {
        return {
          success: false,
          amounts,
          error: chemistryError("UNEXPECTED_NUMBER", `Unexpected number "${current.value}" at position ${current.position}.`, {
            position: current.position,
            end: current.end,
            token: current.value,
            offendingValue: current.value,
          }),
        };
      }

      if (current.kind === "element") {
        cursor += 1;
        if (!VALID_ELEMENT_SYMBOLS.has(current.value)) {
          return {
            success: false,
            amounts,
            error: chemistryError(
              "UNKNOWN_ELEMENT",
              `Unknown element symbol "${current.value}" at position ${current.position}.`,
              {
                position: current.position,
                end: current.end,
                token: current.value,
                offendingValue: current.value,
                suggestedCorrection: "Use a valid IUPAC chemical element symbol.",
              },
            ),
          };
        }
        const coefficient = coefficientAfter(current.value);
        if (coefficient.error || !coefficient.value) return { success: false, amounts, error: coefficient.error };
        mergeAmount(amounts, current.value, coefficient.value);
        termCount += 1;
        continue;
      }

      cursor += 1;
      const nested = parseSequence(current);
      if (!nested.success) return nested;
      const coefficient = coefficientAfter("group");
      if (coefficient.error || !coefficient.value) return { success: false, amounts, error: coefficient.error };
      for (const [element, amount] of nested.amounts) {
        mergeAmount(amounts, element, amount.times(coefficient.value));
      }
      termCount += 1;
    }

    if (opening) {
      return {
        success: false,
        amounts,
        error: chemistryError(
          "UNMATCHED_OPENING_PARENTHESIS",
          `Formula contains an unmatched opening parenthesis at position ${opening.position}.`,
          { position: opening.position, end: opening.end, token: opening.value },
        ),
      };
    }
    return { success: termCount > 0, amounts };
  };

  const parsed = parseSequence();
  const amountRecord = Object.fromEntries(
    [...parsed.amounts.entries()].map(([element, amount]) => [element, formatDecimal(amount)]),
  );
  const partial = createComposition(amountRecord);

  if (!parsed.success || parsed.error) {
    return Object.freeze({
      success: false as const,
      formula,
      tokens,
      errors: Object.freeze([
        parsed.error ?? chemistryError("EMPTY_FORMULA", "Formula must contain at least one element.", { position: 0 }),
      ]),
      ...(partial.success && Object.keys(partial.value.amounts).length > 0
        ? { partialComposition: partial.value }
        : {}),
    });
  }

  if (!partial.success) {
    return Object.freeze({ success: false as const, formula, tokens, errors: partial.errors });
  }
  const serialized = serializeComposition(partial.value, {
    order: "atomic-number",
  });
  if (!serialized.success) {
    return Object.freeze({ success: false as const, formula, tokens, errors: serialized.errors });
  }
  return Object.freeze({
    success: true as const,
    formula,
    normalizedFormula: serialized.value,
    composition: partial.value,
    tokens,
  });
}

export function serializeComposition(
  composition: ElementalComposition,
  options: SerializationOptions = {},
): ChemistryResult<string> {
  const validated = createComposition(composition.amounts);
  if (!validated.success) return validated;
  if (Object.keys(validated.value.amounts).length === 0) {
    return {
      success: false,
      errors: [chemistryError("EMPTY_COMPOSITION", "Cannot serialize an empty or zero composition.")],
    };
  }

  const order = options.order ?? "atomic-number";
  const entries = Object.entries(validated.value.amounts);
  if (order === "alphabetical") {
    entries.sort(([left], [right]) => left.localeCompare(right, "en"));
  } else {
    for (const [element] of entries) {
      if (!VALID_ELEMENT_SYMBOLS.has(element)) {
        return {
          success: false,
          errors: [
            chemistryError("UNKNOWN_ELEMENT", `Unknown element symbol "${element}" during serialization.`, {
              offendingValue: element,
            }),
          ],
        };
      }
    }
    entries.sort(([left], [right]) =>
      (ATOMIC_NUMBER_BY_SYMBOL.get(left) ?? 0) -
      (ATOMIC_NUMBER_BY_SYMBOL.get(right) ?? 0),
    );
  }

  return {
    success: true,
    value: entries
      .map(([element, coefficient]) => {
        const normalized = formatDecimal(new ChemistryDecimal(coefficient));
        return `${element}${normalized === "1" ? "" : normalized}`;
      })
      .join(""),
  };
}
