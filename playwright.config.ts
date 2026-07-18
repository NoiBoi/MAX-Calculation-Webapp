import { defineConfig, devices } from "@playwright/test";
import { resolveTestTarget } from "./lib/release/test-target";

const target = resolveTestTarget(process.env);
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }], ["json", { outputFile: "test-results/playwright-results.json" }]],
  use: {
    baseURL: target.baseUrl,
    trace: "on-first-retry",
  },
  webServer: target.environment === "local" ? {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
  } : undefined,
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
