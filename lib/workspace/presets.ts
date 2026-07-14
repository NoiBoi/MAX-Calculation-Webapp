import { createStandardMaxComposition, type SiteComposition } from "@max-stoich/chemistry-engine";

export type ValidationStatus = "synthetic" | "hand-audited" | "spreadsheet-matched" | "lab-approved";
export type ConstraintMode = "solver" | "fixed" | "bounded" | "ratio";

export interface WorkspacePrecursorInput {
  readonly id: string;
  readonly name: string;
  readonly formula: string;
  readonly purityPercent: string;
  readonly constraintMode: ConstraintMode;
  readonly fixedValue: string;
  readonly minimum: string;
  readonly maximum: string;
  readonly ratioDenominatorId: string;
  readonly numeratorRatio: string;
  readonly denominatorRatio: string;
  readonly molarMassOverride: string;
  readonly molarMassOverrideSource: string;
}

export interface WorkspacePreset {
  readonly id: string;
  readonly name: string;
  readonly targetFormula: string;
  readonly siteComposition?: SiteComposition;
  readonly validationStatus: ValidationStatus;
  readonly validationNote: string;
  readonly precursors: readonly WorkspacePrecursorInput[];
}

function precursor(id: string, formula: string): WorkspacePrecursorInput {
  return { id, name: formula, formula, purityPercent: "100", constraintMode: "solver", fixedValue: "", minimum: "", maximum: "", ratioDenominatorId: "", numeratorRatio: "1", denominatorRatio: "1", molarMassOverride: "", molarMassOverrideSource: "" };
}

function site(template: "211" | "312" | "413", M: readonly [string, string][], A: readonly [string, string][], X: readonly [string, string][]): SiteComposition {
  const result = createStandardMaxComposition(template, {
    M: { occupants: M.map(([element, fraction]) => ({ element, fraction })) },
    A: { occupants: A.map(([element, fraction]) => ({ element, fraction })) },
    X: { occupants: X.map(([element, fraction]) => ({ element, fraction })) },
  });
  if (!result.success) throw new Error(`Invalid built-in site fixture: ${result.errors[0]?.message}`);
  return result.value.composition;
}

export const WORKSPACE_PRESETS: readonly WorkspacePreset[] = Object.freeze([
  { id: "ti2aln", name: "Ti₂AlN example", targetFormula: "Ti2AlN", siteComposition: site("211", [["Ti", "1"]], [["Al", "1"]], [["N", "1"]]), validationStatus: "hand-audited", validationNote: "Arithmetic and formula-unit balance are hand-audited; the elemental route is synthetic and not an approved synthesis route.", precursors: [precursor("ti", "Ti"), precursor("al", "Al"), precursor("n", "N")] },
  { id: "ti3alc2", name: "Ti₃AlC₂ example", targetFormula: "Ti3AlC2", siteComposition: site("312", [["Ti", "1"]], [["Al", "1"]], [["C", "1"]]), validationStatus: "hand-audited", validationNote: "Arithmetic is hand-audited; route selection is synthetic.", precursors: [precursor("ti", "Ti"), precursor("al", "Al"), precursor("c", "C")] },
  { id: "ti4aln3", name: "Ti₄AlN₃ example", targetFormula: "Ti4AlN3", siteComposition: site("413", [["Ti", "1"]], [["Al", "1"]], [["N", "1"]]), validationStatus: "hand-audited", validationNote: "Arithmetic is hand-audited; route selection is synthetic.", precursors: [precursor("ti", "Ti"), precursor("al", "Al"), precursor("n", "N")] },
  { id: "nb2aln", name: "Nb₂AlN example", targetFormula: "Nb2AlN", siteComposition: site("211", [["Nb", "1"]], [["Al", "1"]], [["N", "1"]]), validationStatus: "synthetic", validationNote: "Synthetic arithmetic fixture pending independent review.", precursors: [precursor("nb", "Nb"), precursor("al", "Al"), precursor("n", "N")] },
  { id: "tinbaln", name: "TiNbAlN mixed M-site", targetFormula: "(Ti0.5Nb0.5)2AlN", siteComposition: site("211", [["Ti", "0.5"], ["Nb", "0.5"]], [["Al", "1"]], [["N", "1"]]), validationStatus: "hand-audited", validationNote: "Explicit M-site fractions and elemental balance are hand-audited; the elemental route is provisional.", precursors: [precursor("ti", "Ti"), precursor("nb", "Nb"), precursor("al", "Al"), precursor("n", "N")] },
  { id: "ti3alcn", name: "Ti₃AlCN mixed X-site", targetFormula: "Ti3Al(C0.5N0.5)2", siteComposition: site("312", [["Ti", "1"]], [["Al", "1"]], [["C", "0.5"], ["N", "0.5"]]), validationStatus: "hand-audited", validationNote: "Explicit X-site fractions and elemental balance are hand-audited; the elemental route is provisional.", precursors: [precursor("ti", "Ti"), precursor("al", "Al"), precursor("c", "C"), precursor("n", "N")] },
]);

export function getWorkspacePreset(id: string): WorkspacePreset {
  return WORKSPACE_PRESETS.find((preset) => preset.id === id) ?? WORKSPACE_PRESETS[0]!;
}
