import { type Browser, type Page, expect } from "@playwright/test";

export async function newPlayer(browser: Browser, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  return { context, page };
}

export async function createTable(page: Page, name: string): Promise<string> {
  await page.goto("/");
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Create a table" }).click();
  await expect(page).toHaveURL(/\/room\/[A-Z0-9]{6}$/);
  const code = page.url().split("/").pop()!;
  await expect(page.locator(".lobby-code")).toHaveText(code);
  return code;
}

export async function joinByLink(page: Page, code: string, name: string) {
  await page.goto(`/room/${code}`);
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: /Take a seat|Watch this game/ }).click();
}

export async function step(page: Page): Promise<boolean> {
  try {
    if (await page.locator(".wheel").isVisible()) {
      await page.locator(".wheel-swatch").first().click({ timeout: 2000 });
      return true;
    }
    const take = page.getByRole("button", { name: "Take four" });
    if (await take.isVisible()) {
      await take.click({ timeout: 2000 });
      return true;
    }
    if ((await page.locator(".hand-area.hand-mine").count()) === 0) return false;
    const playable = page.locator(".hand-card.is-playable .hand-card-btn");
    if ((await playable.count()) > 0) {
      if ((await page.locator(".hand-card").count()) === 2) await page.locator(".uno-btn").click({ timeout: 2000 });
      await playable.first().click({ timeout: 2000 });
      return true;
    }
    const keep = page.getByRole("button", { name: "Keep it" });
    if (await keep.isVisible()) {
      await keep.click({ timeout: 2000 });
      return true;
    }
    const draw = page.getByRole("button", { name: "Draw", exact: true });
    if (await draw.isVisible()) {
      await draw.click({ timeout: 2000 });
      return true;
    }
  } catch {}
  return false;
}

export async function handLabels(page: Page): Promise<string[]> {
  return (await page.locator(".hand-card-btn").evaluateAll((els) => els.map((e) => e.querySelector("svg")?.getAttribute("aria-label") ?? ""))).sort();
}

export async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "page should not scroll sideways").toBeLessThanOrEqual(1);
}
