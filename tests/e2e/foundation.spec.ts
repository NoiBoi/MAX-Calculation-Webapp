import { expect, test } from "@playwright/test";

test("landing opens the one-screen laboratory calculator", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Scientific foundation in progress" })).toBeVisible();
  await page.getByRole("link", { name: "Open laboratory calculator" }).click();
  await expect(page.getByRole("heading", { name: "Target and precursor route" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Final weighing results" })).toBeVisible();
});

test("formula demonstration calculates and reports structured errors", async ({ page }) => {
  await page.goto("/");
  const formula = page.getByLabel("Chemical formula");
  await formula.fill("(Ti0.5Nb0.5)2AlN");
  await expect(page.getByText("181.762 g/mol")).toBeVisible();
  await formula.fill("Ti0Al");
  const demo = page.getByRole("region", { name: "Formula-engine demonstration" });
  await expect(demo.getByRole("alert")).toContainText("ZERO_COEFFICIENT");
  await expect(formula).toHaveValue("Ti0Al");
});

test("site demonstration switches templates and preserves invalid input with an inline error", async ({ page }) => {
  await page.goto("/");
  const demo = page.getByRole("region", { name: "Site-composition development demonstration" });
  await demo.getByLabel("MAX template").selectOption("312");
  await expect(demo.getByText("Ti3Al(C0.5N0.5)2")).toBeVisible();
  await demo.getByLabel("M Ti fraction").fill("0.8");
  await expect(demo.getByRole("alert")).toContainText("SITE_OCCUPANCY_NOT_NORMALIZED");
  await expect(demo.getByLabel("M Ti fraction")).toHaveValue("0.8");
});

test("balance-matrix demonstration shows exact structure and invalid input", async ({ page }) => {
  await page.goto("/");
  const demo = page.getByRole("region", { name: "Balance-matrix development demonstration" });
  await expect(demo.getByText("Rank: 3")).toBeVisible();
  await expect(demo.getByText("Constrained solver: exact-unique")).toBeVisible();
  await expect(demo.getByText(/mol precursor \/ mol target formula/)).toBeVisible();
  await expect(demo.getByRole("table", { name: "Required-element matrix A and vector b" })).toBeVisible();
  await demo.getByLabel("Precursors, one id=formula per line").fill("ti=Ti\nal=Al");
  await expect(demo.getByText(/MISSING_REQUIRED_ELEMENT_SOURCE/).first()).toBeVisible();
  await expect(demo.getByText(/infeasible-linear/)).toBeVisible();
  await demo.getByLabel("Target formula").fill("Ti(");
  await expect(demo.getByRole("alert")).toContainText("UNMATCHED_OPENING_PARENTHESIS");
});

test("batch calculator changes basis and reports final weighing masses", async ({ page }) => {
  await page.goto("/");
  const demo = page.getByRole("region", { name: "Batch recipe development calculator" });
  await expect(demo.getByRole("table", { name: "Final precursor weighing masses" })).toBeVisible();
  await expect(demo.getByText("Final weighing total:")).toBeVisible();
  await demo.getByLabel("Batch basis").selectOption("recovered-product-mass");
  await expect(demo.getByLabel("Expected yield (fraction)")).toBeVisible();
  await demo.getByLabel("Al purity (fraction)").fill("0");
  await expect(demo.getByRole("alert")).toContainText("INVALID_FRACTION");
});
