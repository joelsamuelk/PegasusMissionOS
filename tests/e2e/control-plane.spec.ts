import { expect, test } from "@playwright/test";

test("Control Plane team changes are reason-bound and appear in audit", async ({ page }) => {
  await page.goto("/control");
  await expect(page.getByRole("heading", { name: /what needs your attention today/i })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Outreach" })).toBeVisible();
  await expect(page.getByText(/Delivery provider:/)).toContainText("not configured");
  await expect(page.getByText(/approved requests cannot send/i)).toBeVisible();
  await expect(page.getByText(/none recorded/i).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Send approval queue" })).toBeVisible();
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
