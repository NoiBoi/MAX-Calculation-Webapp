import { expect, test } from "@playwright/test";

const exerciseUnconfiguredCloud = process.env.TEST_CLOUD_UNCONFIGURED === "true";

test("AUTH-004 missing cloud configuration preserves the local calculator", async ({ page }) => {
  test.skip(!exerciseUnconfiguredCloud, "Set TEST_CLOUD_UNCONFIGURED=true and launch the application without Supabase variables.");
  await page.goto("/workspace");
  await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible();
  const controls = await page.evaluate(() => {
    const account = document.querySelector<HTMLElement>(".account-control");
    const more = document.querySelector<HTMLElement>('[aria-label="More actions and commands"]');
    if (!account || !more) return null;
    return { account: account.getBoundingClientRect().toJSON(), more: more.getBoundingClientRect().toJSON() };
  });
  expect(controls).not.toBeNull();
  expect(controls!.more.right).toBeLessThanOrEqual(controls!.account.left);
  await expect(page.getByRole("link", { name: "Cloud setup" })).toBeVisible();
  await page.getByRole("link", { name: "Cloud setup" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sign in to MAXCalc" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Cloud accounts unavailable" })).toBeVisible();
  await expect(page.getByText(/calculator, local recipes, comparisons, notes, backups, recovery, and printing continue/i)).toBeVisible();
  await expect(page.getByText(/local application recovery/i)).toHaveCount(0);
  await page.getByRole("link", { name: "Calculator" }).click();
  await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible();
});

test("authentication routes remain usable and theme-stable without cloud configuration", async ({ page }) => {
  test.skip(!exerciseUnconfiguredCloud, "Set TEST_CLOUD_UNCONFIGURED=true and launch the application without Supabase variables.");
  await page.goto("/workspace");
  await page.getByRole("button", { name: "Open appearance menu" }).click();
  await page.getByRole("menuitemradio", { name: "Midnight" }).click();
  for (const path of ["/login", "/forgot-password", "/reset-password", "/signup", "/account", "/account/cloud-data"]) {
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
    await expect(page.getByRole("heading", { name: "Cloud accounts unavailable" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});
