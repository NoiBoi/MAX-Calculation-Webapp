import { expect, test } from "@playwright/test";

const header = "Freq(Hz),S11(REAL),S11(IMAG),S21(REAL),S21(IMAG),S22(REAL),S22(IMAG),S12(REAL),S12(IMAG)";
const validCsv = (offset = 0) => `! CSV A.01.01
! Date: Thursday, July 23, 2026
! Keysight Technologies,N5247B,SERIAL-1,A.17
BEGIN CH1_DATA
${header}
1000000000,${0.1 + offset},0,0.5,0,0.2,0,0.4,0
2000000000,1.1,0,0,0,0.3,0,0.3,0
3000000000,${0.3 + offset},0,0.25,0,0.4,0,0.2,0
END`;

test("EMI analyzer imports multiple files, shows failures, switches directions, and removes files", async ({ page }) => {
  await page.goto("/emi");
  await expect(page.getByRole("heading", { name: "EMI Shielding Analyzer" })).toBeVisible();
  await page.locator('input[type="file"][accept^=".csv"]').setInputFiles([
    { name: "alpha.csv", mimeType: "text/csv", buffer: Buffer.from(validCsv()) },
    { name: "beta.csv", mimeType: "text/csv", buffer: Buffer.from(validCsv(0.02)) },
    { name: "broken.csv", mimeType: "text/csv", buffer: Buffer.from("not a Keysight export") },
  ]);
  await expect(page.getByText("2 of 3 files ready")).toBeVisible();
  await expect(page.getByTestId("emi-file-card")).toHaveCount(3);
  await expect(page.getByText("Parse failed")).toBeVisible();
  await expect(page.getByText("No Keysight data-section BEGIN marker was found.")).toBeVisible();
  await expect(page.getByText("Keysight Technologies · N5247B · SERIAL-1").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /alpha.csv/ })).toBeVisible();

  await page.getByRole("button", { name: "Both", exact: true }).click();
  await expect(page.getByRole("button", { name: /alpha.csv · Forward · SET/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /alpha.csv · Reverse · SET/ })).toBeVisible();
  await expect(page.getByText("POWER SUM GREATER THAN ONE").first()).toBeVisible();

  await page.getByLabel("Minimum frequency").fill("1");
  await page.getByLabel("Maximum frequency").fill("2");
  const alphaForwardSetRow = page.getByRole("row").filter({ hasText: "alpha.csv" }).filter({ hasText: "Forward" }).filter({ hasText: "SET" }).first();
  await expect(alphaForwardSetRow).toContainText("1/2 (50%)");

  await page.getByRole("button", { name: "Remove alpha.csv" }).click();
  await expect(page.getByText("alpha.csv", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page.getByText("No files loaded")).toBeVisible();
});

test("EMI analyzer renders invalid shielding gaps and downloads both CSV exports", async ({ page }) => {
  await page.goto("/emi");
  await page.locator('input[type="file"][accept^=".csv"]').setInputFiles({ name: "gap.csv", mimeType: "text/csv", buffer: Buffer.from(validCsv()) });
  await expect(page.getByText("1 of 1 files ready")).toBeVisible();

  const shieldingPlot = page.getByRole("region", { name: "4. Shielding effectiveness" });
  await expect(shieldingPlot.locator('polyline[data-trace-id$="-forward-SET"][data-segment-count="2"]')).toHaveCount(2);

  const processedDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export processed data CSV" }).click();
  await expect((await processedDownload).suggestedFilename()).toBe("emi-processed-data.csv");

  const summaryDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export summary statistics CSV" }).click();
  await expect((await summaryDownload).suggestedFilename()).toBe("emi-summary-statistics.csv");
});

test("EMI projects support bulk metadata, replicate interpolation, persistence, comparison, and figure export", async ({ page }) => {
  await page.goto("/emi");
  const secondGrid = validCsv(0.02).replace("2000000000,1.1", "2200000000,1.1");
  await page.locator('input[type="file"][accept^=".csv"]').setInputFiles([
    { name: "batch-1.1.csv", mimeType: "text/csv", buffer: Buffer.from(validCsv()) },
    { name: "batch-1.2.csv", mimeType: "text/csv", buffer: Buffer.from(secondGrid) },
  ]);
  await expect(page.getByText("2 of 2 files ready")).toBeVisible();
  await page.getByLabel("Bulk group").fill("Batch 1");
  await page.getByLabel("Bulk material").fill("Ti-based composite");
  await page.getByRole("button", { name: "Apply to 2 selected files" }).click();
  await page.getByRole("button", { name: "Create group from selected" }).click();
  await expect(page.getByText(/same range different points/)).toBeVisible();

  await page.getByText("Advanced interpolation settings").click();
  await page.getByLabel("Enable interpolation for incompatible grids").check();
  await expect(page.getByText(/aggregate frequencies \(interpolated\)/)).toBeVisible();
  await expect(page.getByRole("region", { name: "4. Shielding effectiveness" }).locator("polygon")).not.toHaveCount(0);

  await page.getByLabel("Project name").fill("Saved replicate project");
  await page.getByRole("button", { name: "Save project" }).click();
  await expect(page.getByText("Saved Saved replicate project locally.")).toBeVisible();

  const figureDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export emi-shielding-effectiveness SVG" }).click();
  await expect((await figureDownload).suggestedFilename()).toBe("emi-shielding-effectiveness.svg");
  const summaryDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export analysis summary HTML" }).click();
  await expect((await summaryDownload).suggestedFilename()).toBe("emi-analysis-summary.html");

  await page.getByRole("button", { name: "New project" }).click();
  await expect(page.getByText("No files loaded")).toBeVisible();
  await page.getByLabel("Open saved project").selectOption({ index: 1 });
  await expect(page.getByText("Restored Saved replicate project from local storage.")).toBeVisible();
  await expect(page.getByText("2 of 2 files ready")).toBeVisible();
});
