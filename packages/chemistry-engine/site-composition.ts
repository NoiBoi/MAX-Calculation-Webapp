import { createComposition, type ElementalComposition } from "./composition";
import { chemistryError, failure, success, type ChemistryResult } from "./errors";
import {
  ChemistryDecimal,
  DEFAULT_COMPARISON_TOLERANCE,
  formatDecimal,
  parseDecimal,
} from "./numeric";
import { ATOMIC_NUMBER_BY_SYMBOL, VALID_ELEMENT_SYMBOLS } from "./periodic-table";
import type {
  CrystalSite,
  NormalizationMode,
  SiteComposition,
  SiteCompositionRole,
  SiteNormalizationTraceEntry,
  SiteOccupant,
  SiteWarning,
} from "./schemas";

export type StandardMaxTemplate = "211" | "312" | "413";

export interface SiteOccupantInput {
  readonly element: string;
  readonly fraction: string;
  readonly locked?: boolean;
}

export interface StandardSiteInput {
  readonly label?: string;
  readonly occupants: readonly SiteOccupantInput[];
  readonly vacancyFraction?: string;
}

export interface StandardMaxSiteInput {
  readonly M: StandardSiteInput;
  readonly A: StandardSiteInput;
  readonly X: StandardSiteInput;
}

export interface CustomSiteInput extends StandardSiteInput {
  readonly id: string;
  readonly multiplicity: string;
}

export interface SiteCreationOptions {
  readonly compositionRole?: SiteCompositionRole;
  readonly normalizationMode?: NormalizationMode;
  readonly duplicateOccupants?: "reject" | "combine";
}

export interface SiteCompositionOperation {
  readonly composition: SiteComposition;
  readonly warnings: readonly SiteWarning[];
  readonly trace: readonly SiteNormalizationTraceEntry[];
}

export type SiteCompositionResult = ChemistryResult<SiteCompositionOperation>;

export interface SiteValidationResultValue extends SiteCompositionOperation {
  readonly valid: true;
  readonly normalizationRequired: boolean;
}

export type SiteValidationResult = ChemistryResult<SiteValidationResultValue>;

export interface SiteRenderingOptions {
  readonly vacancySymbol?: "□" | "Va";
}

export interface RenderedSiteMetadata {
  readonly siteId: string;
  readonly siteRole: CrystalSite["role"];
  readonly multiplicity: string;
  readonly vacancyFraction: string;
  readonly lockedElements: readonly string[];
}

export interface SiteRenderingResult {
  readonly formula: string;
  readonly annotations: readonly string[];
  readonly warnings: readonly SiteWarning[];
  readonly sites: readonly RenderedSiteMetadata[];
}

const TEMPLATE_MULTIPLICITIES: Readonly<Record<StandardMaxTemplate, Readonly<Record<"M" | "A" | "X", string>>>> =
  Object.freeze({
    "211": Object.freeze({ M: "2", A: "1", X: "1" }),
    "312": Object.freeze({ M: "3", A: "1", X: "2" }),
    "413": Object.freeze({ M: "4", A: "1", X: "3" }),
  });

const STANDARD_ROLE_ORDER: Readonly<Record<"M" | "A" | "X", number>> = Object.freeze({
  M: 0,
  A: 1,
  X: 2,
});

function canonicalDecimal(value: InstanceType<typeof ChemistryDecimal>): string {
  return formatDecimal(value, 50);
}

function freezeSite(site: {
  id: string;
  role: CrystalSite["role"];
  label?: string;
  multiplicity: string;
  occupants: readonly SiteOccupant[];
  vacancyFraction: string;
}): CrystalSite {
  return Object.freeze({
    ...site,
    occupants: Object.freeze(site.occupants.map((occupant) => Object.freeze({ ...occupant }))),
  });
}

function freezeComposition(
  structure: SiteComposition["structure"],
  compositionRole: SiteCompositionRole,
  sites: readonly CrystalSite[],
): SiteComposition {
  return Object.freeze({
    schemaVersion: "1.0.0" as const,
    structure,
    compositionRole,
    sites: Object.freeze([...sites]),
  });
}

function canonicalizeSite(
  site: CrystalSite,
  index: number,
  duplicateOccupants: "reject" | "combine",
): ChemistryResult<CrystalSite> {
  const path = `sites.${index}`;
  if (typeof site.id !== "string" || site.id.trim().length === 0 || site.id.length > 128) {
    return failure(
      chemistryError("INVALID_SITE_ID", "Site identifier must contain 1 to 128 characters.", {
        fieldPath: `${path}.id`,
        offendingValue: String(site.id),
      }),
    );
  }
  if (!(["M", "A", "X", "custom"] as const).includes(site.role)) {
    return failure(
      chemistryError("INVALID_SITE_STRUCTURE", `Unknown site role "${String(site.role)}".`, {
        fieldPath: `${path}.role`,
        offendingValue: String(site.role),
      }),
    );
  }
  if (site.label !== undefined && (site.label.trim().length === 0 || site.label.length > 80)) {
    return failure(
      chemistryError("INVALID_SITE_ID", "Optional site label must contain 1 to 80 characters.", {
        fieldPath: `${path}.label`,
        offendingValue: site.label,
      }),
    );
  }

  const multiplicity = parseDecimal(site.multiplicity);
  if (!multiplicity?.isFinite() || !multiplicity.greaterThan(0)) {
    return failure(
      chemistryError("INVALID_MULTIPLICITY", `Site ${site.id} multiplicity must be finite and greater than zero.`, {
        fieldPath: `${path}.multiplicity`,
        offendingValue: site.multiplicity,
      }),
    );
  }
  const vacancy = parseDecimal(site.vacancyFraction);
  if (!vacancy?.isFinite()) {
    return failure(
      chemistryError("NEGATIVE_VACANCY", `Site ${site.id} vacancy fraction must be finite and non-negative.`, {
        fieldPath: `${path}.vacancyFraction`,
        offendingValue: site.vacancyFraction,
      }),
    );
  }
  if (vacancy.lessThan(0)) {
    return failure(
      chemistryError("NEGATIVE_VACANCY", `Site ${site.id} vacancy fraction cannot be negative.`, {
        fieldPath: `${path}.vacancyFraction`,
        offendingValue: site.vacancyFraction,
      }),
    );
  }
  if (vacancy.greaterThan(1)) {
    return failure(
      chemistryError("VACANCY_ABOVE_ONE", `Site ${site.id} vacancy fraction cannot exceed one.`, {
        fieldPath: `${path}.vacancyFraction`,
        offendingValue: site.vacancyFraction,
      }),
    );
  }

  const occupantsByElement = new Map<string, { fraction: InstanceType<typeof ChemistryDecimal>; locked: boolean }>();
  for (const [occupantIndex, occupant] of site.occupants.entries()) {
    const occupantPath = `${path}.occupants.${occupantIndex}`;
    if (!VALID_ELEMENT_SYMBOLS.has(occupant.element)) {
      return failure(
        chemistryError("INVALID_SITE_ELEMENT", `Invalid element symbol "${occupant.element}" on site ${site.id}.`, {
          fieldPath: `${occupantPath}.element`,
          offendingValue: occupant.element,
        }),
      );
    }
    const fraction = parseDecimal(occupant.fraction);
    if (!fraction?.isFinite() || fraction.lessThan(0)) {
      return failure(
        chemistryError("NEGATIVE_OCCUPANCY", `Occupancy for ${occupant.element} on site ${site.id} must be finite and non-negative.`, {
          fieldPath: `${occupantPath}.fraction`,
          offendingValue: occupant.fraction,
        }),
      );
    }
    const existing = occupantsByElement.get(occupant.element);
    if (existing && duplicateOccupants === "reject") {
      return failure(
        chemistryError("DUPLICATE_OCCUPANT", `Site ${site.id} contains duplicate occupant ${occupant.element}.`, {
          fieldPath: `${occupantPath}.element`,
          offendingValue: occupant.element,
          suggestedCorrection: "Combine the duplicate fractions explicitly or use duplicateOccupants: \"combine\".",
        }),
      );
    }
    occupantsByElement.set(occupant.element, {
      fraction: (existing?.fraction ?? new ChemistryDecimal(0)).plus(fraction),
      locked: Boolean(existing?.locked || occupant.locked),
    });
  }

  const occupants = [...occupantsByElement.entries()]
    .sort(
      ([left], [right]) =>
        (ATOMIC_NUMBER_BY_SYMBOL.get(left) ?? 0) -
        (ATOMIC_NUMBER_BY_SYMBOL.get(right) ?? 0),
    )
    .map(([element, occupant]) =>
      Object.freeze({
        element,
        fraction: canonicalDecimal(occupant.fraction),
        locked: occupant.locked,
      }),
    );

  return success(
    freezeSite({
      id: site.id,
      role: site.role,
      ...(site.label === undefined ? {} : { label: site.label }),
      multiplicity: canonicalDecimal(multiplicity),
      occupants,
      vacancyFraction: canonicalDecimal(vacancy),
    }),
  );
}

function canonicalizeComposition(
  composition: SiteComposition,
  duplicateOccupants: "reject" | "combine" = "reject",
): ChemistryResult<SiteComposition> {
  if (composition.schemaVersion !== "1.0.0") {
    return failure(
      chemistryError("INVALID_SITE_STRUCTURE", `Unsupported site-composition schema version "${String(composition.schemaVersion)}".`, {
        fieldPath: "schemaVersion",
        offendingValue: String(composition.schemaVersion),
      }),
    );
  }
  if (!(["211", "312", "413", "custom"] as const).includes(composition.structure)) {
    return failure(
      chemistryError("INVALID_SITE_STRUCTURE", `Unknown site structure "${String(composition.structure)}".`, {
        offendingValue: String(composition.structure),
      }),
    );
  }
  if (!(["ideal-crystal", "intended-feed"] as const).includes(composition.compositionRole)) {
    return failure(
      chemistryError("INVALID_SITE_STRUCTURE", `Unknown composition role "${String(composition.compositionRole)}".`, {
        offendingValue: String(composition.compositionRole),
      }),
    );
  }
  if (!Array.isArray(composition.sites) || composition.sites.length === 0) {
    return failure(chemistryError("INVALID_SITE_STRUCTURE", "Site composition must contain at least one site."));
  }

  const sites: CrystalSite[] = [];
  const ids = new Set<string>();
  for (const [index, site] of composition.sites.entries()) {
    const canonical = canonicalizeSite(site, index, duplicateOccupants);
    if (!canonical.success) return canonical;
    if (ids.has(canonical.value.id)) {
      return failure(
        chemistryError("DUPLICATE_SITE_ID", `Duplicate site identifier "${canonical.value.id}".`, {
          fieldPath: `sites.${index}.id`,
          offendingValue: canonical.value.id,
        }),
      );
    }
    ids.add(canonical.value.id);
    sites.push(canonical.value);
  }

  if (composition.structure === "custom") {
    if (sites.some((site) => site.role !== "custom")) {
      return failure(
        chemistryError("INVALID_SITE_STRUCTURE", "Every site in a custom structure must use the custom role."),
      );
    }
    sites.sort((left, right) => left.id.localeCompare(right.id, "en"));
  } else {
    const expected = TEMPLATE_MULTIPLICITIES[composition.structure];
    const standardSites = sites.filter((site): site is CrystalSite & { role: "M" | "A" | "X" } => site.role !== "custom");
    if (sites.length !== 3 || standardSites.length !== 3 || new Set(standardSites.map((site) => site.role)).size !== 3) {
      return failure(
        chemistryError("INVALID_SITE_STRUCTURE", `${composition.structure} requires exactly one M, one A, and one X site.`),
      );
    }
    for (const site of standardSites) {
      if (!new ChemistryDecimal(site.multiplicity).equals(expected[site.role])) {
        return failure(
          chemistryError(
            "INVALID_MULTIPLICITY",
            `${composition.structure} requires ${site.role} multiplicity ${expected[site.role]}.`,
            { offendingValue: site.multiplicity, fieldPath: `sites.${site.id}.multiplicity` },
          ),
        );
      }
    }
    sites.sort((left, right) =>
      STANDARD_ROLE_ORDER[left.role as "M" | "A" | "X"] -
      STANDARD_ROLE_ORDER[right.role as "M" | "A" | "X"],
    );
  }

  return success(freezeComposition(composition.structure, composition.compositionRole, sites));
}

function normalizationModeError(mode: unknown) {
  return failure<SiteCompositionOperation>(
    chemistryError("INVALID_NORMALIZATION_MODE", `Unknown normalization mode "${String(mode)}".`, {
      offendingValue: String(mode),
    }),
  );
}

function normalizeCanonicalComposition(
  composition: SiteComposition,
  mode: NormalizationMode,
): SiteCompositionResult {
  if (!(["strict", "normalizeOccupants", "normalizeAll"] as const).includes(mode)) {
    return normalizationModeError(mode);
  }

  const tolerance = new ChemistryDecimal(DEFAULT_COMPARISON_TOLERANCE);
  const normalizedSites: CrystalSite[] = [];
  const warnings: SiteWarning[] = [];
  const trace: SiteNormalizationTraceEntry[] = [];

  for (const [siteIndex, site] of composition.sites.entries()) {
    const occupantTotal = site.occupants.reduce(
      (sum, occupant) => sum.plus(occupant.fraction),
      new ChemistryDecimal(0),
    );
    const vacancy = new ChemistryDecimal(site.vacancyFraction);
    const total = occupantTotal.plus(vacancy);
    const isWithinTolerance = total.minus(1).abs().lessThanOrEqualTo(tolerance);

    if (occupantTotal.isZero() && !vacancy.equals(1)) {
      return failure(
        chemistryError(
          "EMPTY_OCCUPIED_SITE",
          `Site ${site.id} has no occupants and must have vacancy fraction exactly 1.`,
          { fieldPath: `sites.${siteIndex}.occupants`, offendingValue: site.vacancyFraction },
        ),
      );
    }

    if (mode === "strict") {
      if (!isWithinTolerance) {
        return failure(
          chemistryError(
            total.greaterThan(1) ? "SITE_OCCUPANCY_ABOVE_ONE" : "SITE_OCCUPANCY_NOT_NORMALIZED",
            `Site ${site.id} occupancy plus vacancy is ${canonicalDecimal(total)}; strict mode requires 1 within ${DEFAULT_COMPARISON_TOLERANCE}.`,
            { fieldPath: `sites.${siteIndex}`, offendingValue: canonicalDecimal(total) },
          ),
        );
      }
      normalizedSites.push(site);
      continue;
    }

    if (total.equals(1)) {
      normalizedSites.push(site);
      continue;
    }

    let occupantScale = new ChemistryDecimal(1);
    let vacancyScale = new ChemistryDecimal(1);
    if (mode === "normalizeOccupants") {
      const nonVacantTarget = new ChemistryDecimal(1).minus(vacancy);
      if (occupantTotal.isZero()) {
        if (vacancy.equals(1)) {
          normalizedSites.push(site);
          continue;
        }
        return failure(
          chemistryError(
            "CANNOT_NORMALIZE_OCCUPANTS",
            `Site ${site.id} has no positive occupant total to scale into the non-vacant portion.`,
            { fieldPath: `sites.${siteIndex}.occupants` },
          ),
        );
      }
      occupantScale = nonVacantTarget.dividedBy(occupantTotal);
    } else {
      if (!total.greaterThan(0)) {
        return failure(
          chemistryError("EMPTY_OCCUPIED_SITE", `Site ${site.id} has zero total occupancy and cannot be normalized.`, {
            fieldPath: `sites.${siteIndex}`,
          }),
        );
      }
      occupantScale = new ChemistryDecimal(1).dividedBy(total);
      vacancyScale = occupantScale;
    }

    const occupants = site.occupants.map((occupant) =>
      Object.freeze({
        ...occupant,
        fraction: canonicalDecimal(new ChemistryDecimal(occupant.fraction).times(occupantScale)),
      }),
    );
    const normalizedVacancy = vacancy.times(vacancyScale);
    const afterOccupantTotal = occupants.reduce(
      (sum, occupant) => sum.plus(occupant.fraction),
      new ChemistryDecimal(0),
    );
    normalizedSites.push(
      freezeSite({
        ...site,
        occupants,
        vacancyFraction: canonicalDecimal(normalizedVacancy),
      }),
    );
    warnings.push(
      Object.freeze({
        code: "SITE_NORMALIZATION_APPLIED" as const,
        siteId: site.id,
        message: `${mode} normalization was explicitly applied to site ${site.id}.`,
      }),
    );
    trace.push(
      Object.freeze({
        operation: "site-normalization" as const,
        mode,
        siteId: site.id,
        beforeOccupantTotal: canonicalDecimal(occupantTotal),
        beforeVacancyFraction: canonicalDecimal(vacancy),
        afterOccupantTotal: canonicalDecimal(afterOccupantTotal),
        afterVacancyFraction: canonicalDecimal(normalizedVacancy),
        occupantScaleFactor: canonicalDecimal(occupantScale),
        vacancyScaleFactor: canonicalDecimal(vacancyScale),
      }),
    );
  }

  return success(
    Object.freeze({
      composition: freezeComposition(composition.structure, composition.compositionRole, normalizedSites),
      warnings: Object.freeze(warnings),
      trace: Object.freeze(trace),
    }),
  );
}

function standardSite(
  role: "M" | "A" | "X",
  multiplicity: string,
  input: StandardSiteInput,
): CrystalSite {
  return {
    id: role,
    role,
    ...(input.label === undefined ? {} : { label: input.label }),
    multiplicity,
    occupants: input.occupants.map((occupant) => ({
      element: occupant.element,
      fraction: occupant.fraction,
      locked: occupant.locked ?? false,
    })),
    vacancyFraction: input.vacancyFraction ?? "0",
  };
}

export function createStandardMaxComposition(
  template: StandardMaxTemplate,
  sites: StandardMaxSiteInput,
  options: SiteCreationOptions = {},
): SiteCompositionResult {
  if (!Object.hasOwn(TEMPLATE_MULTIPLICITIES, template)) {
    return failure(
      chemistryError("INVALID_SITE_STRUCTURE", `Unknown MAX template "${String(template)}".`, {
        offendingValue: String(template),
      }),
    );
  }
  const multiplicities = TEMPLATE_MULTIPLICITIES[template];
  const raw = {
    schemaVersion: "1.0.0" as const,
    structure: template,
    compositionRole: options.compositionRole ?? "ideal-crystal",
    sites: [
      standardSite("M", multiplicities.M, sites.M),
      standardSite("A", multiplicities.A, sites.A),
      standardSite("X", multiplicities.X, sites.X),
    ],
  } as SiteComposition;
  const canonical = canonicalizeComposition(raw, options.duplicateOccupants ?? "reject");
  if (!canonical.success) return canonical;
  return normalizeCanonicalComposition(canonical.value, options.normalizationMode ?? "strict");
}

export function createCustomSiteComposition(
  sites: readonly CustomSiteInput[],
  options: SiteCreationOptions = {},
): SiteCompositionResult {
  const raw = {
    schemaVersion: "1.0.0" as const,
    structure: "custom" as const,
    compositionRole: options.compositionRole ?? "ideal-crystal",
    sites: sites.map((site) => ({
      id: site.id,
      role: "custom" as const,
      ...(site.label === undefined ? {} : { label: site.label }),
      multiplicity: site.multiplicity,
      occupants: site.occupants.map((occupant) => ({
        element: occupant.element,
        fraction: occupant.fraction,
        locked: occupant.locked ?? false,
      })),
      vacancyFraction: site.vacancyFraction ?? "0",
    })),
  } as SiteComposition;
  const canonical = canonicalizeComposition(raw, options.duplicateOccupants ?? "reject");
  if (!canonical.success) return canonical;
  return normalizeCanonicalComposition(canonical.value, options.normalizationMode ?? "strict");
}

export function normalizeSiteComposition(
  composition: SiteComposition,
  mode: NormalizationMode,
): SiteCompositionResult {
  const canonical = canonicalizeComposition(composition);
  if (!canonical.success) return canonical;
  return normalizeCanonicalComposition(canonical.value, mode);
}

export function validateSiteComposition(
  composition: SiteComposition,
  mode: NormalizationMode = "strict",
): SiteValidationResult {
  const normalized = normalizeSiteComposition(composition, mode);
  if (!normalized.success) return normalized;
  return success(
    Object.freeze({
      valid: true as const,
      normalizationRequired: normalized.value.trace.length > 0,
      ...normalized.value,
    }),
  );
}

export function siteCompositionToElementalComposition(
  composition: SiteComposition,
): ChemistryResult<ElementalComposition> {
  const validated = validateSiteComposition(composition, "strict");
  if (!validated.success) return validated;
  const amounts = new Map<string, InstanceType<typeof ChemistryDecimal>>();
  for (const site of validated.value.composition.sites) {
    const multiplicity = new ChemistryDecimal(site.multiplicity);
    for (const occupant of site.occupants) {
      amounts.set(
        occupant.element,
        (amounts.get(occupant.element) ?? new ChemistryDecimal(0)).plus(
          multiplicity.times(occupant.fraction),
        ),
      );
    }
  }
  return createComposition(
    Object.fromEntries(
      [...amounts.entries()].map(([element, amount]) => [element, canonicalDecimal(amount)]),
    ),
  );
}

function renderCoefficient(value: string): string {
  const canonical = canonicalDecimal(new ChemistryDecimal(value));
  return canonical === "1" ? "" : canonical;
}

export function renderSiteComposition(
  composition: SiteComposition,
  options: SiteRenderingOptions = {},
): ChemistryResult<SiteRenderingResult> {
  const validated = validateSiteComposition(composition, "strict");
  if (!validated.success) return validated;
  const vacancySymbol = options.vacancySymbol ?? "□";
  const annotations: string[] = [];
  const warnings: SiteWarning[] = [];

  const formula = validated.value.composition.sites
    .map((site) => {
      const parts = site.occupants
        .filter((occupant) => new ChemistryDecimal(occupant.fraction).greaterThan(0))
        .map((occupant) => `${occupant.element}${renderCoefficient(occupant.fraction)}`);
      const vacancy = new ChemistryDecimal(site.vacancyFraction);
      if (vacancy.greaterThan(0)) {
        parts.push(`${vacancySymbol}${renderCoefficient(site.vacancyFraction)}`);
        annotations.push(`Site ${site.id} vacancy fraction: ${site.vacancyFraction}.`);
        warnings.push(
          Object.freeze({
            code: "VACANCY_ANNOTATED" as const,
            siteId: site.id,
            message: `Site ${site.id} vacancy is shown with ${vacancySymbol} and explicit metadata.`,
          }),
        );
      }
      const fullyVacant =
        vacancy.equals(1) &&
        site.occupants.every((occupant) => new ChemistryDecimal(occupant.fraction).isZero());
      const content = parts.length === 1 &&
          ((vacancy.isZero() && site.occupants.length === 1) || fullyVacant)
        ? parts[0]
        : `(${parts.join("")})`;
      return `${content}${renderCoefficient(site.multiplicity)}`;
    })
    .join("");

  if (composition.structure === "custom") {
    warnings.push(
      Object.freeze({
        code: "CUSTOM_SITE_RENDERING" as const,
        message: "Custom-site concatenation is deterministic by site identifier but is display notation, not a parser round trip.",
      }),
    );
  }

  return success(
    Object.freeze({
      formula,
      annotations: Object.freeze(annotations),
      warnings: Object.freeze(warnings),
      sites: Object.freeze(
        validated.value.composition.sites.map((site) =>
          Object.freeze({
            siteId: site.id,
            siteRole: site.role,
            multiplicity: site.multiplicity,
            vacancyFraction: site.vacancyFraction,
            lockedElements: Object.freeze(
              site.occupants.filter((occupant) => occupant.locked).map((occupant) => occupant.element),
            ),
          }),
        ),
      ),
    }),
  );
}
