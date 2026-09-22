import { expect, test } from "@playwright/test";
import { GM_IDENTIFIER, PLAYER_IDENTIFIER, loginAs } from "./helpers";

const adminAccounts = (process.env.ADMIN_ACCOUNTS ?? "").split(",").map((value) => value.trim().toLowerCase());
const demoGmIsAdmin = adminAccounts.includes(GM_IDENTIFIER);

// Locale-agnostic patterns: the console UI follows the role-engine-language cookie.
const ADMIN_HEADING = /^Консоль адміністратора$|^Admin Console$/;
const BACKUPS_LINK = /^Бекапи$|^Backups$/;
const CREATE_BACKUP = /Створити бекап|Create backup/;
const CREATE_DONE = /Бекап створено|Backup created/;
const DOWNLOAD_BACKUP = /Завантажити|Download/;
const DELETE_BACKUP = /^Видалити$|^Delete$/;
const DELETE_DONE = /Бекап видалено|Backup deleted/;
const EMPTY_BACKUPS = /Бекапів ще немає|There are no backups yet/;

test.describe("admin console", () => {
  test("sends unauthenticated visitors to login and keeps the admin API closed", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fadmin/);

    const apiResponse = await page.request.get("/admin-api/health");
    expect(apiResponse.status()).toBe(401);
    expect((await apiResponse.json()).error).toBe("UNAUTHORIZED");
  });

  test("hides the console and the admin API from a non-admin account", async ({ page }) => {
    await loginAs(page, PLAYER_IDENTIFIER);

    const apiResponse = await page.request.get("/admin-api/health");
    expect(apiResponse.status()).toBe(403);
    expect((await apiResponse.json()).error).toBe("FORBIDDEN");

    const consoleResponse = await page.goto("/admin");
    expect(consoleResponse?.status()).toBe(404);
  });

  test("serves the public-mode hardening headers and hides the console from search engines", async ({ page }) => {
    const apiResponse = await page.request.get("/admin-api/health");
    expect(apiResponse.headers()["x-frame-options"]).toBe("DENY");
    expect(apiResponse.headers()["x-content-type-options"]).toBe("nosniff");
    expect(apiResponse.headers()["referrer-policy"]).toBe("no-referrer");
    expect(apiResponse.headers()["x-robots-tag"]).toContain("noindex");

    const robots = await page.request.get("/robots.txt");
    expect(robots.status()).toBe(200);
    const robotsBody = await robots.text();
    expect(robotsBody).toContain("/admin");
    expect(robotsBody).toContain("/admin-api");
  });

  test("rejects cross-site admin mutations even with a valid administrator session", async ({ page }) => {
    test.skip(!demoGmIsAdmin, "ADMIN_ACCOUNTS must include the demo GM account for this spec");

    await loginAs(page, GM_IDENTIFIER);
    const response = await page.request.post("/admin-api/backups", {
      headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" },
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).error).toBe("ADMIN_ORIGIN_NOT_ALLOWED");
  });

  test("lets a configured administrator create, download and delete a backup", async ({ page }) => {
    test.skip(!demoGmIsAdmin, "ADMIN_ACCOUNTS must include the demo GM account for this spec");

    await loginAs(page, GM_IDENTIFIER);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: ADMIN_HEADING })).toBeVisible();

    await page.getByRole("link", { name: BACKUPS_LINK }).first().click();
    await expect(page).toHaveURL(/\/admin\/backups$/);

    page.on("dialog", (dialog) => void dialog.accept());

    await page.getByRole("button", { name: CREATE_BACKUP }).click();
    await expect(page.getByText(CREATE_DONE)).toBeVisible({ timeout: 60_000 });

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: DOWNLOAD_BACKUP }).first().click(),
    ]);
    expect(await download.path()).toBeTruthy();

    await page.getByRole("button", { name: DELETE_BACKUP }).first().click();
    await expect(page.getByText(DELETE_DONE)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(EMPTY_BACKUPS)).toBeVisible();
  });
});