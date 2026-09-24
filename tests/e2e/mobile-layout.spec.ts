import { expect, test, type Page } from "@playwright/test";
import { DEMO_PASSWORD, GM_IDENTIFIER, SEEDED_WORKSPACE_ID, loginAs } from "./helpers";

const widths = [320, 375];

test("keeps core GM screens and the account menu inside a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: widths[0], height: 812 });
  await loginAs(page, GM_IDENTIFIER, DEMO_PASSWORD);

  for (const width of widths) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto(`/workspaces/${SEEDED_WORKSPACE_ID}`);
    await expectPageToFit(page, width);
    const characterHref = await page.locator('a[href*="/characters/"]').evaluateAll((links) =>
      links.map((link) => link.getAttribute("href")).find((href) => href && !href.endsWith("/new")) ?? null,
    );
    if (!characterHref) throw new Error("The seeded workspace has no character available for mobile QA");

    await page.locator("header details summary").click();
    const menuBounds = await page.locator("header details > div").evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const logout = element.querySelector("button[type='submit']")?.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        logoutRight: logout?.right ?? Number.POSITIVE_INFINITY,
      };
    });
    expect(menuBounds.left).toBeGreaterThanOrEqual(0);
    expect(menuBounds.right).toBeLessThanOrEqual(width);
    expect(menuBounds.logoutRight).toBeLessThanOrEqual(width);
    await expect(page.locator("header details summary")).toContainText(/Demo|gm@role\.local/i);

    await page.getByRole("link", { name: /Шаблони|Templates/ }).click();
    await expect(page).toHaveURL(new RegExp(`/workspaces/${SEEDED_WORKSPACE_ID}/templates$`));
    await expectPageToFit(page, width);
    for (const name of [/Архів шаблонів|Template archive/, /Новий шаблон|New template/]) {
      const action = page.getByRole("link", { name });
      await expect(action).toBeVisible();
      const dimensions = await action.evaluate((element) => ({
        client: element.clientWidth,
        scroll: element.scrollWidth,
        right: element.getBoundingClientRect().right,
      }));
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
      expect(dimensions.right).toBeLessThanOrEqual(width);
    }

    await page.goto(characterHref);
    await expectPageToFit(page, width);
    const firstNode = page.locator("[id^='node-row-']").first();
    if (await firstNode.count()) {
      await firstNode.click();
      await expectPageToFit(page, width);
      await expect(firstNode.getByRole("button", { name: /Редагувати|Edit/ })).toBeVisible();
    }

    await page.goto("/workspaces");
    await expectPageToFit(page, width);
  }
});

test("keeps system health cards inside a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 812 });
  await loginAs(page, GM_IDENTIFIER, DEMO_PASSWORD);
  const response = await page.goto("/admin/health");
  test.skip(response?.status() !== 200, "The demo GM is not configured as a platform administrator");
  await expect(page.getByRole("heading", { name: /Стан системи|System health/ })).toBeVisible();

  for (const width of widths) {
    await page.setViewportSize({ width, height: 812 });
    await page.goto("/admin/health");
    await expect(page.getByRole("heading", { name: /Стан системи|System health/ })).toBeVisible();
    await page.getByRole("heading", { name: /Інструмент бекапів|Backup tool/ }).waitFor();
    await expectPageToFit(page, width);

    for (const title of [/Пам’ять|Memory/, /Диск|Disk/, /Інструмент бекапів|Backup tool/]) {
      const heading = page.getByRole("heading", { name: title });
      const card = heading.locator("xpath=ancestor::div[contains(@class, 'rounded-md')][1]");
      const dimensions = await card.evaluate((element) => ({
        client: element.clientWidth,
        scroll: element.scrollWidth,
        right: element.getBoundingClientRect().right,
      }));
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.client);
      expect(dimensions.right).toBeLessThanOrEqual(width);
    }
  }
});

async function expectPageToFit(page: Page, width: number) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    main: document.querySelector("main")?.getBoundingClientRect(),
    header: document.querySelector("header")?.getBoundingClientRect(),
  }));
  expect(dimensions.viewport).toBe(width);
  expect(dimensions.document).toBeLessThanOrEqual(width);
  expect(dimensions.main?.left ?? -1).toBeGreaterThanOrEqual(0);
  expect(dimensions.main?.right ?? width + 1).toBeLessThanOrEqual(width);
  expect(dimensions.header?.left ?? -1).toBeGreaterThanOrEqual(0);
  expect(dimensions.header?.right ?? width + 1).toBeLessThanOrEqual(width);
}
