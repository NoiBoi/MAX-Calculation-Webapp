import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";

test("searches COD and renders a calculated reference pattern", async ({ page }) => {
  await page.route("**/api/xrd/references/search", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    schemaVersion: "1.0.0", results: [{
      sourceType: "cod", sourceId: "7221324", formula: "Ti3AlC2", phaseName: "Ti3 Al C2", spaceGroup: "P 63/m m c",
      lattice: { aAngstrom: 3.072, bAngstrom: 3.072, cAngstrom: 18.73, alphaDeg: 90, betaDeg: 90, gammaDeg: 120 },
      publication: null, doi: null, referenceStatus: "experimental", sourceRevision: "176429",
    }],
  }) }));
  await page.route("**/api/xrd/references/cod/7221324/pattern", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    schemaVersion: "1.0.0",
    reference: { sourceType: "cod", sourceId: "7221324", formula: "Ti3AlC2", phaseName: "Ti3 Al C2", spaceGroup: "P6_3/mmc", crystalSystem: "hexagonal", publication: null, doi: null, referenceStatus: "experimental", retrievedAt: "2026-09-25T00:00:00Z", sourceRevision: "176429", cifSha256: "a".repeat(64), sourceUrl: "https://www.crystallography.net/cod/7221324.cif@176429" },
    radiation: { kind: "preset", label: "Cu Kα", wavelengthAngstrom: 1.54184 },
    twoThetaRange: { minDeg: 10, maxDeg: 90 },
    lattice: { aAngstrom: 3.072, bAngstrom: 3.072, cAngstrom: 18.73, alphaDeg: 90, betaDeg: 90, gammaDeg: 120 },
    crystalSystem: "hexagonal", spaceGroup: "P6_3/mmc",
    reflections: [{ twoThetaDeg: 39.1, relativeIntensity: 100, dAngstrom: 2.3, hkls: [{ h: 1, k: 0, l: 4, multiplicity: 12 }] }],
    calculationProvenance: { engine: "pymatgen.XRDCalculator", engineVersion: "2026.9.24", serviceVersion: "0.1.0", calculatedAt: "2026-09-25T00:00:01Z", inputCifSha256: "a".repeat(64) },
  }) }));

  await page.goto("/xrd");
  await page.getByRole("button", { name: "References" }).click();
  await page.getByRole("button", { name: "Search COD" }).click();
  await expect(page.getByRole("heading", { name: "Ti3AlC2" })).toBeVisible();
  await page.getByRole("button", { name: "Use reference" }).click();
  await expect(page.getByRole("heading", { name: "Ti3AlC2 theoretical powder pattern" })).toBeVisible();
  await expect(page.getByRole("img", { name: /theoretical powder XRD stick pattern/i })).toBeVisible();
  await expect(page.getByRole("table", { name: "Calculated reflections" })).toContainText("(1 0 4) ×12");
});

test("uploads, versions, reloads, and selects an offline CIF library reference", async ({ page }) => {
  const cifContent = "data_Si\n_cell_length_a 5.43\n_cell_length_b 5.43\n_cell_length_c 5.43\n", cifSha256 = createHash("sha256").update(cifContent).digest("hex");
  await page.route("**/api/xrd/pattern/calculate", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    schemaVersion: "1.0.0", reference: { sourceType: "user-cif", sourceId: "silicon.cif", formula: "Si", phaseName: "Silicon", spaceGroup: "Fd-3m", crystalSystem: "cubic", publication: null, doi: null, referenceStatus: "theoretical", retrievedAt: "2026-09-25T00:00:00Z", sourceRevision: null, cifSha256, sourceUrl: null },
    radiation: { kind: "preset", label: "Cu Kα", wavelengthAngstrom: 1.54184 }, twoThetaRange: { minDeg: 10, maxDeg: 90 }, lattice: { aAngstrom: 5.43, bAngstrom: 5.43, cAngstrom: 5.43, alphaDeg: 90, betaDeg: 90, gammaDeg: 90 }, crystalSystem: "cubic", spaceGroup: "Fd-3m",
    reflections: [{ twoThetaDeg: 28.4, relativeIntensity: 100, dAngstrom: 3.13, hkls: [{ h: 1, k: 1, l: 1, multiplicity: 8 }] }], calculationProvenance: { engine: "pymatgen.XRDCalculator", engineVersion: "test", serviceVersion: "test", calculatedAt: "2026-09-25T00:00:00Z", inputCifSha256: cifSha256 }, cifContent,
  }) }));
  await page.goto("/xrd"); await page.getByRole("button", { name: "References" }).click();
  await page.getByLabel("Upload CIF").setInputFiles({ name: "silicon.cif", mimeType: "text/plain", buffer: Buffer.from(cifContent) });
  await expect(page.getByText(/Reference saved locally with exact CIF text/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Silicon", exact: true })).toBeVisible();
  await page.reload(); await page.getByRole("button", { name: "References" }).click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("button", { name: "Use in Stage 4" }).click();
  await expect(page.getByText(/library revision 1/)).toBeVisible();
});
