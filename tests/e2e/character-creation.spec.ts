import { expect, test } from "@playwright/test";
import { GM_IDENTIFIER, createCharacterViaUi, loginAs } from "./helpers";

test("GM creates a character from the default template and sees its structure", async ({ page }) => {
  await loginAs(page, GM_IDENTIFIER);

  const name = `E2E Template Hero ${Date.now().toString(36)}`;
  await createCharacterViaUi(page, name, "Created by the critical-path E2E suite");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);

  // Template structure was copied: Identity > Race (TEXT), Stats > NUMBER nodes.
  await expect(page.getByText("Race", { exact: true })).toBeVisible();
  await expect(page.getByText("Human", { exact: true })).toBeVisible();
  await expect(page.getByText("Strength", { exact: true })).toBeVisible();
  await expect(page.getByText("Intelligence", { exact: true })).toBeVisible();
  await expect(page.getByText("Agility", { exact: true })).toBeVisible();
});
