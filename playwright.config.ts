import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

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
    baseURL,
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
    /**
     * The journeys exercise the seeded demo workspace, so the suite pins the
     * in-memory adapter rather than inheriting whatever the developer's
     * environment points at.
     *
     * Empty rather than unset, and this is the whole subtlety: Next.js loads
     * `.env` from disk and fills in any variable that is *not already
     * defined*, so `env -u` hands the variable straight back. An empty string
     * is defined, so it wins. Without this a machine with real credentials
     * runs the suite against Postgres with no session, and every dashboard
     * page fails with NotAuthenticatedError.
     *
     * `NEXT_PUBLIC_` values are inlined at build time, which is why they are
     * set for the build and start command rather than for the tests.
     */
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
      /**
       * The Control Plane fails closed without an explicit opt-in, so an
       * unconfigured production deployment cannot serve an internal surface by
       * accident. The suite has to opt in for the same reason it pins the
       * adapter: the harness must state what it is testing rather than inherit
       * it.
       */
      CONTROL_PLANE_MOCK: "true",
      /**
       * Outreach delivery, pinned to unconfigured.
       *
       * The suite asserts the fail-closed state -- with no provider, the page
       * says so rather than showing a send control that would quietly do
       * nothing. On a machine with real credentials in `.env` the page is
       * correctly *not* in that state, and the test failed for being right.
       */
      OUTREACH_EMAIL_PROVIDER: "",
      RESEND_API_KEY: "",
    },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
