import {
  assessPrecursorRoute,
  parseFormula,
  siteCompositionToElementalComposition,
  suggestPrecursorRoutes,
  type RegisteredPrecursorDefinition,
  type RegisteredPrecursorRoute,
} from "@max-stoich/chemistry-engine";
import type { WorkspacePrecursorInput } from "./presets";

type Target = Parameters<typeof assessPrecursorRoute>[0];

const materialRank = {
  "lab-approved": 0, "spreadsheet-matched": 1, "hand-audited": 2,
  "source-verified": 3, registered: 4, synthetic: 5, deprecated: 6,
} as const;

function formulaKey(formula: string) {
  const parsed = parseFormula(formula);
  return parsed.success ? JSON.stringify(Object.entries(parsed.composition.amounts).sort()) : formula;
}

export function assessWorkspacePrecursors(target: Target, precursors: readonly WorkspacePrecursorInput[]) {
  return assessPrecursorRoute(target, precursors.map(({ id, name, formula }) => ({ schemaVersion: "1.0.0", id, name, formula })));
}

export function suggestWorkspaceAdditions(
  target: Target,
  current: readonly WorkspacePrecursorInput[],
  registry: readonly RegisteredPrecursorDefinition[],
  routes: readonly RegisteredPrecursorRoute[],
  coverage: ReturnType<typeof assessWorkspacePrecursors>,
) {
  if (coverage.usable || current.some((item) => !parseFormula(item.formula).success)) return [];
  const result = suggestPrecursorRoutes(target, registry, routes);
  const existing = new Set(current.map((item) => formulaKey(item.formula)));
  const routeOptions = result.suggestions.map((candidate) => ({
    id: candidate.candidateId,
    name: candidate.name,
    materials: candidate.precursors,
    validation: candidate.validationStatus,
    source: candidate.sourceType,
    sourceRouteId: candidate.sourceRouteId,
    sourceRouteRevisionId: candidate.sourceRouteRevisionId,
  }));
  const converted = "sites" in target ? siteCompositionToElementalComposition(target) : undefined;
  const targetElements = "amounts" in target ? target.amounts : converted?.success ? converted.value.amounts : {};
  const relevant = new Set(coverage.missingElements.length ? coverage.missingElements : Object.keys(targetElements));
  const singleOptions = registry
    .filter((item) => {
      if (!item.formula || item.validationStatus === "deprecated") return false;
      const parsed = parseFormula(item.formula);
      return parsed.success && Object.keys(parsed.composition.amounts).some((element) => relevant.has(element));
    })
    .sort((a, b) => materialRank[a.validationStatus ?? "registered"] - materialRank[b.validationStatus ?? "registered"] || a.id.localeCompare(b.id))
    .slice(0, 32)
    .map((item) => ({
      id: item.id,
      name: item.name,
      materials: [item],
      validation: item.validationStatus ?? "registered",
      source: "registered-material" as const,
      sourceRouteId: undefined,
      sourceRouteRevisionId: undefined,
    }));

  const options = [...routeOptions, ...singleOptions].flatMap((candidate) => {
    const seen = new Set(existing);
    const materials = candidate.materials.filter((item) => {
      if (!item.formula || item.validationStatus === "deprecated") return false;
      const key = formulaKey(item.formula);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!materials.length) return [];
    const assessment = assessPrecursorRoute(target, [
      ...current.map(({ id, name, formula }) => ({ schemaVersion: "1.0.0" as const, id, name, formula })),
      ...materials.map((item, index) => ({ ...item, id: `candidate:${index}` })),
    ]);
    if (!assessment.usable && assessment.missingElements.length >= coverage.missingElements.length) return [];
    return [{ ...candidate, materials, complete: assessment.usable, missing: assessment.missingElements, introduced: assessment.introducedNonTargetElements }];
  });
  options.sort((a, b) => Number(b.complete) - Number(a.complete)
    || a.missing.length - b.missing.length || a.introduced.length - b.introduced.length
    || Math.min(materialRank[a.validation], materialRank.registered) - Math.min(materialRank[b.validation], materialRank.registered)
    || Number(b.source === "saved-route") - Number(a.source === "saved-route")
    || materialRank[a.validation] - materialRank[b.validation] || a.materials.length - b.materials.length || a.id.localeCompare(b.id));
  const seen = new Set<string>();
  return options.filter((option) => {
    const key = JSON.stringify(option.materials.map((item) => [formulaKey(item.formula!), item.defaultPurityPercent ?? ""]).sort());
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

export type WorkspacePrecursorSuggestion = ReturnType<typeof suggestWorkspaceAdditions>[number];
