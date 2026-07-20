import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page, path = "/") { await page.goto(path); await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible(); }
async function openMore(page: Page) { await page.getByRole("button", { name: /More actions/ }).click(); }
async function example(page: Page, id: string) { await openMore(page); await page.getByLabel("Start or reset").selectOption(id); }
async function saveWith(page: Page, name?: string, note?: string) { await page.getByRole("button", { name: "Save", exact: true }).click(); const dialog = page.getByRole("dialog", { name: "Save recipe" }); if (name !== undefined) await dialog.getByLabel("Recipe name").fill(name); if (note !== undefined) await dialog.getByLabel("Revision note").fill(note); await dialog.getByRole("button", { name: /Save recipe|Save revision|Rename recipe/ }).click(); await expect(dialog).not.toBeVisible(); }

test("SAVE-UI-001 renames before revision 1, records revision notes, and keeps metadata-only rename out of history", async ({ page }) => {
  await ready(page); await example(page, "ti3alc2"); await page.getByRole("button", { name: "Save", exact: true }).click(); const dialog = page.getByRole("dialog", { name: "Save recipe" }); await expect(dialog).toBeVisible(); await expect(dialog.getByText("Creates revision 1 after confirmation", { exact: true })).toBeVisible(); await dialog.getByLabel("Recipe name").fill("Ti–V–Nb 413 carbide"); await dialog.getByLabel("Revision note").fill("Initial furnace planning recipe"); await dialog.getByRole("button", { name: "Save recipe" }).click(); await expect(page.getByText(/Saved Ti–V–Nb 413 carbide, revision 1/)).toBeVisible();
  await page.getByLabel("Carbon per formula").fill("1.8"); await saveWith(page, "Ti–V–Nb 413 carbide", "Changed carbon feed to C1.8"); await expect(page.getByText(/revision 2/)).toBeVisible();
  await saveWith(page, "Renamed carbide recipe"); await expect(page.getByText(/revision 2 was not rewritten/)).toBeVisible(); await page.getByRole("button", { name: "Open", exact: true }).click(); await page.getByRole("button", { name: "History", exact: true }).click(); await expect(page.getByRole("heading", { name: "Revision 2" })).toBeVisible(); await expect(page.getByText("Changed carbon feed to C1.8")).toBeVisible(); await expect(page.getByRole("heading", { name: "Revision 3" })).toHaveCount(0);
});

test("AL-RESET-001 preserves direct aluminum feed through unrelated workflow changes and recovery", async ({ page }) => {
  page.on("dialog", (dialog) => void dialog.accept()); await ready(page, "/workspace"); await example(page, "ti3alc2"); const aluminum = page.getByLabel("Aluminum per formula"); await aluminum.fill("1.2"); await page.getByLabel("Carbon per formula").fill("1.8"); await expect(aluminum).toHaveValue("1.2");
  await page.getByRole("group", { name: "Route row 1" }).getByLabel("Formula").fill("Ti"); await expect(aluminum).toHaveValue("1.2"); await page.getByRole("button", { name: "Autofill best candidate" }).click(); await expect(aluminum).toHaveValue("1.2");
  await page.getByRole("button", { name: "Advanced", exact: true }).click(); await expect(aluminum).toHaveValue("1.2"); await page.getByRole("button", { name: "Standard", exact: true }).click(); await openMore(page); await page.getByLabel("Workspace layout").selectOption("builtin-compact-balance"); await expect(aluminum).toHaveValue("1.2"); await page.reload(); await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible(); await expect(page.getByLabel("Aluminum per formula")).toHaveValue("1.2");
});

test("PRECURSOR-NAV-001 uses Alt+Arrow navigation without changing formula text and preserves focus while reordering", async ({ page }) => {
  await ready(page, "/workspace"); await example(page, "ti2aln"); const first = page.getByRole("group", { name: "Route row 1" }).getByLabel("Formula"); const second = page.getByRole("group", { name: "Route row 2" }).getByLabel("Formula"); await first.focus(); await first.press("Alt+ArrowDown"); await expect(second).toBeFocused(); expect(await second.evaluate((element) => ({ start: (element as HTMLInputElement).selectionStart, end: (element as HTMLInputElement).selectionEnd, value: (element as HTMLInputElement).value }))).toEqual({ start: 0, end: 2, value: "Al" }); await second.press("Alt+ArrowUp"); await expect(first).toBeFocused(); await first.press("Alt+ArrowUp"); await expect(first).toBeFocused(); await page.getByRole("button", { name: "Move Ti down" }).click(); await expect(page.getByRole("group", { name: "Route row 2" }).getByLabel("Formula")).toBeFocused(); await expect(page.getByRole("group", { name: "Route row 2" }).getByLabel("Formula")).toHaveValue("Ti");
});

test("SUMMARY-MOLAR-001 shows and copies engine molar quantities with final masses", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]); await ready(page, "/workspace"); await example(page, "ti2aln"); await page.getByRole("button", { name: "View weighing summary" }).click(); const dialog = page.getByRole("dialog", { name: "Weighing summary" }); await expect(dialog.getByRole("table", { name: "Final precursor weighing masses and molar quantities" })).toContainText("mol/mol target"); await expect(dialog.getByRole("row", { name: /Ti Ti/ })).toContainText("2 mol/mol target"); await dialog.getByRole("button", { name: "Copy summary" }).click(); expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("mol/mol target");
});

test("PANEL-DISMISS-001 closes utility layers outside and with Escape while preserving trigger focus", async ({ page }) => {
  await ready(page, "/workspace"); await page.getByRole("button", { name: "Open", exact: true }).click(); await expect(page.getByRole("complementary", { name: "Saved recipe library" })).toBeVisible(); await page.getByRole("heading", { name: "Target and precursor route" }).click(); await expect(page.getByRole("complementary", { name: "Saved recipe library" })).toHaveCount(0); const more = page.getByRole("button", { name: /More actions/ }); await more.click(); await expect(page.getByLabel("More actions", { exact: true })).toBeVisible(); await page.keyboard.press("Escape"); await expect(page.getByLabel("More actions", { exact: true })).toHaveCount(0); await expect(more).toBeFocused();
});

test("DEFAULT-ROUTE-001 opens the calculator and keeps the feature demo as a labeled secondary route", async ({ page }) => {
  await ready(page);
  await expect(page.getByRole("heading", { name: "Target and precursor route" })).toBeVisible();
  await openMore(page);
  await page.getByRole("link", { name: /Feature demo and tutorial/ }).click();
  await expect(page).toHaveURL(/\/demo$/);

  const demo = page.getByLabel("Feature demo and tutorial");
  await expect(demo.getByRole("heading", { name: "Feature demo and tutorial" })).toBeVisible();
  await expect(demo.getByText("MAXCalc · Development reference", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Calculator", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/);
  await expect(page.getByRole("heading", { name: "Target and precursor route" })).toBeVisible();
});

test("NOTES-001 creates searchable revision-linked multiline notes and keeps them with the saved recipe", async ({ page }) => {
  await ready(page, "/workspace");
  await example(page, "ti2aln");
  await saveWith(page, "Notes workflow recipe", "Initial recipe");
  await openMore(page);
  await page.getByRole("button", { name: "Recipe notes" }).click();

  const dialog = page.getByRole("dialog", { name: /Recipe notes/ });
  const editor = dialog.getByRole("region", { name: "Recipe note editor" });
  const search = dialog.getByRole("region", { name: "Search recipe notes" });
  await dialog.getByRole("button", { name: "Add note", exact: true }).first().click();
  await editor.getByRole("combobox", { name: "Category" }).selectOption("Furnace settings");
  await editor.getByLabel("Revision attachment").selectOption({ label: "Revision 1" });
  await editor.getByLabel("Title").fill("1500 °C anneal under argon");
  await editor.getByLabel("Experiment date").fill("2026-07-14");
  await editor.getByLabel("Tags").fill("TiNbAlN, anneal, furnace-2");
  await editor.getByLabel("Notes", { exact: true }).fill("Ramp 5 °C/min to 1500 °C.\nHold 4 h under flowing argon.\nFurnace cool overnight.");
  await editor.getByRole("button", { name: "Save note" }).click();
  await expect(dialog.getByText("Note saved.")).toBeVisible();

  await dialog.getByRole("button", { name: "Add note", exact: true }).first().click();
  await editor.getByRole("combobox", { name: "Category" }).selectOption("Result");
  await editor.getByLabel("Title").fill("XRD summary");
  await editor.getByLabel("Notes", { exact: true }).fill("Strong MAX peaks and minor TiC.");
  await editor.getByLabel("Tags").fill("xrd");
  await editor.getByRole("button", { name: "Save note" }).click();
  await search.getByLabel("Search").fill("flowing argon");
  await expect(search.getByText("1 matching note", { exact: true })).toBeVisible();
  await search.getByRole("combobox", { name: "Category" }).selectOption("Furnace settings");
  await expect(search.getByText("1500 °C anneal under argon")).toBeVisible();
  await expect(search.getByText("Attached to revision 1", { exact: false })).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();

  await openMore(page);
  await page.getByRole("button", { name: "Recipe notes" }).click();
  await expect(page.getByRole("dialog", { name: /Recipe notes/ }).getByText("1500 °C anneal under argon")).toBeVisible();
});
