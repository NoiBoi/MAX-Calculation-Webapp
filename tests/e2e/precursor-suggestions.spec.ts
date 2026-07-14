import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) { await page.goto("/workspace"); await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible(); }

test("PRECURSOR-SUGGEST-001 suggests, applies, and calculates a deterministic candidate", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Target formula").fill("Ti3AlC2");
  await expect(page.getByText("Candidate precursor routes available.")).toBeVisible();
  await page.getByRole("button", { name: "Suggest precursors" }).click();
  const panel = page.getByRole("region", { name: "Suggested precursors" });
  await expect(panel.getByText(/registered/).first()).toBeVisible();
  await expect(panel.getByText(/exact-/).first()).toBeVisible();
  await panel.getByRole("button", { name: "Use this route" }).first().click();
  await expect(page.locator('[id^="precursor-formula-"]')).toHaveCount(3);
  await expect(page.getByLabel("Purity").first()).toHaveValue("");
  await expect(page.getByText("Final rounded total")).toBeVisible();
});

test("PRECURSOR-SUGGEST-002 clear all confirms, preserves target/settings, and one undo restores rows", async ({ page }) => {
  await ready(page); await page.getByLabel("Target formula").fill("Ti3AlC2"); await page.getByLabel("Target batch mass").fill("12.345"); await page.getByLabel("Aluminum per formula").fill("1.2"); await page.getByRole("button", { name: "Autofill best candidate" }).click();
  const formulas = await page.locator('[id^="precursor-formula-"]').evaluateAll((items) => items.map((item) => (item as HTMLInputElement).value));
  page.once("dialog", (dialog) => dialog.accept()); await page.getByRole("button", { name: "Clear all precursors" }).click();
  await expect(page.locator('[id^="precursor-formula-"]')).toHaveCount(0); await expect(page.getByLabel("Target formula")).toHaveValue("Ti3AlC2"); await expect(page.getByLabel("Target batch mass")).toHaveValue("12.345"); await expect(page.getByLabel("Aluminum per formula")).toHaveValue("1.2");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator('[id^="precursor-formula-"]')).toHaveCount(formulas.length);
  expect(await page.locator('[id^="precursor-formula-"]').evaluateAll((items) => items.map((item) => (item as HTMLInputElement).value))).toEqual(formulas);
});

test("PRECURSOR-SUGGEST-003 formula changes never replace the existing route", async ({ page }) => {
  await ready(page); await page.getByLabel("Target formula").fill("Ti3AlC2"); await page.getByRole("button", { name: "Autofill best candidate" }).click();
  const before = await page.locator('[id^="precursor-formula-"]').evaluateAll((items) => items.map((item) => (item as HTMLInputElement).value));
  await page.getByLabel("Target formula").fill("Ti4AlN3");
  await expect(page.getByText("Current precursor route no longer covers all target elements.")).toBeVisible();
  expect(await page.locator('[id^="precursor-formula-"]').evaluateAll((items) => items.map((item) => (item as HTMLInputElement).value))).toEqual(before);
  await expect(page.getByRole("button", { name: "Suggest replacements" })).toBeVisible();
});

test("PRECURSOR-SUGGEST-004 autofill confirms before replacing a non-empty route", async ({ page }) => {
  await ready(page); await page.getByLabel("Target formula").fill("Ti3AlC2"); await page.getByRole("button", { name: "Add precursor" }).click(); await page.locator('[id^="precursor-formula-"]').fill("Ti");
  page.once("dialog", async (dialog) => { expect(dialog.message()).toContain("Replace the current 1 precursor"); await dialog.dismiss(); });
  await page.getByRole("button", { name: "Autofill best candidate" }).click(); await expect(page.locator('[id^="precursor-formula-"]')).toHaveCount(1); await expect(page.locator('[id^="precursor-formula-"]')).toHaveValue("Ti");
});
