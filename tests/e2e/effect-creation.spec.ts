import { expect, test } from "@playwright/test";
import { GM_IDENTIFIER, createCharacterViaUi, loginAs } from "./helpers";

test("GM creates and toggles an enabled numeric effect through the composer", async ({ page }) => {
  await loginAs(page, GM_IDENTIFIER);
  await createCharacterViaUi(page, `E2E Effect Host ${Date.now().toString(36)}`);

  const effectName = `E2E Strength Boost ${Date.now().toString(36)}`;
  await page.locator('button[aria-controls="effect-composer-content"]').click();
  const composer = page.locator("#effect-composer-content");
  await composer.locator('input[name="name"]').fill(effectName);

  // NodePicker: search for the target node, then pick it from the filtered list.
  await composer.getByPlaceholder(/Оберіть ціль|Select target/).fill("Strength");
  await composer.getByRole("button", { name: /Strength/ }).first().click();

  await composer.locator('input[name="sourceValue"]').fill("2");
  await composer.getByRole("button", { name: /Додати ефект|Add effect/ }).click();

  // The form resets once the effect is persisted.
  await expect(composer.locator('input[name="name"]')).toHaveValue("", { timeout: 15_000 });

  // Known issue: router.refresh() may not propagate fresh server data to the
  // sidebar (see KNOWN_ISSUES.md "refresh staleness"), so fall back to a reload
  // before asserting the persisted effect is listed.
  await page.locator('button[aria-controls="effect-manager-content"]').click();
  const manager = page.locator("#effect-manager-content");
  if (!(await manager.getByText(effectName).isVisible().catch(() => false))) {
    await page.reload();
    await page.locator('button[aria-controls="effect-manager-content"]').click();
  }
  await expect(manager.getByText(effectName)).toBeVisible({ timeout: 10_000 });

  // Effects are enabled on creation and can be toggled.
  const toggle = manager.locator('input[type="checkbox"]').first();
  await expect(toggle).toBeChecked();
  await toggle.click();
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(toggle).toBeChecked();
});
