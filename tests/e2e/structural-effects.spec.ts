import { expect, test } from "@playwright/test";
import { GM_IDENTIFIER, createCharacterViaUi, loginAs } from "./helpers";

test("structural effect reconciles generated nodes and a failed UI toggle keeps the persisted state", async ({ page }) => {
  await loginAs(page, GM_IDENTIFIER);
  await createCharacterViaUi(page, `E2E Structural Host ${Date.now().toString(36)}`);

  const suffix = Date.now().toString(36);
  const effectName = `E2E Generated Effect ${suffix}`;
  const generatedName = `E2E Generated Node ${suffix}`;
  await page.locator("button[aria-controls='effect-composer-content']").click();
  const composer = page.locator("#effect-composer-content");
  await composer.locator("select").first().selectOption("structural");
  const form = composer.locator("form");
  await form.locator("input[name='name']").fill(effectName);
  await form.getByRole("button", { name: /Корінь персонажа|Character root/, exact: true }).first().click();
  await form.locator("input[name='createdNodeName']").fill(generatedName);
  const createEffectResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" && response.url().includes("/effects")
  );
  await form.getByRole("button", { name: /Додати структурний ефект|Add structural effect/ }).click();
  const createdEffect = await createEffectResponse;
  expect(createdEffect.ok(), await createdEffect.text()).toBeTruthy();

  await page.reload();
  const generatedRow = page.locator("[id^='node-row-']").filter({ hasText: generatedName });
  await expect(generatedRow).toHaveCount(1);
  await page.locator("button[aria-controls='effect-manager-content']").click();
  const manager = page.locator("#effect-manager-content");
  const effectToggle = manager.getByRole("checkbox", { name: new RegExp(effectName) });
  await expect(effectToggle).toBeChecked();

  await effectToggle.click();
  await expect(effectToggle).not.toBeChecked();
  await page.reload();
  await expect(page.locator("[id^='node-row-']").filter({ hasText: generatedName })).toHaveCount(0);
  await page.locator("button[aria-controls='effect-manager-content']").click();
  await expect(page.locator("#effect-manager-content").getByRole("checkbox", { name: new RegExp(effectName) })).not.toBeChecked();

  await page.locator("#effect-manager-content").getByRole("checkbox", { name: new RegExp(effectName) }).click();
  await expect(page.locator("#effect-manager-content").getByRole("checkbox", { name: new RegExp(effectName) })).toBeChecked();
  await page.reload();
  await expect(page.locator("[id^='node-row-']").filter({ hasText: generatedName })).toHaveCount(1);

  await page.locator("button[aria-controls='effect-manager-content']").click();
  await page.route("**/api/effects/**", async (route) => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "INTERNAL_ERROR", message: "Injected E2E failure" }) });
      return;
    }
    await route.continue();
  });
  const toggleAfterEnable = page.locator("#effect-manager-content").getByRole("checkbox", { name: new RegExp(effectName) });
  const failedToggle = page.waitForResponse((response) =>
    response.request().method() === "PATCH" && response.url().includes("/api/effects/")
  );
  await toggleAfterEnable.click();
  expect((await failedToggle).status()).toBe(500);
  await expect(toggleAfterEnable).toBeChecked();
  await page.unrouteAll({ behavior: "wait" });
  await page.reload();
  await expect(page.locator("[id^='node-row-']").filter({ hasText: generatedName })).toHaveCount(1);
});
