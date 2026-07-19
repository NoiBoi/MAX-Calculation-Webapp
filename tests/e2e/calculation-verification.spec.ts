import { expect, test, type Locator, type Page } from "@playwright/test";

async function ready(page: Page) {
  await page.goto("/workspace");
  await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: /More actions/ }).click();
  await page.getByLabel("Start or reset").selectOption("ti2aln");
}

async function openVerification(page: Page) {
  await page.getByRole("button", { name: "Verify calculations" }).click();
  const dialog = page.getByRole("dialog", { name: "Calculation verification" });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function firstVerified(locator: Locator) {
  expect(await locator.count()).toBeGreaterThan(0);
  return locator.nth(0);
}

async function exactTiValues(dialog: Locator) {
  const summary = await firstVerified(dialog.getByText("Atomic-weight contributions and exact values"));
  const text = await summary.locator("..").textContent();
  return {
    intended: Number(text?.match(/Intended moles: ([\d.eE+-]+)/)?.[1]),
    preRound: Number(text?.match(/Pre-round mass: ([\d.eE+-]+)/)?.[1]),
  };
}

test("VERIFY-001 audits precursor mole-to-mass and reverse conversion", async ({ page }) => {
  await ready(page);
  const dialog = await openVerification(page);
  const conversion = dialog.getByLabel(/conversion verification$/);
  await expect(dialog.getByRole("heading", { name: "1. Conversion verification" })).toBeVisible();
  await expect(await firstVerified(conversion.getByText("Ideal pure mass"))).toBeVisible();
  await expect(await firstVerified(conversion.getByText("Molar mass", { exact: true }))).toBeVisible();
  await expect(await firstVerified(conversion.getByText("Reverse verification"))).toBeVisible();
  const exactValues = await firstVerified(conversion.getByText("Atomic-weight contributions and exact values"));
  await expect(exactValues).toBeVisible();
  await exactValues.click();
  await expect(await firstVerified(dialog.getByText(/CIAAW/))).toBeVisible();
});

test("VERIFY-002 shows signed elemental reconciliation from final rounded masses", async ({ page }) => {
  await ready(page);
  await page.getByLabel("Balance increment").fill("0.1");
  const dialog = await openVerification(page);
  const table = dialog.getByRole("table", { name: /elemental reconciliation/i });
  await expect(table.getByRole("columnheader", { name: "Adjusted required mol" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Realized supplied mol" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Difference", exact: true })).toBeVisible();
  await expect(dialog.getByText(/Largest residual:/)).toBeVisible();
  await expect(await firstVerified(dialog.getByText(/excess|deficiency/))).toBeVisible();
});

test("VERIFY-003 keeps purity and loss correction stages separate", async ({ page }) => {
  await ready(page);
  await page.getByRole("group", { name: "Route row 1" }).getByLabel("Purity").fill("95");
  await page.getByLabel("Handling loss").fill("2");
  const dialog = await openVerification(page);
  await expect(await firstVerified(dialog.getByText("Purity correction"))).toBeVisible();
  await expect(await firstVerified(dialog.getByText("Handling loss"))).toBeVisible();
  await expect(await firstVerified(dialog.getByText(/× 0\.95 ÷/))).toBeVisible();
});

test("VERIFY-004 batch scaling preserves linear unrounded conversion values", async ({ page }) => {
  await ready(page);
  const values: Array<{ intended: number; preRound: number }> = [];
  for (const mass of ["5", "50", "500"]) {
    await page.getByLabel("Target batch mass").fill(mass);
    const dialog = await openVerification(page);
    values.push(await exactTiValues(dialog));
    await dialog.getByRole("button", { name: "Close" }).click();
  }
  expect(values[1]!.intended / values[0]!.intended).toBeCloseTo(10, 10);
  expect(values[2]!.intended / values[0]!.intended).toBeCloseTo(100, 10);
  expect(values[1]!.preRound / values[0]!.preRound).toBeCloseTo(10, 10);
  expect(values[2]!.preRound / values[0]!.preRound).toBeCloseTo(100, 10);
});

test("VERIFY-005 comparison verifies valid and invalid scenarios independently", async ({ page }) => {
  await ready(page);
  await page.goto("/compare");
  await page.getByRole("toolbar", { name: "Comparison page actions" }).getByRole("button", { name: "Add current recipe" }).click();
  await page.getByLabel("Unsaved calculation scenario", { exact: true }).getByRole("button", { name: "Duplicate" }).click();
  await page.getByRole("button", { name: "Verify calculations" }).click();
  let dialog = page.getByRole("dialog", { name: "Comparison calculation verification" });
  await expect(dialog.getByRole("heading", { name: "Comparison verification overview" })).toBeVisible();
  await expect(dialog.getByText("1. Conversion verification")).toHaveCount(2);
  await dialog.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Remove N from Copy of Unsaved calculation" }).click();
  await page.getByRole("button", { name: "Verify calculations" }).click();
  dialog = page.getByRole("dialog", { name: "Comparison calculation verification" });
  expect(await dialog.getByText("Verification unavailable", { exact: true }).count()).toBeGreaterThan(0);
  await expect(dialog.getByRole("heading", { name: "Unsaved calculation", exact: true })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "1. Conversion verification" })).toBeVisible();
});

test("VERIFY-006 prints compact verification on Letter and A4", async ({ page }) => {
  await ready(page);
  await openVerification(page);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("table", { name: "Compact precursor conversion verification" })).toBeVisible();
  await expect(page.getByRole("table", { name: /elemental reconciliation/i })).toBeVisible();
  await expect(page.getByText(/does not verify reaction yield/)).toBeVisible();
  expect((await page.pdf({ format: "Letter", printBackground: true })).byteLength).toBeGreaterThan(10_000);
  expect((await page.pdf({ format: "A4", printBackground: true })).byteLength).toBeGreaterThan(10_000);
});
