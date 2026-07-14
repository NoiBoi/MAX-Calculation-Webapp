import { describe, expect, it } from "vitest";
import { createStandardMaxComposition } from "./site-composition";
import { RADIUS_DESCRIPTOR_UNAVAILABLE_MESSAGE, RADIUS_SITE_MODEL_REQUIRED_MESSAGE, assessRadiusDescriptorAvailability, canonicalRadiusDatasetContent, createAtomicRadiusRegistry, validateAtomicRadiusDataset, type AtomicRadiusDataset } from "./radius-data";

const digest = "a".repeat(64);
function dataset(patch: Record<string, unknown> = {}): AtomicRadiusDataset {
  return { schemaVersion: "1.0.0", datasetId: "synthetic-contract-fixture", datasetVersion: "2026.1.0", name: "Synthetic schema-validation fixture; not scientific data", definition: "metallic", source: { sourceId: "fixture-source", title: "Test-only contract source", primarySource: "Test fixture", editionOrVersion: "1" }, units: "pm", coordinationPolicy: "One unconditional record per element", oxidationStatePolicy: "Not represented", spinStatePolicy: "Not represented", missingValuePolicy: "block-site-descriptor", approval: { status: "approved", reviewer: "Test fixture reviewer", reviewDate: "2026-07-13" }, digest, values: [{ element: "Ti", radiusPm: "100", sourceLocation: "fixture row 1" }], ...patch } as AtomicRadiusDataset;
}

describe("versioned atomic-radius dataset gate", () => {
  it("accepts a structurally complete, approved, digest-verified contract fixture", () => { const result = validateAtomicRadiusDataset(dataset(), digest); expect(result.valid).toBe(true); expect(result.approvedForCalculation).toBe(true); expect(Object.isFrozen(result.dataset)).toBe(true); expect(Object.isFrozen(result.dataset?.values)).toBe(true); });
  it.each([
    ["missing dataset ID", { datasetId: "" }, "RADIUS_DATASET_ID_MISSING"],
    ["missing source", { source: undefined }, "RADIUS_DATASET_SOURCE_MISSING"],
    ["unsupported units", { units: "angstrom" }, "RADIUS_DATASET_UNITS_INVALID"],
    ["zero radius", { values: [{ element: "Ti", radiusPm: "0" }] }, "RADIUS_VALUE_INVALID"],
    ["negative radius", { values: [{ element: "Ti", radiusPm: "-1" }] }, "RADIUS_VALUE_INVALID"],
    ["unknown element", { values: [{ element: "Xx", radiusPm: "100" }] }, "RADIUS_ELEMENT_UNKNOWN"],
    ["duplicate element", { values: [{ element: "Ti", radiusPm: "100" }, { element: "Ti", radiusPm: "101" }] }, "RADIUS_ELEMENT_DUPLICATE"],
  ])("blocks %s", (_name, patch, code) => { expect(validateAtomicRadiusDataset(dataset(patch), digest).diagnostics.some((item) => item.code === code)).toBe(true); });
  it("requires independent digest verification and rejects mismatches", () => { expect(validateAtomicRadiusDataset(dataset()).diagnostics.some((item) => item.code === "RADIUS_DATASET_DIGEST_MISMATCH")).toBe(true); expect(validateAtomicRadiusDataset(dataset(), "b".repeat(64)).valid).toBe(false); });
  it("does not enable provisional or imported approval metadata", () => { for (const status of ["provisional", "imported-unverified"] as const) { const result = validateAtomicRadiusDataset(dataset({ approval: { status } }), digest); expect(result.approvedForCalculation).toBe(false); expect(result.diagnostics.some((item) => item.code === "RADIUS_DATASET_UNAPPROVED")).toBe(true); } });
  it("keeps approval metadata outside the content-addressed scientific payload", () => { const original = dataset(); const changed = dataset({ approval: { status: "imported-unverified" } }); expect(canonicalRadiusDatasetContent(original)).toEqual(canonicalRadiusDatasetContent(changed)); });
  it("returns the exact unavailable message when the installed registry is empty", () => { const registry = createAtomicRadiusRegistry([]); expect(registry.approvedDatasets).toHaveLength(0); expect(registry.availabilityMessage).toBe(RADIUS_DESCRIPTOR_UNAVAILABLE_MESSAGE); expect(assessRadiusDescriptorAvailability(undefined, registry).message).toBe(RADIUS_SITE_MODEL_REQUIRED_MESSAGE); });
  it("does not infer crystallographic sites from a flat formula", () => { const registry = createAtomicRadiusRegistry([]); expect(assessRadiusDescriptorAvailability(undefined, registry).status).toBe("unavailable-no-site-model"); });
  it("preserves an explicit site model while blocking calculations without approved data", () => { const site = createStandardMaxComposition("211", { M: { occupants: [{ element: "Ti", fraction: "1" }] }, A: { occupants: [{ element: "Al", fraction: "1" }] }, X: { occupants: [{ element: "N", fraction: "1" }] } }); if (!site.success) throw new Error(site.errors[0]?.message); const result = assessRadiusDescriptorAvailability(site.value.composition, createAtomicRadiusRegistry([])); expect(result.status).toBe("unavailable-no-approved-dataset"); expect(result.siteModel).toEqual(site.value.composition); });
});
