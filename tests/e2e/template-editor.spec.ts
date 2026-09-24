import { expect, test } from "@playwright/test";
import { GM_IDENTIFIER, loginAs } from "./helpers";

const TEMPLATES_LINK = /^Шаблони$|^Templates$/;
const SAVE = /^Зберегти$|^Save$/;

test("GM creates a template, edits its settings and maintains a nested node subtree", async ({ page }) => {
  await loginAs(page, GM_IDENTIFIER);
  await page.getByRole("link", { name: TEMPLATES_LINK }).click();
  await page.getByRole("link", { name: /Новий шаблон|New template/ }).click();

  const suffix = Date.now().toString(36);
  const initialName = `E2E Template ${suffix}`;
  const updatedName = `${initialName} Updated`;
  await page.locator("#name").fill(initialName);
  await page.getByRole("button", { name: SAVE }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(initialName);

  const settings = page.locator("button[aria-controls='template-settings-content']");
  await settings.click();
  const settingsPanel = page.locator("#template-settings-content");
  await settingsPanel.locator("input[name='name']").fill(updatedName);
  await settingsPanel.getByRole("button", { name: SAVE }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(updatedName);

  await page.locator("button[aria-controls='template-node-editor-content']").click();
  const editor = page.locator("#template-node-editor-content");
  const rootName = `E2E Group ${suffix}`;
  await editor.locator("input[name='name']").fill(rootName);
  await editor.locator("select#node-type").selectOption("GROUP");
  await editor.getByRole("button", { name: SAVE }).click();
  const rootRow = page.locator("[id^='node-row-']").filter({ hasText: rootName });
  await expect(rootRow).toHaveCount(1);

  await rootRow.click();
  await rootRow.getByRole("button", { name: new RegExp(`Додати вузол всередину ${rootName}|Add node inside ${rootName}`) }).click();
  const childName = `E2E Child ${suffix}`;
  await editor.locator("input[name='name']").fill(childName);
  await editor.locator("select#node-type").selectOption("TEXT");
  await editor.getByRole("button", { name: SAVE }).click();
  await expect(page.locator("[id^='node-row-']").filter({ hasText: childName })).toHaveCount(1);

  await rootRow.click();
  await rootRow.getByRole("button", { name: new RegExp(`Редагувати ${rootName}|Edit ${rootName}`) }).click();
  const renamedGroup = `${rootName} Renamed`;
  await editor.locator("input[name='name']").fill(renamedGroup);
  await editor.getByRole("button", { name: SAVE }).click();
  const renamedRow = page.locator("[id^='node-row-']").filter({ hasText: renamedGroup });
  await expect(renamedRow).toHaveCount(1);
  await expect(page.locator("[id^='node-row-']").filter({ hasText: childName })).toHaveCount(1);

  page.once("dialog", (dialog) => void dialog.accept());
  await renamedRow.click();
  await renamedRow.getByRole("button", { name: new RegExp(`Редагувати ${renamedGroup}|Edit ${renamedGroup}`) }).click();
  await editor.getByRole("button", { name: /^Видалити$|^Delete$/ }).click();
  await expect(page.locator("[id^='node-row-']").filter({ hasText: renamedGroup })).toHaveCount(0);
  await expect(page.locator("[id^='node-row-']").filter({ hasText: childName })).toHaveCount(0);
});
