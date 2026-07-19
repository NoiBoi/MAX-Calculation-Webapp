import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function ready(page: Page) { await page.goto("/workspace"); await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible(); }
async function more(page: Page) { await page.getByRole("button", { name: /More actions/ }).click(); }
async function example(page: Page, id: string) { await more(page); await page.getByLabel("Start or reset").selectOption(id); }
async function saveRecipe(page: Page) { await page.getByRole("button", { name: "Save", exact: true }).click(); const dialog = page.getByRole("dialog", { name: "Save recipe" }); await dialog.getByRole("button", { name: /Save recipe|Save revision|Rename recipe/ }).click(); await expect(dialog).not.toBeVisible(); }

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
  const bar = page.getByRole("toolbar", { name: "Calculator page actions" });
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

test("SITE-RATIO-001 explicitly normalizes a leading mixed M-site group and restores ordinary parsing", async ({ page }) => {
  await ready(page);
  const formula = "(TiVMoNbW1.2Ta0.4)4AlC3";
  await page.getByLabel("Target formula").fill(formula);
  await page.getByLabel("Normalize leading mixed-site ratios").check();
  await expect(page.getByRole("heading", { name: "M-site ratio normalization" })).toBeVisible();
  await expect(page.getByText(/Derived explicit site model: 413-derived mixed M-site composition with stoichiometric feed/)).toBeVisible();
  await page.getByText("Show exact normalized values").click();
  await expect(page.getByText("Ti: occupancy 5/28; per formula 5/7")).toBeVisible();
  await expect(page.getByText("W: occupancy 3/14; per formula 6/7")).toBeVisible();
  await expect(page.getByText("Ta: occupancy 1/14; per formula 2/7")).toBeVisible();
  for (const precursor of ["Ti", "V", "Mo", "Nb", "W", "Ta", "Al", "C"]) {
    await page.getByRole("button", { name: "Add precursor" }).click();
    await page.locator('[id^="precursor-formula-"]').last().fill(precursor);
  }
  await expect(page.getByText("Final rounded total")).toBeVisible();
  await page.getByLabel("Normalize leading mixed-site ratios").uncheck();
  await expect(page.getByLabel("Target formula")).toHaveValue(formula);
  await expect(page.getByRole("heading", { name: "M-site ratio normalization" })).toHaveCount(0);
  await expect(page.getByText(/Flat elemental formula/)).toBeVisible();
  await expect(page.getByText("Final rounded total")).toBeVisible();
});

test("SITE-RATIO-002 preserves deficient carbon feed and sorts weighing rows without recalculation", async ({ page }) => {
  await ready(page);
  const formula = "(TiVMoTa0.5W1.5)4AlC2.7";
  await page.getByLabel("Target formula").fill(formula);
  await expect(page.getByText(`Entered target formula: ${formula}`)).toBeVisible();
  const carbon = page.getByLabel("Carbon per formula");
  await expect(carbon).toHaveValue("2.7");
  const alBox = await page.getByLabel("Aluminum per formula").boundingBox(); const carbonBox = await carbon.boundingBox();
  expect(Math.abs((alBox?.y ?? 0) - (carbonBox?.y ?? 100))).toBeLessThan(8);
  await page.getByLabel("Normalize leading mixed-site ratios").check();
  await page.getByLabel("Aluminum per formula").fill("1.2");
  const formulaStages = page.getByRole("region", { name: "Target and adjusted feed formulas" });
  await expect(formulaStages.getByText("(Ti1/5V1/5Mo1/5Ta1/10W3/10)4AlC3", { exact: true })).toBeVisible();
  await expect(formulaStages.getByText("Ti4/5V4/5Mo4/5Ta2/5W6/5AlC3", { exact: true })).toBeVisible();
  await expect(formulaStages.getByText("Ti4/5V4/5Mo4/5Ta2/5W6/5Al1.2C2.7", { exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Entered ratio" })).toBeVisible();
  await expect(page.getByText("(Ti1/5V1/5Mo1/5Ta1/10W3/10)4AlC2.7", { exact: true })).toBeVisible();
  await expect(page.getByText("Ti4/5V4/5Mo4/5Ta2/5W6/5AlC2.7", { exact: true })).toBeVisible();
  await expect(page.getByText(/413-derived mixed M-site composition with carbon-deficient feed/)).toBeVisible();
  await carbon.fill("3"); await expect(page.getByText(/Stoichiometric carbon/)).toBeVisible(); await expect(page.getByLabel("Target formula")).toHaveValue("(TiVMoTa0.5W1.5)4AlC3");
  await carbon.fill("3.15"); await expect(page.getByText(/5% excess carbon/)).toBeVisible();
  await carbon.fill("0"); await expect(page.getByText(/greater than zero/)).toBeVisible(); await expect(page.getByLabel("Target formula")).toHaveValue("(TiVMoTa0.5W1.5)4AlC3.15");
  await carbon.fill("2.7"); await expect(page.getByText(/10% below ideal carbon/)).toBeVisible(); await expect(page.getByLabel("Target formula")).toHaveValue(formula);
  await page.getByLabel("Normalize leading mixed-site ratios").uncheck();
  await expect(page.getByText(`Entered target formula: ${formula}`)).toBeVisible();
  for (const precursor of ["Ti", "V", "Mo", "Ta", "W", "Al", "C"]) { await page.getByRole("button", { name: "Add precursor" }).click(); await page.locator('[id^="precursor-formula-"]').last().fill(precursor); }
  await expect(page.getByText("Final rounded total")).toBeVisible();
  const masses = async () => Object.fromEntries(await page.locator("tbody tr[data-precursor-id]").evaluateAll((rows) => rows.map((row) => [row.getAttribute("data-precursor-id"), row.querySelector('[title^="Exact stored value"]')?.getAttribute("title")])));
  const before = await masses();
  await page.getByLabel("Sort").selectOption("mass-desc");
  const descending = await page.locator('tbody tr[data-precursor-id] [title^="Exact stored value"]').evaluateAll((values) => values.map((value) => Number(value.getAttribute("title")?.match(/[\d.]+/)?.[0])));
  expect(descending).toEqual([...descending].sort((left, right) => right - left));
  await page.getByLabel("Sort").selectOption("name-asc");
  const names = await page.locator("tbody tr[data-precursor-id] th:first-child").allTextContents(); expect(names).toEqual([...names].sort((left, right) => left.toLowerCase().localeCompare(right.toLowerCase())));
  await page.getByLabel("Sort").selectOption("status-high"); expect(await masses()).toEqual(before);
  await page.getByLabel("Sort").selectOption("mass-desc"); await page.reload(); await expect(page.getByLabel("Sort")).toHaveValue("mass-desc");
});

test("AL-FEED-001 uses and persists direct aluminum and carbon feed coefficients", async ({ page }) => {
  await ready(page); await example(page, "ti3alc2");
  const aluminum = page.getByLabel("Aluminum per formula"), carbon = page.getByLabel("Carbon per formula");
  await expect(aluminum).toHaveValue("1"); await expect(page.getByText(/Stoichiometric aluminum/)).toBeVisible();
  const before = await page.getByRole("row", { name: /Al Al/ }).getByText(/g$/).first().textContent();
  await aluminum.fill("1.2"); await carbon.fill("2.7");
  await expect(page.getByText("Ti3Al1.2C2.7", { exact: true })).toBeVisible(); await expect(page.getByText(/20% above ideal aluminum/)).toBeVisible();
  expect(await page.getByRole("row", { name: /Al Al/ }).getByText(/g$/).first().textContent()).not.toBe(before);
  await aluminum.fill("2.2"); await expect(page.getByText("Ti3Al2.2C2.7", { exact: true })).toBeVisible(); await expect(page.getByText(/120% above ideal aluminum/)).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click(); await expect(aluminum).toHaveValue("1.2");
  await page.getByRole("button", { name: "Redo", exact: true }).click(); await expect(aluminum).toHaveValue("2.2");
  await saveRecipe(page); await expect(page.getByText(/revision 1/)).toBeVisible();
  await page.getByRole("button", { name: "New", exact: true }).click(); await page.getByRole("button", { name: "Open", exact: true }).click();
  await page.locator("article").filter({ hasText: "Ti3AlC2.7" }).getByRole("button", { name: "Open" }).click();
  await expect(page.getByLabel("Aluminum per formula")).toHaveValue("2.2"); await expect(page.getByLabel("Carbon per formula")).toHaveValue("2.7");
});

test("UX-REMEDIATION-ACCESS blank, standard, and advanced workspaces have no serious accessibility violations", async ({ page }) => {
  await ready(page); let audit = await new AxeBuilder({ page }).analyze(); expect(audit.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  await example(page, "tinbaln"); audit = await new AxeBuilder({ page }).analyze(); expect(audit.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  await page.getByRole("button", { name: "Advanced", exact: true }).click(); audit = await new AxeBuilder({ page }).analyze(); expect(audit.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
});
