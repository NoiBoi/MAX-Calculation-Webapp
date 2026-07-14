import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function ready(page: Page) { await page.goto("/workspace"); await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible(); }
async function more(page: Page) { await page.getByRole("button", { name: /More actions/ }).click(); }
async function example(page: Page, id: string) { await more(page); await page.getByLabel("Start or reset").selectOption(id); }

test("UX-REMEDIATION-001 fresh workspace starts blank and calculates from scratch", async ({ page }) => {
  await ready(page);
  await expect(page.getByLabel("Target formula")).toHaveValue("");
  await expect(page.locator('[id^="precursor-formula-"]')).toHaveCount(0);
  await expect(page.getByText("Untitled calculation")).toBeVisible();
  await expect(page.getByText("Current recipe cannot be calculated.")).toHaveCount(0);
  await page.getByLabel("Target formula").fill("Ti2AlN");
  for (const formula of ["Ti", "Al", "N"]) { await page.getByRole("button", { name: "Add precursor" }).click(); await page.locator('[id^="precursor-formula-"]').last().fill(formula); }
  await expect(page.getByText("Final rounded total")).toBeVisible();
  await expect(page.getByText(/Unsaved/).first()).toBeVisible();
});

test("UX-REMEDIATION-002 examples are immutable resettable working copies", async ({ page }) => {
  await ready(page); await example(page, "ti3alc2");
  await expect(page.getByText(/Unsaved copy of Ti₃AlC₂ example/).first()).toBeVisible();
  await page.getByLabel("Target batch mass").fill("12.5");
  await more(page); await page.getByRole("button", { name: "Reset copied example" }).click();
  await expect(page.getByLabel("Target batch mass")).toHaveValue("10.000");
  await expect(page.getByLabel("Target formula")).toHaveValue("Ti3AlC2");
});

test("UX-REMEDIATION-003 top bar keeps primary actions and demotes secondary navigation", async ({ page }) => {
  await ready(page); await example(page, "ti2aln");
  const bar = page.getByTestId("primary-command-bar");
  await expect(bar.getByRole("button", { name: "New" })).toBeVisible(); await expect(bar.getByRole("button", { name: "Open" })).toBeVisible(); await expect(bar.getByRole("button", { name: "Save" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Routes" })).toHaveCount(0); await expect(bar.getByRole("link", { name: /Layouts/ })).toHaveCount(0);
  await more(page); await expect(page.getByRole("button", { name: "Apply or save route" })).toBeVisible(); await expect(page.getByRole("link", { name: "Layouts, data, backup, and settings" })).toBeVisible();
});

test("UX-REMEDIATION-004 standard and advanced modes are materially different without state loss", async ({ page }) => {
  await ready(page); await example(page, "tinbaln"); await page.getByLabel("Target batch mass").fill("12.340");
  await expect(page.getByRole("heading", { name: "Advanced controls and diagnostics" })).toHaveCount(0);
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Advanced controls and diagnostics" })).toBeVisible(); await expect(page.getByRole("heading", { name: "Site descriptors" })).toBeVisible(); await expect(page.getByText("Matrix and solver diagnostics")).toBeVisible();
  await page.getByRole("button", { name: "Standard", exact: true }).click(); await expect(page.getByLabel("Target batch mass")).toHaveValue("12.340"); await expect(page.getByText("Matrix and solver diagnostics")).toHaveCount(0);
});

test("UX-REMEDIATION-005 compact balance layout makes the weighing result dominant", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 }); await ready(page); await example(page, "ti2aln"); await more(page); await page.getByLabel("Workspace layout").selectOption("builtin-compact-balance");
  await expect(page.locator('[data-layout="builtin-compact-balance"]')).toBeVisible();
  const result = await page.getByRole("heading", { name: "Final weighing results" }).locator("..").boundingBox(); const input = await page.getByRole("heading", { name: "Target and precursor route" }).locator("..").boundingBox();
  expect(result?.width ?? 0).toBeGreaterThan(input?.width ?? 0); await expect(page.getByText("Final rounded total")).toBeInViewport();
});

test("UX-REMEDIATION-006 provenance is information and exact codes remain in details", async ({ page }) => {
  await ready(page); await example(page, "ti3alc2");
  await expect(page.getByText(/calculation details/).first()).toBeVisible(); await page.getByText(/Calculation details \(/).click();
  const information = page.locator("article").filter({ hasText: "uses the CIAAW abridged calculation value" }).first();
  await expect(information).toBeVisible(); await expect(information).not.toHaveClass(/bg-amber-50/); await information.getByText("Show exact source message").click(); await expect(information.getByText(/ATOMIC_WEIGHT_INTERVAL/)).toBeVisible();
});

test("UX-REMEDIATION-007 high-entropy elements have usable atomic weights", async ({ page }) => {
  await ready(page); await page.getByLabel("Target formula").fill("TiVCrZrNbMoHfTaW");
  for (const formula of ["Ti", "V", "Cr", "Zr", "Nb", "Mo", "Hf", "Ta", "W"]) { await page.getByRole("button", { name: "Add precursor" }).click(); await page.locator('[id^="precursor-formula-"]').last().fill(formula); }
  await expect(page.getByText("Final rounded total")).toBeVisible(); await expect(page.getByText(/MISSING_ATOMIC_WEIGHT/)).toHaveCount(0);
});

test("UX-REMEDIATION-ACCESS blank, standard, and advanced workspaces have no serious accessibility violations", async ({ page }) => {
  await ready(page); let audit = await new AxeBuilder({ page }).analyze(); expect(audit.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  await example(page, "tinbaln"); audit = await new AxeBuilder({ page }).analyze(); expect(audit.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  await page.getByRole("button", { name: "Advanced", exact: true }).click(); audit = await new AxeBuilder({ page }).analyze(); expect(audit.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
});
