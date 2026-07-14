import { describe, expect, it } from "vitest";
import { parseFormula } from "./formula-parser";
import { suggestPrecursorRoutes, type RegisteredPrecursorDefinition, type RegisteredPrecursorRoute } from "./precursor-suggestions";

const p = (id: string, formula: string): RegisteredPrecursorDefinition => ({ schemaVersion: "1.0.0", id, name: formula, formula, validationStatus: "registered" });
const target = (formula: string) => { const result = parseFormula(formula); if (!result.success) throw new Error(result.errors[0]?.message); return result.composition };
const registry = [p("ti", "Ti"), p("nb", "Nb"), p("al", "Al"), p("c", "C"), p("n", "N"), p("tic", "TiC"), p("tin", "TiN"), p("nbn", "NbN")];

describe("deterministic precursor suggestions", () => {
  it.each([
    ["Ti3AlC2", ["Ti", "Al", "C"]],
    ["Ti4AlN3", ["Ti", "Al", "N"]],
    ["Nb2AlN", ["Nb", "Al", "N"]],
    ["(Ti0.5Nb0.5)2AlN", ["Ti", "Nb", "Al", "N"]],
  ])("covers every target element for %s", (formula, elements) => {
    const result = suggestPrecursorRoutes(target(formula), registry);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(new Set(result.suggestions[0]!.precursors.flatMap((item) => Object.keys(target(item.formula!).amounts)))).toEqual(new Set(elements));
    expect(result.suggestions[0]!.solverStatus).toMatch(/^exact-/);
  });

  it("rejects missing and non-negative-infeasible saved candidates", () => {
    const saved: RegisteredPrecursorRoute[] = [
      { id: "missing", name: "Missing Al", target: target("Ti3Al"), precursorIds: ["ti"], validationStatus: "lab-approved" },
      { id: "negative", name: "Would need negative Al", target: target("Ti3Al"), precursorIds: ["tial", "al"], validationStatus: "lab-approved" },
    ];
    const result = suggestPrecursorRoutes(target("Ti3Al"), [...registry, p("tial", "TiAl")], saved);
    expect(result.suggestions.map((item) => item.candidateId)).not.toContain("route:missing");
    expect(result.suggestions.map((item) => item.candidateId)).not.toContain("route:negative");
    expect(result.diagnostics.some((item) => item.code === "CANDIDATE_SOLVER_INFEASIBLE")).toBe(true);
  });

  it("ranks a matching lab-approved saved route above generic candidates", () => {
    const saved: RegisteredPrecursorRoute = { id: "approved", name: "Approved fixture", target: target("Ti3AlC2"), precursorIds: ["tic", "ti", "al"], validationStatus: "lab-approved" };
    const result = suggestPrecursorRoutes(target("Ti3AlC2"), registry, [saved]);
    expect(result.suggestions[0]).toMatchObject({ candidateId: "route:approved", validationStatus: "lab-approved" });
  });

  it("does not mutate the precursor registry or saved routes", () => {
    const saved: RegisteredPrecursorRoute[] = [{ id: "route", name: "Fixture", target: target("Ti3AlC2"), precursorIds: ["ti", "al", "c"], validationStatus: "hand-audited" }];
    const registryBefore = JSON.stringify(registry), routesBefore = JSON.stringify(saved);
    suggestPrecursorRoutes(target("Ti3AlC2"), registry, saved);
    expect(JSON.stringify(registry)).toBe(registryBefore); expect(JSON.stringify(saved)).toBe(routesBefore);
  });

  it("is deterministic and enforces display and search limits", () => {
    const first = suggestPrecursorRoutes(target("Ti3AlC2"), registry, [], { maximumSuggestions: 1, maximumSearchCandidates: 1 });
    const second = suggestPrecursorRoutes(target("Ti3AlC2"), registry, [], { maximumSuggestions: 1, maximumSearchCandidates: 1 });
    expect(first).toEqual(second);
    expect(first.suggestions).toHaveLength(1);
    expect(first.limitReached).toBe(true);
    expect(first.diagnostics.some((item) => item.code === "CANDIDATE_SEARCH_LIMIT_REACHED")).toBe(true);
  });

  it("reports a required element absent from the registry without invalidating the target", () => {
    const result = suggestPrecursorRoutes(target("Zr2AlC"), registry);
    expect(result.suggestions).toEqual([]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ code: "REQUIRED_ELEMENT_ABSENT_FROM_PRECURSOR_REGISTRY", element: "Zr" }), expect.objectContaining({ code: "NO_CANDIDATE_ROUTE_FOUND" })]));
  });
});
