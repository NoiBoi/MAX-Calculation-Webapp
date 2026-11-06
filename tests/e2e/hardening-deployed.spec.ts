import { expect, test } from "@playwright/test";
import { resolveTestTarget } from "../../lib/release/test-target";

const target = resolveTestTarget(process.env);

test("HARDEN-DEPLOYED-001 public calculator and invitation-only authentication load safely", async ({ page }) => {
  test.skip(process.env.TEST_CLOUD_UNCONFIGURED === "true", "This check requires configured cloud authentication.");
  await page.goto("/workspace");
  await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible();
  await page.goto("/signup");
  await expect(page.getByText(/invitation-only/i)).toBeVisible();
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in to MAXCalc", exact: true })).toBeVisible();
});

test("HARDEN-DEPLOYED-002 protected account data is not publicly rendered or cached", async ({ page }) => {
  const response = await page.goto("/account/cloud-data");
  expect(response?.status()).toBe(200);
  if (process.env.TEST_CLOUD_UNCONFIGURED === "true") {
    await expect(page.getByRole("heading", { name: "Cloud accounts unavailable" })).toBeVisible();
  } else {
    await expect(page.getByText("Sign in to manage sync.")).toBeVisible();
  }
  const cacheControl = response?.headers()["cache-control"] ?? "";
  expect(cacheControl).not.toContain("public");
  expect(cacheControl.includes("no-store") || cacheControl.includes("no-cache")).toBe(true);
});

test("HARDEN-DEPLOYED-003 callback rejects missing authorization code and unsafe redirect", async ({ page }) => {
  await page.goto("/auth/callback?next=https://attacker.invalid/");
  await expect(page).toHaveURL(/\/auth\/error\?reason=invalid-callback$/);
});

test("destructive remote validation remains opt-in", () => {
  if (target.environment === "production") expect(target.destructiveTestsAllowed).toBe(false);
});
