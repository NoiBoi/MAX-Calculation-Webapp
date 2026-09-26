import { expect, test } from "@playwright/test";

test("opens the XRD guide and returns to the workspace", async ({ page }) => {
  await page.goto("/xrd");

  await expect(page.getByRole("link", { name: "Guide", exact: true })).toBeVisible();
  await expect(page.getByText(/Stage 1/)).toHaveCount(0);

  await page.getByRole("link", { name: "Guide", exact: true }).click();
  await expect(page).toHaveURL(/\/xrd\/guide$/);
  await expect(page.getByRole("heading", { name: "XRD analysis guide" })).toBeVisible();
  await expect(page.getByText(/Import.*Process.*Peaks.*Reference.*Match.*Lattice.*Export/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "What MAXCalc does not do" })).toBeVisible();
  await expect(page.getByText(/does not perform Rietveld refinement/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Methods and software" })).toBeVisible();
  await expect(page.getByText("LMFit pseudo-Voigt models")).toBeVisible();

  await page.getByRole("link", { name: "Back to XRD workspace" }).click();
  await expect(page).toHaveURL(/\/xrd$/);
  await expect(page.getByRole("navigation", { name: "XRD workspace areas" })).toBeVisible();
});
