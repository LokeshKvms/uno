import type { Card, GameAction } from "@uno/engine";
import { TIMING } from "@uno/protocol";
import { describe, expect, it } from "vitest";
import { Room } from "../src/room.ts";

const T0 = 1_000_000;

function rigged() {
  const room = Room.create("CATCH1", "sess-host", { name: "Maya", avatar: 0 }, T0);
  room.connect("sess-host", T0);
  room.handle("sess-host", { type: "addBot", level: "easy" }, T0);
  room.handle("sess-host", { type: "addBot", level: "easy" }, T0);
  room.handle("sess-host", { type: "start" }, T0);
  const d = room.data;
  const [human, botA, botB] = d.seats as [(typeof d.seats)[0], (typeof d.seats)[0], (typeof d.seats)[0]];
  const game = d.game!;
  const five: Card = { id: "rig-red-5", color: "red", value: "5" };
  const seven: Card = { id: "rig-red-7", color: "red", value: "7" };
  const a = game.players.find((p) => p.id === botA.id)!;
  a.hand = [five, seven];
  game.discardPile.push({ id: "rig-red-3", color: "red", value: "3" });
  game.activeColor = "red";
  game.direction = 1;
  game.currentIndex = game.players.findIndex((p) => p.id === botA.id);
  game.phase = "turn";
  game.challenge = null;
  game.drawnCardId = null;
  game.lastCall = null;
  const apply = (room as unknown as { applyGame(id: string, action: GameAction, now: number): string | null }).applyGame.bind(room);
  expect(apply(botA.id, { type: "play", cardId: five.id, callUno: false }, T0)).toBeNull();
  return { room, human, botA, botB };
}

const handOf = (room: Room, id: string) => room.data.game!.players.find((p) => p.id === id)!.hand.length;

describe("catching a missed UNO call", () => {
  it("holds the next bot's move so a human has time to catch", () => {
    const { room, botA, botB } = rigged();
    expect(room.data.game!.lastCall?.playerId).toBe(botA.id);
    expect(room.data.botDueAt).toBeGreaterThanOrEqual(T0 + TIMING.catchWindowMs);

    const serial = room.data.game!.turnSerial;
    room.tick(T0 + 1000);
    expect(room.data.game!.turnSerial).toBe(serial);
    expect(room.data.game!.lastCall?.playerId).toBe(botA.id);

    room.handle("sess-host", { type: "catch", targetId: botA.id }, T0 + 1500);
    expect(handOf(room, botA.id)).toBe(3);
    expect(room.data.game!.lastCall).toBeNull();
    expect(room.data.game!.players[room.data.game!.currentIndex]!.id).toBe(botB.id);
  });

  it("a bot that nobody catches calls UNO late, inside the window, and play goes on", () => {
    const { room, botA } = rigged();
    for (let t = T0; t <= T0 + TIMING.catchWindowMs - 100; t += 100) room.tick(t);
    expect(room.data.game!.lastCall).toBeNull();
    expect(handOf(room, botA.id)).toBe(1);
    expect(room.data.log.some((e) => e.kind === "game" && e.event.type === "uno" && e.event.playerId === botA.id)).toBe(true);

    const serial = room.data.game!.turnSerial;
    for (let t = T0 + TIMING.catchWindowMs; t <= T0 + TIMING.catchWindowMs + 2000; t += 100) room.tick(t);
    expect(room.data.game!.turnSerial).toBeGreaterThan(serial);
  });

  it("too late once the call is made", () => {
    const { room, botA } = rigged();
    room.tick(T0 + 2800);
    expect(() => room.handle("sess-host", { type: "catch", targetId: botA.id }, T0 + 2850)).toThrow(/Too late/);
  });
});
