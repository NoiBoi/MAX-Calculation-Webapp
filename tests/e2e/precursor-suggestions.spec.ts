import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/workspace");
  await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible();
}

async function openSuggestions(page: Page) {
  await page.getByRole("button", { name: "Suggest precursors" }).click();
  return page.getByRole("region", { name: "Suggested additions" });
}

test("PRECURSOR-SUGGEST-001 selects a candidate in a blank workspace", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Target formula").fill("Ti3AlC2");
  const panel = await openSuggestions(page);
  await expect(panel.getByText(/registered.*Balance possible/).first()).toBeVisible();
  await panel.getByRole("button", { name: /^Add / }).first().click();
  await expect(page.getByRole("group", { name: /Route row/ })).toHaveCount(3);
  await expect(page.getByLabel("Purity (%), precursor 1")).toHaveValue("");
  await expect(page.getByText("Final rounded total")).toBeVisible();
});

test("PRECURSOR-SUGGEST-002 clear all preserves target and feed settings and one undo restores rows", async ({ page }) => {
  await ready(page);
  await page.getByRole("button", { name: "Advanced", exact: true }).click();
  await page.getByLabel("Target formula").fill("Ti3AlC2");
  await page.getByLabel("Target batch mass").fill("12.345");
  await page.getByLabel("Aluminum per formula").fill("1.2");
  const panel = await openSuggestions(page);
  await panel.getByRole("button", { name: /^Add / }).first().click();
  const formulas = await page.getByRole("textbox", { name: /^Formula, precursor/ }).evaluateAll((items) => items.map((item) => (item as HTMLInputElement).value));
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Clear all precursors" }).click();
  await expect(page.getByRole("group", { name: /Route row/ })).toHaveCount(0);
  await expect(page.getByLabel("Target formula")).toHaveValue("Ti3AlC2");
  await expect(page.getByLabel("Target batch mass")).toHaveValue("12.345");
  await expect(page.getByLabel("Aluminum per formula")).toHaveValue("1.2");
  await page.getByRole("button", { name: "Undo" }).click();
  expect(await page.getByRole("textbox", { name: /^Formula, precursor/ }).evaluateAll((items) => items.map((item) => (item as HTMLInputElement).value))).toEqual(formulas);
});

test("PRECURSOR-SUGGEST-003 updates an open list and adds without changing manual rows or purity", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Target formula").fill("TiAl");
  await page.getByRole("button", { name: "Add precursor" }).click();
  await page.getByLabel("Formula, precursor 1", { exact: true }).fill("Ti");
  await page.getByLabel("Purity (%), precursor 1").fill("96.5");
  await expect(page.getByText("Missing source for Al.")).toBeVisible();
  const panel = await openSuggestions(page);
  await expect(panel.getByRole("button", { name: "Add Al", exact: true })).toBeVisible();
  await page.getByLabel("Target formula").fill("TiC");
  await expect(page.getByText("Missing source for C.")).toBeVisible();
  await expect(panel.getByRole("button", { name: "Add Al", exact: true })).toHaveCount(0);
  const trigger = page.getByRole("button", { name: "Suggest precursors" });
  await trigger.press("ArrowDown");
  await expect(panel.getByRole("button", { name: /^Add / }).first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.press("Enter");
  await panel.getByRole("button", { name: "Add C", exact: true }).press("Enter");
  await expect(page.getByLabel("Formula, precursor 1", { exact: true })).toHaveValue("Ti");
  await expect(page.getByLabel("Purity (%), precursor 1")).toHaveValue("96.5");
  await expect(page.getByLabel("Formula, precursor 2", { exact: true })).toHaveValue("C");
  await expect(page.getByLabel("Purity (%), precursor 2")).toBeFocused();
  await expect(page.getByText("Final rounded total")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("group", { name: /Route row/ })).toHaveCount(1);
  await expect(page.getByLabel("Purity (%), precursor 1")).toHaveValue("96.5");
});

test("PRECURSOR-SUGGEST-004 explains infeasible coverage and offers a feasible addition", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Target formula").fill("Ti2C");
  await page.getByRole("button", { name: "Add precursor" }).click();
  await page.getByLabel("Formula, precursor 1").fill("TiC");
  await expect(page.getByText("These precursors cannot supply the target proportions.")).toBeVisible();
  const panel = await openSuggestions(page);
  await panel.getByRole("button", { name: "Add Ti", exact: true }).click();
  await expect(page.getByLabel("Formula, precursor 1", { exact: true })).toHaveValue("TiC");
  await expect(page.getByLabel("Formula, precursor 2", { exact: true })).toHaveValue("Ti");
  await expect(page.getByText("Final rounded total")).toBeVisible();
});

test("PRECURSOR-COVERAGE-001 direct elemental fallback handles a large high-entropy target", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Target formula").fill("(ScTiVCrMnFeCoNiZr)4AlC3");
  const panel = await openSuggestions(page);
  const direct = panel.getByRole("article").filter({ hasText: "Generic direct elemental route" });
  await expect(direct).toContainText("synthetic");
  await direct.getByRole("button", { name: /^Add / }).click();
  await expect(page.getByRole("group", { name: /Route row/ })).toHaveCount(11);
  await expect(page.getByRole("table", { name: /Final gross weighing masses/ })).toBeVisible();
});

test("PRECURSOR-SUGGEST-005 saved routes contribute new materials and their stored purity", async ({ page }) => {
  await ready(page);
  const more = page.getByRole("button", { name: /More actions/ });
  await more.click();
  await page.getByLabel("Start or reset").selectOption("ti2aln");
  await page.getByLabel("Purity (%), precursor 2").fill("98.7");
  await more.click();
  await page.getByRole("button", { name: "Manage routes" }).click();
  await page.getByRole("button", { name: "Save current precursor setup as route" }).click();
  await expect(page.getByText(/Saved route Ti2AlN precursor route/)).toBeVisible();
  await page.getByRole("button", { name: "Close library" }).click();

  await page.getByRole("button", { name: "New", exact: true }).click();
  await page.getByLabel("Target formula").fill("Ti2AlN");
  await page.getByRole("button", { name: "Add precursor" }).click();
  await page.getByLabel("Formula, precursor 1", { exact: true }).fill("Ti");
  await page.getByLabel("Purity (%), precursor 1").fill("95");
  const panel = await openSuggestions(page);
  const saved = panel.getByRole("article").filter({ hasText: "Saved route" });
  await expect(saved).toContainText("Al 98.7%");
  await saved.getByRole("button", { name: /^Add / }).click();
  await expect(page.getByRole("group", { name: /Route row/ })).toHaveCount(3);
  await expect(page.getByLabel("Purity (%), precursor 1")).toHaveValue("95");
  await expect(page.getByLabel("Formula, precursor 2", { exact: true })).toHaveValue("Al");
  await expect(page.getByLabel("Purity (%), precursor 2")).toHaveValue("98.7");
  await expect(page.getByText("Final rounded total")).toBeVisible();
});
