import { describe, expect, it } from "vitest";
import { type GameState, applyAction, createGame, playableCardIds, startNextRound, timeoutAction, viewFor, redactEvent } from "../src/index.ts";
import { card, mustOk, scenario } from "./helpers.ts";

const idOf = (s: GameState, i: number) => s.players[i]!.id;

describe("start card", () => {
  function findStart(value: string, players = 3): GameState {
    for (let seed = 1; seed < 20000; seed++) {
      const { state } = createGame({
        players: Array.from({ length: players }, (_, i) => ({ id: `p${i}`, name: `P${i}` })),
        mode: "match",
        seed,
      });
      if (state.discardPile[0]!.value === value) return state;
    }
    throw new Error(`no seed starts with ${value}`);
  }
  const left = (s: GameState, k = 1) => (s.dealerIndex + k) % s.players.length;

  it("number: player left of the dealer starts", () => {
    const s = findStart("5");
    expect(s.currentIndex).toBe(left(s));
    expect(s.phase).toBe("turn");
    expect(s.activeColor).toBe(s.discardPile[0]!.color);
  });

  it("Skip: the player left of the dealer is skipped", () => {
    const s = findStart("skip");
    expect(s.currentIndex).toBe(left(s, 2));
  });

  it("Reverse: the dealer plays first and play goes the other way", () => {
    const s = findStart("reverse");
    expect(s.currentIndex).toBe(s.dealerIndex);
    expect(s.direction).toBe(-1);
  });

  it("Draw Two: the first player draws two and is skipped", () => {
    const s = findStart("draw2");
    expect(s.players[left(s)]!.hand).toHaveLength(9);
    expect(s.currentIndex).toBe(left(s, 2));
  });

  it("Wild: the first player picks the color and then plays", () => {
    const s = findStart("wild");
    expect(s.phase).toBe("chooseColor");
    expect(s.currentIndex).toBe(left(s));
    const r = mustOk(applyAction(s, idOf(s, left(s)), { type: "chooseColor", color: "green" }));
    expect(r.state.activeColor).toBe("green");
    expect(r.state.phase).toBe("turn");
    expect(r.state.currentIndex).toBe(left(s));
  });
});

describe("matching", () => {
  it("allows color, number, symbol and wild matches only", () => {
    const hand = [card("red", "3"), card("blue", "7"), card("green", "skip"), card("wild", "wild"), card("yellow", "2")];
    const s = scenario({ hands: [hand, [card("red", "1")]], top: card("red", "7") });
    const ids = playableCardIds(s, "p0");
    expect(ids).toEqual([hand[0]!.id, hand[1]!.id, hand[3]!.id]);
  });

  it("rejects an unmatched card and out-of-turn play", () => {
    const hand = [card("yellow", "2"), card("red", "4")];
    const s = scenario({ hands: [hand, [card("red", "1"), card("red", "2")]], top: card("red", "7") });
    expect(applyAction(s, "p0", { type: "play", cardId: hand[0]!.id }).ok).toBe(false);
    expect(applyAction(s, "p1", { type: "play", cardId: s.players[1]!.hand[0]!.id }).ok).toBe(false);
  });

  it("requires a color for wild cards", () => {
    const w = card("wild", "wild");
    const s = scenario({ hands: [[w, card("red", "1")], [card("red", "1")]], top: card("blue", "7") });
    expect(applyAction(s, "p0", { type: "play", cardId: w.id }).ok).toBe(false);
    const r = mustOk(applyAction(s, "p0", { type: "play", cardId: w.id, color: "yellow" }));
    expect(r.state.activeColor).toBe("yellow");
    expect(r.state.currentIndex).toBe(1);
  });

  it("does not mutate the input state", () => {
    const hand = [card("red", "3"), card("red", "5")];
    const s = scenario({ hands: [hand, [card("red", "1"), card("red", "1")]], top: card("red", "7") });
    const before = JSON.stringify(s);
    mustOk(applyAction(s, "p0", { type: "play", cardId: hand[0]!.id }));
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe("action cards", () => {
  const filler = () => [card("green", "1"), card("green", "2"), card("green", "3")];

  it("Skip skips the next player (3 players)", () => {
    const sk = card("red", "skip");
    const s = scenario({ hands: [[sk, ...filler()], filler(), filler()], top: card("red", "1") });
    expect(mustOk(applyAction(s, "p0", { type: "play", cardId: sk.id })).state.currentIndex).toBe(2);
  });

  it("Skip with two players gives the player another turn", () => {
    const sk = card("red", "skip");
    const s = scenario({ hands: [[sk, ...filler()], filler()], top: card("red", "1") });
    expect(mustOk(applyAction(s, "p0", { type: "play", cardId: sk.id })).state.currentIndex).toBe(0);
  });

  it("Reverse changes direction (3 players)", () => {
    const rv = card("red", "reverse");
    const s = scenario({ hands: [[rv, ...filler()], filler(), filler()], top: card("red", "1") });
    const r = mustOk(applyAction(s, "p0", { type: "play", cardId: rv.id })).state;
    expect(r.direction).toBe(-1);
    expect(r.currentIndex).toBe(2);
  });

  it("Reverse acts like Skip with two players", () => {
    const rv = card("red", "reverse");
    const s = scenario({ hands: [[rv, ...filler()], filler()], top: card("red", "1") });
    expect(mustOk(applyAction(s, "p0", { type: "play", cardId: rv.id })).state.currentIndex).toBe(0);
  });

  it("Draw Two makes the next player draw 2 and lose the turn (10 players)", () => {
    const d2 = card("red", "draw2");
    const hands = Array.from({ length: 10 }, (_, i) => (i === 0 ? [d2, ...filler()] : filler()));
    const s = scenario({ hands, top: card("red", "1") });
    const r = mustOk(applyAction(s, "p0", { type: "play", cardId: d2.id })).state;
    expect(r.players[1]!.hand).toHaveLength(5);
    expect(r.currentIndex).toBe(2);
  });

  it("Draw Two cannot be stacked (official rules)", () => {
    const d2a = card("red", "draw2");
    const d2b = card("blue", "draw2");
    const s = scenario({ hands: [[d2a, ...filler()], [d2b, ...filler()], filler()], top: card("red", "1") });
    const r = mustOk(applyAction(s, "p0", { type: "play", cardId: d2a.id })).state;
    expect(r.currentIndex).toBe(2);
    expect(applyAction(r, "p1", { type: "play", cardId: d2b.id }).ok).toBe(false);
  });

  it("direction wraps correctly counterclockwise", () => {
    const n = card("red", "4");
    const s = scenario({ hands: [[n, ...filler()], filler(), filler(), filler()], top: card("red", "1"), direction: -1 });
    expect(mustOk(applyAction(s, "p0", { type: "play", cardId: n.id })).state.currentIndex).toBe(3);
  });
});

describe("drawing", () => {
  it("a drawn playable card may be played immediately", () => {
    const drawn = card("red", "9");
    const s = scenario({ hands: [[card("green", "1"), card("green", "2")], [card("red", "1")]], top: card("red", "1"), drawPile: [drawn] });
    const r = mustOk(applyAction(s, "p0", { type: "draw" })).state;
    expect(r.phase).toBe("drawn");
    expect(r.drawnCardId).toBe(drawn.id);
    expect(playableCardIds(r, "p0")).toEqual([drawn.id]);
    const played = mustOk(applyAction(r, "p0", { type: "play", cardId: drawn.id })).state;
    expect(played.currentIndex).toBe(1);
  });

  it("after drawing only the drawn card may be played", () => {
    const g1 = card("red", "5");
    const drawn = card("red", "9");
    const s = scenario({ hands: [[g1, card("green", "2")], [card("red", "1")]], top: card("red", "1"), drawPile: [drawn] });
    const r = mustOk(applyAction(s, "p0", { type: "draw" })).state;
    expect(applyAction(r, "p0", { type: "play", cardId: g1.id }).ok).toBe(false);
  });

  it("the drawn card may be kept, passing the turn", () => {
    const drawn = card("red", "9");
    const s = scenario({ hands: [[card("green", "2")], [card("red", "1")]], top: card("red", "1"), drawPile: [drawn] });
    const r = mustOk(applyAction(mustOk(applyAction(s, "p0", { type: "draw" })).state, "p0", { type: "pass" })).state;
    expect(r.currentIndex).toBe(1);
    expect(r.players[0]!.hand).toHaveLength(2);
  });

  it("an unplayable drawn card ends the turn automatically", () => {
    const drawn = card("green", "9");
    const s = scenario({ hands: [[card("green", "2")], [card("red", "1")]], top: card("red", "1"), drawPile: [drawn] });
    const r = mustOk(applyAction(s, "p0", { type: "draw" })).state;
    expect(r.phase).toBe("turn");
    expect(r.currentIndex).toBe(1);
  });

  it("reshuffles the discard pile (keeping the top card) when the deck runs out", () => {
    const top = card("red", "1");
    const s = scenario({ hands: [[card("green", "2")], [card("red", "1")]], top, drawPile: [] });
    s.discardPile = [card("blue", "3"), card("blue", "4"), top];
    const r = mustOk(applyAction(s, "p0", { type: "draw" }));
    expect(r.events.some((e) => e.type === "reshuffle")).toBe(true);
    expect(r.state.discardPile).toEqual([top]);
    expect(r.state.players[0]!.hand).toHaveLength(2);
  });

  it("passes when there is nothing left to draw", () => {
    const s = scenario({ hands: [[card("green", "2")], [card("red", "1")]], top: card("red", "1"), drawPile: [] });
    const r = mustOk(applyAction(s, "p0", { type: "draw" })).state;
    expect(r.currentIndex).toBe(1);
    expect(r.players[0]!.hand).toHaveLength(1);
  });
});

describe("Wild Draw Four challenge", () => {
  const filler = () => [card("green", "1"), card("green", "2"), card("green", "3")];

  it("accepting: the victim draws 4 and loses the turn", () => {
    const d4 = card("wild", "draw4");
    const s = scenario({ hands: [[d4, card("green", "5")], filler(), filler()], top: card("red", "1") });
    const r1 = mustOk(applyAction(s, "p0", { type: "play", cardId: d4.id, color: "blue" })).state;
    expect(r1.phase).toBe("challenge");
    expect(r1.challenge?.illegal).toBe(false);
    const r2 = mustOk(applyAction(r1, "p1", { type: "challenge", challenge: false })).state;
    expect(r2.players[1]!.hand).toHaveLength(7);
    expect(r2.currentIndex).toBe(2);
    expect(r2.activeColor).toBe("blue");
  });

  it("successful challenge: the bluffer draws 4 and the challenger plays", () => {
    const d4 = card("wild", "draw4");
    const s = scenario({ hands: [[d4, card("red", "5")], filler(), filler()], top: card("red", "1") });
    const r1 = mustOk(applyAction(s, "p0", { type: "play", cardId: d4.id, color: "blue" })).state;
    expect(r1.challenge?.illegal).toBe(true);
    const r2 = mustOk(applyAction(r1, "p1", { type: "challenge", challenge: true }));
    expect(r2.state.players[0]!.hand).toHaveLength(5);
    expect(r2.state.players[1]!.hand).toHaveLength(3);
    expect(r2.state.currentIndex).toBe(1);
    const ev = r2.events.find((e) => e.type === "challenge");
    expect(ev && ev.type === "challenge" && ev.success).toBe(true);
  });

  it("failed challenge: the challenger draws 6 and loses the turn", () => {
    const d4 = card("wild", "draw4");
    const s = scenario({ hands: [[d4, card("green", "5")], filler(), filler()], top: card("red", "1") });
    const r1 = mustOk(applyAction(s, "p0", { type: "play", cardId: d4.id, color: "blue" })).state;
    const r2 = mustOk(applyAction(r1, "p1", { type: "challenge", challenge: true })).state;
    expect(r2.players[1]!.hand).toHaveLength(9);
    expect(r2.currentIndex).toBe(2);
  });

  it("a matching number of another color does not make a +4 illegal", () => {
    const d4 = card("wild", "draw4");
    const s = scenario({ hands: [[d4, card("green", "1")], filler(), filler()], top: card("red", "1") });
    const r1 = mustOk(applyAction(s, "p0", { type: "play", cardId: d4.id, color: "blue" })).state;
    expect(r1.challenge?.illegal).toBe(false);
  });

  it("only the victim can respond to the challenge", () => {
    const d4 = card("wild", "draw4");
    const s = scenario({ hands: [[d4, card("green", "5")], filler(), filler()], top: card("red", "1") });
    const r1 = mustOk(applyAction(s, "p0", { type: "play", cardId: d4.id, color: "blue" })).state;
    expect(applyAction(r1, "p2", { type: "challenge", challenge: true }).ok).toBe(false);
  });

  it("shows the offender's hand only to the challenger", () => {
    const d4 = card("wild", "draw4");
    const s = scenario({ hands: [[d4, card("red", "5")], filler(), filler()], top: card("red", "1") });
    const r1 = mustOk(applyAction(s, "p0", { type: "play", cardId: d4.id, color: "blue" })).state;
    const r2 = mustOk(applyAction(r1, "p1", { type: "challenge", challenge: true }));
    const ev = r2.events.find((e) => e.type === "challenge")!;
    expect(redactEvent(ev, "p1")).toMatchObject({ offenderHand: [{ color: "red", value: "5" }] });
    expect(redactEvent(ev, "p2")).toMatchObject({ offenderHand: [] });
  });
});

describe("calling UNO", () => {
  const filler = () => [card("green", "1"), card("green", "2"), card("green", "3")];

  it("calling with the play keeps you safe", () => {
    const a = card("red", "3");
    const s = scenario({ hands: [[a, card("red", "4")], filler(), filler()], top: card("red", "1") });
    const r = mustOk(applyAction(s, "p0", { type: "play", cardId: a.id, callUno: true }));
    expect(r.state.lastCall).toBeNull();
    expect(r.events.some((e) => e.type === "uno")).toBe(true);
    expect(applyAction(r.state, "p2", { type: "catch", targetId: "p0" }).ok).toBe(false);
  });

  it("forgetting leaves you catchable for two cards", () => {
    const a = card("red", "3");
    const s = scenario({ hands: [[a, card("red", "4")], filler(), filler()], top: card("red", "1") });
    const r1 = mustOk(applyAction(s, "p0", { type: "play", cardId: a.id })).state;
    expect(r1.lastCall).toEqual({ playerId: "p0" });
    const r2 = mustOk(applyAction(r1, "p2", { type: "catch", targetId: "p0" })).state;
    expect(r2.players[0]!.hand).toHaveLength(3);
    expect(r2.lastCall).toBeNull();
    expect(r2.currentIndex).toBe(1);
  });

  it("calling late (before anyone catches you) still counts", () => {
    const a = card("red", "3");
    const s = scenario({ hands: [[a, card("red", "4")], filler(), filler()], top: card("red", "1") });
    const r1 = mustOk(applyAction(s, "p0", { type: "play", cardId: a.id })).state;
    const r2 = mustOk(applyAction(r1, "p0", { type: "callUno" })).state;
    expect(applyAction(r2, "p1", { type: "catch", targetId: "p0" }).ok).toBe(false);
  });

  it("the catch window closes once the next player acts", () => {
    const a = card("red", "3");
    const s = scenario({ hands: [[a, card("red", "4")], [card("red", "9"), ...filler()], filler()], top: card("red", "1") });
    const r1 = mustOk(applyAction(s, "p0", { type: "play", cardId: a.id })).state;
    const r2 = mustOk(applyAction(r1, "p1", { type: "draw" })).state;
    expect(applyAction(r2, "p2", { type: "catch", targetId: "p0" }).ok).toBe(false);
  });

  it("you cannot catch yourself or call UNO with more than one card", () => {
    const s = scenario({ hands: [[card("red", "3"), card("red", "4")], filler()], top: card("red", "1") });
    expect(applyAction(s, "p0", { type: "callUno" }).ok).toBe(false);
    expect(applyAction(s, "p0", { type: "catch", targetId: "p0" }).ok).toBe(false);
  });
});

describe("scoring", () => {
  it("the round winner scores every card left in opponents' hands", () => {
    const last = card("red", "3");
    const s = scenario({
      hands: [[last], [card("blue", "7"), card("wild", "wild")], [card("green", "skip"), card("yellow", "0")]],
      top: card("red", "1"),
    });
    const r = mustOk(applyAction(s, "p0", { type: "play", cardId: last.id }));
    expect(r.state.phase).toBe("roundOver");
    expect(r.state.players[0]!.score).toBe(7 + 50 + 20 + 0);
    expect(r.state.history[0]).toMatchObject({ round: 1, winnerId: "p0", points: 77 });
    expect(r.state.history[0]!.breakdown.map((b) => b.points)).toEqual([57, 20]);
  });

  it("a final Draw Two still makes the next player draw before scoring", () => {
    const last = card("red", "draw2");
    const s = scenario({
      hands: [[last], [card("blue", "7")], [card("green", "1")]],
      top: card("red", "1"),
      drawPile: [card("yellow", "9"), card("yellow", "8")],
    });
    const r = mustOk(applyAction(s, "p0", { type: "play", cardId: last.id })).state;
    expect(r.players[1]!.hand).toHaveLength(3);
    expect(r.players[0]!.score).toBe(7 + 9 + 8 + 1);
  });

  it("a final Wild Draw Four makes the next player draw four", () => {
    const last = card("wild", "draw4");
    const s = scenario({
      hands: [[last], [card("blue", "7")], [card("green", "1")]],
      top: card("red", "1"),
      drawPile: [card("yellow", "1"), card("yellow", "1"), card("yellow", "1"), card("yellow", "1")],
    });
    const r = mustOk(applyAction(s, "p0", { type: "play", cardId: last.id, color: "red" })).state;
    expect(r.players[1]!.hand).toHaveLength(5);
  });

  it("single-round games end after one round", () => {
    const last = card("red", "3");
    const s = scenario({ mode: "single", hands: [[last], [card("blue", "7")]], top: card("red", "1") });
    const r = mustOk(applyAction(s, "p0", { type: "play", cardId: last.id })).state;
    expect(r.phase).toBe("matchOver");
    expect(r.matchWinnerId).toBe("p0");
  });

  it("a match ends once someone reaches 500", () => {
    const last = card("red", "3");
    const s = scenario({ hands: [[last], [card("wild", "draw4")]], top: card("red", "1"), scores: [460, 300] });
    const r = mustOk(applyAction(s, "p0", { type: "play", cardId: last.id })).state;
    expect(r.phase).toBe("matchOver");
    expect(r.players[0]!.score).toBe(510);
  });

  it("the next round keeps scores and moves the dealer", () => {
    const last = card("red", "3");
    const s = scenario({ hands: [[last], [card("blue", "7")]], top: card("red", "1") });
    const dealer = s.dealerIndex;
    const r = mustOk(applyAction(s, "p0", { type: "play", cardId: last.id })).state;
    const next = mustOk(startNextRound(r)).state;
    expect(next.round).toBe(2);
    expect(next.dealerIndex).toBe((dealer + 1) % 2);
    expect(next.players[0]!.score).toBe(7);
    expect(next.players.every((p) => p.hand.length >= 7)).toBe(true);
  });
});

describe("timeouts and views", () => {
  it("times out to draw, then pass, then accept a +4", () => {
    const s = scenario({ hands: [[card("green", "2")], [card("red", "1")]], top: card("red", "1") });
    expect(timeoutAction(s)).toEqual({ type: "draw" });
    s.phase = "drawn";
    expect(timeoutAction(s)).toEqual({ type: "pass" });
    s.phase = "challenge";
    expect(timeoutAction(s)).toEqual({ type: "challenge", challenge: false });
  });

  it("views hide other players' hands", () => {
    const s = scenario({ hands: [[card("green", "2")], [card("red", "1"), card("red", "2")]], top: card("red", "1") });
    const v = viewFor(s, "p0");
    expect(v.hand).toHaveLength(1);
    expect(v.players[1]!.count).toBe(2);
    expect(JSON.stringify(v)).not.toContain(s.players[1]!.hand[0]!.id);
    const spectator = viewFor(s, null);
    expect(spectator.hand).toHaveLength(0);
    expect(spectator.canDraw).toBe(false);
  });

  it("redacts drawn cards for other viewers", () => {
    const s = scenario({ hands: [[card("green", "2")], [card("red", "1")]], top: card("red", "1") });
    const r = mustOk(applyAction(s, "p0", { type: "draw" }));
    const draw = r.events.find((e) => e.type === "draw")!;
    expect(redactEvent(draw, "p0")).toMatchObject({ count: 1 });
    expect((redactEvent(draw, "p1") as { cards: unknown[] }).cards).toHaveLength(0);
  });
});
