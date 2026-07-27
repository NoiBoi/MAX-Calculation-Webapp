import { describe, expect, it } from "vitest";
import { buildEmiYAxis, type EmiAxisQuantity } from "../../lib/emi/graph-axis";

const cases: readonly Readonly<{ domain: readonly [number, number]; quantity: EmiAxisQuantity }>[] = [
  { domain: [31.486, 53.076], quantity: "shielding-db" },
  { domain: [-0.0068426, 0.0050493], quantity: "power-coefficient" },
  { domain: [-0.00008967, 0.00005049], quantity: "power-coefficient" },
  { domain: [0.9998, 1.006], quantity: "power-coefficient" },
  { domain: [0, 0], quantity: "power-coefficient" },
  { domain: [1e-12, 1.1e-12], quantity: "power-coefficient" },
  { domain: [-1000, 1000], quantity: "power-coefficient" },
];

describe("EMI quantity-aware graph axes", () => {
  it.each(cases)("formats $domain deterministically without duplicates or negative zero", ({ domain, quantity }) => {
    const first = buildEmiYAxis({ values: domain, quantity }); const second = buildEmiYAxis({ values: domain, quantity });
    const labels = first.ticks.map((tick) => tick.label);
    expect(first).toEqual(second);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.join(" ")).not.toMatch(/NaN|Infinity|-0(?:\.0+)?(?:\s|$)/);
    expect(first.maximum).toBeGreaterThan(first.minimum);
    expect(first.leftMargin).toBeGreaterThanOrEqual(72);
    expect(first.leftMargin - Math.max(...labels.map((label) => label.length * 6.4))).toBeGreaterThan(first.titleX + 10);
  });

  it("uses concise fixed notation for the confirmed crossing-zero coefficient range", () => {
    const axis = buildEmiYAxis({ values: [-0.0068426, 0.0050493], quantity: "power-coefficient", configuredMinimum: -0.0068426, configuredMaximum: 0.0050493 });
    expect(axis.notation).toBe("fixed");
    expect(axis.ticks.map((tick) => tick.label)).toEqual(["0.0050", "0.0021", "-0.0009", "-0.0039", "-0.0068"]);
  });

  it("uses one scientific notation consistently for tiny axes", () => {
    const labels = buildEmiYAxis({ values: [-0.00008967, 0.00005049], quantity: "power-coefficient" }).ticks.map((tick) => tick.label);
    expect(labels.filter((label) => label !== "0").every((label) => label.includes("×10"))).toBe(true);
  });
});
