import { expect, test } from "@playwright/test";

/**
 * These two specs assert the **real** Control Plane, not the demonstration.
 *
 * They previously looked for headings that only exist in demo mode. Commit
 * `8b8cc08` separated the two deliberately — curated example pipeline is
 * useful in a demonstration and dishonest anywhere else — and demo mode is now
 * a session cookie that nothing in configuration can switch on. The headings
 * these tests looked for no longer exist anywhere in the source.
 *
 * Rewritten rather than made to pass by setting the cookie: an operator
 * opening their own Control Plane sees the real surface, and that is the one
 * worth having a test for. The intent of each test is unchanged.
 */
test("Control Plane team changes are reason-bound and appear in audit", async ({ page }) => {
  await page.goto("/control");
  // The real command centre. The demonstration's version of this page is a
  // separate component behind a cookie.
  await expect(page.getByRole("heading", { name: /who matters today/i })).toBeVisible();
  await page.getByRole("link", { name: /^team$/i }).click();
  await expect(page.getByRole("heading", { name: /internal team/i })).toBeVisible();

  await page.getByLabel(/reason for changing Pegasus Operator's role/i).fill("Routine access review");
  await page.getByRole("button", { name: /^save$/i }).click();
  await page.getByRole("link", { name: /^audit$/i }).click();
  await expect(page.getByText("internal_role.change")).toBeVisible();
  await expect(page.getByText("Routine access review")).toBeVisible();
});

test("Control Plane preserves prospect people and research provenance", async ({ page }) => {
  await page.goto("/control/prospects/prospect-green-futures");
  await expect(page.getByRole("heading", { name: "Green Futures" })).toBeVisible();
  await expect(page.getByText("Amina Rahman")).toBeVisible();
  await expect(page.getByText(/Helping young people lead practical climate action/)).toBeVisible();
  await expect(page.getByText(/page:about#mission/)).toBeVisible();
});

test("Control Plane qualifies Green Futures deterministically", async ({ page }) => {
  await page.goto("/control/prospects/prospect-green-futures");
  await page.getByRole("button", { name: /run qualification/i }).click();
  await expect(page.getByText(/prospect-fit-v1/i)).toBeVisible();
  await page.getByText(/factor reasons/i).click();
  await expect(page.getByText(/Organisation type:/i)).toBeVisible();
});

test("Control Plane outreach is approval-gated and delivery-fail-closed", async ({ page }) => {
  await page.goto("/control/outreach");

  // Approval-gated: the form creates a request for somebody to approve. There
  // is no control on this page that sends anything directly.
  await expect(page.getByRole("heading", { name: /review, approve and send/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /create approval request/i })).toBeVisible();

  // Fail-closed: with no delivery provider configured, the page says so rather
  // than presenting a send control that would quietly do nothing.
  await expect(page.getByText(/delivery not configured/i)).toBeVisible();

  // And the queue is honest about being empty rather than showing a sample.
  await expect(page.getByText(/no persisted outreach requests yet/i)).toBeVisible();

  // The real page carries no invented account queue: scoring does not run yet,
  // and it says that instead of ranking nothing.
  await expect(page.getByRole("heading", { name: /no account queue yet/i })).toBeVisible();
});

test("Control intelligence returns cited structured metrics", async ({ page }) => {
  await page.goto("/control/intelligence?intent=pipeline_overview");
  await expect(page.getByRole("heading", { name: "Pipeline overview" })).toBeVisible();
  await expect(page.getByText("Open opportunities", { exact: true })).toBeVisible();
  await page.getByText("Provenance").first().click();
  await expect(page.getByText("Tool: sales.opportunities").first()).toBeVisible();
});

test("Operations safety reports an unconfigured adapter honestly", async ({ page }) => {
  await page.goto("/control/operations");
  await expect(page.getByRole("heading", { name: "Operations safety" })).toBeVisible();
  await expect(page.getByText(/email_delivery: not_configured/)).toBeVisible();
  await expect(page.getByText(/No delivery provider is configured/)).toBeVisible();
});
