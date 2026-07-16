import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function ready(page: Page) { await page.goto("/workspace"); await expect(page.locator('[data-recovery-ready="true"]')).toHaveAttribute("data-recovery-ready", "true"); }
async function appearance(page: Page, name: "Light" | "Dark" | "Midnight" | "Use system setting") { await page.getByRole("button", { name: "Open appearance menu" }).click(); await page.getByRole("menuitemradio", { name }).click(); }
async function example(page: Page) { await page.getByRole("button", { name: /More actions/ }).click(); await page.getByLabel("Start or reset").selectOption("ti3alc2"); }

test("THEME-PALETTE-001 Dark uses neutral charcoal surfaces", async ({ page }) => {
  await ready(page); await appearance(page, "Dark"); await example(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark"); await expect(page.locator("body")).toHaveCSS("background-color", "rgb(24, 26, 29)");
  await expect(page.getByRole("region", { name: "Target and precursor route" })).toHaveCSS("background-color", "rgb(32, 34, 38)"); await expect(page.getByLabel("Target formula")).toHaveCSS("background-color", "rgb(28, 30, 34)");
  const rgb = await page.locator("body").evaluate((element) => getComputedStyle(element).backgroundColor.match(/\d+/g)!.map(Number)); expect(Math.max(...rgb) - Math.min(...rgb)).toBeLessThanOrEqual(5);
});

test("MIDNIGHT-001 is Discord-style black, subdued, persistent, and readable", async ({ page }) => {
  await ready(page); await appearance(page, "Midnight"); await example(page); await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(0, 0, 0)"); const panel = page.getByRole("region", { name: "Target and precursor route" }); await expect(panel).toHaveCSS("background-color", "rgb(5, 5, 5)"); await expect(page.getByLabel("Target formula")).toHaveCSS("background-color", "rgb(2, 2, 2)");
  await expect(page.getByRole("table", { name: /Final gross weighing masses/ }).locator(".text-xl, .text-2xl").first()).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" }); await expect(page.locator("html")).toHaveAttribute("data-theme", "midnight"); await expect(page.locator("html")).toHaveAttribute("data-theme-preference", "midnight");
  const audit = await new AxeBuilder({ page }).analyze(); expect(audit.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
});

test("THEME-SWITCH-001 exposes four distinct choices without changing results", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" }); await ready(page); await example(page); const total = await page.getByText(/Final rounded total/).locator("..").innerText();
  for (const [name, theme] of [["Light", "light"], ["Dark", "dark"], ["Midnight", "midnight"], ["Use system setting", "dark"]] as const) { await appearance(page, name); await expect(page.locator("html")).toHaveAttribute("data-theme", theme); expect(await page.getByText(/Final rounded total/).locator("..").innerText()).toBe(total); }
  await expect(page.locator("html")).toHaveAttribute("data-theme-preference", "system");
});

test("creator credit is consistent on screen and the fixed site instance is excluded from print", async ({ page }) => {
  await ready(page); const credit = page.getByRole("contentinfo"); await expect(credit).toContainText("Built by Matthew Deng"); await expect(credit).toContainText("deng301@purdue.edu for inquiries"); await expect(credit).toContainText("Built for the Anasori Lab"); await expect(credit.getByRole("link", { name: "deng301@purdue.edu for inquiries" })).toHaveAttribute("href", "mailto:deng301@purdue.edu");
  for (const name of ["Light", "Dark", "Midnight"] as const) { await appearance(page, name); await expect(credit).toBeVisible(); }
  await page.emulateMedia({ media: "print" }); await expect(credit).toBeHidden();
});

test("BRAND-001 uses the transparent logo in site chrome and the opaque logo as the tab icon", async ({ page }) => {
  await ready(page); const brand = page.getByRole("link", { name: "MAX Stoich calculator" }); const logo = brand.locator("img.site-logo"); await expect(logo).toHaveAttribute("src", "/brand/max-stoich-logo.svg"); const icon = page.locator('link[rel="icon"]'); await expect(icon).toHaveAttribute("href", /\/icon\.svg/);
  const transparentAsset = await page.request.get("/brand/max-stoich-logo.svg"); const opaqueAsset = await page.request.get("/icon.svg"); expect(transparentAsset.ok()).toBe(true); expect(opaqueAsset.ok()).toBe(true); expect(await transparentAsset.text()).not.toContain('<path fill="#ffffff" d="m-0.001312336 107.871155'); expect(await opaqueAsset.text()).toContain('<path fill="#ffffff" d="m-0.001312336 107.871155');
  await appearance(page, "Light"); await expect(logo).toHaveCSS("filter", "none"); await appearance(page, "Dark"); await expect(logo).toHaveCSS("filter", "invert(1)"); await appearance(page, "Midnight"); await expect(logo).toHaveCSS("filter", "invert(1)");
});
