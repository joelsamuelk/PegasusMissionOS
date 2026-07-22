import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for the critical user journeys. Runs against a local
 * production server. Chromium is provided by the environment
 * (PLAYWRIGHT_BROWSERS_PATH), so `playwright install` is not required here.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // The environment pins a Chromium build that may differ from the
        // Playwright package version; use the pre-installed binary directly
        // rather than downloading (which the sandbox blocks).
        launchOptions: process.env.PW_CHROMIUM_PATH
          ? { executablePath: process.env.PW_CHROMIUM_PATH }
          : {},
      },
    },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
