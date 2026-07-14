import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ElementDataSetSchema } from "./element-data-schema";

describe("versioned element data", () => {
  it("validates the checked-in CIAAW seed dataset", () => {
    const path = fileURLToPath(new URL("../../data/elements.json", import.meta.url));
    const data: unknown = JSON.parse(readFileSync(path, "utf8"));
    const parsed = ElementDataSetSchema.parse(data);
    expect(parsed.dataVersion).toBe("2024.1.0");
    expect(new Set(parsed.elements.map((element) => element.symbol)).size).toBe(parsed.elements.length);
  });
});
