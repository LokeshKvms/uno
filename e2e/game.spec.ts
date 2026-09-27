import { expect, test } from "@playwright/test";
import { createTable, handLabels, joinByLink, newPlayer, noHorizontalScroll, step } from "./helpers.ts";

test("three friends: invite link, lobby, deal, refresh, leave to bot, play a round, scoreboard", async ({ browser }) => {
  const alice = await newPlayer(browser);
  const bob = await newPlayer(browser);
  const carl = await newPlayer(browser);

  const code = await createTable(alice.page, "Alice");
  await joinByLink(bob.page, code, "Bob");
  await expect(bob.page.getByText("Alice saved you a seat")).toHaveCount(0);
  await joinByLink(carl.page, code, "Carl");
  await expect(alice.page.locator(".seat")).toHaveCount(3);

  await expect(alice.page.getByRole("button", { name: "Deal the cards" })).toBeDisabled();
  await bob.page.getByRole("button", { name: "Ready", exact: true }).click();
  await carl.page.getByRole("button", { name: "Ready", exact: true }).click();
  await alice.page.getByRole("radio", { name: "Race to 500" }).click();
  await expect(bob.page.getByRole("radio", { name: "Race to 500" })).toHaveAttribute("aria-checked", "true");
  await alice.page.getByRole("button", { name: "Deal the cards" }).click();

  for (const p of [alice.page, bob.page, carl.page]) {
    await expect(p.locator(".hand-card").first()).toBeVisible();
    await expect(p.locator(".topbar-status")).toContainText("Race to 500");
  }
  expect(await alice.page.locator(".hand-card").count()).toBeGreaterThanOrEqual(7);

  await alice.page.locator(".draw-pile").hover();
  await expect(alice.page.locator(".tip")).toContainText(/Draw/);

  const before = await handLabels(bob.page);
  await bob.page.reload();
  await expect(bob.page.locator(".hand-card").first()).toBeVisible();
  await expect.poll(() => handLabels(bob.page)).toEqual(before);

  await carl.page.getByRole("button", { name: "Leave the table" }).click();
  await carl.page.getByRole("button", { name: "Leave table" }).click();
  await expect(carl.page).toHaveURL(/\/$/);
  await expect(alice.page.locator('.seat:has-text("Carl")')).toContainText("Bot playing");

  const deadline = Date.now() + 200_000;
  while (Date.now() < deadline) {
    if (await alice.page.locator(".roundover").isVisible()) break;
    const acted = (await step(alice.page)) || (await step(bob.page));
    if (!acted) await alice.page.waitForTimeout(150);
  }
  await expect(alice.page.locator(".roundover")).toBeVisible();
  await expect(alice.page.locator(".roundover-standings")).toContainText("Race to 500");
  await expect(bob.page.locator(".roundover .breakdown li")).toHaveCount(2);

  await alice.page.getByRole("tab", { name: "Score" }).click();
  await expect(alice.page.locator(".history tbody tr")).toHaveCount(1);
  await noHorizontalScroll(alice.page);

  await carl.page.goto(`/room/${code}`);
  await carl.page.getByLabel("Your name").fill("Carl");
  await carl.page.getByRole("button", { name: /Take a seat|Watch this game/ }).click();
  await expect(alice.page.locator('.seat:has-text("Carl")')).not.toContainText("Bot playing");
});

test("responsive screens have no sideways scroll", async ({ browser }) => {
  const sizes = [
    { name: "phone", width: 375, height: 812 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "desktop", width: 1440, height: 900 },
  ];
  for (const size of sizes) {
    const host = await newPlayer(browser, { width: size.width, height: size.height });
    await host.page.goto("/");
    await expect(host.page.getByRole("button", { name: "Create a table" })).toBeVisible();
    await host.page.waitForTimeout(1200);
    await noHorizontalScroll(host.page);
    await host.page.screenshot({ path: `test-results/shots/${size.name}-home.png` });

    await host.page.getByLabel("Your name").fill("Riya");
    await host.page.getByRole("button", { name: "Start game" }).click();
    await expect(host.page.locator(".lobby-code")).toBeVisible();
    await noHorizontalScroll(host.page);
    await host.page.screenshot({ path: `test-results/shots/${size.name}-lobby.png` });

    await host.page.getByRole("button", { name: "Deal the cards" }).click();
    await expect(host.page.locator(".hand-card").first()).toBeVisible();
    await host.page.waitForTimeout(1500);
    await noHorizontalScroll(host.page);
    await host.page.screenshot({ path: `test-results/shots/${size.name}-game.png` });

    const clipped = await host.page.evaluate(() => {
      const hand = document.querySelector(".hand")!.getBoundingClientRect();
      return [...document.querySelectorAll(".hand-card")].some((c) => c.getBoundingClientRect().bottom > Math.min(hand.bottom, window.innerHeight) + 1);
    });
    expect(clipped, `hand clipped at ${size.name}`).toBe(false);
    await host.context.close();
  }
});

test("a missed UNO call can be caught with the Catch button or the C key", async ({ browser }) => {
  test.setTimeout(240_000);
  const alice = await newPlayer(browser);
  const bob = await newPlayer(browser);
  const code = await createTable(alice.page, "Alice");
  await joinByLink(bob.page, code, "Bob");
  await bob.page.getByRole("button", { name: "Ready", exact: true }).click();
  await alice.page.getByRole("button", { name: "Deal the cards" }).click();
  await expect(bob.page.locator(".hand-card").first()).toBeVisible();

  const mine = (p: typeof alice.page) =>
    p
      .locator(".hand-area.hand-mine")
      .count()
      .then((n) => n > 0);
  const tryClick = async (l: ReturnType<typeof alice.page.locator>) => {
    if (await l.isVisible()) {
      await l.click({ timeout: 2000 }).catch(() => {});
      return true;
    }
    return false;
  };

  const deadline = Date.now() + 200_000;
  let forgot = false;
  while (Date.now() < deadline && !forgot) {
    for (const p of [alice.page, bob.page]) {
      if (await tryClick(p.locator(".wheel-swatch").first())) continue;
      if (await tryClick(p.getByRole("button", { name: "Take four" }))) continue;
    }
    if (await mine(bob.page)) {
      const count = await bob.page.locator(".hand-card").count();
      const playable = bob.page.locator(".hand-card.is-playable .hand-card-btn");
      if ((await playable.count()) > 0) {
        await playable
          .first()
          .click({ timeout: 2000 })
          .catch(() => {});
        if (count === 2) forgot = true;
      } else if (!(await tryClick(bob.page.getByRole("button", { name: "Keep it" })))) {
        await tryClick(bob.page.getByRole("button", { name: "Draw", exact: true }));
      }
    } else if (await mine(alice.page)) {
      if (!(await tryClick(alice.page.getByRole("button", { name: "Keep it" })))) await tryClick(alice.page.getByRole("button", { name: "Draw", exact: true }));
    }
    await alice.page.waitForTimeout(120);
  }
  expect(forgot, "Bob reached two cards and played one without calling").toBe(true);
  await tryClick(bob.page.locator(".wheel-swatch").first());

  await expect(alice.page.locator(".btn-catch")).toContainText("Catch");
  await expect(alice.page.locator(".catch-btn")).toBeVisible();
  await alice.page.mouse.move(2, 2);
  await alice.page.screenshot({ path: "test-results/shots/catch.png" });
  await alice.page.keyboard.press("c");
  await expect(bob.page.locator(".hand-marker")).toContainText("Caught by Alice");
  await expect(bob.page.locator(".hand-card")).toHaveCount(3);
  await expect(alice.page.locator(".btn-catch")).toHaveCount(0);
});
