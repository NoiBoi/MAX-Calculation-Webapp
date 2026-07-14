import { describe, expect, it } from "vitest";
import { DEFAULT_ATOMIC_RADIUS_REGISTRY } from "./default-radius-data";
import { createStandardMaxComposition } from "./site-composition";
import { RADIUS_DESCRIPTOR_DISCLAIMER, RADIUS_DESCRIPTOR_UNAVAILABLE_MESSAGE, RADIUS_SITE_MODEL_REQUIRED_MESSAGE, assessRadiusDescriptorAvailability, calculateSiteRadiusDescriptor, canonicalRadiusDatasetContent, createAtomicRadiusRegistry, validateAtomicRadiusDataset, type AtomicRadiusDataset } from "./radius-data";

const digest = "a".repeat(64);
function dataset(patch: Record<string, unknown> = {}): AtomicRadiusDataset {
  return { schemaVersion: "2.0.0", datasetId: "synthetic-contract-fixture", datasetVersion: "2026.1.0", name: "Synthetic schema fixture", definition: "metallic", definitionDetail: "Test-only unconditional values", source: { sourceId: "fixture-source", title: "Test source", primarySource: "Test fixture", editionOrVersion: "1" }, units: "pm", coordinationPolicy: "One default per element", oxidationStatePolicy: "Not represented", spinStatePolicy: "Not represented", missingValuePolicy: "block-site-descriptor", approval: { status: "source-verified", sourceVerified: true, labApproval: "not-reviewed" }, digest, coverage: { elements: ["Ti"], missingElements: [], recordCount: 1 }, parsingWarnings: [], values: [{ element: "Ti", radiusPm: "100", selectionKey: "default", defaultForPolicy: true, estimated: false, sourceLocation: "fixture row 1" }], ...patch } as AtomicRadiusDataset;
}

function mixedSite(template: "211" | "413" = "211") {
  const result = createStandardMaxComposition(template, { M: { occupants: [{ element: "Ti", fraction: "0.3333333333333333333333333333333333" }, { element: "V", fraction: "0.3333333333333333333333333333333333" }, { element: "Nb", fraction: "0.3333333333333333333333333333333334" }] }, A: { occupants: [{ element: "Al", fraction: "1" }] }, X: { occupants: [{ element: "C", fraction: "1" }] } });
  if (!result.success) throw new Error(result.errors[0]?.message);
  return result.value.composition;
}

describe("versioned atomic-radius datasets", () => {
  it("accepts source-verified data for screening without claiming lab approval", () => { const result = validateAtomicRadiusDataset(dataset(), digest); expect(result.valid).toBe(true); expect(result.usableForScreening).toBe(true); expect(result.approvedForCalculation).toBe(false); });
  it.each([
    ["missing dataset ID", { datasetId: "" }, "RADIUS_DATASET_ID_MISSING"],
    ["unsupported units", { units: "angstrom" }, "RADIUS_DATASET_UNITS_INVALID"],
    ["zero radius", { values: [{ element: "Ti", radiusPm: "0", selectionKey: "default", defaultForPolicy: true, estimated: false, sourceLocation: "x" }] }, "RADIUS_VALUE_INVALID"],
    ["duplicate qualified record", { values: [{ element: "Ti", radiusPm: "100", selectionKey: "same", defaultForPolicy: true, estimated: false, sourceLocation: "x" }, { element: "Ti", radiusPm: "101", selectionKey: "same", defaultForPolicy: false, estimated: false, sourceLocation: "y" }] }, "RADIUS_ELEMENT_DUPLICATE"],
  ])("blocks %s", (_name, patch, code) => expect(validateAtomicRadiusDataset(dataset(patch), digest).diagnostics.some((item) => item.code === code)).toBe(true));
  it("keeps qualifier-distinct variants", () => expect(validateAtomicRadiusDataset(dataset({ values: [{ element: "Ti", radiusPm: "100", selectionKey: "a", defaultForPolicy: true, estimated: false, sourceLocation: "x" }, { element: "Ti", radiusPm: "101", selectionKey: "b", defaultForPolicy: false, estimated: false, sourceLocation: "y" }], coverage: { elements: ["Ti"], missingElements: [], recordCount: 2 } }), digest).valid).toBe(true));
  it("requires independent digest verification", () => expect(validateAtomicRadiusDataset(dataset()).diagnostics.some((item) => item.code === "RADIUS_DATASET_DIGEST_MISMATCH")).toBe(true));
  it("does not enable provisional data", () => { const result = validateAtomicRadiusDataset(dataset({ approval: { status: "provisional", sourceVerified: false, labApproval: "not-reviewed" } }), digest); expect(result.usableForScreening).toBe(false); });
  it("keeps trust metadata outside scientific content", () => expect(canonicalRadiusDatasetContent(dataset())).toEqual(canonicalRadiusDatasetContent(dataset({ approval: { status: "lab-approved", sourceVerified: true, labApproval: "lab-approved", reviewer: "Test", reviewDate: "2026-07-14" } }))));
  it("installs Teatum and Cordero for screening and keeps Rahm provisional", () => { expect(DEFAULT_ATOMIC_RADIUS_REGISTRY.datasets).toHaveLength(3); expect(DEFAULT_ATOMIC_RADIUS_REGISTRY.usableDatasets.map((item) => item.datasetId)).toEqual(["cordero-covalent-2008", "teatum-metallic-cn12"]); expect(DEFAULT_ATOMIC_RADIUS_REGISTRY.approvedDatasets).toHaveLength(0); });
  it("never infers sites from a flat formula", () => expect(assessRadiusDescriptorAvailability(undefined, DEFAULT_ATOMIC_RADIUS_REGISTRY)).toMatchObject({ status: "unavailable-no-site-model", message: RADIUS_SITE_MODEL_REQUIRED_MESSAGE }));
  it("returns the exact empty-registry message", () => expect(createAtomicRadiusRegistry([]).availabilityMessage).toBe(RADIUS_DESCRIPTOR_UNAVAILABLE_MESSAGE));
});

describe("explicit-site radius descriptors", () => {
  const teatum = DEFAULT_ATOMIC_RADIUS_REGISTRY.datasets.find((item) => item.datasetId === "teatum-metallic-cn12")!;
  it("calculates mean, range, standard deviation and mismatch using Decimal", () => { const result = calculateSiteRadiusDescriptor(mixedSite(), "M", teatum); expect(result.available).toBe(true); expect(result.meanRadiusPm).toBeDefined(); expect(result.minimumRadiusPm).toBe("134.6"); expect(result.maximumRadiusPm).toBe("146.8"); expect(result.rangeRadiusPm).toBe("12.2"); expect(Number(result.standardDeviationPm)).toBeCloseTo(5.615, 3); expect(Number(result.mismatchPercent)).toBeCloseTo(3.939, 3); expect(result.disclaimer).toBe(RADIUS_DESCRIPTOR_DISCLAIMER); });
  it("site multiplicity does not alter site statistics", () => expect(calculateSiteRadiusDescriptor(mixedSite("413"), "M", teatum).mismatchPercent).toBe(calculateSiteRadiusDescriptor(mixedSite("211"), "M", teatum).mismatchPercent));
  it("a single occupied element has zero mismatch", () => { const result = createStandardMaxComposition("211", { M: { occupants: [{ element: "Ti", fraction: "1" }] }, A: { occupants: [{ element: "Al", fraction: "1" }] }, X: { occupants: [{ element: "C", fraction: "1" }] } }); if (!result.success) throw new Error(); expect(calculateSiteRadiusDescriptor(result.value.composition, "M", teatum).mismatchPercent).toBe("0"); });
  it("excludes vacancy and normalizes occupied fractions", () => { const result = createStandardMaxComposition("211", { M: { occupants: [{ element: "Ti", fraction: "0.5" }, { element: "V", fraction: "0.25" }], vacancyFraction: "0.25" }, A: { occupants: [{ element: "Al", fraction: "1" }] }, X: { occupants: [{ element: "C", fraction: "1" }] } }); if (!result.success) throw new Error(); const descriptor = calculateSiteRadiusDescriptor(result.value.composition, "M", teatum); expect(descriptor.occupants.map((item) => item.normalizedOccupiedFraction)).toEqual(["0.6666666666666666666666666666666667", "0.3333333333333333333333333333333333"]); });
  it("blocks aggregates when any occupant is missing without dropping it", () => { const synthetic = dataset(); const result = calculateSiteRadiusDescriptor(mixedSite(), "M", synthetic); expect(result.available).toBe(false); expect(result.missingElements).toEqual(["V", "Nb"]); expect(result.occupants).toHaveLength(3); });
  it("a provenance-bearing override resolves a missing value", () => { const result = calculateSiteRadiusDescriptor(mixedSite(), "M", dataset(), [{ overrideId: "v-override", element: "V", radiusPm: "105", units: "pm", definition: "metallic", reason: "Test", sourceOrMeasurementBasis: "Measured test", label: "V test", revisionDate: "2026-07-14" }, { overrideId: "nb-override", element: "Nb", radiusPm: "110", units: "pm", definition: "metallic", reason: "Test", sourceOrMeasurementBasis: "Measured test", label: "Nb test", revisionDate: "2026-07-14" }]); expect(result.available).toBe(true); });
});
