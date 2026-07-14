import Decimal from "decimal.js";
import type { BatchCalculationResult, BatchDiagnostic } from "@max-stoich/chemistry-engine";
import { formatMoles, formatPercent } from "./scientific-format";

export const DIAGNOSTIC_PRESENTATION_POLICY_VERSION = "1.0.0" as const;
export type DiagnosticClass = "blocking" | "action" | "minor" | "information";
export interface PresentedDiagnostic { readonly id: string; readonly presentationClass: DiagnosticClass; readonly title: string; readonly message: string; readonly underlyingCodes: readonly string[]; readonly exactMessages: readonly string[]; readonly element?: string; readonly precursorIds: readonly string[] }
export interface DiagnosticPresentation { readonly policyVersion: typeof DIAGNOSTIC_PRESENTATION_POLICY_VERSION; readonly blocking: readonly PresentedDiagnostic[]; readonly action: readonly PresentedDiagnostic[]; readonly minor: readonly PresentedDiagnostic[]; readonly information: readonly PresentedDiagnostic[] }

function relativeFor(result: BatchCalculationResult, element?: string): string | undefined { return result.realizedElements.find((item) => item.element === element)?.relativeResidual; }
function classify(item: BatchDiagnostic, result: BatchCalculationResult): DiagnosticClass {
  if (item.blocking || item.severity === "error") return "blocking";
  if (item.code === "ATOMIC_WEIGHT_INTERVAL" || item.code === "DUPLICATE_ADJUSTMENT_ORDER") return item.code === "ATOMIC_WEIGHT_INTERVAL" ? "information" : "minor";
  if (item.code === "SUB_BALANCE_MASS" || item.code === "MOLAR_MASS_OVERRIDE_USED") return "action";
  if (item.code === "MATERIAL_ROUNDING_SHIFT") return "action";
  if (item.code === "REALIZED_RESIDUAL_ABOVE_TOLERANCE") {
    const relative = relativeFor(result, item.element);
    if (!relative) return "minor";
    return new Decimal(relative).abs().greaterThanOrEqualTo("0.01") ? "action" : "minor";
  }
  return "minor";
}

function humanMessage(item: BatchDiagnostic, result: BatchCalculationResult): string {
  if (item.code === "ATOMIC_WEIGHT_INTERVAL") return `${item.element ?? "This element"} uses the CIAAW abridged calculation value; interval details and the exact policy are available here.`;
  if (item.code === "REALIZED_RESIDUAL_ABOVE_TOLERANCE" || item.code === "MATERIAL_ROUNDING_SHIFT") {
    const row = result.realizedElements.find((entry) => entry.element === item.element);
    if (row?.relativeResidual) return `${item.element} realized composition is ${formatPercent(new Decimal(row.relativeResidual).abs().toString())} ${new Decimal(row.relativeResidual).isNegative() ? "below" : "above"} the adjusted target.`;
    if (row) return `${item.element} realized residual is ${formatMoles(row.signedResidualMoles)}.`;
  }
  return item.message.replace(/(-?\d+\.\d{8,})\s*mol/g, (_match, value: string) => formatMoles(value));
}

export function presentDiagnostics(result: BatchCalculationResult): DiagnosticPresentation {
  const buckets: Record<DiagnosticClass, PresentedDiagnostic[]> = { blocking: [], action: [], minor: [], information: [] };
  const all = [...result.errors, ...result.warnings];
  const consumed = new Set<number>();
  all.forEach((item, index) => {
    if (consumed.has(index)) return;
    const related = all.map((candidate, candidateIndex) => ({ candidate, candidateIndex })).filter(({ candidate, candidateIndex }) => candidateIndex !== index && !consumed.has(candidateIndex) && candidate.element === item.element && ((item.code === "MATERIAL_ROUNDING_SHIFT" && candidate.code === "REALIZED_RESIDUAL_ABOVE_TOLERANCE") || (item.code === "REALIZED_RESIDUAL_ABOVE_TOLERANCE" && candidate.code === "MATERIAL_ROUNDING_SHIFT")));
    related.forEach(({ candidateIndex }) => consumed.add(candidateIndex));
    const grouped = [item, ...related.map(({ candidate }) => candidate)];
    const presentationClass = grouped.map((candidate) => classify(candidate, result)).sort((a, b) => ["blocking", "action", "minor", "information"].indexOf(a) - ["blocking", "action", "minor", "information"].indexOf(b))[0]!;
    const codes = grouped.map((candidate) => candidate.code);
    buckets[presentationClass].push(Object.freeze({ id: `${item.element ?? item.fieldPath}:${codes.join("+")}`, presentationClass, title: codes.includes("MATERIAL_ROUNDING_SHIFT") ? `${item.element ?? "Material"} rounding shift` : presentationClass === "information" ? "Calculation detail" : item.code === "SUB_BALANCE_MASS" ? "Below practical balance limit" : "Review calculation", message: humanMessage(item, result), underlyingCodes: Object.freeze(codes), exactMessages: Object.freeze(grouped.map((candidate) => candidate.message)), ...(item.element ? { element: item.element } : {}), precursorIds: Object.freeze([...new Set(grouped.flatMap((candidate) => candidate.precursorIds ?? []))]) }));
  });
  return Object.freeze({ policyVersion: DIAGNOSTIC_PRESENTATION_POLICY_VERSION, blocking: Object.freeze(buckets.blocking), action: Object.freeze(buckets.action), minor: Object.freeze(buckets.minor), information: Object.freeze(buckets.information) });
}

export function precursorStatus(result: BatchCalculationResult, precursorId: string): string {
  const diagnostics = presentDiagnostics(result); const related = [...diagnostics.blocking, ...diagnostics.action, ...diagnostics.minor].filter((item) => item.precursorIds.includes(precursorId));
  if (related.some((item) => item.presentationClass === "blocking")) return "Invalid";
  if (related.some((item) => item.underlyingCodes.includes("SUB_BALANCE_MASS"))) return "Below balance limit";
  if (related.some((item) => item.presentationClass === "action")) return "Review rounding";
  return "OK";
}
