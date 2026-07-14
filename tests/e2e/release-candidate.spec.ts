import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function openMore(page: import("@playwright/test").Page) { await page.getByRole("button", { name: /More actions/ }).click(); }
async function chooseExample(page: import("@playwright/test").Page, id = "ti2aln") { await openMore(page); await page.getByLabel("Start or reset").selectOption(id); }
async function openSettings(page: import("@playwright/test").Page) { await openMore(page); await page.getByRole("link", { name: "Layouts, data, backup, and settings" }).click(); }
async function openCompare(page: import("@playwright/test").Page) { const direct = page.getByRole("link", { name: "Compare", exact: true }); if (await direct.isVisible()) await direct.click(); else { await openMore(page); await page.getByRole("link", { name: "Open route comparison" }).click(); } }

test.beforeEach(async ({ page }) => { await page.goto("/workspace"); await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible(); await chooseExample(page); });

test("UX-COMPARE-001 duplicate scenarios share a target and remain independent", async ({ page }) => {
  await openCompare(page);
  await expect(page.getByText("Shared target locked", { exact: true })).toBeVisible();
  const firstMass = page.getByLabel("Scenario A precursor 1 formula");
  const secondMass = page.getByLabel("Scenario B precursor 1 formula");
  await expect(firstMass).toHaveValue("Ti"); await expect(secondMass).toHaveValue("Ti");
  await secondMass.fill("TiN");
  await expect(firstMass).toHaveValue("Ti");
  await expect(page.getByLabel("Scenario A scenario")).toContainText("Final total");
  await expect(page.getByRole("heading", { name: "Deterministic differences" })).toBeVisible();
  await page.getByLabel("Target formula").fill("Ti3AlC2");
  await expect(page.getByLabel("Scenario A scenario")).toContainText("Scenario unavailable");
  await expect(page.getByLabel("Scenario B scenario")).toContainText("Scenario unavailable");
});

test("UX-COMPARE-002/003 aligns missing precursors and isolates an invalid route", async ({ page }) => {
  await openCompare(page);
  await page.getByRole("button", { name: "Remove N from Scenario B" }).click();
  await expect(page.getByLabel("Scenario A scenario")).toContainText("Final total");
  await expect(page.getByLabel("Scenario B scenario")).toContainText("Scenario unavailable");
  await expect(page.getByRole("cell", { name: "Not used" })).toBeVisible();
  await expect(page.getByRole("row", { name: /Warnings/ })).toContainText("None");
});

test("UX-COMPARE-004 saves a preferred scenario as an independent recipe", async ({ page }) => {
  await openCompare(page);
  await page.getByLabel("Scenario B precursor 2 purity").fill("95");
  await page.getByLabel("Scenario B scenario").getByRole("button", { name: "Save as recipe" }).click();
  await expect(page.getByText(/Saved Scenario B from comparison/)).toBeVisible();
  await page.getByRole("link", { name: "Calculator" }).click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByLabel("Recipe name for Ti2AlN")).toHaveValue("Scenario B from comparison");
});

test("UX-LAYOUT-001 saves and restores a bounded layout without scientific changes", async ({ page }) => {
  const formula = await page.getByLabel("Target formula").inputValue();
  await openSettings(page);
  await page.getByRole("article").filter({ hasText: "Compact Balance View" }).getByRole("button", { name: "Set default" }).click();
  await expect(page.getByText(/default local layout/)).toBeVisible();
  await page.getByRole("link", { name: /Workspace/ }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await openMore(page);
  await expect(page.getByLabel("Workspace layout", { exact: true })).toHaveValue(/layout-/);
  await expect(page.getByLabel("Target formula")).toHaveValue(formula);
});

test("UX-BACKUP-001 creates a manifest-backed downloadable backup", async ({ page }) => {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await openSettings(page);
  await page.getByRole("button", { name: "Create verified backup" }).click();
  await expect(page.getByText(/Backup ready/)).toBeVisible();
  await expect(page.getByText(/Recipes 1 · snapshots 1/)).toBeVisible();
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Download backup JSON" }).click();
  expect((await download).suggestedFilename()).toMatch(/^max-stoich-backup-/);
});

test("UX-RESTORE-001 previews and restores a verified backup", async ({ page }) => {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await openSettings(page); await page.getByRole("button", { name: "Create verified backup" }).click();
  const pending = page.waitForEvent("download"); await page.getByRole("button", { name: "Download backup JSON" }).click(); const download = await pending; const path = await download.path(); if (!path) throw new Error("Missing download");
  await page.getByLabel("Choose MAX Stoich JSON file").setInputFiles(path);
  await expect(page.getByText("Backup preview · verified")).toBeVisible();
  await page.getByRole("button", { name: "Merge verified backup" }).click();
  await expect(page.getByText(/Merge restore complete/)).toBeVisible();
});

test("UX-IMPORT-001/002 preserves a valid historical export and blocks tampering", async ({ page }) => {
  await page.getByRole("button", { name: "Save", exact: true }).click(); const pending = page.waitForEvent("download"); await page.getByRole("button", { name: "JSON", exact: true }).click(); const download = await pending; const path = await download.path(); if (!path) throw new Error("Missing download"); const json = await readFile(path, "utf8");
  await openSettings(page); await page.getByLabel("Choose MAX Stoich JSON file").setInputFiles({ name: "calculation.json", mimeType: "application/json", buffer: Buffer.from(json) });
  await expect(page.getByText("Calculation import preview · verified")).toBeVisible(); await page.getByRole("button", { name: "Import as new recipe" }).click(); await expect(page.getByText(/Imported historical calculation/)).toBeVisible();
  const tampered = JSON.parse(json); tampered.scientificResult.batch.finalRoundedTotalWeighingMassGrams = "999";
  await page.getByLabel("Choose MAX Stoich JSON file").setInputFiles({ name: "tampered.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(tampered)) });
  await expect(page.getByText("Calculation import preview · blocked")).toBeVisible(); await expect(page.getByText(/TAMPERED_SNAPSHOT_OUTPUT/)).toBeVisible();
});

test("UX-OFFLINE-001 and zoom: calculation, comparison, local save, and export remain usable", async ({ page, context }) => {
  await context.setOffline(true);
  await page.getByLabel("Target batch mass").fill("11"); await expect(page.getByText("Final rounded total")).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click(); await expect(page.getByText(/Saved/)).toBeVisible();
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "JSON", exact: true }).click(); await download;
  await context.setOffline(false); await openCompare(page); await expect(page.getByLabel("Scenario A scenario")).toBeVisible();
  await context.setOffline(true); await page.getByLabel("Scenario B precursor 2 purity").fill("97"); await expect(page.getByLabel("Scenario B scenario")).toContainText("Final total"); await page.getByRole("button", { name: "Save comparison" }).click(); await expect(page.getByText(/Saved historical comparison/)).toBeVisible(); const comparisonDownload = page.waitForEvent("download"); await page.getByRole("button", { name: "Export comparison JSON" }).click(); await comparisonDownload; await context.setOffline(false);
});

test("UX-ACCESS-001 completes comparison review and save controls from the keyboard", async ({ page }) => {
  await openCompare(page);
  const scenarioName = page.getByLabel("Scenario B name"); await scenarioName.focus(); await page.keyboard.press("Control+A"); await page.keyboard.type("Keyboard route");
  await page.getByLabel("Keyboard route precursor 2 purity").focus(); await page.keyboard.press("Control+A"); await page.keyboard.type("96");
  await expect(page.getByRole("heading", { name: "Deterministic differences" })).toBeVisible(); await expect(page.getByLabel("Keyboard route scenario")).toContainText("Final total");
  const save = page.getByRole("button", { name: "Save comparison" }); await save.focus(); await page.keyboard.press("Enter"); await expect(page.getByText(/Saved historical comparison/)).toBeVisible();
});

test("UX-ZOOM-001 keeps calculator, comparison, and data management usable at a 200%-equivalent viewport", async ({ page }) => {
  await page.setViewportSize({ width: 720, height: 900 });
  await expect(page.getByLabel("Target formula")).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await openCompare(page); await expect(page.getByLabel("Scenario A scenario")).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.goto("/settings"); await expect(page.getByRole("heading", { name: "Full local backup" })).toBeVisible(); await expect(page.getByLabel("Choose MAX Stoich JSON file")).toBeVisible(); expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("UX-RADIUS-010 uses source-verified data without claiming lab approval", async ({ page }) => {
  await chooseExample(page, "tinbaln");
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  const radiusPanel = page.getByRole("region", { name: "Site descriptors" });
  await expect(radiusPanel.getByRole("heading", { name: "Site descriptors" })).toBeVisible();
  await expect(radiusPanel.getByLabel("Radius dataset").first()).toHaveValue("teatum-metallic-cn12");
  await expect(radiusPanel.getByText(/source-verified/).first()).toBeVisible();
  await expect(radiusPanel.getByText(/laboratory approval: not-reviewed/).first()).toBeVisible();
  await expect(radiusPanel.getByText(/Mean occupied radius/).first()).toBeVisible();
  await expect(radiusPanel.getByText(/not a direct prediction of physical stress/)).toBeVisible();
});
