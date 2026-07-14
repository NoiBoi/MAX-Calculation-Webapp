import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ElementDataSetSchema } from "./element-data-schema";
import { ELEMENT_SYMBOLS_BY_ATOMIC_NUMBER } from "./periodic-table";

describe("versioned element data", () => {
  it("validates the checked-in CIAAW seed dataset", () => {
    const path = fileURLToPath(new URL("../../data/elements.json", import.meta.url));
    const data: unknown = JSON.parse(readFileSync(path, "utf8"));
    const parsed = ElementDataSetSchema.parse(data);
    expect(parsed.dataVersion).toBe("2024.2.0");
    expect(parsed.elements).toHaveLength(118);
    expect(parsed.elements.map((element) => element.symbol)).toEqual(ELEMENT_SYMBOLS_BY_ATOMIC_NUMBER);
    expect(new Set(parsed.elements.map((element) => element.symbol)).size).toBe(parsed.elements.length);
  });

  it.each([
    ["C", "12.011", "12.0096", "12.0116"],
    ["Al", "26.982", "26.9815384", undefined],
    ["Ti", "47.867", "47.867", undefined],
    ["V", "50.942", "50.9415", undefined],
    ["Zr", "91.222", "91.222", undefined],
    ["Nb", "92.906", "92.90637", undefined],
    ["Mo", "95.95", "95.95", undefined],
    ["Hf", "178.49", "178.486", undefined],
    ["Ta", "180.95", "180.94788", undefined],
    ["W", "183.84", "183.84", undefined],
    ["Re", "186.21", "186.207", undefined],
  ])("matches the reviewed CIAAW source value for %s", (symbol, calculation, first, upper) => {
    const path = fileURLToPath(new URL("../../data/elements.json", import.meta.url));
    const data = ElementDataSetSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    const record = data.elements.find((item) => item.symbol === symbol);
    expect(record?.calculationValue).toBe(calculation);
    if (record?.standardAtomicWeight.kind === "interval") expect([record.standardAtomicWeight.lower, record.standardAtomicWeight.upper]).toEqual([first, upper]);
    else if (record?.standardAtomicWeight.kind === "point") expect(record.standardAtomicWeight.value).toBe(first);
  });

  it("keeps no-standard-weight elements valid but calculation-unavailable", () => {
    const path = fileURLToPath(new URL("../../data/elements.json", import.meta.url));
    const data = ElementDataSetSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    expect(data.elements.find((item) => item.symbol === "Tc")).toMatchObject({ standardAtomicWeight: { kind: "unavailable" }, calculationValue: null, calculationValuePolicy: "unavailable" });
  });
});
