import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function ready(page: Page) { await page.goto("/workspace"); await expect(page.locator('[data-recovery-ready="true"]')).toHaveAttribute("data-recovery-ready", "true"); }
async function chooseAppearance(page: Page, name: "Light" | "Dark" | "Midnight" | "Use system setting") {
  await page.getByRole("button", { name: "Open appearance menu" }).click();
  await page.getByRole("menuitemradio", { name }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme-preference", name === "Use system setting" ? "system" : name.toLowerCase());
}

test("THEME-001 persists Dark before the primary workspace is shown and across routes", async ({ page }) => {
  const hydrationMessages: string[] = []; page.on("console", (message) => { if (/hydration|did not match|server rendered/i.test(message.text())) hydrationMessages.push(message.text()); });
  await ready(page); await chooseAppearance(page, "Dark"); await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload({ waitUntil: "commit" }); expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe("dark"); await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible();
  for (const route of ["/compare", "/settings", "/demo", "/workspace"]) { await page.goto(route); await expect(page.locator("html")).toHaveAttribute("data-theme", "dark"); } expect(hydrationMessages).toEqual([]);
});

test("THEME-002 System follows OS changes while explicit choices ignore them", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" }); await ready(page); await chooseAppearance(page, "Use system setting"); await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" }); await expect(page.locator("html")).toHaveAttribute("data-theme", "dark"); await expect(page.locator("html")).toHaveAttribute("data-theme-preference", "system");
  await chooseAppearance(page, "Light"); await page.emulateMedia({ colorScheme: "dark" }); await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("THEME-003 compact control, panels, dialogs, trace, and settings share Dark theme", async ({ page }) => {
  await ready(page); await chooseAppearance(page, "Dark");
  const toggle = page.getByRole("button", { name: /Change appearance/ }); await expect(toggle).toHaveAttribute("title", "Change appearance");
  await page.getByRole("button", { name: /More actions/ }).click(); await expect(page.getByRole("region", { name: "More actions" })).toHaveCSS("background-color", "rgb(32, 34, 38)");
  await page.getByLabel("Start or reset").selectOption("ti2aln"); await page.getByRole("button", { name: "Save", exact: true }).click(); await expect(page.getByRole("dialog", { name: "Save recipe" })).toHaveCSS("color-scheme", "dark"); await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Open calculation trace" }).click(); await expect(page.getByRole("region", { name: "Calculation details", exact: true })).toBeVisible();
  await page.goto("/settings"); await expect(page.getByRole("combobox", { name: "Appearance" })).toHaveValue("dark");
});

test("THEME-004 changes presentation without changing scientific values or exports", async ({ page }) => {
  await ready(page); await page.getByRole("button", { name: /More actions/ }).click(); await page.getByLabel("Start or reset").selectOption("ti3alc2");
  const total = page.getByText(/Final rounded total/).locator("..").innerText(); const csv = page.getByRole("button", { name: "CSV" }); await expect(csv).toBeEnabled();
  await chooseAppearance(page, "Dark"); expect(await page.getByText(/Final rounded total/).locator("..").innerText()).toBe(await total); await expect(page.getByRole("table", { name: /Final gross weighing masses/ })).toHaveCSS("color-scheme", "dark");
  await expect(page.getByText(/Unsaved/).first()).toBeVisible();
});

test("THEME-005 dedicated print remains white in Dark mode", async ({ page }) => {
  await page.context().addInitScript(() => { window.print = () => undefined; });
  await ready(page); await page.getByRole("button", { name: /More actions/ }).click(); await page.getByLabel("Start or reset").selectOption("ti2aln"); await chooseAppearance(page, "Dark");
  const popupPromise = page.waitForEvent("popup"); await page.getByRole("button", { name: "Print" }).click(); const popup = await popupPromise; await expect(popup.locator(".dedicated-print-root")).toHaveCSS("background-color", "rgb(238, 242, 244)"); await expect(popup.locator(".print-page").first()).toHaveCSS("background-color", "rgb(255, 255, 255)"); await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("theme toggle is keyboard operable at a 200 percent equivalent viewport", async ({ page }) => {
  await page.setViewportSize({ width: 640, height: 720 }); await ready(page); const toggle = page.getByRole("button", { name: /Change appearance/ }); await toggle.focus(); await page.keyboard.press("Enter"); await expect(page.locator("html")).toHaveAttribute("data-theme", /light|dark/); await expect(toggle).toBeFocused();
});

test("Dark calculator and Settings have no serious accessibility violations", async ({ page }) => {
  await ready(page); await chooseAppearance(page, "Dark"); await page.getByRole("button", { name: /More actions/ }).click(); await page.getByLabel("Start or reset").selectOption("ti2aln");
  let audit = await new AxeBuilder({ page }).analyze(); expect(audit.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
  await page.goto("/settings"); await expect(page.getByRole("heading", { name: "Local user settings" })).toBeVisible(); audit = await new AxeBuilder({ page }).analyze(); expect(audit.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
});
