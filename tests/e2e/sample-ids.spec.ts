import { expect, test, type Page } from "@playwright/test";

async function samples(page: Page) {
  await page.getByRole("button", { name: /More actions and commands/ }).click();
  await page.getByRole("button", { name: "Sample IDs" }).click();
  return page.getByRole("dialog", { name: "Sample IDs" });
}

async function save(page: Page) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Save recipe" });
  await dialog.getByRole("button", { name: /Save recipe|Save revision/ }).click();
  await expect(dialog).toBeHidden();
}

test("registers distinct local IDs and prints the linked historical revision after reload", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await context.addInitScript(() => { window.print = () => undefined; });
  await page.goto("/workspace");
  await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: /More actions and commands/ }).click();
  await page.getByLabel("Start or reset").selectOption("ti2aln");
  await save(page);

  const dialog = await samples(page);
  const details = dialog.getByRole("region", { name: "Sample details" });
  const label = details.getByRole("heading");
  const register = dialog.getByRole("button", { name: "Register new sample" });
  await register.click();
  await expect(label).toHaveText(/^M-[0-9A-HJKMNP-TV-Z]{10}$/);
  const first = await label.innerText();
  await dialog.getByRole("button", { name: "Copy ID" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Sample ID copied.");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(first);
  await register.click();
  await expect(dialog.getByRole("list", { name: "IDs for this revision" }).getByRole("listitem")).toHaveCount(2);
  await expect(label).not.toHaveText(first);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /More actions and commands/ })).toBeFocused();

  await page.getByLabel("Target batch mass").fill("25");
  await save(page);
  await page.reload();
  await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible();
  await samples(page);
  await dialog.getByLabel("Find sample ID").fill(first.toLowerCase().replace("-", " "));
  await dialog.getByRole("button", { name: "Find", exact: true }).click();
  await expect(details).toContainText("revision 1");
  const popup = page.waitForEvent("popup");
  await details.getByRole("button", { name: "Print weighing sheet" }).click();
  const sheet = await popup;
  await expect(sheet.getByText(first, { exact: true })).toBeVisible();
  await expect(sheet.getByText("Saved revision 1", { exact: true })).toBeVisible();
  await expect(sheet.getByText("10.000 g", { exact: true }).first()).toBeVisible();
  await sheet.close();
});
