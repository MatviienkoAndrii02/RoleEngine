import { expect, type Page } from "@playwright/test";

export const GM_IDENTIFIER = "gm@role.local";
export const PLAYER_IDENTIFIER = "player@role.local";
export const DEMO_PASSWORD = "demo1234";

// The seed pins the demo data to this workspace; tests must not depend on whatever
// workspace cookie happens to linger in the local browser profile.
export const SEEDED_WORKSPACE_ID = "legacy-workspace";

// Locale-agnostic patterns: the UI supports uk and en, the active locale comes from a cookie.
export const DASHBOARD_HEADING = /^Персонажі$|^Characters$/;
export const NEW_CHARACTER_LINK = /Новий персонаж|New character/;
export const CREATE_CHARACTER_BUTTON = /Створити персонажа|Create character/;

export async function loginAs(page: Page, identifier: string, password: string = DEMO_PASSWORD): Promise<void> {
  await page.goto("/login");
  await page.locator("#identifier").fill(identifier);
  await page.locator("#password").fill(password);
  await page.locator("button[type='submit']").click();

  await expect(page).toHaveURL(/\/workspaces\/[^/]+$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: DASHBOARD_HEADING })).toBeVisible();

  // Pin the seeded workspace so tests are independent of leftover browser cookies.
  await page.context().addCookies([{
    name: "role-engine-workspace",
    value: SEEDED_WORKSPACE_ID,
    url: new URL(page.url()).origin,
  }]);
  await page.goto(`/workspaces/${SEEDED_WORKSPACE_ID}`);
}

export async function createCharacterViaUi(page: Page, name: string, description?: string): Promise<void> {
  await page.getByRole("link", { name: NEW_CHARACTER_LINK }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${SEEDED_WORKSPACE_ID}/characters/new$`));
  await page.locator("#name").fill(name);
  if (description) await page.locator("#description").fill(description);
  // The default character template arrives preselected; submit as-is.
  await page.getByRole("button", { name: CREATE_CHARACTER_BUTTON }).click();
  await expect(page).toHaveURL(new RegExp(`/workspaces/${SEEDED_WORKSPACE_ID}/characters/[A-Za-z0-9]+$`), { timeout: 15_000 });
}
