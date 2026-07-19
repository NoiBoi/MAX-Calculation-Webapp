import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page, path = "/workspace") { await page.goto(path); await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible(); }
async function chooseExample(page: Page, id = "ti2aln") { await page.getByRole("button", { name: /More actions/ }).click(); await page.getByLabel("Start or reset").selectOption(id); }
async function addComparisonPair(page: Page) { await page.goto("/compare"); await page.getByRole("toolbar", { name: "Comparison page actions" }).getByRole("button", { name: "Add current recipe" }).click(); await page.getByLabel("Unsaved calculation scenario", { exact: true }).getByRole("button", { name: "Duplicate" }).click(); }

test("COMPARE-CONSISTENCY-001 uses calculator result tables and advanced hierarchy", async ({ page }) => {
  await ready(page); await chooseExample(page); await addComparisonPair(page);
  const first = page.getByLabel("Unsaved calculation scenario", { exact: true });
  await expect(first.getByRole("table", { name: "Final precursor weighing masses and molar quantities" })).toBeVisible();
  await expect(first.getByRole("columnheader", { name: "Purity" })).toBeVisible(); await expect(first.getByRole("columnheader", { name: "Status" })).toBeVisible();
  await page.getByRole("button", { name: "Advanced", exact: true }).click(); await expect(first.getByText("Solver, balance, residuals, and provenance")).toBeVisible(); await expect(first.getByText("Site descriptors")).toBeVisible();
});

test("SUMMARY-RADIUS-001 only adds configured explicit-site descriptors to advanced summary", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]); await ready(page); await chooseExample(page); await page.getByRole("button", { name: "View weighing summary" }).click();
  const dialog = page.getByRole("dialog", { name: "Weighing summary" }); await expect(dialog.getByText("Site-radius screening descriptors")).toHaveCount(0);
  await dialog.getByLabel("Include advanced radius summary").check(); await expect(dialog.getByText("Site-radius screening descriptors")).toBeVisible(); await expect(dialog.getByText(/Teatum/).first()).toBeVisible(); await expect(dialog.getByText(/Mean .* pm/).first()).toBeVisible();
  await dialog.getByRole("button", { name: "Copy advanced summary" }).click(); expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Site-radius screening descriptors");
});

test("SAVE-ACTIONS-001 persists before opening a copy or blank calculation", async ({ page }) => {
  await ready(page); await chooseExample(page); await page.getByRole("button", { name: "Save", exact: true }).click(); let dialog = page.getByRole("dialog", { name: "Save recipe" }); await dialog.getByLabel("Recipe name").fill("Post-save action recipe"); await dialog.getByRole("button", { name: "More save actions" }).click(); await dialog.getByRole("menuitem", { name: /Save and open copy/ }).click();
  await expect(dialog).not.toBeVisible(); await expect(page.getByText(/Opened an unsaved scientific copy.*Structured experimental notes were not copied/)).toBeVisible(); await expect(page.getByLabel("Target formula")).toHaveValue("Ti2AlN");
  await page.getByRole("button", { name: "Save", exact: true }).click(); dialog = page.getByRole("dialog", { name: "Save recipe" }); await dialog.getByRole("button", { name: "More save actions" }).click(); await dialog.getByRole("menuitem", { name: /Save and start blank/ }).click(); await expect(page.getByLabel("Target formula")).toHaveValue(""); await expect(page.getByText(/Started a new blank calculation/)).toBeVisible();
});

test("PRINT-CALCULATOR-001 exposes a compact print-only calculator document", async ({ page }) => {
  await ready(page); await chooseExample(page); await page.getByRole("button", { name: "View weighing summary" }).click(); await page.emulateMedia({ media: "print" });
  const dialog = page.getByRole("dialog", { name: "Weighing summary" }); await expect(dialog).toBeVisible(); expect(await dialog.getByRole("table").evaluate((element) => getComputedStyle(element).fontSize)).toBe("12px"); await expect(page.locator("header").first()).toBeHidden(); await expect(dialog.getByText(/Operator\/signature/)).toBeVisible();
  expect((await page.pdf({ format: "Letter", printBackground: true })).byteLength).toBeGreaterThan(10_000); expect((await page.pdf({ format: "A4", printBackground: true })).byteLength).toBeGreaterThan(10_000);
});

test("PRINT-COMPARISON-001 uses a dedicated two-scenario print grid", async ({ page }) => {
  await ready(page); await chooseExample(page); await addComparisonPair(page); await page.getByRole("button", { name: "View comparison summaries" }).click(); await page.emulateMedia({ media: "print" });
  const root = page.locator('.weighing-summary-print-root[data-summary-count="2"]'); await expect(root).toBeVisible(); expect(await root.evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length)).toBe(2); await expect(page.getByText(/2 scenarios/)).toBeVisible();
  expect((await page.pdf({ format: "Letter", printBackground: true })).byteLength).toBeGreaterThan(10_000);
  await page.emulateMedia({ media: "screen" }); await page.getByRole("dialog").getByRole("button", { name: "Close" }).click(); await page.getByLabel("Unsaved calculation scenario", { exact: true }).getByRole("button", { name: "Duplicate" }).click(); await page.getByRole("button", { name: "View comparison summaries" }).click(); await page.emulateMedia({ media: "print" }); await expect(page.locator('.weighing-summary-print-root[data-summary-count="3"]')).toBeVisible(); expect((await page.pdf({ format: "A4", printBackground: true })).byteLength).toBeGreaterThan(10_000);
});
