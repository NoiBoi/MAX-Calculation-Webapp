import { expect, test } from "@playwright/test";

async function openMore(page: import("@playwright/test").Page) { await page.getByRole("button", { name: /More actions/ }).click(); }
async function chooseExample(page: import("@playwright/test").Page, id = "ti2aln") { await openMore(page); await page.getByLabel("Start or reset").selectOption(id); }
async function openCompare(page: import("@playwright/test").Page) { await page.getByRole("link", { name: "Compare", exact: true }).click(); }
async function addCurrentPair(page: import("@playwright/test").Page) { await page.locator("header").getByRole("button", { name: "Add current recipe" }).click(); await page.getByLabel("Unsaved calculation scenario", { exact: true }).getByRole("button", { name: "Duplicate" }).click(); }

test.beforeEach(async ({ page }) => { await page.goto("/workspace"); await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible(); await chooseExample(page); });

test("SUMMARY-001 shows and copies the current balance-side summary", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const open = page.getByRole("button", { name: "View weighing summary" }); await open.click();
  const dialog = page.getByRole("dialog", { name: "Weighing summary" }); await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Ti2AlN", { exact: true })).toBeVisible();
  for (const precursor of ["Ti", "Al", "N"]) await expect(dialog.getByRole("rowheader", { name: precursor, exact: true })).toBeVisible();
  await expect(dialog.getByRole("rowheader", { name: "TOTAL", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Copy summary" }).click();
  const copied = (await page.evaluate(() => navigator.clipboard.readText())).replaceAll("\r\n", "\n"); expect(copied).toContain("Adjusted intended feed\nTi2AlN"); expect(copied).toContain("TOTAL");
  await dialog.getByRole("button", { name: "Close" }).click(); await expect(open).toBeFocused(); await page.getByLabel("Target formula").fill("Ti2Al("); await expect(open).toBeDisabled();
});

test("historical weighing summaries are available and clearly labeled", async ({ page }) => {
  await page.getByRole("button", { name: "Save", exact: true }).click(); await page.getByLabel("Target batch mass").fill("12"); await page.getByRole("button", { name: "Save", exact: true }).click(); await page.getByRole("button", { name: "Open", exact: true }).click(); await page.getByRole("button", { name: "History" }).click(); await page.getByRole("heading", { name: "Revision 1" }).locator("..").getByRole("button", { name: "Open snapshot" }).click();
  await page.getByRole("button", { name: "View weighing summary" }).click(); const dialog = page.getByRole("dialog", { name: "Weighing summary" }); await expect(dialog.getByText(/Historical saved result/)).toBeVisible();
});

test("COMPARE-EMPTY-001 starts empty and adds one named current scenario", async ({ page }) => {
  await openCompare(page); await expect(page.getByRole("heading", { name: "No recipes selected for comparison" })).toBeVisible();
  await expect(page.getByText("Scenario A", { exact: true })).toHaveCount(0); await expect(page.getByText("Scenario B", { exact: true })).toHaveCount(0);
  await page.locator("header").getByRole("button", { name: "Add current recipe" }).click();
  await expect(page.getByLabel("Unsaved calculation scenario", { exact: true })).toBeVisible(); await expect(page.getByText("Add at least one more scenario to compare results.")).toBeVisible();
});

test("COMPARE-CONTROLS-001 add, duplicate, remove, undo, and precursor buttons stay functional", async ({ page }) => {
  await openCompare(page); await page.locator("header").getByRole("button", { name: "Add blank scenario" }).click();
  const blank = page.getByLabel("Blank scenario scenario", { exact: true }); await blank.getByRole("button", { name: "Add precursor" }).click(); await expect(blank.getByLabel("Blank scenario precursor 1 formula")).toBeVisible();
  await blank.getByRole("button", { name: "Duplicate" }).click(); await expect(page.locator('section[aria-label$=" scenario"]')).toHaveCount(2); await expect(page.getByText("Duplicated Blank scenario.", { exact: true })).toBeVisible();
  await page.getByLabel("Copy of Blank scenario scenario", { exact: true }).getByRole("button", { name: "Remove", exact: true }).click(); await expect(page.locator('section[aria-label$=" scenario"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Undo scenario removal" }).click(); await expect(page.locator('section[aria-label$=" scenario"]')).toHaveCount(2); await expect(page.getByText("Restored the removed scenario.", { exact: true })).toBeVisible();
});

test("SUMMARY-002 keeps valid and invalid comparison scenarios visible", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]); await openCompare(page); await addCurrentPair(page);
  await page.getByRole("button", { name: "Remove N from Copy of Unsaved calculation" }).click(); await page.getByRole("button", { name: "View comparison summaries" }).click();
  const dialog = page.getByRole("dialog", { name: "Untitled comparison" }); await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Unsaved calculation", exact: true })).toBeVisible(); await expect(dialog.getByText("No valid weighing result")).toBeVisible(); await expect(dialog.getByText(/Selected precursors provide no nitrogen source/)).toBeVisible();
  await dialog.getByRole("button", { name: "Copy all summaries" }).click(); const copied = await page.evaluate(() => navigator.clipboard.readText()); expect(copied).toContain("=== 1. Unsaved calculation ===");
});

test("COMPARE-SAVE-001 saves and reopens scenario names and order", async ({ page }) => {
  await openCompare(page); await addCurrentPair(page); const secondName = page.getByLabel("Copy of Unsaved calculation name"); await secondName.fill("Alternate route");
  await page.getByRole("button", { name: "Save comparison" }).click(); await expect(page.getByText("Comparison saved", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Calculator" }).click(); await openCompare(page); await page.getByLabel("Open saved comparison").selectOption({ label: "Ti2AlN route comparison" });
  const regions = page.locator('section[aria-label$=" scenario"]'); await expect(regions).toHaveCount(2); await expect(regions.nth(0)).toHaveAttribute("aria-label", "Unsaved calculation scenario"); await expect(regions.nth(1)).toHaveAttribute("aria-label", "Alternate route scenario");
});

test("COMPARE-MULTISELECT-001 adds three saved recipes in one operation", async ({ page }) => {
  for (let index = 0; index < 3; index += 1) {
    if (index > 0) { await page.getByRole("button", { name: "New", exact: true }).click(); await chooseExample(page); }
    await page.getByLabel("Target batch mass").fill(`${10 + index}`); await page.getByRole("button", { name: "Save", exact: true }).click(); await expect(page.getByText(/Saved Ti2AlN recipe, revision 1/)).toBeVisible();
  }
  await openCompare(page); await page.locator("header").getByRole("button", { name: "Add saved recipes" }).click(); const picker = page.getByRole("dialog", { name: "Add saved recipes" }); await picker.getByRole("button", { name: "Select all visible" }).click(); await picker.getByRole("button", { name: "Add selected" }).click();
  await expect(page.locator('section[aria-label$=" scenario"]')).toHaveCount(3); await expect(page.getByLabel("Ti2AlN recipe scenario", { exact: true })).toBeVisible(); await expect(page.getByLabel("Ti2AlN recipe (2) scenario", { exact: true })).toBeVisible(); await expect(page.getByLabel("Ti2AlN recipe (3) scenario", { exact: true })).toBeVisible();
});

test("COMPARE-GENERAL-001 imports and calculates recipes with different targets", async ({ page }) => {
  await page.getByRole("button", { name: "Save", exact: true }).click(); await expect(page.getByText(/Saved Ti2AlN recipe/)).toBeVisible(); await page.getByRole("button", { name: "New", exact: true }).click(); await chooseExample(page, "ti3alc2"); await page.getByRole("button", { name: "Save", exact: true }).click(); await expect(page.getByText(/Saved Ti3AlC2 recipe/)).toBeVisible();
  await openCompare(page); await page.locator("header").getByRole("button", { name: "Add saved recipes" }).click(); const picker = page.getByRole("dialog", { name: "Add saved recipes" }); await picker.getByRole("button", { name: "Select all visible" }).click(); await picker.getByRole("button", { name: "Add selected" }).click();
  await expect(picker).not.toBeVisible(); await expect(page.locator('section[aria-label$=" scenario"]')).toHaveCount(2); await expect(page.getByLabel("Ti2AlN recipe scenario", { exact: true })).toContainText("Final total"); await expect(page.getByLabel("Ti3AlC2 recipe scenario", { exact: true })).toContainText("Final total");
  await page.getByLabel("Comparison name").fill("Mixed target comparison"); await page.getByRole("button", { name: "Save comparison" }).click(); await expect(page.getByText("Comparison saved", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Calculator" }).click(); await openCompare(page); await page.getByLabel("Open saved comparison").selectOption({ label: "Mixed target comparison" });
  await expect(page.getByLabel("Ti2AlN recipe scenario", { exact: true })).toContainText("Final total"); await expect(page.getByLabel("Ti3AlC2 recipe scenario", { exact: true })).toContainText("Final total");
});
