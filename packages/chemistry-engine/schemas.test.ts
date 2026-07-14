import { describe, expect, it } from "vitest";
import { DecimalStringSchema, PrecursorSolverObjectiveSchema, RecipeInputSchema, SolverPrecursorConstraintSchema, SolverTolerancePolicySchema } from "./schemas";

describe("scientific input contracts", () => {
  it.each(["0", "1.25", ".5", "3e-12", "-2.0"])("accepts deterministic decimal text %s", (value) => {
    expect(DecimalStringSchema.safeParse(value).success).toBe(true);
  });

  it.each(["", "NaN", "Infinity", "1,000", "1.2.3"])("rejects invalid decimal text %s", (value) => {
    expect(DecimalStringSchema.safeParse(value).success).toBe(false);
  });

  it("requires versioned recipe inputs", () => {
    const result = RecipeInputSchema.safeParse({ schemaVersion: "0.9.0" });
    expect(result.success).toBe(false);
  });

  it("accepts versioned fixed, bounded, and ratio solver constraints", () => {
    expect(SolverPrecursorConstraintSchema.safeParse({ schemaVersion: "1.0.0", mode: "fixed", precursorId: "ti", value: "1.5" }).success).toBe(true);
    expect(SolverPrecursorConstraintSchema.safeParse({ schemaVersion: "1.0.0", mode: "bounded", precursorId: "ti", minimum: "0", maximum: "2" }).success).toBe(true);
    expect(SolverPrecursorConstraintSchema.safeParse({ schemaVersion: "1.0.0", mode: "ratio", numeratorPrecursorId: "ti", denominatorPrecursorId: "tin", numeratorRatio: "2", denominatorRatio: "1" }).success).toBe(true);
  });

  it("rejects negative schema-level bounds and zero ratio components", () => {
    expect(SolverPrecursorConstraintSchema.safeParse({ schemaVersion: "1.0.0", mode: "bounded", precursorId: "ti", minimum: "-1" }).success).toBe(false);
    expect(SolverPrecursorConstraintSchema.safeParse({ schemaVersion: "1.0.0", mode: "ratio", numeratorPrecursorId: "ti", denominatorPrecursorId: "tin", numeratorRatio: "0", denominatorRatio: "1" }).success).toBe(false);
  });

  it("validates explicit objectives and separate tolerance fields", () => {
    expect(PrecursorSolverObjectiveSchema.safeParse({ kind: "prefer-precursors", precursorIds: ["ti", "tin"] }).success).toBe(true);
    expect(SolverTolerancePolicySchema.safeParse({ elementalAbsolute: "0", elementalRelative: "0", nonnegativity: "0", bound: "0", ratio: "0", objectiveTie: "0" }).success).toBe(true);
  });
});
