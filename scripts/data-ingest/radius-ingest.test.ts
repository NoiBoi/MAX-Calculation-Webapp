import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ApprovedAtomicRadiusDatasetSchema } from "../../packages/chemistry-engine/radius-data";
import { parseRadiusTsv } from "./radius-ingest";

const load = (name: string) => ApprovedAtomicRadiusDatasetSchema.parse(JSON.parse(readFileSync(fileURLToPath(new URL(`../../data/radius-sets/${name}`, import.meta.url)), "utf8")));

describe("radius ingestion artifacts", () => {
  it("normalizes angstrom input to pm and rejects malformed rows", () => { expect(parseRadiusTsv("element\tradiusAngstrom\tselectionKey\tdefaultForPolicy\testimated\tsourceLocation\tnotes\nTi\t1.462\tdefault\ttrue\tfalse\tTable I\treviewed")[0]?.radiusPm).toBe("146.2"); expect(() => parseRadiusTsv("bad")).toThrow(); });
  it.each([
    ["teatum-metallic-cn12.json", { Ti: "146.2", V: "134.6", Nb: "146.8", Zr: "169.2", Hf: "158", Ta: "146.7", W: "140.8", Al: "143.2", C: "87.6", N: "82.5" }],
    ["cordero-covalent-2008.json", { Ti: "160", V: "153", Nb: "164", Zr: "175", Hf: "175", Ta: "170", W: "162", Al: "121", C: "76", N: "71" }],
    ["rahm-atomic-2016.json", { Ti: "257", V: "252", Nb: "251", Zr: "268", Hf: "264", Ta: "258", W: "253", Al: "239", C: "190", N: "179" }],
  ])("matches reviewed source spot checks for %s", (file, checks) => { const data = load(file); for (const [element, expected] of Object.entries(checks)) expect(data.values.find((item) => item.element === element && item.defaultForPolicy)?.radiusPm).toBe(expected); });
  it("keeps definitions separate and coverage explicit", () => { const values = [load("teatum-metallic-cn12.json"), load("cordero-covalent-2008.json"), load("rahm-atomic-2016.json")]; expect(values.map((item) => item.definition)).toEqual(["metallic", "covalent", "neutral-isodensity"]); for (const data of values) expect(data.coverage.elements).toEqual(expect.arrayContaining(["Ti", "V", "Nb", "Zr", "Hf", "Ta", "W", "Al", "C", "N"])); });
  it("preserves estimates and variant qualifiers", () => { const teatum = load("teatum-metallic-cn12.json"); expect(teatum.values.find((item) => item.element === "C")?.estimated).toBe(true); const cordero = load("cordero-covalent-2008.json"); expect(cordero.values.filter((item) => item.element === "C").map((item) => item.selectionKey)).toEqual(["sp3-default", "sp2", "sp"]); });
});
