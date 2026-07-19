import { expect, test, type Page } from "@playwright/test";

async function chooseAppearance(page: Page, name: "Light" | "Dark" | "Midnight") {
  await page.getByRole("button", { name: "Open appearance menu" }).click();
  await page.getByRole("menuitemradio", { name }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", name.toLowerCase());
  await page.waitForTimeout(200);
}

async function rootFontSize(page: Page) {
  return page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize));
}

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

test("DISPLAY-2K-001 scales calculator, comparison, and Settings without overflow", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/workspace");
  await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible();
  const desktopFont = await rootFontSize(page);
  const desktopControl = await page.getByLabel("Target formula").evaluate((element) => element.getBoundingClientRect().height);

  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.reload();
  await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible();
  expect(await rootFontSize(page)).toBeGreaterThan(desktopFont);
  expect(await page.getByLabel("Target formula").evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(desktopControl);
  await noHorizontalOverflow(page);

  await page.goto("/compare");
  await page.getByRole("toolbar", { name: "Comparison page actions" }).getByRole("button", { name: "Add blank scenario" }).click();
  await page.getByLabel("Blank scenario scenario", { exact: true }).getByRole("button", { name: "Duplicate" }).click();
  const cards = page.locator('[aria-label$=" scenario"]');
  await expect(cards).toHaveCount(2);
  expect(await cards.first().evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(800);
  await page.screenshot({ path: testInfo.outputPath("comparison-2k.png"), fullPage: true });
  await noHorizontalOverflow(page);

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Local user settings" })).toBeVisible();
  expect(await page.getByRole("combobox", { name: "Appearance" }).evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThan(41);
  await noHorizontalOverflow(page);
});

test("DISPLAY-4K-001 uses larger tokens and bounded meaningful layouts", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await page.goto("/workspace");
  await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible();
  expect(await rootFontSize(page)).toBeGreaterThanOrEqual(17.5);
  const workspaceWidth = await page.locator("main > [data-layout]").evaluate((element) => element.getBoundingClientRect().width);
  expect(workspaceWidth).toBeGreaterThan(2200);
  expect(workspaceWidth).toBeLessThanOrEqual(2701);
  expect(await page.locator("main").evaluate((element) => getComputedStyle(element).transform)).toBe("none");
  await noHorizontalOverflow(page);

  await page.goto("/settings");
  const settingsWidth = await page.locator("main > header + div").evaluate((element) => element.getBoundingClientRect().width);
  expect(settingsWidth).toBeGreaterThan(2000);
  expect(settingsWidth).toBeLessThanOrEqual(2401);
  await page.screenshot({ path: testInfo.outputPath("settings-4k.png"), fullPage: true });
  await noHorizontalOverflow(page);
});

test("LOGO-THEME-001 keeps branding consistent and hydration clean across routes", async ({ page }) => {
  const hydrationErrors: string[] = [];
  page.on("console", (message) => { if (/hydrated|hydration|did not match|server rendered/i.test(message.text())) hydrationErrors.push(message.text()); });
  await page.setViewportSize({ width: 1920, height: 1080 });
  for (const theme of ["Light", "Dark", "Midnight"] as const) {
    await page.goto("/workspace");
    await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible();
    await chooseAppearance(page, theme);
    const calculatorLogo = page.locator(".site-logo").first();
    await expect(calculatorLogo).toBeVisible();
    expect(await calculatorLogo.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThanOrEqual(31);
    const calculatorFilter = await calculatorLogo.evaluate((element) => getComputedStyle(element).filter);

    await page.goto("/compare");
    const comparisonLogo = page.locator(".site-logo").first();
    await expect(comparisonLogo).toBeVisible();
    expect(await comparisonLogo.evaluate((element) => getComputedStyle(element).filter)).toBe(calculatorFilter);

    await page.goto("/settings");
    const settingsLogo = page.locator(".site-logo").first();
    await expect(settingsLogo).toBeVisible();
    expect(await settingsLogo.evaluate((element) => getComputedStyle(element).filter)).toBe(calculatorFilter);
  }
  expect(hydrationErrors).toEqual([]);
});

test("COMPARE-POLISH-001 exposes grouped actions and distinct comparison views", async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("/compare");
  await expect(page.getByRole("heading", { name: "No recipes selected for comparison" })).toBeVisible();
  await expect(page.locator(".comparison-primary-actions")).toContainText("Add saved recipes");
  await expect(page.locator(".comparison-secondary-actions")).toContainText("Add blank scenario");
  await page.getByRole("toolbar", { name: "Comparison page actions" }).getByRole("button", { name: "Add blank scenario" }).click();
  await page.getByLabel("Blank scenario scenario", { exact: true }).getByRole("button", { name: "Duplicate" }).click();
  const views = page.getByRole("group", { name: "Comparison view" });
  for (const name of ["Summary metrics", "Difference table", "Precursor matrix", "Recipe cards"]) {
    await views.getByRole("button", { name }).click();
    await expect(views.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
  }
  await expect(page.getByRole("group", { name: "Comparison detail mode" }).getByRole("button", { name: "Standard" })).toHaveAttribute("aria-pressed", "true");
});
