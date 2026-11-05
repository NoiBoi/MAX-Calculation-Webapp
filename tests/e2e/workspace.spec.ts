import { expect, test } from "@playwright/test";
import { TI2ALN_VISIBLE_EXPECTATION } from "../../lib/workspace/visible-expectations";

async function chooseExample(page: import("@playwright/test").Page, id: string) { await page.getByRole("button", { name: /More actions/ }).click(); await page.getByLabel("Start or reset").selectOption(id); }
async function openMore(page: import("@playwright/test").Page) { await page.getByRole("button", { name: /More actions/ }).click(); }
async function saveRecipe(page: import("@playwright/test").Page) { await page.getByRole("button", { name: "Save", exact: true }).click(); const dialog = page.getByRole("dialog", { name: "Save recipe" }); await dialog.getByRole("button", { name: /Save recipe|Save revision|Rename recipe/ }).click(); await expect(dialog).not.toBeVisible(); }

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
  await expect(page.getByLabel("M Ti fraction")).toHaveValue("0.5");
  await expect(page.getByLabel("M Nb fraction")).toHaveValue("0.5");
  await page.getByRole("button", { name: "Standard", exact: true }).click();
  await expect(page.getByLabel("Target formula")).toHaveValue("(Ti0.5Nb0.5)2AlN");
});

test("UX-003 direct aluminum coefficient updates masses, composition, and trace", async ({ page }) => {
  const before = await page.getByRole("row", { name: /Al Al/ }).getByText(/g$/).first().textContent();
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await page.getByLabel("Aluminum per formula").fill("1.05");
  await page.getByRole("button", { name: "Standard", exact: true }).click();
  const after = await page.getByRole("row", { name: /Al Al/ }).getByText(/g$/).first().textContent();
  expect(after).not.toBe(before);
  await expect(page.getByRole("region", { name: "Final weighing results" }).getByText(/Al:1.05/)).toBeVisible();
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await page.getByRole("button", { name: "Open calculation trace" }).click();
  await expect(page.getByLabel("Calculation trace").getByText("ELEMENTAL_FEED_COEFFICIENT_APPLIED")).toBeVisible();
});

test("UX-004 purity correction increases gross mass and warns", async ({ page }) => {
  const row = page.getByRole("row", { name: /Al Al/ });
  const before = await row.getByText(/g$/).first().textContent();
  await page.locator("#purity-al").fill("95");
  const after = await row.getByText(/g$/).first().textContent();
  expect(Number(after?.replace(" g", ""))).toBeGreaterThan(Number(before?.replace(" g", "")));
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
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
  await expect(page.getByRole("alert").filter({ hasText: "Current recipe" })).toContainText(/nitrogen|element N|\bN\b/i);
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
  await page.getByLabel("Target formula").press("Enter");
  await expect(page.getByLabel("Target batch mass")).toBeFocused();
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
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
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
  await saveRecipe(page);
  await expect(page.getByText(/Saved Ti2AlN recipe, revision 1/)).toBeVisible();
  await page.getByLabel("Target batch mass").fill("12.5");
  await saveRecipe(page);
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
  await openMore(page); await page.getByRole("button", { name: "Manage routes" }).click();
  await page.getByRole("button", { name: "Save current precursor setup as route" }).click();
  await page.getByLabel("Close library").click();
  await page.keyboard.press("Control+Alt+N");
  await openMore(page); await page.getByRole("button", { name: "Manage routes" }).click();
  await page.getByRole("button", { name: "Apply copy" }).click();
  await expect(page.locator("#precursor-formula-ti")).toHaveValue("Ti");
  await expect(page.getByText(/Applied .* revision 1/)).toBeVisible();
});

test("UX-EXPORT copy, CSV, JSON, print, and stale safety", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openMore(page);
  await page.getByRole("button", { name: "Copy table" }).click();
  await expect(page.getByText(/Weighing table copied/)).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Precursor\tFormula\tPurity\tFinal weighing mass\tUnit");
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  expect((await csvDownload).suggestedFilename()).toBe("Ti2AlN-unsaved-calculation.csv");
  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  expect((await jsonDownload).suggestedFilename()).toBe("Ti2AlN-unsaved-calculation.json");
  await context.addInitScript(() => { window.print = () => { document.documentElement.dataset.printInvoked = "true"; }; });
  const printPopup = page.waitForEvent("popup"); await page.getByRole("button", { name: "Print", exact: true }).click(); const printPage = await printPopup;
  await expect(printPage.locator('.dedicated-print-root[data-print-ready="true"]')).toBeVisible(); await expect(printPage.locator(".dedicated-print-root")).toHaveAttribute("data-recipes-per-page", "1"); await expect(printPage.getByRole("heading", { name: /AlN example/ })).toBeVisible(); await expect(printPage.locator(".dedicated-print-root").getByRole("button")).toHaveCount(0); await printPage.close();
  await page.locator("#precursor-formula-ti").fill("Ti(");
  await expect(page.getByRole("button", { name: "Copy table" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "CSV", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "JSON", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Print", exact: true })).toBeDisabled();
});

test("Standard fits six editable precursors and the live total across desktop themes", async ({ page }) => {
  await chooseExample(page, "blank");
  await page.getByLabel("Target formula").fill("TiNbVAlBC");
  await page.getByLabel("Target formula").press("Enter");
  await expect(page.getByLabel("Target batch mass")).toBeFocused();
  await page.getByLabel("Target batch mass").fill("15");
  const precursors = ["Ti", "Nb", "V", "Al", "B", "C"];
  for (const [index, formula] of precursors.entries()) {
    await page.getByRole("button", { name: "Add precursor" }).click();
    const field = page.getByRole("textbox", { name: `Formula, precursor ${index + 1}`, exact: true });
    await expect(field).toBeFocused();
    await field.fill(formula);
    await field.press("Enter");
    await expect(page.getByRole("textbox", { name: `Purity (%), precursor ${index + 1}` })).toBeFocused();
  }
  await expect(page.getByRole("table", { name: "Final gross weighing masses" }).getByRole("row")).toHaveCount(8);
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
    await page.setViewportSize(viewport);
    for (const theme of ["Light", "Dark", "Midnight"]) {
      await page.getByRole("button", { name: "Open appearance menu" }).click();
      await page.getByRole("menuitemradio", { name: theme }).click();
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme.toLowerCase());
      await expect(page.getByLabel("Target formula")).toBeInViewport({ ratio: 1 });
      await expect(page.getByLabel("Target batch mass")).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole("textbox", { name: "Purity (%), precursor 6" })).toBeInViewport({ ratio: 1 });
      await expect(page.getByText("Final rounded total")).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole("button", { name: "Save", exact: true })).toBeInViewport({ ratio: 1 });
      const inputs = await page.getByRole("region", { name: "Composition and precursors" }).boundingBox();
      const results = await page.getByRole("region", { name: "Final weighing results" }).boundingBox();
      expect(inputs!.x + inputs!.width).toBeLessThan(results!.x);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    }
  }
});

test("boride coefficients follow the formula until an explicit override is saved", async ({ page }) => {
  await chooseExample(page, "blank");
  await page.getByLabel("Target formula").fill("Ti2Al");
  await page.getByLabel("Target formula").fill("Ti2Al2B");
  for (const [index, formula] of ["Ti", "Al", "B"].entries()) {
    await page.getByRole("button", { name: "Add precursor" }).click();
    await page.getByRole("textbox", { name: `Formula, precursor ${index + 1}`, exact: true }).fill(formula);
  }
  const mode = page.getByRole("group", { name: "Interaction mode" });
  const aluminumMass = page.getByRole("row", { name: /^Al Al/ }).getByText(/g$/).first();
  const derivedMass = await aluminumMass.innerText();
  await mode.getByRole("button", { name: "Advanced", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Aluminum per formula" })).toHaveValue("2");
  await page.getByRole("textbox", { name: "Aluminum per formula" }).fill("2.2");
  const adjustedMass = await aluminumMass.innerText();
  expect(adjustedMass).not.toBe(derivedMass);
  await mode.getByRole("button", { name: "Standard", exact: true }).click();
  await expect(aluminumMass).toHaveText(adjustedMass);
  await expect(page.getByText("Target reference", { exact: true })).toBeVisible();
  await expect(page.getByText("Adjusted feed", { exact: true })).toBeVisible();
  await expect(page.getByText(/Advanced settings.*Al coefficient/)).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Aluminum per formula" })).toHaveCount(0);
  await saveRecipe(page);
  await page.reload();
  await expect(page.getByLabel("Target formula")).toHaveValue("Ti2Al2B");
  await expect(aluminumMass).toHaveText(adjustedMass);
  await page.getByRole("button", { name: "Inspect in Advanced" }).click();
  await expect(page.getByRole("textbox", { name: "Aluminum per formula" })).toHaveValue("2.2");
  await page.getByRole("button", { name: "Use formula coefficient" }).click();
  await expect(aluminumMass).toHaveText(derivedMass);
});

test("Advanced keeps weighing results visible while inspecting constraints in all explicit themes", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  const sections = page.getByRole("navigation", { name: "Advanced calculator sections" });
  const results = page.getByRole("region", { name: "Final weighing results" });
  const total = results.getByRole("row").filter({ hasText: "Final rounded total" });
  const baseline = (await total.innerText()).match(/[\d.]+ g/)?.[0];
  expect(baseline).toBeTruthy();
  for (const theme of ["Light", "Dark", "Midnight"]) {
    await page.getByRole("button", { name: "Open appearance menu" }).click();
    await page.getByRole("menuitemradio", { name: theme }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme.toLowerCase());
    await sections.getByRole("link", { name: "Batch & constraints" }).click();
    await expect(page.getByRole("heading", { name: "Batch & constraints" })).toBeInViewport();
    await expect(results.getByRole("heading", { name: "Final weighing results" })).toBeInViewport();
    await expect(total).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1280);
  }
  await page.getByLabel("Ti control", { exact: true }).selectOption("ratio");
  await page.getByLabel("Ti ratio denominator").selectOption({ label: "Al" });
  await page.getByLabel("Ti numerator ratio").fill("2");
  await expect(total).toContainText(baseline!);
  await page.getByRole("button", { name: "Standard", exact: true }).click();
  await expect(page.getByText(/Advanced settings.*solver settings/)).toBeVisible();
  await expect(total).toContainText(baseline!);
  await page.getByRole("button", { name: "Inspect in Advanced" }).click();
  await expect(page.getByLabel("Ti control", { exact: true })).toHaveValue("ratio");
  await expect(page.getByLabel("Ti numerator ratio")).toHaveValue("2");
  await expect(page.getByLabel("Ti ratio denominator")).toHaveValue("al");
  await sections.getByRole("link", { name: "Material properties" }).click();
  await page.getByText("Molar mass and source overrides", { exact: true }).click();
  await expect(page.getByLabel("Ti molar mass override")).toBeVisible();
  await sections.getByRole("link", { name: "Diagnostics & provenance" }).click();
  await expect(page.getByRole("heading", { name: "Matrix and solver diagnostics" })).toBeVisible();
});
