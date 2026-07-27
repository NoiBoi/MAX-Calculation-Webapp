import { expect, test, type Download } from "@playwright/test";

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

const continuousCsv = (offset = 0) => `! CSV A.01.01
! Keysight Technologies,N5247B,SERIAL-2,A.17
BEGIN CH1_DATA
${header}
1000000000,${0.10 + offset},0,0.50,0,0.20,0,0.45,0
2000000000,${0.14 + offset},0,0.46,0,0.23,0,0.42,0
3000000000,${0.18 + offset},0,0.41,0,0.26,0,0.38,0
4000000000,${0.22 + offset},0,0.35,0,0.29,0,0.33,0
5000000000,${0.26 + offset},0,0.30,0,0.32,0,0.28,0
END`;

async function downloadText(download: Download): Promise<string> {
  const stream = await download.createReadStream();
  if (!stream) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

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

  const shieldingPlot = page.getByRole("region", { name: "4. Total shielding effectiveness (SET)" });
  await expect(shieldingPlot.locator('polyline[data-trace-id$="-forward-SET"][data-segment-count="2"]')).toHaveCount(2);

  const processedDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export processed data CSV" }).click();
  await expect((await processedDownload).suggestedFilename()).toBe("emi-processed-data.csv");

  const summaryDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export summary statistics CSV" }).click();
  await expect((await summaryDownload).suggestedFilename()).toBe("emi-summary-statistics.csv");
});

test("EMI thickness, themed electrical controls, and graph interaction use one canonical model", async ({ page }, testInfo) => {
  await page.goto("/emi");
  await page.locator('input[type="file"][accept^=".csv"]').setInputFiles({ name: "interaction.csv", mimeType: "text/csv", buffer: Buffer.from(validCsv()) });
  const card = page.getByTestId("emi-file-card");
  await card.getByText("Edit sample metadata").click();
  await expect(card.getByLabel("Sample thickness for interaction.csv")).toHaveCount(1);
  await expect(card.getByLabel(/Film thickness/)).toHaveCount(0);
  await expect(card.getByLabel("Thickness unit for interaction.csv")).toHaveValue("mm");
  await card.getByLabel("Sample thickness for interaction.csv").fill("0.0143");
  await card.getByText("Electrical properties and Simon estimate").click();
  await expect(card.getByText("Enter raw four-point-probe resistance in Ω. MAXCalc applies the fixed geometric correction factor 4.532.")).toBeVisible();
  await expect(card.getByText("14.3 µm", { exact: true })).toBeVisible();
  await expect(card.getByText("0.0143 mm", { exact: true })).toBeVisible();
  await card.getByRole("button", { name: "Add reading" }).click();
  await card.getByLabel("Raw four-point-probe resistance 1 for interaction.csv").fill("1.2");
  await expect(card.getByText(/12,858\.5742 S\/m/)).toBeVisible();
  await expect(card.getByText(/128\.585742 S\/cm/)).toBeVisible();
  await expect(card.getByText("3 unsmoothed theoretical points are available at the measured frequencies. They remain separate from measured SET.")).toBeVisible();
  await card.getByLabel("Sample thickness for interaction.csv").fill("0.0200");
  await expect(card.getByText("20 µm", { exact: true })).toBeVisible();
  await expect(card.getByText(/9,193\.880553 S\/m/)).toBeVisible();
  await card.getByLabel("Thickness unit for interaction.csv").selectOption("um");
  await card.getByLabel("Sample thickness for interaction.csv").fill("20");
  await expect(card.getByText("20 µm", { exact: true })).toBeVisible();
  await expect(card.getByText(/9,193\.880553 S\/m/)).toBeVisible();
  const note = card.getByLabel("Electrical measurement note for interaction.csv");
  for (const theme of ["light", "dark", "midnight"] as const) {
    await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
    const style = await note.evaluate((element) => { const computed = getComputedStyle(element); return { background: computed.backgroundColor, color: computed.color, border: computed.borderTopColor }; });
    expect(style.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(style.color).not.toBe(style.background);
    expect(style.border).not.toBe(style.background);
  }
  const plot = page.getByRole("region", { name: "4. Total shielding effectiveness (SET)" });
  await expect(plot.locator('path[fill="#dc2626"]')).toHaveCount(0);
  const svg = plot.locator("svg.emi-chart");
  await svg.focus();
  const tooltipFrequency = await plot.getByRole("status").getAttribute("data-frequency-hz");
  await expect(svg.locator("g[data-active-frequency-hz]")).toHaveAttribute("data-active-frequency-hz", tooltipFrequency ?? "");
  await expect(svg.locator("line.emi-hover-line")).toHaveAttribute("data-frequency-hz", tooltipFrequency ?? "");
  await expect(svg.locator("circle[data-frequency-hz]")).toHaveAttribute("data-frequency-hz", tooltipFrequency ?? "");
  const tickLabels = await plot.locator(".emi-y-tick-label").allTextContents();
  expect(tickLabels).toHaveLength(5);
  expect(tickLabels.every((label) => !label.includes("e") && label !== "-0")).toBe(true);
  const axisClearance = await plot.locator("svg.emi-chart").evaluate((element) => {
    const title = element.querySelector<SVGGraphicsElement>(".emi-y-axis-title")!.getBoundingClientRect();
    const ticks = [...element.querySelectorAll<SVGGraphicsElement>(".emi-y-tick-label")].map((tick) => tick.getBoundingClientRect());
    return Math.min(...ticks.map((tick) => tick.left)) - title.right;
  });
  expect(axisClearance).toBeGreaterThanOrEqual(4);
  await plot.screenshot({ path: testInfo.outputPath("emi-axis-standard-range.png") });
});

test("EMI graph axes use one readable notation for tiny and near-unity configured ranges", async ({ page }, testInfo) => {
  await page.goto("/emi");
  await page.locator('input[type="file"][accept^=".csv"]').setInputFiles({ name: "axis.csv", mimeType: "text/csv", buffer: Buffer.from(validCsv()) });
  await page.getByText("Publication plot formatting").click();
  await page.getByLabel("Power Y minimum").fill("-0.00008967");
  await page.getByLabel("Power Y maximum").fill("0.00005049");
  const powerPlot = page.getByRole("region", { name: "7. Incident-power coefficients" });
  const tinyLabels = await powerPlot.locator(".emi-y-tick-label").allTextContents();
  expect(tinyLabels).toHaveLength(5);
  expect(tinyLabels.filter((label) => label !== "0").every((label) => label.includes("×10"))).toBe(true);
  expect(tinyLabels.every((label) => !label.includes("e") && label !== "-0")).toBe(true);
  await powerPlot.screenshot({ path: testInfo.outputPath("emi-axis-tiny-range.png") });
  for (const theme of ["dark", "midnight"] as const) {
    await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
    await powerPlot.screenshot({ path: testInfo.outputPath(`emi-axis-tiny-${theme}.png`) });
  }

  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "light"));
  await page.getByLabel("Power Y minimum").fill("0.9998");
  await page.getByLabel("Power Y maximum").fill("1.006");
  const unityLabels = await powerPlot.locator(".emi-y-tick-label").allTextContents();
  expect(unityLabels).toHaveLength(5);
  expect(new Set(unityLabels).size).toBe(unityLabels.length);
  expect(unityLabels.every((label) => !label.includes("e") && label !== "-0")).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(powerPlot.locator("svg.emi-chart")).toBeVisible();
  await powerPlot.screenshot({ path: testInfo.outputPath("emi-axis-near-unity-mobile.png") });
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

  const firstCard = page.getByTestId("emi-file-card").filter({ hasText: "batch-1.1.csv" });
  await firstCard.getByText("Edit sample metadata").click();
  await firstCard.getByLabel("Sample thickness for batch-1.1.csv").fill("10");
  await firstCard.getByLabel("Thickness unit for batch-1.1.csv").selectOption("um");
  await firstCard.getByText("Electrical properties and Simon estimate").click();
  await firstCard.getByRole("button", { name: "Add reading" }).click();
  await firstCard.getByLabel("Raw four-point-probe resistance 1 for batch-1.1.csv").fill("1");
  await expect(firstCard.getByText(/22,065\.31333 S\/m/)).toBeVisible();
  await expect(firstCard.getByText("3 unsmoothed theoretical points are available at the measured frequencies. They remain separate from measured SET.")).toBeVisible();

  await page.getByText("Advanced interpolation settings").click();
  await page.getByLabel("Enable interpolation for incompatible grids").check();
  await expect(page.getByText(/aggregate frequencies \(interpolated\)/)).toBeVisible();
  await expect(page.getByRole("region", { name: "4. Total shielding effectiveness (SET)" }).locator("polygon")).not.toHaveCount(0);

  await page.getByLabel("Project name").fill("Saved replicate project");
  await page.getByRole("button", { name: "Save project" }).click();
  await expect(page.getByText("Saved Saved replicate project locally.")).toBeVisible();

  const figureDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export emi-total-shielding-effectiveness SVG" }).click();
  await expect((await figureDownload).suggestedFilename()).toBe("emi-total-shielding-effectiveness.svg");
  const summaryDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export analysis summary HTML" }).click();
  await expect((await summaryDownload).suggestedFilename()).toBe("emi-analysis-summary.html");
  const workbookDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export analysis workbook XLSX" }).click();
  await expect((await workbookDownload).suggestedFilename()).toBe("emi-analysis.xlsx");

  await page.getByRole("button", { name: "New project" }).click();
  await expect(page.getByText("No files loaded")).toBeVisible();
  await page.getByLabel("Open saved project").selectOption({ index: 1 });
  await expect(page.getByText("Restored Saved replicate project from local storage.")).toBeVisible();
  await expect(page.getByText("2 of 2 files ready")).toBeVisible();
  const restoredCard = page.getByTestId("emi-file-card").filter({ hasText: "batch-1.1.csv" });
  await restoredCard.getByText("Electrical properties and Simon estimate").click();
  await expect(restoredCard.getByLabel("Sample thickness for batch-1.1.csv")).toHaveValue("10");
  await expect(restoredCard.getByLabel("Raw four-point-probe resistance 1 for batch-1.1.csv")).toHaveValue("1");
});

test("SET smoothing and Simon overlay are independent, theoretical, and export-neutral", async ({ page }, testInfo) => {
  await page.goto("/emi");
  await page.locator('input[type="file"][accept^=".csv"]').setInputFiles([
    { name: "sample-with-electrical.csv", mimeType: "text/csv", buffer: Buffer.from(continuousCsv()) },
    { name: "sample-without-electrical.csv", mimeType: "text/csv", buffer: Buffer.from(continuousCsv(0.01)) },
  ]);
  await expect(page.getByText("2 of 2 files ready")).toBeVisible();

  const setPlot = page.getByRole("region", { name: "4. Total shielding effectiveness (SET)" });
  const serPlot = page.getByRole("region", { name: "5. Reflection contribution (SER)" });
  const seaPlot = page.getByRole("region", { name: "6. Effective absorption contribution (SEA)" });
  await expect(setPlot.getByLabel("Smooth measured curves")).not.toBeChecked();
  await expect(setPlot.getByLabel("Show Simon estimate")).toBeDisabled();
  await expect(serPlot.getByLabel("Smooth measured curves")).not.toBeChecked();
  await expect(serPlot.getByLabel("Show Simon estimate")).toHaveCount(0);
  await expect(seaPlot.getByLabel("Show Simon estimate")).toHaveCount(0);

  const electricalCard = page.getByTestId("emi-file-card").filter({ hasText: "sample-with-electrical.csv" });
  await electricalCard.getByText("Edit sample metadata").click();
  await electricalCard.getByLabel("Sample thickness for sample-with-electrical.csv").fill("10");
  await electricalCard.getByLabel("Thickness unit for sample-with-electrical.csv").selectOption("um");
  await electricalCard.getByText("Electrical properties and Simon estimate").click();
  await electricalCard.getByRole("button", { name: "Add reading" }).click();
  await electricalCard.getByLabel("Raw four-point-probe resistance 1 for sample-with-electrical.csv").fill("1");
  await expect(setPlot.getByLabel("Show Simon estimate")).toBeEnabled();
  await expect(setPlot).toContainText("1 displayed sample lack valid electrical inputs");

  const beforeDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export processed data CSV" }).click();
  const beforeCsv = await downloadText(await beforeDownloadPromise);

  const measuredBefore = await setPlot.locator('polyline[data-series-kind="measured"]').first().getAttribute("points");
  await setPlot.getByLabel("Smooth measured curves").check();
  await setPlot.getByLabel("4. Total shielding effectiveness (SET) smoothing window").selectOption("3");
  await expect(setPlot.getByText("Smoothed display")).toBeVisible();
  await expect(setPlot.locator('polyline[data-series-kind="measured"]').first()).toHaveAttribute("data-smoothed", "true");
  expect(await setPlot.locator('polyline[data-series-kind="measured"]').first().getAttribute("points")).not.toBe(measuredBefore);
  await expect(serPlot.getByLabel("Smooth measured curves")).not.toBeChecked();
  await expect(seaPlot.getByLabel("Smooth measured curves")).not.toBeChecked();

  await setPlot.getByLabel("Show Simon estimate").check();
  const simonLine = setPlot.locator('polyline[data-series-kind="simon"]');
  await expect(simonLine).toHaveCount(1);
  await expect(simonLine).toHaveAttribute("stroke-dasharray", "7 5");
  const simonBefore = await simonLine.getAttribute("data-values");
  await setPlot.getByLabel("4. Total shielding effectiveness (SET) smoothing window").selectOption("7");
  await expect(simonLine).toHaveAttribute("data-values", simonBefore ?? "");
  await setPlot.locator("svg.emi-chart").focus();
  await expect(setPlot.getByRole("status")).toContainText("Raw measured value");
  await expect(setPlot.getByRole("status")).toContainText("Smoothed display");
  for (let index = 0; index < 10; index += 1) await setPlot.locator("svg.emi-chart").press("ArrowRight");
  await setPlot.locator("svg.emi-chart").press("ArrowUp");
  await expect(setPlot.getByRole("status")).toContainText("Simon theoretical SET");
  await expect(setPlot.getByRole("status")).toContainText("Theoretical estimate, not measured");
  await setPlot.getByLabel("Show Simon estimate").uncheck();
  await expect(setPlot.locator('polyline[data-series-kind="simon"]')).toHaveCount(0);
  await setPlot.getByLabel("Show Simon estimate").check();
  await expect(simonLine).toHaveAttribute("data-values", simonBefore ?? "");

  const afterDownloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export processed data CSV" }).click();
  const afterCsv = await downloadText(await afterDownloadPromise);
  expect(afterCsv).toBe(beforeCsv);

  await setPlot.screenshot({ path: testInfo.outputPath("set-smoothed-with-simon.png") });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await setPlot.screenshot({ path: testInfo.outputPath("set-desktop-dark.png") });
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "midnight"));
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(setPlot.locator(".emi-graph-toolbar")).toBeVisible();
  await setPlot.screenshot({ path: testInfo.outputPath("set-mobile-midnight.png") });

  await page.goto("/workspace");
  await page.goto("/emi");
  await expect(page.getByText("No files loaded")).toBeVisible();
  await page.locator('input[type="file"][accept^=".csv"]').setInputFiles({ name: "reopened.csv", mimeType: "text/csv", buffer: Buffer.from(continuousCsv()) });
  await expect(page.getByRole("region", { name: "4. Total shielding effectiveness (SET)" }).getByLabel("Smooth measured curves")).not.toBeChecked();
});
