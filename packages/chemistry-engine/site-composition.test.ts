import { describe, expect, it } from "vitest";
import { compositionsEqualExact } from "./composition";
import { ChemistryDecimal } from "./numeric";
import { SiteCompositionSchema } from "./schemas";
import {
  createCustomSiteComposition,
  createStandardMaxComposition,
  normalizeSiteComposition,
  renderSiteComposition,
  siteCompositionToElementalComposition,
  validateSiteComposition,
  type SiteCompositionOperation,
  type SiteCompositionResult,
  type StandardMaxSiteInput,
  type StandardMaxTemplate,
} from "./site-composition";

const pure = (element: string) => ({ occupants: [{ element, fraction: "1" }] });

function operation(result: SiteCompositionResult): SiteCompositionOperation {
  expect(result.success, result.success ? undefined : result.errors[0]?.message).toBe(true);
  if (!result.success) throw new Error(result.errors[0]?.message);
  return result.value;
}

function standard(template: StandardMaxTemplate, sites: StandardMaxSiteInput) {
  return operation(createStandardMaxComposition(template, sites));
}

function elemental(result: SiteCompositionOperation) {
  const converted = siteCompositionToElementalComposition(result.composition);
  expect(converted.success, converted.success ? undefined : converted.errors[0]?.message).toBe(true);
  if (!converted.success) throw new Error(converted.errors[0]?.message);
  return converted.value;
}

describe("standard MAX site structures", () => {
  it.each([
    ["211", { M: pure("Ti"), A: pure("Al"), X: pure("N") }, { Al: "1", N: "1", Ti: "2" }, "Ti2AlN"],
    ["312", { M: pure("Ti"), A: pure("Al"), X: pure("C") }, { Al: "1", C: "2", Ti: "3" }, "Ti3AlC2"],
    ["413", { M: pure("Ti"), A: pure("Al"), X: pure("N") }, { Al: "1", N: "3", Ti: "4" }, "Ti4AlN3"],
  ] as const)("converts and renders %s", (template, sites, expected, formula) => {
    const result = standard(template, sites);
    expect(result.composition.sites.map((site) => site.role)).toEqual(["M", "A", "X"]);
    expect(elemental(result).amounts).toEqual(expected);
    const rendered = renderSiteComposition(result.composition);
    expect(rendered).toEqual(expect.objectContaining({
      success: true,
      value: expect.objectContaining({ formula }),
    }));
    expect(SiteCompositionSchema.safeParse(result.composition).success).toBe(true);
  });

  it("models explicitly supplied mixed M occupancy without inferring sites", () => {
    const result = standard("211", {
      M: { occupants: [{ element: "Nb", fraction: "0.5" }, { element: "Ti", fraction: "0.5" }] },
      A: pure("Al"),
      X: pure("N"),
    });
    expect(elemental(result).amounts).toEqual({ Al: "1", N: "1", Nb: "1", Ti: "1" });
    const rendered = renderSiteComposition(result.composition);
    expect(rendered.success && rendered.value.formula).toBe("(Ti0.5Nb0.5)2AlN");
  });

  it("models explicitly supplied mixed C/N X occupancy", () => {
    const result = standard("312", {
      M: pure("Ti"),
      A: pure("Al"),
      X: { occupants: [{ element: "N", fraction: "0.5" }, { element: "C", fraction: "0.5" }] },
    });
    expect(elemental(result).amounts).toEqual({ Al: "1", C: "1", N: "1", Ti: "3" });
    const rendered = renderSiteComposition(result.composition);
    expect(rendered.success && rendered.value.formula).toBe("Ti3Al(C0.5N0.5)2");
  });

  it("supports a nine-element non-equimolar M site", () => {
    const result = standard("211", {
      M: { occupants: [
        { element: "W", fraction: "0.12" },
        { element: "Ti", fraction: "0.05" },
        { element: "V", fraction: "0.08" },
        { element: "Cr", fraction: "0.10" },
        { element: "Zr", fraction: "0.12" },
        { element: "Nb", fraction: "0.15" },
        { element: "Mo", fraction: "0.11" },
        { element: "Hf", fraction: "0.13" },
        { element: "Ta", fraction: "0.14" },
      ] },
      A: pure("Al"),
      X: pure("C"),
    });
    expect(result.composition.sites[0]?.occupants.map((occupant) => occupant.element)).toEqual([
      "Ti", "V", "Cr", "Zr", "Nb", "Mo", "Hf", "Ta", "W",
    ]);
    expect(elemental(result).amounts).toEqual({
      Al: "1", C: "1", Cr: "0.2", Hf: "0.26", Mo: "0.22", Nb: "0.3",
      Ta: "0.28", Ti: "0.1", V: "0.16", W: "0.24", Zr: "0.24",
    });
  });
});

describe("custom sites, vacancies, locks, and roles", () => {
  it("supports custom identifiers, labels, multiplicities, and deterministic site order", () => {
    const result = operation(createCustomSiteComposition([
      { id: "beta", label: "second", multiplicity: "0.5", occupants: [{ element: "Al", fraction: "1" }] },
      { id: "alpha", label: "first", multiplicity: "1.5", occupants: [{ element: "Ti", fraction: "1" }] },
    ]));
    expect(result.composition.sites.map((site) => site.id)).toEqual(["alpha", "beta"]);
    expect(elemental(result).amounts).toEqual({ Al: "0.5", Ti: "1.5" });
    const rendered = renderSiteComposition(result.composition);
    expect(rendered.success && rendered.value.warnings).toContainEqual(expect.objectContaining({
      code: "CUSTOM_SITE_RENDERING",
    }));
  });

  it("keeps explicit vacancies visible in formula and metadata", () => {
    const result = standard("211", {
      M: { occupants: [{ element: "Ti", fraction: "0.9" }], vacancyFraction: "0.1" },
      A: pure("Al"),
      X: pure("N"),
    });
    expect(elemental(result).amounts).toEqual({ Al: "1", N: "1", Ti: "1.8" });
    const rendered = renderSiteComposition(result.composition);
    expect(rendered.success).toBe(true);
    if (!rendered.success) return;
    expect(rendered.value.formula).toBe("(Ti0.9□0.1)2AlN");
    expect(rendered.value.annotations).toEqual(["Site M vacancy fraction: 0.1."]);
  });

  it("accepts a fully vacant site", () => {
    const result = operation(createCustomSiteComposition([
      { id: "vacant", multiplicity: "2", occupants: [], vacancyFraction: "1" },
    ]));
    expect(elemental(result).amounts).toEqual({});
    const rendered = renderSiteComposition(result.composition);
    expect(rendered.success && rendered.value.formula).toBe("□2");
  });

  it("keeps lock metadata without changing chemistry", () => {
    const unlocked = standard("211", {
      M: { occupants: [{ element: "Ti", fraction: "0.5" }, { element: "Nb", fraction: "0.5" }] },
      A: pure("Al"), X: pure("N"),
    });
    const locked = standard("211", {
      M: { occupants: [{ element: "Ti", fraction: "0.5", locked: true }, { element: "Nb", fraction: "0.5" }] },
      A: pure("Al"), X: pure("N"),
    });
    expect(compositionsEqualExact(elemental(unlocked), elemental(locked))).toBe(true);
    expect(locked.composition.sites[0]?.occupants[0]?.locked).toBe(true);
  });

  it("preserves explicit ideal and intended-feed semantic roles", () => {
    const ideal = operation(createStandardMaxComposition("211", {
      M: pure("Ti"), A: pure("Al"), X: pure("N"),
    }, { compositionRole: "ideal-crystal" }));
    const feed = operation(createStandardMaxComposition("211", {
      M: pure("Ti"), A: pure("Al"), X: pure("N"),
    }, { compositionRole: "intended-feed" }));
    expect(ideal.composition.compositionRole).toBe("ideal-crystal");
    expect(feed.composition.compositionRole).toBe("intended-feed");
    expect(elemental(ideal)).toEqual(elemental(feed));
  });
});

describe("validation and explicit normalization", () => {
  it("validates an already strict composition without trace", () => {
    const result = standard("211", { M: pure("Ti"), A: pure("Al"), X: pure("N") });
    const validation = validateSiteComposition(result.composition, "strict");
    expect(validation.success && validation.value.normalizationRequired).toBe(false);
  });

  it("normalizes occupants into the non-vacant portion and records trace", () => {
    const result = operation(createStandardMaxComposition("211", {
      M: { occupants: [{ element: "Ti", fraction: "0.4" }, { element: "Nb", fraction: "0.4" }], vacancyFraction: "0.1" },
      A: pure("Al"), X: pure("N"),
    }, { normalizationMode: "normalizeOccupants" }));
    expect(result.composition.sites[0]).toMatchObject({
      vacancyFraction: "0.1",
      occupants: [{ element: "Ti", fraction: "0.45" }, { element: "Nb", fraction: "0.45" }],
    });
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "SITE_NORMALIZATION_APPLIED", siteId: "M" }));
    expect(result.trace[0]).toMatchObject({ mode: "normalizeOccupants", occupantScaleFactor: "1.125" });
  });

  it("normalizes occupants and vacancy together to total one", () => {
    const result = operation(createStandardMaxComposition("211", {
      M: { occupants: [{ element: "Ti", fraction: "0.4" }, { element: "Nb", fraction: "0.4" }], vacancyFraction: "0.1" },
      A: pure("Al"), X: pure("N"),
    }, { normalizationMode: "normalizeAll" }));
    const site = result.composition.sites[0];
    if (!site) throw new Error("Missing M site");
    const total = site.occupants.reduce((sum, occupant) => sum.plus(occupant.fraction), new ChemistryDecimal(site.vacancyFraction));
    expect(total.minus(1).abs().lessThanOrEqualTo("1e-30")).toBe(true);
    expect(result.trace[0]?.mode).toBe("normalizeAll");
  });

  it("rejects occupancy above one in strict mode", () => {
    const result = createStandardMaxComposition("211", {
      M: { occupants: [{ element: "Ti", fraction: "0.7" }, { element: "Nb", fraction: "0.7" }] },
      A: pure("Al"), X: pure("N"),
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]?.code).toBe("SITE_OCCUPANCY_ABOVE_ONE");
  });

  it.each([
    ["negative occupancy", { M: { occupants: [{ element: "Ti", fraction: "-0.1" }] }, A: pure("Al"), X: pure("N") }, "NEGATIVE_OCCUPANCY"],
    ["negative vacancy", { M: { occupants: [{ element: "Ti", fraction: "1.1" }], vacancyFraction: "-0.1" }, A: pure("Al"), X: pure("N") }, "NEGATIVE_VACANCY"],
    ["invalid element", { M: { occupants: [{ element: "Tii", fraction: "1" }] }, A: pure("Al"), X: pure("N") }, "INVALID_SITE_ELEMENT"],
    ["empty invalid site", { M: { occupants: [], vacancyFraction: "0" }, A: pure("Al"), X: pure("N") }, "EMPTY_OCCUPIED_SITE"],
    ["all-zero occupied site", { M: { occupants: [{ element: "Ti", fraction: "0" }], vacancyFraction: "0" }, A: pure("Al"), X: pure("N") }, "EMPTY_OCCUPIED_SITE"],
  ] as const)("rejects %s", (_name, sites, code) => {
    const result = createStandardMaxComposition("211", sites);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]?.code).toBe(code);
  });

  it("never normalizes a deficient site unless explicitly requested", () => {
    const result = createStandardMaxComposition("211", {
      M: { occupants: [{ element: "Ti", fraction: "0.8" }] },
      A: pure("Al"), X: pure("N"),
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]?.code).toBe("SITE_OCCUPANCY_NOT_NORMALIZED");
  });

  it("rejects invalid custom multiplicity", () => {
    const result = createCustomSiteComposition([{ id: "bad", multiplicity: "0", occupants: [{ element: "Ti", fraction: "1" }] }]);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.errors[0]?.code).toBe("INVALID_MULTIPLICITY");
  });

  it("rejects duplicate occupants unless combination is explicitly selected", () => {
    const sites = {
      M: { occupants: [{ element: "Ti", fraction: "0.4" }, { element: "Ti", fraction: "0.6" }] },
      A: pure("Al"), X: pure("N"),
    };
    const rejected = createStandardMaxComposition("211", sites);
    expect(rejected.success).toBe(false);
    if (!rejected.success) expect(rejected.errors[0]?.code).toBe("DUPLICATE_OCCUPANT");
    const combined = operation(createStandardMaxComposition("211", sites, { duplicateOccupants: "combine" }));
    expect(combined.composition.sites[0]?.occupants).toEqual([{ element: "Ti", fraction: "1", locked: false }]);
  });

  it("rejects an unknown normalization mode at runtime", () => {
    const result = standard("211", { M: pure("Ti"), A: pure("Al"), X: pure("N") });
    const invalid = normalizeSiteComposition(result.composition, "automatic" as never);
    expect(invalid.success).toBe(false);
    if (!invalid.success) expect(invalid.errors[0]?.code).toBe("INVALID_NORMALIZATION_MODE");
  });

  it("returns immutable output without changing input", () => {
    const input = {
      M: { occupants: [{ element: "Ti", fraction: "1" }] },
      A: pure("Al"), X: pure("N"),
    };
    const before = JSON.stringify(input);
    const result = standard("211", input);
    expect(JSON.stringify(input)).toBe(before);
    expect(Object.isFrozen(result.composition)).toBe(true);
    expect(Object.isFrozen(result.composition.sites)).toBe(true);
    expect(Object.isFrozen(result.composition.sites[0]?.occupants)).toBe(true);
  });

  it("does not expose any flat-formula-to-site inference API", async () => {
    const siteApi = await import("./site-composition");
    expect("inferSiteComposition" in siteApi).toBe(false);
    expect("parseSiteComposition" in siteApi).toBe(false);
  });
});
