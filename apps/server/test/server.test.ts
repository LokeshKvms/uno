import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryStore } from "../src/store.ts";
import { Player, type TestServer, sleep, startServer } from "./harness.ts";

let server: TestServer;
const players: Player[] = [];
const player = (name: string) => {
  const p = new Player(server.base, name);
  players.push(p);
  return p;
};

beforeEach(async () => {
  server = await startServer();
});
afterEach(async () => {
  for (const p of players.splice(0)) p.disconnect();
  await server.close();
});

async function twoPlayerGame(mode: "single" | "match" = "single") {
  const alice = player("Alice");
  const bob = player("Bob");
  const code = await alice.create();
  expect((await bob.join(code)).json.role).toBe("player");
  await alice.connect(code);
  await bob.connect(code);
  if (mode === "match") expect(await alice.cmd({ type: "settings", mode: "match" })).toEqual({ ok: true });
  expect(await bob.cmd({ type: "ready", ready: true })).toEqual({ ok: true });
  expect(await alice.cmd({ type: "start" })).toEqual({ ok: true });
  await alice.until((s) => s.status === "playing");
  await bob.until((s) => s.status === "playing");
  return { alice, bob, code };
}

describe("rooms and lobby", () => {
  it("rejects bad input with friendly messages", async () => {
    const p = player("x");
    await p.api("/api/session");
    expect((await p.api("/api/rooms", { name: "   " })).json).toEqual({ error: "Enter a name." });
    expect((await p.api("/api/rooms", { name: "x".repeat(40) })).json.error).toMatch(/20 characters/);
    const missing = await p.api("/api/rooms/ZZZZZZ/join", { name: "Sam" });
    expect(missing.status).toBe(404);
    expect(missing.json.error).toMatch(/couldn't find that room/);
    expect((await p.api("/api/rooms/abc/join", { name: "Sam" })).json.error).toMatch(/6 characters/);
  });

  it("creates a room, joins by lowercase code, and dedupes names", async () => {
    const a = player("Sam");
    const b = player("Sam");
    const code = await a.create();
    const joined = await b.join(code.toLowerCase());
    expect(joined.json).toEqual({ code, role: "player" });
    await a.connect(code);
    const s = await a.until((s) => s.seats.length === 2);
    expect(s.seats.map((x) => x.name)).toEqual(["Sam", "Sam 2"]);
    expect(s.hostId).toBe(s.selfId);
    const preview = await a.api(`/api/rooms/${code}`, undefined, "GET");
    expect(preview.json).toMatchObject({ code, status: "lobby", hostName: "Sam", players: 2 });
  });

  it("restores the room on refresh via the session cookie", async () => {
    const a = player("Ann");
    const code = await a.create();
    expect((await a.api("/api/session")).json).toMatchObject({ room: code, name: "Ann" });
  });

  it("enforces host-only actions and readiness before dealing", async () => {
    const alice = player("Alice");
    const bob = player("Bob");
    const code = await alice.create();
    await bob.join(code);
    await alice.connect(code);
    await bob.connect(code);
    expect(await bob.cmd({ type: "start" })).toEqual({ ok: false, error: "Only the host can do that." });
    const notReady = await alice.cmd({ type: "start" });
    expect(notReady.ok).toBe(false);
    expect(!notReady.ok && notReady.error).toMatch(/Waiting for Bob/);
  });

  it("lets the host add and remove bots, and kick players", async () => {
    const alice = player("Alice");
    const bob = player("Bob");
    const code = await alice.create();
    await bob.join(code);
    await alice.connect(code);
    await bob.connect(code);
    await alice.cmd({ type: "addBot", level: "hard" });
    let s = await alice.until((s) => s.seats.length === 3);
    const bot = s.seats.find((x) => x.kind === "bot")!;
    expect(bot).toMatchObject({ botLevel: "hard", ready: true });
    await alice.cmd({ type: "removeSeat", seatId: bot.id });
    s = await alice.until((s) => s.seats.length === 2);
    const bobSeat = s.seats.find((x) => x.name === "Bob")!;
    await alice.cmd({ type: "removeSeat", seatId: bobSeat.id });
    await alice.until((s) => s.seats.length === 1);
    await sleep(150);
    expect(bob.removed).toMatch(/removed you/);
  });

  it("transfers host when the host leaves the lobby", async () => {
    const alice = player("Alice");
    const bob = player("Bob");
    const code = await alice.create();
    await bob.join(code);
    await alice.connect(code);
    await bob.connect(code);
    await alice.cmd({ type: "leave" });
    const s = await bob.until((s) => s.seats.length === 1);
    expect(s.hostId).toBe(s.selfId);
  });

  it("solo play: creates a room with bots that is ready to deal", async () => {
    const a = player("Solo");
    const code = await a.create({ bots: { count: 3, level: "normal" } });
    await a.connect(code);
    expect(a.snap!.seats).toHaveLength(4);
    expect(await a.cmd({ type: "start" })).toEqual({ ok: true });
    await a.until((s) => s.game !== null);
  });
});

describe("gameplay", () => {
  it("deals private hands and hides other hands", async () => {
    const { alice, bob } = await twoPlayerGame();
    const a = alice.snap!.game!;
    const b = bob.snap!.game!;
    expect(a.hand.length).toBeGreaterThanOrEqual(7);
    expect(a.players.find((p) => p.id === bob.snap!.selfId)!.count).toBe(b.hand.length);
    const bobIds = new Set(b.hand.map((c) => c.id));
    expect(JSON.stringify(alice.snap)).not.toContain(b.hand[0]!.id);
    expect(a.hand.some((c) => bobIds.has(c.id))).toBe(false);
  });

  it("rejects out-of-turn moves and treats retried commands idempotently", async () => {
    const { alice, bob } = await twoPlayerGame();
    const g = alice.snap!.game!;
    const [mover, waiter] = g.currentId === alice.snap!.selfId ? [alice, bob] : [bob, alice];
    if (mover.snap!.game!.phase === "chooseColor") await mover.cmd({ type: "chooseColor", color: "red" });
    const bad = await waiter.cmd({ type: "draw" });
    expect(bad).toEqual({ ok: false, error: "It is not your turn yet." });
    const before = mover.snap!.game!.hand.length;
    const id = "retry-draw-0001";
    await mover.cmd({ type: "draw" }, id);
    await mover.cmd({ type: "draw" }, id);
    await sleep(150);
    expect(mover.snap!.game!.hand.length).toBeLessThanOrEqual(before + 1);
  });

  it("plays a full game between two humans to the end", async () => {
    const { alice, bob } = await twoPlayerGame();
    for (let i = 0; i < 600 && alice.snap!.game!.phase !== "matchOver"; i++) {
      const moved = (await alice.autoMove()) || (await bob.autoMove());
      if (!moved) await sleep(20);
      await sleep(15);
    }
    const s = await alice.until((s) => s.game!.phase === "matchOver");
    expect(s.game!.matchWinnerId).toBeTruthy();
    expect(s.game!.history).toHaveLength(1);
    expect(s.log.some((e) => e.kind === "game" && e.event.type === "matchOver")).toBe(true);
    expect(await alice.cmd({ type: "toLobby" })).toEqual({ ok: true });
    const lobby = await bob.until((s) => s.status === "lobby");
    expect(lobby.seats).toHaveLength(2);
  });

  it("bots take their own turns", async () => {
    const a = player("Solo");
    const code = await a.create({ bots: { count: 2, level: "easy" } });
    await a.connect(code);
    await a.cmd({ type: "start" });
    const start = Date.now();
    while (Date.now() - start < 6000 && (a.snap!.game?.round ?? 0) === 1 && a.snap!.game!.phase !== "matchOver") {
      await a.autoMove();
      await sleep(60);
    }
    const plays = a.snap!.log.filter((e) => e.kind === "game" && (e.event.type === "play" || e.event.type === "draw"));
    const botActors = new Set(plays.map((e) => (e.kind === "game" && "playerId" in e.event ? e.event.playerId : "")).filter((id) => id !== a.snap!.selfId));
    expect(botActors.size).toBeGreaterThanOrEqual(1);
  });
});

describe("resilience", () => {
  it("survives a refresh: same seat, same hand", async () => {
    const { alice, code } = await twoPlayerGame();
    const hand = alice.snap!.game!.hand.map((c) => c.id).sort();
    alice.disconnect();
    await sleep(100);
    const again = await alice.connect(code);
    expect(again.game!.hand.map((c) => c.id).sort()).toEqual(hand);
    expect(again.seats.find((s) => s.id === again.selfId)!.connected).toBe(true);
  });

  it("a second tab takes over the seat and the first is told", async () => {
    const { alice, code } = await twoPlayerGame();
    const clone = player("Alice");
    clone.cookie = alice.cookie;
    await clone.connect(code);
    await sleep(150);
    expect(alice.replaced).toBe(true);
    expect(clone.snap!.selfId).toBe(alice.snap!.selfId);
  });

  it("leaving mid-game hands the seat to a bot; rejoining reclaims it", async () => {
    const { alice, bob, code } = await twoPlayerGame();
    const bobId = bob.snap!.selfId;
    expect(await bob.cmd({ type: "leave" })).toEqual({ ok: true });
    let s = await alice.until((s) => s.seats.find((x) => x.id === bobId)!.control === "bot");
    expect(s.seats.find((x) => x.id === bobId)).toMatchObject({ left: true, control: "bot" });
    expect((await bob.api("/api/session")).json.room).toBeNull();
    expect((await bob.join(code)).json.role).toBe("player");
    const back = await bob.connect(code);
    expect(back.selfId).toBe(bobId);
    s = await alice.until((s) => s.seats.find((x) => x.id === bobId)!.control === "human");
    expect(s.seats.find((x) => x.id === bobId)!.left).toBe(false);
  });

  it("a disconnected player gets a grace period, then autopilot", async () => {
    const { alice, bob, code } = await twoPlayerGame();
    const bobId = bob.snap!.selfId;
    bob.disconnect();
    await alice.until((s) => s.seats.find((x) => x.id === bobId)!.connected === false);
    const room = server.manager.get(code)!;
    const seat = room.data.seats.find((x) => x.id === bobId)!;
    expect(seat.control).toBe("human");
    seat.disconnectedAt = Date.now() - 61_000;
    await alice.until((s) => s.seats.find((x) => x.id === bobId)!.control === "autopilot");
    await bob.connect(code);
    await alice.until((s) => s.seats.find((x) => x.id === bobId)!.control === "human");
  });

  it("timeouts draw for the player, and repeated timeouts mark them away", async () => {
    const { alice, code } = await twoPlayerGame();
    const room = server.manager.get(code)!;
    const actorSeat = room.data.seats.find((s) => s.id === alice.snap!.game!.currentId)!;
    const logBefore = room.data.logSeq;
    actorSeat.timeouts = 2;
    room.data.deadline = Date.now() - 1;
    const s = await alice.until((s) => s.seats.some((x) => x.away));
    expect(s.seats.find((x) => x.id === actorSeat.id)).toMatchObject({ away: true, control: "autopilot" });
    expect(room.data.logSeq).toBeGreaterThan(logBefore);
  });

  it("everyone disconnecting freezes the table instead of letting bots play it out", async () => {
    const a = player("Solo");
    const code = await a.create({ bots: { count: 2, level: "normal" } });
    await a.connect(code);
    await a.cmd({ type: "start" });
    a.disconnect();
    await sleep(300);
    const room = server.manager.get(code)!;
    expect(room.data.suspendedAt).not.toBeNull();
    const revision = room.data.revision;
    await sleep(2500);
    expect(room.data.revision).toBe(revision);
    await a.connect(code);
    await a.until((s) => !s.suspended);
  });

  it("spectators can watch mid-game and get seated for the next game", async () => {
    const { alice, code } = await twoPlayerGame();
    const carl = player("Carl");
    expect((await carl.join(code)).json.role).toBe("spectator");
    const s = await carl.connect(code);
    expect(s.role).toBe("spectator");
    expect(s.game!.hand).toHaveLength(0);
    expect((await carl.cmd({ type: "draw" })).ok).toBe(false);
    const room = server.manager.get(code)!;
    room.data.game!.phase = "matchOver";
    room.data.game!.matchWinnerId = alice.snap!.selfId;
    expect(await alice.cmd({ type: "toLobby" })).toEqual({ ok: true });
    const lobby = await carl.until((s) => s.status === "lobby" && s.role === "player");
    expect(lobby.seats.map((x) => x.name)).toContain("Carl");
  });

  it("chat is delivered to everyone and rate limited", async () => {
    const { alice, bob } = await twoPlayerGame();
    expect(await alice.say("hello <b>table</b>")).toEqual({ ok: true });
    await sleep(100);
    expect(bob.chat.at(-1)).toMatchObject({ name: "Alice", text: "hello <b>table</b>" });
    for (let i = 0; i < 4; i++) await alice.say(`m${i}`);
    const limited = await alice.say("too many");
    expect(limited.ok).toBe(false);
  });

  it("games survive a full server restart", async () => {
    const store = new MemoryStore();
    await server.close();
    server = await startServer(store);
    const { alice, bob, code } = await twoPlayerGame();
    const hand = alice.snap!.game!.hand.map((c) => c.id).sort();
    const round = alice.snap!.game!.round;
    await server.manager.flush();
    alice.disconnect();
    bob.disconnect();
    await server.close();

    server = await startServer(store);
    const alice2 = new Player(server.base, "Alice");
    alice2.cookie = alice.cookie;
    players.push(alice2);
    expect((await alice2.api("/api/session")).json.room).toBe(code);
    const s = await alice2.connect(code);
    expect(s.game!.round).toBe(round);
    expect(s.game!.hand.map((c) => c.id).sort()).toEqual(hand);
  });
});
