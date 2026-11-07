import { expect, test } from "@playwright/test";

test("blank purity is identified as assumed without changing the weighing calculation", async ({ page }) => {
  await page.goto("/workspace");
  await expect(page.getByRole("button", { name: "Load Ti₃AlC₂ example" })).toBeVisible();
  await page.getByRole("button", { name: "Load Ti₃AlC₂ example" }).click();
  const table = page.getByRole("table", { name: "Final gross weighing masses" });
  const before = await table.getByRole("row", { name: /Final rounded total/ }).innerText();
  await page.getByLabel("Purity (%), precursor 1", { exact: true }).fill("");
  await expect(table.getByRole("row", { name: /^Ti Ti/ })).toContainText("100%Assumed");
  expect(await table.getByRole("row", { name: /Final rounded total/ }).innerText()).toBe(before);
  await page.getByRole("button", { name: "View weighing summary" }).click();
  await expect(page.getByRole("dialog").getByRole("row", { name: /^Ti Ti/ })).toContainText("Assumed");
  await page.keyboard.press("Escape");
  await page.getByLabel("Purity (%), precursor 1", { exact: true }).fill("99.5");
  await expect(table.getByRole("row", { name: /^Ti Ti/ })).not.toContainText("Assumed");
  expect(await table.getByRole("row", { name: /Final rounded total/ }).innerText()).not.toBe(before);
  await page.getByLabel("Target formula", { exact: true }).fill("Ti(");
  await page.getByLabel("Purity (%), precursor 1", { exact: true }).fill("");
  await expect(table.getByRole("row", { name: /^Ti Ti/ })).toContainText("99.5%");
  await expect(table.getByRole("row", { name: /^Ti Ti/ })).not.toContainText("Assumed");
});

test("EMI save failure is actionable and a subsequent save can succeed", async ({ page }) => {
  await page.addInitScript(() => {
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof transaction>) {
      if (sessionStorage.getItem("fail-next-save") === "true" && args[1] === "readwrite") {
        throw new DOMException("Storage is full. Free space and try again.", "QuotaExceededError");
      }
      return transaction.apply(this, args);
    };
  });
  await page.goto("/emi");
  await page.getByLabel("Project name", { exact: true }).fill("Retryable project");
  await page.evaluate(() => sessionStorage.setItem("fail-next-save", "true"));
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText(/Project save failed:.*Storage is full/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save project", exact: true })).toBeEnabled();
  await page.evaluate(() => sessionStorage.removeItem("fail-next-save"));
  await page.getByRole("button", { name: "Save project", exact: true }).click();
  await expect(page.getByText("Saved Retryable project locally.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("option", { name: /Retryable project/ })).toHaveCount(1);
});

test("XRD import communicates processing and preserves input after a service failure", async ({ page }) => {
  let finish: () => void = () => undefined;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  await page.route("**/api/xrd/data/parse", async (route) => {
    await pending;
    await route.fulfill({ status: 503, json: { error: { message: "Scientific service unavailable. Try again." } } });
  });
  await page.goto("/xrd");
  await page.getByLabel("Choose experimental XRD file").setInputFiles({ name: "measurement.xy", mimeType: "text/plain", buffer: Buffer.from("10 100\n11 200\n") });
  await expect(page.getByRole("button", { name: "Processing…" })).toBeDisabled();
  await expect(page.getByText("Reading measurement…", { exact: true })).toBeVisible();
  finish();
  await expect(page.getByText("Scientific service unavailable. Try again.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose file", exact: true })).toBeEnabled();
  expect(await page.getByLabel("Choose experimental XRD file").evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe("measurement.xy");
});
