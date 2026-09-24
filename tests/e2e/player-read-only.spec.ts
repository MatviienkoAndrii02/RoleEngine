import { expect, test } from "@playwright/test";
import { PLAYER_IDENTIFIER, loginAs } from "./helpers";

test("Player sees the assigned character without GM tooling", async ({ page }) => {
  await loginAs(page, PLAYER_IDENTIFIER);

  // Dashboard lists the assigned character; GM-only actions are hidden.
  await expect(page.getByText("Mira Vale").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Новий персонаж|New character/ })).toHaveCount(0);

  await page.getByRole("link", { name: /Mira Vale/ }).click();
  await expect(page).toHaveURL(/\/workspaces\/legacy-workspace\/characters\/demo-character$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mira Vale");
  await expect(page.getByText("Strength", { exact: true })).toBeVisible();

  // GM-only sidebar sections are not rendered at all for players.
  await expect(page.locator('button[aria-controls="effect-composer-content"]')).toHaveCount(0);
  await expect(page.locator('button[aria-controls="node-editor-content"]')).toHaveCount(0);
  await expect(page.locator('button[aria-controls="settings-content"]')).toHaveCount(0);

  // Read-only panels remain available.
  await expect(page.locator('button[aria-controls="player-preview-dependencies-content"]')).toBeVisible();

  const crossWorkspaceResponse = await page.request.get("/api/workspaces/not-a-member/characters/demo-character/version");
  expect(crossWorkspaceResponse.status()).toBe(403);
});
