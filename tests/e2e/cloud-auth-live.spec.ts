import { expect, test } from "@playwright/test";

const email = process.env.SUPABASE_TEST_EMAIL;
const password = process.env.SUPABASE_TEST_PASSWORD;

test.describe("live Supabase authentication", () => {
  test.skip(!email || !password, "Set SUPABASE_TEST_EMAIL and SUPABASE_TEST_PASSWORD to run AUTH-001 against a disposable account.");

  test("AUTH-001 sign in persists across refresh and application navigation", async ({ page }) => {
    await page.goto("/login?next=/workspace");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/workspace$/);
    await expect(page.locator(".account-button-label")).toBeVisible();
    await page.reload();
    await expect(page.locator(".account-button-label")).toBeVisible();
    for (const path of ["/compare", "/settings", "/account", "/workspace"]) {
      await page.goto(path);
      await expect(page.locator(".account-button-label")).toBeVisible();
    }
  });

  test("SYNC-001 automatic synchronization controls persist and manual retry remains available", async ({ page }) => {
    await page.goto("/login?next=/account/cloud-data");
    await page.getByLabel("Email").fill(email!);
    await page.getByLabel("Password", { exact: true }).fill(password!);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/account\/cloud-data$/);
    await expect(page.getByRole("heading", { name: "Automatic synchronization" })).toBeVisible();
    const automatic = page.getByLabel("Automatic sync", { exact: true });
    await expect(automatic).toBeChecked();
    await page.getByRole("button", { name: "Pause sync" }).click();
    await expect(page.getByRole("button", { name: "Resume sync" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Resume sync" })).toBeVisible();
    await page.getByRole("button", { name: "Resume sync" }).click();
    await expect(page.getByRole("button", { name: "Sync now" })).toBeEnabled();
  });
});
