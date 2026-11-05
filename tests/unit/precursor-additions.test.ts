import { parseFormula, type RegisteredPrecursorDefinition, type RegisteredPrecursorRoute } from "@max-stoich/chemistry-engine";
import { describe, expect, it } from "vitest";
import { assessWorkspacePrecursors, suggestWorkspaceAdditions } from "../../lib/workspace/precursor-additions";
import type { WorkspacePrecursorInput } from "../../lib/workspace/presets";

const parsed = parseFormula("Ti2AlN");
if (!parsed.success) throw new Error("Invalid test target");
const target = parsed.composition;

function material(id: string, formula: string, validationStatus: RegisteredPrecursorDefinition["validationStatus"] = "registered"): RegisteredPrecursorDefinition {
  return { schemaVersion: "1.0.0", id, name: formula, formula, validationStatus };
}

function input(formula: string): WorkspacePrecursorInput {
  return { id: "manual", name: "My material", formula, purityPercent: "97.5", constraintMode: "fixed", fixedValue: "2", minimum: "", maximum: "", ratioDenominatorId: "", numeratorRatio: "1", denominatorRatio: "1", molarMassOverride: "", molarMassOverrideSource: "" };
}

describe("progressive precursor suggestions", () => {
  it("ranks a validated saved match ahead of unvalidated additions and leaves user inputs intact", () => {
    const current = Object.freeze([Object.freeze(input("Ti"))]);
    const savedAl = { ...material("saved-al", "Al", "hand-audited"), defaultPurityPercent: "99.4" };
    const registry = [material("ti", "Ti"), material("al", "Al"), material("n", "N"), savedAl, material("saved-n", "N", "hand-audited")];
    const saved: RegisteredPrecursorRoute = { id: "route", name: "Reviewed route", target, precursorIds: ["ti", "saved-al", "saved-n"], validationStatus: "hand-audited", sourceRouteRevisionId: "revision" };
    const suggestions = suggestWorkspaceAdditions(target, current, registry, [saved], assessWorkspacePrecursors(target, current));
    expect(suggestions[0]).toMatchObject({ complete: true, validation: "hand-audited", source: "saved-route", sourceRouteRevisionId: "revision", materials: [savedAl, expect.objectContaining({ formula: "N" })] });
    expect(current).toEqual([input("Ti")]);
  });

  it("reports partial coverage honestly and leaves unfinished formula rows for manual review", () => {
    const registry = [material("al", "Al")];
    const current = [input("Ti")];
    const partial = suggestWorkspaceAdditions(target, current, registry, [], assessWorkspacePrecursors(target, current));
    expect(partial.some((candidate) => !candidate.complete && candidate.missing.includes("N") && candidate.materials.some((item) => item.formula === "Al"))).toBe(true);
    const unfinished = [input("Ti(")];
    expect(suggestWorkspaceAdditions(target, unfinished, registry, [], assessWorkspacePrecursors(target, unfinished))).toEqual([]);
  });
});
