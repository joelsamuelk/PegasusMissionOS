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
