import { expect, test, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/workspace");
  await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible();
}

async function chooseExample(page: Page) {
  await page.getByRole("button", { name: /More actions/ }).click();
  await page.getByLabel("Start or reset").selectOption("ti2aln");
}

async function corruptRecovery(page: Page) {
  await page.evaluate(async () => {
    const request = indexedDB.open("max-stoich-local");
    const database = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("recovery", "readwrite");
      transaction.objectStore("recovery").put({ id: "current", committedRecipe: null, mode: "broken" });
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
}

async function corruptSettings(page: Page) {
  await page.evaluate(async () => {
    const request = indexedDB.open("max-stoich-local");
    const database = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("userSettings", "readwrite");
      transaction.objectStore("userSettings").put({ id: "local-user-settings", schemaVersion: "999.0.0", appearance: "broken", updatedAt: new Date().toISOString() });
      transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  });
}

test("PRINT-PREVIEW-LIVE-001 uses the production print component and current unsaved settings", async ({ page }) => {
  await page.goto("/settings"); await expect(page.getByRole("heading", { name: "Local user settings" })).toBeVisible();
  const preview = page.locator(".print-settings-preview");
  await expect(preview.locator(".dedicated-print-root")).toHaveCount(1);
  await page.getByLabel("Orientation").selectOption("landscape"); await page.locator("label").filter({ hasText: "Recipes per page" }).locator("select").selectOption("4");
  await expect(preview.locator(".dedicated-print-root")).toHaveAttribute("data-orientation", "landscape");
  await expect(preview.locator(".dedicated-print-root")).toHaveAttribute("data-recipes-per-page", "4");
  const printedFields = page.getByRole("group", { name: "Printed fields" });
  await printedFields.getByLabel("Molar mass").check(); await printedFields.getByLabel("Elemental precursor atomic radius").check(); await printedFields.getByLabel("Prepared, checked, and batch ID lines").check();
  await expect(preview.getByRole("columnheader", { name: "Molar mass" }).first()).toBeVisible();
  await expect(preview.getByRole("columnheader", { name: "Atomic radius" }).first()).toBeVisible();
  await expect(preview.getByText("Prepared by", { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/US Letter · Landscape · 4 recipes per page · (comfortable|compact)/)).toBeVisible();
});

test("RECOVERY-RETRY-001 performs a real retry and repair enters the calculator", async ({ page }) => {
  await ready(page); await page.goto("/demo"); await corruptRecovery(page); await page.goto("/workspace");
  await expect(page.getByRole("heading", { name: "MAXCalc could not finish opening" })).toBeVisible();
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.getByRole("heading", { name: "MAXCalc could not finish opening" })).toBeVisible();
  await page.getByText("Technical details").click(); await expect(page.getByText("recovery-record-corrupt", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Repair local workspace" }).click();
  await expect(page.getByRole("heading", { name: "Target and precursor route" })).toBeVisible();
  await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible();
});

test("RECOVERY-SAFE-OPEN-001 preserves a saved recipe while skipping corrupt recovery", async ({ page }) => {
  await ready(page); await chooseExample(page);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Save recipe" });
  await dialog.getByLabel("Recipe name").fill("Preserved during safe open");
  await dialog.getByRole("button", { name: /Save recipe/ }).click(); await expect(dialog).not.toBeVisible();
  await page.goto("/demo"); await corruptRecovery(page); await page.goto("/workspace");
  await page.getByRole("button", { name: "Open without restoring workspace" }).click();
  await expect(page.getByLabel("Target formula")).toHaveValue("");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByLabel("Recipe name for Ti2AlN")).toHaveValue("Preserved during safe open");
});

test("RECOVERY-SETTINGS-001 corrupt settings do not crash or delete scientific records", async ({ page }) => {
  await ready(page); await chooseExample(page);
  await page.getByRole("button", { name: "Save", exact: true }).click(); const dialog = page.getByRole("dialog", { name: "Save recipe" }); await dialog.getByRole("button", { name: /Save recipe/ }).click(); await expect(dialog).not.toBeVisible();
  await page.goto("/demo"); await corruptSettings(page); await page.goto("/workspace");
  await expect(page.getByRole("heading", { name: "Target and precursor route" })).toBeVisible();
  await expect(page.getByText(/Settings record was unreadable and defaults are being used/)).toBeVisible();
  await page.getByRole("button", { name: "Open", exact: true }).click(); await expect(page.getByLabel("Recipe name for Ti2AlN")).toBeVisible();
});

test("COMPARE-ANALYSIS-001 supports baseline, normalization, sorting, hiding, export, and overview print", async ({ page }) => {
  await ready(page); await chooseExample(page); await page.getByRole("link", { name: "Compare", exact: true }).click();
  await page.getByRole("toolbar", { name: "Comparison page actions" }).getByRole("button", { name: "Add current recipe" }).click();
  const first = page.getByLabel("Unsaved calculation scenario", { exact: true }); await first.getByRole("button", { name: "Duplicate" }).click(); await first.getByRole("button", { name: "Duplicate" }).click();
  const names = page.locator('section[aria-label$=" scenario"] input[aria-label$=" name"]'); await names.nth(0).fill("Route C"); await names.nth(1).fill("Route A"); await names.nth(2).fill("Route B");
  await page.getByLabel("Baseline").selectOption({ label: "Route B" }); await page.getByRole("button", { name: "Difference table" }).click();
  await expect(page.getByRole("heading", { name: "Differences relative to baseline" })).toBeVisible(); await expect(page.getByText("Route B · Baseline")).toBeVisible();
  await page.getByLabel("Batch representation").selectOption("common-batch"); await page.getByLabel("Common target batch (g)").fill("5");
  await expect(page.getByText("Comparison-normalized to 5 g", { exact: false })).toBeVisible();
  await page.getByLabel("Scenario order").selectOption("name"); await page.getByRole("button", { name: "Summary metrics" }).click();
  const rows = page.getByRole("table").first().locator("tbody tr"); await expect(rows.nth(0)).toContainText("Route A");
  await page.getByLabel("Route A", { exact: true }).uncheck(); await expect(page.getByRole("table").first()).not.toContainText("Route A");
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "Export CSV" }).click(); await download;
  await page.getByLabel("Comparison print content").selectOption("overview-only");
  const popupPromise = page.waitForEvent("popup"); await page.getByRole("button", { name: "Print comparison" }).click(); const popup = await popupPromise;
  await expect(popup.getByRole("heading", { name: "Comparison overview" })).toBeVisible(); await expect(popup.locator(".print-recipe")).toHaveCount(0);
});
