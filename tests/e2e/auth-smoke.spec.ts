import { expect, test } from "@playwright/test";

test("GM can sign in and see the dashboard", async ({ page }) => {
  await page.goto("/login");

  await page.locator("#email").fill("gm@role.local");
  await page.locator("#password").fill("demo1234");
  await expect(page.locator("button[type='submit']")).toBeEnabled();
  await page.locator("button[type='submit']").click();

  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /Персонажі|Characters/ })).toBeVisible();
});
