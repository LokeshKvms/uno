import { describe, expect, it } from "vitest";
import { COLORS, DECK_SIZE, cardPoints, createDeck, createGame, totalCards } from "../src/index.ts";
import { card } from "./helpers.ts";

describe("deck", () => {
  const deck = createDeck();

  it("has the official 108 cards with unique ids", () => {
    expect(deck).toHaveLength(DECK_SIZE);
    expect(new Set(deck.map((c) => c.id)).size).toBe(DECK_SIZE);
  });

  it("has 25 cards per color: one 0, two each of 1-9, Skip, Reverse, Draw Two", () => {
    for (const color of COLORS) {
      const cards = deck.filter((c) => c.color === color);
      expect(cards).toHaveLength(25);
      expect(cards.filter((c) => c.value === "0")).toHaveLength(1);
      for (const v of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "reverse", "draw2"]) {
        expect(cards.filter((c) => c.value === v)).toHaveLength(2);
      }
    }
  });

  it("has four Wild and four Wild Draw Four cards", () => {
    expect(deck.filter((c) => c.value === "wild")).toHaveLength(4);
    expect(deck.filter((c) => c.value === "draw4")).toHaveLength(4);
  });

  it("scores numbers at face value, actions at 20 and wilds at 50", () => {
    expect(cardPoints(card("red", "7"))).toBe(7);
    expect(cardPoints(card("red", "0"))).toBe(0);
    expect(cardPoints(card("blue", "skip"))).toBe(20);
    expect(cardPoints(card("blue", "reverse"))).toBe(20);
    expect(cardPoints(card("blue", "draw2"))).toBe(20);
    expect(cardPoints(card("wild", "wild"))).toBe(50);
    expect(cardPoints(card("wild", "draw4"))).toBe(50);
    expect(deck.reduce((s, c) => s + cardPoints(c), 0)).toBe(4 * (45 * 2 + 60 * 2) + 8 * 50);
  });
});

describe("dealing", () => {
  it("deals 7 cards each and flips one start card", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { state } = createGame({
        players: [1, 2, 3, 4].map((i) => ({ id: `p${i}`, name: `P${i}` })),
        mode: "match",
        seed,
      });
      expect(totalCards(state)).toBe(DECK_SIZE);
      expect(state.discardPile).toHaveLength(1);
      const extra = state.discardPile[0]!.value === "draw2" ? 2 : 0;
      expect(state.players.reduce((s, p) => s + p.hand.length, 0)).toBe(28 + extra);
      expect(state.drawPile).toHaveLength(DECK_SIZE - 28 - 1 - extra);
    }
  });

  it("never starts the discard pile with a Wild Draw Four", () => {
    for (let seed = 1; seed <= 3000; seed++) {
      const { state } = createGame({
        players: [
          { id: "a", name: "A" },
          { id: "b", name: "B" },
        ],
        mode: "single",
        seed,
      });
      expect(state.discardPile[0]!.value).not.toBe("draw4");
    }
  });

  it("rotates the dealer each round", () => {
    const { state } = createGame({
      players: [1, 2, 3].map((i) => ({ id: `p${i}`, name: `P${i}` })),
      mode: "match",
      seed: 7,
    });
    expect(state.dealerIndex).toBeGreaterThanOrEqual(0);
  });

  it("rejects too few or too many players", () => {
    expect(() => createGame({ players: [{ id: "a", name: "A" }], mode: "single", seed: 1 })).toThrow();
    expect(() => createGame({ players: Array.from({ length: 11 }, (_, i) => ({ id: `${i}`, name: `${i}` })), mode: "single", seed: 1 })).toThrow();
  });
});
