import { expect, test } from "@playwright/test";
import { TI2ALN_VISIBLE_EXPECTATION } from "../../lib/workspace/visible-expectations";

async function chooseExample(page: import("@playwright/test").Page, id: string) { await page.getByRole("button", { name: /More actions/ }).click(); await page.getByLabel("Start or reset").selectOption(id); }
async function openMore(page: import("@playwright/test").Page) { await page.getByRole("button", { name: /More actions/ }).click(); }

test.beforeEach(async ({ page }) => { await page.goto("/workspace"); await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible(); await chooseExample(page, "ti2aln"); });

test("UX-001 routine formula workflow updates without a calculate action", async ({ page }) => {
  for (const [precursor, mass] of Object.entries(TI2ALN_VISIBLE_EXPECTATION.finalMassesGrams)) await expect(page.getByRole("row", { name: new RegExp(`^${precursor} `) })).toContainText(`${mass} g`);
  await expect(page.getByText(`${TI2ALN_VISIBLE_EXPECTATION.finalTotalGrams} g`, { exact: true })).toBeVisible();
  await chooseExample(page, "ti3alc2");
  const before = await page.getByRole("row", { name: /Ti Ti/ }).getByText(/g$/).first().textContent();
  await page.getByLabel("Target batch mass").fill("20");
  const after = await page.getByRole("row", { name: /Ti Ti/ }).getByText(/g$/).first().textContent();
  expect(after).not.toBe(before);
  await expect(page.getByRole("button", { name: /calculate/i })).toHaveCount(0);
});

test("UX-002 mixed-site state survives standard and advanced modes", async ({ page }) => {
  await chooseExample(page, "tinbaln");
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await expect(page.getByText("Ti 0.5 + Nb 0.5")).toBeVisible();
  await page.getByRole("button", { name: "Standard", exact: true }).click();
  await expect(page.getByLabel("Target formula")).toHaveValue("(Ti0.5Nb0.5)2AlN");
});

test("UX-003 Al excess updates masses, composition, and trace", async ({ page }) => {
  const before = await page.getByRole("row", { name: /Al Al/ }).getByText(/g$/).first().textContent();
  await page.getByLabel("Elemental Al excess").fill("5");
  const after = await page.getByRole("row", { name: /Al Al/ }).getByText(/g$/).first().textContent();
  expect(after).not.toBe(before);
  await expect(page.getByText(/Al:1.05/)).toBeVisible();
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await page.getByRole("button", { name: "Open calculation trace" }).click();
  await expect(page.getByLabel("Calculation trace").getByText("ELEMENTAL_ADJUSTMENT_APPLIED")).toBeVisible();
});

test("UX-004 purity correction increases gross mass and warns", async ({ page }) => {
  const row = page.getByRole("row", { name: /Al Al/ });
  const before = await row.getByText(/g$/).first().textContent();
  await page.locator("#purity-al").fill("95");
  const after = await row.getByText(/g$/).first().textContent();
  expect(Number(after?.replace(" g", ""))).toBeGreaterThan(Number(before?.replace(" g", "")));
  await page.getByText(/Minor advisories/).click();
  await expect(page.getByText(/IMPURITY_COMPOSITION_UNMODELED/).first()).toBeVisible();
});

test("UX-005 invalid precursor keeps unmistakably stale results and recovers", async ({ page }) => {
  const tiFormula = page.locator("#precursor-formula-ti");
  await expect(page.getByText("Final rounded total")).toBeVisible();
  await tiFormula.fill("Ti(");
  await expect(page.getByText("STALE — values below do not reflect the current input.")).toBeVisible();
  await expect(tiFormula).toHaveValue("Ti(");
  await tiFormula.fill("Ti");
  await expect(page.getByText("STALE — values below do not reflect the current input.")).toHaveCount(0);
  await expect(page.getByText("Final rounded total")).toBeVisible();
});

test("UX-006 missing nitrogen source blocks current masses and preserves route", async ({ page }) => {
  await page.getByRole("button", { name: "Remove N" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Current recipe" })).toContainText("MISSING_REQUIRED_ELEMENT_SOURCE");
  await expect(page.getByText("STALE — values below do not reflect the current input.")).toBeVisible();
  await expect(page.locator("#precursor-formula-ti")).toHaveValue("Ti");
  await expect(page.locator("#precursor-formula-al")).toHaveValue("Al");
});

test("UX-007 keyboard shortcuts reach the complete routine workflow", async ({ page }) => {
  await page.keyboard.press("Alt+1");
  await expect(page.getByLabel("Target formula")).toBeFocused();
  await page.keyboard.press("Alt+2");
  await expect(page.locator("#precursor-formula-ti")).toBeFocused();
  await page.keyboard.press("Alt+3");
  await expect(page.getByLabel("Target batch mass")).toBeFocused();
  await page.getByLabel("Elemental Al excess").fill("5");
  await page.keyboard.press("Alt+4");
  await expect(page.getByRole("table", { name: /Final gross weighing masses/ }).locator("..")).toBeFocused();
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await page.keyboard.press("Control+K");
  await page.getByLabel("More actions", { exact: true }).getByRole("button", { name: "Open calculation trace" }).click();
  await expect(page.getByLabel("Calculation trace")).toBeVisible();
});

test("UX-008 twenty mode toggles preserve recipe state", async ({ page }) => {
  await chooseExample(page, "tinbaln");
  await page.getByLabel("Target batch mass").fill("12.340");
  for (let index = 0; index < 20; index += 1) await page.keyboard.press("Control+Alt+A");
  await expect(page.getByLabel("Target formula")).toHaveValue("(Ti0.5Nb0.5)2AlN");
  await expect(page.getByLabel("Target batch mass")).toHaveValue("12.340");
  await expect(page.getByRole("button", { name: "Advanced", exact: true })).toBeVisible();
});

test("UX-009 coarse rounding produces a material-shift warning", async ({ page }) => {
  await page.getByLabel("Balance increment").fill("1");
  await page.getByLabel("Target batch mass").fill("1.4");
  await expect(page.getByText(/rounding shift/i).first()).toBeVisible();
});

test("UX-010 tablet layout has usable inputs and no page-level horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await expect(page.getByLabel("Target formula")).toBeVisible();
  await expect(page.getByRole("table", { name: /Final gross weighing masses/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("desktop viewports and 200% zoom keep the focused workflow visible", async ({ page }) => {
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    await expect(page.getByLabel("Target formula")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Final weighing results" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 720, height: 900 });
  await page.getByLabel("Target batch mass").focus();
  await expect(page.getByLabel("Target batch mass")).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("records live numeric-edit latency without a CI timing gate", async ({ page }) => {
  const mass = page.getByLabel("Target batch mass");
  const total = page.getByText("Final rounded total").locator("..");
  const samples: number[] = [];
  for (let index = 0; index < 20; index += 1) {
    const before = await total.textContent();
    const started = performance.now();
    await mass.fill(String(10 + (index + 1) / 10));
    await expect(total).not.toHaveText(before ?? "");
    samples.push(performance.now() - started);
  }
  samples.sort((left, right) => left - right);
  console.info(`Workspace numeric-edit p95 observation: ${samples[Math.ceil(samples.length * 0.95) - 1]?.toFixed(1)}ms`);
});

test("UX-PERSIST-001 saves, refreshes, and creates immutable revisions", async ({ page }) => {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/Saved Ti2AlN recipe, revision 1/)).toBeVisible();
  await page.getByLabel("Target batch mass").fill("12.5");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(/revision 2/)).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible();
  await expect(page.getByLabel("Target batch mass")).toHaveValue("12.5");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.getByRole("button", { name: "History" }).click();
  await expect(page.getByRole("heading", { name: "Revision 2" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Revision 1" })).toBeVisible();
  await page.getByRole("heading", { name: "Revision 1" }).locator("..").getByRole("button", { name: "Open snapshot" }).click();
  await expect(page.getByText("Historical saved result")).toBeVisible();
  await expect(page.getByLabel("Target batch mass")).toHaveValue("10.000");
});

test("UX-PERSIST-004 undo and redo restore scientific edits synchronously", async ({ page }) => {
  await page.getByLabel("Target batch mass").fill("12");
  await page.getByRole("button", { name: "Remove N" }).click();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator("#precursor-formula-n")).toHaveValue("N");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.getByLabel("Target batch mass")).toHaveValue("10.000");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(page.locator("#precursor-formula-n")).toHaveCount(0);
});

test("UX-PERSIST-006 saves and applies an immutable reusable route", async ({ page }) => {
  await openMore(page); await page.getByRole("button", { name: "Apply or save route" }).click();
  await page.getByRole("button", { name: "Save current precursor setup as route" }).click();
  await page.getByLabel("Close library").click();
  await page.keyboard.press("Control+Alt+N");
  await openMore(page); await page.getByRole("button", { name: "Apply or save route" }).click();
  await page.getByRole("button", { name: "Apply copy" }).click();
  await expect(page.locator("#precursor-formula-ti")).toHaveValue("Ti");
  await expect(page.getByText(/Applied .* revision 1/)).toBeVisible();
});

test("UX-EXPORT copy, CSV, JSON, print, and stale safety", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Copy table" }).click();
  await expect(page.getByText(/Weighing table copied/)).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Precursor\tFormula\tPurity\tFinal weighing mass\tUnit");
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  expect((await csvDownload).suggestedFilename()).toBe("Ti2AlN-unsaved-calculation.csv");
  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  expect((await jsonDownload).suggestedFilename()).toBe("Ti2AlN-unsaved-calculation.json");
  await page.evaluate(() => { window.print = () => { document.body.dataset.printInvoked = "true"; }; });
  await page.getByRole("button", { name: "Print", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-print-invoked", "true");
  await page.locator("#precursor-formula-ti").fill("Ti(");
  await expect(page.getByRole("button", { name: "Copy table" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "CSV", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "JSON", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeDisabled();
});
