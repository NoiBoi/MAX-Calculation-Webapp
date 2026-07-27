import { describe, expect, it } from "vitest";
import { calculateEmiPoint, diagnoseEmiPhysicalValidity, EMI_PHYSICAL_EPSILON, summarizeEmiPhysicalValidity, type EmiFrequencyPoint } from "@max-stoich/chemistry-engine";

function point(reflectionReal: number, transmissionReal: number, frequencyHz = 10e9): EmiFrequencyPoint {
  return { rowNumber: 2, frequencyHz, s11: { real: reflectionReal, imaginary: 0 }, s21: { real: transmissionReal, imaginary: 0 }, s22: { real: reflectionReal, imaginary: 0 }, s12: { real: transmissionReal, imaginary: 0 } };
}

describe("EMI pointwise physical-validity diagnostics", () => {
  it("keeps passivity-violating raw values and reports invalid decomposition domains", () => {
    const calculated = calculateEmiPoint(point(Math.sqrt(1.00582), 0.1), "forward");
    const diagnostic = diagnoseEmiPhysicalValidity(calculated);
    expect(calculated.R).toBeCloseTo(1.00582, 12);
    expect(calculated.A).toBeLessThan(0);
    expect(calculated.SER).toBeNull();
    expect(calculated.SEA).toBeNull();
    expect(diagnostic.status).toBe("invalid");
    expect(diagnostic.reasonCodes).toEqual(expect.arrayContaining(["REFLECTION_ABOVE_ONE", "POWER_SUM_ABOVE_ONE", "NEGATIVE_ABSORPTION", "SER_DOMAIN_INVALID", "SEA_DOMAIN_INVALID"]));
  });

  it("uses the documented epsilon only for comparison noise without changing raw coefficients", () => {
    const calculated = calculateEmiPoint(point(Math.sqrt(1 + EMI_PHYSICAL_EPSILON / 2), 0), "forward");
    expect(calculated.R).toBeGreaterThan(1);
    expect(diagnoseEmiPhysicalValidity(calculated).reasonCodes).not.toContain("REFLECTION_ABOVE_ONE");
  });

  it("summarizes affected points, extrema, and the most severe frequency", () => {
    const points = [calculateEmiPoint(point(0.2, 0.5, 1), "forward"), calculateEmiPoint(point(Math.sqrt(1.02), 0.2, 2), "forward")];
    expect(summarizeEmiPhysicalValidity(points)).toMatchObject({ pointCount: 2, validCount: 1, invalidCount: 1, affectedPercentage: 50, mostSevereFrequencyHz: 2 });
  });
});
