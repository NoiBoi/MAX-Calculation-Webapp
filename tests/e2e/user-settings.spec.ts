import { expect, test, type Page } from "@playwright/test";

async function openSettings(page: Page) { await page.goto("/settings"); await expect(page.getByRole("heading", { name: "Local user settings" })).toBeVisible(); await expect(page.getByText("Local data ready", { exact: true })).toBeVisible(); }
async function saveSettings(page: Page) { await page.getByRole("button", { name: "Save settings" }).click(); await expect(page.getByText(/Settings saved locally/)).toBeVisible(); }
async function setDefaults(page: Page) { await page.getByLabel("Default aluminum per formula").fill("1.2"); await page.getByLabel("211 carbon per formula").fill("0.9"); await page.getByLabel("312 carbon per formula").fill("1.8"); await page.getByLabel("413 carbon per formula").fill("2.7"); }
async function readyWorkspace(page: Page) { await page.goto("/workspace"); await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible(); }
async function choose(page: Page, value: string) { await page.getByRole("button", { name: /More actions/ }).click(); await page.getByLabel("Start or reset").selectOption(value); }

test("SETTINGS-001 persists feed, save, and Standard table settings across refresh", async ({ page }) => {
  await openSettings(page);
  await page.getByLabel("Default aluminum per formula").fill("1.2"); await page.getByLabel("413 carbon per formula").fill("2.7"); await page.getByLabel("Default Save action").selectOption("save-and-copy");
  await page.getByRole("region", { name: "Standard mode columns" }).getByLabel("Purity", { exact: true }).uncheck(); await saveSettings(page); await page.reload();
  await expect(page.getByLabel("Default aluminum per formula")).toHaveValue("1.2"); await expect(page.getByLabel("413 carbon per formula")).toHaveValue("2.7"); await expect(page.getByLabel("Default Save action")).toHaveValue("save-and-copy"); await expect(page.getByRole("region", { name: "Standard mode columns" }).getByLabel("Purity", { exact: true })).not.toBeChecked(); await page.setViewportSize({ width: 640, height: 720 }); expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test("SETTINGS-002 applies template-specific feed defaults only to new recipes", async ({ page }) => {
  await openSettings(page); await setDefaults(page); await saveSettings(page); await readyWorkspace(page);
  for (const [template, carbon] of [["211", "0.9"], ["312", "1.8"], ["413", "2.7"]] as const) { await choose(page, `generic-${template}`); await expect(page.getByLabel("Aluminum per formula")).toHaveValue("1.2"); await expect(page.getByLabel("Carbon per formula")).toHaveValue(carbon); }
  await choose(page, "ti2aln"); await expect(page.getByLabel("Aluminum per formula")).toHaveValue("1"); await expect(page.getByLabel("Nitrogen per formula")).toHaveValue("1");
  await choose(page, "ti3alcn"); await expect(page.getByLabel("Aluminum per formula")).toHaveValue("1"); await expect(page.getByLabel("Carbon per formula")).toHaveCount(0);
});

test("SETTINGS-003 main Save and Enter follow the configured default while the menu retains every action", async ({ page }) => {
  await openSettings(page); await page.getByLabel("Default Save action").selectOption("save-and-copy"); await saveSettings(page); await readyWorkspace(page); await choose(page, "ti2aln");
  await page.getByRole("button", { name: "Save", exact: true }).click(); const dialog = page.getByRole("dialog", { name: "Save recipe" }); await expect(dialog.getByText(/Save and open copy/)).toBeVisible(); await dialog.getByLabel("Recipe name").fill("Settings save copy"); await page.keyboard.press("Enter"); await expect(page.getByText(/Opened an unsaved scientific copy/)).toBeVisible();
  await page.getByRole("button", { name: "Save", exact: true }).click(); await page.getByRole("dialog", { name: "Save recipe" }).getByRole("button", { name: "More save actions" }).click(); const menu = page.getByRole("menu", { name: "Save actions" }); await expect(menu.getByRole("menuitem")).toHaveCount(3); await expect(menu.getByText("Save", { exact: true })).toBeVisible(); await expect(menu.getByText("Save and start blank", { exact: true })).toBeVisible(); await expect(menu.getByText("Save and open copy", { exact: true })).toBeVisible();
});

test("SETTINGS-004 applies independent Standard columns without changing the calculation", async ({ page }) => {
  await openSettings(page); const standard = page.getByRole("region", { name: "Standard mode columns" }); await standard.getByLabel("Purity", { exact: true }).uncheck(); await standard.getByLabel("Status", { exact: true }).uncheck(); await saveSettings(page); await readyWorkspace(page); await choose(page, "ti2aln");
  const table = page.getByRole("table", { name: /Final gross weighing masses/ }); await expect(table.locator("thead").getByRole("columnheader")).toHaveCount(3); await expect(table.getByRole("columnheader", { name: "Precursor" })).toBeVisible(); await expect(table.getByRole("columnheader", { name: "Formula" })).toBeVisible(); await expect(table.getByRole("columnheader", { name: "Final weighing mass" })).toBeVisible(); await expect(table.getByRole("columnheader", { name: "Purity" })).toHaveCount(0); await expect(page.getByText("Calculation summary", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Verify calculations" })).toBeEnabled();
});

test("SETTINGS-005 shows elemental radius but not a compound average only in configured Advanced mode", async ({ page }) => {
  await openSettings(page); await page.getByRole("region", { name: "Advanced mode columns" }).getByLabel("Element atomic radius", { exact: true }).check(); await saveSettings(page); await readyWorkspace(page); await choose(page, "ti3alc2");
  await page.getByRole("button", { name: "Add precursor" }).click(); const formulas = page.locator("[data-precursor-formula]"); const count = await formulas.count(); await formulas.nth(count - 1).fill("TiC"); await page.getByRole("button", { name: "Advanced" }).click();
  const table = page.getByRole("table", { name: /Final gross weighing masses/ }); await expect(table.getByRole("columnheader", { name: "Element atomic radius" })).toBeVisible(); const tiRows = table.locator('tbody tr[data-precursor-id="ti"]'); await expect(tiRows.getByText(/pm · metallic/)).toBeVisible(); const ticRows = table.locator("tbody tr").filter({ hasText: "TiC" }); await expect(ticRows.getByText("Not applicable", { exact: true })).toBeVisible(); await page.getByRole("button", { name: "Standard" }).click(); await expect(page.getByRole("table", { name: /Final gross weighing masses/ }).getByRole("columnheader", { name: "Element atomic radius" })).toHaveCount(0);
});

test("SETTINGS-006 section and full reset preserve recipes and routes", async ({ page }) => {
  await readyWorkspace(page); await choose(page, "ti2aln"); await page.getByRole("button", { name: "Save", exact: true }).click(); const save = page.getByRole("dialog", { name: "Save recipe" }); await save.getByLabel("Recipe name").fill("Settings reset survivor"); await save.getByRole("button", { name: /Save recipe/ }).click(); await expect(page.getByText(/Saved Settings reset survivor/)).toBeVisible(); await page.getByRole("button", { name: /More actions/ }).click(); await page.getByRole("button", { name: "Apply or save route" }).click(); await page.getByRole("button", { name: "Save current precursor setup as route" }).click();
  await openSettings(page); await page.getByLabel("Default aluminum per formula").fill("1.3"); await page.getByRole("region", { name: "Standard mode columns" }).getByLabel("Purity", { exact: true }).uncheck(); await page.getByRole("button", { name: "Reset this section" }).click(); await expect(page.getByLabel("Default aluminum per formula")).toHaveValue("1.3"); await expect(page.getByRole("region", { name: "Standard mode columns" }).getByLabel("Purity", { exact: true })).toBeChecked(); page.once("dialog", (dialog) => dialog.accept()); await page.getByRole("button", { name: "Reset all settings…" }).click(); await expect(page.getByLabel("Default aluminum per formula")).toHaveValue("1"); await expect(page.getByLabel("413 carbon per formula")).toHaveValue("3"); await expect(page.getByLabel("Default Save action")).toHaveValue("save");
  await readyWorkspace(page); await page.getByRole("button", { name: /More actions/ }).click(); await page.getByRole("button", { name: "Open recipe library" }).click(); await expect(page.getByText("Settings reset survivor", { exact: true })).toBeVisible(); await page.getByRole("button", { name: /More actions/ }).click(); await page.getByRole("button", { name: "Apply or save route" }).click(); await expect(page.getByText(/Ti2AlN precursor route/)).toBeVisible();
});

test("PRINT-SETTINGS-001 persists paper, packing, fields, and required-field protection", async ({ page }) => {
  await openSettings(page); await page.getByRole("combobox", { name: "Paper size" }).selectOption("a4"); await page.getByRole("combobox", { name: "Orientation" }).selectOption("landscape"); await page.getByRole("combobox", { name: "Recipes per page" }).selectOption("4");
  const printed = page.getByRole("group", { name: "Printed fields" }); await printed.getByLabel("Molar mass", { exact: true }).check(); await printed.getByLabel("Elemental precursor atomic radius", { exact: true }).check(); await page.getByLabel("Notes inclusion").selectOption("none"); await page.getByLabel("Warning detail").selectOption("action-required-only");
  await expect(printed.getByLabel(/Final weighing mass/)).toBeDisabled(); await saveSettings(page); await page.reload();
  await expect(page.getByRole("combobox", { name: "Paper size" })).toHaveValue("a4"); await expect(page.getByRole("combobox", { name: "Orientation" })).toHaveValue("landscape"); await expect(page.getByRole("combobox", { name: "Recipes per page" })).toHaveValue("4"); await expect(page.getByRole("group", { name: "Printed fields" }).getByLabel("Molar mass", { exact: true })).toBeChecked(); await expect(page.locator('[aria-label="4 recipes per page print preview"]')).toBeVisible();
});

test("VERIFY-PLACEMENT-001 puts verification beside trace at the bottom and restores focus", async ({ page }) => {
  await readyWorkspace(page); await choose(page, "ti2aln"); const top = page.getByTestId("primary-command-bar"); await expect(top.getByRole("button", { name: /Verify/ })).toHaveCount(0); await expect(top.getByRole("link", { name: "Settings" })).toBeVisible();
  const details = page.getByRole("region", { name: "Calculation details" }); const verify = details.getByRole("button", { name: "Verify calculations" }); await expect(verify).toBeEnabled(); await expect(details.getByRole("button", { name: "Open calculation trace" })).toBeVisible(); await verify.click(); await page.getByRole("dialog", { name: "Calculation verification" }).getByRole("button", { name: "Close" }).click(); await expect(verify).toBeFocused();
});
