import { expect, test, type Page } from "@playwright/test";

async function chooseAppearance(page: Page, name: "Light" | "Dark" | "Midnight") {
  await page.getByRole("button", { name: "Open appearance menu" }).click();
  await page.getByRole("menuitemradio", { name }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", name.toLowerCase());
}

async function appGeometry(page: Page) {
  const header = page.getByRole("banner");
  const logo = header.getByRole("img", { name: "MAXCalc logo" });
  await expect(header).toBeVisible();
  await expect(logo).toBeVisible();
  return {
    header: await header.boundingBox(),
    logo: await logo.boundingBox(),
  };
}

test("POLISH-001 keeps header and logo geometry stable across routes", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const routes = ["/workspace", "/compare", "/settings", "/account", "/labs", "/demo"];
  const geometries = [];
  for (const route of routes) {
    await page.goto(route);
    if (route === "/workspace") await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible();
    geometries.push(await appGeometry(page));
    await expect(page.getByRole("banner").getByText("MAXCalc", { exact: true })).toBeVisible();
  }
  const [baseline] = geometries;
  expect(baseline?.header).toBeTruthy();
  expect(baseline?.logo).toBeTruthy();
  for (const geometry of geometries.slice(1)) {
    expect(Math.abs(geometry.header!.height - baseline!.header!.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.logo!.x - baseline!.logo!.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.logo!.y - baseline!.logo!.y)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.logo!.width - baseline!.logo!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(geometry.logo!.height - baseline!.logo!.height)).toBeLessThanOrEqual(1);
  }
});

test("POLISH-002 target batch compound input has one themed border and coherent focus", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto("/workspace");
  await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible();
  const input = page.getByLabel("Target batch mass");
  for (const theme of ["Light", "Dark", "Midnight"] as const) {
    await chooseAppearance(page, theme);
    const resting = await input.evaluate((element) => {
      const wrapper = element.parentElement!;
      const unit = wrapper.lastElementChild!;
      const wrapperStyle = getComputedStyle(wrapper);
      const inputStyle = getComputedStyle(element);
      const unitStyle = getComputedStyle(unit);
      return {
        edges: [wrapperStyle.borderTopColor, wrapperStyle.borderRightColor, wrapperStyle.borderBottomColor, wrapperStyle.borderLeftColor],
        inputBorders: [inputStyle.borderTopWidth, inputStyle.borderRightWidth, inputStyle.borderBottomWidth, inputStyle.borderLeftWidth],
        unitBorders: [unitStyle.borderTopWidth, unitStyle.borderRightWidth, unitStyle.borderBottomWidth, unitStyle.borderLeftWidth],
      };
    });
    expect(new Set(resting.edges).size).toBe(1);
    expect(resting.inputBorders).toEqual(["0px", "0px", "0px", "0px"]);
    expect(resting.unitBorders).toEqual(["0px", "0px", "0px", "1px"]);
    await input.focus();
    expect(await input.evaluate((element) => getComputedStyle(element.parentElement!).boxShadow)).not.toBe("none");
    await input.fill("0");
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await input.fill("10.000");
    await expect(input).toHaveAttribute("aria-invalid", "false");
    await input.evaluate((element) => { (element as HTMLInputElement).disabled = true; });
    expect(await input.evaluate((element) => Number.parseFloat(getComputedStyle(element.parentElement!).opacity))).toBeLessThan(1);
    await input.evaluate((element) => { (element as HTMLInputElement).disabled = false; });
  }
  await page.screenshot({ path: testInfo.outputPath("target-batch-compound-input.png"), fullPage: false });
});

test("POLISH-003 comparison empty state and page actions stay aligned", async ({ page }, testInfo) => {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 2560, height: 1440 }, { width: 3840, height: 2160 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/compare");
    const empty = page.getByRole("heading", { name: "No recipes selected for comparison" }).locator("..");
    await expect(empty).toBeVisible();
    const actions = page.getByRole("toolbar", { name: "Comparison page actions" });
    await expect(actions.getByRole("button", { name: "Add saved recipes" })).toBeVisible();
    const heights = await actions.getByRole("button").evaluateAll((buttons) => buttons.filter((button) => getComputedStyle(button).display !== "none").map((button) => button.getBoundingClientRect().height));
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
  await page.screenshot({ path: testInfo.outputPath("comparison-empty-4k.png"), fullPage: true });
});

test("POLISH-004 four comparison scenarios align and wrap without overlap", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto("/compare");
  await page.getByRole("toolbar", { name: "Comparison page actions" }).getByRole("button", { name: "Add blank scenario" }).click();
  for (let index = 1; index < 4; index += 1) {
    await page.getByRole("region", { name: /scenario$/ }).first().getByRole("button", { name: "Duplicate" }).click();
  }
  const cards = page.getByRole("region", { name: /scenario$/ });
  await expect(cards).toHaveCount(4);
  const geometry = await cards.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, padding: getComputedStyle(element).padding };
  }));
  expect(new Set(geometry.map((item) => item.padding)).size).toBe(1);
  expect(geometry.some((item, index) => geometry.slice(index + 1).some((other) => item.left < other.right && item.right > other.left && item.top < other.bottom && item.bottom > other.top))).toBe(false);
  for (const card of await cards.all()) {
    const actions = card.getByRole("group", { name: /scenario actions$/ });
    const heights = await actions.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height));
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 900, height: 900 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("comparison-four-scenarios-narrow.png"), fullPage: true });
});

test("POLISH-005 exposes MAXCalc branding and preserves print identity", async ({ page }) => {
  await page.context().addInitScript(() => { window.print = () => undefined; });
  for (const route of ["/workspace", "/compare", "/settings", "/login", "/account", "/labs", "/demo", "/materials", "/recipes"]) {
    await page.goto(route);
    await expect(page.getByRole("banner").getByText("MAXCalc", { exact: true })).toBeVisible();
    await expect(page.getByText("MAX Stoich", { exact: true })).toHaveCount(0);
    await expect(page).toHaveTitle(/MAXCalc/);
  }
  await page.goto("/workspace");
  await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible();
  await page.getByRole("button", { name: /More actions/ }).click();
  await page.getByLabel("Start or reset").selectOption("ti2aln");
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Print", exact: true }).click();
  const printPage = await popupPromise;
  await expect(printPage.getByText("MAXCalc", { exact: true })).toBeVisible();
  await expect(printPage.getByText("MAX Stoich", { exact: true })).toHaveCount(0);
  await printPage.close();
});

test("POLISH-006 comparison commands stay outside the app header and never overlap", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1574, height: 927 });
  await page.goto("/compare");
  const header = page.getByRole("banner");
  const toolbar = page.getByRole("toolbar", { name: "Comparison page actions" });
  const mode = page.getByRole("group", { name: "Comparison detail mode" });
  await expect(toolbar).toBeVisible();
  await expect(mode).toBeVisible();
  await expect(header.getByRole("toolbar", { name: "Comparison page actions" })).toHaveCount(0);
  await expect(header.getByRole("group", { name: "Comparison detail mode" })).toBeVisible();
  const visibleControls = await toolbar.getByRole("button").all();
  const boxes = (await Promise.all(visibleControls.map(async (control) => {
    if (!await control.isVisible()) return null;
    return control.boundingBox();
  }))).filter((box): box is NonNullable<typeof box> => Boolean(box));
  expect(boxes.some((box, index) => boxes.slice(index + 1).some((other) =>
    box.x < other.x + other.width
    && box.x + box.width > other.x
    && box.y < other.y + other.height
    && box.y + box.height > other.y
  ))).toBe(false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: testInfo.outputPath("comparison-command-bar-1574.png"), fullPage: false });
});

test("POLISH-008 calculator and comparison keep detail mode in the same stable header slot", async ({ page }, testInfo) => {
  for (const viewport of [{ width: 1280, height: 800 }, { width: 1574, height: 927 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    const routeGeometry = [];
    for (const route of ["/workspace", "/compare"]) {
      await page.goto(route);
      if (route === "/workspace") await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible();
      const header = page.getByRole("banner");
      const mode = route === "/workspace"
        ? header.getByRole("group", { name: "Interaction mode" })
        : header.getByRole("group", { name: "Comparison detail mode" });
      const globalActions = header.locator(".app-header-global-actions");
      await expect(mode).toBeVisible();
      await expect(mode.getByRole("button", { name: "Standard" })).toBeVisible();
      await expect(mode.getByRole("button", { name: "Advanced" })).toBeVisible();
      const modeBox = await mode.boundingBox();
      const globalBox = await globalActions.boundingBox();
      expect(modeBox).toBeTruthy();
      expect(globalBox).toBeTruthy();
      expect(modeBox!.width).toBeGreaterThan(140);
      expect(modeBox!.x + modeBox!.width).toBeLessThanOrEqual(globalBox!.x);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
      routeGeometry.push({ mode: modeBox!, global: globalBox! });
    }
    expect(Math.abs(routeGeometry[0]!.mode.height - routeGeometry[1]!.mode.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(routeGeometry[0]!.global.x - routeGeometry[1]!.global.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(routeGeometry[0]!.global.width - routeGeometry[1]!.global.width)).toBeLessThanOrEqual(1);
  }
  await page.goto("/compare");
  await page.screenshot({ path: testInfo.outputPath("cross-route-header-alignment.png"), fullPage: false });
});

test("POLISH-009 route navigation stays in the header while workflow bars remain inset and compact", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  for (const route of ["/workspace", "/compare"]) {
    await page.goto(route);
    if (route === "/workspace") await expect(page.locator('[data-recovery-ready="true"]')).toBeVisible();
    const header = page.getByRole("banner");
    const toolbar = route === "/workspace"
      ? page.getByRole("toolbar", { name: "Calculator page actions" })
      : page.getByRole("toolbar", { name: "Comparison page actions" });
    await expect(header.getByRole("link", { name: "Compare" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Settings" })).toBeVisible();
    await expect(header.getByText(/^More/)).toBeVisible();
    await expect(toolbar.getByRole("link", { name: "Compare" })).toHaveCount(0);
    await expect(toolbar.getByRole("link", { name: "Settings" })).toHaveCount(0);
    await expect(toolbar.getByText("More", { exact: true })).toHaveCount(0);
    const toolbarBox = await toolbar.boundingBox();
    const firstControl = toolbar.locator("button, a").first();
    const firstBox = await firstControl.boundingBox();
    expect(toolbarBox).toBeTruthy();
    expect(firstBox).toBeTruthy();
    expect(toolbarBox!.x).toBeGreaterThanOrEqual(16);
    expect(firstBox!.x).toBeGreaterThanOrEqual(20);
    expect(firstBox!.height).toBeLessThan(36);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});

test("POLISH-007 neutral outlines resolve through semantic border tokens", async ({ page }) => {
  await page.setViewportSize({ width: 1574, height: 927 });
  await page.goto("/compare");
  await page.getByRole("toolbar", { name: "Comparison page actions" }).getByRole("button", { name: "Add blank scenario" }).click();
  for (const theme of ["Light", "Dark", "Midnight"] as const) {
    await chooseAppearance(page, theme);
    const colors = await page.evaluate(() => {
      const comparisonName = document.querySelector<HTMLInputElement>('[aria-label="Comparison identity"] input')!;
      const analysis = document.querySelector<HTMLElement>('[aria-label="Comparison analysis controls"]');
      const copyButton = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Copy overview");
      const referenceButton = [...document.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Add current recipe");
      const header = document.querySelector<HTMLElement>('[data-component="app-header"]')!;
      const root = getComputedStyle(document.documentElement);
      return {
        expectedDefault: referenceButton ? getComputedStyle(referenceButton).borderTopColor : "",
        expectedSubtle: getComputedStyle(header).borderBottomColor,
        strongToken: root.getPropertyValue("--border-strong").trim(),
        textToken: root.getPropertyValue("--text-primary").trim(),
        input: getComputedStyle(comparisonName).borderTopColor,
        panel: analysis ? getComputedStyle(analysis).borderBottomColor : "",
        button: copyButton ? getComputedStyle(copyButton).borderTopColor : "",
      };
    });
    expect(colors.input).toBe(colors.expectedDefault);
    expect(colors.panel).toBe(colors.expectedSubtle);
    expect(colors.button).toBe(colors.expectedDefault);
    expect(colors.strongToken).not.toBe(colors.textToken);
  }
});
