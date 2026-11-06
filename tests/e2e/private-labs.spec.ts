import { expect, test } from "@playwright/test";

test("private lab library requires authentication without blocking the local calculator", async ({ page }) => {
  await page.goto("/labs");
  await expect(page.getByRole("heading", { name: "Private lab libraries" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sign in to access your lab libraries" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?next=/labs");
  await page.goto("/workspace");
  await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible();
});

test("invitation acceptance explains the secure authorization checks", async ({ page }) => {
  await page.goto("/labs/invitations/accept?token=test-token");
  await expect(page.getByRole("heading", { name: "Lab invitation" })).toBeVisible();
  await expect(page.getByText(/Sign in with the email address on the invitation/)).toBeVisible();
  await expect(page.getByText(/Use a valid link before it expires/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Accept invitation" })).toBeVisible();
});
